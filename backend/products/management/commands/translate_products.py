from django.core.management.base import BaseCommand
from products.models import Product, Category, _translate_text


class Command(BaseCommand):
    help = (
        'Translate product and category names/descriptions using the smart '
        'brand-protection engine.  By default only fills empty translation '
        'fields.  Use --retranslate to overwrite existing values (useful after '
        'upgrading the translation engine).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Show what would be translated without saving anything.',
        )
        parser.add_argument(
            '--model', choices=['product', 'category', 'all'], default='all',
            help='Which model to translate (default: all).',
        )
        parser.add_argument(
            '--retranslate', action='store_true',
            help='Overwrite existing translations (re-runs engine on every record).',
        )

    def handle(self, *args, **options):
        dry_run     = options['dry_run']
        model       = options['model']
        retranslate = options['retranslate']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — nothing will be saved.'))

        if model in ('category', 'all'):
            self._translate_categories(dry_run, retranslate)
        if model in ('product', 'all'):
            self._translate_products(dry_run, retranslate)

    # ─────────────────────────────────────────────────────────────────────────

    def _apply_field(self, updates: dict, field: str, current: str,
                     result: str, label: str, retranslate: bool) -> None:
        """
        Decide what value to write for one translation field.

        Rules:
          • result is non-empty  →  write the translation (always)
          • result is ''  AND  --retranslate  AND  current is non-empty
            →  write ''  (CLEAR the stale/wrong value so the serialiser
               falls back to the original Uzbek name instead of serving
               a Cyrillic transliteration like "айфон" or "Редми")
          • result is ''  AND  (no --retranslate  OR  current already '')
            →  do nothing (field is either already empty or user didn't ask
               to overwrite)
        """
        if result:
            updates[field] = result
            self.stdout.write(f'  {label}: {result[:60]!r}')
        elif retranslate and current:
            # Engine says "fully protected → no translation needed", but the
            # field currently holds a stale Cyrillic transliteration.  Clear it.
            updates[field] = ''
            self.stdout.write(
                self.style.ERROR(
                    f'  {label}: CLEARED stale transliteration {current[:50]!r} → (fallback to original)'
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(f'  {label}: SKIP (fully protected / no change needed)')
            )

    # ── Categories ────────────────────────────────────────────────────────────

    def _translate_categories(self, dry_run: bool, retranslate: bool) -> None:
        qs = Category.objects.filter(name__isnull=False).exclude(name='')
        if not retranslate:
            qs = (qs.filter(name_ru='') | qs.filter(name_en='')).distinct()

        total = qs.count()
        self.stdout.write(f'\nCategories to process: {total}')
        done = 0

        for cat in qs:
            updates: dict = {}

            if not cat.name_ru or retranslate:
                label = f'[cat {cat.pk}] {cat.name!r} → ru'
                self._apply_field(
                    updates, 'name_ru', cat.name_ru,
                    _translate_text(cat.name, 'ru'),
                    label, retranslate,
                )

            if not cat.name_en or retranslate:
                label = f'[cat {cat.pk}] {cat.name!r} → en'
                self._apply_field(
                    updates, 'name_en', cat.name_en,
                    _translate_text(cat.name, 'en'),
                    label, retranslate,
                )

            if updates and not dry_run:
                Category.objects.filter(pk=cat.pk).update(**updates)
                done += 1

        self.stdout.write(self.style.SUCCESS(
            f'Categories done — {done} updated (dry_run={dry_run})'
        ))

    # ── Products ──────────────────────────────────────────────────────────────

    def _translate_products(self, dry_run: bool, retranslate: bool) -> None:
        qs = Product.objects.filter(name__isnull=False).exclude(name='')
        if not retranslate:
            need = (
                Product.objects.filter(name_ru='')
                | Product.objects.filter(name_en='')
                | Product.objects.filter(description_ru='')
                | Product.objects.filter(description_en='')
            )
            qs = (qs & need.distinct())

        total = qs.count()
        self.stdout.write(f'\nProducts to process: {total}')
        done = 0

        for product in qs:
            updates: dict = {}

            for lang in ('ru', 'en'):
                name_field = f'name_{lang}'
                desc_field = f'description_{lang}'

                if not getattr(product, name_field) or retranslate:
                    label = f'[product {product.pk}] {product.name[:40]!r} → name_{lang}'
                    self._apply_field(
                        updates, name_field, getattr(product, name_field),
                        _translate_text(product.name, lang),
                        label, retranslate,
                    )

                if product.description and (not getattr(product, desc_field) or retranslate):
                    result = _translate_text(product.description, lang)
                    label = f'[product {product.pk}] desc_{lang}'
                    self._apply_field(
                        updates, desc_field, getattr(product, desc_field),
                        result, label, retranslate,
                    )

            if updates and not dry_run:
                Product.objects.filter(pk=product.pk).update(**updates)
                done += 1

        self.stdout.write(self.style.SUCCESS(
            f'Products done — {done} updated (dry_run={dry_run})'
        ))
