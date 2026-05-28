"""
Management command: upload_media_to_b2

Barcha local media fayllarni Backblaze B2 bucket'ga yuklaydi.
Fayl yo'li saqlanadi (products/gallery/foto.webp → bucket'da ham shu yo'l).

Ishlatish:
    # Preview
    python manage.py upload_media_to_b2 --dry-run

    # Yuklash
    B2_KEY_ID=xxx B2_APPLICATION_KEY=yyy B2_BUCKET_NAME=zzz \\
    B2_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com \\
    python manage.py upload_media_to_b2

    # Faqat bitta papka
    python manage.py upload_media_to_b2 --folder products/gallery
"""

import os
import mimetypes
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Upload all local media files to Backblaze B2"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview which files would be uploaded (no actual upload)",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite existing files (default: skip if already exists)",
        )
        parser.add_argument(
            "--folder",
            default="",
            help="Only upload files under this subfolder (e.g. products/gallery)",
        )

    def handle(self, *args, **options):
        dry_run   = options["dry_run"]
        overwrite = options["overwrite"]
        folder    = options["folder"].strip("/")

        # ── Credentials ──────────────────────────────────────────────────────
        key_id      = os.getenv("B2_KEY_ID")
        app_key     = os.getenv("B2_APPLICATION_KEY")
        bucket_name = os.getenv("B2_BUCKET_NAME")
        endpoint    = os.getenv("B2_ENDPOINT_URL")
        region      = os.getenv("B2_REGION", "us-west-004")

        # Fallback: settings'dan o'qish (agar CDN_PROVIDER=b2 bo'lsa)
        if not key_id:
            key_id      = getattr(settings, "AWS_ACCESS_KEY_ID", None)
        if not app_key:
            app_key     = getattr(settings, "AWS_SECRET_ACCESS_KEY", None)
        if not bucket_name:
            bucket_name = getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
        if not endpoint:
            endpoint    = getattr(settings, "AWS_S3_ENDPOINT_URL", None)

        if not dry_run and not all([key_id, app_key, bucket_name, endpoint]):
            raise CommandError(
                "Backblaze B2 credentials topilmadi!\n"
                "Quyidagilarni set qiling:\n"
                "  B2_KEY_ID=...\n"
                "  B2_APPLICATION_KEY=...\n"
                "  B2_BUCKET_NAME=...\n"
                "  B2_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com"
            )

        # ── S3 client (Backblaze B2 S3-compatible) ───────────────────────────
        if not dry_run:
            s3 = boto3.client(
                "s3",
                endpoint_url=endpoint,
                aws_access_key_id=key_id,
                aws_secret_access_key=app_key,
                region_name=region,
            )

        # ── Media root ───────────────────────────────────────────────────────
        media_root  = Path(settings.MEDIA_ROOT)
        search_root = media_root / folder if folder else media_root

        if not search_root.exists():
            raise CommandError(f"Papka topilmadi: {search_root}")

        media_files = sorted(f for f in search_root.rglob("*") if f.is_file())

        self.stdout.write(f"Media root  : {media_root}")
        self.stdout.write(f"Bucket      : {bucket_name}")
        self.stdout.write(f"Endpoint    : {endpoint}")
        self.stdout.write(f"Total files : {len(media_files)}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — hech narsa yuklanmaydi\n"))
        self.stdout.write("")

        uploaded = skipped = failed = 0

        for filepath in media_files:
            rel_path  = str(filepath.relative_to(media_root))
            mime, _   = mimetypes.guess_type(str(filepath))
            mime      = mime or "application/octet-stream"

            self.stdout.write(f"  {rel_path}", ending="")

            if dry_run:
                self.stdout.write("  → would upload")
                uploaded += 1
                continue

            # Skip check (unless overwrite)
            if not overwrite:
                try:
                    s3.head_object(Bucket=bucket_name, Key=rel_path)
                    self.stdout.write(self.style.WARNING("  (mavjud, skip)"))
                    skipped += 1
                    continue
                except ClientError as e:
                    if e.response["Error"]["Code"] != "404":
                        self.stdout.write(self.style.ERROR(f"  ✗ head error: {e}"))
                        failed += 1
                        continue
                    # 404 = not found → upload

            try:
                s3.upload_file(
                    str(filepath),
                    bucket_name,
                    rel_path,
                    ExtraArgs={
                        "ContentType": mime,
                        "ACL": "public-read",
                    },
                )
                public_url = f"{endpoint}/{bucket_name}/{rel_path}"
                self.stdout.write(self.style.SUCCESS(f"  ✓ {public_url}"))
                uploaded += 1
            except NoCredentialsError:
                raise CommandError("Credentials noto'g'ri yoki yo'q!")
            except ClientError as e:
                self.stdout.write(self.style.ERROR(f"  ✗ {e}"))
                failed += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ {e}"))
                failed += 1

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 55)
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"DRY RUN natija: {uploaded} fayl yuklanardi"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(f"Yuklandi  : {uploaded}"))
            self.stdout.write(self.style.WARNING(f"O'tkazildi: {skipped}  (--overwrite bilan qayta yuklash)"))
            if failed:
                self.stdout.write(self.style.ERROR(f"Xato      : {failed}"))
            else:
                self.stdout.write("Xato      : 0")
            self.stdout.write(
                "\nKeyingi qadam: Render'da CDN_PROVIDER=b2 va B2_* env varlarni o'rnating."
            )
