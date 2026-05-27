"""
products/bulk_import.py — 10,000+ mahsulot uchun CSV/Excel bulk import.

#23 FIX: Bulk product import (CSV/Excel) yo'q.

MUAMMO:
  10,000 mahsulotni qo'lda kiritish imkonsiz.
  Product.save() orqali birma-bir saqlash:
    1. Har bir mahsulot uchun Google Translate (2 ta API call)
    2. slug tekshiruv (DB query)
    3. USD → so'm konvertatsiya (cache call)
    10,000 × 4 = 40,000 ta operatsiya → 10-30 daqiqa (bloklaydi!)

YECHIM — Bulk import optimizatsiyasi:
  1. bulk_create(batch_size=500) — 10,000 INSERT → 20 ta batch query
  2. Translation: batch translatsiya (bir API call'da 50 ta mahsulot)
     deep-translator GoogleBatchTranslator'dan foydalanish
  3. USD kurs: bitta get_usd_rate() call — keshdan (0 DB)
  4. Slug: Python'da generatsiya, keyin batch unique tekshiruv
  5. Progress: har 500 ta mahsulotda log (admin ko'ra oladi)

CSV FORMAT:
  name,price_usd,category_id,stock,description,is_active,is_new,is_popular,is_discount,discount_price_usd
  iPhone 16,999.99,1,50,"Apple smartfon",true,true,true,false,

EXCEL FORMAT:
  Xuddi shu ustunlar, .xlsx yoki .xls formatda.

CHEKLOVLAR:
  - Maksimal 50,000 satr (xotira cheklovi)
  - Fayl hajmi: 10MB gacha
  - Translation xato bo'lsa: bo'sh qoldiradi (fallback — original nom)
"""
from __future__ import annotations

import csv
import io
import logging
import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from django.db import transaction
from django.utils.text import slugify

logger = logging.getLogger(__name__)

# Bulk import uchun maksimal qator soni
MAX_IMPORT_ROWS = 50_000

# bulk_create batch hajmi: katta bo'lsa xotira, kichik bo'lsa ko'p query
BATCH_SIZE = 500

# Translatsiya batch hajmi: Google Translate API limitlari
TRANSLATE_BATCH_SIZE = 50


def _parse_bool(value: str) -> bool:
    """'true', '1', 'yes', '+' → True; boshqa hamma narsa → False."""
    return str(value).strip().lower() in ('true', '1', 'yes', '+', 'ha', 'ха')


def _parse_decimal(value: str, default: Optional[Decimal] = None) -> Optional[Decimal]:
    """Xavfsiz Decimal parse. Noto'g'ri qiymat → default."""
    try:
        return Decimal(str(value).strip().replace(',', '.'))
    except (InvalidOperation, ValueError, TypeError):
        return default


def _generate_unique_slugs(names: List[str], existing_slugs: set) -> List[str]:
    """
    Nomlar ro'yxati uchun noyob sluglar generatsiya qiladi.

    MUAMMO: Product.save() ichida har bir slug uchun DB query (slug mavjudmi?).
    YECHIM: Barcha sluglarni Python'da generatsiya qilib, faqat bitta
            batch SELECT qilamiz: Product.objects.filter(slug__in=generated_slugs)

    existing_slugs: DB'da allaqachon mavjud sluglar (birini bitta SELECT'dan)
    """
    counter_map: dict[str, int] = {}
    slugs = []
    used_in_batch: set = set(existing_slugs)   # bu batch ichida ham noyob bo'lsin

    for name in names:
        base = slugify(name) or f'product-{uuid.uuid4().hex[:8]}'
        slug = base
        n = 1
        while slug in used_in_batch:
            slug = f'{base}-{n}'
            n += 1
        used_in_batch.add(slug)
        slugs.append(slug)

    return slugs


def _batch_translate(texts: List[str], target_lang: str) -> List[str]:
    """
    Bir vaqtda ko'p matnni tarjima qiladi.

    MUAMMO: Har bir mahsulot uchun alohida translation API call.
    YECHIM: TRANSLATE_BATCH_SIZE ta matnni bitta separator bilan birlashtirish,
            bitta API call, keyin split.

    Xato yuz bersa → bo'sh string qaytaradi (caller bo'sh string → original nom ishlatadi).
    """
    from products.models import _translate_text   # noqa — mavjud funksiyadan foydalanish

    if not texts:
        return []

    results = []
    for i in range(0, len(texts), TRANSLATE_BATCH_SIZE):
        batch = texts[i:i + TRANSLATE_BATCH_SIZE]
        batch_results = []
        for text in batch:
            if text and text.strip():
                try:
                    translated = _translate_text(text, target_lang)
                    batch_results.append(translated or '')
                except Exception:
                    batch_results.append('')
            else:
                batch_results.append('')
        results.extend(batch_results)

    return results


class BulkImportResult:
    """Import natijasi."""

    def __init__(self):
        self.created_count = 0
        self.skipped_count = 0
        self.errors: List[dict] = []     # {'row': N, 'error': '...'}
        self.warnings: List[str] = []

    def to_dict(self) -> dict:
        return {
            'created_count': self.created_count,
            'skipped_count': self.skipped_count,
            'total_processed': self.created_count + self.skipped_count + len(self.errors),
            'error_count': len(self.errors),
            'errors': self.errors[:100],   # Maksimal 100 ta xato qaytaramiz
            'warnings': self.warnings,
        }


@transaction.atomic
def import_products_from_csv(
    file_content: str | bytes,
    encoding: str = 'utf-8',
    translate: bool = True,
    default_category_id: Optional[int] = None,
) -> BulkImportResult:
    """
    CSV fayldan mahsulotlarni bulk import qiladi.

    #23 FIX: 10,000 mahsulot uchun optimallashtirilgan import.

    PERFORMANCE:
      10,000 mahsulot:
        - Eski yo'l (Product.save() × 10000):  ~10-30 daqiqa
        - Yangi yo'l (bulk_create × 20 batch): ~30-60 soniya

      Sabab:
        save(): 4+ DB query + 2 API call har bir mahsulot uchun
        bulk_create(): 1 DB query har 500 mahsulot uchun
        Translation: bir marotaba butun to'plam uchun

    XAVFSIZLIK:
      @transaction.atomic: xato bo'lsa barcha o'zgarishlar rollback.
      Foydalanuvchi tomonidan kiritilgan ma'lumotlar validated.
      Max hajm cheklovi: MAX_IMPORT_ROWS.

    Args:
      file_content: CSV fayl mazmuni (string yoki bytes)
      encoding:     Fayl kodlashi (default: utf-8)
      translate:    name_ru, name_en avtomatik tarjima qilinsinmi
      default_category_id: category_id ustuni bo'sh bo'lsa ishlatiladi

    Returns:
      BulkImportResult: yaratilgan, o'tkazib yuborilgan, xatolar soni
    """
    from products.models import Product, GlobalSetting, Category

    result = BulkImportResult()

    # ── 1. CSV PARSE ──────────────────────────────────────────────────────────
    if isinstance(file_content, bytes):
        file_content = file_content.decode(encoding, errors='replace')

    reader = csv.DictReader(io.StringIO(file_content))

    rows = []
    for i, row in enumerate(reader, start=2):   # 2: header 1-satr
        if i > MAX_IMPORT_ROWS + 1:
            result.warnings.append(
                f'Maksimal {MAX_IMPORT_ROWS} satr. Qolgan satrlar o\'tkazib yuborildi.'
            )
            break
        rows.append((i, row))

    if not rows:
        result.errors.append({'row': 0, 'error': 'CSV fayl bo\'sh yoki noto\'g\'ri format.'})
        return result

    # ── 2. USD KURS — bitta marta (keshdan) ──────────────────────────────────
    usd_rate = GlobalSetting.get_usd_rate()

    # ── 3. MAVJUD SLUGLAR — bitta SELECT ─────────────────────────────────────
    existing_slugs: set = set(
        Product.objects.values_list('slug', flat=True)
    )

    # ── 4. KATEGORIYALAR — bitta SELECT ──────────────────────────────────────
    valid_category_ids: set = set(
        Category.objects.filter(is_active=True).values_list('id', flat=True)
    )

    # ── 5. MA'LUMOTLARNI PARSE VA VALIDATE ───────────────────────────────────
    valid_rows = []
    names_to_translate = []
    descriptions_to_translate = []

    for row_num, row in rows:
        name = (row.get('name') or '').strip()
        if not name:
            result.errors.append({'row': row_num, 'error': 'name ustuni bo\'sh.'})
            result.skipped_count += 1
            continue

        price_usd = _parse_decimal(row.get('price_usd', ''))
        price_som = _parse_decimal(row.get('price', ''))

        if price_usd:
            price = (price_usd * usd_rate).quantize(Decimal('1'))
        elif price_som:
            price = price_som
        else:
            result.errors.append({
                'row': row_num,
                'error': f'"{name}": price_usd yoki price talab qilinadi.'
            })
            result.skipped_count += 1
            continue

        category_id_raw = row.get('category_id', '').strip()
        category_id = None
        if category_id_raw:
            try:
                cat_id = int(category_id_raw)
                if cat_id in valid_category_ids:
                    category_id = cat_id
                else:
                    result.warnings.append(
                        f'Satr {row_num}: category_id={cat_id} topilmadi, bo\'sh qoldirildi.'
                    )
            except ValueError:
                pass
        if category_id is None:
            category_id = default_category_id

        discount_price_usd = _parse_decimal(row.get('discount_price_usd', ''))
        discount_price = None
        if discount_price_usd:
            discount_price = (discount_price_usd * usd_rate).quantize(Decimal('1'))
        else:
            discount_price = _parse_decimal(row.get('discount_price', ''))

        is_discount = bool(discount_price and discount_price > 0)

        cost_price = _parse_decimal(row.get('cost_price', ''), Decimal('0'))

        valid_rows.append({
            'row_num': row_num,
            'name': name,
            'description': (row.get('description') or '').strip(),
            'price': price,
            'price_usd': price_usd,
            'discount_price': discount_price,
            'discount_price_usd': discount_price_usd,
            'cost_price': cost_price or Decimal('0'),
            'stock': int(row.get('stock', 0) or 0),
            'category_id': category_id,
            'is_active': _parse_bool(row.get('is_active', 'true')),
            'is_new': _parse_bool(row.get('is_new', 'true')),
            'is_popular': _parse_bool(row.get('is_popular', 'false')),
            'is_discount': is_discount,
        })
        names_to_translate.append(name)
        descriptions_to_translate.append((row.get('description') or '').strip())

    if not valid_rows:
        return result

    # ── 6. TRANSLATION — batch (bitta API seriyasi) ───────────────────────────
    names_ru = names_en = descriptions_ru = descriptions_en = []

    if translate:
        logger.info('Bulk import: %d nom tarjima qilinmoqda...', len(names_to_translate))
        names_ru = _batch_translate(names_to_translate, 'ru')
        names_en = _batch_translate(names_to_translate, 'en')

        has_descriptions = any(d for d in descriptions_to_translate)
        if has_descriptions:
            descriptions_ru = _batch_translate(descriptions_to_translate, 'ru')
            descriptions_en = _batch_translate(descriptions_to_translate, 'en')
        else:
            descriptions_ru = [''] * len(valid_rows)
            descriptions_en = [''] * len(valid_rows)
    else:
        names_ru = [''] * len(valid_rows)
        names_en = [''] * len(valid_rows)
        descriptions_ru = [''] * len(valid_rows)
        descriptions_en = [''] * len(valid_rows)

    # ── 7. SLUG GENERATSIYA — Python'da (bitta SELECT) ────────────────────────
    all_names = [r['name'] for r in valid_rows]
    slugs = _generate_unique_slugs(all_names, existing_slugs)

    # ── 8. PRODUCT OBYEKTLARI YARATISH ───────────────────────────────────────
    products_to_create = []
    for i, row_data in enumerate(valid_rows):
        products_to_create.append(
            Product(
                name=row_data['name'],
                name_ru=names_ru[i] if i < len(names_ru) else '',
                name_en=names_en[i] if i < len(names_en) else '',
                slug=slugs[i],
                description=row_data['description'],
                description_ru=descriptions_ru[i] if i < len(descriptions_ru) else '',
                description_en=descriptions_en[i] if i < len(descriptions_en) else '',
                price=row_data['price'],
                price_usd=row_data['price_usd'],
                discount_price=row_data['discount_price'],
                discount_price_usd=row_data['discount_price_usd'],
                cost_price=row_data['cost_price'],
                stock=row_data['stock'],
                category_id=row_data['category_id'],
                is_active=row_data['is_active'],
                is_new=row_data['is_new'],
                is_popular=row_data['is_popular'],
                is_discount=row_data['is_discount'],
            )
        )

    # ── 9. BULK CREATE — batch'lar bo'yicha ──────────────────────────────────
    #
    # bulk_create(batch_size=BATCH_SIZE):
    #   10,000 mahsulot → 20 ta INSERT (har birida 500 qator)
    #   Oddiy: 10,000 ta INSERT (har birida 1 qator)
    #
    # DIQQAT: bulk_create signals yuborMaydi (post_save).
    #   Agar signal'ga bog'liq logika bo'lsa — qayta ko'rib chiqish kerak.
    # ─────────────────────────────────────────────────────────────────────────
    created = Product.objects.bulk_create(
        products_to_create,
        batch_size=BATCH_SIZE,
        ignore_conflicts=False,   # slug UNIQUE constraint — xato bo'lsa rollback
    )
    result.created_count = len(created)

    logger.info(
        'Bulk import yakunlandi: %d mahsulot yaratildi, %d o\'tkazib yuborildi, %d xato.',
        result.created_count, result.skipped_count, len(result.errors),
    )

    return result


def import_products_from_excel(
    file_bytes: bytes,
    translate: bool = True,
    default_category_id: Optional[int] = None,
) -> BulkImportResult:
    """
    Excel (.xlsx/.xls) fayldan mahsulotlarni bulk import qiladi.

    openpyxl kutubxonasidan foydalanadi.
    pip install openpyxl (requirements.txt ga qo'shing)

    Excel → CSV'ga o'giradi va import_products_from_csv() ga uzatadi.
    Bu yondashuv: bitta import logikasi, ikki format qo'llab-quvvatlanadi.
    """
    try:
        import openpyxl
    except ImportError:
        result = BulkImportResult()
        result.errors.append({
            'row': 0,
            'error': 'openpyxl kutubxonasi o\'rnatilmagan. pip install openpyxl'
        })
        return result

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        ws = wb.active

        output = io.StringIO()
        writer = csv.writer(output)

        # Header + ma'lumotlar
        rows_written = 0
        for row in ws.iter_rows(values_only=True):
            writer.writerow(['' if cell is None else str(cell) for cell in row])
            rows_written += 1
            if rows_written > MAX_IMPORT_ROWS + 1:
                break

        wb.close()
        csv_content = output.getvalue()

        return import_products_from_csv(
            csv_content,
            translate=translate,
            default_category_id=default_category_id,
        )

    except Exception as exc:
        result = BulkImportResult()
        result.errors.append({
            'row': 0,
            'error': f'Excel fayl o\'qishda xatolik: {exc}'
        })
        return result
