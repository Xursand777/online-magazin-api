"""
orders/idempotency.py — Atomic idempotency for POST /api/orders/* endpoints.

NIMA UCHUN BU KERAK?
─────────────────────────────────────────────────────────────────────────────
INTERNET SEKIN — REAL DUNYO MUAMMOSI:

  Xorazm/Urganch mobile internet ko'pincha sekin (3G, 4G past signal).
  Buyurtma berish payti:

  T+0s   Mijoz "Buyurtma berish" tugmasini bosadi
         Browser/mobile: POST /api/orders/from-cart yuboradi
         Server: buyurtma yaratadi, payment yaratadi, history yozadi (~500ms)
  T+1s   Server javob yuborishni boshlaydi
  T+5s   Mobile internet response packetni yo'qotdi (timeout)
  T+8s   Browser: "Connection timeout" → JavaScript exception
  T+10s  Mijoz: "tugma bosilmadi shekilli" → QAYTA bosadi
         Yangi POST yuboriladi
  T+10.5s Server: yangi buyurtma yaratadi (chunki bu yangi so'rov)
         Stock 2 marta minus
         Mijoz 2 ta buyurtma qarzdor

  EHTIMOLLIK (Xorazm 3G/4G muhitida):
    Har 50 ta buyurtmada 1 tasi takrorlanadi (~2%)
    Kuniga 100 ta buyurtma → 2 ta dublikat → oyiga 60 ta dublikat
    Har biri: stock buzilishi + admin manual cancel + mijoz norozi

YECHIM — IDEMPOTENCY KEY:
─────────────────────────────────────────────────────────────────────────────

  Klient har bir buyurtma POST oldidan UUID v4 generatsiya qiladi va
  X-Idempotency-Key header'ida yuboradi:

      X-Idempotency-Key: 7f3e1c8a-2b4d-4f5a-9e6b-1c2d3e4f5a6b

  Server quyidagi qoidaga ko'ra ishlaydi:

    1. Cache'da shu key bormi? (key: bozor:idem:{user_id}:{idem_key})
       └─ HA, value = "processing" → 409 Conflict, "boshqa so'rov ishlamoqda,
                                                     biroz kuting"
       └─ HA, value = {order_id, response}  → ESKI buyurtmani qaytaramiz
                                              (yangi yaratmaymiz)
       └─ YO'Q → davom

    2. cache.add(key, "processing", 60s) — ATOMIK SETNX (Redis SET NX)
       └─ True qaytarsa  → biz birinchi keldik, lock oldik, davom
       └─ False qaytarsa → boshqa worker bizdan oldin lock oldi
                          → 409 Conflict (RETRY-AFTER)

    3. Buyurtma yaratamiz (atomik)

    4. cache.set(key, {order_id, response}, 24h) — natijani saqlash

    5. Xato bo'lsa: cache.delete(key) — keyingi retry bo'sh boshlash

  TIMELINE — yangi mexanizm bilan:
  ────────────────────────────────

  T+0s   Mijoz buyurtma tugmasini bosadi
         Frontend: idem_key = uuid()  (faqat shu safar yaratiladi)
         POST X-Idempotency-Key: 7f3e... yuboriladi
  T+0.5s Server: cache.add('idem:42:7f3e...', 'processing', 60s) → True
         Lock olindi → buyurtma yaratiladi
  T+1s   Buyurtma #123 yaratildi
         cache.set('idem:42:7f3e...', {order_id:123, response:...}, 24h)
         Response qaytariladi
  T+5s   Mobile internet response packetni yo'qotdi
  T+8s   Mijoz timeout ko'radi
  T+10s  Mijoz QAYTA bosadi — frontend O'SHA idem_key bilan yuboradi
         (chunki UUID forma yuborilishidan oldin generatsiya qilingan
         va saqlanib turibdi)
  T+10.5s Server: cache.get('idem:42:7f3e...') → {order_id:123, response:...}
         ESKI buyurtma response'i qaytariladi
         Mijoz: "buyurtma qabul qilindi" deb ko'radi → tinch
         Yangi buyurtma YO'Q
         Stock buzilmadi
         Admin manual cancel kerakmas

RACE CONDITION QARSHILIGI:
─────────────────────────────────────────────────────────────────────────────

  Stsenariy: mijoz tugmani 2 marta TEZ bosadi (T+0 va T+0.1s),
             ikkala so'rov bir vaqtda kelib qoladi.

  Worker A:                          Worker B:
  T+0s   cache.get → bo'sh           cache.get → bo'sh
  T+0.001s cache.add(processing) → T  cache.add(processing) → F (bor)
  T+0.002s order yaratish...          409 Conflict qaytaradi
  T+1s   cache.set(order_id:123)      (qisqa wait orqali frontend
                                       retry → endi cached order
                                       qaytariladi)

  Bu yerda Redis SETNX (cache.add) ATOMIK — ikkalasi bir vaqtda
  True qaytara olmaydi. LocMemCache'da ham xuddi shunday (thread-safe).

KEY HAYOTI:
─────────────────────────────────────────────────────────────────────────────
  processing marker:  60 soniya  — order yaratish maksimal vaqti
  success marker:     24 soat    — mobile internet eng katta retry oynasi
  error rollback:     darhol     — cache.delete

  24 soat: agar mijoz erkin checkout sahifasini ochib qoldirsa va
  ertasiga submit qilsa, idem_key allaqachon "ishlatilgan" deb hisoblanadi.
  Bu UX uchun: 24 soatdan eski idem_key bilan yangi buyurtma yaratish
  ham mantiqsiz (savatdagi tovar, narx o'zgargan bo'lishi mumkin).

XAVFSIZLIK:
─────────────────────────────────────────────────────────────────────────────
  Idempotency key user-scoped (cache key user_id bilan):
    bozor:idem:42:7f3e1c... — faqat user_id=42 uchun

  Tajovuzkor boshqa foydalanuvchining idem_key'ini topib ham, o'z
  user_id'si bilan cache miss bo'ladi → mantiqsiz.

  Cache poisoning: tajovuzkor o'z idem_key'ini saqlab qo'yib, normal
  mijozni "qayta yuborish" stsenariyiga olib kelishi mumkin EMAS —
  chunki user_id'lar farqi.

  UUID v4: 122-bit entropy → collision ehtimoli astronomik kichik.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable, Optional

from django.core.cache import cache

logger = logging.getLogger(__name__)

# Cache key prefiksi va TTL'lar
_IDEM_PREFIX = 'bozor:idem'
_PROCESSING_TTL_SECONDS = 60           # max order yaratish vaqti
_SUCCESS_TTL_SECONDS = 24 * 3600       # 24 soat — mobile retry oynasi
_PROCESSING_MARKER = '__PROCESSING__'

# UUID v4 formati (frontend tomondan crypto.randomUUID yoki uuid v4 paket)
# Bu regex SHA yoki boshqa formatlar bilan adashtirib bo'lmaydi.
_VALID_KEY_RE = re.compile(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)

# Header nomi — REST standartiga muvofiq
HEADER_NAME = 'X-Idempotency-Key'


def _build_cache_key(user_id: int, idem_key: str) -> str:
    return f'{_IDEM_PREFIX}:{user_id}:{idem_key}'


def get_idempotency_key(request) -> Optional[str]:
    """Request header'idan idempotency key olish va format tekshirish.

    Noto'g'ri format yoki yo'q bo'lsa None qaytaradi — bu holat klient
    eski versiya yoki idem_key qo'llab-quvvatlamaydi degan ma'noni
    bildiradi (backwards-compat: idempotency tekshirilmaydi).

    Args:
        request: DRF Request obyekti.

    Returns:
        UUID v4 string formatdagi key yoki None.
    """
    # Django request.META: 'HTTP_X_IDEMPOTENCY_KEY'
    raw = (
        request.META.get('HTTP_X_IDEMPOTENCY_KEY')
        or request.headers.get(HEADER_NAME, '')
    )
    if not raw:
        return None
    raw = raw.strip()
    if not _VALID_KEY_RE.match(raw):
        # Noto'g'ri formatli key — log qilamiz va e'tibor bermaymiz
        # (xavfsiz default: yangi buyurtma yaratiladi; klient log'larini ko'radi)
        logger.warning(
            'Idempotency key noto\'g\'ri formatda: %r (user=%s)',
            raw[:40],
            getattr(request.user, 'id', None),
        )
        return None
    return raw


class IdempotencyConflict(Exception):
    """Boshqa so'rov ayni paytda ishlamoqda. Klient qisqa wait bilan retry qilsin."""

    def __init__(self, message: str = "Boshqa so'rov ishlamoqda. Bir necha soniyada qayta urinib ko'ring."):
        self.message = message
        super().__init__(message)


def acquire_idempotency_lock(user_id: int, idem_key: str) -> tuple[bool, Optional[Any]]:
    """Idempotency lock'ni ATOMIK olishga urinish.

    3 ta holat mumkin:
      (True, None)         — lock olindi, davom etish kerak
      (False, cached_resp) — buyurtma allaqachon yaratilgan, response saqlangan
      → raises IdempotencyConflict — boshqa so'rov hozir ishlamoqda

    Args:
        user_id: Autentifikatsiya qilingan foydalanuvchi ID.
        idem_key: Validate qilingan UUID v4 string.

    Returns:
        (acquired, cached_response) — yuqorida ko'rsatilgan format.

    Raises:
        IdempotencyConflict — boshqa worker hali order yaratayotgan bo'lsa.
    """
    cache_key = _build_cache_key(user_id, idem_key)

    # Cache.add: agar key allaqachon mavjud bo'lmasa True qaytaradi va
    # qiymatni qo'yadi. ATOMIK operatsiya — Redis SETNX, LocMemCache thread-safe.
    acquired = cache.add(cache_key, _PROCESSING_MARKER, timeout=_PROCESSING_TTL_SECONDS)
    if acquired:
        return True, None

    # Lock olib bo'lmadi — kim qaytarayotganligini tekshirish kerak
    existing = cache.get(cache_key)

    if existing == _PROCESSING_MARKER:
        # Boshqa so'rov hozir ishlamoqda — klient biroz kutib qayta yuborsin
        raise IdempotencyConflict()

    if existing is None:
        # Race: lock add qilolmadik, lekin get'da yo'q (TTL o'tdi yoki o'chirildi).
        # Yangi urinish — qayta add qilamiz.
        acquired = cache.add(cache_key, _PROCESSING_MARKER, timeout=_PROCESSING_TTL_SECONDS)
        if acquired:
            return True, None
        # Hali ham olib bo'lmadi (juda kam ehtimol) — conflict
        raise IdempotencyConflict()

    # Cached response — buyurtma allaqachon yaratilgan
    return False, existing


def save_idempotency_response(user_id: int, idem_key: str, response_data: Any) -> None:
    """Buyurtma muvaffaqiyatli yaratilgandan keyin response'ni 24 soatga saqlash."""
    cache_key = _build_cache_key(user_id, idem_key)
    try:
        cache.set(cache_key, response_data, timeout=_SUCCESS_TTL_SECONDS)
    except Exception as exc:
        # Cache yozish xato — buyurtma yaratilgan, lekin idem cached emas.
        # Eng yomon holat: takroriy POST yangi buyurtma yaratadi.
        # Bu eski xulq, regression emas.
        logger.warning('Idempotency cache yozishda xato: %s', exc)


def release_idempotency_lock(user_id: int, idem_key: str) -> None:
    """Xato bo'lganda lock'ni darhol bo'shatish — klient yangi urinishi mumkin."""
    cache_key = _build_cache_key(user_id, idem_key)
    try:
        cache.delete(cache_key)
    except Exception as exc:
        logger.warning('Idempotency lock release xato: %s', exc)
