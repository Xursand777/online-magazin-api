from decimal import Decimal, InvalidOperation

from django.db import migrations


# ─────────────────────────────────────────────────────────────────────────────
#  Dollar kursini 12000 ga o'rnatish + USD'dagi narxlarni qayta hisoblash.
#
#  Bu data-migration Render (production) release bosqichida AVTOMATIK ishlaydi —
#  shuning uchun deploydan keyin sayt va mobil ilova darrov 12000 kursiga ko'ra
#  narx ko'rsatadi, qo'lda hech narsa qilish shart emas.
#
#  QAT'IY QOIDA:
#    • price (sotuv narxi) va discount_price (chegirma narxi) — qayta hisoblanadi
#    • cost_price (TANNARX) — HECH QACHON o'zgarmaydi (SuperAdmin kiritgan
#      haqiqiy so'm xaridi). Quyida update_fields'ga cost_price umuman kirmaydi.
# ─────────────────────────────────────────────────────────────────────────────

NEW_RATE = Decimal('12000')


def _q(value):
    """USD * kurs → butun so'm (DecimalField max_digits bilan mos)."""
    return (value * NEW_RATE).quantize(Decimal('1'))


def set_rate_and_recalc(apps, schema_editor):
    GlobalSetting = apps.get_model('products', 'GlobalSetting')
    Product = apps.get_model('products', 'Product')
    ProductVariant = apps.get_model('products', 'ProductVariant')

    # 1) Kursni 12000 ga o'rnatamiz (mavjud bo'lsa yangilaymiz).
    GlobalSetting.objects.update_or_create(
        key='usd_rate',
        defaults={'value': '12000', 'description': "1 USD kurs (so'mda)"},
    )

    # 2) USD'da narxlangan mahsulot va variantlarning FAQAT narx + chegirma
    #    narxini qayta hisoblaymiz. Tannarx (cost_price) tegilmaydi.
    for Model in (Product, ProductVariant):
        batch = []
        for obj in Model.objects.filter(price_usd__gt=0):
            try:
                obj.price = _q(obj.price_usd)
                if obj.discount_price_usd:
                    obj.discount_price = _q(obj.discount_price_usd)
            except (InvalidOperation, TypeError):
                continue
            batch.append(obj)
        if batch:
            # cost_price ATAYIN ro'yxatda yo'q — tannarx o'zgarmaydi.
            Model.objects.bulk_update(batch, ['price', 'discount_price'])

    # 3) Kurs keshini tozalaymiz (deploydan keyin darrov 12000 o'qilsin).
    #    Best-effort: kesh sozlanmagan/yetib bo'lmasa migration buzilmaydi.
    try:
        from django.core.cache import cache
        cache.delete('bozor:gs:usd_rate')
    except Exception:
        pass


def noop_reverse(apps, schema_editor):
    # Orqaga qaytarish ma'nosiz (kurs — biznes qiymati). Hech narsa qilmaymiz.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0018_favorite'),
    ]

    operations = [
        migrations.RunPython(set_rate_and_recalc, noop_reverse),
    ]
