"""
Eskiz SMS balansini qo'lda tekshirish + alert yuborish.

ISHLATISH:
    python manage.py check_sms_balance
    python manage.py check_sms_balance --no-alert  # alert yubormasdan
    python manage.py check_sms_balance --force     # kesh chetlanadi

NIMA UCHUN:
    Bu komanda — runbook va manual debug uchun:
      • "Balans qancha?" — admin shu komandani ishga tushiradi
      • "Alert kelmadi, sozlash to'g'rimi?" — --force bilan tekshiruv
      • Tashqi cron (UptimeRobot HTTP yoki cron-job.org) shu komandani
        chaqirishi mumkin (kelajak)

ICHKI TIZIM:
    Asosiy alert tizimi — har SMS yuborilganda fonda
    (_check_balance_after_send_async). Bu komanda — qo'lda nazorat.
"""
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings


class Command(BaseCommand):
    help = "Eskiz.uz SMS balansini tekshiradi va kerak bo'lsa Telegram alert yuboradi"

    def add_arguments(self, parser):
        parser.add_argument(
            '--no-alert',
            action='store_true',
            help="Telegram'ga alert YUBORMA — faqat balansni ko'rsat",
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Keshlangan natijani chetlab, Eskiz API ga yangi so\'rov yubor',
        )

    def handle(self, *args, **options):
        from orders.sms import get_eskiz_balance, check_balance_and_alert

        no_alert = options['no_alert']
        force = options['force']

        # ── Sozlama tekshiruvi ────────────────────────────────────────────────
        if not getattr(settings, 'ESKIZ_EMAIL', '') or not getattr(settings, 'ESKIZ_PASSWORD', ''):
            raise CommandError(
                'Eskiz credentials .env faylda sozlanmagan.\n\n'
                'Quyidagilarni o\'rnating:\n'
                '  ESKIZ_EMAIL=your@email.com\n'
                '  ESKIZ_PASSWORD=your-eskiz-password\n'
            )

        # ── Balans olish ──────────────────────────────────────────────────────
        balance = get_eskiz_balance(force_refresh=force)
        if balance is None:
            raise CommandError(
                'Eskiz API\'dan balansni olib bo\'lmadi.\n'
                'Sabablari:\n'
                '  • Token muddati tugagan yoki noto\'g\'ri\n'
                '  • Tarmoq muammosi\n'
                '  • Eskiz xizmati vaqtinchalik ishlamayapti\n'
                '\n'
                'Log faylda batafsil xato bor (backend/logs/errors.log)'
            )

        # ── Ko'rsatish ────────────────────────────────────────────────────────
        warning = settings.ESKIZ_BALANCE_WARNING_THRESHOLD
        critical = settings.ESKIZ_BALANCE_CRITICAL_THRESHOLD
        price = settings.ESKIZ_PRICE_PER_SMS

        approx_sms = int(balance / price) if price > 0 else 0

        # Holat aniqlash
        if balance <= critical:
            status_label = self.style.ERROR('🔴 KRITIK')
        elif balance <= warning:
            status_label = self.style.WARNING('🟡 PAST')
        else:
            status_label = self.style.SUCCESS('🟢 OK')

        self.stdout.write('')
        self.stdout.write(f'  Holat:         {status_label}')
        self.stdout.write(f'  Balans:        {balance:>12,.0f} UZS')
        self.stdout.write(f'  Taxminiy SMS:  ~{approx_sms:>11,} ta')
        self.stdout.write(f'  Warning:       {warning:>12,.0f} UZS')
        self.stdout.write(f'  Critical:      {critical:>12,.0f} UZS')
        self.stdout.write(f'  Narx/SMS:      {price:>12,.0f} UZS')
        self.stdout.write('')

        # ── Alert yuborish ────────────────────────────────────────────────────
        if no_alert:
            self.stdout.write(self.style.NOTICE('--no-alert berildi: Telegram alert o\'tkazib yuborildi.'))
            return

        # Alert logikasi sms.py'da — keshni tozalab qayta chaqiramiz
        from django.core.cache import cache
        cache.delete('bozor:eskiz_balance_checked')

        result = check_balance_and_alert()
        if result is None:
            self.stdout.write(self.style.WARNING(
                'check_balance_and_alert None qaytardi — alert yuborilmadi.'
            ))
        else:
            if balance <= warning:
                self.stdout.write(self.style.SUCCESS(
                    'Telegram alert yuborildi (sozlangan threshold ostida).'
                ))
            else:
                self.stdout.write(self.style.NOTICE(
                    'Balans yetarli — alert yuborish shart emas.'
                ))
