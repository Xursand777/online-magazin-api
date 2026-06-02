import logging
import re

from django.contrib.auth import get_user_model

User = get_user_model()
logger = logging.getLogger(__name__)

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
    Ma'lumotlar bazasida turli formatda saqlangan raqamlarni topish uchun
    (legacy data uchun fallback).

    DIQQAT: Yangi yozuvlar har doim normalize qilinishi shart (serializerlarda).
    Bu funksiya faqat ESKI bazada bo'lishi mumkin bo'lgan format farqlarini
    qoplash uchun. find_user_by_phone() qaror qilishda eng UNIVERSAL formani
    afzal ko'radi (xavfsizlik #1: bir xil shaxsga garantli yo'naltirish).
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
    """
    Telefon raqam bo'yicha foydalanuvchini topadi.

    ── XAVFSIZLIK KRITIK ────────────────────────────────────────────────────────
    Bu funksiya login oqimi uchun ASOSIY foydalanuvchi identifikatsiyasi.
    Agar noto'g'ri foydalanuvchini qaytarsa, login natijada BEGONA SHAXS sifatida
    tizimga kirishga olib keladi (BUG #ACCOUNT_BLEEDING).

    ── ALGORITM ────────────────────────────────────────────────────────────────
    1. Telefonni canonical formatga (+998XXXXXXXXX) keltir
    2. EXACT match orqali qidir → topilsa qaytar (98% holat)
    3. Topilmagandagina legacy format variantlarini ko'r:
       - Agar bitta foydalanuvchi mos kelsa → qaytar
       - Agar BIR NECHTA foydalanuvchi mos kelsa → XAVFSIZ qaror qabul qilish:
         a) Avval canonical formatlilarini afzal ko'r
         b) Hali ham bir nechta bo'lsa — eng eski qayd (pk asc) ni tanla
         c) Logger orqali ogohlantirish — adminga "duplicate phone formats" muammosi

    ── NIMA UCHUN AVVALGI VERSIYA XAVFLI EDI ────────────────────────────────────
    Avvalgi kod:
        return User.objects.filter(phone__in=variants).first()

    `.first()` Django'da `Meta.ordering` bo'yicha tartib qaytaradi. Agar
    `ordering` belgilanmagan bo'lsa — bazaning ichki tartibi (PostgreSQL'da
    seqscan natijasi tartibsiz bo'lishi mumkin). Ya'ni ikki bir xil raqam
    turli formatda saqlangan bo'lsa, login har xil foydalanuvchini tanlashi
    mumkin (race condition kabi xulq).
    """
    canonical = normalize_phone_number(phone)

    # ── Bosqich 1: EXACT match (eng tez va xavfsiz yo'l) ──────────────────────
    if canonical:
        exact = User.objects.filter(phone=canonical).first()
        if exact is not None:
            return exact

    # ── Bosqich 2: Legacy format fallback ─────────────────────────────────────
    variants = phone_lookup_variants(phone)
    matches = list(User.objects.filter(phone__in=variants).order_by('pk'))

    if not matches:
        return None

    if len(matches) == 1:
        return matches[0]

    # ── Bosqich 3: Bir nechta match — canonical formatni afzal ko'r ───────────
    canonical_matches = [u for u in matches if u.phone == canonical]
    if canonical_matches:
        if len(canonical_matches) > 1:
            logger.error(
                "DUPLICATE PHONE [canonical]: %d ta foydalanuvchi bir xil canonical "
                "telefon raqamiga ega. ID lar: %s. Bazada noyoblik buzilgan!",
                len(canonical_matches),
                [u.pk for u in canonical_matches],
            )
        return canonical_matches[0]

    # Canonical format yo'q, faqat legacy variantlar — eng eskisini tanla
    logger.warning(
        "DUPLICATE PHONE [legacy]: '%s' raqami uchun bir nechta foydalanuvchi "
        "topildi (turli formatlarda). ID lar: %s. Eng eskisi (pk=%s) tanlandi. "
        "Bazani tozalash kerak (telefon raqamlarini normalize qilish).",
        canonical,
        [u.pk for u in matches],
        matches[0].pk,
    )
    return matches[0]
