"""
Eski AuditLog yozuvlarini o'chirish komandasi.

ISHLATISH:
    python manage.py purge_old_audit_logs              # 180 kun
    python manage.py purge_old_audit_logs --days 90    # 90 kun
    python manage.py purge_old_audit_logs --dry-run    # sanab beradi

QACHON ISHLATILADI:
    • Har oy/chorak — qo'lda yoki cron orqali
    • DB hajmi oshib ketganda
    • GDPR-stil "right to be forgotten" so'rovida (qisman)

CRON SOZLAMA (production'da):
    GitHub Actions yoki Celery Beat:
      • Har oy 1-chislo, 03:00 UTC
      • python manage.py purge_old_audit_logs --days 180

DIQQAT:
    Audit log — yuridik kuchga ega bo'lishi mumkin (mijoz disput,
    ichki tergov, soliq audit). 6 oydan kam saqlash xavfli.
    Default 180 kun — minimal tavsiya etilgan muddat.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from users.models import AuditLog


class Command(BaseCommand):
    help = "Eski AuditLog yozuvlarini o'chiradi (default 180 kun)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=180,
            help="Shu kundan eski yozuvlar o'chiriladi (default: 180)",
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Hech narsa o'chirilmaydi, faqat sanab beradi",
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']

        if days < 30:
            self.stderr.write(self.style.WARNING(
                f"⚠️  {days} kun juda qisqa muddat. Audit log yuridik\n"
                f"   sabablar bilan kamida 90-180 kun saqlanishi tavsiya etiladi.\n"
                f"   Davom etish uchun komandani qaytadan ishga tushiring."
            ))
            return

        cutoff = timezone.now() - timedelta(days=days)
        qs = AuditLog.objects.filter(created_at__lt=cutoff)
        count = qs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS(
                f"✅ {days} kundan eski AuditLog yozuvi yo'q."
            ))
            return

        # Eng eski yozuv vaqti — foydalanuvchiga ko'rsatish
        oldest = qs.order_by('created_at').first()
        self.stdout.write(
            f"\nO'chirilishi mumkin bo'lgan yozuvlar:\n"
            f"  Soni:      {count:,}\n"
            f"  Sana'dan:  {oldest.created_at.strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"  Sana'gacha: {cutoff.strftime('%Y-%m-%d %H:%M UTC')}\n"
        )

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"[DRY RUN] Hech narsa o'chirilmadi.\n"
                f"O'chirish uchun --dry-run bayrog'ini olib tashlang."
            ))
            return

        # Batch delete — katta jadval uchun
        # Django'ning .delete() katta querysetlar uchun samarali
        deleted, _ = qs.delete()
        self.stdout.write(self.style.SUCCESS(
            f"\n✅ {deleted:,} ta eski AuditLog yozuvi o'chirildi "
            f"({days} kundan eski)."
        ))
