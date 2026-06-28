from __future__ import annotations

import logging
import threading
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api'

# Eskiz.uz JWT tokeni 24 soat amal qiladi.
# 23 soatda yangilaymiz → 1 soatlik xavfsizlik marjasi.
# 100 ta SMS bo'lsa, 100 ta login o'rniga — kuniga BITTA login so'rovi.
_ESKIZ_TOKEN_CACHE_KEY = 'bozor:eskiz_token'
_ESKIZ_TOKEN_TTL_SEC   = 23 * 3600  # 82 800 soniya

# Balans tekshiruv kesh — har 30 daqiqada bir marta Eskiz API'ga so'rov
# Balans ko'p tez o'zgarmaydi (faqat SMS yuborilganda kamayadi), shuning
# uchun 30 daqiqa yetarli. SMS yuborilganda balans ozgina kamayadi —
# alert kechikishi maksimum 30 daqiqa, bu joiz.
_ESKIZ_BALANCE_CHECK_KEY = 'bozor:eskiz_balance_checked'
_ESKIZ_BALANCE_TTL_SEC   = 30 * 60  # 30 daqiqa

# O'zbekistonda SMS narxi taxminan 50 UZS (operatorga qarab 40-60 UZS).
# UZS balansidan SMS sonini taxminiy aniqlash uchun ishlatamiz.
# Foydalanuvchi xohlasa ESKIZ_PRICE_PER_SMS env orqali aniqlashi mumkin.
_DEFAULT_PRICE_PER_SMS_UZS = 50.0

# ─────────────────────────────────────────────────────────────────────────────
# SMS SHABLONLARI
# ─────────────────────────────────────────────────────────────────────────────
#
# DIQQAT: Eskiz.uz har bir SMS matnini OLDINDAN moderatsiyadan o'tkazib,
# faqat tasdiqlangan matnlarni yuborishga ruxsat beradi. Matn aynan kabinetga
# kiritilganga AYNAN mos kelishi shart (faqat o'zgaruvchi joylar — {order_id},
# {code} — Eskiz tomonidan "maska" sifatida belgilanadi).
#
# QAYSI SHABLON HOZIRDA TASDIQLANGAN — pastdagi `ESKIZ_APPROVED_STATUSES`
# setiga qarang. Tasdiqlanmagan statuslar uchun matn bu yerda saqlanadi
# (kelajakda yuborish uchun tayyor), lekin yuborilmaydi.
STATUS_SMS_MESSAGES: dict[str, str] = {
    'AWAITING_PAYMENT': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz qabul qilindi. "
        "30 daqiqa ichida karta orqali to'lovni amalga oshiring. 700Mobile.uz"
    ),
    'CONFIRMED': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz tasdiqlandi. "
        "Yig'ib jo'natishga tayyorlanmoqda. 700Mobile.uz"
    ),
    'PACKING': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz yig'ilmoqda. "
        "Tez orada kuryerga topshiriladi. 700Mobile.uz"
    ),
    'SHIPPING': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz yo'lda! "
        "Kuryer siz tomon kelmoqda. 700Mobile.uz"
    ),
    'DELIVERED': (
        # ESKIZ-TEMPLATE: 700Mobile.uz: 00000-buyurtmangizni qabul qilish kodi:
        #                 000000. Kodni faqat kuryerga ayting.
        # Belgilar: 89 → 1 ta SMS. {order_id} → 00000, {code} → 000000 maska.
        # OZGARTIRISH ESKIZDA QAYTA TASDIQLATISHNI TALAB QILADI.
        "700Mobile.uz: {order_id}-buyurtmangizni qabul qilish kodi: {code}. "
        "Kodni faqat kuryerga ayting."
    ),
    'RECEIVED': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz muvaffaqiyatli topshirildi. "
        "Xaridingiz uchun rahmat! 700Mobile.uz"
    ),
    'CANCELLED_BY_USER': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz sizning so'rovingiz bilan bekor qilindi. 700Mobile.uz"
    ),
    'CANCELLED_BY_ADMIN': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz bekor qilindi. "
        "Batafsil ma'lumot uchun biz bilan bog'laning. 700Mobile.uz"
    ),
    'SYSTEM_AUTO_CANCEL': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz to'lov muddati o'tganligi sababli "
        "avtomatik bekor qilindi. 700Mobile.uz"
    ),
}

# ─────────────────────────────────────────────────────────────────────────────
# ESKIZ TASDIQLANGAN SHABLONLAR — PROD GUARDRAIL
# ─────────────────────────────────────────────────────────────────────────────
#
# Eskiz tasdiqlamagan matn yuborilsa API "message not allowed" (403/400) qaytaradi,
# Celery task fail bo'lib 3 marta retry urinishi sodir bo'ladi — bu Eskiz token
# limitiga zarba beradi va xatoliklarni log'larda to'plab qo'yadi.
#
# YECHIM: signal va `send_order_status_sms` darajasida ushbu setdan tashqari
# statuslarni JIM o'tkazib yuboramiz (INFO log, success=True). Mijoz hozircha
# SMS olmaydi — lekin admin panel + real-time order polling orqali xabardor.
#
# YANGI STATUS QO'SHISH (kelajakda Eskiz yana shablon tasdiqlasa):
#   1. Eskiz kabinetida shablon yuborib tasdiqlatish (matn AYNAN
#      STATUS_SMS_MESSAGES'dagiga mos kelishi shart)
#   2. Tasdiqlangach, status nomini bu setga qo'shish
#   3. Smoke test (`./manage.py shell` ichida send_order_status_sms ni chaqirish)
#
# Format: frozenset — mutable hujum vektoridan himoya.
ESKIZ_APPROVED_STATUSES: frozenset = frozenset({
    'DELIVERED',   # Eskiz shablon 2 — qabul kodi (kuryer bilan tasdiqlash)
})


def is_status_sms_approved(status: str) -> bool:
    """
    Ushbu order status SMS shabloni Eskiz tomonidan tasdiqlanganmi.

    True qaytsa — `send_order_status_sms` haqiqiy Eskiz API'ga yuboradi.
    False qaytsa — signal va `send_order_status_sms` ikkalasi ham yuborishni
    jim o'tkazib yuboradi (Celery retry'siz, success=True).
    """
    return status in ESKIZ_APPROVED_STATUSES


def _fetch_fresh_token() -> Optional[str]:
    """Eskiz.uz'dan yangi token oladi va cache'ga saqlaydi."""
    from django.core.cache import cache

    email    = getattr(settings, 'ESKIZ_EMAIL', '')
    password = getattr(settings, 'ESKIZ_PASSWORD', '')
    if not email or not password:
        return None
    try:
        resp = requests.post(
            f'{ESKIZ_BASE_URL}/auth/login',
            data={'email': email, 'password': password},
            timeout=10,
        )
        resp.raise_for_status()
        token = resp.json()['data']['token']
        cache.set(_ESKIZ_TOKEN_CACHE_KEY, token, timeout=_ESKIZ_TOKEN_TTL_SEC)
        logger.info('Eskiz.uz: yangi token olindi, %d soat cache\'da.', _ESKIZ_TOKEN_TTL_SEC // 3600)
        return token
    except Exception as exc:
        logger.error('Eskiz.uz: token olishda xatolik: %s', exc)
        return None


def _get_token() -> Optional[str]:
    """
    Eskiz.uz JWT tokenini qaytaradi.

    Cache mexanizmi:
      • Birinchi chaqiruvda Eskiz.uz'ga HTTP so'rov yuboriladi, token
        23 soat davomida Redis/LocMemCache'da saqlanadi.
      • Keyingi barcha chaqiruvlar (23 soat davomida) cache'dan o'qiydi —
        Eskiz serveriga hech qanday so'rov ketmaydi.
      • 100 ta parallel SMS → 100 ta login o'rniga kuniga 1 ta login.

    Token muddati tugasa (401):
      send_order_status_sms() 401 xatosida cache'ni tozalab qayta urinadi.
    """
    from django.core.cache import cache

    cached = cache.get(_ESKIZ_TOKEN_CACHE_KEY)
    if cached:
        return cached
    return _fetch_fresh_token()


def _invalidate_token() -> None:
    """Token muddati tugagan yoki xato bo'lganda cache'dan o'chiradi."""
    from django.core.cache import cache
    cache.delete(_ESKIZ_TOKEN_CACHE_KEY)
    logger.warning('Eskiz.uz: token cache\'dan o\'chirildi (muddati tugagan yoki xato).')


def _normalize_phone(phone: str) -> str:
    normalized = phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    return normalized.lstrip('+')


# ─────────────────────────────────────────────────────────────────────────────
# OTP — LOGIN SHABLONI (Eskiz tasdiqlaydi)
# ─────────────────────────────────────────────────────────────────────────────
#
# ESKIZ-TEMPLATE: 700Mobile.uz marketga kirish kodingiz: 000000
# Belgilar: 47 (kod bilan) → 1 ta SMS. {code} → 000000 (6 xonali) maska.
#
# DIQQAT: aynan shu matn Eskiz kabinetiga kiritilgan. O'ZGARTIRISH ESKIZDA
# QAYTA TASDIQLATISHNI TALAB QILADI — boshqa matn yuborilsa Eskiz rad etadi.
#
# OTP_DEBUG=True bo'lganda haqiqiy SMS yuborilmaydi (users/views.py:_use_debug_otp).
# Production'da OTP_DEBUG=False qo'yilgach shu shablon avtomatik ishlatiladi.
OTP_SMS_TEMPLATE = "700Mobile.uz marketga kirish kodingiz: {code}"


def _post_sms(token: str, normalized_phone: str, message: str, sender: str) -> requests.Response:
    """SMS yuborish HTTP so'rovi — qayta urinish uchun ajratilgan."""
    return requests.post(
        f'{ESKIZ_BASE_URL}/message/sms/send',
        data={
            'mobile_phone': normalized_phone,
            'message': message,
            'from': sender,
            'callback_url': '',
        },
        headers={'Authorization': f'Bearer {token}'},
        timeout=10,
    )


def send_otp_sms(phone: str, code: str) -> bool:
    """
    Telefon raqamga bir martalik tasdiqlash kodini yuboradi.
    Kod hech qachon log'ga yozilmaydi.

    Token 401 bilan xato qaytarsa: cache tozalanib yangi token bilan bir marta qayta uriniladi.
    """
    sender     = getattr(settings, 'ESKIZ_SENDER', '4546')
    normalized = _normalize_phone(phone)
    message    = OTP_SMS_TEMPLATE.format(code=code)

    for attempt in range(2):   # 0 = oddiy, 1 = token yangilangandan keyin
        token = _get_token()
        if not token:
            logger.warning("Eskiz.uz: OTP SMS yuborilmadi (token yo'q) — telefon=%s", phone)
            return False
        try:
            resp = _post_sms(token, normalized, message, sender)
            if resp.status_code == 401 and attempt == 0:
                # Token muddati tugagan — cache'dan o'chirib yangi token bilan qayta
                _invalidate_token()
                continue
            resp.raise_for_status()
            logger.info("Eskiz.uz: OTP SMS yuborildi — telefon=%s", phone)
            # Muvaffaqiyatli yuborish — balansni fonda tekshirib qo'yamiz
            _check_balance_after_send_async()
            return True
        except Exception as exc:
            logger.error("Eskiz.uz: OTP SMS yuborishda xatolik — %s", exc)
            return False
    return False


def send_order_status_sms(
    phone: str,
    order_id: int,
    status: str,
    *,
    code: Optional[str] = None,
) -> bool:
    """
    Buyurtma holati o'zgarganda mijozga SMS yuboradi.
    Token 401 bilan xato qaytarsa: cache tozalanib yangi token bilan bir marta qayta uriniladi.

    Phase 2.3:
      `code` — DELIVERED template'da ishlatiladi (qabul kodi). Boshqa
      statuslar uchun jim e'tibordan chetda qoldiriladi (template'da
      `{code}` belgisini ishlatmaydi). Bo'sh kelganda '' bilan format
      qilinadi — bu xavfsiz, format() KeyError chiqarmaydi.

    ESKIZ GUARDRAIL:
      `ESKIZ_APPROVED_STATUSES` ichida bo'lmagan statuslar uchun
      jim ravishda True qaytariladi (yuborilmaydi). Sabab — Eskiz
      tasdiqlamagan matn 'message not allowed' bilan rad etiladi va
      Celery 3 marta retry qiladi. Yangi shablon tasdiqlangach setdan
      qo'shilsa kifoya. Return True — Celery retry'ni boshlamaydi.
    """
    # ── 0) ESKIZ GUARDRAIL ───────────────────────────────────────────────────
    # Tasdiqlanmagan shablonlar yuborilsa Eskiz API rad etadi. Bu
    # darajada o'tkazib yuborib, log'larga INFO yozamiz — Celery retry
    # ishga tushmaydi, token limiti behuda sarflanmaydi.
    if not is_status_sms_approved(status):
        logger.info(
            "SMS o'tkazib yuborildi — '%s' shabloni Eskiz tomonidan hozir "
            "tasdiqlanmagan (telefon=%s, buyurtma=#%s). Tasdiqlangach "
            "ESKIZ_APPROVED_STATUSES setiga qo'shing.",
            status, phone, order_id,
        )
        return True

    template = STATUS_SMS_MESSAGES.get(status)
    if not template:
        return False

    try:
        message = template.format(order_id=order_id, code=code or '')
    except KeyError as exc:
        # Noma'lum o'zgaruvchi template'da — bu kod xatosi (yangi template
        # qo'shilganda yangilanmagan parametr). Sentry'ga yuborilsin.
        logger.error(
            "SMS template variable yo'q: status=%s, missing=%s", status, exc
        )
        return False

    sender     = getattr(settings, 'ESKIZ_SENDER', '4546')
    normalized = _normalize_phone(phone)

    for attempt in range(2):   # 0 = oddiy, 1 = token yangilangandan keyin
        token = _get_token()
        if not token:
            logger.warning(
                "Eskiz.uz: SMS yuborilmadi (token yo'q) — telefon=%s, #%s, status=%s",
                phone, order_id, status,
            )
            return False
        try:
            resp = _post_sms(token, normalized, message, sender)
            if resp.status_code == 401 and attempt == 0:
                _invalidate_token()   # muddati tugagan — cache tozala, qayta ur
                continue
            resp.raise_for_status()
            logger.info(
                'Eskiz.uz: SMS yuborildi — telefon=%s, buyurtma=#%s, status=%s',
                phone, order_id, status,
            )
            # Muvaffaqiyatli yuborish — balansni fonda tekshirib qo'yamiz
            _check_balance_after_send_async()
            return True
        except Exception as exc:
            logger.error('Eskiz.uz: SMS yuborishda xatolik — %s', exc)
            return False
    return False


def send_order_status_sms_async(
    phone: str,
    order_id: int,
    status: str,
    *,
    code: Optional[str] = None,
) -> None:
    """Fire-and-forget: SMS ni alohida thread'da yuboradi. HTTP response'ni bloklamaydi."""
    t = threading.Thread(
        target=send_order_status_sms,
        args=(phone, order_id, status),
        kwargs={'code': code},
        daemon=True,
        name=f'sms-order-{order_id}-{status}',
    )
    t.start()


# ────────────────────────────────────────────────────────────────────────────
# ESKIZ BALANS NAZORATI
# ────────────────────────────────────────────────────────────────────────────
#
# MUAMMO:
#   SMS balansi tugaganda OTP login ishlamaydi. Yangi mijozlar ro'yxatdan
#   o'ta olmaydi. Mavjudlar parolini tiklash uchun ham OTP kerak.
#   Bu — silent failure: server ishlayveradi, lekin asosiy oqim sinadi.
#
# YECHIM:
#   Har SMS yuborilgandan keyin balansni tekshirish (30 daqiqa cache bilan):
#     • Balans > warning threshold:  hech narsa
#     • Balans <= warning threshold: 🟡 WARNING alert (Telegram)
#     • Balans <= critical threshold: 🔴 CRITICAL alert (Telegram)
#
# DEDUP:
#   Telegram bot ichida dedup mexanizmi bor (5 daqiqada bir xil xabar 1 marta).
#   30 daqiqa kesh + 5 daqiqa dedup = soatda max 1-2 ta alert.


def _fetch_balance(token: str) -> Optional[float]:
    """
    Eskiz API'dan joriy balansni oladi (UZS da).
    Token muddati tugagan bo'lsa 401 → _invalidate_token() → None qaytaradi
    (chaqiruvchi keyingi safar yangi token bilan qayta urinishi mumkin).
    """
    try:
        resp = requests.get(
            f'{ESKIZ_BASE_URL}/user/get-limit',
            headers={'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        if resp.status_code == 401:
            _invalidate_token()
            return None
        resp.raise_for_status()

        # Eskiz response format: {"data": {"balance": 12345.67}}
        # Ba'zan balans string sifatida keladi — float'ga aylantiramiz
        data = resp.json().get('data', {})
        raw_balance = data.get('balance')
        if raw_balance is None:
            logger.warning("Eskiz get-limit javobida 'balance' yo'q: %s", data)
            return None
        return float(raw_balance)

    except (requests.RequestException, ValueError, KeyError) as exc:
        logger.error('Eskiz balansni olishda xato: %s', exc)
        return None


def get_eskiz_balance(force_refresh: bool = False) -> Optional[float]:
    """
    Eskiz balansini qaytaradi (UZS da, kesh bilan).
    Token yo'q bo'lsa yoki API xato bo'lsa — None.

    force_refresh=True bo'lsa keshni chetlab o'tib HTTP so'rov yuboradi.
    Bu management komandasi yoki manual debug uchun kerak.
    """
    from django.core.cache import cache

    cache_key = 'bozor:eskiz_balance_value'

    if not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    token = _get_token()
    if not token:
        return None

    balance = _fetch_balance(token)
    if balance is not None:
        # Balans qiymatini 30 daqiqa kesh'da saqlaymiz —
        # boshqa modullar qayta-qayta tekshirib turish uchun
        cache.set(cache_key, balance, timeout=_ESKIZ_BALANCE_TTL_SEC)

    return balance


def check_balance_and_alert() -> Optional[float]:
    """
    Eskiz balansini tekshiradi va threshold'dan past bo'lsa Telegram alert
    yuboradi.

    30 daqiqa keshlanadi — har SMS yuborilganda chaqirilsa ham, soatda
    maksimum 2 ta HTTP so'rov ketadi.

    QAYTARADI:
        Balans (UZS) — agar olib bo'lsa
        None — token yo'q yoki API xato bo'lsa
    """
    from django.core.cache import cache

    # Cache hit: yaqinda tekshirilgan, hozir o'tkazib yuboramiz
    if cache.get(_ESKIZ_BALANCE_CHECK_KEY):
        return None

    # Lock o'rnatamiz (atomik) — multi-worker'da bir vaqtda bitta tekshiruv
    cache.set(_ESKIZ_BALANCE_CHECK_KEY, True, timeout=_ESKIZ_BALANCE_TTL_SEC)

    balance = get_eskiz_balance(force_refresh=True)
    if balance is None:
        return None

    warning_threshold = float(getattr(settings, 'ESKIZ_BALANCE_WARNING_THRESHOLD', 50000))
    critical_threshold = float(getattr(settings, 'ESKIZ_BALANCE_CRITICAL_THRESHOLD', 10000))
    price_per_sms = float(getattr(settings, 'ESKIZ_PRICE_PER_SMS', _DEFAULT_PRICE_PER_SMS_UZS))

    # SMS sonini taxminan hisoblash
    approx_sms_count = int(balance / price_per_sms) if price_per_sms > 0 else 0

    # Threshold'larga qarab darajalar
    if balance <= critical_threshold:
        _alert_critical_balance(balance, approx_sms_count)
    elif balance <= warning_threshold:
        _alert_warning_balance(balance, approx_sms_count)

    return balance


def _alert_warning_balance(balance: float, approx_sms_count: int) -> None:
    """🟡 Balans kam — to'ldirish vaqti keldi (lekin shoshilinch emas)."""
    try:
        from core.notifications import alert_warning

        alert_warning(
            f"Eskiz SMS balansi past\n\n"
            f"Hozirgi balans: `{balance:,.0f} UZS`\n"
            f"Taxminiy SMS: ~{approx_sms_count:,} ta\n\n"
            f"To'ldirish: https://my.eskiz.uz"
        )
    except Exception as exc:
        logger.warning('Telegram balans warning alert xato: %s', exc)


def _alert_critical_balance(balance: float, approx_sms_count: int) -> None:
    """🔴 Balans juda kam — DARHOL to'ldirilmasa OTP login ishlamay qoladi."""
    try:
        from core.notifications import alert_critical

        alert_critical(
            f"ESKIZ SMS BALANSI KRITIK PAST!\n\n"
            f"Hozirgi balans: `{balance:,.0f} UZS`\n"
            f"Taxminiy SMS: ~{approx_sms_count:,} ta qoldi\n\n"
            f"DIQQAT: balans tugasa OTP login ishlamaydi —\n"
            f"yangi mijozlar ro'yxatdan o'ta olmaydi.\n\n"
            f"DARHOL to'ldiring: https://my.eskiz.uz"
        )
    except Exception as exc:
        logger.warning('Telegram balans critical alert xato: %s', exc)


def _check_balance_after_send_async() -> None:
    """
    SMS yuborilgandan keyin fire-and-forget tarzda balans tekshirish.
    HTTP javobni bloklamaslik uchun alohida thread'da.
    Cache hit bo'lsa darhol qaytadi — overhead deyarli yo'q.
    """
    t = threading.Thread(
        target=check_balance_and_alert,
        daemon=True,
        name='eskiz-balance-check',
    )
    t.start()
