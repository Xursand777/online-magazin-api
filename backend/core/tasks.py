"""
core/tasks.py — Cluster darajasidagi Celery tasks (kunlik backup, monitoring).

═══════════════════════════════════════════════════════════════════════════════
NIMA UCHUN INFRA-TASK'LARNI ALOHIDA JOY?

`orders/tasks.py` va `products/tasks.py` — biznes mantig'i. Bu yer (core/)
INFRASTRUKTURA tasklari uchun:
  • backup_db_task — kunlik PostgreSQL backup B2 ga
  • (kelajakda) health_metrics_task, cleanup_audit_logs_task, ...

═══════════════════════════════════════════════════════════════════════════════
NIMA UCHUN GITHUB ACTIONS EMAS, CELERY BEAT?

Eski arxitektura (Render): GitHub Actions cron har 24 soatda Render
PostgreSQL'iga ulanib pg_dump qilardi. DATABASE_URL public bo'lgani uchun
ishlardi.

Yangi arxitektura (Hetzner): PostgreSQL TASHQARI ko'rinmaydi — faqat
docker compose ichki tarmog'ida. GitHub Actions runner unga ULANA OLMAYDI.

Yechim: Celery Beat (allaqachon `beat` konteyneri sifatida ishlamoqda)
har kuni belgilangan vaqtda backup_db_task'ni navbatga qo'yadi. Worker
konteyneri uni bajaradi — DB unga ko'rinadi (ichki tarmoq).

═══════════════════════════════════════════════════════════════════════════════
NIMA UCHUN ALOHIDA TIME LIMIT?

`settings.CELERY_TASK_TIME_LIMIT = 60` (SMS uchun) — backup uchun JUDA KAM.
Katta DB pg_dump'i bir necha daqiqa, gzip+encrypt+upload yana shuncha.
`backup_db_task` uchun `time_limit=2400` (40 daqiqa) — uzun ish.

═══════════════════════════════════════════════════════════════════════════════
NIMA UCHUN RETRY YO'Q?

Backup vaqt-asoslangan: ertaga yangi backup bo'ladi. Bir martalik xato
holatida:
  1. backup_db management command Telegram'ga critical alert yuboradi
  2. Admin manual ravishda `docker compose exec web python manage.py backup_db`
     bilan qayta urinishi mumkin

Retry qilish faqat tarmoq glitch uchun foyda — boshqa xatolar (passphrase
xato, B2 down, DB lock) odatda hal qilish kerak bo'ladi, qayta urinish emas.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Celery o'rnatilmasligi mumkin (eski/dev sozlamalari) — ImportError'ni
# silent ushlaymiz. Bu paket o'rnatilmagan dev muhitida Django start bo'ladi.
try:
    from celery import shared_task

    @shared_task(
        name='core.backup_db_task',
        # 40 daqiqa hard limit — katta DB uchun yetarli zaxira.
        # Soft limit (35 daqiqa) — task graceful tugashga harakat qiladi.
        time_limit=2400,
        soft_time_limit=2100,
        # Bir vaqtning o'zida BIR BACKUP — ikki overlapping qo'yiluv bo'lsa,
        # ikkinchisi rad etiladi (resurs himoyasi).
        bind=True,
        acks_late=True,
        ignore_result=True,
    )
    def backup_db_task(self):
        """
        Kunlik DB backup B2 ga (Celery Beat orqali avtomatik ishga tushadi).

        Bajaradi: `python manage.py backup_db` (boshqaruv komandasi).
        Komanda o'zi xato bo'lsa Telegram critical alert yuboradi va
        non-zero exit code'ni Celery'ga qaytaradi (task FAILED holatda).

        Bunga keyin Sentry (sozlangan bo'lsa) Celery integratsiyasi orqali
        breadcrumb va exception capture qiladi.
        """
        from django.core.management import call_command
        from django.core.management.base import CommandError

        logger.info('backup_db_task: boshlanmoqda (Celery Beat trigger)')

        try:
            # quiet=False — muvaffaqiyatda ham Telegram'ga info alert yuboriladi
            # (admin "backup ishladi" deb bilishi muhim — silent failure xavfli).
            call_command('backup_db')
        except (CommandError, SystemExit) as exc:
            # CommandError — backup_db ichida ko'tarilgan (Telegram alert allaqachon
            # yuborilgan). Re-raise — task FAILED bo'lsin (Celery monitor ko'radi).
            logger.error('backup_db_task: xato (%s)', exc)
            raise
        except Exception as exc:
            # Kutilmagan xato — kod bug yoki konfiguratsiya. Bu yerda ham
            # alert yuborishga harakat qilamiz (asosiy alert yo'qolgan bo'lsa).
            logger.exception('backup_db_task: kutilmagan xato')
            try:
                from core.notifications import alert_critical
                alert_critical(
                    f'BACKUP TASK CRASHED\n\n'
                    f'Kutilmagan xato: `{str(exc)[:300]}`\n'
                    f'Backup BAJARILMADI — manual `python manage.py backup_db` ishga tushiring.'
                )
            except Exception:
                pass
            raise

        logger.info('backup_db_task: muvaffaqiyatli yakunlandi')

except ImportError:
    logger.debug("Celery o'rnatilmagan — backup_db_task mavjud emas.")
