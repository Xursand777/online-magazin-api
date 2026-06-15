"""
users/management/commands/sync_superusers.py

DOIMIY SUPER ADMINLARNI MAJBURLASH — canonical allowlist enforcement.

QOIDA (settings.SUPERUSER_PHONES):
    • Ro'yxatdagi telefon raqamlari  → super_admin qilinadi (mavjud bo'lsa)
    • Ro'yxatda yo'q har qanday super_admin → huquqi olib tashlanadi
      (akkaunt O'CHMAYDI — faqat is_superuser/is_staff tushiriladi va
       mavjud tokenlari bekor qilinadi)

LOCKOUT HIMOYASI:
    Agar ro'yxatdagi birorta super_admin ham haqiqatan mavjud bo'lmasa —
    HECH KIM tushirilmaydi. Bu butun tizimni qulflab qo'ymaslik kafolati.

ISHLATISH:
    python manage.py sync_superusers            # majburlaydi
    python manage.py sync_superusers --dry-run  # faqat ko'rsatadi

Bu komanda Procfile `release:` bosqichida HAR DEPLOY'da avtomatik ishlaydi,
shuning uchun belgilangan 2 raqam HAR DOIM super_admin bo'lib qoladi.
"""
from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from users.models import User
from users.utils import find_user_by_phone, normalize_phone_number


class Command(BaseCommand):
    help = "Canonical allowlist'dagi super adminlarni majburlaydi (qolganlarini tushiradi)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="O'zgartirmaydi — faqat nima bo'lishini ko'rsatadi.",
        )

    def handle(self, *args, **options):
        dry = options['dry_run']

        # ── Canonical raqamlarni normalizatsiya qilamiz ──────────────────────
        canonical: set[str] = set()
        for raw in getattr(settings, 'SUPERUSER_PHONES', []):
            norm = normalize_phone_number(raw)
            if norm:
                canonical.add(norm)

        if not canonical:
            self.stderr.write(self.style.WARNING(
                "SUPERUSER_PHONES bo'sh — hech narsa qilinmadi (xavfsiz to'xtash)."
            ))
            return

        prefix = '[DRY-RUN] ' if dry else ''
        self.stdout.write(f"{prefix}Canonical super adminlar: {sorted(canonical)}")

        promoted: list[str] = []
        revoked: list[str] = []
        missing: list[str] = []

        with transaction.atomic():
            # ── 1) Allowlist'dagilarni super_admin qilamiz ───────────────────
            present_canonical = 0
            for norm in sorted(canonical):
                user = find_user_by_phone(norm)
                if user is None:
                    missing.append(norm)
                    continue
                present_canonical += 1
                needs = (
                    not user.is_superuser
                    or not user.is_staff
                    or not user.is_active
                    or user.role is not None
                )
                if needs:
                    if not dry:
                        user.is_superuser = True
                        user.is_staff = True
                        user.is_active = True
                        user.role = None  # super_admin role'i tayinlanmaydi
                        user.save(update_fields=[
                            'is_superuser', 'is_staff', 'is_active', 'role',
                        ])
                    promoted.append(user.phone)

            # ── 2) LOCKOUT HIMOYASI ──────────────────────────────────────────
            # Ro'yxatdagi birorta super_admin ham mavjud bo'lmasa — stray'larni
            # tushirMAYMIZ (aks holda hammani qulflab qo'yamiz).
            if present_canonical == 0:
                self.stderr.write(self.style.ERROR(
                    "DIQQAT: Allowlist'dagi birorta super_admin ham bazada yo'q. "
                    "Lockout xavfi — hech kim tushirilmadi.\n"
                    "  Avval canonical akkauntni yarating:\n"
                    "    python manage.py create_backup_superuser --phone=<raqam>"
                ))
            else:
                # ── 3) Allowlist'da yo'q super adminlarni tushiramiz ─────────
                for u in User.objects.filter(is_superuser=True):
                    u_norm = normalize_phone_number(u.phone) or u.phone
                    if u_norm in canonical:
                        continue
                    if not dry:
                        u.is_superuser = False
                        # role bo'lsa staff bo'lib qoladi, bo'lmasa staff'dan ham tushadi
                        u.is_staff = bool(u.role)
                        # mavjud (elevated) tokenlarni bekor qilamiz
                        u.role_invalidated_at = timezone.now()
                        u.save(update_fields=[
                            'is_superuser', 'is_staff', 'role_invalidated_at',
                        ])
                    revoked.append(u.phone)

            if dry:
                transaction.set_rollback(True)

        # ── Hisobot ──────────────────────────────────────────────────────────
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}✅ super_admin qilindi: {len(promoted)} "
            f"{promoted if promoted else ''}"
        ))
        if revoked:
            self.stdout.write(self.style.WARNING(
                f"{prefix}⬇️  super_admin'dan tushirildi: {len(revoked)} {revoked}"
            ))
        if missing:
            self.stdout.write(self.style.NOTICE(
                f"{prefix}ℹ️  bazada topilmadi (yaratish kerak): {missing}"
            ))
        self.stdout.write(self.style.SUCCESS(f"{prefix}Sync yakunlandi."))
