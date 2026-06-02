"""
core/management/commands/backup_db.py — Ma'lumotlar bazasi backup'i (Backblaze B2'ga).

ISHLATISH:
    python manage.py backup_db                  # to'liq backup + upload
    python manage.py backup_db --dry-run        # dump yarat, lekin yuklamasdan
    python manage.py backup_db --keep-local     # lokal faylni saqlab qol
    python manage.py backup_db --quiet          # muvaffaqiyat alert'i yuborma
    python manage.py backup_db --retention-days 60  # standart retention'ni almashtir

DIZAYN — 3-2-1 BACKUP QOIDASI:
    3 nusxa:   Production DB + B2 backup + 7 oxirgi backup (B2'da)
    2 turdagi: Postgres (live) + B2 object storage (archive)
    1 offsite: B2 datacenter (Render'dan boshqa joyda)

OQIM:
    1. Konfiguratsiya tekshiruvi (B2 creds, settings)
    2. DB engine aniqlash (postgresql / sqlite)
    3. Dump yaratish (pg_dump yoki sqlite3 .backup)
    4. Gzip orqali siqish (streaming — disk tejaydi)
    5. Hajm validatsiyasi (bo'sh dump'larni topish)
    6. B2'ga yuklash (ALOHIDA PRIVATE bucket'ga!)
    7. Yuklanishni tasdiqlash (head_object orqali)
    8. Eski backup'larni tozalash (retention)
    9. Telegram alert (success/failure)

XAVFSIZLIK:
    - B2 bucket PRIVATE bo'lishi shart (default: media bucket'dan ALOHIDA)
    - Backup'larda PII bor (telefon, manzil, parol hash) — server-side encryption
    - Application key faqat backup bucket'ga ruxsat berish (kelajakda)
    - Cleanup mexanizmi har doim 7 oxirgi backup'ni saqlab qoladi (xato'ga zaxira)

NIMA UCHUN GITHUB ACTIONS CRON:
    Render free tier'da cron yo'q. Render'ning ichidan ishga tushirilsa,
    server qulflanishi yoki uxlab qolishi mumkin. Tashqi cron — eng
    ishonchli yondashuv. GitHub Actions free reja: 2000 daqiqa/oy
    (bizga ~150 daqiqa/oy kerak — kuniga 1 marta × 30 kun × 5 daqiqa).

NIMA UCHUN STREAMING (pg_dump | gzip):
    Katta DB uchun: 5 GB live → 20 GB dump → 2 GB gzipped.
    Streaming bo'lmasa: 20 GB temp fayl kerak (GitHub Actions disk yetishmasligi
    mumkin). Streaming: gzip subprocess pg_dump natijasidan to'g'ri o'qib,
    siqilgan ko'rinishda B2'ga yuborishga tayyorlanadi.
"""
from __future__ import annotations

import gzip
import logging
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

logger = logging.getLogger(__name__)


# ── Konstantalar ────────────────────────────────────────────────────────────

# Backup fayllar prefixi — list/cleanup vaqtida grep qilish uchun
BACKUP_PREFIX = 'bozor-backup-'

# B2 ga yuborish vaqtida bir o'qish — 5 MB chunk (gzip oqim uchun)
UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024

# Minimum kutilgan backup hajmi (compressed) — bundan kichik bo'lsa shubha
MIN_BACKUP_SIZE_BYTES = 1024  # 1 KB — bo'sh DB uchun ham bunday kichik bo'lmaydi

# Cleanup himoyasi — har doim shu sondan kam backup qolishi mumkin emas
MIN_BACKUPS_TO_KEEP = 7

# pg_dump uchun maksimal vaqt — agar uzoq cho'zilsa, DB lock yoki tarmoq muammosi
PG_DUMP_TIMEOUT_SECONDS = 1200  # 20 daqiqa


class Command(BaseCommand):
    help = "Ma'lumotlar bazasini backup qilib Backblaze B2'ga yuklash"

    # ── CLI ──────────────────────────────────────────────────────────────────

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Dump yarat, lekin B2 ga yuklamasdan to\'xta',
        )
        parser.add_argument(
            '--keep-local',
            action='store_true',
            help='Lokal backup faylni o\'chirma (debug uchun)',
        )
        parser.add_argument(
            '--quiet',
            action='store_true',
            help='Muvaffaqiyat alert\'ini Telegram\'ga yuborma '
                 '(faqat xato bo\'lsa alert)',
        )
        parser.add_argument(
            '--retention-days',
            type=int,
            default=None,
            help='Saqlash muddati (default: settings.BACKUP_RETENTION_DAYS)',
        )

    # ── Asosiy oqim ──────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        start_time = time.time()
        backup_path: Path | None = None
        prev_size: int | None = None

        try:
            # 1. Konfiguratsiya
            self._validate_config(dry_run=options['dry_run'])

            # 2. DB engine aniqlash
            engine = self._detect_engine()
            self.stdout.write(f'Database engine: {engine}')

            # 3. Avvalgi backup hajmini eslab qolish (anomaliya aniqlash uchun)
            if not options['dry_run']:
                prev_size = self._get_latest_backup_size()
                if prev_size:
                    self.stdout.write(f'Oxirgi backup hajmi: {self._fmt_size(prev_size)}')

            # 4. Dump + gzip (streaming)
            backup_path = self._create_compressed_dump(engine)
            size_bytes = backup_path.stat().st_size
            self.stdout.write(self.style.SUCCESS(
                f'Dump tayyor: {backup_path.name} ({self._fmt_size(size_bytes)})'
            ))

            # 5. Sanity check — hajm normal'mi?
            self._validate_dump_size(size_bytes, prev_size)

            # 6. Dry run bo'lsa shu yerda to'xtaymiz
            if options['dry_run']:
                self.stdout.write(self.style.WARNING(
                    '\n[DRY RUN] B2 ga yuklash o\'tkazib yuborildi.'
                ))
                self.stdout.write(f'Lokal fayl: {backup_path}')
                return

            # 7. B2 ga yuklash
            object_key = backup_path.name
            uploaded_etag = self._upload_to_b2(backup_path, object_key)
            self.stdout.write(self.style.SUCCESS(
                f'B2 ga yuklandi: {object_key} (etag: {uploaded_etag[:16]}...)'
            ))

            # 8. Yuklanish tasdiqlash
            self._verify_upload(object_key, size_bytes)

            # 9. Eski backup'larni tozalash
            retention = options['retention_days'] or getattr(
                settings, 'BACKUP_RETENTION_DAYS', 30
            )
            deleted_count = self._cleanup_old_backups(retention_days=retention)

            # 10. Hisobot
            duration = time.time() - start_time
            self._report_success(
                object_key=object_key,
                size_bytes=size_bytes,
                duration_sec=duration,
                deleted_count=deleted_count,
                retention_days=retention,
                quiet=options['quiet'],
                prev_size=prev_size,
            )

        except Exception as exc:
            duration = time.time() - start_time
            self._report_failure(exc, duration)
            # Re-raise so GitHub Actions / CI gets non-zero exit code
            raise CommandError(f'Backup muvaffaqiyatsiz: {exc}')

        finally:
            # Lokal faylni doim tozalash (--keep-local bo'lmasa)
            if backup_path and backup_path.exists() and not options.get('keep_local'):
                try:
                    backup_path.unlink()
                    self.stdout.write(f'Lokal fayl o\'chirildi: {backup_path}')
                except OSError as exc:
                    logger.warning('Lokal fayl o\'chirishda xato: %s', exc)

    # ── Konfiguratsiya tekshiruvi ────────────────────────────────────────────

    def _validate_config(self, *, dry_run: bool) -> None:
        """B2 sozlamalari va backup bucket borligini tekshiradi."""
        if dry_run:
            return  # dry run uchun B2 kerak emas

        required = {
            'B2_KEY_ID': os.getenv('B2_KEY_ID', ''),
            'B2_APPLICATION_KEY': os.getenv('B2_APPLICATION_KEY', ''),
            'B2_ENDPOINT_URL': os.getenv('B2_ENDPOINT_URL', ''),
            'B2_BUCKET_BACKUPS': self._get_backup_bucket(),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise CommandError(
                f"Backup uchun quyidagi env'lar kerak: {', '.join(missing)}\n\n"
                "Sozlash:\n"
                "  B2_KEY_ID=...\n"
                "  B2_APPLICATION_KEY=...\n"
                "  B2_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com\n"
                "  B2_BUCKET_BACKUPS=bozor-backups\n\n"
                "DIQQAT: Backup bucket media bucket'dan ALOHIDA va PRIVATE "
                "bo'lishi shart.\n"
            )

    def _get_backup_bucket(self) -> str:
        """Backup bucket nomi — alohida env yoki settings'dan."""
        return (
            os.getenv('B2_BUCKET_BACKUPS', '').strip()
            or getattr(settings, 'BACKUP_B2_BUCKET', '')
        )

    # ── DB engine aniqlash ──────────────────────────────────────────────────

    def _detect_engine(self) -> str:
        """connection.vendor → 'postgresql' yoki 'sqlite'."""
        vendor = connection.vendor
        if vendor not in ('postgresql', 'sqlite'):
            raise CommandError(
                f'Qo\'llab-quvvatlanmagan DB engine: {vendor}. '
                'Faqat postgresql va sqlite uchun amalga oshirilgan.'
            )
        return vendor

    # ── Dump yaratish (streaming gzip bilan) ─────────────────────────────────

    def _create_compressed_dump(self, engine: str) -> Path:
        """
        DB dump'ini yaratib, gzip bilan siqib, lokal faylga yozadi.
        Streaming — katta DB uchun ham xotira yoki disk yetishmasligi yo'q.
        """
        timestamp = datetime.now(timezone.utc)
        filename = self._make_filename(timestamp, engine)
        temp_dir = Path(tempfile.gettempdir())
        output_path = temp_dir / filename

        if engine == 'postgresql':
            self._dump_postgresql_streaming(output_path)
        else:  # sqlite
            self._dump_sqlite(output_path)

        return output_path

    def _make_filename(self, timestamp: datetime, engine: str) -> str:
        """
        Naming: bozor-backup-2026-05-30-030000.sql.gz
        ISO sana — leksikografik tartibda saralash to'g'ri ishlaydi.
        """
        ext = 'sql' if engine == 'postgresql' else 'sqlite3'
        ts = timestamp.strftime('%Y-%m-%d-%H%M%S')
        return f'{BACKUP_PREFIX}{ts}.{ext}.gz'

    def _dump_postgresql_streaming(self, output_path: Path) -> None:
        """
        pg_dump natijasini to'g'ridan-to'g'ri gzip orqali faylga yozish.
        Xotira / disk tejaydi — katta DB uchun shart.
        """
        database_url = self._get_database_url()

        cmd = [
            'pg_dump',
            '--no-owner',      # CREATE ROLE yo'q (restore'da kerak emas)
            '--no-acl',        # GRANT yo'q (restore'da kerak emas)
            '--clean',         # DROP TABLE statement'lari (idempotent restore)
            '--if-exists',     # DROP IF EXISTS — birinchi restore'da xato chiqarmasin
            '--format=plain',  # SQL matn (psql bilan restore qilish oson)
            database_url,
        ]

        self.stdout.write(f'pg_dump ishga tushirilmoqda...')

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        try:
            with gzip.open(output_path, 'wb', compresslevel=6) as gz_out:
                while True:
                    chunk = proc.stdout.read(UPLOAD_CHUNK_SIZE)
                    if not chunk:
                        break
                    gz_out.write(chunk)

            # pg_dump natijasini kutib olish (timeout bilan)
            try:
                _, stderr = proc.communicate(timeout=PG_DUMP_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                proc.kill()
                raise CommandError(
                    f'pg_dump {PG_DUMP_TIMEOUT_SECONDS}s davomida tugamadi'
                )

            if proc.returncode != 0:
                err_text = stderr.decode('utf-8', errors='replace')[:1000]
                raise CommandError(f'pg_dump xato qaytardi (kod={proc.returncode}):\n{err_text}')

        except FileNotFoundError:
            raise CommandError(
                'pg_dump CLI topilmadi. PostgreSQL client o\'rnatilganini '
                'tekshiring:\n'
                '  Ubuntu: sudo apt install postgresql-client\n'
                '  macOS:  brew install libpq && brew link --force libpq\n'
            )

    def _dump_sqlite(self, output_path: Path) -> None:
        """
        SQLite uchun: sqlite3 CLI'ning .backup buyrug'i bilan onlayn backup.
        Bu Django ishlayotgan paytda ham xavfsiz (MVCC-compatible).
        Keyin natijani gzip bilan siqamiz.
        """
        db_path = Path(connection.settings_dict['NAME'])
        if not db_path.exists():
            raise CommandError(f'SQLite fayli topilmadi: {db_path}')

        # 1. .backup CLI buyrug'i orqali consistent snapshot
        temp_db = output_path.with_suffix('.sqlite3.tmp')
        try:
            subprocess.run(
                ['sqlite3', str(db_path), f'.backup {temp_db}'],
                check=True,
                capture_output=True,
                timeout=300,
            )

            # 2. gzip bilan siqish
            with open(temp_db, 'rb') as f_in:
                with gzip.open(output_path, 'wb', compresslevel=6) as f_out:
                    shutil.copyfileobj(f_in, f_out, length=UPLOAD_CHUNK_SIZE)

        except subprocess.CalledProcessError as exc:
            err = exc.stderr.decode('utf-8', errors='replace')[:500] if exc.stderr else ''
            raise CommandError(f'sqlite3 .backup xato: {err}')
        except FileNotFoundError:
            raise CommandError(
                'sqlite3 CLI topilmadi:\n'
                '  Ubuntu: sudo apt install sqlite3\n'
                '  macOS:  preinstalled bo\'lishi kerak\n'
            )
        finally:
            if temp_db.exists():
                temp_db.unlink()

    def _get_database_url(self) -> str:
        """DATABASE_URL yoki Django connection'dan PostgreSQL URL qurish."""
        # Eng oson — env'dan to'g'ridan-to'g'ri
        url = os.getenv('DATABASE_URL', '').strip()
        if url:
            return url

        # Settings'dan qurish (DATABASE_URL bo'lmaganda)
        cfg = connection.settings_dict
        user = cfg.get('USER', '')
        pwd = cfg.get('PASSWORD', '')
        host = cfg.get('HOST', 'localhost')
        port = cfg.get('PORT', 5432)
        name = cfg.get('NAME', '')
        auth = f'{user}:{pwd}@' if user else ''
        return f'postgresql://{auth}{host}:{port}/{name}'

    # ── Hajm sanity check ────────────────────────────────────────────────────

    def _validate_dump_size(self, size_bytes: int, prev_size: int | None) -> None:
        """Bo'sh yoki shubhali kichik backup'larni topadi."""
        if size_bytes < MIN_BACKUP_SIZE_BYTES:
            raise CommandError(
                f'Backup hajmi shubhali kichik: {size_bytes} bayt. '
                f'Minimum: {MIN_BACKUP_SIZE_BYTES}.'
            )

        # Avvalgi backup bilan solishtirish — 50% dan ko'p pasaysa ogohlantirish
        if prev_size and size_bytes < prev_size * 0.5:
            warning = (
                f'⚠️  Backup hajmi keskin kamaydi: '
                f'{self._fmt_size(prev_size)} → {self._fmt_size(size_bytes)} '
                f'({size_bytes * 100 // prev_size}% avvalgisi)'
            )
            self.stdout.write(self.style.WARNING(warning))
            self._send_alert_warning(warning)

    def _get_latest_backup_size(self) -> int | None:
        """Oxirgi backup hajmi (anomaliya aniqlash uchun)."""
        try:
            backups = self._list_backups()
            if not backups:
                return None
            return backups[-1]['Size']
        except Exception as exc:
            logger.debug('Avvalgi backup hajmini olishda xato: %s', exc)
            return None

    # ── B2 ulanish ───────────────────────────────────────────────────────────

    def _b2_client(self) -> Any:
        """boto3 S3 client B2 endpoint bilan."""
        return boto3.client(
            's3',
            endpoint_url=os.getenv('B2_ENDPOINT_URL'),
            aws_access_key_id=os.getenv('B2_KEY_ID'),
            aws_secret_access_key=os.getenv('B2_APPLICATION_KEY'),
            region_name=os.getenv('B2_REGION', 'us-west-004'),
        )

    def _upload_to_b2(self, file_path: Path, object_key: str) -> str:
        """B2 ga yuklash. Etag (md5 hash) qaytaradi."""
        client = self._b2_client()
        bucket = self._get_backup_bucket()

        try:
            with open(file_path, 'rb') as f:
                response = client.put_object(
                    Bucket=bucket,
                    Key=object_key,
                    Body=f,
                    ContentType='application/gzip',
                    Metadata={
                        'created-by': 'bozor-backup-db',
                        'created-at': datetime.now(timezone.utc).isoformat(),
                    },
                )
            etag = response.get('ETag', '').strip('"')
            return etag

        except (BotoCoreError, ClientError) as exc:
            raise CommandError(f'B2 ga yuklashda xato: {exc}')

    def _verify_upload(self, object_key: str, expected_size: int) -> None:
        """head_object orqali B2 da fayl mavjudligini va hajmini tekshirish."""
        client = self._b2_client()
        bucket = self._get_backup_bucket()

        try:
            response = client.head_object(Bucket=bucket, Key=object_key)
        except ClientError as exc:
            raise CommandError(
                f'Yuklangan backup\'ni tekshirib bo\'lmadi: {exc.response.get("Error", {}).get("Code")}'
            )

        actual_size = response['ContentLength']
        if actual_size != expected_size:
            raise CommandError(
                f'B2 da fayl hajmi mos kelmadi: '
                f'kutilgan {expected_size}, b2da {actual_size}'
            )

    # ── Eski backup'larni tozalash ───────────────────────────────────────────

    def _list_backups(self) -> list[dict]:
        """B2 da barcha backup'lar (paginate qiladi, sana bo'yicha saralanadi)."""
        client = self._b2_client()
        bucket = self._get_backup_bucket()

        paginator = client.get_paginator('list_objects_v2')
        objects = []
        for page in paginator.paginate(Bucket=bucket, Prefix=BACKUP_PREFIX):
            objects.extend(page.get('Contents', []))

        # Fayl nomi sana bilan boshlanadi → leksikografik tartib = sana tartibi
        objects.sort(key=lambda o: o['Key'])
        return objects

    def _cleanup_old_backups(self, *, retention_days: int) -> int:
        """
        retention_days kun'dan eski backup'larni o'chiradi.
        XAVFSIZLIK: har doim oxirgi MIN_BACKUPS_TO_KEEP ta backup'ni saqlab qoladi.
        """
        backups = self._list_backups()
        if len(backups) <= MIN_BACKUPS_TO_KEEP:
            self.stdout.write(
                f'Cleanup o\'tkazib yuborildi — bor-yo\'g\'i {len(backups)} ta backup '
                f'(min {MIN_BACKUPS_TO_KEEP} saqlanishi shart)'
            )
            return 0

        client = self._b2_client()
        bucket = self._get_backup_bucket()
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

        # Oxirgi MIN_BACKUPS_TO_KEEP ta backup'ni alohida ajratamiz
        protected_keys = {b['Key'] for b in backups[-MIN_BACKUPS_TO_KEEP:]}

        deleted = 0
        for backup in backups:
            if backup['Key'] in protected_keys:
                continue
            if backup['LastModified'] >= cutoff:
                continue

            try:
                client.delete_object(Bucket=bucket, Key=backup['Key'])
                self.stdout.write(f'  O\'chirildi: {backup["Key"]}')
                deleted += 1
            except ClientError as exc:
                logger.warning('Cleanup xatosi (%s): %s', backup['Key'], exc)

        return deleted

    # ── Hisobot va alertlar ──────────────────────────────────────────────────

    def _report_success(
        self,
        *,
        object_key: str,
        size_bytes: int,
        duration_sec: float,
        deleted_count: int,
        retention_days: int,
        quiet: bool,
        prev_size: int | None,
    ) -> None:
        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Backup muvaffaqiyatli:\n'
            f'   Fayl:        {object_key}\n'
            f'   Hajm:        {self._fmt_size(size_bytes)}\n'
            f'   Vaqt:        {duration_sec:.1f}s\n'
            f'   O\'chirildi:  {deleted_count} eski backup\n'
            f'   Retention:   {retention_days} kun'
        ))

        if quiet:
            return

        prev_text = ''
        if prev_size:
            diff_pct = (size_bytes - prev_size) * 100 // prev_size if prev_size else 0
            sign = '+' if diff_pct >= 0 else ''
            prev_text = f'\nFarq: {sign}{diff_pct}% (oxirgi: {self._fmt_size(prev_size)})'

        message = (
            f'DB backup tugadi\n\n'
            f'`{object_key}`\n'
            f'Hajm: {self._fmt_size(size_bytes)}\n'
            f'Vaqt: {duration_sec:.1f}s'
            f'{prev_text}\n'
            f'Tozalangan: {deleted_count} ta eski backup'
        )
        self._send_alert_info(message)

    def _report_failure(self, exc: Exception, duration_sec: float) -> None:
        self.stderr.write(self.style.ERROR(
            f'\n❌ Backup muvaffaqiyatsiz ({duration_sec:.1f}s):\n   {exc}'
        ))

        # Telegram'ga critical alert — bu eshitilishi shart
        message = (
            f'DB BACKUP FAIL!\n\n'
            f'Xato: `{str(exc)[:300]}`\n'
            f'Vaqt: {duration_sec:.1f}s\n\n'
            f'Backup yo\'q = ma\'lumot xavf ostida. Tezda hal qilish kerak.'
        )
        self._send_alert_critical(message)

    # ── Telegram alert wrapper'lar (silently fails) ──────────────────────────

    def _send_alert_info(self, message: str) -> None:
        try:
            from core.notifications import alert_info
            alert_info(message)
        except Exception as exc:
            logger.warning('Telegram info alert yuborib bo\'lmadi: %s', exc)

    def _send_alert_warning(self, message: str) -> None:
        try:
            from core.notifications import alert_warning
            alert_warning(message)
        except Exception as exc:
            logger.warning('Telegram warning alert yuborib bo\'lmadi: %s', exc)

    def _send_alert_critical(self, message: str) -> None:
        try:
            from core.notifications import alert_critical
            alert_critical(message)
        except Exception as exc:
            logger.warning('Telegram critical alert yuborib bo\'lmadi: %s', exc)

    # ── Yordamchilar ─────────────────────────────────────────────────────────

    @staticmethod
    def _fmt_size(size: int) -> str:
        """Bytes → o'qiladigan format (KB, MB, GB)."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f'{size:.1f} {unit}'
            size /= 1024
        return f'{size:.1f} TB'
