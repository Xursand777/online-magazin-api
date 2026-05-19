import re

from django.contrib.auth import get_user_model

User = get_user_model()

# O'zbekiston telefon raqami standarti: +998 XX XXXXXXX
_UZ_PHONE_RE = re.compile(r'^\+998\d{9}$')


def normalize_phone_number(phone: str) -> str:
    """
    Har qanday UZ telefon formatini +998XXXXXXXXX ga keltiradi.
    9 ta raqam → +998XXXXXXXXX
    998XXXXXXXXX  → +998XXXXXXXXX
    Boshqa → o'zgarishsiz (keyinchalik validate_phone xato beradi)
    """
    digits = re.sub(r'\D', '', (phone or '').strip())
    if len(digits) == 9:
        return f'+998{digits}'
    if len(digits) == 12 and digits.startswith('998'):
        return f'+{digits}'
    return (phone or '').strip()


def is_valid_uz_phone(phone: str) -> bool:
    """Tekshiradi: telefon +998XXXXXXXXX standartiga mos keladi."""
    return bool(_UZ_PHONE_RE.match(phone or ''))


def phone_lookup_variants(phone: str) -> list[str]:
    """
    Barcha mumkin bo'lgan format variantlarini qaytaradi.
    Ma'lumotlar bazasida turli formatda saqlangan raqamlarni topish uchun.
    """
    normalized = normalize_phone_number(phone)
    digits = re.sub(r'\D', '', normalized)
    variants = {normalized}

    if len(digits) == 12 and digits.startswith('998'):
        variants.add(f'+{digits}')   # +998XXXXXXXXX
        variants.add(digits)          # 998XXXXXXXXX  (prefixsiz)
        variants.add(digits[3:])      # XXXXXXXXX     (9 ta raqam)
    elif len(digits) == 9:
        variants.add(f'+998{digits}')
        variants.add(f'998{digits}')
        variants.add(digits)

    return [v for v in variants if v]


def find_user_by_phone(phone: str):
    """Barcha format variantlari bo'yicha foydalanuvchini topadi."""
    return User.objects.filter(phone__in=phone_lookup_variants(phone)).first()
