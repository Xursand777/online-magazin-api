"""
core/celery.py — Celery application konfiguratsiyasi.

#20 FIX: Celery/background tasks.

O'RNATISH:
  pip install celery[redis]

ISHGA TUSHIRISH:
  # Avval Redis ishga tushirish kerak:
  #   brew install redis && brew services start redis   (macOS)
  #   sudo apt install redis-server && sudo systemctl start redis  (Ubuntu)

  # Development:
  celery -A core worker --loglevel=info

  # Production (supervisor bilan):
  celery -A core worker --loglevel=info --concurrency=4 --queues=default,sms

MONITORING:
  pip install flower
  celery -A core flower --port=5555

SCHEDULED TASKS (Beat):
  celery -A core beat --loglevel=info

Celery'ni REDIS_URL env var bilan boshqarish:
  REDIS_URL=redis://127.0.0.1:6379/0 python manage.py runserver
"""
import os

from django.apps import apps

try:
    from celery import Celery

    # Django settings module'ni Celery'ga bildirish
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

    app = Celery('bozor')

    # settings.py'dagi CELERY_ prefiksli sozlamalarni o'qish
    app.config_from_object('django.conf:settings', namespace='CELERY')

    # Barcha INSTALLED_APPS dagi tasks.py fayllarni avtomatik topish
    app.autodiscover_tasks()

    @app.task(bind=True, ignore_result=True)
    def debug_task(self):
        """Celery ishlayotganini tekshirish uchun test task."""
        import logging
        logging.getLogger(__name__).info(
            'Request: %r — Celery ishlayapti!', self.request
        )

except ImportError:
    # Celery o'rnatilmagan — xato ko'rsatmaymiz, faqat log
    import logging
    logging.getLogger(__name__).info(
        'Celery o\'rnatilmagan. SMS threading orqali yuboriladi. '
        'Celery o\'rnatish: pip install celery[redis]'
    )
    app = None
