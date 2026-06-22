from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers

from .models import Order, OrderHistory, OrderItem, Payment
from products.serializers import ProductListSerializer, ProductVariantSerializer


# ── Phase 3.0 — Defensive GPS koordinata DecimalField ───────────────────────
#
# MUAMMO:
#   Leaflet xaritadan keladigan koordinatalar 12-14 kasrli son bo'ladi:
#     41.549912345678
#   DRF DecimalField(max_digits=9) bunday qiymatni RAD etadi:
#     "Ensure that there are no more than 9 digits in total."
#
# YECHIM:
#   Custom DecimalField — to_internal_value ichida QUANTIZE qiladi.
#   Kelgan qiymat avtomat 6 ta kasrli aniqlikka yumalanadi:
#     41.549912345678 → Decimal('41.549912')
#
#   6 kasrli aniqlik = ~10 cm ekvator yonida — kuryer navigatsiyasi uchun
#   ko'proq darajada yetarli.
class GpsDecimalField(serializers.DecimalField):
    """GPS koordinata uchun DecimalField — kelgan qiymatni 6 kasrgacha yumalantiradi.

    Bu max_digits xatosini oldini oladi: Leaflet'dan keladigan ko'p kasrli
    sonlar (12-14 digit) avtomat ravishda model talabiga mos qilinadi.
    """

    def to_internal_value(self, data):
        # str/float/int qabul qilamiz va avval Decimal'ga aylantirib quantize qilamiz.
        # Buni base validator ishlamasdan oldin qilamiz — shu sabab max_digits
        # xatosi hech qachon chiqmaydi.
        if data is None or data == '':
            return None
        try:
            value = Decimal(str(data))
        except Exception:
            self.fail('invalid')
        # 6 kasrli aniqlikka yumalantirish — model talabiga mos
        quantized = value.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        return super().to_internal_value(str(quantized))


class OrderItemSerializer(serializers.ModelSerializer):
    product_details = ProductListSerializer(source='product', read_only=True)
    variant_details = ProductVariantSerializer(source='variant', read_only=True)

    class Meta:
        model = OrderItem
        fields = (
            'id',
            'product',
            'variant',
            'quantity',
            'price_snapshot',
            'product_details',
            'variant_details',
        )


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            'method',
            'status',
            'amount',
            'transaction_id',
            'refund_reference',
            'refunded_at',
            'created_at',
            'updated_at',
        )


class OrderHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderHistory
        fields = (
            'id',
            'from_status',
            'to_status',
            'actor_type',
            'actor_name',
            'note',
            'created_at',
        )

    def get_actor_name(self, obj):
        if obj.actor:
            full_name = f"{obj.actor.first_name} {obj.actor.last_name}".strip()
            return full_name or obj.actor.phone
        return None


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    payment = PaymentSerializer(read_only=True)
    history = OrderHistorySerializer(many=True, read_only=True)
    can_cancel = serializers.SerializerMethodField()
    can_admin_cancel = serializers.SerializerMethodField()
    credit_is_overdue = serializers.SerializerMethodField()
    # Nasiyani yopa oladimi — FAQAT admin/super (kassa huquqi). Kuryer/sotuvchi
    # uchun False, shunda "Nasiyani yopish" tugmasi UI'da ham ko'rinmaydi.
    can_pay_credit = serializers.SerializerMethodField()
    # So'rov yuborgan xodim shu buyurtmani O'TKAZA OLADIGAN oldinga holatlar.
    # Frontend (web + mobil) shu ro'yxat bo'yicha tugma chizadi — rol bo'yicha
    # tugma ko'rsatishning yagona avtoritar manbai (bekor qilish KIRMAYDI).
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id',
            'user',
            'receiver_name',
            'receiver_phone',
            'delivery_address',
            # ── Phase 3.0 — Kuryer navigatsiyasi maydonlari ────────
            'delivery_lat',
            'delivery_lng',
            'delivery_notes',
            'payment_method',
            'status',
            'delivery_price',
            'discount_price',
            'total_price',
            'cancellation_reason',
            'cancelled_at',
            'is_credit',
            'credit_days',
            'credit_due_date',
            'credit_paid',
            'credit_paid_at',
            'credit_is_overdue',
            'created_at',
            'updated_at',
            'can_cancel',
            'can_admin_cancel',
            'can_pay_credit',
            'allowed_transitions',
            'items',
            'payment',
            'history',
        )
        read_only_fields = (
            'user',
            'status',
            'delivery_lat',
            'delivery_lng',
            'delivery_notes',
            'delivery_price',
            'discount_price',
            'total_price',
            'cancellation_reason',
            'cancelled_at',
            'is_credit',
            'credit_days',
            'credit_due_date',
            'credit_paid',
            'credit_paid_at',
            'credit_is_overdue',
            'can_cancel',
            'can_admin_cancel',
            'can_pay_credit',
            'allowed_transitions',
        )

    def get_can_cancel(self, obj):
        return obj.status in Order.CANCELLABLE_STATUSES

    def get_allowed_transitions(self, obj) -> list:
        """
        So'rov yuborgan xodim shu buyurtmani o'tkaza oladigan oldinga holatlar.

        Mantiq = NIMA (kanonik oldinga zanjir `STATUS_TRANSITIONS`) ∩ KIM
        (`can_transition` — rol bo'yicha ruxsat). Bekor qilish bu yerga kirmaydi
        (u alohida `can_admin_cancel` bilan boshqariladi).

        Misol:
          • kuryer + SHIPPING  → ['DELIVERED']
          • kuryer + DELIVERED → ['RECEIVED']
          • kuryer + PACKING   → []           (kuryer tegmaydi)
          • sotuvchi + PACKING → ['SHIPPING']
          • admin + har bir holat → kanonik keyingi holat
        """
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return []
        # Lazy import — aylanma importni oldini olish uchun.
        from .services import STATUS_TRANSITIONS
        from users.permissions import can_transition

        targets = STATUS_TRANSITIONS.get(obj.status, set())
        return [
            target for target in targets
            if can_transition(user, obj.status, target)
        ]

    def get_can_pay_credit(self, obj) -> bool:
        """Nasiyani yopish — faqat kassa huquqiga ega xodim (admin/super)."""
        if not obj.is_credit or obj.credit_paid:
            return False
        if obj.status in Order.CANCELLATION_STATUSES:
            return False
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return False
        # CanAccessKassa bilan bir xil qoida: super yoki admin.
        return bool(user.is_superuser or getattr(user, 'role', None) == 'admin')

    def get_can_admin_cancel(self, obj) -> bool:
        """
        Backend'dan keluvchi, admin UI uchun ishonchli manba.
        Har bir to'lov usuli va holat kombinatsiyasi uchun hisoblanadi.
        """
        # Kuryer hech qachon bekor qila olmaydi (chuqurlikdagi mudofaa) —
        # uning ROLE_TRANSITIONS'ida bekor qilish yo'q.
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and getattr(user, 'role', None) == 'courier' \
                and not user.is_superuser:
            return False
        if obj.status in Order.CANCELLATION_STATUSES:
            return False
        if obj.status == Order.STATUS_RECEIVED:
            return False
        # Karta: faqat to'lov hali kelmagan bo'lsa (AWAITING_PAYMENT)
        if obj.payment_method == Order.PAYMENT_METHOD_CARD:
            return obj.status == Order.STATUS_AWAITING_PAYMENT
        # Naqd / Muddatli: yig'ilish boshlashdan oldin (PENDING yoki CONFIRMED)
        return obj.status in {Order.STATUS_PENDING, Order.STATUS_CONFIRMED}

    def get_credit_is_overdue(self, obj):
        if not obj.is_credit or obj.credit_paid:
            return False
        if obj.status in Order.CANCELLATION_STATUSES:
            return False
        from django.utils import timezone
        return obj.credit_due_date is not None and obj.credit_due_date < timezone.now().date()


# ── Phase 3.0 — Kuryer navigatsiyasi uchun qo'shimcha maydonlar ──────────
# Bu mixin ikkala Order serializer'ga koordinata + eslatma qabul qilish imkoni
# beradi. AddressPicker (xarita pin) tanlangan bo'lsa lat/lng yuboriladi.
# Eski klientlar (eski mobile APK) bu maydonlarni yubormaydi — backwards
# compat uchun barchasi required=False.
#
# GpsDecimalField (yuqorida ko'rsatilgan) — Leaflet'dan keladigan ko'p kasrli
# sonlarni avtomat 6 kasrgacha yumalaydi. max_digits xatosi yo'q.


class QuickOrderSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(default=1, min_value=1, max_value=100)

    receiver_name = serializers.CharField(max_length=255)
    # ── ULTRA-SECURE: receiver_phone backend tomondan request.user.phone'dan
    # o'rnatiladi. Frontend yuborgan qiymat e'tiborga olinmaydi. Eski mobile
    # API'lar mos kelishi uchun maydon required=False qilingan (yuborilsa
    # ham, view tomonidan o'chiriladi va user.phone bilan almashtiriladi).
    receiver_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True,
        help_text="E'TIBORGA OLINMAYDI — server ro'yxatdan o'tgan raqamni ishlatadi.",
    )
    delivery_address = serializers.CharField()
    # ── Phase 3.0 — Xarita koordinatasi va kuryer eslatmasi ───────────────
    # GpsDecimalField avtomat 6 kasrgacha yumalantiradi — Leaflet'dan kelgan
    # 12-14 kasrli sonlar muammosini hal qiladi.
    delivery_lat = GpsDecimalField(
        max_digits=9, decimal_places=6,
        required=False, allow_null=True,
        min_value=-90, max_value=90,
    )
    delivery_lng = GpsDecimalField(
        max_digits=10, decimal_places=6,
        required=False, allow_null=True,
        min_value=-180, max_value=180,
    )
    delivery_notes = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default='',
    )
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default=Order.PAYMENT_METHOD_CASH)
    credit_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=Order.CREDIT_DAYS_MIN,
        max_value=Order.CREDIT_DAYS_MAX,
    )

    def validate(self, attrs):
        if attrs.get('payment_method') == Order.PAYMENT_METHOD_CREDIT and not attrs.get('credit_days'):
            raise serializers.ValidationError({'credit_days': "To'lov muddati (kunlar soni) ko'rsatilishi shart."})
        # Koordinata juftligi: birini yuborgan bo'lsa, ikkinchisi ham kerak.
        lat, lng = attrs.get('delivery_lat'), attrs.get('delivery_lng')
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                {'delivery_coords': "Koordinata juftligi to'liq bo'lishi kerak (lat va lng)."}
            )
        return attrs


class OrderFromCartSerializer(serializers.Serializer):
    receiver_name = serializers.CharField(max_length=255)
    # ── ULTRA-SECURE: receiver_phone view tomonidan request.user.phone'dan
    # majburiy o'rnatiladi. Backwards compat uchun required=False.
    receiver_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True,
        help_text="E'TIBORGA OLINMAYDI — server ro'yxatdan o'tgan raqamni ishlatadi.",
    )
    delivery_address = serializers.CharField()
    # ── Phase 3.0 — Xarita koordinatasi va kuryer eslatmasi ───────────────
    # GpsDecimalField avtomat 6 kasrgacha yumalantiradi — Leaflet'dan kelgan
    # 12-14 kasrli sonlar muammosini hal qiladi.
    delivery_lat = GpsDecimalField(
        max_digits=9, decimal_places=6,
        required=False, allow_null=True,
        min_value=-90, max_value=90,
    )
    delivery_lng = GpsDecimalField(
        max_digits=10, decimal_places=6,
        required=False, allow_null=True,
        min_value=-180, max_value=180,
    )
    delivery_notes = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default='',
    )
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default=Order.PAYMENT_METHOD_CASH)
    credit_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=Order.CREDIT_DAYS_MIN,
        max_value=Order.CREDIT_DAYS_MAX,
    )

    def validate(self, attrs):
        if attrs.get('payment_method') == Order.PAYMENT_METHOD_CREDIT and not attrs.get('credit_days'):
            raise serializers.ValidationError({'credit_days': "To'lov muddati (kunlar soni) ko'rsatilishi shart."})
        # Koordinata juftligi tekshirish (yuqoridagi bilan bir xil mantiq)
        lat, lng = attrs.get('delivery_lat'), attrs.get('delivery_lng')
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                {'delivery_coords': "Koordinata juftligi to'liq bo'lishi kerak (lat va lng)."}
            )
        return attrs


class CancelOrderSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(max_length=1000)


class AdminOrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.STATUS_CHOICES)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)


# ── Phase 2.6 — Order dispute serializers ───────────────────────────────────

class OrderDisputeImageSerializer(serializers.ModelSerializer):
    """Disputga biriktirilgan dalil rasm."""

    image = serializers.ImageField(read_only=True)

    class Meta:
        from .models import OrderDisputeImage as _M
        model = _M
        fields = ('id', 'image', 'uploaded_at')
        read_only_fields = fields


class OrderDisputeSerializer(serializers.ModelSerializer):
    """
    Disput to'liq ma'lumotlari (mijoz ham, admin ham ko'radi).
    Aktiv/yopilgan hisoblanish maydoni — bu computed.
    """

    images       = OrderDisputeImageSerializer(many=True, read_only=True)
    is_active    = serializers.BooleanField(read_only=True)
    is_resolved  = serializers.BooleanField(read_only=True)
    resolved_by_phone = serializers.SerializerMethodField()

    class Meta:
        from .models import OrderDispute as _M
        model = _M
        fields = (
            'id', 'order', 'reason', 'status',
            'resolution_note',
            'created_at', 'resolved_at', 'resolved_by', 'resolved_by_phone',
            'images', 'is_active', 'is_resolved',
        )
        read_only_fields = (
            'id', 'order', 'status', 'resolution_note',
            'created_at', 'resolved_at', 'resolved_by',
            'images', 'is_active', 'is_resolved',
        )

    def get_resolved_by_phone(self, obj):
        return getattr(obj.resolved_by, 'phone', None)


class CreateOrderDisputeSerializer(serializers.Serializer):
    """
    POST /api/orders/<id>/dispute/ uchun input.

    `reason`        — matnli sabab (10-2000 belgi)
    `evidence_images` — ixtiyoriy, 0-5 ta rasm (multipart/form-data)
    """
    reason = serializers.CharField(
        min_length=10,
        max_length=2000,
        error_messages={
            'min_length': "Sabab kamida 10 belgidan iborat bo'lsin.",
            'max_length': "Sabab 2000 belgidan oshmasin.",
        },
    )
    evidence_images = serializers.ListField(
        child=serializers.ImageField(),
        required=False,
        allow_empty=True,
        max_length=5,
        error_messages={'max_length': "Eng ko'pi 5 ta rasm yuborishingiz mumkin."},
    )


class AdminUpdateDisputeSerializer(serializers.Serializer):
    """
    PATCH /api/admin/disputes/<id>/ uchun input.
    `status` va `resolution_note` ikkalasi ham ixtiyoriy, kamida bittasi
    yuborilishi shart (boshqacha aytganda — bo'sh PATCH ma'nosiz).
    """
    status = serializers.ChoiceField(
        choices=[
            'open', 'under_review',
            'resolved_for_customer', 'resolved_for_business',
        ],
        required=False,
    )
    resolution_note = serializers.CharField(
        required=False, allow_blank=True, max_length=2000,
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "Yangilash uchun kamida bitta maydon yuborishingiz kerak."
            )
        return attrs


# ── Phase 2.4 — Kuryer yetkazib berishni tasdiqlash ─────────────────────────
class CourierConfirmDeliverySerializer(serializers.Serializer):
    """
    POST /api/orders/<id>/courier-confirm/ uchun input.

    `received_code` — mijoz kuryerga ayttiradi (6 xonali).
    `delivery_photo` — kuryer olgan rasm; multipart/form-data orqali yuboriladi.
    `latitude`/`longitude` — ixtiyoriy (bino ichida GPS yo'q bo'lishi mumkin).

    `received_code` write_only — javobga aks etmaydi (xavfsizlik).
    """
    received_code = serializers.RegexField(
        regex=r'^\d{6}$',
        write_only=True,
        error_messages={'invalid': "Qabul kodi aniq 6 xonali raqam bo'lishi shart."},
    )
    delivery_photo = serializers.ImageField(required=True)
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6,
        required=False, allow_null=True,
        min_value=-90, max_value=90,
    )
    longitude = serializers.DecimalField(
        max_digits=10, decimal_places=6,
        required=False, allow_null=True,
        min_value=-180, max_value=180,
    )

    def validate(self, attrs):
        # Latitude/longitude xor: birini yuborgan bo'lsa, ikkinchisi ham kerak.
        lat = attrs.get('latitude')
        lng = attrs.get('longitude')
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                {'gps': "Latitude va longitude birga yuborilishi shart."}
            )
        return attrs


# ────────────────────────────────────────────────────────────────────────────
#  Phase 3.2 — Qaytarish (Return / Refund) serializerlari
# ────────────────────────────────────────────────────────────────────────────


class OrderReturnPhotoSerializer(serializers.ModelSerializer):
    """Qaytarishga ilova qilingan rasm (claim yoki inspection)."""
    image = serializers.ImageField(read_only=True)
    uploaded_by_phone = serializers.SerializerMethodField()

    class Meta:
        from .models import OrderReturnPhoto as _M
        model = _M
        fields = ('id', 'image', 'kind', 'uploaded_at', 'uploaded_by_phone')
        read_only_fields = fields

    def get_uploaded_by_phone(self, obj):
        return getattr(obj.uploaded_by, 'phone', None)


class OrderReturnItemSerializer(serializers.ModelSerializer):
    """Qaytarilayotgan har bir buyum (qisman qaytarish uchun)."""
    product_name = serializers.SerializerMethodField()
    line_total   = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )

    class Meta:
        from .models import OrderReturnItem as _M
        model = _M
        fields = (
            'id', 'order_item', 'quantity', 'refund_unit_price',
            'condition', 'restock', 'writeoff_reason',
            'product_name', 'line_total',
        )
        read_only_fields = ('id', 'product_name', 'line_total')

    def get_product_name(self, obj):
        oi = obj.order_item
        return oi.product.name if oi and oi.product else 'Unknown'


class OrderReturnSerializer(serializers.ModelSerializer):
    """
    Qaytarish to'liq ma'lumotlari. Admin ham ko'radi (mijoz UI kelajakda
    cheklangan view ishlatadi — `OrderReturnPublicSerializer` keyinroq).
    """
    items  = OrderReturnItemSerializer(many=True, read_only=True)
    photos = OrderReturnPhotoSerializer(many=True, read_only=True)

    is_active   = serializers.BooleanField(read_only=True)
    is_terminal = serializers.BooleanField(read_only=True)
    is_success  = serializers.BooleanField(read_only=True)

    initiated_by_phone        = serializers.SerializerMethodField()
    status_changed_by_phone   = serializers.SerializerMethodField()
    inspector_phone           = serializers.SerializerMethodField()
    refund_processed_by_phone = serializers.SerializerMethodField()

    order_number = serializers.SerializerMethodField()

    class Meta:
        from .models import OrderReturn as _M
        model = _M
        fields = (
            'id', 'return_number',
            'order', 'order_number',
            'dispute',
            'replacement_order',

            'initiated_by', 'initiated_by_phone', 'initiator_role',
            'customer_request_note',

            'reason_code', 'reason_text',

            'status', 'status_changed_at', 'status_changed_by', 'status_changed_by_phone',

            'pickup_address', 'pickup_courier', 'pickup_at',

            'inspector', 'inspector_phone', 'inspection_at', 'inspection_notes',

            'refund_method', 'refund_amount', 'refund_reference',
            'refund_processed_at', 'refund_processed_by', 'refund_processed_by_phone',

            'rejection_reason',
            'created_at', 'updated_at',

            'items', 'photos',
            'is_active', 'is_terminal', 'is_success',
        )
        read_only_fields = (
            'id', 'return_number', 'order', 'order_number', 'dispute',
            'replacement_order',
            'initiated_by', 'initiated_by_phone', 'initiator_role',
            'status', 'status_changed_at', 'status_changed_by', 'status_changed_by_phone',
            'inspector', 'inspector_phone', 'inspection_at',
            'refund_processed_at', 'refund_processed_by', 'refund_processed_by_phone',
            'created_at', 'updated_at',
            'items', 'photos',
            'is_active', 'is_terminal', 'is_success',
        )

    def get_initiated_by_phone(self, obj):
        return getattr(obj.initiated_by, 'phone', None)

    def get_status_changed_by_phone(self, obj):
        return getattr(obj.status_changed_by, 'phone', None)

    def get_inspector_phone(self, obj):
        return getattr(obj.inspector, 'phone', None)

    def get_refund_processed_by_phone(self, obj):
        return getattr(obj.refund_processed_by, 'phone', None)

    def get_order_number(self, obj):
        return obj.order_id


class CreateOrderReturnSerializer(serializers.Serializer):
    """
    POST /api/admin/orders/<id>/returns/ uchun input.

    `items`: [{order_item_id, quantity}] — qisman qaytarish uchun.
              Yuborilmasa, AYTOMAT mavjud barcha qoldiq item'lar olinadi
              (eligibility shu yo'lda ham ishlaydi).
    `reason_code`: REASON_CHOICES dan biri.
    `reason_text`: ixtiyoriy, batafsil.
    `customer_request_note`: telefon orqali kelgan so'rov uchun.
    `claim_images`: 0-5 ta dalil rasmi (multipart).
    """
    from .models import OrderReturn as _OR

    items = serializers.ListField(
        child=serializers.DictField(child=serializers.IntegerField()),
        required=False,
        allow_empty=True,
    )
    reason_code = serializers.ChoiceField(choices=[c[0] for c in _OR.REASON_CHOICES])
    reason_text = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    customer_request_note = serializers.CharField(
        required=False, allow_blank=True, max_length=1000,
    )
    claim_images = serializers.ListField(
        child=serializers.ImageField(),
        required=False, allow_empty=True, max_length=5,
        error_messages={'max_length': "Eng ko'pi 5 ta rasm yuborishingiz mumkin."},
    )


class TransitionReturnStatusSerializer(serializers.Serializer):
    """
    PATCH /api/admin/returns/<id>/transition/ uchun input.

    `new_status`     — yangi status (state machine tekshiradi)
    `note`           — umumiy izoh (history'ga yoziladi)
    `inspection_notes` — ACCEPTED/REJECTED da inspector izohi
    `refund_method`  — REFUNDED ga o'tish oldidan tanlanishi mumkin
    `refund_amount`, `refund_reference` — refund ma'lumotlari
    `inspection_images` — INSPECTING/ACCEPTED da olingan rasmlar
    """
    from .models import OrderReturn as _OR

    new_status = serializers.ChoiceField(choices=[c[0] for c in _OR.STATUS_CHOICES])
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    inspection_notes = serializers.CharField(
        required=False, allow_blank=True, max_length=2000,
    )

    refund_method = serializers.ChoiceField(
        choices=[c[0] for c in _OR.REFUND_METHOD_CHOICES],
        required=False, allow_blank=True,
    )
    refund_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, min_value=Decimal('0'),
    )
    refund_reference = serializers.CharField(
        required=False, allow_blank=True, max_length=255,
    )
    inspection_images = serializers.ListField(
        child=serializers.ImageField(),
        required=False, allow_empty=True, max_length=5,
    )


class UpdateReturnItemSerializer(serializers.Serializer):
    """
    PATCH /api/admin/returns/<id>/items/<item_id>/ — inspector qaror yangilash.
    Faqat INSPECTING yoki undan oldingi statuslarda yangilanadi.
    """
    from .models import OrderReturnItem as _ORI

    condition = serializers.ChoiceField(
        choices=[c[0] for c in _ORI.CONDITION_CHOICES],
        required=False,
    )
    restock = serializers.BooleanField(required=False)
    writeoff_reason = serializers.ChoiceField(
        choices=[c[0] for c in _ORI.WRITEOFF_CHOICES],
        required=False, allow_blank=True,
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "Yangilash uchun kamida bitta maydon yuborishingiz kerak."
            )
        return attrs
