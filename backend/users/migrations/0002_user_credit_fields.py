from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='credit_ban',
            field=models.BooleanField(
                default=False,
                help_text="3 marta muddati o'tgan to'lovdan so'ng buyurtma berish taqiqlanadi."
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='overdue_credit_count',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="Muddati o'tgan kredit buyurtmalar soni. 3 taga yetsa credit_ban=True bo'ladi."
            ),
        ),
    ]
