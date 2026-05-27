from decimal import Decimal

from rest_framework import serializers
from .models import Cart, CartItem
from products.serializers import ProductListSerializer, ProductVariantSerializer


def get_cart_item_price(item):
    if item.variant:
        if item.variant.discount_price and item.variant.discount_price > 0:
            return item.variant.discount_price
        if item.variant.price and item.variant.price > 0:
            return item.variant.price

    product = item.product
    if product.is_discount and product.discount_price and product.discount_price > 0:
        return product.discount_price

    return product.price or Decimal('0.00')

class CartItemSerializer(serializers.ModelSerializer):
    product_details = ProductListSerializer(source='product', read_only=True)
    variant_details = ProductVariantSerializer(source='variant', read_only=True)

    class Meta:
        model = CartItem
        fields = ('id', 'product', 'variant', 'quantity', 'price_snapshot', 'product_details', 'variant_details')

class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ('id', 'user', 'guest_session_id', 'items', 'total_price', 'created_at')

    def get_total_price(self, obj):
        from orders.services import effective_master_percent, apply_master_discount
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        master_pct = effective_master_percent(user)

        total = Decimal('0.00')
        for item in obj.items.all():
            price = get_cart_item_price(item)
            if master_pct > 0:
                price = apply_master_discount(price, master_pct)
            total += price * item.quantity
        return total

class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(default=1, min_value=1)


class LocalCartSyncItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, default=1)


class LocalCartSyncSerializer(serializers.Serializer):
    items = LocalCartSyncItemSerializer(many=True)
