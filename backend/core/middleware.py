"""
core/middleware.py — Django middleware'lar.

AUDIT MIDDLEWARE — admin amallarini avtomat AuditLog'ga yozadi.

ISHLATILISH:
    settings.py'da MIDDLEWARE ro'yxatiga qo'shilgan:
        'core.middleware.AuditMiddleware'

NIMA QILADI:
    Har POST/PATCH/PUT/DELETE so'rovni request tugagandan keyin tekshiradi.
    Quyidagilar bajarilsa — AuditLog yaratadi:
      1. Foydalanuvchi autentifikatsiya qilingan
      2. Foydalanuvchi staff/superuser (oddiy mijoz amallari yozilmaydi)
      3. Response 2xx (muvaffaqiyatli)
      4. Yo'l skip ro'yxatida emas (noisy yo'llar tashlanadi)

YOZILMAYDIGAN HOLATLAR:
    • GET so'rovlari — faqat o'qish, audit yo'q
    • Mehmon va oddiy mijoz amallari — faqat staff/admin
    • 4xx/5xx javoblari — muvaffaqiyatsiz amal
    • /healthz, /api/auth/refresh kabi noisy yo'llar
    • Login/logout — alohida hodisalar, ular uchun signal kerak

XAVFSIZLIK:
    AuditLog yozish HECH QACHON asosiy request'ni buzmasligi kerak.
    Barcha xatolar yutib olinadi va log'ga yoziladi.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# Audit yozilmaydigan yo'llar (noisy yoki muhim emas)
_SKIP_PATH_PREFIXES = (
    '/healthz',
    '/api/auth/refresh',          # token refresh — soatda yuzlab
    '/api/cart/',                 # oddiy mijoz amali, admin emas
    '/api/orders/from-cart',      # oddiy mijoz buyurtmasi
    '/api/orders/quick',          # oddiy mijoz quick order
    '/static/',
    '/media/',
)

# Action method ko'rinishi: insondoroq
_METHOD_TO_VERB = {
    'POST': 'create',
    'PUT': 'update',
    'PATCH': 'update',
    'DELETE': 'delete',
}

# Path da raqamlar — URL kwarg sifatida (resource ID)
_NUMERIC_PATH_PART = re.compile(r'^\d+$')


class AuditMiddleware:
    """Admin POST/PATCH/PUT/DELETE so'rovlarni AuditLog ga yozadi."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Audit yozish HECH QACHON request'ni buzmasligi shart
        try:
            self._maybe_audit(request, response)
        except Exception as exc:
            logger.warning('AuditLog yozishda xato: %s', exc)
        return response

    def _maybe_audit(self, request, response) -> None:
        # 1. Faqat yozish metodlari
        if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return

        # 2. Faqat muvaffaqiyat
        if response.status_code >= 400:
            return

        # 3. Autentifikatsiya
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return

        # 4. Faqat staff/superuser amallari (oddiy mijoz amallari yozilmaydi)
        is_staff_action = bool(user.is_superuser or getattr(user, 'role', None))
        if not is_staff_action:
            return

        # 5. Skip noisy paths
        path = request.path
        for skip in _SKIP_PATH_PREFIXES:
            if path.startswith(skip):
                return

        # 6. AuditLog yaratish
        from users.models import AuditLog

        AuditLog.objects.create(
            actor=user,
            actor_phone_snapshot=getattr(user, 'phone', '')[:15],
            action=self._infer_action(request),
            target_type=self._infer_target_type(request),
            target_id=self._extract_target_id(request),
            data={
                'method': request.method,
                'path': path,
                'status_code': response.status_code,
            },
            ip=self._get_client_ip(request),
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:500],
        )

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _infer_action(request) -> str:
        """
        URL va metoddan action nomini chiqarish.

        Misollar:
          POST   /api/admin/products/      → admin.products.create
          PATCH  /api/admin/products/123/  → admin.products.update
          DELETE /api/admin/products/123/  → admin.products.delete
          POST   /api/admin/staff/assign-role/ → admin.staff.assign-role.create
        """
        verb = _METHOD_TO_VERB.get(request.method, request.method.lower())

        parts = [
            p for p in request.path.strip('/').split('/')
            if p and not _NUMERIC_PATH_PART.match(p)
        ]
        # 'api' prefiksi olib tashlanadi (shovqin)
        if parts and parts[0] == 'api':
            parts = parts[1:]

        # Max 3 daraja — uzun yo'llar qisqartiriladi
        resource = '.'.join(parts[:3]) if parts else 'unknown'
        return f'{resource}.{verb}'

    @staticmethod
    def _infer_target_type(request) -> str:
        """
        Path'dan target resource turini chiqarish.

        Misollar:
          /api/admin/products/123/        → 'product'
          /api/orders/admin/456/status/   → 'order'
          /api/admin/staff/789/fire/       → 'staff'
        """
        parts = [
            p for p in request.path.strip('/').split('/')
            if p and not _NUMERIC_PATH_PART.match(p)
        ]
        if parts and parts[0] == 'api':
            parts = parts[1:]
        if parts and parts[0] == 'admin':
            parts = parts[1:]

        if not parts:
            return ''

        # Birinchi resource part — odatda jadval nomi (ko'plik shaklida)
        # Ko'plik 's' ni olib tashlash: products → product, banners → banner
        resource = parts[0]
        if resource.endswith('s') and len(resource) > 1:
            resource = resource[:-1]
        return resource[:50]

    @staticmethod
    def _extract_target_id(request) -> Optional[int]:
        """Path'dagi oxirgi integer — odatda target ID."""
        for part in reversed(request.path.strip('/').split('/')):
            if _NUMERIC_PATH_PART.match(part):
                try:
                    return int(part)
                except (ValueError, OverflowError):
                    return None
        return None

    @staticmethod
    def _get_client_ip(request) -> Optional[str]:
        """X-Forwarded-For (proxy ortida) yoki REMOTE_ADDR."""
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').strip()
        if forwarded:
            # Bir nechta IP bo'lsa — birinchisi haqiqiy mijoz IP'si
            return forwarded.split(',')[0].strip() or None
        return request.META.get('REMOTE_ADDR') or None


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1.7 — RATE LIMIT ALERT MIDDLEWARE
# ─────────────────────────────────────────────────────────────────────────────
#
# DRF throttle 429 javoblarini kuzatadi:
#   • Har 429       → logger.warning (Sentry breadcrumb)
#   • >100/daqiqa  → Telegram alert (DDoS/scraping shubhasi)
#
# NIMA UCHUN:
#   Premortem ssenariysi: "DDoS yoki scraping hujumi — siz bilmasdan
#   400-500 ta 429 daqiqada bo'ladi, server resurslari ko'tarilib ketadi,
#   real mijozlar saytga kira olmaydi". Bu task — birinchi avtomat
#   "tushish" signali.
#
# DESIGN:
#   • Cache asosida daqiqalik bucket counter
#   • cache.incr atomik increment (multi-worker xavfsiz)
#   • cache.add atomik "alerted" lock (bir daqiqada 1 marta alert)
#   • Top 5 IP — qaysi qaerdan kelmoqda
#   • 429 javob faqat — boshqa status'larga ta'sir yo'q
#
# THRESHOLD:
#   Default 100 ta/daqiqa.
#   .env'da RATE_LIMIT_ALERT_THRESHOLD bilan o'zgartirish mumkin
#   (kichik biznesda 50, yirik biznesda 500 va h.k.)

import re as _re  # avoid name clash


class RateLimitAlertMiddleware:
    """
    DRF throttle (HTTP 429) javoblarini kuzatib boradi.

    Daqiqada threshold'dan ko'p 429 bo'lsa — Telegram CRITICAL alert.
    Har 429 — Sentry'ga breadcrumb (LoggingIntegration orqali).
    """

    DEFAULT_THRESHOLD = 100

    def __init__(self, get_response):
        self.get_response = get_response
        # Threshold settings'dan
        from django.conf import settings
        self.threshold = int(
            getattr(settings, 'RATE_LIMIT_ALERT_THRESHOLD', self.DEFAULT_THRESHOLD)
        )

    def __call__(self, request):
        response = self.get_response(request)
        try:
            if response.status_code == 429:
                self._record_throttle(request, response)
        except Exception as exc:
            # Middleware xato bo'lsa request'ni buzmaslik
            logger.warning('RateLimitAlertMiddleware xato: %s', exc)
        return response

    def _record_throttle(self, request, response) -> None:
        from datetime import datetime, timezone as _tz
        from django.core.cache import cache

        # Daqiqalik bucket (UTC)
        now = datetime.now(tz=_tz.utc)
        bucket = now.strftime('%Y%m%d-%H%M')

        ip = self._get_throttle_ip(request)
        path = request.path
        user = (
            getattr(request, 'user', None) and request.user.is_authenticated
            and getattr(request.user, 'id', None)
        ) or 'anon'

        # ── Har 429 — log/Sentry breadcrumb ──────────────────────────────────
        logger.warning(
            'Rate limit (429): path=%s ip=%s user=%s',
            path, ip, user,
        )

        # ── Daqiqalik counter (atomik) ───────────────────────────────────────
        count_key = f'bozor:throttle_count:{bucket}'
        try:
            new_count = cache.incr(count_key)
        except ValueError:
            # Kalit yo'q — yaratamiz (2 daqiqalik TTL — bucket o'tib ketgandan keyin o'chsin)
            cache.set(count_key, 1, timeout=120)
            new_count = 1

        # ── Top IP track ─────────────────────────────────────────────────────
        # Memory tejaymiz: 20 ta IPdan ko'p saqlamaymiz (eng faollarini)
        if ip and ip != 'unknown':
            ip_key = f'bozor:throttle_ips:{bucket}'
            ips_dict = cache.get(ip_key) or {}
            if isinstance(ips_dict, dict):
                ips_dict[ip] = ips_dict.get(ip, 0) + 1
                if len(ips_dict) > 20:
                    # Eng faol 20 tasini saqlaymiz
                    ips_dict = dict(
                        sorted(ips_dict.items(), key=lambda x: -x[1])[:20]
                    )
                cache.set(ip_key, ips_dict, timeout=120)

        # ── Threshold tekshiruv ──────────────────────────────────────────────
        if new_count >= self.threshold:
            self._maybe_send_burst_alert(bucket, new_count)

    def _maybe_send_burst_alert(self, bucket: str, count: int) -> None:
        """
        Daqiqalik 'alerted' lock orqali — 1 daqiqada bitta alert.
        cache.add atomik: kalit yo'q bo'lsa True (lock olindi), bor bo'lsa False.
        """
        from django.core.cache import cache

        alerted_key = f'bozor:throttle_alerted:{bucket}'
        if not cache.add(alerted_key, '1', timeout=300):
            # Bu daqiqa uchun allaqachon alert yuborilgan
            return

        # Top IP'larni olamiz
        ip_key = f'bozor:throttle_ips:{bucket}'
        ips_dict = cache.get(ip_key) or {}
        top_ips = sorted(ips_dict.items(), key=lambda x: -x[1])[:5]

        # Telegram xabar
        lines = [
            "DDoS yoki scraping shubhasi — rate limit cho'qqida!",
            "",
            f"Daqiqa:        `{bucket}` UTC",
            f"429 javoblar: `{count}` ta",
            f"Threshold:    `{self.threshold}` ta/daqiqa",
        ]

        if top_ips:
            lines.append("")
            lines.append("Top IP'lar:")
            for ip, c in top_ips:
                pct = int(100 * c / count) if count else 0
                lines.append(f"  • `{ip}` — `{c}` ta ({pct}%)")

        lines.extend([
            "",
            "Tekshirish:",
            "  • Render Logs → kim ko'p kelmoqda?",
            "  • Sentry → 429 breadcrumb'lari",
            "  • Cloudflare/firewall — IP block (agar yoqilgan)",
        ])

        try:
            from core.notifications import alert_critical
            alert_critical("\n".join(lines))
        except Exception as exc:
            logger.warning('Telegram rate-limit alert xato: %s', exc)

        # Sentry'ga ham — postmortem uchun
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f'Rate limit burst: {count} 429s in {bucket} '
                f'(top IPs: {[ip for ip, _ in top_ips[:3]]})',
                level='warning',
            )
        except Exception:
            pass

    @staticmethod
    def _get_throttle_ip(request) -> str:
        """X-Forwarded-For yoki REMOTE_ADDR — IP norm formatda."""
        forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').strip()
        if forwarded:
            ip = forwarded.split(',')[0].strip()
            if ip:
                return ip
        return request.META.get('REMOTE_ADDR') or 'unknown'
