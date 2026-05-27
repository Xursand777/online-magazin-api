from rest_framework import generics, views, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from users.permissions import (
    IsStaffMember, IsAdminOrAbove, IsSuperAdmin,
    CanAccessKassa, CanAccessReports, CanCreatePOS, can_transition,
)
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum, Count, Avg, F, DecimalField, Q
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
from .services import auto_cancel_expired_orders, check_credit_eligibility, create_order_with_items, pay_credit_order, transition_order_status


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
            credit_days=data.get('credit_days'),
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
            credit_days=data.get('credit_days'),
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


class OrderPagePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminOrderListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated, IsStaffMember)
    serializer_class = OrderSerializer
    pagination_class = OrderPagePagination

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

        q = self.request.query_params.get('q', '').strip()
        if q:
            q_filter = Q(receiver_name__icontains=q) | Q(receiver_phone__icontains=q)
            if q.isdigit():
                q_filter |= Q(id=int(q))
            queryset = queryset.filter(q_filter)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        payment_method = self.request.query_params.get('payment_method')
        if payment_method:
            queryset = queryset.filter(payment_method=payment_method)

        is_credit = self.request.query_params.get('is_credit')
        if is_credit == 'true':
            queryset = queryset.filter(is_credit=True)
        elif is_credit == 'false':
            queryset = queryset.filter(is_credit=False)

        payment_status = self.request.query_params.get('payment_status')
        if payment_status:
            queryset = queryset.filter(payment__status=payment_status)

        return queryset


class AdminOrderStatusUpdateView(views.APIView):
    permission_classes = (IsAuthenticated, IsStaffMember)

    def post(self, request, pk, *args, **kwargs):
        auto_cancel_expired_orders()
        order = get_object_or_404(Order.objects.select_related('payment'), pk=pk)
        serializer = AdminOrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data['status']

        if not can_transition(request.user, order.status, new_status):
            return Response(
                {'detail': f"Sizning rolingiz '{order.status}' → '{new_status}' o'tishga ruxsat bermaydi."},
                status=status.HTTP_403_FORBIDDEN,
            )

        order = transition_order_status(
            order=order,
            new_status=new_status,
            actor_type=OrderHistory.ACTOR_ADMIN,
            actor=request.user,
            note=serializer.validated_data.get('note', ''),
        )
        return Response(OrderSerializer(order, context={'request': request}).data)


class AdminCustomerHistoryView(views.APIView):
    """Admin: telefon raqam bo'yicha barcha buyurtmalar tarixi (POS + online)."""
    permission_classes = (IsAuthenticated, IsStaffMember)

    def get(self, request, *args, **kwargs):
        from users.utils import find_user_by_phone, phone_lookup_variants, normalize_phone_number

        raw_phone = request.query_params.get('phone', '').strip()
        if not raw_phone:
            return Response({'error': "Telefon raqami kiritilmagan."}, status=status.HTTP_400_BAD_REQUEST)

        # find_user_by_phone barcha formatlarda qidiradi (+998XX, 9XX, 998XX...)
        user = find_user_by_phone(raw_phone)

        # Barcha format variantlari — receiver_phone har xil formatda saqlanishi mumkin
        variants = phone_lookup_variants(raw_phone)

        # Foydalanuvchiga bog'liq barcha buyurtmalar (receiver_phone har qanday bo'lishi mumkin)
        user_qs = Order.objects.filter(user=user) if user else Order.objects.none()

        # Har qanday buyurtmada receiver_phone mos keladiganlar (mehmon + onlayn)
        phone_qs = Order.objects.filter(receiver_phone__in=variants)

        all_orders = (
            (user_qs | phone_qs)
            .distinct()
            .prefetch_related('items__product', 'items__variant', 'payment')
            .select_related('user')
            .order_by('-created_at')
        )

        result = []
        for order in all_orders:
            items_info = []
            for item in order.items.all():
                product_name = item.product.name if item.product else "Noma'lum"
                variant_info = ''
                if item.variant:
                    parts = [
                        item.variant.color or '',
                        item.variant.size or '',
                        item.variant.model or '',
                        item.variant.quality or '',
                    ]
                    variant_info = ' / '.join(p for p in parts if p)
                items_info.append({
                    'name': product_name,
                    'variant': variant_info,
                    'quantity': item.quantity,
                    'price': str(item.price_snapshot),
                })

            payment = getattr(order, 'payment', None)
            result.append({
                'id': order.id,
                'created_at': order.created_at.isoformat(),
                'status': order.status,
                'payment_method': order.payment_method,
                'payment_status': payment.status if payment else None,
                'total_price': str(order.total_price),
                'receiver_name': order.receiver_name,
                'receiver_phone': order.receiver_phone,
                'is_credit': order.is_credit,
                'credit_due_date': str(order.credit_due_date) if order.credit_due_date else None,
                'credit_paid': order.credit_paid,
                'delivery_address': order.delivery_address,
                'items': items_info,
            })

        customer_info = None
        if user:
            customer_info = {
                'id': user.id,
                'phone': user.phone,
                'first_name': user.first_name or '',
                'last_name': user.last_name or '',
                'credit_ban': getattr(user, 'credit_ban', False),
                'overdue_credit_count': getattr(user, 'overdue_credit_count', 0),
            }

        return Response({
            'customer': customer_info,
            'phone': raw_phone,
            'orders': result,
            'total_count': len(result),
        })


class AdminCreditPayView(views.APIView):
    """Admin muddatli to'lov buyurtmasini to'langan deb belgilaydi."""
    permission_classes = (IsAuthenticated, CanAccessKassa)

    def post(self, request, pk, *args, **kwargs):
        order = get_object_or_404(Order, pk=pk)
        order = pay_credit_order(order=order, actor=request.user)
        return Response(OrderSerializer(order, context={'request': request}).data)


class UserCreditStatusView(views.APIView):
    """Foydalanuvchining muddatli to'lov holati (ban, to'lanmagan, muddati o'tgan)."""
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        from django.utils import timezone
        from django.db import transaction as db_transaction

        user = request.user
        today = timezone.now().date()

        # Muddati o'tgan buyurtmalarni avtomatik hisobga olamiz (read-only GET bo'lsa ham)
        with db_transaction.atomic():
            overdue_qs = (
                Order.objects
                .filter(
                    user=user,
                    is_credit=True,
                    credit_paid=False,
                    credit_overdue_counted=False,
                    credit_due_date__lt=today,
                )
                .exclude(status__in=Order.CANCELLATION_STATUSES)
            )
            if overdue_qs.exists():
                from users.models import User as UserModel
                user_obj = UserModel.objects.select_for_update().get(pk=user.pk)
                count = overdue_qs.count()
                overdue_qs.update(credit_overdue_counted=True)
                user_obj.overdue_credit_count = (user_obj.overdue_credit_count or 0) + count
                if user_obj.overdue_credit_count >= 3:
                    user_obj.credit_ban = True
                user_obj.save(update_fields=['overdue_credit_count', 'credit_ban'])
                # Cached attributelarni yangilaymiz
                user.credit_ban = user_obj.credit_ban
                user.overdue_credit_count = user_obj.overdue_credit_count

        active_credit = (
            Order.objects.filter(
                user=user,
                is_credit=True,
                credit_paid=False,
            )
            .exclude(status__in=Order.CANCELLATION_STATUSES)
            .order_by('credit_due_date')
            .first()
        )

        overdue = (
            active_credit is not None
            and active_credit.credit_due_date is not None
            and active_credit.credit_due_date < today
        )

        return Response({
            'credit_ban': user.credit_ban,
            'overdue_credit_count': user.overdue_credit_count,
            'has_unpaid_credit': active_credit is not None,
            'unpaid_credit_order_id': active_credit.id if active_credit else None,
            'unpaid_credit_due_date': str(active_credit.credit_due_date) if active_credit else None,
            'is_overdue': overdue,
        })


class AdminReportView(views.APIView):
    """Admin uchun to'liq hisobot: KPI, vaqt qatori, mahsulotlar statistikasi."""
    permission_classes = (IsAuthenticated, CanAccessReports)

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
        delivered_qs = qs.filter(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])
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

        # --- Cheklar (Savdo) statistikasi ---
        # Barcha yetkazilgan (sotilgan) buyurtmalar haqida batafsil ma'lumot
        orders_list = []
        for order in delivered_qs:
            order_items = []
            for item in order.items.all():
                variant = item.variant
                product = item.product
                
                # Asl narx (Chegirmasiz)
                original_price = float(variant.price if variant and variant.price is not None else (product.price if product else 0))
                # Sotilgan narx (Chegirmali)
                sold_price = float(item.price_snapshot)
                
                # Chegirma hisob-kitobi
                discount_amount = max(0, original_price - sold_price) * item.quantity
                discount_percent = 0.0
                if original_price > 0 and sold_price < original_price:
                    discount_percent = ((original_price - sold_price) / original_price) * 100

                # Full name construction
                full_name = product.name if product else 'Unknown'
                if variant:
                    attrs = []
                    if variant.quality: attrs.append(variant.quality)
                    if variant.size: attrs.append(variant.size)
                    elif variant.model: attrs.append(variant.model)
                    if variant.color: attrs.append(variant.color)
                    if attrs:
                        full_name = f"{full_name} • {' • '.join(attrs)}"

                order_items.append({
                    'id': item.id,
                    'product_name': full_name,
                    'quantity': item.quantity,
                    'original_price': original_price,
                    'sold_price': sold_price,
                    'discount_percent': round(discount_percent, 2),
                    'discount_amount': discount_amount,
                })

            orders_list.append({
                'id': order.id,
                'created_at': order.created_at.isoformat(),
                'receiver_name': order.receiver_name,
                'receiver_phone': order.receiver_phone,
                'total_price': float(order.total_price),
                'total_discount': float(order.discount_price),
                'items': order_items,
            })

        return Response({
            'summary': summary,
            'timeline': timeline,
            'products': products_list,
            'orders': orders_list,
        })


class AdminPOSOrderView(views.APIView):
    """
    Admin POS (Point of Sale): do'konda bevosita savdo.
    Ro'yxatdan o'tmagan mijozlar uchun ham ishlaydi.
    """
    permission_classes = (IsAuthenticated, CanCreatePOS)

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        import re
        from users.models import User as UserModel
        from .services import create_order_history as _create_history
        from .models import Payment

        # --- Telefon raqamni normalize qilish ---
        raw_phone = request.data.get('phone', '').strip()
        if not raw_phone:
            return Response({"error": "Telefon raqami kiritilishi shart."}, status=status.HTTP_400_BAD_REQUEST)

        digits = re.sub(r'\D', '', raw_phone)
        if len(digits) == 9:
            phone = '+998' + digits
        elif len(digits) == 12 and digits.startswith('998'):
            phone = '+' + digits
        else:
            return Response(
                {"error": "Telefon raqami noto'g'ri. +998 XX XXXXXXX formatida kiriting (9 ta raqam)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        first_name = request.data.get('first_name', '').strip()
        last_name = request.data.get('last_name', '').strip()
        payment_method = request.data.get('payment_method', Order.PAYMENT_METHOD_CASH)
        items_data = request.data.get('items', [])
        credit_days_raw = request.data.get('credit_days')

        if not items_data:
            return Response({"error": "Savat bo'sh."}, status=status.HTTP_400_BAD_REQUEST)

        if payment_method not in dict(Order.PAYMENT_METHOD_CHOICES):
            return Response({"error": "Noto'g'ri to'lov turi."}, status=status.HTTP_400_BAD_REQUEST)

        # --- Mijozni topish — barcha format variantlari bo'yicha ---
        from users.utils import find_user_by_phone
        user = find_user_by_phone(phone)

        # Muddatli to'lov faqat ro'yxatdan o'tgan mijoz uchun
        if payment_method == Order.PAYMENT_METHOD_CREDIT and not user:
            return Response(
                {"error": "Muddatli to'lov faqat tizimda ro'yxatdan o'tgan mijozlar uchun mumkin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credit_days = None
        if payment_method == Order.PAYMENT_METHOD_CREDIT:
            try:
                credit_days = int(credit_days_raw)
            except (TypeError, ValueError):
                return Response({"error": "To'lov muddati son bo'lishi shart."}, status=status.HTTP_400_BAD_REQUEST)
            if not (Order.CREDIT_DAYS_MIN <= credit_days <= Order.CREDIT_DAYS_MAX):
                return Response(
                    {"error": f"To'lov muddati {Order.CREDIT_DAYS_MIN}–{Order.CREDIT_DAYS_MAX} kun bo'lishi shart."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # --- Mahsulotlarni parse qilish ---
        items = []
        for item_data in items_data:
            try:
                product = Product.objects.get(id=item_data['product_id'], is_active=True)
            except Product.DoesNotExist:
                return Response({"error": f"Mahsulot #{item_data.get('product_id')} topilmadi."}, status=status.HTTP_400_BAD_REQUEST)
            variant = None
            if item_data.get('variant_id'):
                try:
                    variant = ProductVariant.objects.get(id=item_data['variant_id'], product=product)
                except ProductVariant.DoesNotExist:
                    return Response({"error": "Variant topilmadi."}, status=status.HTTP_400_BAD_REQUEST)
            items.append({
                'product': product,
                'variant': variant,
                'quantity': max(1, int(item_data.get('quantity', 1))),
            })

        # --- Qabul qiluvchi nomi ---
        if user:
            receiver_name = f"{user.first_name} {user.last_name}".strip() or first_name or "Mijoz"
        else:
            receiver_name = f"{first_name} {last_name}".strip() or "Noma'lum mijoz"

        # --- Buyurtma yaratish (kredit cheklovini o'tkazib yuboramiz — admin boshqaradi) ---
        order = create_order_with_items(
            user=user,
            receiver_name=receiver_name,
            receiver_phone=phone,
            delivery_address="Do'kondan olib ketildi (POS)",
            payment_method=payment_method,
            items=items,
            credit_days=credit_days,
            skip_credit_check=True,  # POS admin o'zi nazorat qiladi
        )

        # --- Statusni RECEIVED ga to'g'ridan-to'g'ri o'tkazish (do'konda xaridorga topshirildi) ---
        from .services import Payment as PaymentModel
        prev_status = order.status
        order.status = Order.STATUS_RECEIVED
        order.save(update_fields=['status', 'updated_at'])

        # Muddatli to'lov bo'lmasa, to'lovni PAID deb belgilaymiz
        payment_obj = getattr(order, 'payment', None)
        if payment_obj and payment_method != Order.PAYMENT_METHOD_CREDIT:
            payment_obj.status = Payment.STATUS_PAID
            payment_obj.save(update_fields=['status', 'updated_at'])

        _create_history(
            order,
            to_status=Order.STATUS_RECEIVED,
            from_status=prev_status,
            actor_type=OrderHistory.ACTOR_ADMIN,
            actor=request.user,
            note="POS orqali do'konda sotildi.",
        )

        order.refresh_from_db()
        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_201_CREATED)

class KassaView(views.APIView):
    """Admin Kassa statistikasi va yechib olingan pullar tarixi."""
    permission_classes = (IsAuthenticated, CanAccessKassa)

    def get(self, request, *args, **kwargs):
        from orders.models import Order, Withdrawal

        delivered_qs = Order.objects.filter(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])
        total_income = delivered_qs.aggregate(total=Sum('total_price'))['total'] or 0

        withdrawals_qs = Withdrawal.objects.all()
        total_expense = withdrawals_qs.aggregate(total=Sum('amount'))['total'] or 0

        balance = float(total_income) - float(total_expense)

        # To'lov usullari bo'yicha tushum
        cash_income = delivered_qs.filter(payment_method=Order.PAYMENT_METHOD_CASH).aggregate(t=Sum('total_price'))['t'] or 0
        card_income = delivered_qs.filter(payment_method=Order.PAYMENT_METHOD_CARD).aggregate(t=Sum('total_price'))['t'] or 0
        credit_income = delivered_qs.filter(payment_method=Order.PAYMENT_METHOD_CREDIT).aggregate(t=Sum('total_price'))['t'] or 0

        # Haftalik kunlik jadval (oxirgi 7 kun)
        today = datetime.date.today()
        weekly_start = today - datetime.timedelta(days=6)
        weekly_rows = (
            delivered_qs
            .filter(created_at__date__gte=weekly_start)
            .annotate(day=TruncDay('created_at'))
            .values('day')
            .annotate(income=Sum('total_price'))
            .order_by('day')
        )
        weekly_map = {row['day'].date(): float(row['income'] or 0) for row in weekly_rows}
        weekly_chart = []
        for i in range(7):
            d = weekly_start + datetime.timedelta(days=i)
            weekly_chart.append({'date': d.isoformat(), 'income': weekly_map.get(d, 0)})

        # Oxirgi yechishlar tarixi
        history = []
        for w in withdrawals_qs.select_related('admin')[:100]:
            history.append({
                'id': w.id,
                'amount': float(w.amount),
                'reason': w.reason,
                'created_at': w.created_at.isoformat(),
                'admin_name': w.admin.get_full_name() if w.admin else "Noma'lum",
            })

        return Response({
            'total_income': float(total_income),
            'total_expense': float(total_expense),
            'balance': balance,
            'payment_breakdown': {
                'cash': float(cash_income),
                'card': float(card_income),
                'credit': float(credit_income),
            },
            'weekly_chart': weekly_chart,
            'history': history,
        })


class KassaWithdrawView(views.APIView):
    """Admin kassadan pul yechib olishi."""
    permission_classes = (IsAuthenticated, CanAccessKassa)

    def post(self, request, *args, **kwargs):
        amount = request.data.get('amount')
        reason = request.data.get('reason')
        
        if not amount or float(amount) <= 0:
            return Response({'error': "Noto'g'ri summa kiritildi."}, status=status.HTTP_400_BAD_REQUEST)
        
        if not reason:
            return Response({'error': "Maqsad/izoh kiritilishi shart."}, status=status.HTTP_400_BAD_REQUEST)
            
        amount = float(amount)
        
        # Qoldiqni tekshiramiz
        from django.db.models import Sum
        from orders.models import Order, Withdrawal
        
        delivered_qs = Order.objects.filter(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])
        total_income = delivered_qs.aggregate(total=Sum('total_price'))['total'] or 0
        withdrawals_qs = Withdrawal.objects.all()
        total_expense = withdrawals_qs.aggregate(total=Sum('amount'))['total'] or 0
        balance = float(total_income) - float(total_expense)
        
        if amount > balance:
            return Response({'error': f"Kassada yetarli mablag' yo'q. Qoldiq: {balance} so'm."}, status=status.HTTP_400_BAD_REQUEST)
            
        w = Withdrawal.objects.create(
            amount=amount,
            reason=reason,
            admin=request.user
        )
        
        return Response({
            'message': "Pul muvaffaqiyatli yechildi",
            'withdrawal': {
                'id': w.id,
                'amount': float(w.amount),
                'reason': w.reason,
                'created_at': w.created_at.isoformat(),
                'admin_name': w.admin.get_full_name() if w.admin else "Noma'lum",
            }
        })


class AdminDashboardView(views.APIView):
    """Admin bosh sahifasi — barcha asosiy ko'rsatkichlar bitta so'rovda."""
    permission_classes = (IsAuthenticated, IsStaffMember)

    def get(self, request, *args, **kwargs):
        from django.db.models import Sum, Count
        from orders.models import Order, Withdrawal
        from products.models import Product

        today = timezone.now().date()
        month_start = today.replace(day=1)

        # Bugungi
        today_qs = Order.objects.filter(created_at__date=today)
        today_orders = today_qs.count()
        today_revenue = float(
            today_qs.filter(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])
            .aggregate(total=Sum('total_price'))['total'] or 0
        )

        # Bu oy
        month_qs = Order.objects.filter(created_at__date__gte=month_start)
        month_orders = month_qs.count()
        month_revenue = float(
            month_qs.filter(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])
            .aggregate(total=Sum('total_price'))['total'] or 0
        )

        # Kutilayotgan va qayta ishlanayotgan
        pending_count = Order.objects.filter(status='PENDING').count()
        processing_count = Order.objects.filter(
            status__in=['CONFIRMED', 'PACKING', 'SHIPPING']
        ).count()

        # Muddati o'tgan nasiyalar
        overdue_credits = Order.objects.filter(
            is_credit=True, credit_paid=False, credit_due_date__lt=today
        ).count()

        # Kassa balansi
        total_income = float(
            Order.objects.filter(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])
            .aggregate(total=Sum('total_price'))['total'] or 0
        )
        total_expense = float(
            Withdrawal.objects.aggregate(total=Sum('amount'))['total'] or 0
        )
        kassa_balance = total_income - total_expense

        # Zaxira holati
        low_stock = Product.objects.filter(is_active=True, stock__gt=0, stock__lte=5).count()
        out_of_stock = Product.objects.filter(is_active=True, stock=0).count()

        # Status bo'yicha taqsimot
        status_breakdown = {}
        for val, _ in Order.STATUS_CHOICES:
            status_breakdown[val] = Order.objects.filter(status=val).count()

        # Oxirgi 8 ta buyurtma
        recent_orders = []
        for order in (
            Order.objects.select_related('user')
            .prefetch_related('items')
            .order_by('-created_at')[:8]
        ):
            recent_orders.append({
                'id': order.id,
                'status': order.status,
                'total_price': float(order.total_price),
                'receiver_name': order.receiver_name,
                'receiver_phone': order.receiver_phone,
                'created_at': order.created_at.isoformat(),
                'payment_method': order.payment_method,
                'is_credit': order.is_credit,
                'item_count': order.items.count(),
            })

        # Haftalik grafik (oxirgi 7 kun)
        weekly_start = today - datetime.timedelta(days=6)
        weekly_rows = (
            Order.objects.filter(created_at__date__gte=weekly_start)
            .annotate(day=TruncDay('created_at'))
            .values('day')
            .annotate(
                order_count=Count('id'),
                delivered_revenue=Sum('total_price', filter=Q(status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED])),
            )
            .order_by('day')
        )
        weekly_map = {row['day'].date(): {'orders': row['order_count'], 'revenue': float(row['delivered_revenue'] or 0)} for row in weekly_rows}
        weekly_chart = []
        for i in range(7):
            d = weekly_start + datetime.timedelta(days=i)
            entry = weekly_map.get(d, {'orders': 0, 'revenue': 0})
            weekly_chart.append({'date': d.isoformat(), 'orders': entry['orders'], 'revenue': entry['revenue']})

        # Yangi fikrlar soni
        from users.models import Feedback
        feedback_new = Feedback.objects.filter(status='new').count()

        return Response({
            'today': {'orders': today_orders, 'revenue': today_revenue},
            'month': {'orders': month_orders, 'revenue': month_revenue},
            'pending_orders': pending_count,
            'processing_orders': processing_count,
            'overdue_credits': overdue_credits,
            'kassa_balance': kassa_balance,
            'stock': {'low_stock': low_stock, 'out_of_stock': out_of_stock},
            'status_breakdown': status_breakdown,
            'recent_orders': recent_orders,
            'weekly_chart': weekly_chart,
            'feedback_new': feedback_new,
        })
