from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import Order, OrderHistory, OrderItem, Payment


STATUS_TRANSITIONS = {
    Order.STATUS_PENDING: {Order.STATUS_CONFIRMED},
    Order.STATUS_CONFIRMED: {Order.STATUS_PACKING},
    Order.STATUS_PACKING: {Order.STATUS_SHIPPING},
    Order.STATUS_SHIPPING: {Order.STATUS_DELIVERED},
    Order.STATUS_DELIVERED: set(),
    Order.STATUS_CANCELLED_BY_USER: set(),
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


def _available_stock(product, variant=None):
    return variant.stock if variant else product.stock


def ensure_stock_available(product, quantity, variant=None):
    available = _available_stock(product, variant)
    if available < quantity:
        target = 'variant' if variant else 'product'
        raise serializers.ValidationError(
            {'error': f"{product.name} uchun {target} stock yetarli emas."}
        )


def reserve_inventory(product, quantity, variant=None):
    ensure_stock_available(product, quantity, variant)
    if variant:
        variant.stock -= quantity
        variant.save(update_fields=['stock'])
    else:
        product.stock -= quantity
        product.save(update_fields=['stock'])


def restore_inventory(order_item):
    if order_item.variant_id and order_item.variant:
        order_item.variant.stock += order_item.quantity
        order_item.variant.save(update_fields=['stock'])
        return

    if order_item.product_id and order_item.product:
        order_item.product.stock += order_item.quantity
        order_item.product.save(update_fields=['stock'])


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
def create_order_with_items(*, user, receiver_name, receiver_phone, delivery_address, payment_method, items):
    if not items:
        raise serializers.ValidationError({'error': "Savat bo'sh."})

    order = Order.objects.create(
        user=user,
        receiver_name=receiver_name,
        receiver_phone=receiver_phone,
        delivery_address=delivery_address,
        payment_method=payment_method,
        status=Order.STATUS_PENDING,
    )

    total_price = Decimal('0.00')
    for item in items:
        product = item['product']
        variant = item.get('variant')
        quantity = int(item.get('quantity', 1))
        ensure_stock_available(product, quantity, variant)
        reserve_inventory(product, quantity, variant)
        price = Decimal(str(get_line_price(product, variant)))
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

    create_order_history(
        order,
        to_status=Order.STATUS_PENDING,
        actor_type=OrderHistory.ACTOR_USER if user else OrderHistory.ACTOR_SYSTEM,
        actor=user,
        note="Buyurtma yaratildi.",
    )
    return order


@transaction.atomic
def cancel_order(*, order, cancelled_status, actor_type, actor=None, reason=''):
    if order.status in Order.CANCELLATION_STATUSES:
        return order

    if order.status == Order.STATUS_DELIVERED:
        raise serializers.ValidationError({'error': 'Yetkazilgan buyurtmani bekor qilib bo\'lmaydi.'})

    if cancelled_status not in Order.CANCELLATION_STATUSES:
        raise serializers.ValidationError({'error': "Noto'g'ri cancellation status."})

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
        if new_status == Order.STATUS_CONFIRMED and payment.method == Order.PAYMENT_METHOD_CARD and payment.status == Payment.STATUS_PENDING:
            payment.status = Payment.STATUS_PAID
            payment.save(update_fields=['status', 'updated_at'])
        elif new_status == Order.STATUS_DELIVERED and payment.method == Order.PAYMENT_METHOD_CASH and payment.status == Payment.STATUS_PENDING:
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


def auto_cancel_expired_orders(minutes=30):
    threshold = timezone.now() - timedelta(minutes=minutes)
    expired_orders = (
        Order.objects.select_related('payment')
        .prefetch_related('items__product', 'items__variant')
        .filter(
            status=Order.STATUS_PENDING,
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
