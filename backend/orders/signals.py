import logging

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import OrderHistory
from .tasks import send_order_status_sms_task

logger = logging.getLogger(__name__)

# ── #24 FIX: SMS deduplication ────────────────────────────────────────────────
#
# MUAMMO — POS buyurtmada ikki SMS:
#   AdminPOSOrderView:
#     1. create_order_with_items() → OrderHistory(PENDING → PENDING yoki boshqa)
#     2. order.status = RECEIVED
#        _create_history(to_status=RECEIVED)
#   Bu ikki tarixni birinchi yaratish "yangi status" sifatida signal chaqiradi.
#   Natija: PENDING uchun ham, RECEIVED uchun ham — 2 ta SMS yoki ba'zi
#   holatlarda bir nechta RECEIVED SMS.
#
# YECHIM — Cache-based deduplication lock:
#   Har bir (order_id, to_status) juftligi uchun qisqa TTL (3 soniya) kesh key.
#   Agar birinchi signal kesh key'ini o'rnatsa va 3 soniya ichida xuddi shu
#   (order_id, to_status) uchun signal kelsa — o'tkazib yuboriladi.
#
#   Nima uchun 3 soniya:
#     POS: create → set_status bir nechta millisekund ichida bajariladi.
#     3 soniya — hech qanday legit holat bir vaqtda xuddi shu status uchun
#     ikki signal yuborishiga sabab bo'lmaydi.
#
# MUQOBIL YECHIM (arxitektura):
#   signals.py da SMS yubormasdan, har bir status o'zgarishini qayta
#   ko'rib chiqib (transition_order_status), faqat kerakli holatlarda SMS.
#   Bu yechim signal arxitekturasiga to'sqinlik qilmaydi.
# ─────────────────────────────────────────────────────────────────────────────

_SMS_DEDUP_TTL = 3   # soniya — bu oraliqda xuddi shu (order, status) qayta SMS yubormaymiz
_SMS_DEDUP_PREFIX = 'bozor:sms_sent:'


def _sms_dedup_key(order_id: int, status: str) -> str:
    return f'{_SMS_DEDUP_PREFIX}{order_id}:{status}'


@receiver(post_save, sender=OrderHistory)
def on_order_history_created(sender, instance: OrderHistory, created: bool, **kwargs):
    """
    Buyurtma holati har o'zgarganda mijozga SMS yuboradi.

    #20 FIX: threading.Thread o'rniga Celery task (server restart'da yo'qolmaydi).
    #24 FIX: POS PENDING → RECEIVED bir vaqtda = bir nechta SMS muammosi hal qilindi.

    SMS yuborilish shartlari:
      1. created=True (yangi tarix yozuvi, update emas)
      2. Telefon raqami mavjud
      3. Bu (order_id, to_status) kombinatsiyasi uchun
         _SMS_DEDUP_TTL soniya ichida SMS yuborilmagan (deduplication)
    """
    if not created:
        return
    if getattr(settings, 'IS_TESTING', False):
        return

    order = instance.order
    phone = order.receiver_phone
    if not phone:
        return

    # ── ESKIZ GUARDRAIL ──────────────────────────────────────────────────────
    # Eskiz tasdiqlamagan status SMS shabloni uchun task queuega ham
    # tushmasin — defense-in-depth. `send_order_status_sms` darajasida
    # ham xuddi shu tekshiruv bor (`is_status_sms_approved`); bu yer
    # qo'shimcha qatlam: Celery'ga keraksiz yuk yo'q, dedup keshi
    # ifloslanmaydi, log'lar toza qoladi.
    from .sms import is_status_sms_approved
    if not is_status_sms_approved(instance.to_status):
        logger.debug(
            "SMS signal o'tkazib yuborildi — '%s' Eskiz tomonidan "
            "tasdiqlanmagan (buyurtma=#%s)",
            instance.to_status, order.id,
        )
        return

    # ── #24 FIX: Deduplication lock ──────────────────────────────────────────
    try:
        from django.core.cache import cache

        dedup_key = _sms_dedup_key(order.id, instance.to_status)

        # cache.add() — ATOMIC: agar key allaqachon mavjud bo'lsa False qaytaradi
        # Bu Redis'da SET NX (Not eXists) operatsiyasiga teng
        # Multi-worker'da ham xavfsiz: atomik operatsiya
        was_set = cache.add(dedup_key, '1', timeout=_SMS_DEDUP_TTL)

        if not was_set:
            # Bu status uchun allaqachon SMS yuborildi (3 soniya ichida)
            logger.debug(
                'SMS dedup: o\'tkazib yuborildi — order=#%s, status=%s',
                order.id, instance.to_status,
            )
            return
    except Exception as exc:
        # Cache mavjud bo'lmasa — SMS'ni yuborib yuboramiz (xavfsiz taraf)
        logger.warning('SMS dedup cache xatoligi: %s — SMS baribir yuboriladi', exc)

    # ── #20 FIX: Celery task orqali yuborish ─────────────────────────────────
    # threading.Thread(daemon=True) → server restart'da yo'qoladi
    # Celery task → navbatda saqlanadi, worker qayta ishga tushganda bajaradi
    #
    # Phase 2.3 — DELIVERED status uchun `received_code` SMS template'da
    # ishlatiladi. Boshqa statuslarda kod jim e'tibordan chetda qoldiriladi.
    send_order_status_sms_task(
        phone=phone,
        order_id=order.id,
        status=instance.to_status,
        code=order.received_code,
    )
