import re

from django.contrib.auth import get_user_model

User = get_user_model()


def normalize_phone_number(phone: str) -> str:
    raw = (phone or '').strip()
    digits = re.sub(r'\D', '', raw)

    if len(digits) == 9:
        return f'+998{digits}'
    if len(digits) == 12 and digits.startswith('998'):
        return f'+{digits}'
    if raw.startswith('+') and len(digits) >= 9:
        return f'+{digits}'
    return raw


def phone_lookup_variants(phone: str) -> list[str]:
    normalized = normalize_phone_number(phone)
    digits = re.sub(r'\D', '', normalized)
    variants = {normalized, digits}

    if digits.startswith('998') and len(digits) == 12:
        variants.add(f'+{digits}')
        variants.add(digits[3:])
    if len(digits) == 9:
        variants.add(f'+998{digits}')
        variants.add(f'998{digits}')

    return [value for value in variants if value]


def find_user_by_phone(phone: str):
    return User.objects.filter(phone__in=phone_lookup_variants(phone)).first()
