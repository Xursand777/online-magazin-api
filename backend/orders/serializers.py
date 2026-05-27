from rest_framework import serializers

from .models import Order, OrderHistory, OrderItem, Payment
from products.serializers import ProductListSerializer, ProductVariantSerializer


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


class QuickOrderSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(default=1, min_value=1)

    receiver_name = serializers.CharField(max_length=255)
    receiver_phone = serializers.CharField(max_length=20)
    delivery_address = serializers.CharField()
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
        return attrs


class OrderFromCartSerializer(serializers.Serializer):
    receiver_name = serializers.CharField(max_length=255)
    receiver_phone = serializers.CharField(max_length=20)
    delivery_address = serializers.CharField()
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
        return attrs


class CancelOrderSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(max_length=1000)


class AdminOrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.STATUS_CHOICES)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)
