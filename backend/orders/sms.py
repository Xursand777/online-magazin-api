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

STATUS_SMS_MESSAGES: dict[str, str] = {
    'AWAITING_PAYMENT': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz qabul qilindi. "
        "30 daqiqa ichida karta orqali to'lovni amalga oshiring. Bozor UZ"
    ),
    'CONFIRMED': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz tasdiqlandi. "
        "Yig'ib jo'natishga tayyorlanmoqda. Bozor UZ"
    ),
    'PACKING': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz yig'ilmoqda. "
        "Tez orada kuryerga topshiriladi. Bozor UZ"
    ),
    'SHIPPING': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz yo'lda! "
        "Kuryer siz tomon kelmoqda. Bozor UZ"
    ),
    'DELIVERED': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz yetib keldi. "
        "Naqd to'lovni kuryerga bering. Bozor UZ"
    ),
    'RECEIVED': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz muvaffaqiyatli topshirildi. "
        "Xaridingiz uchun rahmat! Bozor UZ"
    ),
    'CANCELLED_BY_USER': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz sizning so'rovingiz bilan bekor qilindi. Bozor UZ"
    ),
    'CANCELLED_BY_ADMIN': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz bekor qilindi. "
        "Batafsil ma'lumot uchun biz bilan bog'laning. Bozor UZ"
    ),
    'SYSTEM_AUTO_CANCEL': (
        "Hurmatli mijoz, #{order_id}-buyurtmangiz to'lov muddati o'tganligi sababli "
        "avtomatik bekor qilindi. Bozor UZ"
    ),
}


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


# DIQQAT: Eskiz.uz da SMS matn shablonlari oldindan tasdiqlanishi shart.
# Quyidagi OTP shabloni Eskiz kabinetingizda ro'yxatdan o'tkazilgan bo'lishi kerak.
OTP_SMS_TEMPLATE = "Bozor UZ. Tasdiqlash kodi: {code}. Bu kodni hech kimga bermang."


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
            return True
        except Exception as exc:
            logger.error("Eskiz.uz: OTP SMS yuborishda xatolik — %s", exc)
            return False
    return False


def send_order_status_sms(phone: str, order_id: int, status: str) -> bool:
    """
    Buyurtma holati o'zgarganda mijozga SMS yuboradi.
    Token 401 bilan xato qaytarsa: cache tozalanib yangi token bilan bir marta qayta uriniladi.
    """
    template = STATUS_SMS_MESSAGES.get(status)
    if not template:
        return False

    message    = template.format(order_id=order_id)
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
            return True
        except Exception as exc:
            logger.error('Eskiz.uz: SMS yuborishda xatolik — %s', exc)
            return False
    return False


def send_order_status_sms_async(phone: str, order_id: int, status: str) -> None:
    """Fire-and-forget: SMS ni alohida thread'da yuboradi. HTTP response'ni bloklamaydi."""
    t = threading.Thread(
        target=send_order_status_sms,
        args=(phone, order_id, status),
        daemon=True,
        name=f'sms-order-{order_id}-{status}',
    )
    t.start()
