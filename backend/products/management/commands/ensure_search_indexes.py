"""
pg_trgm GIN qidiruv indekslarini KAFOLATLAYDI — katta katalog (100k+ mahsulot)
uchun tez `ILIKE '%term%'` (`__icontains`) qidiruvi.

┌─ NEGA KERAK ────────────────────────────────────────────────────────────────┐
│ Qidiruv `__icontains` (LIKE '%term%') ishlatadi. Boshida wildcard bo'lgani    │
│ uchun oddiy B-tree indeks ishlamaydi — PostgreSQL har safar TO'LIQ jadval     │
│ skan qiladi (seq scan). ~90 mahsulotda bu bir zumda; 100k+ da sekinlashadi.   │
│ pg_trgm matnni 3-harfli bo'laklarga (trigram) ajratadi va GIN indeks orqali   │
│ ixtiyoriy-wildcard LIKE'ni TEZ bajaradi.                                       │
└──────────────────────────────────────────────────────────────────────────────┘

BU BUYRUQ vs MIGRATION 0020:
  • 0020_product_search_trgm_indexes — deploy paytida indekslarni yaratadi
    (bloklovchi `CREATE INDEX`; kichik jadvalda bir zumda). Bu — asosiy manba.
  • BU BUYRUQ — JONLI, KATTA jadval uchun OPERATSION vosita:
      1. `CREATE INDEX CONCURRENTLY` — yozuvlarni BLOKLAMAYDI (zero-downtime).
      2. INVALID (yarim qurilib qolgan) indekslarni aniqlab, tozalab qayta quradi.
      3. `--check` — faqat holatni tekshiradi; yetishmasa/nosog' bo'lsa exit 1
         (deploy sanity yoki cron monitoring uchun).

XAVFSIZLIK / PORTATIVLIK (juda muhim):
  • FAQAT PostgreSQL. Lokal SQLite (dev/test) — toza no-op. SQLite pg_trgm/GIN'ni
    qo'llab-quvvatlamaydi.
  • Barcha DDL `IF [NOT] EXISTS` — idempotent, qayta ishga tushsa ham xato yo'q.
  • `CONCURRENTLY` tranzaksiya ichida ishlamaydi → biz autocommit'da ishlaymiz
    (Django management buyrug'i sukut bo'yicha atomic emas; qo'shimcha kafolat
    uchun aniq autocommit'ga o'tkazamiz).
  • Indeks nomi/jadval/ustun ro'yxati KOD ichida qat'iy (foydalanuvchi kiritmaydi)
    → SQL-injection yuzasi yo'q.

INDEKS IFODASI — `UPPER(col)` (oddiy `col` emas):
  Django PostgreSQL'da `__icontains` ni `UPPER(col) LIKE UPPER(%s)` ko'rinishida
  generatsiya qiladi. Shuning uchun indeks AYNAN `UPPER(col)` ifodasiga mos
  bo'lishi shart; aks holda planner uni ishlatmaydi. (0020 bilan bir xil.)

KATEGORIYA NOMI ATAYIN QO'SHILMAGAN:
  `category__name__icontains` ham qidiruvda bor, LEKIN kategoriyalar jadvali
  kichik (~25 qator) — u yerda seq scan allaqachon bir zumda. Kichik lookup
  jadvaliga trgm indeks qo'shish — ortiqcha yozuv yuki, foyda yo'q (over-index).
"""
from django.core.management.base import BaseCommand
from django.db import connection


# ── Yagona manba: qidiruvda `__icontains` ishlatiladigan HAMMA ustun ──────────
# (nomi, jadval, ustun) — nomlar 0020 bilan bir xil → `IF NOT EXISTS` ziddiyatsiz.
# Qidiruv manbalari: products/views.py — ProductSearchView._search_cards,
# AdminProductViewSet.get_queryset, build_product_search_filter.
TRGM_INDEXES = (
    ('prod_name_trgm',  'products_product',        'name'),
    ('prod_slug_trgm',  'products_product',        'slug'),
    ('prod_desc_trgm',  'products_product',        'description'),
    ('pv_sku_trgm',     'products_productvariant', 'sku'),
    ('pv_barcode_trgm', 'products_productvariant', 'barcode'),
    ('pv_color_trgm',   'products_productvariant', 'color'),
    ('pv_quality_trgm', 'products_productvariant', 'quality'),
    ('pv_model_trgm',   'products_productvariant', 'model'),
    ('pv_size_trgm',    'products_productvariant', 'size'),
)


class Command(BaseCommand):
    help = (
        "pg_trgm qidiruv indekslarini kafolatlaydi (CONCURRENTLY, zero-downtime). "
        "--check bilan faqat tekshiradi (yetishsa exit 1). SQLite'da no-op."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--check',
            action='store_true',
            help="Faqat holatni tekshiradi, hech narsa yaratmaydi. "
                 "Biror indeks yo'q yoki nosog' bo'lsa exit kodi 1.",
        )

    # ── Yordamchilar ─────────────────────────────────────────────────────────
    @staticmethod
    def _extension_present(cursor):
        cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
        return cursor.fetchone() is not None

    @staticmethod
    def _index_state(cursor, name):
        """'missing' | 'invalid' | 'valid' — indisvalid orqali sog'ligini ham biladi."""
        cursor.execute(
            "SELECT i.indisvalid "
            "FROM pg_class c "
            "JOIN pg_index i ON i.indexrelid = c.oid "
            "WHERE c.relkind = 'i' AND c.relname = %s",
            [name],
        )
        row = cursor.fetchone()
        if row is None:
            return 'missing'
        return 'valid' if row[0] else 'invalid'

    # ── Asosiy ─────────────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        if connection.vendor != 'postgresql':
            self.stdout.write(self.style.WARNING(
                f"Backend '{connection.vendor}' — pg_trgm faqat PostgreSQL uchun. "
                "Hech narsa qilinmadi (no-op)."
            ))
            return

        check_only = opts['check']

        # CONCURRENTLY tranzaksiya ichida ishlamaydi — autocommit kafolatlaymiz.
        prev_autocommit = connection.get_autocommit()
        if not prev_autocommit:
            connection.set_autocommit(True)

        problems = []  # --check uchun: nosog'/yo'q indekslar
        try:
            with connection.cursor() as cursor:
                # 1) Extension
                if self._extension_present(cursor):
                    self.stdout.write(self.style.SUCCESS("✓ pg_trgm extension mavjud"))
                elif check_only:
                    problems.append("pg_trgm extension YO'Q")
                    self.stdout.write(self.style.ERROR("✗ pg_trgm extension YO'Q"))
                else:
                    cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
                    self.stdout.write(self.style.SUCCESS("＋ pg_trgm extension yaratildi"))

                # 2) Har bir indeks
                for name, table, col in TRGM_INDEXES:
                    state = self._index_state(cursor, name)

                    if state == 'valid':
                        self.stdout.write(self.style.SUCCESS(f"✓ {name} ({table}.{col}) — sog'"))
                        continue

                    if check_only:
                        problems.append(f"{name} → {state}")
                        style = self.style.ERROR if state == 'missing' else self.style.WARNING
                        self.stdout.write(style(f"✗ {name} ({table}.{col}) — {state}"))
                        continue

                    # INVALID indeksni avval tozalaymiz (CONCURRENTLY qayta qurish uchun).
                    if state == 'invalid':
                        cursor.execute(f'DROP INDEX CONCURRENTLY IF EXISTS "{name}"')
                        self.stdout.write(self.style.WARNING(
                            f"↻ {name} nosog' edi — tozalandi, qayta quriladi"))

                    cursor.execute(
                        f'CREATE INDEX CONCURRENTLY IF NOT EXISTS "{name}" '
                        f'ON "{table}" USING gin (UPPER("{col}") gin_trgm_ops)'
                    )
                    self.stdout.write(self.style.SUCCESS(
                        f"＋ {name} ({table}.{col}) — yaratildi (CONCURRENTLY)"))
        finally:
            if not prev_autocommit:
                connection.set_autocommit(False)

        # 3) Yakun
        if check_only and problems:
            self.stderr.write(self.style.ERROR(
                f"\n{len(problems)} ta muammo topildi — indekslarni yaratish uchun "
                "`python manage.py ensure_search_indexes` ni ishga tushiring."
            ))
            raise SystemExit(1)

        self.stdout.write(self.style.SUCCESS(
            "\n✅ pg_trgm qidiruv indekslari to'liq va sog' — qidiruv tez ishlaydi."
        ))
