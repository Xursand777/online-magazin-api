"""
0011_ensure_superusers — DOIMIY SUPER ADMINLARNI MIGRATION ORQALI MAHKAMLASH.

NIMA UCHUN MIGRATION (server-independent):
    `sync_superusers` komandasi Procfile `release:` qatorida edi, lekin Render
    Procfile'ning release qatorini ISHLATMAYDI (o'zining alohida pre-deploy
    buyrug'ini ishlatadi) — shuning uchun u prod'da ishlamadi va backup raqam
    super_admin bo'lmay qoldi.

    Migration'lar esa HAR DOIM, HAR QANDAY serverda `migrate` ishlaganda
    bajariladi (Render, kelajakdagi yangi server, fresh PostgreSQL — barchasi).
    Shuning uchun super_admin majburlashni shu yerga qo'yamiz — eng ishonchli,
    serverga bog'liq bo'lmagan yo'l.

QOIDA:
    settings.SUPERUSER_PHONES dagi har bir raqam:
      • mavjud bo'lmasa  → super_admin sifatida YARATILADI (parol ishlatib
        bo'lmaydi; OTP/SMS bilan kiradi — parol kerak bo'lsa keyin o'rnatiladi)
      • mavjud bo'lsa    → super_admin'ga ko'tariladi (is_superuser/is_staff/
        is_active=True, role=None)

    Boshqa super adminlarga TEGILMAYDI (revocation `sync_superusers`da, bu yerda
    lockout xavfini oldini olish uchun faqat additive).
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations


def _canonical_phones() -> list[str]:
    raw = getattr(settings, 'SUPERUSER_PHONES', None) or [
        '+998946810900',
        '+998941126777',
    ]
    phones: list[str] = []
    for p in raw:
        p = (p or '').replace(' ', '').strip()
        if p and p not in phones:
            phones.append(p)
    return phones


def ensure_superusers(apps, schema_editor):
    User = apps.get_model('users', 'User')
    UserProfile = apps.get_model('users', 'UserProfile')

    for phone in _canonical_phones():
        # Aniq mos kelish (ilova telefonni +998XXXXXXXXX canonical formatda
        # saqlaydi) + ehtiyot uchun '998...' (plyussiz) variantini ham ko'ramiz.
        digits = phone.lstrip('+')
        user = (
            User.objects.filter(phone=phone).first()
            or User.objects.filter(phone=digits).first()
        )

        if user is None:
            user = User(
                phone=phone,
                username=phone,
                is_superuser=True,
                is_staff=True,
                is_active=True,
                is_verified=True,
                role=None,
                # Historik modelda set_unusable_password() yo'q → make_password(None)
                # ishlatib bo'lmaydigan parol qo'yadi (OTP/SMS bilan kiradi).
                password=make_password(None),
            )
            user.save()
            UserProfile.objects.get_or_create(user=user)
            continue

        changed = False
        if not user.is_superuser:
            user.is_superuser = True
            changed = True
        if not user.is_staff:
            user.is_staff = True
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if user.role is not None:
            user.role = None
            changed = True
        if changed:
            user.save()
        UserProfile.objects.get_or_create(user=user)


def noop_reverse(apps, schema_editor):
    # Orqaga qaytarish ma'nosiz (xavfsizlik qiymati). Hech narsa qilmaymiz.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_userprofile_coords'),
    ]

    operations = [
        migrations.RunPython(ensure_superusers, noop_reverse),
    ]
