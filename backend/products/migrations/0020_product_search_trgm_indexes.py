"""
#N9 — Admin qidiruvini tezlashtirish: pg_trgm GIN indekslari.

MUAMMO:
  AdminProductViewSet.get_queryset() qidiruvi `__icontains` (LIKE '%term%')
  ishlatadi. Boshida wildcard bo'lgani uchun oddiy B-tree indeks ishlamaydi —
  PostgreSQL HAR safar to'liq jadval skan qiladi (seq scan). Katalog kattalashsa
  (minglab mahsulot/variant) admin qidiruvi sekinlashadi.

YECHIM — pg_trgm (trigram) GIN indekslari:
  pg_trgm matnni 3-harfli bo'laklarga (trigram) ajratadi va GIN indeks orqali
  `LIKE/ILIKE '%term%'` (ixtiyoriy wildcard) so'rovlarini TEZ bajaradi.

KUCHLI LOGIKA — NEGA `UPPER(col)` IFODA-INDEKSI (oddiy `col` emas):
  Django PostgreSQL'da `__icontains` ni `UPPER(col) LIKE UPPER(%s)` ko'rinishida
  generatsiya qiladi (registrga sezgir emas qidiruv uchun). Shuning uchun indeks
  AYNAN shu ifodaga — `UPPER(col)` ga — mos bo'lishi kerak; aks holda planner
  uni ishlatmaydi. Oddiy `gin(col gin_trgm_ops)` indeksi BU YERDA ISHLAMAYDI.

XAVFSIZLIK / PORTATIVLIK:
  • FAQAT PostgreSQL'da bajariladi. Lokal SQLite'da (dev/test) — to'liq no-op
    (vendor tekshiruvi). SQLite GIN/pg_trgm'ni qo'llab-quvvatlamaydi.
  • `IF NOT EXISTS` — qayta ishga tushsa ham xato bermaydi (idempotent).
  • `pg_trgm` — keng tarqalgan, Render Postgres'da mavjud "trusted" extension.
"""
from django.db import migrations


# (indeks_nomi, jadval, ustun) — Django `UPPER(col) LIKE` ifodasiga mos indeks.
TRGM_INDEXES = [
    ('prod_name_trgm',    'products_product',        'name'),
    ('prod_slug_trgm',    'products_product',        'slug'),
    ('prod_desc_trgm',    'products_product',        'description'),
    ('pv_sku_trgm',       'products_productvariant', 'sku'),
    ('pv_barcode_trgm',   'products_productvariant', 'barcode'),
    ('pv_color_trgm',     'products_productvariant', 'color'),
    ('pv_quality_trgm',   'products_productvariant', 'quality'),
    ('pv_model_trgm',     'products_productvariant', 'model'),
    ('pv_size_trgm',      'products_productvariant', 'size'),
]


def create_trgm_indexes(apps, schema_editor):
    # Faqat PostgreSQL — SQLite/boshqa backend'da hech narsa qilmaymiz.
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        for name, table, col in TRGM_INDEXES:
            cursor.execute(
                f'CREATE INDEX IF NOT EXISTS {name} '
                f'ON {table} USING gin (UPPER({col}) gin_trgm_ops)'
            )


def drop_trgm_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        for name, _table, _col in TRGM_INDEXES:
            cursor.execute(f'DROP INDEX IF EXISTS {name}')


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0019_set_usd_rate_12000'),
    ]

    operations = [
        migrations.RunPython(create_trgm_indexes, drop_trgm_indexes),
    ]
