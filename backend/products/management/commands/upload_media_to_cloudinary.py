"""
Management command: upload_media_to_cloudinary

Barcha local media fayllarni Cloudinary CDN'ga yuklaydi.
public_id = fayl yo'li (extension'siz) saqlanadi, shuning uchun
DB'dagi image path'lar o'zgarmaydi — Django cloudinary_storage
ularni avtomatik Cloudinary URL'ga aylantiradi.

Ishlatish:
    # Preview (hech narsa yuklamaydi)
    python manage.py upload_media_to_cloudinary --dry-run

    # Haqiqiy yuklash
    CLOUDINARY_CLOUD_NAME=xxx CLOUDINARY_API_KEY=yyy CLOUDINARY_API_SECRET=zzz \\
    python manage.py upload_media_to_cloudinary

    # Mavjud fayllarni qayta yuklash (overwrite)
    python manage.py upload_media_to_cloudinary --overwrite
"""

import os
import mimetypes
from pathlib import Path

import cloudinary
import cloudinary.uploader
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Upload all local media files to Cloudinary CDN"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview which files would be uploaded (no actual upload)",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite existing files on Cloudinary (default: skip existing)",
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

        # ── Cloudinary credentials ───────────────────────────────────────────
        cloud_name  = os.getenv("CLOUDINARY_CLOUD_NAME")  or getattr(settings, "CLOUDINARY_STORAGE", {}).get("CLOUD_NAME")
        api_key     = os.getenv("CLOUDINARY_API_KEY")     or getattr(settings, "CLOUDINARY_STORAGE", {}).get("API_KEY")
        api_secret  = os.getenv("CLOUDINARY_API_SECRET")  or getattr(settings, "CLOUDINARY_STORAGE", {}).get("API_SECRET")

        if not all([cloud_name, api_key, api_secret]):
            raise CommandError(
                "Cloudinary credentials topilmadi!\n"
                "Quyidagi env varlarni set qiling:\n"
                "  CLOUDINARY_CLOUD_NAME=...\n"
                "  CLOUDINARY_API_KEY=...\n"
                "  CLOUDINARY_API_SECRET=..."
            )

        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True,
        )

        # ── Media root ───────────────────────────────────────────────────────
        media_root = Path(settings.MEDIA_ROOT)
        if not media_root.exists():
            raise CommandError(f"MEDIA_ROOT topilmadi: {media_root}")

        search_root = media_root / folder if folder else media_root

        # ── Collect files ────────────────────────────────────────────────────
        all_files = sorted(search_root.rglob("*"))
        media_files = [f for f in all_files if f.is_file()]

        self.stdout.write(f"Media root : {media_root}")
        self.stdout.write(f"Search dir : {search_root}")
        self.stdout.write(f"Total files: {len(media_files)}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — hech narsa yuklanmaydi\n"))

        uploaded = 0
        skipped  = 0
        failed   = 0

        for filepath in media_files:
            # public_id = relative path without extension
            # e.g.  products/gallery/foto.webp  →  products/gallery/foto
            rel_path  = filepath.relative_to(media_root)
            public_id = str(rel_path.with_suffix(""))   # remove extension

            # Detect resource_type
            mime, _ = mimetypes.guess_type(str(filepath))
            if mime and mime.startswith("video"):
                resource_type = "video"
            elif mime and mime.startswith("image"):
                resource_type = "image"
            else:
                resource_type = "raw"

            self.stdout.write(f"  [{resource_type}] {rel_path}", ending="")

            if dry_run:
                self.stdout.write("  → would upload")
                uploaded += 1
                continue

            try:
                result = cloudinary.uploader.upload(
                    str(filepath),
                    public_id=public_id,
                    resource_type=resource_type,
                    overwrite=overwrite,
                    unique_filename=False,
                    use_filename=True,
                    # Preserve directory structure
                    folder="",
                )
                self.stdout.write(
                    self.style.SUCCESS(f"  ✓ {result['secure_url']}")
                )
                uploaded += 1
            except cloudinary.exceptions.Error as e:
                err_msg = str(e)
                if "already exists" in err_msg or "public_id" in err_msg.lower():
                    self.stdout.write(self.style.WARNING("  (mavjud, skip)"))
                    skipped += 1
                else:
                    self.stdout.write(self.style.ERROR(f"  ✗ {e}"))
                    failed += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ {e}"))
                failed += 1

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 50)
        if dry_run:
            self.stdout.write(self.style.WARNING(f"DRY RUN: {uploaded} fayl yuklanardi"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Yuklandi : {uploaded}"))
            self.stdout.write(self.style.WARNING(f"O'tkazib  : {skipped}"))
            if failed:
                self.stdout.write(self.style.ERROR(f"Xato     : {failed}"))
            else:
                self.stdout.write("Xato      : 0")
            self.stdout.write("\nBarcha rasm URL'lari endi Cloudinary'dan xizmat qiladi.")
