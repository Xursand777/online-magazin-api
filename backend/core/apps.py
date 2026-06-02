"""
core/apps.py — Django app konfiguratsiyasi.

Bu 'core' Django app sifatida ro'yxatdan o'tishi uchun kerak:
  • MobileConfig modeli (Phase 1.2 — app version check)
  • Kelajakda boshqa cross-cutting modellar (audit, settings, ...)

DIQQAT — nomi 'CoreConfig':
  Django o'zining ichki AppConfig klassidan foydalanadi (ham app ro'yxati,
  ham models.py'dagi MobileConfig modeli boshqa narsa).
"""
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    verbose_name = 'Core (umumiy sozlamalar)'
