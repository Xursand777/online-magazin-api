from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_backfill_order_status_values'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='is_credit',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='credit_days',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='credit_due_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='credit_paid',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='credit_paid_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='credit_overdue_counted',
            field=models.BooleanField(
                default=False,
                help_text="Muddati o'tganligi foydalanuvchi hisobiga qo'shilganmi."
            ),
        ),
        migrations.AlterField(
            model_name='order',
            name='payment_method',
            field=models.CharField(
                choices=[
                    ('cash', 'Cash on Delivery'),
                    ('card', 'Card (Click/Payme)'),
                    ('credit', 'Qarzga (Kredit)'),
                ],
                default='cash',
                max_length=20,
            ),
        ),
    ]
