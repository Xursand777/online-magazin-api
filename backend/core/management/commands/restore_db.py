"""
core/management/commands/restore_db.py — Backup'dan DB ni qayta tiklash.

ISHLATISH:
    # 1. Mavjud backup'larni ko'rish:
    python manage.py restore_db --list

    # 2. Oxirgi backup'dan tiklash (xavfli — DB ni o'chiradi!):
    python manage.py restore_db --latest --confirm

    # 3. Aniq backup nomidan:
    python manage.py restore_db bozor-backup-2026-05-30-030000.sql.gz --confirm

XAVFSIZLIK:
    --confirm bayrog'i SHART. Aks holda komanda hech narsa qilmaydi.
    Production DB ga tiklash xavfli — birinchi STAGING ga sinab ko'ring.
    DEBUG=True'da qo'shimcha 'YES' yozib tasdiqlash so'raladi.

DIZAYN:
    Bu komanda asosan ikki maqsad uchun:
      1. Disaster recovery — production DB yo'qolsa, B2 dan qayta tiklash
      2. Staging tayyorlash — production backup'ni test serveriga olib o'tish

    Production'da to'g'ridan-to'g'ri ishlatish XAVFLI: DB allaqachon
    ishlamoqda, restore uni overwrite qiladi. Kuyiagi tartib tavsiya etiladi:
      1. Eski DB ni alohida saqlab qo'yish (snapshot)
      2. Yangi bo'sh DB yaratish
      3. DATABASE_URL ni yangi DB ga yo'naltirish
      4. restore_db ni yangi DB ga ishga tushirish
      5. Tekshiruv (health check, qo'lda smoke test)
      6. Eski DB ni 1 hafta saqlab qo'yib, keyin o'chirish

OQIM:
    1. B2 dan backup ro'yxati olish
    2. Foydalanuvchi tanlagan backup'ni yuklab olish
    3. Gzip ochish
    4. psql yoki sqlite3 orqali restore
    5. Telegram'ga xabar
"""
from __future__ import annotations

import gzip
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import timezone
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

# Phase 0.3+ — client-side deshifrlash. Backup B2'da AES-256-GCM bilan
# shifrlangan bo'lsa, .enc qo'shimchasi bilan keladi. Bu yerda deshifrlab,
# keyin gunzip qilinadi.
from core.backup_crypto import (
    BackupCryptoError,
    decrypt_stream,
    get_passphrase,
    is_encrypted_file,
)

logger = logging.getLogger(__name__)

BACKUP_PREFIX = 'bozor-backup-'
ENC_SUFFIX = '.enc'


class Command(BaseCommand):
    help = "Backblaze B2 dagi backup'dan ma'lumotlar bazasini tiklash"

    def add_arguments(self, parser):
        parser.add_argument(
            'backup_key',
            nargs='?',
            default=None,
            help='Aniq backup fayl nomi (yoki --latest ishlating)',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='Mavjud backup\'larni ko\'rsatish (tiklamasdan)',
        )
        parser.add_argument(
            '--latest',
            action='store_true',
            help='Eng so\'nggi backup\'dan tiklash',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='TIKLASHGA RUXSAT — bu bayrog\'siz hech narsa bajarilmaydi',
        )
        parser.add_argument(
            '--target-url',
            default=None,
            help='Alohida DATABASE_URL ga tiklash (production DB ni asramaslik uchun)',
        )

    def handle(self, *args, **options):
        # ── List ko'rish ──────────────────────────────────────────────────────
        if options['list']:
            return self._list_backups()

        # ── Backup tanlash ────────────────────────────────────────────────────
        backup_key = options.get('backup_key')
        if options['latest']:
            backup_key = self._find_latest_backup()
        if not backup_key:
            raise CommandError(
                'Backup tanlanmagan. Ishlatish:\n'
                '  --list                     ro\'yxat ko\'rish\n'
                '  --latest --confirm         oxirgisi\n'
                '  <fayl-nomi> --confirm      aniq backup'
            )

        # ── Confirm tekshiruvi ────────────────────────────────────────────────
        if not options['confirm']:
            raise CommandError(
                f'\n⚠️  DIQQAT: bu komanda DB\'NI OVERWRITE QILADI!\n'
                f'\n'
                f'Tiklash uchun: --confirm bayrog\'ini qo\'shing.\n'
                f'Tanlangan backup: {backup_key}\n'
                f'\n'
                f'Production DB ga to\'g\'ridan-to\'g\'ri tiklash XAVFLI.\n'
                f'Avval staging\'ga sinab ko\'ring.\n'
            )

        # Production'da qo'shimcha tasdiq
        if not settings.DEBUG:
            self.stdout.write(self.style.WARNING(
                f'\nPRODUCTION rejimda ishlamoqda.\n'
                f'Tiklash boshlanishidan oldin "YES" yozib tasdiqlang: '
            ))
            response = input().strip()
            if response != 'YES':
                raise CommandError('Tasdiqlanmadi. To\'xtatildi.')

        # ── Tiklash ───────────────────────────────────────────────────────────
        start = time.time()
        try:
            self._restore_backup(backup_key, target_url=options.get('target_url'))
            duration = time.time() - start
            self.stdout.write(self.style.SUCCESS(
                f'\n✅ Restore tugadi: {backup_key} ({duration:.1f}s)'
            ))
            self._send_alert(
                f'DB restore tugadi\n\nFayl: `{backup_key}`\nVaqt: {duration:.1f}s'
            )

        except Exception as exc:
            duration = time.time() - start
            self.stderr.write(self.style.ERROR(
                f'\n❌ Restore xato ({duration:.1f}s): {exc}'
            ))
            self._send_alert_critical(
                f'DB RESTORE FAIL\n\nFayl: `{backup_key}`\nXato: {str(exc)[:300]}'
            )
            raise CommandError(f'Restore muvaffaqiyatsiz: {exc}')

    # ── Backup ro'yxati ──────────────────────────────────────────────────────

    def _list_backups(self) -> None:
        backups = self._fetch_backup_list()
        if not backups:
            self.stdout.write('Bucket\'da backup\'lar topilmadi.')
            return

        self.stdout.write(f'\nB2 da {len(backups)} ta backup topildi:\n')
        for i, b in enumerate(backups, 1):
            age_days = (self._utc_now() - b['LastModified']).days
            size_str = self._fmt_size(b['Size'])
            marker = ' ← oxirgi' if i == len(backups) else ''
            self.stdout.write(
                f'  {i:3d}. {b["Key"]}  ({size_str}, {age_days} kun){marker}'
            )

    def _find_latest_backup(self) -> str:
        backups = self._fetch_backup_list()
        if not backups:
            raise CommandError('B2 da hech qanday backup topilmadi.')
        return backups[-1]['Key']

    def _fetch_backup_list(self) -> list[dict]:
        client = self._b2_client()
        bucket = self._get_backup_bucket()

        paginator = client.get_paginator('list_objects_v2')
        objects = []
        for page in paginator.paginate(Bucket=bucket, Prefix=BACKUP_PREFIX):
            objects.extend(page.get('Contents', []))
        objects.sort(key=lambda o: o['Key'])
        return objects

    # ── Asosiy restore logikasi ─────────────────────────────────────────────

    def _restore_backup(self, backup_key: str, target_url: str | None) -> None:
        # 1. B2 dan yuklab olish
        temp_dir = Path(tempfile.gettempdir())
        downloaded_path = temp_dir / backup_key
        self.stdout.write(f'B2 dan yuklab olinmoqda: {backup_key}...')
        self._download_from_b2(backup_key, downloaded_path)

        # 2. Shifrlangan bo'lsa — deshifrlash (`.gz.enc` → `.gz`)
        local_gz = self._maybe_decrypt(downloaded_path)
        # Engine aniqlash uchun key'dan `.enc` qo'shimchasini olib tashlaymiz
        key_for_engine = backup_key[:-len(ENC_SUFFIX)] if backup_key.endswith(ENC_SUFFIX) else backup_key

        # 3. Engine aniqlash — fayl extension'idan
        if key_for_engine.endswith('.sql.gz'):
            engine = 'postgresql'
        elif key_for_engine.endswith('.sqlite3.gz'):
            engine = 'sqlite'
        else:
            raise CommandError(f'Noma\'lum backup format: {backup_key}')

        if engine != connection.vendor and not target_url:
            raise CommandError(
                f'Backup engine mos kelmaydi:\n'
                f'  Backup: {engine}\n'
                f'  Joriy DB: {connection.vendor}\n'
                f'  --target-url orqali alohida DB ko\'rsating.'
            )

        # 4. Decompress
        local_sql = temp_dir / key_for_engine.replace('.gz', '')
        self.stdout.write(f'Decompress qilinmoqda...')
        self._decompress_gzip(local_gz, local_sql)

        # 5. Restore
        self.stdout.write(f'DB ga restore qilinmoqda...')
        try:
            if engine == 'postgresql':
                self._restore_postgresql(local_sql, target_url)
            else:
                self._restore_sqlite(local_sql, target_url)
        finally:
            # Lokal fayllarni tozalash (set bilan dublikat ehtimolini olib tashlaymiz —
            # shifrlanmagan holatda downloaded_path == local_gz).
            cleanup_paths = {p for p in (downloaded_path, local_gz, local_sql) if p}
            for path in cleanup_paths:
                if path.exists():
                    try:
                        path.unlink()
                    except OSError:
                        pass

    def _maybe_decrypt(self, src_path: Path) -> Path:
        """
        Shifrlangan bo'lsa AES-GCM bilan deshifrlab `.gz` faylini qaytaradi.
        Aks holda src_path'ni o'zini qaytaradi (eski format'lar uchun).

        Aniqlash: fayl nomidagi `.enc` qo'shimchasi YOKI fayl ichidagi MAGIC.
        Ikkalasini ham tekshirish — ma'lumotni xato fayldan o'qib qolmaslik
        uchun (defense-in-depth).
        """
        is_enc_by_name = src_path.name.endswith(ENC_SUFFIX)
        is_enc_by_magic = is_encrypted_file(str(src_path))
        if not (is_enc_by_name or is_enc_by_magic):
            return src_path

        # Mos kelmaslik — backup buzilgan yoki noto'g'ri tanlangan.
        # MUHIM: f-string ichida apostrof bo'lsa Python 3.11+ "backslash"
        # xatosini beradi — shu sababli labellarni avval o'zgaruvchiga olamiz.
        if is_enc_by_name != is_enc_by_magic:
            name_label = "ha" if is_enc_by_name else "yo'q"
            magic_label = "ha" if is_enc_by_magic else "yo'q"
            raise CommandError(
                f"Backup formati nomuvofiq: nom .enc={name_label}, "
                f"magic={magic_label}. Fayl buzilgan."
            )

        try:
            passphrase = get_passphrase(required=True)
        except BackupCryptoError as exc:
            raise CommandError(str(exc))

        decrypted_path = src_path.with_name(src_path.name[:-len(ENC_SUFFIX)])
        self.stdout.write(f'AES-256-GCM deshifrlanmoqda → {decrypted_path.name}')
        try:
            with open(src_path, 'rb') as src, open(decrypted_path, 'wb') as dst:
                decrypt_stream(src, dst, passphrase=passphrase)
        except BackupCryptoError as exc:
            # Yarim yozilgan deshifrlangan faylni o'chirib tashlaymiz —
            # qisman ma'lumot oshkor qilmasligi uchun.
            if decrypted_path.exists():
                try:
                    decrypted_path.unlink()
                except OSError:
                    pass
            raise CommandError(f'Deshifrlash xato: {exc}')
        return decrypted_path

    def _download_from_b2(self, key: str, dest: Path) -> None:
        client = self._b2_client()
        bucket = self._get_backup_bucket()
        try:
            client.download_file(Bucket=bucket, Key=key, Filename=str(dest))
        except (BotoCoreError, ClientError) as exc:
            raise CommandError(f'B2 dan yuklab bo\'lmadi: {exc}')

    @staticmethod
    def _decompress_gzip(source: Path, target: Path) -> None:
        with gzip.open(source, 'rb') as f_in:
            with open(target, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out, length=5 * 1024 * 1024)

    def _restore_postgresql(self, sql_path: Path, target_url: str | None) -> None:
        database_url = target_url or os.getenv('DATABASE_URL', '')
        if not database_url:
            raise CommandError('DATABASE_URL aniqlanmadi (env yoki --target-url kerak)')

        cmd = ['psql', database_url, '--single-transaction', '--file', str(sql_path)]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=1800)
        except FileNotFoundError:
            raise CommandError(
                'psql CLI topilmadi.\n'
                '  Ubuntu: sudo apt install postgresql-client\n'
                '  macOS:  brew install libpq && brew link --force libpq'
            )

        if result.returncode != 0:
            err = result.stderr.decode('utf-8', errors='replace')[:1000]
            raise CommandError(f'psql restore xato:\n{err}')

    def _restore_sqlite(self, db_path: Path, target_url: str | None) -> None:
        # SQLite uchun: faylni o'rnatish joyiga ko'chirish
        if target_url:
            target_path = Path(target_url.replace('sqlite:///', '').replace('sqlite://', ''))
        else:
            target_path = Path(connection.settings_dict['NAME'])

        # Avval connection'ni yopish
        connection.close()

        # Eski faylni saqlab qo'yish (xavfsizlik uchun)
        if target_path.exists():
            backup_existing = target_path.with_suffix('.sqlite3.before-restore')
            shutil.copy2(target_path, backup_existing)
            self.stdout.write(f'Eski DB saqlandi: {backup_existing}')

        shutil.copy2(db_path, target_path)

    # ── B2 client (backup_db dan takrorlamasdan) ─────────────────────────────

    def _b2_client(self):
        return boto3.client(
            's3',
            endpoint_url=os.getenv('B2_ENDPOINT_URL'),
            aws_access_key_id=os.getenv('B2_KEY_ID'),
            aws_secret_access_key=os.getenv('B2_APPLICATION_KEY'),
            region_name=os.getenv('B2_REGION', 'us-west-004'),
        )

    def _get_backup_bucket(self) -> str:
        bucket = (
            os.getenv('B2_BUCKET_BACKUPS', '').strip()
            or getattr(settings, 'BACKUP_B2_BUCKET', '')
        )
        if not bucket:
            raise CommandError('B2_BUCKET_BACKUPS env o\'rnatilmagan.')
        return bucket

    # ── Telegram alerts ─────────────────────────────────────────────────────

    def _send_alert(self, message: str) -> None:
        try:
            from core.notifications import alert_info
            alert_info(message)
        except Exception:
            pass

    def _send_alert_critical(self, message: str) -> None:
        try:
            from core.notifications import alert_critical
            alert_critical(message)
        except Exception:
            pass

    # ── Yordamchilar ────────────────────────────────────────────────────────

    @staticmethod
    def _utc_now():
        from datetime import datetime
        return datetime.now(timezone.utc)

    @staticmethod
    def _fmt_size(size: int) -> str:
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f'{size:.1f} {unit}'
            size /= 1024
        return f'{size:.1f} TB'
