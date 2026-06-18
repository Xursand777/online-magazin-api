"""
optimize_images — MAVJUD rasmlarni bir martalik WebP'ga optimizatsiya qilish.

Yangi yuklamalar model save() orqali avtomat optimizatsiya bo'ladi (image_optimize).
Bu komanda esa ESKI (allaqachon saqlangan) rasmlarni — masalan .avif/.png/.jpg —
WebP'ga aylantirib, hajmni keskin kamaytiradi.

    python manage.py optimize_images --dry-run     # nima o'zgarishini ko'rsatadi
    python manage.py optimize_images               # bajaradi (webp'lardan tashqari)
    python manage.py optimize_images --force       # webp'larni ham qayta siqadi
"""
import os

from django.core.management.base import BaseCommand

from products.image_optimize import optimize_to_webp
from products.models import (
    Category, ProductImage, ProductVariant, ProductVariantImage, HomeBanner,
)

# (Model, [rasm maydonlari], max o'lcham)
TARGETS = [
    (Category,            ['image'],                              800),
    (ProductImage,        ['image'],                              1600),
    (ProductVariant,      ['image'],                              1600),
    (ProductVariantImage, ['image'],                              1600),
    (HomeBanner,          ['product_image', 'background_image'],  1920),
]


class Command(BaseCommand):
    help = "Mavjud rasmlarni WebP'ga optimizatsiya qiladi (hajmni kamaytiradi)."

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help="Hech narsa saqlamasdan nima o'zgarishini ko'rsatadi.")
        parser.add_argument('--force', action='store_true',
                            help="Allaqachon .webp bo'lganlarni ham qayta siqadi.")

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        force = opts['force']
        total = saved_bytes = converted = skipped = failed = 0

        for Model, fields, maxdim in TARGETS:
            for obj in Model.objects.all():
                changed = False
                for fname in fields:
                    ff = getattr(obj, fname)
                    if not ff or not ff.name:
                        continue
                    total += 1
                    if ff.name.lower().endswith('.webp') and not force:
                        skipped += 1
                        continue
                    try:
                        old_size = ff.size
                        ff.open('rb')
                        content = optimize_to_webp(ff, max_dimension=maxdim)
                        ff.close()
                    except Exception as e:  # noqa
                        failed += 1
                        self.stderr.write(f"  ✗ {Model.__name__}#{obj.pk}.{fname}: {e}")
                        continue
                    if content is None:
                        failed += 1
                        continue
                    new_size = content.size
                    saved_bytes += max(0, old_size - new_size)
                    converted += 1
                    pct = 100 - (new_size * 100 // old_size) if old_size else 0
                    self.stdout.write(
                        f"  {Model.__name__}#{obj.pk}.{fname}: "
                        f"{ff.name}  {old_size:,}→{new_size:,} bayt (-{pct}%)"
                    )
                    if not dry:
                        base = os.path.splitext(os.path.basename(ff.name))[0]
                        ff.save(f'{base}.webp', content, save=False)
                        changed = True
                if changed and not dry:
                    obj.save(update_fields=fields)

        self.stdout.write(self.style.SUCCESS(
            f"\nJami rasm: {total} | aylantirildi: {converted} | "
            f"o'tkazildi (webp): {skipped} | xato: {failed} | "
            f"tejaldi: ~{saved_bytes // 1024:,} KB"
            + (" [DRY-RUN]" if dry else "")
        ))
