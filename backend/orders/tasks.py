"""
orders/tasks.py — Celery background tasks.

#20 FIX: Celery/background tasks yo'q.

MUAMMO — threading.Thread (mavjud yechim):
  send_order_status_sms_async() → threading.Thread(daemon=True).start()
  daemon=True: server to'xtaganda (gunicorn restart, SIGTERM) barcha
  daemon threadlar DARHOL o'ldiriladi. Yuborilmagan SMS yo'qoladi.
  Server tez-tez restart bo'lsa (deploy, xatolik), SMS yo'qoladi.
  Ko'p SMS yuborishda thread pool nazorat qilinmaydi → memory pressure.

YECHIM — Celery:
  Celery worker alohida jarayon sifatida ishlaydi.
  Task navbatda (Redis/RabbitMQ) saqlanadi — server restart bo'lsa ham
  worker qayta ishga tushganda navbatdagi taskni bajaradi.
  Retry logikasi built-in: SMS xatoligida 3 marta qayta urinadi.
  Monitoring: Flower, Celery Beat, Django admin orqali.

O'RNATISH:
  pip install celery redis

  # core/celery.py yaratish:
  from celery import Celery
  app = Celery('bozor')
  app.config_from_object('django.conf:settings', namespace='CELERY')
  app.autodiscover_tasks()

  # core/__init__.py:
  from .celery import app as celery_app
  __all__ = ('celery_app',)

  # settings.py qo'shish:
  CELERY_BROKER_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
  CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
  CELERY_ACCEPT_CONTENT = ['json']
  CELERY_TASK_SERIALIZER = 'json'
  CELERY_RESULT_SERIALIZER = 'json'
  CELERY_TIMEZONE = 'Asia/Tashkent'

  # Ishga tushirish:
  celery -A core worker --loglevel=info
  celery -A core beat --loglevel=info  # scheduled tasks uchun

THREADING FALLBACK:
  Agar Celery o'rnatilmagan bo'lsa (settings'da CELERY_BROKER_URL yo'q),
  eski threading.Thread yechimiga avtomatik qaytadi.
  Bu migration davri uchun qulay — eski kod ishlashda davom etadi.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _is_celery_available() -> bool:
    """
    Celery broker sozlanganini tekshiradi.
    CELERY_BROKER_URL settings'da bo'lsa True qaytaradi.
    """
    try:
        from django.conf import settings
        return bool(getattr(settings, 'CELERY_BROKER_URL', ''))
    except Exception:
        return False


def send_order_status_sms_task(phone: str, order_id: int, status: str) -> None:
    """
    SMS yuborish — Celery task yoki threading fallback.

    #20 FIX: threading.Thread(daemon=True) o'rniga Celery task.

    Celery mavjud bo'lsa: navbatga qo'shiladi, worker bajaradi.
    Celery yo'q bo'lsa:    eski threading.Thread fallback.

    Celery task parametrlari:
      max_retries=3:     3 marta muvaffaqiyatsiz bo'lsa, task fail bo'ladi.
      countdown=5:       Birinchi retry 5 soniyadan keyin (Eskiz.uz yukini kamaytirish).
      countdown=60:      Ikkinchi retry 60 soniyadan keyin.
      acks_late=True:    Task muvaffaqiyatli bajarilgandan KEYIN ack yuboriladi
                         (worker o'lsa, task qayta bajariladi).
    """
    if _is_celery_available():
        try:
            _send_sms_celery_task.delay(phone=phone, order_id=order_id, status=status)
            logger.debug(
                'SMS task navbatga qo\'shildi — telefon=%s, buyurtma=#%s, status=%s',
                phone, order_id, status,
            )
            return
        except Exception as exc:
            # Celery ulanmasa — fallback'ga o'tamiz
            logger.warning(
                'Celery task yuborishda xatolik, threading fallback: %s', exc
            )

    # ── Fallback: threading.Thread ────────────────────────────────────────────
    # Celery o'rnatilmagan yoki broker mavjud bo'lmagan muhitlar uchun
    import threading
    from .sms import send_order_status_sms

    t = threading.Thread(
        target=send_order_status_sms,
        args=(phone, order_id, status),
        daemon=True,
        name=f'sms-order-{order_id}-{status}',
    )
    t.start()
    logger.debug(
        'SMS thread boshlandi (fallback) — telefon=%s, buyurtma=#%s, status=%s',
        phone, order_id, status,
    )


try:
    # Celery o'rnatilgan bo'lsa, real Celery task yaratamiz
    from celery import shared_task

    @shared_task(
        bind=True,
        name='orders.send_order_status_sms',
        max_retries=3,
        default_retry_delay=5,     # birinchi retry 5 soniyadan keyin
        acks_late=True,            # task bajarilgandan KEYIN ack
        ignore_result=True,        # natija saqlanmaydi (fire-and-forget)
    )
    def _send_sms_celery_task(self, phone: str, order_id: int, status: str) -> None:
        """
        Celery SMS task.

        acks_late=True: Worker crash bo'lsa, navbat taskni qayta beradi.
        max_retries=3:  Eskiz.uz vaqtinchalik ishlamay qolsa — 3 marta urinish.

        Retry sabablari:
          - Eskiz.uz API vaqtinchalik ishlamay qolsa (503, timeout)
          - Token eskirgan (401) — sms.py ichida ham retry bor, lekin task darajasida ham

        Countdown strategy:
          1-retry: 5 soniya (tez qayta urinish)
          2-retry: 60 soniya (Eskiz.uz qayta tiklanishini kutish)
          3-retry: 300 soniya (5 daqiqa)
        """
        from .sms import send_order_status_sms

        try:
            success = send_order_status_sms(
                phone=phone,
                order_id=order_id,
                status=status,
            )
            if not success:
                # SMS yuborilmadi — retry
                retry_count = self.request.retries
                countdown = [5, 60, 300][min(retry_count, 2)]
                raise self.retry(
                    exc=RuntimeError(f'SMS yuborilmadi — telefon={phone}, status={status}'),
                    countdown=countdown,
                )
        except self.MaxRetriesExceededError:
            logger.error(
                'SMS task: maksimal urinish soni tugadi — '
                'telefon=%s, buyurtma=#%s, status=%s',
                phone, order_id, status,
            )
        except Exception as exc:
            retry_count = self.request.retries
            countdown = [5, 60, 300][min(retry_count, 2)]
            logger.warning(
                'SMS task xatolik, retry=%d, countdown=%ds — %s',
                retry_count, countdown, exc,
            )
            raise self.retry(exc=exc, countdown=countdown)

    @shared_task(name='orders.auto_cancel_expired_orders_task')
    def auto_cancel_expired_orders_task():
        """
        Background task to cancel expired pending orders.
        Triggered periodically by Celery Beat.
        """
        from .services import auto_cancel_expired_orders
        auto_cancel_expired_orders()


except ImportError:
    # Celery o'rnatilmagan — fallback faqat threading orqali ishlaydi
    def _send_sms_celery_task(*args, **kwargs):
        pass

    logger.debug('Celery o\'rnatilmagan. SMS threading orqali yuboriladi.')
