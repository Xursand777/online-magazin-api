from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_fix_homebanner_local_datetimes'),
    ]

    operations = [
        migrations.AddField(
            model_name='productvariant',
            name='color_hex',
            field=models.CharField(blank=True, max_length=7, null=True),
        ),
        migrations.AddField(
            model_name='productvariant',
            name='image',
            field=models.ImageField(blank=True, null=True, upload_to='products/variants/'),
        ),
    ]
