"""
Phase 2.8 — User.phone uchun O'zbekiston RegexValidator qo'shish.

Bu validator faqat application darajasida ishlaydi (Django field validator).
DB darajasida saqlanmaydi (Postgres CHECK constraint EMAS) — mavjud
ma'lumotni buzmaydi. Lekin har qanday yangi yozish/yangilash (admin form,
DRF serializer.is_valid(), model.full_clean()) shu validator orqali o'tadi.

Eski admin/super_admin hisoblar (agar invalid format bilan saqlangan bo'lsa)
ishlashda davom etadi, lekin keyingi parol o'zgartirish yoki phone update
paytida yangilanishi kerak.
"""
from django.core.validators import RegexValidator
from django.db import migrations, models
from django.utils.translation import gettext_lazy as _


UZ_PHONE_VALIDATOR = RegexValidator(
    regex=r'^\+998(33|88|90|91|93|94|95|97|98|99)\d{7}$',
    message=(
        "Telefon raqami O'zbekiston standartiga mos kelmaydi. "
        "Format: +998XXXXXXXXX (90, 91, 93, 94, 95, 97, 98, 99, 33, 88)."
    ),
    code='invalid_uz_phone',
)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_auditlog'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='phone',
            field=models.CharField(
                _('Phone number'),
                max_length=15,
                unique=True,
                validators=[UZ_PHONE_VALIDATOR],
                help_text="O'zbekiston telefon raqami: +998XXXXXXXXX",
            ),
        ),
    ]
