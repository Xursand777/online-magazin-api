"""
users/management/commands/create_backup_superuser.py

BACKUP SUPER_ADMIN YARATISH — Lockout recovery uchun.

ISHLATISH:
    # Birinchi marta — random parol bilan yangi backup admin yaratish:
    python manage.py create_backup_superuser

    # Aniq parol bilan:
    python manage.py create_backup_superuser --password="MyS3cur3P@ss!"

    # Mavjud parolni almashtirish (rotation):
    python manage.py create_backup_superuser --rotate-password

    # Mavjud foydalanuvchini super_admin'ga ko'tarish (xavfli):
    python manage.py create_backup_superuser --phone=+998901234567 --force-promote

    # Boshqa telefon raqami uchun:
    python manage.py create_backup_superuser --phone=+998901112233

NIMA QILADI:
    1. settings.BACKUP_SUPERUSER_PHONE'dan telefonni oladi (yoki --phone)
    2. Bu telefonga foydalanuvchi:
         a) yo'q   → yangi super_admin yaratadi
         b) bor    → mavjud super_admin parolini almashtiradi (rotate-password)
         c) bor lekin super_admin emas → --force-promote bilan ko'tariladi
    3. Parol: --password yoki cryptografik xavfsiz 16 belgili
    4. Telegram'ga alert yuboradi (xavfsizlik audit)
    5. Mavjud tokenlar bekor qilinadi (role_invalidated_at = now)

XAVFSIZLIK:
    Bu komanda — SECRET. Faqat server shell'idan ishga tushiriladi.
    Parol stdout'ga chiqariladi, terminal tarixiga tushadi:
        history -d <NUM>  yoki  history -c
    1Password / Bitwarden kabi parol menejerga DARHOL saqlang.

OXIRGI CHORA — IKKAla super_admin ham qulflanib qolsa:
    1. Server'ga SSH bilan kirish (Render Shell)
    2. python manage.py shell
    3. from users.models import User
    4. u = User.objects.get(phone='+998YOUR_PHONE')
    5. u.set_password('YangiParol123!')
    6. u.is_superuser = True
    7. u.save()
"""
from __future__ import annotations

import logging
import secrets
import socket
import string
from datetime import datetime, timezone
from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import (
    validate_password, ValidationError as PasswordValidationError,
)
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone as dj_tz

from users.models import UserProfile
from users.utils import is_valid_uz_phone, normalize_phone_number

User = get_user_model()
logger = logging.getLogger(__name__)


# Random parol uchun — ASCII printable, ambiguous belgilar (l, 1, O, 0) sez
# Foydalanuvchi qo'lda yozayotganda chalkashmasin
_PASSWORD_CHARS = (
    string.ascii_letters
    .replace('l', '')
    .replace('I', '')
    .replace('O', '')
    + string.digits.replace('0', '').replace('1', '')
    + '!@#$%^&*-_=+'
)
_PASSWORD_LENGTH = 16


class Command(BaseCommand):
    help = "Backup super_admin yaratish yoki yangilash (lockout recovery uchun)"

    # ── CLI ──────────────────────────────────────────────────────────────────

    def add_arguments(self, parser):
        parser.add_argument(
            '--phone',
            help='Telefon raqam (default: settings.BACKUP_SUPERUSER_PHONE)',
        )
        parser.add_argument(
            '--password',
            help='Parol (yo\'q bo\'lsa 16 belgili kriptografik random)',
        )
        parser.add_argument(
            '--note',
            default='',
            help='Eslatma (kim, qachon, nima sabab — Telegram alert\'ga qo\'shiladi)',
        )
        parser.add_argument(
            '--rotate-password',
            action='store_true',
            help='Mavjud super_admin parolini yangilash',
        )
        parser.add_argument(
            '--force-promote',
            action='store_true',
            help='Mavjud oddiy foydalanuvchini super_admin\'ga ko\'tarish (XAVFLI)',
        )

    # ── Asosiy oqim ──────────────────────────────────────────────────────────

    def handle(self, *args, **options):
        phone = self._resolve_phone(options.get('phone'))
        password = self._resolve_password(options.get('password'))
        note = options.get('note', '')

        existing = User.objects.filter(phone=phone).first()

        # 3 ta yo'l: yangi yaratish / parol rotation / promotion
        if existing is None:
            action = self._create_new(phone, password, note)
        elif existing.is_superuser:
            action = self._rotate_existing(existing, password, note, options['rotate_password'])
        else:
            action = self._promote_existing(existing, password, note, options['force_promote'])

        self._print_credentials(phone, password, action)
        self._telegram_alert(phone, action, note)

    # ── Telefon va parol resolve ─────────────────────────────────────────────

    def _resolve_phone(self, phone_arg: Optional[str]) -> str:
        raw = phone_arg or getattr(settings, 'BACKUP_SUPERUSER_PHONE', '')
        if not raw:
            raise CommandError(
                'Telefon raqami berilmagan.\n'
                '  --phone bilan kiriting yoki .env\'ga:\n'
                '  BACKUP_SUPERUSER_PHONE=+998901234567'
            )

        normalized = normalize_phone_number(raw)
        if not is_valid_uz_phone(normalized):
            raise CommandError(
                f'Telefon raqami noto\'g\'ri: {raw} → {normalized}\n'
                'Format: +998XXXXXXXXX (12 raqam)'
            )
        return normalized

    def _resolve_password(self, password_arg: Optional[str]) -> str:
        if password_arg:
            # Foydalanuvchi parolini Django validator'lari bilan tekshirish
            try:
                validate_password(password_arg)
            except PasswordValidationError as exc:
                raise CommandError(
                    'Parol kuchsiz:\n  ' + '\n  '.join(exc.messages)
                )
            return password_arg

        return self._generate_password()

    @staticmethod
    def _generate_password() -> str:
        """16 belgili kriptografik xavfsiz parol."""
        return ''.join(secrets.choice(_PASSWORD_CHARS) for _ in range(_PASSWORD_LENGTH))

    # ── 3 ta amal yo'li ──────────────────────────────────────────────────────

    def _create_new(self, phone: str, password: str, note: str) -> str:
        """Yangi super_admin yaratish (foydalanuvchi mavjud bo'lmaganda)."""
        self.stdout.write(f'Yangi backup super_admin yaratilmoqda: {phone}')

        user = User(
            phone=phone,
            username=phone,
            is_superuser=True,
            is_staff=True,
            is_active=True,
            is_verified=True,
            role=None,  # SUPER_ADMIN role tayinlanmaydi — faqat is_superuser
        )
        user.set_password(password)
        user.save()

        # UserProfile ham yaratish (foydalanuvchi profil sahifasini ko'ra olishi uchun)
        UserProfile.objects.get_or_create(user=user)

        return 'created'

    def _rotate_existing(
        self,
        user: User,  # type: ignore[valid-type]
        password: str,
        note: str,
        rotate_flag: bool,
    ) -> str:
        """Mavjud super_admin parolini yangilash."""
        if not rotate_flag:
            raise CommandError(
                f'{user.phone} allaqachon super_admin.\n'
                'Parolni yangilash uchun --rotate-password bayrog\'ini ishlatang.'
            )

        self.stdout.write(f'Mavjud super_admin paroli yangilanmoqda: {user.phone}')

        user.set_password(password)
        # Mavjud tokenlar bekor bo'lishi shart — parol o'zgartirildi
        user.role_invalidated_at = dj_tz.now()
        user.is_active = True
        user.is_verified = True
        user.save()

        return 'rotated'

    def _promote_existing(
        self,
        user: User,  # type: ignore[valid-type]
        password: str,
        note: str,
        force_flag: bool,
    ) -> str:
        """Mavjud foydalanuvchini super_admin'ga ko'tarish."""
        if not force_flag:
            raise CommandError(
                f'{user.phone} mavjud lekin super_admin emas '
                f'(role={user.role!r}, is_staff={user.is_staff}).\n'
                'Promotion XAVFLI — bu foydalanuvchi to\'liq tizim huquqi oladi.\n'
                'Davom etish uchun --force-promote bayrog\'ini ishlatang.'
            )

        self.stdout.write(
            f'⚠️  Mavjud foydalanuvchi super_admin\'ga ko\'tarilmoqda: {user.phone} '
            f'(eski role={user.role})'
        )

        user.is_superuser = True
        user.is_staff = True
        user.is_active = True
        user.is_verified = True
        user.role = None  # super_admin role'i tayinlanmaydi
        user.role_invalidated_at = dj_tz.now()
        user.set_password(password)
        user.save()

        # UserProfile bo'lmasa yaratish
        UserProfile.objects.get_or_create(user=user)

        return 'promoted'

    # ── Hisobot va alert ─────────────────────────────────────────────────────

    def _print_credentials(self, phone: str, password: str, action: str) -> None:
        """Yaratilgan akkaunt ma'lumotlarini stdout'ga chiqarish (boxli)."""
        action_uz = {
            'created': 'YARATILDI',
            'rotated': 'PAROLI YANGILANDI',
            'promoted': 'SUPER_ADMIN GA KO\'TARILDI',
        }.get(action, action.upper())

        # Telefonni o'qiladigan formatga
        readable_phone = self._format_phone_readable(phone)

        box = '═' * 64
        self.stdout.write(self.style.SUCCESS(f'\n{box}'))
        self.stdout.write(self.style.SUCCESS(f'  ✅ Backup super_admin {action_uz}'))
        self.stdout.write(self.style.SUCCESS(box))
        self.stdout.write('')
        self.stdout.write(f'  📱 Phone:    {readable_phone}')
        self.stdout.write(f'  🔑 Password: {password}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('  ⚠️  XAVFSIZLIK QOIDALARI:'))
        self.stdout.write('     1. Parolni DARHOL parol menejerga saqlang')
        self.stdout.write('        (1Password, Bitwarden, KeePass)')
        self.stdout.write('     2. Terminal tarixidan o\'chiring:')
        self.stdout.write('          history -d $(history 1 | awk \'{print $1}\')')
        self.stdout.write('        yoki butunlay:  history -c')
        self.stdout.write('     3. Bu xabar QAYTA KO\'RSATILMAYDI')
        self.stdout.write('     4. Yo\'qotsangiz: --rotate-password orqali yangilang')
        self.stdout.write('')
        self.stdout.write(self.style.NOTICE('  KIRISH USULLARI:'))
        self.stdout.write('     • Parol orqali: /auth?mode=password sahifasi')
        self.stdout.write('     • OTP orqali:   Telegram bilan ulangan telefonga SMS kod')
        self.stdout.write(self.style.SUCCESS(f'{box}\n'))

    @staticmethod
    def _format_phone_readable(phone: str) -> str:
        """+998941126777 → +998 94 112 67 77"""
        if len(phone) == 13 and phone.startswith('+998'):
            digits = phone[4:]
            return f'+998 {digits[0:2]} {digits[2:5]} {digits[5:7]} {digits[7:9]}'
        return phone

    def _telegram_alert(self, phone: str, action: str, note: str) -> None:
        """Backup super_admin yaratilishi/o'zgartirilishi — xavfsizlik audit eventi."""
        action_uz = {
            'created': 'YARATILDI',
            'rotated': 'PAROLI YANGILANDI',
            'promoted': 'SUPER_ADMIN GA KO\'TARILDI',
        }.get(action, action.upper())

        try:
            from core.notifications import alert_warning

            hostname = socket.gethostname()
            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

            message_lines = [
                f"Backup super_admin {action_uz}",
                "",
                f"Telefon: `{self._format_phone_readable(phone)}`",
                f"Vaqt:    `{now_str}`",
                f"Host:    `{hostname}`",
            ]
            if note:
                message_lines.append(f"Eslatma: {note}")
            message_lines.extend([
                "",
                "Agar bu siz emas bo'lsa — DARHOL tekshirib chiqing!",
            ])

            alert_warning("\n".join(message_lines))

        except Exception as exc:
            logger.warning('Telegram alert yuborib bo\'lmadi: %s', exc)
