"""
products/tasks.py — Fon (async) tarjima.

#N2 FIX: Tarjima `Product.save()` / `Category.save()` ichida SINXRON Google
Translate chaqirardi (2-4 ta tashqi HTTP). Bu admin formani BLOKLARDI: Google
sekinlashsa/ishlamasa — saqlash muzlardi yoki xato berardi.

NEGA THREADING (Celery `.delay()` EMAS):
  Render Procfile'da Celery WORKER yo'q (faqat `web: gunicorn`). Agar tarjima
  Celery navbatiga yuborilsa — uni HECH KIM bajarmaydi, tarjima YO'QOLADI.
  Shuning uchun tarjima `transaction.on_commit` + daemon thread orqali AYNAN
  web jarayonida, commit'dan KEYIN, so'rovni bloklamasdan bajariladi. Worker
  shart emas — har qanday muhitda (lokal, Render) ishlaydi.

  Daemon thread server restart'da yo'qolishi MUMKIN — bu KRITIK emas:
    • mahsulot baribir ishlaydi (tarjima bo'sh bo'lsa serializer o'zbekchaga
      fallback qiladi — `localized()`),
    • `python manage.py translate_products` komandasi bilan keyin to'ldiriladi.

REKURSIYA YO'Q:
  Task tarjimani `Model.objects.filter(pk=...).update(...)` orqali yozadi —
  bu `save()`'ni QAYTA chaqirmaydi (demak qayta-tarjima yoki qayta-WebP yo'q).
"""
from __future__ import annotations

import logging
import threading

from django.db import connections, transaction

logger = logging.getLogger(__name__)


def _translate_product_fields(product_id: int) -> None:
    """Mahsulotning BO'SH tarjima maydonlarini to'ldiradi (fon thread)."""
    from .models import Product, _translate_text
    try:
        p = (
            Product.objects
            .filter(pk=product_id)
            .only('id', 'name', 'description', 'name_ru', 'name_en',
                  'description_ru', 'description_en')
            .first()
        )
        if p is None:
            return
        updates: dict = {}
        if p.name and not p.name_ru:
            updates['name_ru'] = _translate_text(p.name, 'ru')
        if p.name and not p.name_en:
            updates['name_en'] = _translate_text(p.name, 'en')
        if p.description and not p.description_ru:
            updates['description_ru'] = _translate_text(p.description, 'ru')
        if p.description and not p.description_en:
            updates['description_en'] = _translate_text(p.description, 'en')
        if updates:
            Product.objects.filter(pk=product_id).update(**updates)
            logger.info(
                'Fon tarjima yakunlandi: product=%s, maydonlar=%s',
                product_id, list(updates),
            )
    except Exception:
        logger.exception('Fon tarjima xatosi (product_id=%s)', product_id)
    finally:
        # Thread'ning DB ulanishini yopamiz (Postgres ulanish limitini saqlash).
        connections.close_all()


def _translate_category_fields(category_id: int) -> None:
    """Kategoriyaning BO'SH tarjima maydonlarini to'ldiradi (fon thread)."""
    from .models import Category, _translate_text
    try:
        c = (
            Category.objects
            .filter(pk=category_id)
            .only('id', 'name', 'name_ru', 'name_en')
            .first()
        )
        if c is None:
            return
        updates: dict = {}
        if c.name and not c.name_ru:
            updates['name_ru'] = _translate_text(c.name, 'ru')
        if c.name and not c.name_en:
            updates['name_en'] = _translate_text(c.name, 'en')
        if updates:
            Category.objects.filter(pk=category_id).update(**updates)
            logger.info(
                'Fon tarjima yakunlandi: category=%s, maydonlar=%s',
                category_id, list(updates),
            )
    except Exception:
        logger.exception('Fon tarjima xatosi (category_id=%s)', category_id)
    finally:
        connections.close_all()


def _start_thread(fn, ident) -> None:
    threading.Thread(
        target=fn, args=(ident,), daemon=True,
        name=f'{fn.__name__}-{ident}',
    ).start()


def schedule_product_translation(product_id: int) -> None:
    """Commit'dan KEYIN fon tarjimani rejalashtiradi (so'rovni bloklamaydi).

    Tranzaksiya ichida bo'lsa — commit'dan so'ng; autocommit'da — darhol.
    Ikkala holatda ham asl ish thread'da bajariladi → `save()` darrov qaytadi.
    """
    transaction.on_commit(lambda: _start_thread(_translate_product_fields, product_id))


def schedule_category_translation(category_id: int) -> None:
    transaction.on_commit(lambda: _start_thread(_translate_category_fields, category_id))
