from __future__ import annotations

import logging
import threading
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api'

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


def _get_token() -> Optional[str]:
    email = getattr(settings, 'ESKIZ_EMAIL', '')
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
        return resp.json()['data']['token']
    except Exception as exc:
        logger.error('Eskiz.uz: token olishda xatolik: %s', exc)
        return None


def _normalize_phone(phone: str) -> str:
    normalized = phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    return normalized.lstrip('+')


# DIQQAT: Eskiz.uz da SMS matn shablonlari oldindan tasdiqlanishi shart.
# Quyidagi OTP shabloni Eskiz kabinetingizda ro'yxatdan o'tkazilgan bo'lishi kerak.
OTP_SMS_TEMPLATE = "Bozor UZ. Tasdiqlash kodi: {code}. Bu kodni hech kimga bermang."


def send_otp_sms(phone: str, code: str) -> bool:
    """Telefon raqamga bir martalik tasdiqlash kodini yuboradi. Kod hech qachon log'ga yozilmaydi."""
    sender = getattr(settings, 'ESKIZ_SENDER', '4546')
    normalized = _normalize_phone(phone)

    token = _get_token()
    if not token:
        logger.warning("Eskiz.uz: OTP SMS yuborilmadi (token yo'q) — telefon=%s", phone)
        return False

    try:
        resp = requests.post(
            f'{ESKIZ_BASE_URL}/message/sms/send',
            data={
                'mobile_phone': normalized,
                'message': OTP_SMS_TEMPLATE.format(code=code),
                'from': sender,
                'callback_url': '',
            },
            headers={'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("Eskiz.uz: OTP SMS yuborildi — telefon=%s", phone)
        return True
    except Exception as exc:
        logger.error("Eskiz.uz: OTP SMS yuborishda xatolik — %s", exc)
        return False


def send_order_status_sms(phone: str, order_id: int, status: str) -> bool:
    template = STATUS_SMS_MESSAGES.get(status)
    if not template:
        return False

    message = template.format(order_id=order_id)
    sender = getattr(settings, 'ESKIZ_SENDER', '4546')
    normalized = _normalize_phone(phone)

    token = _get_token()
    if not token:
        logger.warning(
            'Eskiz.uz: SMS yuborilmadi (token yo\'q) — telefon=%s, buyurtma=#%s, status=%s',
            phone, order_id, status,
        )
        return False

    try:
        resp = requests.post(
            f'{ESKIZ_BASE_URL}/message/sms/send',
            data={
                'mobile_phone': normalized,
                'message': message,
                'from': sender,
                'callback_url': '',
            },
            headers={'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info(
            'Eskiz.uz: SMS yuborildi — telefon=%s, buyurtma=#%s, status=%s',
            phone, order_id, status,
        )
        return True
    except Exception as exc:
        logger.error('Eskiz.uz: SMS yuborishda xatolik — %s', exc)
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
