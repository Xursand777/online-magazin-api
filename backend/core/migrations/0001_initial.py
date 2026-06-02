"""
Phase 1.2 — core app initial migration.

MobileConfig singleton jadvalini yaratadi.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='MobileConfig',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'min_android_version',
                    models.CharField(
                        default='1.0.0',
                        help_text=(
                            "Bu versiyadan eski Android ilovalar MAJBURIY yangilanishi "
                            "kerak. Misol: '1.5.0' qo'ysangiz, 1.4.x va undan past "
                            "versiya foydalanuvchilari ilovani ochganda 'Yangilash' "
                            "ekranini ko'radi."
                        ),
                        max_length=20,
                    ),
                ),
                (
                    'latest_android_version',
                    models.CharField(
                        default='1.0.0',
                        help_text=(
                            "Eng so'nggi rasmiy Android versiyasi. Min'dan farqli — "
                            "bu shunchaki foydalanuvchini ixtiyoriy yangilashga "
                            "undash uchun (kelajakdagi 'optional update' uchun)."
                        ),
                        max_length=20,
                    ),
                ),
                ('min_ios_version', models.CharField(blank=True, default='1.0.0', max_length=20)),
                ('latest_ios_version', models.CharField(blank=True, default='1.0.0', max_length=20)),
                (
                    'force_update_message_uz',
                    models.TextField(default="Ilovangiz eskirgan. Davom etish uchun yangilang."),
                ),
                (
                    'force_update_message_ru',
                    models.TextField(default="Ваше приложение устарело. Пожалуйста, обновите для продолжения."),
                ),
                (
                    'force_update_message_en',
                    models.TextField(default="Your app is outdated. Please update to continue."),
                ),
                (
                    'play_store_url',
                    models.URLField(
                        blank=True,
                        default='',
                        help_text="Google Play Store URL — 'Yangilash' tugmasi shu yerga olib boradi",
                    ),
                ),
                (
                    'app_store_url',
                    models.URLField(
                        blank=True,
                        default='',
                        help_text="Apple App Store URL (kelajakda iOS launch'dan keyin)",
                    ),
                ),
                (
                    'maintenance_mode',
                    models.BooleanField(
                        default=False,
                        help_text=(
                            "True bo'lsa, mobil foydalanuvchilarga 'Texnik xizmat' "
                            "xabari ko'rsatiladi. Deploy paytida yoki DB migration "
                            "vaqtida ishlatish mumkin."
                        ),
                    ),
                ),
                (
                    'maintenance_message_uz',
                    models.TextField(
                        blank=True,
                        default="Texnik xizmat ishlari olib borilmoqda. Iltimos, biroz kutib turing.",
                    ),
                ),
                (
                    'maintenance_message_ru',
                    models.TextField(
                        blank=True,
                        default="Проводятся технические работы. Пожалуйста, подождите немного.",
                    ),
                ),
                (
                    'maintenance_message_en',
                    models.TextField(
                        blank=True,
                        default="Maintenance in progress. Please wait a few minutes.",
                    ),
                ),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Mobil ilova sozlamasi',
                'verbose_name_plural': 'Mobil ilova sozlamasi',
            },
        ),
    ]
