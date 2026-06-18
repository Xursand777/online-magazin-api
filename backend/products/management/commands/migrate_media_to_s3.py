"""
migrate_media_to_s3 — Lokal media fayllarni S3-mos object storage'ga ko'chirish.

Cloudflare R2, Hetzner Object Storage, Backblaze B2 — barchasi S3-mos.
Bu komanda Django'ning JORIY storage sozlamalaridan (settings.AWS_*) o'qiydi,
shuning uchun CDN_PROVIDER nima bo'lsa (r2/b2/...) o'shanga yuklaydi.

⭐ NEGA MUHIM: rasmlar object storage'da (serverdan TASHQARIDA) tursa, siz
serverni Render'dan Hetzner'ga (yoki boshqa joyga) ko'chirsangiz ham — rasmlar
TEGMAYDI, o'chmaydi. Faqat yangi serverda BIR XIL R2 env'larni o'rnatasiz.

MUHIM (R2/Hetzner farqi S3'dan): per-obyekt ACL YUBORILMAYDI (R2 uni qo'llamaydi).
Public ko'rinish bucket sozlamasi / custom domen orqali beriladi.

Ishlatish:
    # Avval ko'rib chiqish (hech narsa yuklamaydi)
    CDN_PROVIDER=r2 R2_ACCOUNT_ID=.. R2_ACCESS_KEY_ID=.. R2_SECRET_ACCESS_KEY=.. \\
    R2_BUCKET_NAME=bozor-media python manage.py migrate_media_to_s3 --dry-run

    # Haqiqiy ko'chirish
    ... python manage.py migrate_media_to_s3

    # Mavjudlarni ham qayta yuklash
    ... python manage.py migrate_media_to_s3 --overwrite
"""
import mimetypes
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# Rasmlar noyob nomli → uzoq, "immutable" kesh (CDN/brauzer qayta yuklamaydi).
CACHE_CONTROL = 'public, max-age=31536000, immutable'


class Command(BaseCommand):
    help = "Lokal media fayllarni sozlangan S3-mos storage'ga (R2/Hetzner/B2) ko'chiradi."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help="Faqat ko'rsatadi, yuklamaydi.")
        parser.add_argument('--overwrite', action='store_true',
                            help="Bucket'da mavjud bo'lsa ham qayta yuklaydi.")
        parser.add_argument('--folder', default='',
                            help="Faqat shu kichik papka (masalan products/gallery).")

    def handle(self, *args, **opts):
        # Lazy import — boto3 production dependency (requirements.txt). Modul
        # boto3'siz ham yuklanadi; faqat komandani ISHGA TUSHIRGANDA kerak.
        try:
            import boto3
            from botocore.config import Config
            from botocore.exceptions import ClientError, NoCredentialsError
        except ModuleNotFoundError:
            raise CommandError(
                "boto3 o'rnatilmagan. `pip install boto3` (requirements.txt'da bor)."
            )

        dry_run = opts['dry_run']
        overwrite = opts['overwrite']
        folder = opts['folder'].strip('/')

        # Sozlamalardan o'qiymiz — CDN_PROVIDER=r2/b2 bo'lganda AWS_* o'rnatiladi.
        key_id   = getattr(settings, 'AWS_ACCESS_KEY_ID', None)
        secret   = getattr(settings, 'AWS_SECRET_ACCESS_KEY', None)
        bucket   = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None)
        endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None)
        region   = getattr(settings, 'AWS_S3_REGION_NAME', 'auto')

        if not all([key_id, secret, bucket, endpoint]):
            raise CommandError(
                "S3 sozlamalari topilmadi. CDN_PROVIDER=r2 (yoki b2) va kerakli\n"
                "env o'zgaruvchilarini (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ...) o'rnating."
            )

        media_root = Path(settings.MEDIA_ROOT)
        search_root = media_root / folder if folder else media_root
        if not search_root.exists():
            raise CommandError(f"Papka topilmadi: {search_root}")

        files = sorted(f for f in search_root.rglob('*') if f.is_file())

        self.stdout.write(f"Media root : {media_root}")
        self.stdout.write(f"Endpoint   : {endpoint}")
        self.stdout.write(f"Bucket     : {bucket}")
        self.stdout.write(f"Fayllar    : {len(files)}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY-RUN — hech narsa yuklanmaydi\n"))

        s3 = None
        if not dry_run:
            s3 = boto3.client(
                's3',
                endpoint_url=endpoint,
                aws_access_key_id=key_id,
                aws_secret_access_key=secret,
                region_name=region,
                config=Config(signature_version='s3v4'),
            )

        uploaded = skipped = failed = 0
        for fp in files:
            key = str(fp.relative_to(media_root)).replace('\\', '/')
            mime = mimetypes.guess_type(str(fp))[0] or 'application/octet-stream'

            if dry_run:
                self.stdout.write(f"  → {key}")
                uploaded += 1
                continue

            if not overwrite:
                try:
                    s3.head_object(Bucket=bucket, Key=key)
                    skipped += 1
                    continue
                except ClientError as e:
                    if e.response['Error']['Code'] not in ('404', 'NoSuchKey'):
                        self.stderr.write(f"  ✗ head {key}: {e}")
                        failed += 1
                        continue
            try:
                # ACL YUBORILMAYDI — R2/Hetzner uni qo'llamaydi.
                s3.upload_file(
                    str(fp), bucket, key,
                    ExtraArgs={'ContentType': mime, 'CacheControl': CACHE_CONTROL},
                )
                self.stdout.write(self.style.SUCCESS(f"  ✓ {key}"))
                uploaded += 1
            except NoCredentialsError:
                raise CommandError("Credentials noto'g'ri yoki yo'q!")
            except Exception as e:  # noqa
                self.stderr.write(self.style.ERROR(f"  ✗ {key}: {e}"))
                failed += 1

        self.stdout.write('\n' + '=' * 55)
        self.stdout.write(self.style.SUCCESS(
            f"Yuklandi: {uploaded} | o'tkazildi: {skipped} | xato: {failed}"
            + (" [DRY-RUN]" if dry_run else "")
        ))
        if not dry_run and failed == 0:
            self.stdout.write(
                "\n✅ Tayyor. Endi serverda CDN_PROVIDER=r2 + R2_* env'larni o'rnating —\n"
                "   rasmlar R2'dan o'qiladi. Serverni ko'chirsangiz ham o'chmaydi."
            )
