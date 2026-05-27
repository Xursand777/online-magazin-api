"""
core/__init__.py — Django application initialization.

Celery app'ni shu yerda import qilish uchun Django app registry'si
tayyor bo'lishini ta'minlaydi (autodiscover_tasks ishlashi uchun shart).
"""
# Celery o'rnatilgan bo'lsa — celery_app ni global qilamiz
try:
    from .celery import app as celery_app   # noqa
    __all__ = ('celery_app',)
except ImportError:
    # Celery o'rnatilmagan — xato ko'rsatmaymiz
    pass
