from rest_framework import generics, views, status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum, Count, Avg, F, DecimalField
from django.db.models.functions import TruncDay, TruncMonth, TruncYear
from django.utils.dateparse import parse_date
from django.utils import timezone
import datetime

from cart.views import get_or_create_cart
from products.models import Product, ProductVariant
from recommendations.services import record_product_event

from .models import Order, OrderHistory
from .serializers import (
    AdminOrderStatusUpdateSerializer,
    CancelOrderSerializer,
    OrderFromCartSerializer,
    OrderSerializer,
    QuickOrderSerializer,
)
from .services import auto_cancel_expired_orders, create_order_with_items, transition_order_status


class QuickOrderView(views.APIView):
    permission_classes = (IsAuthenticated,)

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = QuickOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        product = get_object_or_404(Product, id=data['product_id'], is_active=True)
        variant = None
        if data.get('variant_id'):
            variant = get_object_or_404(ProductVariant, id=data['variant_id'], product=product)

        order = create_order_with_items(
            user=request.user,
            receiver_name=data['receiver_name'],
            receiver_phone=data['receiver_phone'],
            delivery_address=data['delivery_address'],
            payment_method=data['payment_method'],
            items=[
                {
                    'product': product,
                    'variant': variant,
                    'quantity': data['quantity'],
                }
            ],
        )

        record_product_event(request, product, 'order', variant=variant)
        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_201_CREATED)


class OrderFromCartView(views.APIView):
    permission_classes = (IsAuthenticated,)

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        auto_cancel_expired_orders()

        cart = get_or_create_cart(request)
        cart_items = list(cart.items.select_related('product', 'variant'))
        if not cart_items:
            return Response({'error': "Savat bo'sh."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = OrderFromCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        order = create_order_with_items(
            user=request.user,
            receiver_name=data['receiver_name'],
            receiver_phone=data['receiver_phone'],
            delivery_address=data['delivery_address'],
            payment_method=data['payment_method'],
            items=[
                {
                    'product': item.product,
                    'variant': item.variant,
                    'quantity': item.quantity,
                }
                for item in cart_items
            ],
        )

        for item in cart_items:
            record_product_event(request, item.product, 'order', variant=item.variant)

        cart.items.all().delete()
        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_201_CREATED)


class OrderListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = OrderSerializer

    def get_queryset(self):
        auto_cancel_expired_orders()
        return (
            Order.objects.filter(user=self.request.user)
            .prefetch_related('items__product__images', 'items__variant', 'history', 'payment')
            .order_by('-created_at')
        )


class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = OrderSerializer

    def get_queryset(self):
        auto_cancel_expired_orders()
        return (
            Order.objects.filter(user=self.request.user)
            .prefetch_related('items__product__images', 'items__variant', 'history', 'payment')
        )


class UserCancelOrderView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk, *args, **kwargs):
        auto_cancel_expired_orders()
        order = get_object_or_404(Order, pk=pk, user=request.user)
        serializer = CancelOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = transition_order_status(
            order=order,
            new_status=Order.STATUS_CANCELLED_BY_USER,
            actor_type=OrderHistory.ACTOR_USER,
            actor=request.user,
            note=serializer.validated_data['cancellation_reason'],
        )
        return Response(OrderSerializer(order, context={'request': request}).data)


class AdminOrderListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated, IsAdminUser)
    serializer_class = OrderSerializer

    def get_queryset(self):
        auto_cancel_expired_orders()
        queryset = (
            Order.objects.select_related('user', 'payment')
            .prefetch_related('items__product__images', 'items__variant', 'history')
            .order_by('-created_at')
        )
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class AdminOrderStatusUpdateView(views.APIView):
    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, pk, *args, **kwargs):
        auto_cancel_expired_orders()
        order = get_object_or_404(Order.objects.select_related('payment'), pk=pk)
        serializer = AdminOrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = transition_order_status(
            order=order,
            new_status=serializer.validated_data['status'],
            actor_type=OrderHistory.ACTOR_ADMIN,
            actor=request.user,
            note=serializer.validated_data.get('note', ''),
        )
        return Response(OrderSerializer(order, context={'request': request}).data)


class AdminReportView(views.APIView):
    """Admin uchun to'liq hisobot: KPI, vaqt qatori, mahsulotlar statistikasi."""
    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request, *args, **kwargs):
        # --- Sana diapazoni ---
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')
        period = request.query_params.get('period', 'daily')  # daily | monthly | yearly

        qs = Order.objects.select_related('payment').prefetch_related('items__product__variants', 'items__variant')

        if date_from_str:
            try:
                date_from = parse_date(date_from_str)
                if date_from:
                    qs = qs.filter(created_at__date__gte=date_from)
            except (ValueError, TypeError):
                pass

        if date_to_str:
            try:
                date_to = parse_date(date_to_str)
                if date_to:
                    qs = qs.filter(created_at__date__lte=date_to)
            except (ValueError, TypeError):
                pass

        # --- KPI Summary ---
        delivered_qs = qs.filter(status=Order.STATUS_DELIVERED)
        cancelled_qs = qs.filter(status__in=[
            Order.STATUS_CANCELLED_BY_USER,
            Order.STATUS_CANCELLED_BY_ADMIN,
            Order.STATUS_SYSTEM_AUTO_CANCEL,
        ])

        total_revenue = delivered_qs.aggregate(total=Sum('total_price'))['total'] or 0
        total_discount = delivered_qs.aggregate(total=Sum('discount_price'))['total'] or 0
        avg_order = delivered_qs.aggregate(avg=Avg('total_price'))['avg'] or 0
        total_orders = qs.count()
        delivered_count = delivered_qs.count()
        cancelled_count = cancelled_qs.count()
        pending_count = qs.filter(status=Order.STATUS_PENDING).count()

        # Calculate total cost price for delivered orders using variant cost overrides when present.
        from orders.models import OrderItem
        delivered_items = list(
            OrderItem.objects.filter(order__in=delivered_qs).select_related('product', 'variant')
        )
        total_cost = sum(
            (item.variant.cost_price if item.variant and item.variant.cost_price is not None else item.product.cost_price or 0) * item.quantity
            for item in delivered_items
        )

        summary = {
            'total_revenue': float(total_revenue),
            'total_discount': float(total_discount),
            'total_cost': float(total_cost),
            'avg_order_value': float(avg_order),
            'total_orders': total_orders,
            'delivered_orders': delivered_count,
            'cancelled_orders': cancelled_count,
            'pending_orders': pending_count,
            'net_profit': float(total_revenue) - float(total_cost),
        }

        # --- Vaqt bo'yicha timeline (faqat delivered) ---
        trunc_fn = {'daily': TruncDay, 'monthly': TruncMonth, 'yearly': TruncYear}.get(period, TruncDay)
        timeline_qs = (
            delivered_qs
            .annotate(period_date=trunc_fn('created_at'))
            .values('period_date')
            .annotate(
                revenue=Sum('total_price'),
                discount=Sum('discount_price'),
                count=Count('id'),
            )
            .order_by('period_date')
        )
        timeline = [
            {
                'date': entry['period_date'].strftime('%Y-%m-%d') if entry['period_date'] else None,
                'revenue': float(entry['revenue'] or 0),
                'discount': float(entry['discount'] or 0),
                'count': entry['count'],
            }
            for entry in timeline_qs
        ]

        # --- Mahsulotlar bo'yicha batafsil statistika ---
        from orders.models import OrderItem
        from products.models import Product

        items_qs = (
            OrderItem.objects
            .filter(order__in=qs)
            .select_related('product', 'variant')
        )

        # Har bir mahsulot + variant kombinatsiyasi uchun yig'ish
        product_stats = {}
        for item in items_qs:
            product = item.product
            if not product:
                continue

            variant = item.variant
            key = (product.id, variant.id if variant else None)

            if key not in product_stats:
                product_stats[key] = {
                    'id': product.id,
                    'name': product.name,
                    'quality': variant.quality if variant else '',
                    'model': variant.model if variant else '',
                    'size': variant.size if variant else '',
                    'color': variant.color if variant else '',
                    'sku': variant.sku if variant else '',
                    'price': float(variant.price if variant and variant.price is not None else product.price),
                    'discount_price': float(variant.discount_price) if variant and variant.discount_price is not None else (float(product.discount_price) if product.discount_price else None),
                    'cost_price': float(variant.cost_price) if variant and variant.cost_price is not None else float(product.cost_price),
                    'quantity_sold': 0,
                    'total_revenue': 0.0,
                    'total_cost': 0.0,
                }

            qty = item.quantity or 1
            price_snap = float(item.price_snapshot or 0)
            cost_price = float(variant.cost_price if variant and variant.cost_price is not None else (product.cost_price or 0))

            product_stats[key]['quantity_sold'] += qty
            product_stats[key]['total_revenue'] += price_snap * qty
            product_stats[key]['total_cost'] += cost_price * qty

        # Sort: eng ko'p sotilgan birinchi
        products_list = sorted(product_stats.values(), key=lambda x: x['quantity_sold'], reverse=True)

        # Tartib raqami qo'shish
        for idx, p in enumerate(products_list, start=1):
            p['rank'] = idx
            p['sold_price'] = p['total_revenue'] / p['quantity_sold'] if p['quantity_sold'] > 0 else 0
            p['net_profit'] = p['total_revenue'] - p['total_cost']

        return Response({
            'summary': summary,
            'timeline': timeline,
            'products': products_list,
        })
