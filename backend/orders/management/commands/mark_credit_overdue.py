"""
Phase 2.5 — Muddati o'tgan kreditli buyurtmalarni belgilash.

NIMA QILADI:
    `credit_due_date < bugun` bo'lgan to'lanmagan kreditli buyurtmalarni
    `credit_overdue_counted=True` deb belgilaydi va foydalanuvchining
    overdue hisobini oshiradi. 3 marta yetganda `credit_ban=True`.

DISPUT MUDDATI:
    `dispute_deadline` (DELIVERED'dan +7 kun) hali tugamagan buyurtmalar
    o'tkazib yuboriladi — mijoz hali shikoyat qilishi mumkin (Phase 2.6).

QACHON ISHGA TUSHIRILADI:
    Soatiga bir marta (cron, Celery Beat, GitHub Actions yoki Render Cron Job).
    Misol cron: `0 * * * * cd /app && python manage.py mark_credit_overdue`

FOYDALANISH:
    python manage.py mark_credit_overdue              # Real ishlash
    python manage.py mark_credit_overdue --dry-run    # Test rejim (DB tegmaydi)
    python manage.py mark_credit_overdue --verbose    # Har bir foydalanuvchi haqida log
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from orders.models import Order
from orders.services import mark_overdue_credits


class Command(BaseCommand):
    help = (
        "Phase 2.5 — Muddati o'tgan kreditli buyurtmalarni overdue deb belgilaydi "
        "(dispute_deadline o'tganlarini)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Test rejim — DB o'zgartirilmaydi, faqat hisoblanadi.",
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help="Har bir foydalanuvchi haqida batafsil log.",
        )

    def handle(self, *args, dry_run: bool = False, verbose: bool = False, **options):
        today = timezone.now().date()
        now = timezone.now()
        User = get_user_model()

        # Eligible foydalanuvchilar: hech bo'lmaganda 1 ta tekshirilishi kerak
        # bo'lgan overdue buyurtmaga ega (Phase 2.5 dispute filtri ham bu yerda
        # — keraksiz foydalanuvchilarni loop qilmaslik uchun).
        candidate_users = (
            User.objects
            .filter(
                orders__is_credit=True,
                orders__credit_paid=False,
                orders__credit_overdue_counted=False,
                orders__credit_overdue_pardoned=False,
                orders__credit_due_date__lt=today,
            )
            .filter(
                Q(orders__dispute_deadline__isnull=True)
                | Q(orders__dispute_deadline__lt=now)
            )
            .exclude(orders__status__in=Order.CANCELLATION_STATUSES)
            .distinct()
        )

        total_candidates = candidate_users.count()
        self.stdout.write(
            f"Tekshirish: {total_candidates} ta foydalanuvchi affected bo'lishi mumkin "
            f"(disput muddati o'tganlar)."
        )

        if dry_run:
            # Aniq sonni ko'rsatish uchun buyurtmalarni sanaymiz
            overdue_orders = (
                Order.objects
                .filter(
                    user__in=candidate_users,
                    is_credit=True,
                    credit_paid=False,
                    credit_overdue_counted=False,
                    credit_overdue_pardoned=False,
                    credit_due_date__lt=today,
                )
                .filter(
                    Q(dispute_deadline__isnull=True)
                    | Q(dispute_deadline__lt=now)
                )
                .exclude(status__in=Order.CANCELLATION_STATUSES)
            )
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] {overdue_orders.count()} ta buyurtma overdue deb belgilanardi, "
                f"DB o'zgartirilmadi."
            ))
            return

        total_marked = 0
        total_banned = 0
        for user in candidate_users.iterator(chunk_size=100):
            result = mark_overdue_credits(user)
            total_marked += result['count']
            if result['banned']:
                total_banned += 1
            if verbose and result['count'] > 0:
                self.stdout.write(
                    f"  • user={user.pk} phone={user.phone} "
                    f"yangi_overdue={result['count']} "
                    f"jami={result['overdue_credit_count']} "
                    f"banned={result['banned']}"
                )

        self.stdout.write(self.style.SUCCESS(
            f"✓ {total_marked} ta buyurtma overdue deb belgilandi, "
            f"{total_banned} ta foydalanuvchi ban'ga olindi."
        ))
