"""
Telegram bot sozlamalarini tekshiruvchi management command.

ISHLATISH:
    python manage.py test_telegram
    python manage.py test_telegram --severity warning
    python manage.py test_telegram --text "Custom xabar"

CHIQADIGAN NATIJA:
    Sozlanmagan: token/chat_id yo'qligini xabar beradi
    Sozlangan: 4 ta turli darajadagi test xabar yuboradi
    Telegram'da: emoji + label + matn ko'rinadi
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.notifications import (
    AlertSeverity,
    alert_critical,
    alert_error,
    alert_info,
    alert_warning,
    send_admin_alert,
)


class Command(BaseCommand):
    help = 'Telegram bot sozlamalarini tekshirish (test xabar yuborish)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--text',
            type=str,
            default=None,
            help='Maxsus xabar matni (default: 4 darajadagi test xabarlar)',
        )
        parser.add_argument(
            '--severity',
            choices=['info', 'warning', 'error', 'critical'],
            default=None,
            help='Faqat bitta darajada xabar yuborish',
        )

    def handle(self, *args, **options):
        # ── Sozlama tekshiruvi ────────────────────────────────────────────────
        token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        chat_id = getattr(settings, 'TELEGRAM_ADMIN_CHAT_ID', '')

        if not token:
            raise CommandError(
                'TELEGRAM_BOT_TOKEN .env faylda sozlanmagan.\n\n'
                '  1. Telegram\'da @BotFather ga /newbot yuboring\n'
                '  2. Bot nomi va username kiriting\n'
                '  3. Berilgan tokenni .env ga qo\'shing:\n'
                '     TELEGRAM_BOT_TOKEN=7842914738:AAEXxxxxxxxx\n'
            )

        if not chat_id:
            raise CommandError(
                'TELEGRAM_ADMIN_CHAT_ID .env faylda sozlanmagan.\n\n'
                '  1. Telegram\'da botingizni toping va /start bosing\n'
                '  2. Brauzerda oching:\n'
                f'     https://api.telegram.org/bot{token}/getUpdates\n'
                '  3. Javobda "chat":{{"id":12345}} qismdan chat_id ni oling\n'
                '  4. .env ga qo\'shing:\n'
                '     TELEGRAM_ADMIN_CHAT_ID=12345\n'
            )

        self.stdout.write(self.style.NOTICE(
            f'Telegram konfiguratsiyasi topildi:\n'
            f'  Token:   {token[:10]}...{token[-4:]}\n'
            f'  Chat ID: {chat_id}\n'
        ))

        # ── Test xabar yuborish ───────────────────────────────────────────────
        custom_text = options.get('text')
        severity_filter = options.get('severity')

        # Mapping severity nomidan funksiyaga
        senders = {
            'info':     (alert_info,     'Bu — INFO darajadagi test xabar. Oddiy ma\'lumot.'),
            'warning':  (alert_warning,  'Bu — WARNING darajadagi test xabar. Diqqat kerak.'),
            'error':    (alert_error,    'Bu — ERROR darajadagi test xabar. Xato sodir bo\'ldi.'),
            'critical': (alert_critical, 'Bu — CRITICAL darajadagi test xabar. Darhol harakat kerak!'),
        }

        if severity_filter:
            # Bitta daraja
            sender, default_text = senders[severity_filter]
            text = custom_text or default_text
            result = sender(text, dedup=False)
            self._report(severity_filter, result)
        elif custom_text:
            # Maxsus matn — default INFO bilan
            result = send_admin_alert(custom_text, severity=AlertSeverity.INFO, dedup=False)
            self._report('info (custom)', result)
        else:
            # 4 ta hammasi
            for name, (sender, default_text) in senders.items():
                result = sender(default_text, dedup=False)
                self._report(name, result)

        self.stdout.write(self.style.SUCCESS(
            "\n✅ Telegram'da xabarlarni tekshiring. Kelmagan bo'lsa:\n"
            "   1. Bot bilan suhbatni /start bilan boshlaganmisiz?\n"
            "   2. Chat ID to'g'rimi? (raqam, manfiy bo'lishi mumkin guruh uchun)\n"
            "   3. Token to'g'rimi? (@BotFather dan qayta olish mumkin)\n"
        ))

    def _report(self, severity_name: str, success: bool) -> None:
        emoji = '✅' if success else '❌'
        style = self.style.SUCCESS if success else self.style.ERROR
        self.stdout.write(style(f'  {emoji} {severity_name}: {"yuborildi" if success else "muvaffaqiyatsiz"}'))
