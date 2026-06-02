"""
Phase 1.9 — Kunlik admin biznes hisoboti Telegram'ga yuborish.

ISHLATISH:
    python manage.py send_daily_digest
    python manage.py send_daily_digest --dry-run        # Telegram'siz, stdout'ga
    python manage.py send_daily_digest --date 2026-05-30 # ma'lum sanasi uchun

QACHON ISHLAYDI:
    GitHub Actions cron har kuni 04:00 UTC (09:00 Toshkent vaqti).
    Foydalanuvchi xohlasa qo'lda ham chaqirishi mumkin.

NIMA QILADI:
    Bir kunlik (default — kecha) biznes ko'rsatkichlarini Telegram'ga
    Mobrion_bot orqali yuboradi. Statistika:
      • Buyurtmalar — soni, daromad, o'rtacha summa, kecha bilan farq
      • Kreditlar  — aktiv, muddati o'tgan, bugun to'lash kerakli
      • Kam stock  — top 5 mahsulot
      • Yangi foydalanuvchilar va master'lar
      • Eskiz SMS balans (Phase 0.4'dan)

NIMA UCHUN KECHA SANASI:
    Digest ertalab 09:00'da yuborilsa, "bugun" hisobotini 9 soatlik
    chala ma'lumot bilan ko'rsatish ma'nosiz. Kecha — to'liq kun.

XAVFSIZLIK:
    Telegram sozlanmagan bo'lsa — silent skip (notifications.py logikasi).
    DB xatosi bo'lsa — exception, command muvaffaqiyatsiz tugaydi
    (GitHub Actions failure → ikkinchi alert).
"""
from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Avg, Count, Sum
from django.utils import timezone

from orders.models import Order
from products.models import Product

User = get_user_model()


class Command(BaseCommand):
    help = "Kunlik biznes hisobotini Mobrion_bot orqali Telegram'ga yuborish"

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            default=None,
            help='YYYY-MM-DD format. Default: kecha (Toshkent vaqti)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Telegram'ga yubormasdan, faqat stdout'ga chiqar",
        )

    # ── Asosiy oqim ──────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        target_date = self._resolve_target_date(options.get('date'))
        dry_run = options['dry_run']

        self.stdout.write(f"Hisobot tayyorlanmoqda: {target_date}")

        try:
            stats = self._gather_stats(target_date)
        except Exception as exc:
            raise CommandError(f"Statistika to'plashda xato: {exc}")

        message = self._format_message(stats)

        if dry_run:
            self.stdout.write(self.style.NOTICE("\n[DRY RUN] Quyidagi xabar yuborilardi:\n"))
            self.stdout.write("-" * 60)
            self.stdout.write(message)
            self.stdout.write("-" * 60)
            return

        # Yuborish (notifications.py dedup'sini chetlab o'tamiz — har kuni bir xil)
        try:
            from core.notifications import send_admin_alert, AlertSeverity
            ok = send_admin_alert(
                message,
                severity=AlertSeverity.INFO,
                dedup=False,  # Har kuni bir xil bo'lishi mumkin — dedup bo'lmasin
            )
            if ok:
                self.stdout.write(self.style.SUCCESS(
                    f"\n✅ Hisobot Mobrion_bot orqali yuborildi ({target_date})"
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    "\n⚠️  Telegram yuborish muvaffaqiyatsiz "
                    "(sozlanmagan yoki tarmoq xato)"
                ))
        except Exception as exc:
            raise CommandError(f"Telegram alert xatosi: {exc}")

    # ── Sana hisoblash ───────────────────────────────────────────────────────

    def _resolve_target_date(self, date_arg: str | None) -> dt.date:
        """Default: kecha (Toshkent vaqti). Argument berilsa — o'sha sana."""
        if date_arg:
            try:
                return dt.datetime.strptime(date_arg, '%Y-%m-%d').date()
            except ValueError:
                raise CommandError(
                    f"Sana noto'g'ri formatda: {date_arg}. "
                    f"YYYY-MM-DD kutilgan, masalan: 2026-05-30"
                )
        # Default — kecha (Toshkent vaqti, settings.TIME_ZONE bo'yicha)
        return (timezone.localtime() - dt.timedelta(days=1)).date()

    # ── Statistika to'plash ─────────────────────────────────────────────────

    def _gather_stats(self, target_date: dt.date) -> dict[str, Any]:
        prev_date = target_date - dt.timedelta(days=1)
        today_real = timezone.localdate()

        # ── Buyurtmalar (kanselatsiya qilinganlarni hisobga olmaymiz) ────────
        cancelled = list(Order.CANCELLATION_STATUSES)

        orders_qs = Order.objects.filter(
            created_at__date=target_date
        ).exclude(status__in=cancelled)
        prev_orders_qs = Order.objects.filter(
            created_at__date=prev_date
        ).exclude(status__in=cancelled)

        orders_agg = orders_qs.aggregate(
            count=Count('id'),
            revenue=Sum('total_price'),
            avg=Avg('total_price'),
        )

        prev_count = prev_orders_qs.count()
        count_diff = (orders_agg['count'] or 0) - prev_count

        # ── Kreditlar (hozirgi holat) ────────────────────────────────────────
        credit_active = Order.objects.filter(
            is_credit=True, credit_paid=False,
        ).count()
        credit_overdue = Order.objects.filter(
            is_credit=True, credit_paid=False, credit_due_date__lt=today_real,
        ).count()
        credit_due_today = Order.objects.filter(
            is_credit=True, credit_paid=False, credit_due_date=today_real,
        ).count()
        credit_due_in_3_days = Order.objects.filter(
            is_credit=True,
            credit_paid=False,
            credit_due_date__gte=today_real,
            credit_due_date__lte=today_real + dt.timedelta(days=3),
        ).count()

        # ── Kam stock (variant'siz mahsulotlar) ──────────────────────────────
        low_stock = list(
            Product.objects
            .filter(stock__lte=5, is_active=True, variants__isnull=True)
            .order_by('stock', 'name')
            .values('id', 'name', 'stock')[:5]
        )

        out_of_stock = Product.objects.filter(
            stock=0, is_active=True, variants__isnull=True
        ).count()

        # ── Foydalanuvchilar ─────────────────────────────────────────────────
        new_users = User.objects.filter(
            date_joined__date=target_date,
            is_superuser=False,
        ).count()
        total_masters = User.objects.filter(is_master=True).count()

        # ── Eskiz SMS balans (Phase 0.4'dan) ─────────────────────────────────
        try:
            from orders.sms import get_eskiz_balance
            sms_balance = get_eskiz_balance(force_refresh=False)
        except Exception:
            sms_balance = None

        return {
            'date': target_date,
            'orders': {
                'count': orders_agg['count'] or 0,
                'count_diff': count_diff,
                'revenue': orders_agg['revenue'] or Decimal('0'),
                'avg': orders_agg['avg'] or Decimal('0'),
            },
            'credits': {
                'active': credit_active,
                'overdue': credit_overdue,
                'due_today': credit_due_today,
                'due_in_3_days': credit_due_in_3_days,
            },
            'low_stock': low_stock,
            'out_of_stock': out_of_stock,
            'users': {
                'new': new_users,
                'masters': total_masters,
            },
            'sms_balance': sms_balance,
        }

    # ── Xabar formatlash (Markdown) ─────────────────────────────────────────

    def _format_message(self, stats: dict[str, Any]) -> str:
        lines = []
        date_str = stats['date'].strftime('%Y-%m-%d (%A)')
        lines.append(f"📊 *Kunlik hisobot* — `{date_str}`")
        lines.append("")

        # ── Buyurtmalar ──────────────────────────────────────────────────────
        o = stats['orders']
        diff = o['count_diff']
        if diff > 0:
            diff_str = f" (+{diff} vs kecha)"
        elif diff < 0:
            diff_str = f" ({diff} vs kecha)"
        else:
            diff_str = " (kecha bilan teng)"

        lines.append("📦 *Buyurtmalar*")
        lines.append(f"  • Soni:     `{o['count']}` ta{diff_str}")
        lines.append(f"  • Daromad:  `{self._format_uzs(o['revenue'])}`")
        if o['count']:
            lines.append(f"  • O'rtacha: `{self._format_uzs(o['avg'])}`")
        lines.append("")

        # ── Kreditlar ────────────────────────────────────────────────────────
        c = stats['credits']
        lines.append("💰 *Kreditlar*")
        lines.append(f"  • Aktiv:           `{c['active']}` ta")
        if c['overdue']:
            lines.append(f"  • Muddati o'tgan:   `{c['overdue']}` ta ⚠️")
        if c['due_today']:
            lines.append(f"  • Bugun muddat:     `{c['due_today']}` ta")
        if c['due_in_3_days']:
            lines.append(f"  • 3 kun ichida:     `{c['due_in_3_days']}` ta")
        lines.append("")

        # ── Stock ────────────────────────────────────────────────────────────
        if stats['low_stock'] or stats['out_of_stock']:
            lines.append("📉 *Stock holati*")
            if stats['out_of_stock']:
                lines.append(f"  • Stock=0:  `{stats['out_of_stock']}` ta tovar")
            if stats['low_stock']:
                lines.append("  • Eng kam qolgan:")
                for p in stats['low_stock']:
                    name = self._truncate(p['name'], 28)
                    lines.append(f"     · {name}: `{p['stock']}`")
            lines.append("")

        # ── Foydalanuvchilar ─────────────────────────────────────────────────
        u = stats['users']
        lines.append("👤 *Foydalanuvchilar*")
        lines.append(f"  • Yangi:    `{u['new']}` ta")
        lines.append(f"  • Masters:  `{u['masters']}` ta")
        lines.append("")

        # ── SMS balans ───────────────────────────────────────────────────────
        if stats['sms_balance'] is not None:
            balance = float(stats['sms_balance'])
            approx_sms = int(balance / 50)
            status_emoji = '✅' if balance > 50000 else '🟡' if balance > 10000 else '🔴'
            lines.append("💬 *SMS*")
            lines.append(
                f"  • Eskiz balans: `{self._format_uzs(balance)}` "
                f"(~{approx_sms:,} SMS) {status_emoji}"
            )
            lines.append("")

        # ── Footer ───────────────────────────────────────────────────────────
        lines.append("─" * 30)
        lines.append("Admin panel: /admin/")

        return "\n".join(lines)

    # ── Yordamchilar ────────────────────────────────────────────────────────

    @staticmethod
    def _format_uzs(amount) -> str:
        """1250000 → '1 250 000 UZS' (O'zbekistondagi thousand separator)."""
        try:
            value = int(Decimal(str(amount)))
            return f"{value:,} UZS".replace(',', ' ')
        except Exception:
            return f"{amount} UZS"

    @staticmethod
    def _truncate(text: str, max_len: int) -> str:
        return text if len(text) <= max_len else text[:max_len - 1] + '…'
