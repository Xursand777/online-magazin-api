from __future__ import annotations

import datetime
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import Order, OrderHistory, OrderItem, Payment


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


def effective_master_percent(user) -> Decimal:
    """
    Joriy foydalanuvchi uchun AMALDAGI usta chegirma foizi.
    = bazaviy foiz (admin kiritgan) × (joriy daraja / 4).
    Usta bo'lmasa, autentifikatsiya qilinmagan bo'lsa yoki daraja 0 bo'lsa — 0.
    """
    from products.models import GlobalSetting

    if user is None or not getattr(user, 'is_authenticated', False):
        return Decimal('0')
    if not getattr(user, 'is_master', False):
        return Decimal('0')

    base = GlobalSetting.get_master_discount_percent()
    if base <= 0:
        return Decimal('0')

    level = _master_standing_level(user)
    if level <= 0:
        return Decimal('0')

    return (base * Decimal(level) / Decimal(_MASTER_MAX_LEVEL)).quantize(Decimal('0.01'))


def apply_master_discount(price, percent: Decimal) -> Decimal:
    """Narxga usta chegirma foizini qo'llaydi (butun so'mga yaxlitlanadi)."""
    p = Decimal(str(price))
    if percent and percent > 0:
        return (p * (Decimal('100') - percent) / Decimal('100')).quantize(Decimal('1'))
    return p


def master_status(user) -> dict:
    """UI uchun ustaning joriy holati: bazaviy/amaldagi foiz, daraja, faollik."""
    from products.models import GlobalSetting

    is_master = bool(user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_master', False))
    base = GlobalSetting.get_master_discount_percent()

    if not is_master:
        return {
            'is_master': False,
            'base_percent': float(base),
            'effective_percent': 0.0,
            'level': 0,
            'max_level': _MASTER_MAX_LEVEL,
            'days_since_last_purchase': None,
            'last_purchase_at': None,
        }

    times = _master_purchase_times(user)
    last = times[-1] if times else None
    level = _master_standing_level(user)
    eff = effective_master_percent(user)
    gap = (timezone.now() - last).days if last else None

    return {
        'is_master': True,
        'base_percent': float(base),
        'effective_percent': float(eff),
        'level': level,
        'max_level': _MASTER_MAX_LEVEL,
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
    payment_method, items, credit_days=None, skip_credit_check=False
):
    if not items:
        raise serializers.ValidationError({'error': "Savat bo'sh."})

    is_credit = (payment_method == Order.PAYMENT_METHOD_CREDIT)
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
    if user is not None and not skip_credit_check:
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

    # MUHIM: usta chegirmasini buyurtma YARATILISHIDAN OLDIN hisoblaymiz —
    # aks holda yangi buyurtma "oxirgi xarid" (0 kun) bo'lib darajani buzadi.
    # Ustaning "kirib kelgandagi" holatiga ko'ra narx beriladi; bu xarid esa
    # darajani keyingi safar uchun +1 ko'taradi (sekin ko'tarilish).
    master_pct = effective_master_percent(user)

    order = Order.objects.create(
        user=user,
        receiver_name=receiver_name,
        receiver_phone=receiver_phone,
        delivery_address=delivery_address,
        payment_method=payment_method,
        status=initial_status,
        is_credit=is_credit,
        credit_days=credit_days if is_credit else None,
        credit_due_date=credit_due_date,
        credit_paid=False,
    )

    total_price = Decimal('0.00')
    for item in items:
        product = item['product']
        variant = item.get('variant')
        quantity = int(item.get('quantity', 1))
        ensure_stock_available(product, quantity, variant)
        reserve_inventory(product, quantity, variant)
        price = apply_master_discount(get_line_price(product, variant), master_pct)
        OrderItem.objects.create(
            order=order,
            product=product,
            variant=variant,
            quantity=quantity,
            price_snapshot=price,
        )
        total_price += price * quantity

    order.total_price = total_price
    order.save(update_fields=['total_price', 'updated_at'])

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
    auto_cancel_expired_orders()
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
    order.save(update_fields=['status', 'updated_at'])

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


@transaction.atomic
def check_credit_eligibility(user):
    """
    Foydalanuvchi buyurtma bera olishini tekshiradi.
    Quyidagi holatlarda xato qaytaradi:
      - credit_ban=True (3 marta muddati o'tgan)
      - Muddati o'tgan, to'lanmagan muddatli buyurtma mavjud
      - Hali to'lanmagan aktiv muddatli buyurtma mavjud
    Race condition'dan himoya uchun select_for_update ishlatiladi.
    """
    from django.db import transaction as db_transaction

    # Foydalanuvchini lock qilib olamiz
    user_locked = user.__class__.objects.select_for_update().get(pk=user.pk)

    if user_locked.credit_ban:
        raise serializers.ValidationError({
            'error': (
                "Siz buyurtma bera olmaysiz. "
                "3 marta to'lov muddatini o'tkazib yuborgansiz — "
                "muddatli to'lov imkoniyatingiz doimiy bloklangan."
            )
        })

    today = timezone.now().date()

    # Muddati o'tgan, to'lanmagan, hali hisobga olinmagan buyurtmalar
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
        .exclude(status__in=Order.CANCELLATION_STATUSES)
    )

    if overdue_qs.exists():
        count = overdue_qs.count()
        overdue_qs.update(credit_overdue_counted=True)
        user_locked.overdue_credit_count = (user_locked.overdue_credit_count or 0) + count
        if user_locked.overdue_credit_count >= 3:
            user_locked.credit_ban = True
        user_locked.save(update_fields=['overdue_credit_count', 'credit_ban'])

        # user ob'ektini yangilaymiz
        user.credit_ban = user_locked.credit_ban
        user.overdue_credit_count = user_locked.overdue_credit_count

        if user_locked.credit_ban:
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
