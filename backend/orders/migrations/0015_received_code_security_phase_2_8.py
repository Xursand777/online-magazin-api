"""
Phase 2.8 — Received code xavfsizligi (ultra-secure)

Bu migration ikkita yangi maydon qo'shadi:
  * received_code_used_at  — kod muvaffaqiyatli ishlatilgan vaqt (one-time use)
  * received_code_expires_at — kod muddati tugash vaqti (24 soat TTL)

Old buyurtmalarda ikkalasi ham NULL — bu xavfsiz default:
  * used_at NULL → courier_confirm_delivery boshqa status guard'i bilan
    himoyalanadi (RECEIVED'ga o'tgan buyurtmalarda kod taqqoslash ham
    ishlamaydi)
  * expires_at NULL → eski buyurtmalarda TTL tekshiruvi o'tkazib yuboriladi
    (backward compat)
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0014_alter_order_created_at_alter_order_credit_due_date_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='received_code_used_at',
            field=models.DateTimeField(
                null=True,
                blank=True,
                db_index=True,
                help_text="Kod muvaffaqiyatli ishlatilgan vaqt — qayta ishlatib bo'lmaydi",
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='received_code_expires_at',
            field=models.DateTimeField(
                null=True,
                blank=True,
                db_index=True,
                help_text="Kod muddati tugash vaqti (24 soat). Bundan keyin kod rad etiladi.",
            ),
        ),
    ]
