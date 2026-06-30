from __future__ import annotations

import datetime
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Order,
    OrderDispute,
    OrderDisputeImage,
    OrderHistory,
    OrderItem,
    OrderReturn,
    OrderReturnItem,
    Payment,
    Withdrawal,
)


# ────────────────────────────────────────────────────────────────────────────
#  3 ta to'lov turiga mos holat zanjiri:
#
#  NAQD PUL:  PENDING → CONFIRMED → PACKING → SHIPPING → DELIVERED → RECEIVED
#  KARTA:     AWAITING_PAYMENT → CONFIRMED → PACKING → SHIPPING → DELIVERED → RECEIVED
#  MUDDATLI:  PENDING → CONFIRMED → PACKING → SHIPPING → DELIVERED → RECEIVED
# ────────────────────────────────────────────────────────────────────────────
STATUS_TRANSITIONS = {
    Order.STATUS_AWAITING_PAYMENT: {Order.STATUS_CONFIRMED},  # karta to'lovi tasdiqlandi
    Order.STATUS_PENDING:          {Order.STATUS_CONFIRMED},  # naqd / kredit: admin tasdiqladi
    Order.STATUS_CONFIRMED:        {Order.STATUS_PACKING},
    Order.STATUS_PACKING:          {Order.STATUS_SHIPPING},
    Order.STATUS_SHIPPING:         {Order.STATUS_DELIVERED},
    Order.STATUS_DELIVERED:        {Order.STATUS_RECEIVED},   # kuryer → xaridor qo'liga
    Order.STATUS_RECEIVED:         set(),                     # yakuniy holat
    Order.STATUS_CANCELLED_BY_USER:  set(),
    Order.STATUS_CANCELLED_BY_ADMIN: set(),
    Order.STATUS_SYSTEM_AUTO_CANCEL: set(),
}


def get_line_price(product, variant=None):
    if variant:
        if variant.discount_price and variant.discount_price > 0:
            return variant.discount_price
        if variant.price and variant.price > 0:
            return variant.price
    if product.is_discount and product.discount_price:
        return product.discount_price
    return product.price


def get_line_cost(product, variant=None) -> Decimal:
    """Mahsulot (yoki variant) tannarxi — POS'da chegirma uchun "pol" (floor).

    Variant tannarxi ustunlik qiladi; aks holda mahsulotning o'zi.
    POS'da sotuvchi narxni shu qiymatdan PASTGA tushira olmaydi (zararga
    sotish taqiqlangan — biznes qoidasi). Hech qachon None qaytarmaydi:
    o'rnatilmagan tannarx 0 sifatida qaraladi (ya'ni amalda pol yo'q).
    """
    if variant is not None and variant.cost_price is not None:
        return variant.cost_price
    return product.cost_price if product.cost_price is not None else Decimal('0.00')


def get_line_optom(product, variant=None):
    """Mahsulot (yoki variant) OPTOM (ulgurji) narxi — usta narxi bazasi.

    Variant optomi ustunlik qiladi; aks holda mahsulotning o'zi. Optom
    kiritilmagan bo'lsa None — bu holda usta uchun maxsus narx hisoblanmaydi
    (oddiy sotuv narxi ko'rsatiladi). FAQAT admin/POS optom narxni kiritadi.
    """
    if variant is not None:
        v_optom = getattr(variant, 'optom_price', None)
        if v_optom is not None and v_optom > 0:
            return v_optom
    p_optom = getattr(product, 'optom_price', None)
    if p_optom is not None and p_optom > 0:
        return p_optom
    return None


# ────────────────────────────────────────────────────────────────────────────
#  USTA (master) faollikka asoslangan dinamik chegirma — POG'ONALI (LEVEL) model
#
#  SuperAdmin xohlagan "bazaviy foiz"ni kiritadi (3%, 4%, 5%, 10% — farqi yo'q).
#  Chegirma shu foizga PROPORSIONAL, 5 pog'onali (LEVEL 0..4):
#      LEVEL 4 → bazaviy × 4/4 (to'liq) │ LEVEL 3 → ×3/4 │ LEVEL 2 → ×2/4
#      LEVEL 1 → bazaviy × 1/4          │ LEVEL 0 → 0% (oddiy mijoz narxi)
#
#  ▸ PASAYISH (decay) — VAQTGA bog'liq, ERKIN (tez):
#    Oxirgi xariddan qancha ko'p kun o'tsa, "yangilik shifti" (recency ceiling)
#    shuncha pastga tushadi va daraja shu shiftgacha darhol pasayadi:
#        0–1 kun → shift 4 │ 2 kun → 3 │ 3–4 kun → 2 │ 5–6 kun → 1 │ ≥7 kun → 0
#
#  ▸ KO'TARILISH (recovery) — XARIDGA bog'liq, SEKIN (insof bilan):
#    Har bir haqiqiy xarid darajani FAQAT +1 pog'onaga ko'taradi (4 dan oshmaydi).
#    Ya'ni sustlikdan keyin chegirma bir zumda qaytmaydi — usta uni qayta
#    "ishlab" oladi: har kungi xarid bilan asta-sekin yuqori pog'onaga chiqadi.
#
#  ▸ SODIQLIK YUMSHOQ QO'NISHI (comeback floor) — adolat uchun:
#    Yaqinda faol bo'lgan usta hafta/10 kun tanaffusdan keyin qaytganda 0 ga
#    keskin tushmaydi — avvalgi darajasining YARMIDAN qaytadi (≤14 kun), so'ng
#    choragidan (15–28 kun), 28 kundan keyin esa noldan. Bu floor recency
#    pasayishi bilan max() orqali birlashtiriladi → monoton (ko'proq kutish
#    foyda bermaydi).
#
#  Misol (base=5%, to'liq edi, ~10 kun tanaffus, so'ng har kuni xarid):
#    qaytish kuni:  2.5%(½) → 3.75%(¾) → 5%(to'liq)   (2 kunda to'liq)
#
#  Hammasi xaridlar tarixidan REAL VAQTDA hisoblanadi — saqlanadigan "daraja"
#  maydoni yoki cron kerak emas; bekor qilingan buyurtma avtomatik chiqarib
#  tashlanadi (level qayta hisoblanadi → adolatli, o'zi tuzatiladi).
#
#  Yangi usta (hali xarid qilmagan) — to'liq darajadan boshlaydi (xush kelibsiz).
# ────────────────────────────────────────────────────────────────────────────

_MASTER_MAX_LEVEL = 4
_MASTER_WELCOME_LEVEL = 4            # SuperAdmin ishongan — to'liqdan boshlaydi
_MASTER_HISTORY_LOOKBACK = 40        # so'nggi shuncha xarid simulyatsiya qilinadi
_MASTER_SOFT_HALF_DAYS = 14         # shu kungacha tanaffus → avvalgi darajaning yarmi
_MASTER_SOFT_QUARTER_DAYS = 28      # shu kungacha → choragi; keyin 0 (noldan)
_MASTER_SOFT_MIN_LEVEL = 3          # faqat ≥¾ (sodiq) bo'lganlar yumshoq qo'nadi


def _master_recency_ceiling(gap_days: int) -> int:
    """Oxirgi xariddan o'tgan kunlarga qarab ruxsat etilgan eng yuqori daraja."""
    if gap_days <= 1:
        return 4   # har kuni
    if gap_days == 2:
        return 3   # 2 kunda bir
    if gap_days <= 4:
        return 2   # 3–4 kunda bir
    if gap_days <= 6:
        return 1   # 5–6 kun (sustlashish)
    return 0       # haftalik+ → recency shifti 0


def _master_soft_floor(prior_level: int, gap_days: int) -> int:
    """
    Sodiqlik "yumshoq qo'nishi": yaqinda HAQIQATAN sodiq (≥¾ darajaga chiqqan)
    usta tanaffusdan qaytganda 0 ga keskin tushmaydi — avvalgi darajasining bir
    qismini saqlab qoladi:
        tanaffus ≤ 14 kun  → avvalgi darajaning YARMI (//2)   ← hafta/10 kun shu yerda
        15–28 kun          → CHORAGI (//4)
        ≥29 kun            → 0 (butunlay sovub ketgan — noldan tiklanadi)
    Daraja <¾ bo'lgan tasodifiy xaridorlar yumshoq qo'nmaydi (oddiy pasayadi →
    haftalik buyurtmachi baribir 0% ga tushadi). Floor recency pasayishi bilan
    max() orqali birlashtiriladi (monoton).
    """
    if prior_level < _MASTER_SOFT_MIN_LEVEL:
        return 0
    if gap_days <= _MASTER_SOFT_HALF_DAYS:
        return prior_level // 2
    if gap_days <= _MASTER_SOFT_QUARTER_DAYS:
        return prior_level // 4
    return 0


def _master_standing_from(prior_level: int, gap_days: int) -> int:
    """
    Berilgan oldingi daraja va tanaffusga ko'ra AMALDAGI daraja.
    Recency pasayishi (erkin) va sodiqlik floori (yumshoq qo'nish) — qaysi
    YUQORI bo'lsa. max() monotonlikni saqlaydi (ko'proq tanaffus → kamroq daraja),
    shuning uchun "ataylab kutib turish" foydali bo'lmaydi.
    """
    decayed = min(prior_level, _master_recency_ceiling(gap_days))
    return max(decayed, _master_soft_floor(prior_level, gap_days))


def _master_purchase_times(user):
    """Ustaning so'nggi haqiqiy (bekor qilinmagan, to'lov kutilmayotgan) xaridlari — eskidan yangiga."""
    qs = (
        Order.objects
        .filter(user=user)
        .exclude(status__in=Order.CANCELLATION_STATUSES)
        .exclude(status=Order.STATUS_AWAITING_PAYMENT)
        .order_by('-created_at')
        .values_list('created_at', flat=True)[:_MASTER_HISTORY_LOOKBACK]
    )
    return list(reversed(list(qs)))


def _master_level_after(times) -> int:
    """
    Xaridlar ketma-ketligini "simulyatsiya" qilib, OXIRGI xariddan keyingi
    darajani qaytaradi. Har bir xaridda: avval shu paytdagi daraja hisoblanadi
    (recency pasayishi yoki sodiqlik floori), so'ng xarid uni +1 ko'taradi
    (sekin tiklanish). Daraja ≤4 ga saturatsiya bo'lgani uchun 40 ta xarid
    oynasi joriy darajani aniq beradi.
    """
    if not times:
        return _MASTER_WELCOME_LEVEL
    level = _MASTER_WELCOME_LEVEL
    prev = None
    for t in times:
        if prev is None:
            standing = _MASTER_WELCOME_LEVEL          # birinchi xarid — xush kelibsiz
        else:
            gap = (t - prev).days
            standing = _master_standing_from(level, gap)
        level = min(standing + 1, _MASTER_MAX_LEVEL)  # sekin ko'tarilish (+1)
        prev = t
    return level


def _master_standing_level(user) -> int:
    """Joriy AMALDAGI daraja (0..4): oxirgi xariddan keyingi daraja, hozirgi tanaffusga qarab."""
    times = _master_purchase_times(user)
    if not times:
        return _MASTER_WELCOME_LEVEL                  # yangi usta — to'liq
    level_after = _master_level_after(times)
    gap_now = (timezone.now() - times[-1]).days
    return max(0, _master_standing_from(level_after, gap_now))


def _is_active_master(user) -> bool:
    """Foydalanuvchi autentifikatsiyalangan usta-mi (narx imtiyozi uchun shart)."""
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and getattr(user, 'is_master', False)
    )


def master_pricing_context(user):
    """
    Foydalanuvchi uchun BIR MARTALIK usta-narx konteksti: (active, level, markup).

    Ro'yxat / savat kabi ko'p qatorli joylarda darajani (DB so'rovi) HAR
    qatorda emas, BIR marta hisoblash uchun. `master_line_price` shu kortejni
    qabul qiladi. `active=False` bo'lsa usta narxi umuman qo'llanmaydi.
    """
    from products.models import GlobalSetting

    if not _is_active_master(user):
        return (False, 0, Decimal('0'))
    level = _master_standing_level(user)
    markup = GlobalSetting.get_master_markup_percent()
    return (True, level, markup)


def master_price_from(retail, optom, level: int, markup: Decimal):
    """
    USTA NARXI — OPTOM asosida, faollik darajasiga ko'ra GRADIENT (sof funksiya).

    YANGI MODEL (optom + ustama):
      Usta optom narxidan SuperAdmin kiritgan foiz miqdorida QIMMATROQ sotib
      oladi (chegirma EMAS — optom ustiga ustama). Faollik darajasi (0..4) bu
      imtiyozning qanchasini olishini belgilaydi:

        • LEVEL 4 (to'liq faol) → optom × (1 + markup/100)   ← eng arzon
        • LEVEL 0 (sust)        → retail (oddiy narx, imtiyoz YO'Q → None)
        • oraliq                → retail va optom-narx orasida CHIZIQLI
                                  interpolatsiya (har daraja imtiyozning
                                  level/4 ulushini beradi)

      master_price = retail − (retail − optomNarx) × level / 4

    XAVFSIZLIK KAFOLATLARI (hech qachon buzilmaydi):
      • optom kiritilmagan / retail yo'q / level ≤ 0  → None (oddiy narx)
      • optom+ustama retaildan ARZON bo'lmasa          → None (imtiyoz yo'q)
      • natija retaildan QIMMAT yoki ≤ 0 bo'lsa        → None
      Ya'ni usta narxi DOIM 0 < master_price < retail oralig'ida bo'ladi yoki
      umuman qaytarilmaydi. Butun so'mga yaxlitlanadi.
    """
    if optom is None or retail is None:
        return None
    try:
        optom = Decimal(str(optom))
        retail = Decimal(str(retail))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if optom <= 0 or retail <= 0 or level <= 0:
        return None

    markup = markup if (markup and markup > 0) else Decimal('0')
    optom_price = optom * (Decimal('100') + markup) / Decimal('100')
    # Optom+ustama retaildan arzon bo'lmasa — imtiyoz yo'q.
    if optom_price >= retail:
        return None

    lvl = Decimal(min(max(int(level), 0), _MASTER_MAX_LEVEL))
    price = retail - (retail - optom_price) * lvl / Decimal(_MASTER_MAX_LEVEL)
    price = price.quantize(Decimal('1'))
    # Yaxlitlashdan keyin ham qat'iy 0 < price < retail bo'lishini kafolatlaymiz.
    if price <= 0 or price >= retail:
        return None
    return price


def master_line_price(product, variant, ctx):
    """
    Mahsulot/variant uchun usta narxi (Decimal yoki None) — `ctx` = (active, level, markup).

    Barcha serializerlar, savat va buyurtma yaratish AYNAN shu funksiyadan
    foydalanadi (yagona avtoritar manba — narx hech qayerda mijoz tomonida
    hisoblanmaydi). Optom yo'q yoki imtiyoz yo'q bo'lsa None.
    """
    active, level, markup = ctx
    if not active:
        return None
    return master_price_from(
        get_line_price(product, variant),
        get_line_optom(product, variant),
        level,
        markup,
    )


def master_status(user) -> dict:
    """UI uchun ustaning joriy holati: bazaviy ustama %, daraja, faollik kuchi."""
    from products.models import GlobalSetting

    is_master = _is_active_master(user)
    base = GlobalSetting.get_master_markup_percent()

    if not is_master:
        return {
            'is_master': False,
            'base_percent': float(base),       # to'liq faollikdagi ustama %
            'effective_percent': 0.0,          # (eski mosligi) hozirgi imtiyoz kuchi
            'level': 0,
            'max_level': _MASTER_MAX_LEVEL,
            'benefit_fraction': 0.0,
            'days_since_last_purchase': None,
            'last_purchase_at': None,
        }

    times = _master_purchase_times(user)
    last = times[-1] if times else None
    level = _master_standing_level(user)
    gap = (timezone.now() - last).days if last else None
    # Imtiyoz kuchi = level/4 (optom imtiyozining hozir amaldagi ulushi).
    fraction = (Decimal(level) / Decimal(_MASTER_MAX_LEVEL)).quantize(Decimal('0.01'))

    return {
        'is_master': True,
        'base_percent': float(base),
        # `effective_percent` — eski frontend mosligi uchun saqlanadi, ammo endi
        # "imtiyoz kuchining foizi" (level/4 × 100), chegirma EMAS.
        'effective_percent': float((fraction * Decimal('100')).quantize(Decimal('0.01'))),
        'level': level,
        'max_level': _MASTER_MAX_LEVEL,
        'benefit_fraction': float(fraction),
        'days_since_last_purchase': gap,
        'last_purchase_at': last.isoformat() if last else None,
    }


def _available_stock(product, variant=None):
    return variant.stock if variant else product.stock


def ensure_stock_available(product, quantity, variant=None):
    available = _available_stock(product, variant)
    if available < quantity:
        target = 'variant' if variant else 'product'
        raise serializers.ValidationError(
            {'error': f"{product.name} uchun {target} stock yetarli emas."}
        )


@transaction.atomic
def reserve_inventory(product, quantity, variant=None):
    """
    Tovar zaxirasini atomik kamaytiradi.

    Race condition himoyasi — select_for_update():
      Ikkita so'rov bir vaqtda bir xil variant/product'ga yetganda,
      birinchisi DB darajasida qatorni LOCK qiladi; ikkinchisi birinchi
      transaction tugaguncha KUTADI. Keyin yangilangan (kamaygan) stock
      bilan ishlaydi → stock hech qachon manfiyga tushmaydi.

    Muhim: stale in-memory object emas, DB'dan YANGI qiymat o'qiladi.
    Shuning uchun bu funksiya chaqirilishdan oldingi ensure_stock_available()
    "tez tekshiruv" sifatida qoladi; REAL kafolat esa shu joyda.
    """
    from products.models import ProductVariant as _Variant, Product as _Product

    if variant is not None:
        # DB dan lock bilan yangi qiymat olamiz
        locked = _Variant.objects.select_for_update().get(pk=variant.pk)
        if locked.stock < quantity:
            raise serializers.ValidationError({
                'error': (
                    f"'{product.name}' variant stokda yetarli emas. "
                    f"Mavjud: {locked.stock} dona, siz so'ragan: {quantity} dona."
                )
            })
        locked.stock -= quantity
        locked.save(update_fields=['stock'])
        variant.stock = locked.stock   # in-memory ob'ektni yangilaymiz
    else:
        locked = _Product.objects.select_for_update().get(pk=product.pk)
        if locked.stock < quantity:
            raise serializers.ValidationError({
                'error': (
                    f"'{product.name}' stokda yetarli emas. "
                    f"Mavjud: {locked.stock} dona, siz so'ragan: {quantity} dona."
                )
            })
        locked.stock -= quantity
        locked.save(update_fields=['stock'])
        product.stock = locked.stock   # in-memory ob'ektni yangilaymiz


@transaction.atomic
def restore_inventory(order_item):
    """
    Buyurtma bekor qilinganda tovar zaxirasini qaytaradi.
    select_for_update() orqali bir vaqtda bir nechta bekor qilish
    bir xil mahsulot stockini ikkita xarid orqali yo'qotib qo'ymasligini
    kafolatlaydi (lost-update himoyasi).
    """
    from products.models import ProductVariant as _Variant, Product as _Product

    if order_item.variant_id and order_item.variant_id:
        locked = _Variant.objects.select_for_update().get(pk=order_item.variant_id)
        locked.stock += order_item.quantity
        locked.save(update_fields=['stock'])
        return

    if order_item.product_id:
        locked = _Product.objects.select_for_update().get(pk=order_item.product_id)
        locked.stock += order_item.quantity
        locked.save(update_fields=['stock'])


def create_order_history(order, to_status, actor_type, actor=None, note='', from_status=''):
    return OrderHistory.objects.create(
        order=order,
        from_status=from_status or '',
        to_status=to_status,
        actor_type=actor_type,
        actor=actor,
        note=note or '',
    )


def trigger_refund(payment):
    payment.status = Payment.STATUS_REFUNDED
    payment.refund_reference = payment.refund_reference or f"refund-{payment.order_id}-{uuid4().hex[:8]}"
    payment.refunded_at = timezone.now()
    payment.save(update_fields=['status', 'refund_reference', 'refunded_at', 'updated_at'])
    return payment


@transaction.atomic
def create_order_with_items(
    *, user, receiver_name, receiver_phone, delivery_address,
    payment_method, items, credit_days=None, skip_credit_check=False,
    delivery_lat=None, delivery_lng=None, delivery_notes='',
    allow_price_override=False,
):
    import logging
    _log = logging.getLogger('orders.create')

    if not items:
        raise serializers.ValidationError({'error': "Savat bo'sh."})

    # ⚠ DEFENSIVE NORMALIZATION (Phase 3.0): payment_method qiymatini
    # qat'iy normallashtirish — frontend bug, race condition yoki encoding
    # muammosi sababli noto'g'ri qiymat kelgan bo'lsa, "cash" ga aylantirib
    # log yozamiz. Bu xulq mehmonni HECH QACHON master_required xatoga
    # urinmaslik kafolatini beradi.
    _VALID_PAYMENT_METHODS = {
        Order.PAYMENT_METHOD_CASH,
        Order.PAYMENT_METHOD_CARD,
        Order.PAYMENT_METHOD_CREDIT,
    }
    if payment_method not in _VALID_PAYMENT_METHODS:
        _log.warning(
            "Noto'g'ri payment_method '%s' (user=%s) — 'cash' ga normallashtirildi",
            payment_method, getattr(user, 'phone', None),
        )
        payment_method = Order.PAYMENT_METHOD_CASH

    # ── Phase 3.1 — Profile koordinatasidan AVTOMAT TO'LDIRISH ──────────────
    # Agar buyurtmada koordinata yuborilmagan bo'lsa, UserProfile'dan olamiz.
    # Bu shuni anglatadiki: foydalanuvchi Profile'da bir marta xaritadan
    # manzil tanlasa, har buyurtmada koordinata avtomat ishlatiladi —
    # qayta tanlash shart emas.
    if user is not None and (delivery_lat is None or delivery_lng is None):
        profile = getattr(user, 'profile', None)
        if profile is not None:
            if delivery_lat is None and profile.delivery_lat is not None:
                delivery_lat = profile.delivery_lat
            if delivery_lng is None and profile.delivery_lng is not None:
                delivery_lng = profile.delivery_lng
            # Notes ham — agar bo'sh bo'lsa
            if not delivery_notes and profile.delivery_notes:
                delivery_notes = profile.delivery_notes

    is_credit = (payment_method == Order.PAYMENT_METHOD_CREDIT)

    # Diagnostic log — agar credit bo'lsa, kim va qanday qiymatlar yuborganini
    # ko'rish uchun. Bu Render logs'da ko'rinadi: muammoni topishga yordam beradi.
    if is_credit:
        _log.info(
            "Credit order attempt: user=%s, is_master=%s, can_use_credit=%s, credit_days=%s",
            getattr(user, 'phone', None),
            getattr(user, 'is_master', False),
            getattr(user, 'can_use_credit', False),
            credit_days,
        )

    if is_credit:
        if user is None:
            raise serializers.ValidationError({'error': "Muddatli to'lov faqat ro'yxatdan o'tgan mijozlar uchun mumkin."})
        if credit_days is None:
            raise serializers.ValidationError({'error': "To'lov muddati ko'rsatilmagan."})
        if not (Order.CREDIT_DAYS_MIN <= credit_days <= Order.CREDIT_DAYS_MAX):
            raise serializers.ValidationError({
                'error': f"To'lov muddati {Order.CREDIT_DAYS_MIN} – {Order.CREDIT_DAYS_MAX} kun oralig'ida bo'lishi kerak."
            })

    # Muddatli to'lov cheklovlarini tekshiramiz (admin POS da o'tkazib yuboriladi)
    if is_credit and user is not None and not skip_credit_check:
        check_credit_eligibility(user)

    credit_due_date = None
    if is_credit:
        credit_due_date = timezone.now().date() + datetime.timedelta(days=credit_days)

    # Karta buyurtmalari AWAITING_PAYMENT dan boshlanadi (to'lov kutilmoqda)
    # Naqd va muddatli buyurtmalar PENDING dan boshlanadi (admin tasdiqlaydi)
    initial_status = (
        Order.STATUS_AWAITING_PAYMENT
        if payment_method == Order.PAYMENT_METHOD_CARD
        else Order.STATUS_PENDING
    )

    # MUHIM: usta narx imtiyozini buyurtma YARATILISHIDAN OLDIN hisoblaymiz —
    # aks holda yangi buyurtma "oxirgi xarid" (0 kun) bo'lib darajani buzadi.
    # Ustaning "kirib kelgandagi" holatiga ko'ra narx beriladi; bu xarid esa
    # darajani keyingi safar uchun +1 ko'taradi (sekin ko'tarilish).
    # Endi imtiyoz OPTOM asosida: optom narxidan ustama%, faollik darajasiga
    # ko'ra (master_line_price → optom×(1+markup/100) ↔ retail oralig'ida).
    master_ctx = master_pricing_context(user)

    order = Order.objects.create(
        user=user,
        receiver_name=receiver_name,
        receiver_phone=receiver_phone,
        delivery_address=delivery_address,
        # ── Phase 3.0 — Kuryer navigatsiya koordinatasi va eslatma ─────
        # Mijoz AddressPicker xaritasida pin tanlagan bo'lsa, koordinatalar
        # saqlanadi. Kuryer xaritasi shu nuqtaga yo'l chizadi.
        delivery_lat=delivery_lat,
        delivery_lng=delivery_lng,
        delivery_notes=(delivery_notes or '').strip()[:500],
        payment_method=payment_method,
        status=initial_status,
        is_credit=is_credit,
        credit_days=credit_days if is_credit else None,
        credit_due_date=credit_due_date,
        credit_paid=False,
    )

    # ── Narx hisoblash ───────────────────────────────────────────────────────
    # `total_price`    — haqiqatda sotilgan narx (price_snapshot yig'indisi).
    # `normal_subtotal`— hech qanday POS kelishuvisiz, mahsulotda KO'RSATILGAN
    #                    narx bo'yicha yig'indi (chegirma bazasi).
    # INVARIANT: total_price == Σ(price_snapshot · quantity) — hisobotlar shu
    # tenglikka tayanadi (summary.total_revenue ↔ products[].total_revenue).
    total_price = Decimal('0.00')
    normal_subtotal = Decimal('0.00')
    for item in items:
        product = item['product']
        variant = item.get('variant')
        quantity = int(item.get('quantity', 1))
        ensure_stock_available(product, quantity, variant)
        reserve_inventory(product, quantity, variant)

        # Ko'rsatilgan (kelishuvsiz) narx — usta imtiyozi (optom+ustama, gradient)
        # hisobga olingan holda. Optom yo'q yoki imtiyoz yo'q bo'lsa oddiy narx.
        retail_unit = get_line_price(product, variant)
        master_unit = master_line_price(product, variant, master_ctx)
        normal_unit = master_unit if master_unit is not None else retail_unit

        # ── POS kelishuv narxi (faqat allow_price_override) ──────────────────
        # Admin POS'da har bir mahsulotning narxini qo'lda kiritishi mumkin
        # (kelishtirib chegirma / erkin narx). Oddiy mijoz checkout'ida bu
        # YO'Q — narxni faqat tizim belgilaydi (allow_price_override=False).
        price_override = item.get('price') if allow_price_override else None
        if price_override is not None:
            try:
                final_unit = Decimal(str(price_override)).quantize(Decimal('0.01'))
            except (InvalidOperation, TypeError, ValueError):
                raise serializers.ValidationError(
                    {'error': f"\"{product.name}\" uchun narx noto'g'ri formatda."}
                )
            if final_unit < 0:
                raise serializers.ValidationError(
                    {'error': f"\"{product.name}\" narxi manfiy bo'lishi mumkin emas."}
                )
            # Tannarxdan PAST sotish taqiqlangan (zararga sotish yo'q).
            cost_unit = get_line_cost(product, variant)
            if cost_unit > 0 and final_unit < cost_unit:
                raise serializers.ValidationError({
                    'error': (
                        f"\"{product.name}\" narxi tannarxdan past bo'lishi mumkin "
                        f"emas (tannarx: {cost_unit:.0f} so'm)."
                    ),
                    'code': 'below_cost',
                })
        else:
            final_unit = normal_unit

        # ── Sotuv NARX TURINI aniqlash (hisobot uchun, sotuv vaqtida) ────────
        # Kurs keyin o'zgarsa ham buzilmaydi — bu yerda hozirgi haqiqat yoziladi.
        optom_unit = get_line_optom(product, variant)
        if price_override is not None:
            # POS qo'lda kiritilgan narx: optom bilan AYNAN tengmi, yoki
            # retaildan pastmi (chegirma), yoki oddiy.
            if optom_unit is not None and final_unit == Decimal(str(optom_unit)).quantize(Decimal('0.01')):
                price_type = OrderItem.PRICE_TYPE_OPTOM
            elif final_unit < retail_unit:
                price_type = OrderItem.PRICE_TYPE_DISCOUNT
            else:
                price_type = OrderItem.PRICE_TYPE_RETAIL
        else:
            # Tizim narxi (mijoz checkout): usta imtiyozi qo'llangan bo'lsa MASTER.
            if master_unit is not None and final_unit == master_unit:
                price_type = OrderItem.PRICE_TYPE_MASTER
            else:
                price_type = OrderItem.PRICE_TYPE_RETAIL

        OrderItem.objects.create(
            order=order,
            product=product,
            variant=variant,
            quantity=quantity,
            price_snapshot=final_unit,
            price_type=price_type,
        )
        total_price += final_unit * quantity
        normal_subtotal += normal_unit * quantity

    order.total_price = total_price
    # Umumiy chegirma = ko'rsatilgan narx − sotilgan narx (chek va hisobot uchun).
    # Manfiy bo'lsa (narx ko'tarilgan / markup), chegirma 0 deb yoziladi.
    discount_total = normal_subtotal - total_price
    order.discount_price = discount_total if discount_total > 0 else Decimal('0.00')
    order.save(update_fields=['total_price', 'discount_price', 'updated_at'])

    Payment.objects.create(
        order=order,
        method=payment_method,
        status=Payment.STATUS_PENDING,
        amount=total_price,
    )

    notes = {
        Order.STATUS_AWAITING_PAYMENT: "Buyurtma yaratildi. Karta to'lovi kutilmoqda.",
        Order.STATUS_PENDING:          "Buyurtma yaratildi.",
    }
    create_order_history(
        order,
        to_status=initial_status,
        actor_type=OrderHistory.ACTOR_USER if user else OrderHistory.ACTOR_SYSTEM,
        actor=user,
        note=notes[initial_status],
    )
    return order


@transaction.atomic
def cancel_order(*, order, cancelled_status, actor_type, actor=None, reason=''):
    if order.status in Order.CANCELLATION_STATUSES:
        return order

    # RECEIVED — xaridor qo'liga olgan, bekor qilib bo'lmaydi (hech kim uchun)
    if order.status == Order.STATUS_RECEIVED:
        raise serializers.ValidationError({'error': "Xaridorga topshirilgan buyurtmani bekor qilib bo'lmaydi."})

    if cancelled_status not in Order.CANCELLATION_STATUSES:
        raise serializers.ValidationError({'error': "Noto'g'ri bekor qilish statusi."})

    # Foydalanuvchi faqat PENDING, CONFIRMED, AWAITING_PAYMENT ni bekor qila oladi
    if actor_type == OrderHistory.ACTOR_USER:
        if order.status not in Order.CANCELLABLE_STATUSES:
            raise serializers.ValidationError({
                'error': (
                    f"Buyurtmani '{order.status}' holatida bekor qilib bo'lmaydi. "
                    "Faqat yangi yoki tasdiqlangan buyurtmalarni bekor qilish mumkin."
                )
            })

    # Admin bekor qilishi — to'lov usuliga qarab qat'iy cheklov
    if actor_type == OrderHistory.ACTOR_ADMIN:
        if order.status not in Order.ADMIN_CANCELLABLE_STATUSES:
            raise serializers.ValidationError({
                'error': "Xaridorga topshirilgan yoki allaqachon bekor qilingan buyurtmani bekor qilib bo'lmaydi."
            })

        # NAQD va MUDDATLI: faqat PENDING va CONFIRMED da bekor qilish mumkin
        if order.payment_method in (Order.PAYMENT_METHOD_CASH, Order.PAYMENT_METHOD_CREDIT):
            if order.status not in {Order.STATUS_PENDING, Order.STATUS_CONFIRMED}:
                raise serializers.ValidationError({
                    'error': (
                        f"'{Order.STATUS_PACKING}' boshlangandan keyin buyurtmani bekor qilib bo'lmaydi. "
                        "Tovarlar yig'ilish yoki yo'lda bo'lishi mumkin — kuryer bilan bog'laning."
                    )
                })

    previous_status = order.status
    for item in order.items.select_related('product', 'variant'):
        restore_inventory(item)

    order.status = cancelled_status
    order.cancellation_reason = reason or order.cancellation_reason
    order.cancelled_at = timezone.now()
    order.save(update_fields=['status', 'cancellation_reason', 'cancelled_at', 'updated_at'])

    payment = getattr(order, 'payment', None)
    if payment and payment.status == Payment.STATUS_PAID:
        trigger_refund(payment)

    create_order_history(
        order,
        to_status=cancelled_status,
        from_status=previous_status,
        actor_type=actor_type,
        actor=actor,
        note=reason or 'Buyurtma bekor qilindi.',
    )
    return order


@transaction.atomic
def transition_order_status(*, order, new_status, actor_type, actor=None, note=''):
    # auto_cancel_expired_orders() bu yerda ortiqcha edi:
    #   - Celery Beat har 10 daqiqada avtomatik ishga tushiradi.
    #   - Agar Celery yo'q bo'lsa, 60 soniyalik throttle bilan views orqali ham qo'shimcha chaqirilishi mumkin.
    #   - @transaction.atomic ichida boshqa order'larni bekor qilish kutilmagan yon ta'sir berishi mumkin.
    order.refresh_from_db(fields=['status', 'cancellation_reason', 'cancelled_at', 'updated_at'])

    if new_status == order.status:
        return order

    if new_status in Order.CANCELLATION_STATUSES:
        return cancel_order(
            order=order,
            cancelled_status=new_status,
            actor_type=actor_type,
            actor=actor,
            reason=note,
        )

    allowed = STATUS_TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise serializers.ValidationError(
            {'error': f"{order.status} dan {new_status} ga o'tish mumkin emas."}
        )

    previous_status = order.status
    order.status = new_status
    update_fields = ['status', 'updated_at']

    # ── Phase 2.3 — SHIPPING -> DELIVERED: qabul kodi va disput muddati ─────
    # Kuryer manzilga yetganda mijozga 6 xonali SMS kod yuboriladi. Mijoz uni
    # kuryerga ayttiradi (Phase 2.4 courier-confirm endpoint). Ayni paytda
    # dispute_deadline = now + 7 kun belgilanadi — bu muddat ichida kredit
    # `overdue` deb belgilanmaydi (Phase 2.5).
    #
    # IDEMPOTENCY: agar `received_code` allaqachon belgilangan bo'lsa qayta
    # generatsiya qilmaymiz — STATUS_TRANSITIONS forward-only bo'lsa-da, har
    # ehtimolga qarshi himoya (test, manual DB tahriri, kelajakdagi refactor).
    if (previous_status == Order.STATUS_SHIPPING
            and new_status == Order.STATUS_DELIVERED
            and not order.received_code):
        now = timezone.now()
        order.received_code = order.generate_received_code()
        order.received_code_sent_at = now
        order.received_code_expires_at = order.compute_received_code_expiry(base_time=now)
        order.received_code_used_at = None  # yangi kod — used emas
        order.dispute_deadline = order.compute_dispute_deadline(base_time=now)
        update_fields.extend([
            'received_code',
            'received_code_sent_at',
            'received_code_expires_at',
            'received_code_used_at',
            'dispute_deadline',
        ])

    order.save(update_fields=update_fields)

    payment = getattr(order, 'payment', None)
    if payment:
        # KARTA: AWAITING_PAYMENT → CONFIRMED = to'lov qabul qilindi
        if (new_status == Order.STATUS_CONFIRMED
                and payment.method == Order.PAYMENT_METHOD_CARD
                and payment.status == Payment.STATUS_PENDING):
            payment.status = Payment.STATUS_PAID
            payment.save(update_fields=['status', 'updated_at'])

        # NAQD: RECEIVED = kuryer naqd pulni xaridordan oldi
        elif (new_status == Order.STATUS_RECEIVED
                and payment.method == Order.PAYMENT_METHOD_CASH
                and payment.status == Payment.STATUS_PENDING):
            payment.status = Payment.STATUS_PAID
            payment.save(update_fields=['status', 'updated_at'])

    create_order_history(
        order,
        to_status=new_status,
        from_status=previous_status,
        actor_type=actor_type,
        actor=actor,
        note=note or '',
    )
    return order


def courier_confirm_delivery(
    *,
    order,
    actor,
    received_code: str,
    delivery_photo=None,
    latitude=None,
    longitude=None,
):
    """
    Phase 2.8 (ultra-secure) — Kuryer yetkazib berishni qabul kodi bilan tasdiqlaydi.

    XAVFSIZLIK QATLAMLARI (5 ta mustaqil himoya):
    ────────────────────────────────────────────
      1. Status guard           — order.status == DELIVERED bo'lishi shart
      2. Brute-force lockout    — 5 ta noto'g'ri urinish = 1 soat blok
                                  (cache: bozor:code_fails:{order_id})
      3. One-time use guard     — kod muvaffaqiyatli ishlatilgan bo'lsa rad
                                  (received_code_used_at IS NOT NULL → reject)
      4. TTL guard              — kod 24 soatdan eskirsa rad
                                  (received_code_expires_at < now → reject)
      5. Code presence guard    — received_code DB'da bo'lishi shart

    BRUTE-FORCE LOCKOUT:
      cache.add() atomik mexanizm orqali har order uchun fail counter.
      5 ga yetganda — 1 soat blok, kuryer admin bilan bog'lanishi kerak.
      3 ta urinishda super_admin Telegram alert oladi (potentsial fraud).
      Muvaffaqiyatli kod kiritilganda counter tozalanadi.

    ONE-TIME USE GARANTIYASI:
      Muvaffaqiyatli verifikatsiya paytida received_code_used_at = now()
      o'rnatiladi. Bu maydon NOT NULL bo'lsa — kod qayta ishlatib bo'lmaydi
      (yangi confirm urinishlari darhol rad etiladi).
      Status DELIVERED -> RECEIVED ham o'zgaradi, lekin biz QO'SHIMCHA
      himoya sifatida used_at maydonini ham tekshiramiz (defense in depth).

    HAR YANGI BUYURTMA - YANGI KOD:
      Har order.refresh_from_db() bilan SHIPPING -> DELIVERED transition'da
      `generate_received_code()` yangi kriptografik tasodifiy kod yaratadi
      (secrets.randbelow, 10^6 keyspace). Eski buyurtmalar kodi bilan
      hech qanday bog'liqlik yo'q — har biri mustaqil keyspace.

    Args:
        order: Yetkazib berilishi tasdiqlanayotgan buyurtma.
        actor: Tasdiqlovchi xodim (kuryer yoki admin).
        received_code: Mijoz tomonidan kuryerga ayttirilgan kod.
        delivery_photo: Kuryer olgan rasm (ixtiyoriy).
        latitude, longitude: GPS koordinatalar (ixtiyoriy).

    Returns:
        Order — yangilangan, status=RECEIVED.

    Raises:
        serializers.ValidationError — har bir xavfsizlik qatlami buzilsa,
        aniq error code bilan ('locked', 'code_expired', 'code_used',
        'wrong_code', 'no_code', 'wrong_status').
    """
    from django.core.cache import cache

    # DIQQAT: bu funksiya `@transaction.atomic` BILAN o'ralganmas.
    # Sabab: noto'g'ri kod uchun audit yozuvi `raise` orqali rollback
    # bo'lmasligi kerak (fraud kuzatuvi yo'qoladi).
    order.refresh_from_db(fields=[
        'status', 'received_code', 'received_code_used_at',
        'received_code_expires_at', 'updated_at',
    ])

    # ── 1) STATUS GUARD ─────────────────────────────────────────────────────
    if order.status != Order.STATUS_DELIVERED:
        raise serializers.ValidationError(
            {
                'error': f"Buyurtma {order.status} holatida — DELIVERED kerak edi.",
                'code': 'wrong_status',
            }
        )

    # ── 2) BRUTE-FORCE LOCKOUT ──────────────────────────────────────────────
    # Har order uchun mustaqil counter — bir buyurtma bloklanishi
    # boshqa buyurtmalarga ta'sir qilmaydi.
    fail_key = f'bozor:code_fails:{order.id}'
    try:
        fails = cache.get(fail_key) or 0
    except Exception:
        # Cache yo'q bo'lsa — xavfsizlik tomonida xato qilamiz: bloklamaymiz.
        # (Bu noyob holat, lekin SMS yetkazib berishni butunlay to'xtatib
        # qo'ymaslik kerak.)
        fails = 0

    if fails >= Order.RECEIVED_CODE_MAX_ATTEMPTS:
        # 1 soat blokda. Admin bilan bog'lanish kerak.
        raise serializers.ValidationError(
            {
                'error': (
                    f"Juda ko'p noto'g'ri urinish ({Order.RECEIVED_CODE_MAX_ATTEMPTS} ta). "
                    f"1 soatdan keyin qayta urining yoki admin bilan bog'laning."
                ),
                'code': 'too_many_attempts',
            }
        )

    # ── 3) ONE-TIME USE GUARD ───────────────────────────────────────────────
    # Defense in depth: status RECEIVED ga o'tgan bo'lsa-da, qo'shimcha
    # tekshiruv. Manual DB tahriri yoki status drift xavfsiz qoladi.
    if order.received_code_used_at is not None:
        raise serializers.ValidationError(
            {
                'error': "Bu kod allaqachon ishlatilgan. Qayta ishlatib bo'lmaydi.",
                'code': 'code_used',
            }
        )

    # ── 4) CODE PRESENCE GUARD ──────────────────────────────────────────────
    if not order.received_code:
        raise serializers.ValidationError(
            {
                'error': "Bu buyurtma uchun qabul kodi yaratilmagan. Admin'ga murojaat qiling.",
                'code': 'no_code',
            }
        )

    # ── 5) TTL GUARD (24 soat) ──────────────────────────────────────────────
    if order.is_received_code_expired:
        raise serializers.ValidationError(
            {
                'error': (
                    f"Qabul kodi muddati o'tdi ({Order.RECEIVED_CODE_TTL_HOURS} soat). "
                    f"Admin yangi kod yaratishi kerak."
                ),
                'code': 'code_expired',
            }
        )

    # ── 6) KOD TAQQOSLASH ───────────────────────────────────────────────────
    if received_code != order.received_code:
        # Noto'g'ri urinish — counter +1, audit yozuvi (rasmsiz).
        # Mustaqil transaksiya: ValidationError outer scope'da rollback
        # bo'lsa ham, audit yozuvi va counter saqlanib qoladi.
        new_fails = fails + 1
        try:
            cache.set(fail_key, new_fails, timeout=Order.RECEIVED_CODE_LOCKOUT_SECONDS)
        except Exception:
            pass  # cache xato — bloklamaymiz, lekin audit qilamiz

        with transaction.atomic():
            OrderHistory.objects.create(
                order=order,
                from_status=order.status,
                to_status=order.status,  # status o'zgarmaydi
                actor_type=OrderHistory.ACTOR_USER,
                actor=actor,
                note=f"Kuryer noto'g'ri qabul kodi kiritdi (urinish {new_fails}/{Order.RECEIVED_CODE_MAX_ATTEMPTS})",
                delivery_latitude=latitude,
                delivery_longitude=longitude,
                received_code_verified=False,
            )

        # 3-urinishda admin Telegram alert — potentsial fraud signali.
        if new_fails >= 3:
            try:
                from core.notifications import alert_warning
                alert_warning(
                    f"⚠️ *Shubhali kod urinishi*\n"
                    f"Buyurtma: `#{order.id}`\n"
                    f"Kuryer: `{getattr(actor, 'phone', '?')}`\n"
                    f"Urinish: `{new_fails}/{Order.RECEIVED_CODE_MAX_ATTEMPTS}`\n"
                    f"Brute-force ehtimoli — tekshirib ko'ring."
                )
            except Exception:
                pass

        # Qancha urinish qolganini mijozga aytamiz (kuryerga tushunarli)
        remaining = Order.RECEIVED_CODE_MAX_ATTEMPTS - new_fails
        raise serializers.ValidationError(
            {
                'error': (
                    f"Qabul kodi noto'g'ri. "
                    f"Qolgan urinish: {remaining}."
                    if remaining > 0
                    else "Qabul kodi noto'g'ri. Limit tugadi — 1 soatga bloklandi."
                ),
                'code': 'wrong_code',
                'attempts_left': remaining,
            }
        )

    # ── 7) KOD TO'G'RI — atomik transition + one-time mark ──────────────────
    # `transition_order_status` payment status, SMS signal, history yozuvi —
    # hammasini boshqaradi. So'ngra yaratilgan history yozuviga proof
    # fieldlarni qo'shamiz va order.received_code_used_at ni o'rnatamiz
    # (one-time use kafolat).
    with transaction.atomic():
        order = transition_order_status(
            order=order,
            new_status=Order.STATUS_RECEIVED,
            actor_type=OrderHistory.ACTOR_USER,
            actor=actor,
            note="Yetkazib berish kuryer tomonidan qabul kodi bilan tasdiqlandi",
        )

        # ONE-TIME USE: kodni "used" deb belgilash. Bundan keyin shu kod
        # bilan hech qachon yana confirm qilib bo'lmaydi (used_at IS NOT NULL).
        order.received_code_used_at = timezone.now()
        order.save(update_fields=['received_code_used_at', 'updated_at'])

        last_history = order.history.order_by('-id').first()
        if last_history and last_history.to_status == Order.STATUS_RECEIVED:
            last_history.delivery_photo = delivery_photo
            last_history.delivery_latitude = latitude
            last_history.delivery_longitude = longitude
            last_history.received_code_verified = True
            last_history.save(update_fields=[
                'delivery_photo', 'delivery_latitude',
                'delivery_longitude', 'received_code_verified',
            ])

    # Muvaffaqiyatli — fail counter tozalanadi (keyingi buyurtmalar uchun ham
    # toza boshlash; key allaqachon order-specific edi).
    try:
        cache.delete(fail_key)
    except Exception:
        pass

    return order


# ── Phase 2.5 — Disput muddati hisobga olingan overdue tekshiruv ────────────
def mark_overdue_credits(user) -> dict:
    """
    Foydalanuvchining muddati o'tgan kreditli buyurtmalarini
    `credit_overdue_counted=True` deb belgilaydi va ban hisobini yangilaydi.

    Phase 2.5: `dispute_deadline > now` bo'lgan buyurtmalar overdue deb
    BELGILANMAYDI — mijoz hali shikoyat qilishi mumkin. Faqat:
      * dispute_deadline IS NULL (DELIVERED'ga yetmagan/eski yozuv) yoki
      * dispute_deadline < now (disput oynasi yopilgan)
    bo'lganlari hisobga olinadi.

    Atomic + select_for_update bilan ishlaydi — bir vaqtning o'zida
    bir nechta joyda chaqirilsa ham hisob ikki marta o'smaydi.

    Args:
        user: Tekshirilayotgan foydalanuvchi (cached attributelar yangilanadi).

    Returns:
        {
            'count':                 # Yangi belgilangan buyurtmalar soni
            'banned':                # Foydalanuvchi ban'ga olindimi (3+ overdue)
            'overdue_credit_count':  # Jami overdue (yangidan kelganlar bilan)
        }
    """
    user_model = type(user)
    today = timezone.now().date()
    now = timezone.now()

    with transaction.atomic():
        user_locked = user_model.objects.select_for_update().get(pk=user.pk)

        overdue_qs = (
            Order.objects
            .select_for_update()
            .filter(
                user=user_locked,
                is_credit=True,
                credit_paid=False,
                credit_overdue_counted=False,
                credit_due_date__lt=today,
            )
            # Phase 2.5 — Disput muddati hali o'tmagan bo'lsa hisobga olmaymiz
            .filter(
                Q(dispute_deadline__isnull=True) | Q(dispute_deadline__lt=now)
            )
            .exclude(status__in=Order.CANCELLATION_STATUSES)
            # Phase 3.5: Tovari REFUNDED yoki REPLACED bo'lgan buyurtmalar
            # overdue hisoblanmaydi — mijoz pulni qaytarib oldi yoki
            # almashtirildi, kredit obligatsiyasi tugatilgan/o'tkazilgan.
            .exclude(
                returns__status__in=[
                    OrderReturn.STATUS_REFUNDED, OrderReturn.STATUS_REPLACED,
                ]
            )
        )

        count = overdue_qs.count()
        if count == 0:
            return {
                'count': 0,
                'banned': bool(user_locked.credit_ban),
                'overdue_credit_count': user_locked.overdue_credit_count or 0,
            }

        overdue_qs.update(credit_overdue_counted=True)
        user_locked.overdue_credit_count = (user_locked.overdue_credit_count or 0) + count
        if user_locked.overdue_credit_count >= 3:
            user_locked.credit_ban = True
        user_locked.save(update_fields=['overdue_credit_count', 'credit_ban'])

        # Chaqiruvchining cached user obyektini sinxronlash
        user.credit_ban = user_locked.credit_ban
        user.overdue_credit_count = user_locked.overdue_credit_count

        return {
            'count': count,
            'banned': bool(user_locked.credit_ban),
            'overdue_credit_count': user_locked.overdue_credit_count,
        }


@transaction.atomic
def check_credit_eligibility(user):
    """
    Foydalanuvchi buyurtma bera olishini tekshiradi.

    Tartib (eng cheklov birinchi):
      0. Faqat ustalar muddatli to'lov ishlatishi mumkin. ←── ENG MUHIM
      1. credit_ban=True (3 marta muddati o'tgan)
      2. Muddati o'tgan, to'lanmagan muddatli buyurtma mavjud
      3. Hali to'lanmagan aktiv muddatli buyurtma mavjud

    Race condition'dan himoya uchun select_for_update ishlatiladi.

    XAVFSIZLIK: bu funksiya BACKEND AUTHORITATIVE check — frontend gating
    (Checkout.tsx, AdminPOS.tsx) faqat UX uchun. Bypass urinishlari (URL
    manipulatsiya, to'g'ridan-to'g'ri API call) shu yerda blocklanadi.
    """
    from django.db import transaction as db_transaction

    # Foydalanuvchini lock qilib olamiz
    user_locked = user.__class__.objects.select_for_update().get(pk=user.pk)

    # ── 0-tekshiruv — Muddatli to'lov FAQAT ustalar uchun ───────────────────
    # Bu eng yuqori cheklov: agar mijoz usta bo'lmasa, boshqa hech narsani
    # tekshirmaymiz (overdue, ban — kerakmas). Aniq error code'i frontend
    # uchun (translation/UI uchun).
    if not user_locked.can_use_credit:
        raise serializers.ValidationError({
            'error': (
                "Muddatli to'lov faqat ustalar uchun. "
                "Iltimos, naqd yoki karta bilan to'lash usulini tanlang."
            ),
            'code': 'master_required',
        })

    if user_locked.credit_ban:
        raise serializers.ValidationError({
            'error': (
                "Siz buyurtma bera olmaysiz. "
                "3 marta to'lov muddatini o'tkazib yuborgansiz — "
                "muddatli to'lov imkoniyatingiz doimiy bloklangan."
            )
        })

    # Phase 2.5 — disput muddati hisobga olingan overdue tekshiruv (DRY helper).
    # Eslatma: dispute_deadline > now bo'lgan buyurtmalar bu yerda
    # overdue deb belgilanmaydi.
    result = mark_overdue_credits(user)
    if result['count'] > 0:
        if result['banned']:
            raise serializers.ValidationError({
                'error': (
                    "To'lov muddatingiz 3 marta o'tib ketdi. "
                    "Muddatli to'lov imkoniyatingiz doimiy bloklandi. "
                    "Qo'shimcha ma'lumot uchun do'kon bilan bog'laning."
                )
            })
        raise serializers.ValidationError({
            'error': (
                "Sizda muddati o'tgan to'lanmagan muddatli to'lov buyurtmangiz bor. "
                "Avval uni to'lang, keyin yangi buyurtma bering."
            )
        })

    # Hali muddati kelmagan, lekin to'lanmagan aktiv muddatli buyurtma
    active_credit = (
        Order.objects
        .filter(user=user_locked, is_credit=True, credit_paid=False)
        .exclude(status__in=Order.CANCELLATION_STATUSES)
        .order_by('credit_due_date')
        .first()
    )

    if active_credit:
        raise serializers.ValidationError({
            'error': (
                f"Sizda to'lanmagan muddatli to'lov buyurtmangiz mavjud (#{active_credit.id}). "
                f"To'lov muddati: {active_credit.credit_due_date}. "
                "Avval uni to'lang, keyin yangi buyurtma bering."
            )
        })


@transaction.atomic
def pay_credit_order(*, order, actor=None):
    """Admin muddatli to'lov buyurtmasini to'langan deb belgilaydi."""
    if not order.is_credit:
        raise serializers.ValidationError({'error': "Bu muddatli to'lov buyurtmasi emas."})
    if order.credit_paid:
        raise serializers.ValidationError({'error': "Bu muddatli to'lov allaqachon to'langan."})
    if order.status in Order.CANCELLATION_STATUSES:
        raise serializers.ValidationError({'error': "Bekor qilingan buyurtmani to'lab bo'lmaydi."})

    order.credit_paid = True
    order.credit_paid_at = timezone.now()
    order.save(update_fields=['credit_paid', 'credit_paid_at', 'updated_at'])

    payment = getattr(order, 'payment', None)
    if payment and payment.status == Payment.STATUS_PENDING:
        payment.status = Payment.STATUS_PAID
        payment.save(update_fields=['status', 'updated_at'])

    create_order_history(
        order,
        to_status=order.status,
        from_status=order.status,
        actor_type=OrderHistory.ACTOR_ADMIN if actor else OrderHistory.ACTOR_SYSTEM,
        actor=actor,
        note="Muddatli to'lov qabul qilindi.",
    )
    return order


# Cache kaliti va throttle muddati (soniyada)
# 60 soniya yetarli: karta to'lovi 30 DAQIQA muddat, har daqiqada tekshirish
# DB ni ortiqcha yuklashdan saqlaydi va multi-worker'da bir marta ishlaydi.
_AUTO_CANCEL_CACHE_KEY = 'bozor:auto_cancel_lock'
_AUTO_CANCEL_COOLDOWN_SEC = 60


def auto_cancel_expired_orders(minutes: int = 30) -> None:
    """
    Karta buyurtmalari: 30 daqiqa ichida to'lov bo'lmasa avtomatik bekor qilinadi.

    Throttle mexanizmi (Performance muammosi yechimi):
    ──────────────────────────────────────────────────
    Bu funksiya views.py'da 6 ta joyda chaqiriladi. Har bir GET /orders/ so'rovida
    to'liq DB query ishlagan bo'lar edi. 5000 foydalanuvchi bo'lsa → yuzlab
    paralel query → DB ning katta qismi faqat shu bilan band bo'ladi.

    cache.add() yordamida ATOMIK distributed lock:
      • Redis'da SETNX (SET if Not eXists) — atomik operatsiya
      • Birinchi worker lock'ni oladi va ishlaydi (add → True)
      • Qolgan workerlar 60 soniya davomida o'tkazib yuboradi (add → False)
      • LocMemCache da ham ishlaydi (development), lekin workerlar o'rtasida emas
      • 60 soniya → karta to'lovi 30 DAQIQA, shuning uchun 1 daqiqa juda yetarli

    Nima yo'qolmaydi:
      Har daqiqada kamida bitta worker bekor qilishni amalga oshiradi.
      To'lov muddati 30 daqiqa → eng yomon holda 31 daqiqada bekor qilinadi.
    """
    if not getattr(settings, 'IS_TESTING', False):
        from django.core.cache import cache

        # cache.add(): kalit mavjud bo'lmasa True va kalitni qo'yadi (atomik)
        # Kalit mavjud bo'lsa False qaytaradi — boshqa worker yaqinda bajargan
        if not cache.add(_AUTO_CANCEL_CACHE_KEY, 1, timeout=_AUTO_CANCEL_COOLDOWN_SEC):
            return  # throttle: 60 soniya ichida allaqachon bajarilgan

    threshold = timezone.now() - timedelta(minutes=minutes)
    expired_orders = list(
        Order.objects
        .select_related('payment')
        .prefetch_related('items__product', 'items__variant')
        .filter(
            status=Order.STATUS_AWAITING_PAYMENT,    # Karta: to'lov kutilmoqda
            payment_method=Order.PAYMENT_METHOD_CARD,
            payment__status=Payment.STATUS_PENDING,
            created_at__lte=threshold,
        )
    )
    for order in expired_orders:
        cancel_order(
            order=order,
            cancelled_status=Order.STATUS_SYSTEM_AUTO_CANCEL,
            actor_type=OrderHistory.ACTOR_SYSTEM,
            reason="To'lov 30 daqiqa ichida amalga oshirilmadi.",
        )


# ── Phase 2.6 — Order dispute services ──────────────────────────────────────
import logging as _disp_logging
_disp_logger = _disp_logging.getLogger(__name__)


# ── Phase 2.8 — Disput muddati FALLBACK (NULL bo'lganda) ────────────────────
#
# MUAMMO: NIMA UCHUN ESKI BUYURTMALARDA MIJOZ 6 OYDAN KEYIN SHIKOYAT OCHARDI?
# ───────────────────────────────────────────────────────────────────────────
#   Phase 2.2 (2025) da Order modeliga `dispute_deadline` maydoni qo'shildi:
#   SHIPPING → DELIVERED transition'da `now + 7 kun` qiymati yoziladi.
#
#   Lekin u maydon migration bilan qo'shilganda — ESKI buyurtmalardagi
#   qiymat NULL bo'lib qoldi. Faqat YANGI buyurtmalarga yoziladi.
#
#   create_order_dispute'dagi tekshiruv:
#       if order.dispute_deadline and timezone.now() > order.dispute_deadline:
#           raise "Disput muddati o'tdi"
#
#   Mantiqiy zanjir:
#     • dispute_deadline IS NULL  → birinchi shart `order.dispute_deadline`
#       Falsy bo'lib `and` zanjiri True bo'lmaydi
#     • Natija: tekshiruv O'TKAZIB YUBORILADI
#     • Eski buyurtmaga 6 oy, 1 yil, 2 yil keyin ham disput OCHISH MUMKIN
#
#   REAL ZARAR STSENARIY:
#     6 oy oldin yetkazilgan iPhone — mijoz "qutib bo'lgan" deydi
#     Biz uchun rasm/GPS dalil 6 oylik (Cloudinary auto-delete bo'lgan
#     bo'lishi mumkin), kuryer ham boshqa joyda — refund qilishga majbur
#     bo'lamiz.
#
# YECHIM — FALLBACK ALGORITMI:
# ───────────────────────────────────────────────────────────────────────────
#   1. dispute_deadline mavjud bo'lsa — uni ishlatamiz (yangi xulq)
#   2. NULL bo'lsa — buyurtma tarixidan RECEIVED/DELIVERED vaqtini topamiz
#      va shu vaqtga FALLBACK_DISPUTE_DAYS (30 kun) qo'shamiz
#   3. Tarix yo'q bo'lsa (g'ayritabiiy) — order.updated_at + 30 kun
#   4. Bo'lmasa — order.created_at + 30 kun (oxirgi himoya)
#
#   30 kun TANLOVI:
#     • Standart Phase 2.2 disput oynasi — 7 kun
#     • Eski buyurtmalar uchun yumshoqroq qoida — 30 kun (insof)
#     • 30 kundan ortiq bo'lsa: rasm/GPS dalil ham yo'q, ob'ektiv tahlil
#       imkonsiz — disput rad etiladi
#
#   Bu yondashuv MIGRATIONS'siz ishlaydi — DB'dagi NULL'lar saqlanadi,
#   faqat application darajasidagi fallback. Yangi buyurtmalar uchun real
#   `dispute_deadline` ishlatiladi (7 kun, qattiqroq).
#
# ───────────────────────────────────────────────────────────────────────────
_FALLBACK_DISPUTE_DAYS = 30


def _resolve_dispute_deadline(order) -> 'datetime.datetime':
    """Disput muddatini aniqlash — NULL bo'lsa fallback.

    Tartib:
      1. order.dispute_deadline (Phase 2.2) — eng aniq, ustuvor
      2. OrderHistory'dan RECEIVED yoki DELIVERED transition vaqti + 30 kun
      3. order.updated_at + 30 kun  (history yo'q bo'lsa)
      4. order.created_at + 30 kun  (oxirgi himoya)

    Args:
        order: Order obyekti.

    Returns:
        datetime — shu vaqtgacha disput ochish mumkin.
    """
    if order.dispute_deadline:
        return order.dispute_deadline

    # ── FALLBACK: tarixdan RECEIVED/DELIVERED vaqtini olamiz ────────────────
    # RECEIVED ustuvor (mijoz haqiqatan qo'liga olgan vaqt).
    # DELIVERED — kuryer eshikda turgan vaqt (RECEIVED'ga yetmagan eski
    # buyurtmalar uchun).
    base_time = None
    history = list(
        order.history
        .filter(to_status__in=[Order.STATUS_RECEIVED, Order.STATUS_DELIVERED])
        .order_by('-id')[:5]  # eng yangi 5 ta
    )
    # Avval RECEIVED'ni qidiramiz
    for h in history:
        if h.to_status == Order.STATUS_RECEIVED:
            base_time = h.created_at
            break
    # Bo'lmasa DELIVERED
    if base_time is None:
        for h in history:
            if h.to_status == Order.STATUS_DELIVERED:
                base_time = h.created_at
                break

    # Hech narsa topilmasa — order.updated_at (oxirgi modifikatsiya)
    if base_time is None:
        base_time = order.updated_at or order.created_at

    return base_time + timedelta(days=_FALLBACK_DISPUTE_DAYS)


def create_order_dispute(
    *,
    order,
    customer,
    reason: str,
    evidence_images=None,
):
    """
    Phase 2.6 — Mijoz buyurtma haqida shikoyat ochadi.

    Cheklovlar:
      1. order.user == customer
      2. order.status in {DELIVERED, RECEIVED} — yetkazilmagan buyurtmaga
         shikoyat o'rinli emas (uni avval bekor qilish kerak).
      3. order.dispute_deadline o'tmagan bo'lsa kerak (mavjud bo'lsa).
      4. Aktiv (open/under_review) disput allaqachon yo'qligi.

    Yon ta'sirlar:
      - Telegram admin alert (fire-and-forget).

    Args:
        order: Shikoyat ochilayotgan buyurtma.
        customer: Buyurtma egasi (request.user).
        reason: Shikoyat sababi (matn).
        evidence_images: List of UploadedFile (ko'p rasm) yoki None.

    Returns:
        OrderDispute — yaratilgan disput.

    Raises:
        serializers.ValidationError — biror cheklov buzilsa.
    """
    if order.user_id != customer.id:
        raise serializers.ValidationError(
            {'error': "Bu sizning buyurtmangiz emas."}
        )

    if order.status not in {Order.STATUS_DELIVERED, Order.STATUS_RECEIVED}:
        raise serializers.ValidationError(
            {'error': "Faqat yetkazilgan buyurtmaga shikoyat qilish mumkin."}
        )

    # ── Phase 2.8 — Disput muddati NULL bo'lsa fallback (eski buyurtmalar) ──
    # Phase 2.2 dan oldingi buyurtmalarda dispute_deadline NULL.
    # _resolve_dispute_deadline:
    #   • dispute_deadline mavjud → uni ishlatadi (yangi xulq)
    #   • NULL → OrderHistory'dan RECEIVED/DELIVERED vaqti + 30 kun
    # Mijoz hech qachon 30 kundan ortiq vaqtdan keyin disput ocha olmaydi.
    effective_deadline = _resolve_dispute_deadline(order)
    if timezone.now() > effective_deadline:
        # Aniq sabab xabari — yangi va eski buyurtmalar uchun har xil
        if order.dispute_deadline:
            error_msg = (
                "Disput muddati o'tdi (7 kun). "
                "Qo'llab-quvvatlash xizmatiga murojaat qiling."
            )
        else:
            error_msg = (
                f"Bu buyurtma uchun disput muddati o'tdi "
                f"(yetkazilgandan {_FALLBACK_DISPUTE_DAYS} kun). "
                f"Qo'llab-quvvatlash xizmatiga murojaat qiling."
            )
        raise serializers.ValidationError(
            {
                'error': error_msg,
                'code': 'dispute_window_closed',
                'deadline': effective_deadline.isoformat(),
            }
        )

    if order.disputes.filter(status__in=OrderDispute.ACTIVE_STATUSES).exists():
        raise serializers.ValidationError(
            {'error': "Bu buyurtmada hali yopilmagan disput mavjud."}
        )

    with transaction.atomic():
        dispute = OrderDispute.objects.create(
            order=order,
            reason=reason,
        )
        for img in (evidence_images or []):
            OrderDisputeImage.objects.create(dispute=dispute, image=img)

    # Telegram alert — fire-and-forget. Tranzaksiyadan tashqarida —
    # alert xato bo'lsa disput yozuvi rollback bo'lmasligi kerak.
    try:
        from core.notifications import alert_warning
        alert_warning(
            f"🚨 *Yangi disput*\n"
            f"Buyurtma: `#{order.id}`\n"
            f"Mijoz: `{customer.phone}`\n"
            f"Sabab: {reason[:200]}{'...' if len(reason) > 200 else ''}"
        )
    except Exception as exc:
        _disp_logger.warning("Disput Telegram alert yuborilmadi: %s", exc)

    return dispute


def update_order_dispute(
    *,
    dispute,
    admin,
    new_status: str | None = None,
    resolution_note: str | None = None,
):
    """
    Phase 2.6 — Admin disput statusini yangilaydi.

    Resolved statuslarga o'tilganda `resolved_at` va `resolved_by` avtomat
    o'rnatiladi. Allaqachon resolved bo'lgan disputni qayta `open`'ga
    qaytarib bo'lmaydi (audit yaxlitligi uchun).

    Args:
        dispute: Yangilanayotgan disput.
        admin: Qaror qabul qilayotgan admin (request.user).
        new_status: Yangi status yoki None (o'zgartirmaslik).
        resolution_note: Yangi izoh yoki None.

    Returns:
        OrderDispute — yangilangan disput.

    Raises:
        serializers.ValidationError — invariant buzilsa.
    """
    update_fields = []

    if new_status is not None and new_status != dispute.status:
        # Resolved -> Active qaytish taqiqlangan
        if dispute.is_resolved and new_status in OrderDispute.ACTIVE_STATUSES:
            raise serializers.ValidationError(
                {'error': "Hal qilingan disputni qayta ochib bo'lmaydi."}
            )
        # Valid choice ekanligi (extra paranoia — serializer ham tekshiradi)
        valid_choices = {c[0] for c in OrderDispute.STATUS_CHOICES}
        if new_status not in valid_choices:
            raise serializers.ValidationError(
                {'error': f"Noma'lum status: {new_status}"}
            )
        dispute.status = new_status
        update_fields.append('status')

        if new_status in OrderDispute.RESOLVED_STATUSES:
            dispute.resolved_at = timezone.now()
            dispute.resolved_by = admin
            update_fields.extend(['resolved_at', 'resolved_by'])

    if resolution_note is not None:
        dispute.resolution_note = resolution_note
        update_fields.append('resolution_note')

    if update_fields:
        with transaction.atomic():
            dispute.save(update_fields=update_fields)

    return dispute


# ── Phase 2.7 (qayta dizayn) — Mijozni ban'dan chiqarish (1 chance) ────────
def lift_user_credit_ban(*, user, admin, reason: str = ''):
    """
    Phase 2.7 (revised) — Banlangan mijozga 1 ta qayta imkoniyat berish.

    SEMANTIKA:
      Avvalgi dizayn (per-order pardon) admin'ga 3 ta strike qaytarib berardi
      — bu suiiste'mol uchun ochiq edi. Yangi dizayn:
        • Faqat `credit_ban=True` mijozda ishlaydi (precondition).
        • `overdue_credit_count = 2` qo'yiladi — endi 1 ta yangi overdue
          mijozni darhol qaytadan ban'ga olib boradi.
        • Mavjud, lekin hali "counted" emas bo'lgan overdue buyurtmalar
          ham "forgiven" deb belgilanadi (`credit_overdue_counted=True`),
          aks holda cron darhol qaytadan ban qilardi va admin'ning unban
          ta'siri yo'qotilardi.

    YO'Q QILMAYDI:
      • Eski overdue buyurtmalarning `credit_overdue_counted` ni False'ga
        qaytarmaydi — DB tarixi saqlanadi.
      • `overdue_credit_count` ni 0 ga qaytarmaydi — mijoz allaqachon
        ishonchni yo'qotgan, faqat oxirgi imkoniyat.

    Args:
        user: Banlangan foydalanuvchi.
        admin: Ban'ni olib tashlayotgan admin (request.user).
        reason: Audit uchun sabab.

    Returns:
        Foydalanuvchi (cached attributes sinxron).

    Raises:
        serializers.ValidationError — mijoz ban'da emas.
    """
    if not user.credit_ban:
        raise serializers.ValidationError(
            {'error': "Foydalanuvchi kredit ban'da emas."}
        )

    today = timezone.now().date()
    user_model = type(user)

    with transaction.atomic():
        user_locked = user_model.objects.select_for_update().get(pk=user.pk)

        # Race tekshiruvi
        if not user_locked.credit_ban:
            raise serializers.ValidationError(
                {'error': "Foydalanuvchi allaqachon ban'dan chiqarilgan (race)."}
            )

        # Mavjud, hali counted bo'lmagan overdue buyurtmalarni "forgive" qil.
        # Aks holda cron'ning keyingi sikli ularni darhol topib, count'ni
        # yana 3+ ga ko'tarib qaytadan ban qilardi -> unban behushga aylanardi.
        forgive_qs = (
            Order.objects
            .select_for_update()
            .filter(
                user=user_locked,
                is_credit=True,
                credit_paid=False,
                credit_overdue_counted=False,
                credit_due_date__lt=today,
            )
            .exclude(status__in=Order.CANCELLATION_STATUSES)
        )
        forgiven_count = forgive_qs.update(credit_overdue_counted=True)

        # 1 ta imkoniyat: count=2 (1 ta yangi overdue -> 3 -> qaytadan ban)
        user_locked.overdue_credit_count = 2
        user_locked.credit_ban = False
        user_locked.save(update_fields=['overdue_credit_count', 'credit_ban'])

        # Caller'ning cached user obyektini sinxronlash
        user.overdue_credit_count = user_locked.overdue_credit_count
        user.credit_ban = user_locked.credit_ban

    # Audit izi — Phase 1.1 AuditLog middleware HTTP yo'l orqali
    # avtomat yozadi. Reason allaqachon endpoint body'sida bor.
    return {
        'user': user,
        'forgiven_orders': forgiven_count,
        'reason': reason,
    }


# ────────────────────────────────────────────────────────────────────────────
#  Phase 3.1 — Qaytarish (Return / Refund) servislari
#
#  Asosiy kontrakt:
#    check_return_eligibility(order, items=None) — yagona eligibility manbasi.
#      `items` berilsa, faqat shu OrderItem'lar uchun tekshiradi (qisman qaytarish).
#      Block holatda RAISES `serializers.ValidationError({error, code})`.
#      Allowed holatda QAYTARADI {'window_left_seconds': int, 'returnable_items': [...]}.
#
#    transition_return_status(return_obj, new_status, actor, ...) — yagona
#      chokepoint barcha status o'tishlari uchun (Phase 2 dizayni bilan bir xil).
#      Status mashinasi STATE_TRANSITIONS_RETURN'da. Stok va Order.returned_qty
#      faqat SUCCESS_STATUSES ga o'tganda yangilanadi.
# ────────────────────────────────────────────────────────────────────────────


# Qaytarish status zanjiri (state machine).
# REQUESTED → APPROVED → PICKUP_SCHEDULED → PICKED_UP → INSPECTING → ACCEPTED →
#             REFUNDED | REPLACED                                    → REJECTED
# CANCELLED — har qanday faol holatdan mumkin (lekin TERMINAL'dan emas).
STATUS_TRANSITIONS_RETURN = {
    OrderReturn.STATUS_REQUESTED: {
        OrderReturn.STATUS_APPROVED,
        OrderReturn.STATUS_REJECTED,
        OrderReturn.STATUS_CANCELLED,
    },
    OrderReturn.STATUS_APPROVED: {
        # Mijoz tovarni O'ZI do'konga olib keladi (kuryer YO'Q) → to'g'ridan
        # "Tovar olindi" (do'konda qabul qilindi). PICKUP_SCHEDULED ishlatilmaydi.
        OrderReturn.STATUS_PICKED_UP,
        OrderReturn.STATUS_CANCELLED,
    },
    # STATUS_PICKUP_SCHEDULED — endi ishlatilmaydi (kuryer bilan olib ketish yo'q).
    # Const va label backward-compat uchun saqlanadi, lekin yangi qaytarishlar
    # bu statusga o'tmaydi (transition yo'q).
    OrderReturn.STATUS_PICKUP_SCHEDULED: {
        OrderReturn.STATUS_PICKED_UP,
        OrderReturn.STATUS_CANCELLED,
    },
    OrderReturn.STATUS_PICKED_UP: {
        OrderReturn.STATUS_INSPECTING,
        OrderReturn.STATUS_CANCELLED,
    },
    OrderReturn.STATUS_INSPECTING: {
        OrderReturn.STATUS_ACCEPTED,
        OrderReturn.STATUS_REJECTED,
        OrderReturn.STATUS_CANCELLED,
    },
    OrderReturn.STATUS_ACCEPTED: {
        OrderReturn.STATUS_REFUNDED,
        OrderReturn.STATUS_REPLACED,
    },
    # TERMINAL holatlardan chiqib bo'lmaydi — buxgalteriya integrity.
    OrderReturn.STATUS_REFUNDED:  set(),
    OrderReturn.STATUS_REPLACED:  set(),
    OrderReturn.STATUS_REJECTED:  set(),
    OrderReturn.STATUS_CANCELLED: set(),
}


# Eligibility uchun buyurtma statuslari — qaytarish faqat shu statuslarda bo'lsa
# mumkin (DELIVERED yoki RECEIVED). SHIPPING'da rad etish alohida oqim
# (kuryer ilovasidan).
RETURNABLE_ORDER_STATUSES = frozenset({
    Order.STATUS_DELIVERED,
    Order.STATUS_RECEIVED,
})


def default_return_item_disposition(reason_code: str) -> tuple:
    """
    Qaytarish SABABIGA qarab buyumning DEFAULT holati (inspector keyin
    AdminReturnItemUpdateView orqali o'zgartira oladi).

    Defekt sabablar (defective / damaged_in_transit / quality_issue):
        → condition=defective, restock=False, writeoff=defect
        Ya'ni: sotuvga YAROQSIZ → stokka qaytmaydi → "Defektlar" bo'limiga
        tushadi → saytga/mobil katalogga qayta CHIQMAYDI.

    Boshqa sabablar (changed_mind / size_mismatch / wrong_item / ...):
        → condition=new, restock=True
        Ya'ni: ishlatilmagan, soz → stokka qaytadi → sotuvda qoladi.

    Returns: (condition, restock, writeoff_reason)
    """
    from .models import OrderReturn, OrderReturnItem
    defect_reasons = {
        OrderReturn.REASON_DEFECTIVE,
        OrderReturn.REASON_DAMAGED_IN_TRANSIT,
        OrderReturn.REASON_QUALITY_ISSUE,
    }
    if reason_code in defect_reasons:
        return (
            OrderReturnItem.CONDITION_DEFECTIVE,
            False,
            OrderReturnItem.WRITEOFF_DEFECT,
        )
    return (OrderReturnItem.CONDITION_NEW, True, OrderReturnItem.WRITEOFF_NONE)


def check_return_eligibility(order: Order, items: list | None = None) -> dict:
    """
    Buyurtma (yoki uning bir qancha item'lari) qaytarish uchun mosligini tekshiradi.

    Block holatda RAISES `serializers.ValidationError({error, code})`.
    Allow holatda QAYTARADI:
        {
          'window_left_seconds': int,
          'returnable_items': [{'order_item_id': int, 'returnable_qty': int, 'price': Decimal}, ...]
        }

    Tartib (eng cheklov birinchi — Phase 2.5 `check_credit_eligibility` uslubi):

      1. Buyurtma DELIVERED yoki RECEIVED bo'lishi kerak (window mantiqiy
         hisoblanadi shu statuslar uchun).
      2. dispute_deadline > now (Phase 2.6 bilan tenglash — 7 kun).
      3. Hech bir aktiv qaytarish bo'lmasligi (bir buyurtma uchun bitta vaqtning
         o'zida bittadan ortiq aktiv jarayon yo'q — admin xato qilmasin).
      4. Belgilangan item'lar (yoki barcha item'lar) hali to'liq qaytarilmagan
         bo'lishi (returned_qty < quantity).
      5. Belgilangan miqdor mumkin bo'lgan miqdordan oshmasligi.

    XAVFSIZLIK: bu funksiya AUTHORITATIVE — API view'lardan oldin chaqiriladi,
    UI'dagi tekshiruvga ishonmaydi.
    """
    now = timezone.now()

    # 1) Buyurtma holati
    if order.status not in RETURNABLE_ORDER_STATUSES:
        raise serializers.ValidationError({
            'error': (
                f"Qaytarish faqat yetkazib berilgan buyurtmalarga ruxsat etiladi "
                f"(hozir: {order.get_status_display()})."
            ),
            'code': 'not_eligible_status',
        })

    # 2) Qaytarish oynasi (window) — dispute_deadline ni qayta ishlatamiz.
    # Eski (Phase 2.6 dan oldingi) buyurtmalar uchun dispute_deadline=None.
    # Bu holda created_at + 7 kun deb hisoblaymiz (defensiv fallback).
    if order.dispute_deadline is not None:
        deadline = order.dispute_deadline
    else:
        deadline = order.created_at + timedelta(days=Order.DISPUTE_WINDOW_DAYS)

    if deadline <= now:
        raise serializers.ValidationError({
            'error': (
                f"Qaytarish muddati o'tib ketgan "
                f"(muddat: {deadline:%Y-%m-%d %H:%M})."
            ),
            'code': 'window_expired',
        })

    # 3) Aktiv qaytarish mavjudligi
    has_active = order.returns.filter(status__in=OrderReturn.ACTIVE_STATUSES).exists()
    if has_active:
        raise serializers.ValidationError({
            'error': "Bu buyurtma uchun allaqachon faol qaytarish jarayoni bor.",
            'code': 'already_in_progress',
        })

    # 4–5) Item'lar bo'yicha — `items` berilmagan bo'lsa barcha qoldiq item'lar
    requested_map: dict[int, int] = {}
    if items:
        for entry in items:
            oid = int(entry['order_item_id'])
            qty = int(entry['quantity'])
            if qty <= 0:
                raise serializers.ValidationError({
                    'error': "Qaytarish miqdori 0 dan katta bo'lishi kerak.",
                    'code': 'invalid_quantity',
                })
            requested_map[oid] = requested_map.get(oid, 0) + qty

    returnable_items = []
    for it in order.items.select_related('product', 'variant').all():
        avail = it.returnable_qty
        if avail <= 0:
            # Allaqachon to'liq qaytarilgan — skip
            if it.id in requested_map:
                raise serializers.ValidationError({
                    'error': f"Item #{it.id} allaqachon to'liq qaytarilgan.",
                    'code': 'already_returned_fully',
                })
            continue

        if requested_map:
            wanted = requested_map.get(it.id)
            if wanted is None:
                continue   # admin shu item'ni so'ramagan
            if wanted > avail:
                raise serializers.ValidationError({
                    'error': (
                        f"Item #{it.id}: so'ralgan miqdor ({wanted}) mumkin bo'lgan "
                        f"qoldiqdan ({avail}) ortiq."
                    ),
                    'code': 'over_quantity',
                })
            qty_to_use = wanted
        else:
            qty_to_use = avail

        returnable_items.append({
            'order_item_id': it.id,
            'returnable_qty': qty_to_use,
            'price': it.price_snapshot,
            'product_name': it.product.name if it.product else 'Unknown',
            'variant_id': it.variant_id,
        })

    if not returnable_items:
        raise serializers.ValidationError({
            'error': "Qaytarish uchun mos item topilmadi (barchasi allaqachon qaytarilgan).",
            'code': 'already_returned_fully',
        })

    return {
        'window_left_seconds': int((deadline - now).total_seconds()),
        'returnable_items': returnable_items,
    }


def _restock_quantity(*, product_id: int, variant_id: int | None, quantity: int) -> None:
    """
    `restore_inventory(order_item)`'ning umumlashtirilgan versiyasi — qisman
    qaytarish uchun miqdor parametri bilan. `select_for_update()` lost-update
    himoyasini ta'minlaydi.
    """
    if quantity <= 0:
        return
    from products.models import Product as _Product, ProductVariant as _Variant

    if variant_id:
        locked = _Variant.objects.select_for_update().get(pk=variant_id)
        locked.stock += quantity
        locked.save(update_fields=['stock'])
        return

    if product_id:
        locked = _Product.objects.select_for_update().get(pk=product_id)
        locked.stock += quantity
        locked.save(update_fields=['stock'])


# ────────────────────────────────────────────────────────────────────────────
#  Phase 3.3 — Kassa balans hisobi va naqd refund integratsiyasi
#
#  Kassa naqd refund'i KassaWithdrawView bilan AYNAN bir xil qoidaga
#  bo'ysunadi: race-safe (SELECT FOR UPDATE) + balans tekshiruvi. Buyurtmadan
#  qaytariladigan summa kassada bo'lishi kerak; aks holda transition rad
#  etiladi va butun atomik tranzaksiya rollback bo'ladi.
# ────────────────────────────────────────────────────────────────────────────


def get_kassa_balance(*, lock: bool = False) -> Decimal:
    """
    Kassa joriy balansi: total_income (DELIVERED+RECEIVED total_price) -
    total_expense (Withdrawal.amount summasi).

    `lock=True` — Withdrawal jadvalini SELECT FOR UPDATE bilan qulflaydi
    (KassaWithdraw bilan bir xil race-safety). Faqat @transaction.atomic
    ichida ishlatilishi mumkin.
    """
    if lock:
        # Lock effekti uchun aggregate qilamiz — natija qayta hisoblanadi
        Withdrawal.objects.select_for_update().aggregate(total=Sum('amount'))

    zero = Decimal('0')
    delivered_qs = Order.objects.filter(
        status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED]
    )
    total_income = delivered_qs.aggregate(total=Sum('total_price'))['total'] or zero
    total_expense = Withdrawal.objects.aggregate(total=Sum('amount'))['total'] or zero
    return total_income - total_expense


def _create_kassa_withdrawal_for_return(return_obj: 'OrderReturn', *, actor) -> Withdrawal:
    """
    Naqd refund uchun Withdrawal yaratadi.

    Logika (race-safe):
      1. Withdrawal jadvalini lock qilamiz (SELECT FOR UPDATE)
      2. Joriy balansni qayta hisoblaymiz
      3. Balans yetarli emas → ValidationError raise → atomic rollback
      4. Yetarli → Withdrawal yaratamiz
      5. return_obj.refund_reference = "WD-<id>" avtomat

    INVARIANT: bu funksiya HAR DOIM @transaction.atomic kontekstida chaqiriladi
    (transition_return_status `@transaction.atomic`).
    """
    amount = Decimal(return_obj.refund_amount).quantize(Decimal('0.01'))
    if amount <= 0:
        return None

    balance = get_kassa_balance(lock=True)
    if amount > balance:
        raise serializers.ValidationError({
            'error': (
                f"Kassada yetarli mablag' yo'q. "
                f"Qoldiq: {balance:.2f} so'm, kerak: {amount:.2f} so'm."
            ),
            'code': 'insufficient_kassa_balance',
        })

    reason = (
        f"Qaytarish {return_obj.return_number} — Buyurtma #{return_obj.order_id}"
    )
    withdrawal = Withdrawal.objects.create(amount=amount, reason=reason, admin=actor)

    # refund_reference avtomat (admin qo'lda yozgan bo'lsa o'sha qoldiriladi).
    if not return_obj.refund_reference:
        return_obj.refund_reference = f"WD-{withdrawal.id}"
        return_obj.save(update_fields=['refund_reference', 'updated_at'])

    return withdrawal


# ────────────────────────────────────────────────────────────────────────────
#  Phase 3.4 — Replacement Order generatori
#
#  Almashtirish (replacement) — pul qaytarish o'rniga yangi tovar berish.
#  Original tovardan boshqa rang/o'lcham/model bo'lishi mumkin (inspector
#  qabul qiladi). YANGI Order yaratiladi:
#    - aynan original buyurtmaning manzili va telefon raqami
#    - aynan original item'lar, AYNAN bir xil price_snapshot (qo'shimcha
#      to'lov yo'q — admin pul qaytarmasa va olmasa)
#    - status=CONFIRMED (admin tasdig'ini o'tkazib) — chunki bu allaqachon
#      tasdiqlangan qaytarishning davomi
#    - is_credit=False (kreditda yangidan tasdiqlash kerak emas)
#    - payment.status=PAID (mijoz pulini original buyurtmada to'lagan)
#    - OrderReturn.replacement_order = yangi Order
#
#  STOK: yangi Order item'lari uchun `reserve_inventory` chaqiriladi (stok
#  kamayadi). Agar inspector original tovarni `restock=True` belgilagan
#  bo'lsa, _create_kassa... emas balki transition_return_status SUCCESS
#  yo'lida stok aynan shu vaqtda qaytariladi. Natijada: original tovar stokga
#  qaytadi va keyin yangi tovar stokdan chiqadi (transit interval — bir
#  funksiya ichida, kuzatish vaqti minimal).
# ────────────────────────────────────────────────────────────────────────────


def create_replacement_order_for_return(return_obj: 'OrderReturn', *, actor) -> Order:
    """
    OrderReturn'dan replacement uchun yangi Order yaratadi.

    INVARIANT: bu funksiya HAR DOIM @transaction.atomic ichida chaqiriladi.

    Stok yetarli emasligi (ensure_stock_available raise qiladi)
    butun tranzaksiyani rollback qiladi — original returned_qty/stok
    yangilanishi bekor bo'ladi. Bu IDEAL: agar replacement chiqarib bo'lmasa,
    qaytarish ham yakunlanmaydi va admin alohida usul tanlaydi.
    """
    original = return_obj.order

    # Items'ni original OrderItem'lardan ko'chiramiz — qaytarilayotgan
    # AYNAN miqdorlar va AYNAN narxlar.
    items_payload = []
    for ri in return_obj.items.select_related('order_item__product', 'order_item__variant').all():
        oi = ri.order_item
        items_payload.append({
            'product': oi.product,
            'variant': oi.variant,
            'quantity': ri.quantity,
            'price': ri.refund_unit_price,  # AYNAN bir xil narxda
        })

    if not items_payload:
        raise serializers.ValidationError({
            'error': "Replacement yaratish uchun item yo'q.",
            'code': 'no_items',
        })

    # Replacement uchun naqd usulni belgilaymiz (chunki to'lov allaqachon
    # original buyurtmada bo'lgan — bu faqat texnik "qiymat"). is_credit=False.
    new_order = create_order_with_items(
        user=original.user,
        receiver_name=original.receiver_name,
        receiver_phone=original.receiver_phone,
        delivery_address=original.delivery_address,
        payment_method=Order.PAYMENT_METHOD_CASH,
        items=items_payload,
        delivery_lat=original.delivery_lat,
        delivery_lng=original.delivery_lng,
        delivery_notes=f"Almashtirish ({return_obj.return_number}) — Buyurtma #{original.id} o'rniga",
        allow_price_override=True,    # aynan original narxlarda
        skip_credit_check=True,        # credit emas
    )

    # Status'ni CONFIRMED ga olib chiqamiz (PENDING'dan o'tkazib) — bu allaqachon
    # tasdiqlangan qaytarishning davomi, admin qayta tasdiqlamasligi kerak.
    if new_order.status == Order.STATUS_PENDING:
        new_order.status = Order.STATUS_CONFIRMED
        new_order.save(update_fields=['status', 'updated_at'])
        create_order_history(
            new_order,
            to_status=Order.STATUS_CONFIRMED,
            from_status=Order.STATUS_PENDING,
            actor_type=OrderHistory.ACTOR_ADMIN,
            actor=actor,
            note=(
                f"Almashtirish ({return_obj.return_number}) — "
                f"original Buyurtma #{original.id}"
            ),
        )

    # To'lov holatini PAID belgilaymiz (mijoz allaqachon to'lagan).
    payment = getattr(new_order, 'payment', None)
    if payment and payment.status == Payment.STATUS_PENDING:
        payment.status = Payment.STATUS_PAID
        payment.save(update_fields=['status', 'updated_at'])

    # OrderReturn ga link
    return_obj.replacement_order = new_order
    return_obj.save(update_fields=['replacement_order', 'updated_at'])

    return new_order


@transaction.atomic
def transition_return_status(
    *,
    return_obj: OrderReturn,
    new_status: str,
    actor,
    note: str = '',
    inspection_notes: str = '',
):
    """
    Yagona chokepoint qaytarish status o'tishlari uchun (Phase 2'dagi
    `transition_order_status` uslubi).

    SIDE-EFFECTS:
      • ACCEPTED — inspector qarorlari `OrderReturnItem.restock`/`writeoff`
        belgilangan bo'lishi kerak. Bu chiziqda hech narsa qilmaydi —
        haqiqiy stok yangilash REFUNDED/REPLACED'ga o'tganda.

      • REFUNDED yoki REPLACED — har OrderReturnItem uchun:
          - OrderItem.returned_qty += quantity (INVARIANT)
          - Agar restock=True → ProductVariant.stock yoki Product.stock += quantity
          - Agar restock=False → writeoff (alohida jadval qo'shilmaydi, audit log yetarli)
        Bundan tashqari:
          - refund_processed_at = now
          - refund_processed_by = actor

      • REJECTED — hech qanday stok harakati yo'q. Tovar mijozga qaytariladi
        (UI da admin xabar qiladi).

    Race condition'dan himoya: `select_for_update()` qaytarish ob'ektida
    (parallel admin ikkita marta REFUNDED bosishi kabi holatlar).
    """
    # Ob'ektni lock qilib, tug'ri statusni qayta o'qiymiz (stale read'dan himoya).
    return_obj = OrderReturn.objects.select_for_update().get(pk=return_obj.pk)

    if new_status == return_obj.status:
        return return_obj

    allowed = STATUS_TRANSITIONS_RETURN.get(return_obj.status, set())
    if new_status not in allowed:
        raise serializers.ValidationError({
            'error': (
                f"Qaytarish statusini {return_obj.status} dan {new_status} ga "
                f"o'zgartirib bo'lmaydi."
            ),
            'code': 'invalid_transition',
        })

    previous_status = return_obj.status
    return_obj.status = new_status
    return_obj.status_changed_by = actor
    update_fields = ['status', 'status_changed_by', 'status_changed_at', 'updated_at']

    if new_status == OrderReturn.STATUS_INSPECTING:
        return_obj.inspector = actor
        return_obj.inspection_at = timezone.now()
        update_fields.extend(['inspector', 'inspection_at'])

    if new_status in (OrderReturn.STATUS_ACCEPTED, OrderReturn.STATUS_REJECTED) and inspection_notes:
        return_obj.inspection_notes = inspection_notes
        update_fields.append('inspection_notes')

    if new_status == OrderReturn.STATUS_REJECTED and note:
        return_obj.rejection_reason = note
        update_fields.append('rejection_reason')

    # ── SUCCESS yo'l — stok va OrderItem.returned_qty yangilash ─────────────
    if new_status in OrderReturn.SUCCESS_STATUSES:
        # Idempotency: agar oldindan ham SUCCESS bo'lsa qayta yangilamaymiz.
        # (Bu yerda kelmaymiz STATUS_TRANSITIONS_RETURN ga rahmat — TERMINAL'dan
        # chiqish yo'q. Lekin defensiv yondashuv.)
        if previous_status in OrderReturn.SUCCESS_STATUSES:
            pass
        else:
            return_items = return_obj.items.select_related(
                'order_item__product', 'order_item__variant'
            ).all()

            if not return_items.exists():
                raise serializers.ValidationError({
                    'error': "Qaytarish item'lari yo'q — yakunlash mumkin emas.",
                    'code': 'no_items',
                })

            for ri in return_items:
                oi = ri.order_item
                # OrderItem.returned_qty INVARIANTini buzmaslik
                new_returned = oi.returned_qty + ri.quantity
                if new_returned > oi.quantity:
                    raise serializers.ValidationError({
                        'error': (
                            f"Item #{oi.id}: qaytarish miqdori ({ri.quantity}) "
                            f"qolgan miqdordan ortiq."
                        ),
                        'code': 'over_quantity_at_commit',
                    })
                oi.returned_qty = new_returned
                oi.save(update_fields=['returned_qty'])

                if ri.restock:
                    _restock_quantity(
                        product_id=oi.product_id,
                        variant_id=oi.variant_id,
                        quantity=ri.quantity,
                    )
                # restock=False holatda — writeoff. AuditLog allaqachon
                # endpoint'da yoziladi (Phase 1.1). Stok teginmaydi.

            # ── Phase 3.3: Kassa integratsiyasi ──────────────────────────
            # `cash` usuli — Withdrawal yoziladi (kassadan pul yechiladi).
            # SHU NUQTADA balansni qayta tekshiramiz (race-safe): KassaWithdraw
            # bilan bir xil qonun. Yetarli bo'lmasa ATOMIC rollback.
            # refund_reference avtomatik to'ldiriladi (WD-<id>).
            if (new_status == OrderReturn.STATUS_REFUNDED
                    and return_obj.refund_method == OrderReturn.REFUND_CASH
                    and return_obj.refund_amount > 0):
                _create_kassa_withdrawal_for_return(return_obj, actor=actor)

            # ── Phase 3.4: Replacement Order generatori ─────────────────
            # `replacement` usuli yoki REPLACED ga to'g'ridan-to'g'ri o'tish:
            # yangi Order yaratamiz (`create_replacement_order_for_return`).
            # Stok yetarli emas bo'lsa — atomic rollback (qaytarish ham bekor).
            # Idempotency: agar avval yaratilgan bo'lsa qayta yaratmaymiz.
            if (new_status == OrderReturn.STATUS_REPLACED
                    and return_obj.replacement_order_id is None):
                create_replacement_order_for_return(return_obj, actor=actor)

        return_obj.refund_processed_at = timezone.now()
        return_obj.refund_processed_by = actor
        update_fields.extend(['refund_processed_at', 'refund_processed_by'])

    return_obj.save(update_fields=update_fields)

    # OrderHistory ga ham yozamiz — buyurtma tarixida qaytarish ko'rinsin.
    create_order_history(
        return_obj.order,
        to_status=return_obj.order.status,   # Order holati o'zgarmadi
        from_status=return_obj.order.status,
        actor_type=(
            OrderHistory.ACTOR_ADMIN if actor and getattr(actor, 'is_staff', False)
            else OrderHistory.ACTOR_SYSTEM
        ),
        actor=actor,
        note=(
            f"Qaytarish {return_obj.return_number}: "
            f"{previous_status} → {new_status}" + (f" ({note})" if note else '')
        ),
    )

    # ── Phase 3.5: Telegram alert (admin'larga muhim o'zgarishlar) ──────────
    # Tranzaksiyadan TASHQARI — alert tarmoq xatosi tranzaksiyani buzmasin.
    # on_commit hook tranzaksiya commit bo'lganidan keyin chaqiriladi.
    _notify_return_status_change(return_obj, previous_status, new_status, actor)

    return return_obj


def _notify_return_status_change(
    return_obj: 'OrderReturn',
    previous_status: str,
    new_status: str,
    actor,
):
    """
    Phase 3.5: Telegram alert helper. `on_commit` orqali — tarmoq xatosi
    tranzaksiyani buzmasligi uchun. Faqat MUHIM o'tishlar:
      - REQUESTED (yangi yaratish — INFO)
      - REFUNDED / REPLACED (yakuniy SUCCESS — INFO)
      - REJECTED (yakuniy negative — WARNING)
    """
    if previous_status == new_status:
        return

    notify_statuses = {
        OrderReturn.STATUS_REQUESTED,
        OrderReturn.STATUS_REFUNDED,
        OrderReturn.STATUS_REPLACED,
        OrderReturn.STATUS_REJECTED,
    }
    if new_status not in notify_statuses:
        return

    def _send():
        try:
            from core.notifications import send_admin_alert, AlertSeverity
            severity = (
                AlertSeverity.WARNING if new_status == OrderReturn.STATUS_REJECTED
                else AlertSeverity.INFO
            )
            actor_phone = getattr(actor, 'phone', None) or 'system'
            order_id = return_obj.order_id
            num = return_obj.return_number
            amount = return_obj.refund_amount or 0
            method = return_obj.refund_method or '—'

            if new_status == OrderReturn.STATUS_REQUESTED:
                text = (
                    f"*Yangi qaytarish:* `{num}`\n"
                    f"Buyurtma: #{order_id}\n"
                    f"Sabab: {return_obj.reason_code}\n"
                    f"Admin: {actor_phone}"
                )
            elif new_status == OrderReturn.STATUS_REFUNDED:
                text = (
                    f"*Pul qaytarildi:* `{num}`\n"
                    f"Buyurtma: #{order_id}\n"
                    f"Summa: {amount:.0f} so'm ({method})\n"
                    f"Admin: {actor_phone}"
                )
            elif new_status == OrderReturn.STATUS_REPLACED:
                rep_id = return_obj.replacement_order_id
                text = (
                    f"*Almashtirildi:* `{num}`\n"
                    f"Original: #{order_id}\n"
                    f"Yangi: #{rep_id}\n"
                    f"Admin: {actor_phone}"
                )
            else:  # REJECTED
                text = (
                    f"*Qaytarish rad etildi:* `{num}`\n"
                    f"Buyurtma: #{order_id}\n"
                    f"Sabab: {return_obj.rejection_reason or '—'}\n"
                    f"Admin: {actor_phone}"
                )
            send_admin_alert(text, severity=severity)
        except Exception:
            # Notifikatsiya muvaffaqiyatsizligi biznes oqimini buzmasin.
            import logging
            logging.getLogger('orders.return').warning(
                'Return Telegram alert failed', exc_info=True,
            )

    transaction.on_commit(_send)
