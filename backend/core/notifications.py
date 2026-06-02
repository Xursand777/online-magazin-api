"""
core/notifications.py — Admin xabarchi tizimi (Telegram orqali).

Bu modul Bozor loyihasining markazlashgan ogohlantirish kanali. Barcha
mavjud alert manbalari (Sentry, UptimeRobot, Eskiz, kam stock, dispute, ...)
shu modul orqali Telegram'ga xabar yuboradi.

ISHLATISH:
    from core.notifications import send_admin_alert, AlertSeverity

    send_admin_alert("Server uxlab qoldi", severity=AlertSeverity.CRITICAL)
    send_admin_alert("Yangi mijoz feedback'i", severity=AlertSeverity.INFO)

XAVFSIZLIK:
    • Token va chat_id `.env` faylda (git'ga tushmaydi)
    • Bot faqat sizning chat'ingizga xabar yuboradi — boshqalar ko'rmaydi
    • Telegram API muvaffaqiyatsiz bo'lsa: log'ga yoziladi, dasturni
      to'xtatmaydi (mission-critical bo'lmagan tizim)

XATOLAR:
    Telegram javob bermasa — Django logger'iga yoziladi. Bu xato'lar
    Sentry'ga ham tushadi (LoggingIntegration orqali). Lekin Sentry'ning
    o'zi ham Telegram orqali xabar berishini istasak — bu cheksiz halqaga
    olib kelmasligi uchun rate-limit mexanizmi bor.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    """
    Xabar darajalari. Har biri uchun emoji va prefiks:
        INFO     🟢 — oddiy xabar (daily digest, yangi feedback)
        WARNING  🟡 — diqqat (kam stock, balans yarmidan kam)
        ERROR    🟠 — kechikkan amal (backup muvaffaqiyatsiz, dispute)
        CRITICAL 🔴 — darhol harakat (server o'chdi, balans tugadi)
    """
    INFO     = ('🟢', 'INFO')
    WARNING  = ('🟡', 'WARNING')
    ERROR    = ('🟠', 'ERROR')
    CRITICAL = ('🔴', 'CRITICAL')

    @property
    def emoji(self) -> str:
        return self.value[0]

    @property
    def label(self) -> str:
        return self.value[1]


@dataclass(frozen=True)
class _TelegramConfig:
    token: str
    chat_id: str
    enabled: bool

    @classmethod
    def from_settings(cls) -> '_TelegramConfig':
        token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        chat_id = getattr(settings, 'TELEGRAM_ADMIN_CHAT_ID', '')
        return cls(
            token=token,
            chat_id=chat_id,
            enabled=bool(token and chat_id),
        )


# ── Rate limit ──────────────────────────────────────────────────────────────
#
# MUAMMO: Sentry → Telegram zanjirida cheksiz halqa xavfi.
#   Telegram API yiqilsa → Sentry'ga ERROR log → Sentry → Telegram (yana yiqilsa)
#
# MUAMMO: Bir xato 1000 marta sodir bo'lsa, 1000 ta xabar tushadi.
#
# YECHIM: Cache asosida `(severity, message_hash)` bo'yicha dedup. Bir xil
# xabar 5 daqiqa ichida qayta yuborilmaydi.
#
_RATE_LIMIT_CACHE_PREFIX = 'bozor:tg_alert:'
_RATE_LIMIT_WINDOW_SEC = 300  # 5 daqiqa


def _make_dedup_key(severity: AlertSeverity, text: str) -> str:
    """
    Xabar uchun dedup kalit. Faqat birinchi 200 belgi hisoblanadi — uzun
    stacktrace'lar har safar boshqa hash bermasligi uchun.
    """
    import hashlib
    digest = hashlib.sha256(text[:200].encode('utf-8')).hexdigest()[:16]
    return f'{_RATE_LIMIT_CACHE_PREFIX}{severity.label}:{digest}'


def _is_duplicate(severity: AlertSeverity, text: str) -> bool:
    """
    Bu xabar oxirgi 5 daqiqada yuborilganmi? `cache.add()` atomik —
    multi-worker holatda bir xil xabar ikki marta yuborilmaydi.
    """
    try:
        key = _make_dedup_key(severity, text)
        # cache.add(): kalit mavjud bo'lmasa True qaytarib qo'yadi (atomik)
        was_new = cache.add(key, '1', timeout=_RATE_LIMIT_WINDOW_SEC)
        return not was_new
    except Exception:
        # Cache yiqilsa: xabarni baribir yuboramiz (xavfsizlik)
        return False


# ── Telegram API ─────────────────────────────────────────────────────────────

# Telegram API limit: xabar uzunligi 4096 belgigacha
_MAX_TELEGRAM_MESSAGE_LEN = 4000  # 96 zaxira (parse_mode markup uchun)


def _format_message(severity: AlertSeverity, text: str) -> str:
    """
    Telegram MarkdownV2 uchun formatlangan xabar yaratadi.
    Markdown maxsus belgilari escape qilinmaydi — text'ni chiqaruvchi qo'yadi.
    Faqat prefiks va environment qo'shiladi.
    """
    env_label = 'PROD' if not settings.DEBUG else 'DEV'
    prefix = f'{severity.emoji} *{severity.label}* — `{env_label}`\n\n'

    body = text
    if len(body) > _MAX_TELEGRAM_MESSAGE_LEN - len(prefix):
        body = body[:_MAX_TELEGRAM_MESSAGE_LEN - len(prefix) - 20] + '\n...(qisqartirildi)'

    return prefix + body


def send_admin_alert(
    text: str,
    severity: AlertSeverity = AlertSeverity.INFO,
    *,
    dedup: bool = True,
    parse_mode: str = 'Markdown',
) -> bool:
    """
    Telegram orqali admin'ga xabar yuboradi.

    PARAMETRLAR:
        text:       Xabar matni. Markdown formati (qalin: *matn*, kod: `kod`)
        severity:   AlertSeverity dan biri (default: INFO)
        dedup:      True bo'lsa, 5 daqiqada bir xil xabar bir marta yuboriladi
        parse_mode: 'Markdown' yoki 'HTML' yoki None

    QAYTARADI:
        True — xabar yuborildi
        False — yuborilmadi (sozlanmagan, network xato, yoki dedup tushib qoldi)

    MISOL:
        send_admin_alert(
            "Buyurtma #1234 dispute holatida",
            severity=AlertSeverity.WARNING,
        )
    """
    config = _TelegramConfig.from_settings()
    if not config.enabled:
        # Sozlanmagan — silently skip (development holati)
        logger.debug('Telegram alert skipped: TELEGRAM_BOT_TOKEN yoki CHAT_ID yo\'q')
        return False

    if dedup and _is_duplicate(severity, text):
        logger.debug('Telegram alert skipped: dedup (5 daqiqa ichida yuborilgan)')
        return False

    message = _format_message(severity, text)

    try:
        response = requests.post(
            f'https://api.telegram.org/bot{config.token}/sendMessage',
            json={
                'chat_id': config.chat_id,
                'text': message,
                'parse_mode': parse_mode,
                'disable_web_page_preview': True,
            },
            timeout=5,  # tarmoq sekin bo'lsa, 5s dan ko'p kutmaymiz
        )
        if response.status_code == 200:
            return True

        # Telegram xato qaytardi
        logger.warning(
            'Telegram alert yuborilmadi: status=%d, body=%s',
            response.status_code,
            response.text[:200],
        )
        return False

    except requests.RequestException as exc:
        # Tarmoq xato — log'ga yozamiz, lekin server ishlashda davom etadi
        logger.warning('Telegram alert tarmoq xatosi: %s', exc)
        return False


# ── Yengil yordamchi funksiyalar ─────────────────────────────────────────────


def alert_info(text: str, **kwargs) -> bool:
    return send_admin_alert(text, severity=AlertSeverity.INFO, **kwargs)


def alert_warning(text: str, **kwargs) -> bool:
    return send_admin_alert(text, severity=AlertSeverity.WARNING, **kwargs)


def alert_error(text: str, **kwargs) -> bool:
    return send_admin_alert(text, severity=AlertSeverity.ERROR, **kwargs)


def alert_critical(text: str, **kwargs) -> bool:
    return send_admin_alert(text, severity=AlertSeverity.CRITICAL, **kwargs)
