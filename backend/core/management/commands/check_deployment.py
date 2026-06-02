"""
core/management/commands/check_deployment.py

PRODUCTION DEPLOY UCHUN TAYYORLIK TEKSHIRUVI.

ISHLATISH:
    python manage.py check_deployment              # to'liq tekshiruv
    python manage.py check_deployment --strict     # warning'lar ham fail qiladi
    python manage.py check_deployment --quiet      # faqat fail bo'lganlar

NIMA QILADI:
    15 ta tekshiruvni bajaradi — kritik sozlamalar, tashqi xizmat
    ulanishlari, deploy oldidan tayyor bo'lishi shart bo'lgan narsalar.

QAYTARADI:
    exit 0 — hamma narsa joyida (yoki faqat warning'lar)
    exit 1 — kamida bitta ERROR yoki --strict da warning bor

NIMA UCHUN:
    Render dashboard'dan deploy qildingiz, sayt ochildi, mijoz keldi —
    DEBUG=True, Sentry yo'q, Telegram yo'q, backup ishlamayapti.
    Bu komanda shu xato'lar deploy'dan OLDIN topiladi.

QAYERDA ISHLATILADI:
    1. Lokal'da: deploy oldidan
    2. Render Shell'da: deploy'dan keyin verify
    3. CI/CD: deploy oldidan gate sifatida (kelajakda)
"""
from __future__ import annotations

import re
import socket
from typing import Callable, Optional

from django.conf import settings
from django.core.management.base import BaseCommand


# Tekshiruv natijasi
class CheckResult:
    OK = 'ok'
    WARN = 'warn'
    ERROR = 'error'

    EMOJI = {'ok': '✅', 'warn': '⚠️ ', 'error': '❌'}


class Command(BaseCommand):
    help = "Production deploy uchun tayyorlikni tekshirish (15 ta tekshiruv)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--strict',
            action='store_true',
            help="Warning'lar ham failure hisoblansin (CI/CD uchun)",
        )
        parser.add_argument(
            '--quiet',
            action='store_true',
            help='Faqat fail bo\'lganlarni ko\'rsat',
        )

    def handle(self, *args, **options):
        self.strict = options['strict']
        self.quiet = options['quiet']

        # 15 ta tekshiruv — tartib muhim (boshlanish: kritik, oxir: ixtiyoriy)
        checks: list[tuple[str, Callable]] = [
            ('Django settings', self._check_settings),
            ('Database connection', self._check_database),
            ('Redis cache', self._check_redis),
            ('Pending migrations', self._check_migrations),
            ('SECRET_KEY xavfsizlik', self._check_secret_key),
            ('ALLOWED_HOSTS', self._check_allowed_hosts),
            ('CORS_ALLOWED_ORIGINS', self._check_cors),
            ('ADMIN URL maxfiy', self._check_admin_url),
            ('SECURE_SSL_REDIRECT', self._check_ssl),
            ('Sentry DSN', self._check_sentry),
            ('Telegram bot', self._check_telegram),
            ('Backblaze B2 (backup)', self._check_b2_backup),
            ('Eskiz SMS', self._check_eskiz),
            ('Cloudinary CDN', self._check_cloudinary),
            ('Backup super_admin', self._check_backup_superuser),
        ]

        results = []
        for name, fn in checks:
            try:
                level, message = fn()
            except Exception as exc:
                level, message = CheckResult.ERROR, f'Tekshiruv xatosi: {exc}'
            results.append((name, level, message))
            self._print(name, level, message)

        return self._summary(results)

    # ─────────────────────────────────────────────────────────────────────────
    # TEKSHIRUVLAR
    # ─────────────────────────────────────────────────────────────────────────

    def _check_settings(self) -> tuple[str, str]:
        """Django settings yuklanishi va asosiy maydon'lar to'g'riligi."""
        debug = getattr(settings, 'DEBUG', None)
        if debug is None:
            return CheckResult.ERROR, 'DEBUG sozlanmagan'

        env = 'DEVELOPMENT' if debug else 'PRODUCTION'
        return CheckResult.OK, f'Environment: {env} (DEBUG={debug})'

    def _check_database(self) -> tuple[str, str]:
        """DB ulanishi (SELECT 1)."""
        from django.db import connection

        try:
            with connection.cursor() as cur:
                cur.execute('SELECT 1')
                cur.fetchone()
        except Exception as exc:
            return CheckResult.ERROR, f"DB ulanishi xato: {str(exc)[:120]}"

        engine = connection.vendor
        return CheckResult.OK, f'Engine: {engine}'

    def _check_redis(self) -> tuple[str, str]:
        """Redis cache (production'da MAJBURIY)."""
        from django.core.cache import cache

        try:
            cache.set('deploy-probe', 'ok', timeout=10)
            value = cache.get('deploy-probe')
            if value != 'ok':
                return CheckResult.ERROR, 'Cache yozish/o\'qish nomos'
        except Exception as exc:
            return CheckResult.ERROR, f'Cache xato: {str(exc)[:120]}'

        backend = type(cache).__name__
        # Production'da LocMemCache — muammo (multi-worker'da sinxron emas)
        if not settings.DEBUG and 'LocMem' in backend:
            return CheckResult.ERROR, (
                f'Production\'da LocMemCache! '
                f'REDIS_URL sozlang (OTP va rate-limit buziladi)'
            )
        return CheckResult.OK, f'Backend: {backend}'

    def _check_migrations(self) -> tuple[str, str]:
        """Hamma migration'lar ishlatilganmi."""
        from django.db.migrations.executor import MigrationExecutor
        from django.db import connections, DEFAULT_DB_ALIAS

        try:
            executor = MigrationExecutor(connections[DEFAULT_DB_ALIAS])
            targets = executor.loader.graph.leaf_nodes()
            plan = executor.migration_plan(targets)
        except Exception as exc:
            return CheckResult.ERROR, f'Migration tekshiruv xato: {str(exc)[:120]}'

        if plan:
            count = len(plan)
            return CheckResult.ERROR, (
                f'{count} ta ishlatilmagan migration mavjud. '
                f'Birinchi: {plan[0][0].app_label}.{plan[0][0].name}'
            )
        return CheckResult.OK, 'Hamma migration\'lar tayyor'

    def _check_secret_key(self) -> tuple[str, str]:
        """SECRET_KEY default emasligi va uzunligi."""
        key = getattr(settings, 'SECRET_KEY', '')
        if not key:
            return CheckResult.ERROR, 'SECRET_KEY bo\'sh'

        if 'dev-only' in key.lower() or 'insecure' in key.lower():
            return CheckResult.ERROR, 'SECRET_KEY default dev qiymatda — almashtiring'

        if len(key) < 40:
            return CheckResult.WARN, f'SECRET_KEY juda qisqa: {len(key)} belgi (50+ tavsiya)'

        return CheckResult.OK, f'Uzunlik: {len(key)} belgi'

    def _check_allowed_hosts(self) -> tuple[str, str]:
        """ALLOWED_HOSTS bo'sh emasligi (production'da)."""
        hosts = getattr(settings, 'ALLOWED_HOSTS', [])

        if settings.DEBUG:
            return CheckResult.OK, f'DEV mode — har domain qabul ({hosts!r})'

        if not hosts:
            return CheckResult.ERROR, 'ALLOWED_HOSTS bo\'sh (production\'da SHART)'

        if '*' in hosts:
            return CheckResult.WARN, 'ALLOWED_HOSTS = [*] — production\'da xavfli'

        return CheckResult.OK, f"{len(hosts)} ta domain: {', '.join(hosts[:3])}"

    def _check_cors(self) -> tuple[str, str]:
        """CORS_ALLOWED_ORIGINS sozlanganmi."""
        if settings.DEBUG:
            allow_all = getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False)
            if allow_all:
                return CheckResult.OK, 'DEV mode — CORS_ALLOW_ALL_ORIGINS=True'

        origins = getattr(settings, 'CORS_ALLOWED_ORIGINS', [])
        if not origins:
            return CheckResult.ERROR, 'CORS_ALLOWED_ORIGINS bo\'sh (production\'da SHART)'

        # http:// production'da xavfli
        http_origins = [o for o in origins if o.startswith('http://')]
        if http_origins and not settings.DEBUG:
            return CheckResult.WARN, f'HTTP origin\'lar bor: {http_origins[0]} (HTTPS tavsiya)'

        return CheckResult.OK, f'{len(origins)} ta origin'

    def _check_admin_url(self) -> tuple[str, str]:
        """ADMIN_URL default 'admin/' emasligi (xavfsizlik)."""
        admin_url = getattr(settings, 'ADMIN_URL', 'admin/')

        if settings.DEBUG:
            return CheckResult.OK, f"DEV mode — '{admin_url}' OK"

        if admin_url in ('admin/', 'admin'):
            return CheckResult.WARN, (
                "ADMIN_URL default 'admin/' — DJANGO_ADMIN_URL bilan maxfiy qiling "
                "(brute-force himoyasi)"
            )

        return CheckResult.OK, f"Maxfiy: '{admin_url}'"

    def _check_ssl(self) -> tuple[str, str]:
        """SECURE_SSL_REDIRECT production'da True bo'lishi."""
        if settings.DEBUG:
            return CheckResult.OK, 'DEV mode — SSL talab qilinmaydi'

        ssl = getattr(settings, 'SECURE_SSL_REDIRECT', False)
        if not ssl:
            return CheckResult.WARN, (
                "SECURE_SSL_REDIRECT=False — HTTPS majburiy bo'lmaydi "
                "(Render avto qiladi, lekin sozlash to'g'ri)"
            )

        return CheckResult.OK, 'SECURE_SSL_REDIRECT=True'

    def _check_sentry(self) -> tuple[str, str]:
        """Sentry DSN sozlanganmi va formati to'g'rimi."""
        dsn = getattr(settings, '_SENTRY_DSN', '') or self._env('SENTRY_DSN')
        if not dsn:
            return CheckResult.WARN, "Sentry DSN sozlanmagan (Phase 0.1 — xato kuzatish yo'q)"

        if not re.match(r'^https?://[a-zA-Z0-9]+@', dsn):
            return CheckResult.ERROR, f'Sentry DSN format xato (kutilgan: https://KEY@HOST/PROJ)'

        return CheckResult.OK, f'DSN: {dsn[:40]}...'

    def _check_telegram(self) -> tuple[str, str]:
        """Telegram bot token + chat ID + real test xabar."""
        token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        chat_id = getattr(settings, 'TELEGRAM_ADMIN_CHAT_ID', '')

        if not token or not chat_id:
            return CheckResult.WARN, "Sozlanmagan (Phase 0.5 — alert kanali yo'q)"

        # Format tekshiruv
        if ':' not in token or len(token) < 30:
            return CheckResult.ERROR, 'Token format xato (kutilgan: 12345:ABC...)'

        if not (chat_id.lstrip('-').isdigit()):
            return CheckResult.ERROR, f'Chat ID raqam bo\'lishi shart: {chat_id!r}'

        # Real ulanish testi
        import requests
        try:
            resp = requests.get(
                f'https://api.telegram.org/bot{token}/getMe',
                timeout=5,
            )
            if resp.status_code == 200:
                bot_name = resp.json().get('result', {}).get('username', '?')
                return CheckResult.OK, f"Bot: @{bot_name}, chat: {chat_id}"
            return CheckResult.ERROR, f'Telegram API javob: {resp.status_code}'
        except requests.RequestException as exc:
            return CheckResult.WARN, f"Telegram API ulanmadi: {exc}"

    def _check_b2_backup(self) -> tuple[str, str]:
        """B2 backup bucket ulanmasi (boto3 list_objects test)."""
        key_id = self._env('B2_KEY_ID')
        app_key = self._env('B2_APPLICATION_KEY')
        bucket = self._env('B2_BUCKET_BACKUPS') or getattr(settings, 'BACKUP_B2_BUCKET', '')
        endpoint = self._env('B2_ENDPOINT_URL')

        if not all([key_id, app_key, bucket, endpoint]):
            level = CheckResult.ERROR if not settings.DEBUG else CheckResult.WARN
            return level, "B2 backup sozlanmagan (Phase 0.3 — backup ishlamaydi)"

        try:
            import boto3
            from botocore.exceptions import ClientError

            client = boto3.client(
                's3', endpoint_url=endpoint,
                aws_access_key_id=key_id, aws_secret_access_key=app_key,
                region_name=self._env('B2_REGION', 'us-west-004'),
            )
            response = client.list_objects_v2(Bucket=bucket, MaxKeys=1)
            backup_count = response.get('KeyCount', 0)

            if backup_count == 0 and not settings.DEBUG:
                return CheckResult.WARN, f'Bucket bo\'sh ({bucket}) — backup hali yaratilmagan'
            return CheckResult.OK, f'Bucket: {bucket}'

        except ClientError as exc:
            err_code = exc.response.get('Error', {}).get('Code', 'Unknown')
            return CheckResult.ERROR, f'B2 ulanish xato ({err_code})'
        except ImportError:
            return CheckResult.WARN, 'boto3 o\'rnatilmagan'
        except Exception as exc:
            return CheckResult.ERROR, f'B2 xato: {str(exc)[:80]}'

    def _check_eskiz(self) -> tuple[str, str]:
        """Eskiz credentials + login test."""
        email = getattr(settings, 'ESKIZ_EMAIL', '')
        password = getattr(settings, 'ESKIZ_PASSWORD', '')

        if not email or not password:
            level = CheckResult.WARN if settings.DEBUG else CheckResult.ERROR
            return level, "Sozlanmagan (OTP login ishlamaydi)"

        try:
            from orders.sms import _get_token, get_eskiz_balance

            token = _get_token()
            if not token:
                return CheckResult.ERROR, "Login xato — email/password tekshiring"

            balance = get_eskiz_balance(force_refresh=True)
            if balance is None:
                return CheckResult.WARN, "Token bor, lekin balansni olib bo'lmadi"

            warning_threshold = getattr(settings, 'ESKIZ_BALANCE_WARNING_THRESHOLD', 50000)
            if balance < warning_threshold:
                return CheckResult.WARN, (
                    f"Balans past: {balance:,.0f} UZS (warning: {warning_threshold:,.0f})"
                )
            return CheckResult.OK, f"Balans: {balance:,.0f} UZS"

        except Exception as exc:
            return CheckResult.WARN, f"Eskiz tekshiruvi xato: {str(exc)[:80]}"

    def _check_cloudinary(self) -> tuple[str, str]:
        """Cloudinary credentials — agar CDN_PROVIDER=cloudinary bo'lsa."""
        provider = self._env('CDN_PROVIDER', 'local')

        if provider != 'cloudinary':
            return CheckResult.OK, f"CDN_PROVIDER={provider} (cloudinary kerakmas)"

        cloud_name = self._env('CLOUDINARY_CLOUD_NAME')
        api_key = self._env('CLOUDINARY_API_KEY')
        api_secret = self._env('CLOUDINARY_API_SECRET')

        if not all([cloud_name, api_key, api_secret]):
            return CheckResult.ERROR, 'CDN_PROVIDER=cloudinary lekin credentials yo\'q'

        return CheckResult.OK, f'Cloud: {cloud_name}'

    def _check_backup_superuser(self) -> tuple[str, str]:
        """Backup super_admin DB'da mavjudligi."""
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()

            phone = getattr(settings, 'BACKUP_SUPERUSER_PHONE', '')
            if not phone:
                return CheckResult.WARN, 'BACKUP_SUPERUSER_PHONE sozlanmagan'

            user = User.objects.filter(phone=phone, is_superuser=True).first()
            if not user:
                return CheckResult.WARN, (
                    f"Backup super_admin ({phone}) DB'da yo'q. "
                    f"Yaratish: python manage.py create_backup_superuser"
                )

            return CheckResult.OK, f"Mavjud: {phone}"

        except Exception as exc:
            return CheckResult.WARN, f"Tekshiruv xato: {str(exc)[:80]}"

    # ─────────────────────────────────────────────────────────────────────────
    # CHIQARISH
    # ─────────────────────────────────────────────────────────────────────────

    def _print(self, name: str, level: str, message: str) -> None:
        if self.quiet and level == CheckResult.OK:
            return

        emoji = CheckResult.EMOJI[level]
        style = {
            CheckResult.OK: self.style.SUCCESS,
            CheckResult.WARN: self.style.WARNING,
            CheckResult.ERROR: self.style.ERROR,
        }[level]
        self.stdout.write(style(f'  {emoji} {name:<30}  {message}'))

    def _summary(self, results: list[tuple[str, str, str]]) -> Optional[int]:
        ok = sum(1 for _, lvl, _ in results if lvl == CheckResult.OK)
        warn = sum(1 for _, lvl, _ in results if lvl == CheckResult.WARN)
        err = sum(1 for _, lvl, _ in results if lvl == CheckResult.ERROR)

        self.stdout.write('')
        bar = '─' * 60
        self.stdout.write(bar)
        self.stdout.write(self.style.SUCCESS(f'  ✅ OK:        {ok}'))
        self.stdout.write(self.style.WARNING(f'  ⚠️  WARNING:  {warn}'))
        self.stdout.write(self.style.ERROR(f'  ❌ ERROR:     {err}'))
        self.stdout.write(bar)

        # Harakat ro'yxati
        actions = [(n, m) for n, lvl, m in results if lvl in (CheckResult.ERROR, CheckResult.WARN)]
        if actions:
            self.stdout.write('\n  HARAKAT KERAK:')
            for name, msg in actions:
                self.stdout.write(f'    • {name}: {msg}')

        # Exit code (CI/CD uchun)
        if err > 0 or (self.strict and warn > 0):
            self.stdout.write('')
            self.stdout.write(self.style.ERROR(
                f'❌ Deploy uchun TAYYOR EMAS — {err} ta error'
                + (f', {warn} ta warning (strict)' if self.strict else '')
            ))
            import sys
            sys.exit(1)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('✅ Deploy uchun TAYYOR'))
        return None

    @staticmethod
    def _env(name: str, default: str = '') -> str:
        import os
        return os.getenv(name, default).strip()
