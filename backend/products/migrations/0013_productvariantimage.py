from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0012_alter_productvariant_options_productvariant_barcode_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductVariantImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(upload_to='products/variant-images/')),
                ('order', models.PositiveIntegerField(default=0)),
                ('variant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='images', to='products.productvariant')),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
    ]
