from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Real-time polling uchun Order.updated_at indeksi.

    AdminOrdersPollView har 5-6 soniyada Max(updated_at) so'raydi — bu signal
    har qanday buyurtma o'zgarishini (status, kredit, ...) aniqlaydi. Indeks
    bu agregatni seq scan o'rniga O(log n) qiladi.

    Scope: FAQAT AddIndex — Order modelidagi boshqa AlterField'lar
    qo'shilmagan (CLAUDE.md migratsiya gotcha'siga rioya).
    """

    dependencies = [
        ('orders', '0016_courier_navigation_phase_3_0'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='order',
            index=models.Index(fields=['-updated_at'], name='order_updated_at_idx'),
        ),
    ]
