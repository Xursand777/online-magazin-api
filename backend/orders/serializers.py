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
            'created_at',
            'updated_at',
            'can_cancel',
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
            'can_cancel',
        )

    def get_can_cancel(self, obj):
        return obj.status in Order.CANCELLABLE_STATUSES


class QuickOrderSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(default=1, min_value=1)

    receiver_name = serializers.CharField(max_length=255)
    receiver_phone = serializers.CharField(max_length=20)
    delivery_address = serializers.CharField()
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default=Order.PAYMENT_METHOD_CASH)


class OrderFromCartSerializer(serializers.Serializer):
    receiver_name = serializers.CharField(max_length=255)
    receiver_phone = serializers.CharField(max_length=20)
    delivery_address = serializers.CharField()
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_METHOD_CHOICES, default=Order.PAYMENT_METHOD_CASH)


class CancelOrderSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(max_length=1000)


class AdminOrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.STATUS_CHOICES)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)
