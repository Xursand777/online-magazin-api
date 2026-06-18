"""
image_optimize.py — Rasm optimizatsiyasi (yuklashda WebP'ga aylantirish).

MAQSAD (juda kuchli logika):
  Sayt yoki mobil orqali yuklangan HAR QANDAY rasm (mahsulot, kategoriya,
  banner, ...) serverda BIR MARTA optimizatsiya qilinadi:
    1. EXIF orientatsiyasi qo'llanadi, so'ng metadata (EXIF/GPS) tashlanadi.
    2. Juda katta bo'lsa — aspect ratio saqlab kichraytiriladi (faqat kichik
       tomon, kattalashtirilmaydi).
    3. WebP'ga qayta kodlanadi (sifat ~82 — ko'z ilg'amas, hajm 60-90% kichik).

NEGA WebP (AVIF emas):
  WebP'ni web (brauzer) HAM, Flutter (mobil ilova) HAM qo'llab-quvvatlaydi.
  AVIF undan ~20% kichikroq, LEKIN Flutter AVIF'ni umuman ko'rsata olmaydi —
  shuning uchun cross-platform uchun WebP yagona to'g'ri tanlov.

NEGA SERVER (klient emas):
  Sayt va mobil — ikkalasi ham backendga yuklaydi. Server tomonida bir marta
  ishlov bersak, ikkala tomon ham avtomat foyda ko'radi (yagona manba).

Pillow 11.x JPG/PNG/WebP/AVIF'ni o'qiy oladi. iPhone HEIC uchun pillow-heif
(ixtiyoriy) — bo'lsa ro'yxatdan o'tkazamiz, bo'lmasa graceful o'tkazib yuboriladi.
"""

import io
import os

from PIL import Image, ImageOps
from django.core.files.base import ContentFile

# iPhone HEIC qo'llab-quvvatlash — ixtiyoriy. O'rnatilgan bo'lsa yoqamiz.
try:  # pragma: no cover
    import pillow_heif

    pillow_heif.register_heif_opener()
except Exception:  # pragma: no cover
    pass

# Standart sozlamalar. quality=82 → fotosurat uchun ko'z ilg'amas sifat yo'qotish.
WEBP_QUALITY = 82
DEFAULT_MAX_DIMENSION = 1600


def optimize_to_webp(django_file, *, max_dimension=DEFAULT_MAX_DIMENSION,
                     quality=WEBP_QUALITY):
    """
    Yuklangan rasmni optimizatsiyalangan WebP `ContentFile`'ga aylantiradi.

    Muvaffaqiyatsiz bo'lsa (o'qib bo'lmadi / animatsiya) `None` qaytaradi —
    bunda chaqiruvchi originalni saqlaydi (hech qachon buzilmaydi).
    """
    try:
        django_file.seek(0)
        data = django_file.read()
    except Exception:
        return None

    try:
        img = Image.open(io.BytesIO(data))
        # Animatsiyani (animated GIF/WebP) buzmaymiz — originalni saqlaymiz.
        if getattr(img, 'is_animated', False) and getattr(img, 'n_frames', 1) > 1:
            return None

        # EXIF orientatsiyasini piksellarga qo'llaymiz, so'ng metadata tashlanadi.
        img = ImageOps.exif_transpose(img)

        # Rang rejimi — shaffoflikni (alpha) saqlaymiz, aks holda RGB.
        if img.mode in ('RGBA', 'LA'):
            img = img.convert('RGBA')
        elif img.mode == 'P':
            # Palitra: shaffoflik bo'lishi mumkin → RGBA xavfsiz.
            img = img.convert('RGBA')
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Faqat KICHRAYTIRISH (kattalashtirmaymiz) — aspect ratio saqlanadi.
        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format='WEBP', quality=quality, method=6)
        buf.seek(0)
        return ContentFile(buf.read())
    except Exception:
        return None


def apply_webp(field_file, *, max_dimension=DEFAULT_MAX_DIMENSION,
               quality=WEBP_QUALITY):
    """
    Model `save()` ichida chaqiriladi. Agar `field_file` YANGI yuklangan rasm
    bo'lsa (_committed=False) — uni WebP'ga aylantirib, fayl nomini `.webp`'ga
    o'zgartirib field'ga qaytaradi. Eski (allaqachon saqlangan) rasmga tegmaydi.
    """
    if not field_file or getattr(field_file, '_committed', True):
        return
    content = optimize_to_webp(field_file, max_dimension=max_dimension,
                               quality=quality)
    if content is None:
        return
    base = os.path.splitext(os.path.basename(field_file.name or 'image'))[0]
    # save=False — faylni storage'ga yozadi va nomni yangilaydi, lekin model
    # save()'ni qayta chaqirmaydi (rekursiya yo'q). Original yuklama yozilmaydi.
    field_file.save(f'{base}.webp', content, save=False)
