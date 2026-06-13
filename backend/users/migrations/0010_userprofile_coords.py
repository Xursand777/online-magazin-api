"""
Phase 3.1 — UserProfile'ga delivery_lat/lng/notes qo'shish.

NIMA UCHUN:
  Foydalanuvchi Profile (Shaxsiy ma'lumotlar) yoki Mening manzilim'da xaritadan
  manzil tanlaganida, koordinata UserProfile'da saqlanadi. Keyin Checkout'ga
  o'tganida AddressPicker bu koordinatani avtomat oladi va Order'ga uzatadi.

  Bu — saytdagi va mobile ilovadagi yagona patternga keladi: profilda bir
  marta tanlangan manzil koordinatasi hamma joyda ishlatiladi.

BACKWARDS COMPAT:
  Hammasi nullable/default bo'sh — eski profillar avval ishlay turadi.
  Yangi tanlash bo'lganda saqlanadi.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_uz_phone_validator'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='delivery_lat',
            field=models.DecimalField(
                max_digits=9,
                decimal_places=6,
                null=True,
                blank=True,
                help_text="Foydalanuvchi default manzili koordinatasi (lat)",
            ),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='delivery_lng',
            field=models.DecimalField(
                max_digits=10,
                decimal_places=6,
                null=True,
                blank=True,
                help_text="Foydalanuvchi default manzili koordinatasi (lng)",
            ),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='delivery_notes',
            field=models.TextField(
                blank=True,
                default='',
                help_text="Kuryer uchun default eslatma (domofon kodi, qavat, belgilar)",
            ),
        ),
    ]
