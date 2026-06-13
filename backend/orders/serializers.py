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
        )

    def get_can_cancel(self, obj):
        return obj.status in Order.CANCELLABLE_STATUSES

    def get_can_admin_cancel(self, obj) -> bool:
        """
        Backend'dan keluvchi, admin UI uchun ishonchli manba.
        Har bir to'lov usuli va holat kombinatsiyasi uchun hisoblanadi.
        """
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
