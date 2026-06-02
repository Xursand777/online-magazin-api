"""
Phase 2.7 (qayta dizayn) — `credit_overdue_pardoned` field'ni o'chirish.

NIMA UCHUN OCHIRYAPMIZ:
    Avvalgi Phase 2.7 dizayni admin'ga har bir buyurtma uchun "ban hisobiga
    kiritmang" tugmasini ko'rsatardi. UX/biznes nuqtai nazaridan bu xato:
      • Har bir kreditli buyurtmada tugma -> admin uchun shovqin.
      • Per-order pardon admin'ga abuzga ochiq -- bir necha pardon bilan
        mijozni cheksiz "qayta tiklash" mumkin edi.
      • Notog'ri abstraktsiya darajasi: admin mijoz haqida o'ylaydi,
        individual buyurtma haqida emas.

    Yangi dizayn: faqat banlangan mijozni Users tab'da "Ban hisobidan
    chiqarish" bilan 1 ta imkoniyatga qaytarish. Bu field endi kerakmas.

DATA-PRESERVING:
    Field'ni darhol drop qilsak, `pardoned=True, counted=False` bo'lgan
    buyurtmalar cron tomonidan qaytadan ban hisobiga kiritilardi (admin'ning
    avvalgi pardon ta'siri yo'qoladi).
    Shu sababli avval data migration: pardoned=True bo'lganlarning
    counted'ini ham True qilamiz (cron ularni o'tkazib yuborsin), keyin
    schema migration field'ni drop qiladi.

REVERSIBILITY:
    Backward migration field'ni qayta qo'shadi, lekin avvalgi qiymatlarni
    tiklay olmaydi (counted=True deb belgilanganlar pardoned=True deb
    qaytarilmaydi). Bu — biz field'dan voz kechganimiz sababli qabul
    qilinadigan kompromis.
"""

from django.db import migrations, models


def preserve_pardon_intent(apps, schema_editor):
    """pardoned=True, counted=False -> counted=True (cron skip qilsin)."""
    Order = apps.get_model('orders', 'Order')
    Order.objects.filter(
        credit_overdue_pardoned=True,
        credit_overdue_counted=False,
    ).update(credit_overdue_counted=True)


def noop_reverse(apps, schema_editor):
    """Data migration teskariga: counted=True qaytarilmaydi (data loss)."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0012_credit_overdue_pardoned_phase_2_7'),
    ]

    operations = [
        migrations.RunPython(preserve_pardon_intent, reverse_code=noop_reverse),
        migrations.RemoveField(
            model_name='order',
            name='credit_overdue_pardoned',
        ),
    ]
