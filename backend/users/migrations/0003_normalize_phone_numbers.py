"""
Barcha mavjud foydalanuvchi telefon raqamlarini +998XXXXXXXXX formatiga keltiradi.
Turli formatlarda saqlangan raqamlar (911234567, 998911234567, +998 91 123 45 67 va h.k.)
standart ko'rinishga o'tkaziladi.
"""
import re
from django.db import migrations


def _to_standard(phone: str):
    """
    Har qanday UZ telefon raqamini +998XXXXXXXXX ga keltiradi.
    Agar normalize qilib bo'lmasa None qaytaradi.
    """
    digits = re.sub(r'\D', '', (phone or '').strip())
    if len(digits) == 9:
        return f'+998{digits}'
    if len(digits) == 12 and digits.startswith('998'):
        return f'+{digits}'
    # Agar 13 ta raqam bo'lib 998 bilan boshlansa (masalan noto'g'ri kiritilgan)
    if len(digits) == 13 and digits.startswith('998'):
        return f'+{digits[:12]}'
    return None


def normalize_phones_forward(apps, schema_editor):
    User = apps.get_model('users', 'User')
    updated = 0
    skipped = 0

    for user in User.objects.all().order_by('id'):
        phone = user.phone or ''
        standard = _to_standard(phone)

        if standard is None:
            # Normalize qilib bo'lmaydi — shu holda qoladi
            skipped += 1
            continue

        if standard == phone:
            # Allaqachon to'g'ri formatda
            continue

        # Conflict tekshiruvi: boshqa foydalanuvchida bu raqam bormi?
        if User.objects.filter(phone=standard).exclude(pk=user.pk).exists():
            skipped += 1
            continue

        # username ham phone bilan bir xil bo'lgan bo'lsa — uni ham yangilaymiz
        update_fields = ['phone']
        user.phone = standard
        if user.username in (phone, phone.replace('+', ''), phone.replace(' ', '')):
            user.username = standard
            update_fields.append('username')

        user.save(update_fields=update_fields)
        updated += 1

    print(f"\n[phone normalization] Updated: {updated}, Skipped: {skipped}")


def normalize_phones_reverse(apps, schema_editor):
    # Qaytarish mumkin emas — asl qiymatlar saqlanmagan
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_credit_fields'),
    ]

    operations = [
        migrations.RunPython(normalize_phones_forward, normalize_phones_reverse),
    ]
