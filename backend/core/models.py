"""
core/models.py — Cross-cutting modellar.

MobileConfig — mobil ilova versiya nazorati (Phase 1.2).
"""
from django.core.cache import cache
from django.db import models


# Cache key — view shu kalit bilan keshlanadi
MOBILE_CONFIG_CACHE_KEY = 'bozor:mobile_config'


class MobileConfig(models.Model):
    """
    Mobil ilova versiya va sozlama nazorati (SINGLETON).

    NIMA UCHUN:
      • Yangi versiya release qilinganda eski versiyalarni majburiy yangilash
      • Kritik bug fix tarqatish (eski mobile foydalanuvchilari majburan yangilanadi)
      • Texnik xizmat rejimi (maintenance mode) — vaqtinchalik ilovani to'xtatish

    QANDAY ISHLAYDI:
      1. Mobil ilova ochilganda GET /api/app-config/ chaqiradi
      2. Joriy versiya min_android_version dan past bo'lsa:
         → "Yangilash kerak" ekran ko'rsatiladi (skip yo'q)
      3. maintenance_mode=True bo'lsa:
         → "Texnik xizmat" ekran ko'rsatiladi (skip yo'q)

    SINGLETON:
      Faqat bitta yozuv bo'lishi shart (pk=1). save() shuni majbur qiladi.
      delete() o'chirilgan — admin ataylab ham o'chira olmaydi.

    XAVFSIZLIK:
      Faqat super_admin Django admin orqali tahrirlaydi.
      Yangilash darhol cache'ni tozalaydi (post_save signal).
    """

    SINGLETON_PK = 1

    # ── Android versiyalari ──────────────────────────────────────────────────
    # Semantic versioning: "MAJOR.MINOR.PATCH" (masalan: "1.2.3")
    min_android_version = models.CharField(
        max_length=20,
        default='1.0.0',
        help_text=(
            "Bu versiyadan eski Android ilovalar MAJBURIY yangilanishi kerak. "
            "Misol: '1.5.0' qo'ysangiz, 1.4.x va undan past versiya foydalanuvchilari "
            "ilovani ochganda 'Yangilash' ekranini ko'radi."
        ),
    )
    latest_android_version = models.CharField(
        max_length=20,
        default='1.0.0',
        help_text=(
            "Eng so'nggi rasmiy Android versiyasi. "
            "Min'dan farqli — bu shunchaki foydalanuvchini ixtiyoriy yangilashga "
            "undash uchun (kelajakdagi 'optional update' uchun)."
        ),
    )

    # ── iOS versiyalari (kelajakda) ─────────────────────────────────────────
    min_ios_version = models.CharField(max_length=20, default='1.0.0', blank=True)
    latest_ios_version = models.CharField(max_length=20, default='1.0.0', blank=True)

    # ── Force update xabari (3 tilda) ───────────────────────────────────────
    force_update_message_uz = models.TextField(
        default="Ilovangiz eskirgan. Davom etish uchun yangilang."
    )
    force_update_message_ru = models.TextField(
        default="Ваше приложение устарело. Пожалуйста, обновите для продолжения."
    )
    force_update_message_en = models.TextField(
        default="Your app is outdated. Please update to continue."
    )

    # ── Store URL'lari ──────────────────────────────────────────────────────
    play_store_url = models.URLField(
        blank=True,
        default='',
        help_text="Google Play Store URL — 'Yangilash' tugmasi shu yerga olib boradi",
    )
    app_store_url = models.URLField(
        blank=True,
        default='',
        help_text="Apple App Store URL (kelajakda iOS launch'dan keyin)",
    )

    # ── Maintenance rejimi ──────────────────────────────────────────────────
    maintenance_mode = models.BooleanField(
        default=False,
        help_text=(
            "True bo'lsa, mobil foydalanuvchilarga 'Texnik xizmat' xabari ko'rsatiladi. "
            "Deploy paytida yoki DB migration vaqtida ishlatish mumkin."
        ),
    )
    maintenance_message_uz = models.TextField(
        blank=True,
        default="Texnik xizmat ishlari olib borilmoqda. Iltimos, biroz kutib turing.",
    )
    maintenance_message_ru = models.TextField(
        blank=True,
        default="Проводятся технические работы. Пожалуйста, подождите немного.",
    )
    maintenance_message_en = models.TextField(
        blank=True,
        default="Maintenance in progress. Please wait a few minutes.",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Mobil ilova sozlamasi'
        verbose_name_plural = 'Mobil ilova sozlamasi'

    def __str__(self):
        return (
            f"MobileConfig(min_android={self.min_android_version}, "
            f"maintenance={self.maintenance_mode})"
        )

    # ── Singleton himoyasi ──────────────────────────────────────────────────

    def save(self, *args, **kwargs):
        """Singleton — har doim pk=1 bilan saqlash."""
        self.pk = self.SINGLETON_PK
        super().save(*args, **kwargs)
        # Cache'ni darhol tozalash — yangi qiymat ko'rinishi uchun
        cache.delete(MOBILE_CONFIG_CACHE_KEY)

    def delete(self, *args, **kwargs):
        """Singleton — o'chirib bo'lmaydi (admin xato bilan o'chirmasin)."""
        # No-op: hech narsa o'chirilmaydi
        return

    @classmethod
    def load(cls) -> 'MobileConfig':
        """Yagona instance qaytaradi. Yo'q bo'lsa default qiymatlar bilan yaratadi."""
        obj, _created = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj
