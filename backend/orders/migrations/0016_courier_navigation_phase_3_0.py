"""
Phase 3.0 — Kuryer real-time navigatsiyasi uchun zaruriy maydonlar.

YANGI MAYDONLAR:
  • delivery_lat, delivery_lng — Mijoz AddressPicker'da xaritadan tanlagan
    aniq koordinata. Kuryer xaritasi (CourierRouteMap) shu nuqtaga yo'l chizadi.
  • delivery_notes — Kuryer uchun eslatma: domofon kodi, qavat, belgilar.
    "Oxirgi 50 metr muammosi"ni hal qiladi.

BACKWARDS COMPAT:
  Barcha yangi maydonlar nullable/default bo'sh — eski buyurtmalar ishlay
  beradi. Yangi buyurtmalarga AddressPicker yangi nusxasi koordinata
  yuboradi.
"""
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0015_received_code_security_phase_2_8'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_lat',
            field=models.DecimalField(
                max_digits=9,
                decimal_places=6,
                null=True,
                blank=True,
                validators=[
                    MinValueValidator(Decimal('-90')),
                    MaxValueValidator(Decimal('90')),
                ],
                help_text="Mijoz xaritada tanlagan aniq koordinata: kenglik (lat)",
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_lng',
            field=models.DecimalField(
                max_digits=10,
                decimal_places=6,
                null=True,
                blank=True,
                validators=[
                    MinValueValidator(Decimal('-180')),
                    MaxValueValidator(Decimal('180')),
                ],
                help_text="Mijoz xaritada tanlagan aniq koordinata: uzunlik (lng)",
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_notes',
            field=models.TextField(
                blank=True,
                default='',
                help_text=(
                    "Kuryer uchun qo'shimcha eslatma: domofon kodi, qavat, belgilar, "
                    "alohida ko'rsatmalar. Oxirgi 50 metr muammosini hal qiladi."
                ),
            ),
        ),
    ]
