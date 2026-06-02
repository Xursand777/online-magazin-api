"""
core/admin.py — Django admin ro'yxati.

MobileConfig — singleton, faqat super_admin tahrirlaydi.
Add va Delete o'chirilgan (singleton himoyasi).
"""
from django.contrib import admin

from .models import MobileConfig


@admin.register(MobileConfig)
class MobileConfigAdmin(admin.ModelAdmin):
    """
    Singleton admin:
      • Add tugmasi yo'q (yozuv allaqachon bor)
      • Delete tugmasi yo'q (yozuv hech qachon o'chirilmaydi)
      • Faqat tahrirlash mumkin
    """

    list_display = (
        'min_android_version',
        'latest_android_version',
        'maintenance_mode',
        'updated_at',
    )

    fieldsets = (
        ('Android versiyasi', {
            'fields': ('min_android_version', 'latest_android_version', 'play_store_url'),
            'description': (
                "<strong>min_android_version</strong> — bu versiyadan eski "
                "foydalanuvchilar majburiy yangilash ekranini ko'radi.<br>"
                "<strong>latest_android_version</strong> — eng so'nggi rasmiy versiya "
                "(ixtiyoriy yangilash uchun)."
            ),
        }),
        ('iOS versiyasi (kelajakda)', {
            'fields': ('min_ios_version', 'latest_ios_version', 'app_store_url'),
            'classes': ('collapse',),
        }),
        ('Force update xabari (3 tilda)', {
            'fields': (
                'force_update_message_uz',
                'force_update_message_ru',
                'force_update_message_en',
            ),
        }),
        ('Maintenance rejimi (xavfli)', {
            'fields': (
                'maintenance_mode',
                'maintenance_message_uz',
                'maintenance_message_ru',
                'maintenance_message_en',
            ),
            'description': (
                "<strong>DIQQAT:</strong> maintenance_mode=True bo'lsa, "
                "<em>barcha</em> mobil foydalanuvchilar ilovani ishlata olmaydi. "
                "Faqat haqiqiy texnik xizmat vaqtida yoqing va uni darhol "
                "o'chirib qo'ying."
            ),
        }),
    )

    readonly_fields = ('updated_at',)

    def has_add_permission(self, request):
        """Singleton — yangi yozuv qo'shilmaydi."""
        return not MobileConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        """Singleton — o'chirib bo'lmaydi."""
        return False
