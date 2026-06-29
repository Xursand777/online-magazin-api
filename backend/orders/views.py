from rest_framework import generics, serializers as drf_serializers, views, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from users.permissions import (
    IsStaffMember, IsAdminOrAbove, IsSuperAdmin,
    CanAccessKassa, CanAccessReports, CanCreatePOS,
    CanConfirmDelivery, can_transition,
)
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum, Count, Avg, F, DecimalField, Q, Max
from django.db.models.functions import TruncDay, TruncMonth, TruncYear
from django.utils.dateparse import parse_date
from django.utils import timezone
import datetime

from cart.views import get_or_create_cart
from products.models import Product, ProductVariant
from recommendations.services import record_product_event

from .models import Order, OrderDispute, OrderHistory
from .serializers import (
    AdminDefectItemSerializer,
    AdminOrderStatusUpdateSerializer,
    AdminUpdateDisputeSerializer,
    CancelOrderSerializer,
    CourierConfirmDeliverySerializer,
    CreateOrderDisputeSerializer,
    CreateOrderReturnSerializer,
    OrderDisputeSerializer,
    OrderFromCartSerializer,
    OrderReturnPhotoSerializer,
    OrderReturnSerializer,
    OrderSerializer,
    QuickOrderSerializer,
    TransitionReturnStatusSerializer,
    UpdateReturnItemSerializer,
)
from .services import (
    check_credit_eligibility,
    check_return_eligibility,
    default_return_item_disposition,
    courier_confirm_delivery,
    create_order_dispute,
    create_order_with_items,
    get_kassa_balance,
    mark_overdue_credits,
    pay_credit_order,
    transition_order_status,
    transition_return_status,
    update_order_dispute,
)
from .idempotency import (
    IdempotencyConflict,
    acquire_idempotency_lock,
    get_idempotency_key,
    release_idempotency_lock,
    save_idempotency_response,
)


class QuickOrderView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        # ── IDEMPOTENCY GATE — slow internet retry himoyasi ──────────────────
        # Frontend X-Idempotency-Key header'da UUID v4 yuboradi. Klient
        # eski versiyasi bo'lsa header yo'q — bu holatda eski xulq saqlanadi
        # (yangi buyurtma yaratiladi). Yangi klientlar dublikatdan himoyalangan.
        idem_key = get_idempotency_key(request)
        if idem_key:
            try:
                acquired, cached = acquire_idempotency_lock(request.user.id, idem_key)
            except IdempotencyConflict as exc:
                return Response(
                    {'error': exc.message, 'code': 'idempotency_in_progress'},
                    status=status.HTTP_409_CONFLICT,
                    headers={'Retry-After': '3'},
                )
            if not acquired and cached:
                # Buyurtma allaqachon yaratilgan — cached response qaytaramiz
                return Response(cached, status=status.HTTP_201_CREATED)

        try:
            with transaction.atomic():
                serializer = QuickOrderSerializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                data = serializer.validated_data

                product = get_object_or_404(Product, id=data['product_id'], is_active=True)
                variant = None
                if data.get('variant_id'):
                    variant = get_object_or_404(ProductVariant, id=data['variant_id'], product=product)

                # receiver_phone HAR DOIM request.user.phone'dan — frontend e'tibordan chetda
                # Phase 3.0: delivery_lat/lng/notes ham qabul qilinadi (xaritadan)
                order = create_order_with_items(
                    user=request.user,
                    receiver_name=data['receiver_name'],
                    receiver_phone=request.user.phone,
                    delivery_address=data['delivery_address'],
                    delivery_lat=data.get('delivery_lat'),
                    delivery_lng=data.get('delivery_lng'),
                    delivery_notes=data.get('delivery_notes', ''),
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
                response_data = OrderSerializer(order, context={'request': request}).data

            # Transaction COMMIT bo'lgandan keyin event yozish va cache saqlash
            record_product_event(request, product, 'order', variant=variant)
            if idem_key:
                save_idempotency_response(request.user.id, idem_key, response_data)

            return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception:
            # Buyurtma yaratishda xato — lock'ni darhol bo'shatamiz, klient
            # to'g'rilab qayta urina oladi (yangi UUID bilan).
            if idem_key:
                release_idempotency_lock(request.user.id, idem_key)
            raise


class OrderFromCartView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        # ── IDEMPOTENCY GATE — slow internet retry himoyasi ──────────────────
        idem_key = get_idempotency_key(request)
        if idem_key:
            try:
                acquired, cached = acquire_idempotency_lock(request.user.id, idem_key)
            except IdempotencyConflict as exc:
                return Response(
                    {'error': exc.message, 'code': 'idempotency_in_progress'},
                    status=status.HTTP_409_CONFLICT,
                    headers={'Retry-After': '3'},
                )
            if not acquired and cached:
                return Response(cached, status=status.HTTP_201_CREATED)

        try:
            with transaction.atomic():
                cart = get_or_create_cart(request)
                cart_items = list(cart.items.select_related('product', 'variant'))
                if not cart_items:
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'error': "Savat bo'sh."})

                serializer = OrderFromCartSerializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                data = serializer.validated_data

                # receiver_phone HAR DOIM request.user.phone'dan
                # Phase 3.0: delivery_lat/lng/notes ham qabul qilinadi
                order = create_order_with_items(
                    user=request.user,
                    receiver_name=data['receiver_name'],
                    receiver_phone=request.user.phone,
                    delivery_address=data['delivery_address'],
                    delivery_lat=data.get('delivery_lat'),
                    delivery_lng=data.get('delivery_lng'),
                    delivery_notes=data.get('delivery_notes', ''),
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
                response_data = OrderSerializer(order, context={'request': request}).data
                # Savatni transaksiya ichida tozalaymiz — agar order yaratish
                # qaytarib olinsa (rollback), savat ham tiklanadi.
                items_to_track = [(item.product, item.variant) for item in cart_items]
                cart.items.all().delete()

            # COMMIT'dan keyin event yozish va cache saqlash
            for product, variant in items_to_track:
                record_product_event(request, product, 'order', variant=variant)
            if idem_key:
                save_idempotency_response(request.user.id, idem_key, response_data)

            return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception:
            if idem_key:
                release_idempotency_lock(request.user.id, idem_key)
            raise


class OrderListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = OrderSerializer

    def get_queryset(self):
        from .services import auto_cancel_expired_orders
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

        return (
            Order.objects.filter(user=self.request.user)
            .prefetch_related('items__product__images', 'items__variant', 'history', 'payment')
        )


class UserCancelOrderView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk, *args, **kwargs):

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


# ── Phase 3.0 — Kuryer Real-time Navigatsiya ────────────────────────────────
class CourierRouteTargetView(views.APIView):
    """
    GET /api/orders/<pk>/route-target/

    Kuryer xaritasi (CourierRouteMap) uchun manzil va koordinata.
    Front-end shu ma'lumotni olib OSRM'dan yo'l olib chizadi.

    Permission: kuryer / admin / super_admin.

    Response:
      {
        "order_id": 123,
        "status": "SHIPPING",
        "destination": {                # NULL bo'lishi mumkin (eski buyurtma)
          "lat": 41.549900,
          "lng": 60.633300,
          "address": "Xorazm vil., Urganch sh., A.Temur 12"
        },
        "notes": "Domofon 47, qizil eshik, 3-qavat",
        "receiver_name": "Eshmatov T.",
        "receiver_phone": "+998 91 234 56 78"
      }

    "destination=null" bo'lsa — mijoz koordinata yuborganmagan. Klient
    xaritani ko'rsatmaydi, matn manzil bo'yicha boring deydi.
    """
    permission_classes = (IsAuthenticated, CanConfirmDelivery)

    def get(self, request, pk, *args, **kwargs):
        order = get_object_or_404(
            Order.objects.only(
                'id', 'status', 'receiver_name', 'receiver_phone',
                'delivery_address', 'delivery_lat', 'delivery_lng',
                'delivery_notes',
            ),
            pk=pk,
        )

        destination = None
        if order.delivery_lat is not None and order.delivery_lng is not None:
            destination = {
                'lat': float(order.delivery_lat),
                'lng': float(order.delivery_lng),
                'address': order.delivery_address,
            }

        return Response({
            'order_id': order.id,
            'status': order.status,
            'destination': destination,
            'address_text': order.delivery_address,
            'notes': order.delivery_notes or '',
            'receiver_name': order.receiver_name,
            'receiver_phone': order.receiver_phone,
        })


# ── Phase 2.4 — Kuryer yetkazib berishni qabul kodi bilan tasdiqlaydi ───────
class CourierConfirmDeliveryView(views.APIView):
    """
    POST /api/orders/<pk>/courier-confirm/

    Body (application/json):
      received_code: 6 xonali numerik

    Permissions: kuryer, admin yoki super admin.

    DIQQAT: tasdiqlash uchun faqat qabul kodi yetarli — rasm/GPS so'ralmaydi.
    Xavfsizlik to'liq kod tomonida (brute-force lockout, one-time-use, 24 soat TTL).

    Idempotency: DELIVERED holatida bo'lmagan order'ga qayta urinish 400 qaytaradi.
    Noto'g'ri kod: 400 + audit yozuvi.

    Response:
      200 — { "status": "RECEIVED", "order": {...} }
      400 — { "error": "...", "code": "..." }
      403 — permission yo'q
      404 — buyurtma topilmadi
    """
    permission_classes = (IsAuthenticated, CanConfirmDelivery)

    def post(self, request, pk, *args, **kwargs):
        order = get_object_or_404(Order, pk=pk)

        serializer = CourierConfirmDeliverySerializer(
            data=request.data, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        order = courier_confirm_delivery(
            order=order,
            actor=request.user,
            received_code=data['received_code'],
        )
        return Response(
            {
                'status': order.status,
                'order': OrderSerializer(order, context={'request': request}).data,
            },
            status=status.HTTP_200_OK,
        )


class OrderPagePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminOrderListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated, IsStaffMember)
    serializer_class = OrderSerializer
    pagination_class = OrderPagePagination

    def get_queryset(self):

        # Phase 3.5: `returns` ham prefetch — OrderSerializer'da `return_status`
        # va `latest_return_*` qaytarish badge'i uchun. N+1 query'ni oldini olamiz.
        queryset = (
            Order.objects.select_related('user', 'payment')
            .prefetch_related(
                'items__product__images', 'items__variant', 'history', 'returns',
            )
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

        nasiya_status = self.request.query_params.get('nasiya_status')
        if nasiya_status == 'paid':
            queryset = queryset.filter(is_credit=True, credit_paid=True)
        elif nasiya_status == 'overdue':
            from django.utils import timezone
            today = timezone.now().date()
            queryset = queryset.filter(is_credit=True, credit_paid=False, credit_due_date__lt=today)
        elif nasiya_status == 'active':
            from django.utils import timezone
            today = timezone.now().date()
            queryset = queryset.filter(is_credit=True, credit_paid=False).filter(
                Q(credit_due_date__gte=today) | Q(credit_due_date__isnull=True)
            )

        payment_status = self.request.query_params.get('payment_status')
        if payment_status:
            queryset = queryset.filter(payment__status=payment_status)

        return queryset

class AdminNasiyaSummaryView(views.APIView):
    """Admin uchun Nasiyalar bo'yicha qisqacha statistika (Faol, Muddati o'tgan, To'langan)."""
    permission_classes = (IsAuthenticated, IsStaffMember)

    def get(self, request, *args, **kwargs):
        from django.utils import timezone
        today = timezone.now().date()
        
        base_qs = Order.objects.filter(is_credit=True)
        
        paid_count = base_qs.filter(credit_paid=True).count()
        overdue_count = base_qs.filter(credit_paid=False, credit_due_date__lt=today).count()
        active_count = base_qs.filter(credit_paid=False).filter(
            Q(credit_due_date__gte=today) | Q(credit_due_date__isnull=True)
        ).count()
        
        return Response({
            'paid_count': paid_count,
            'overdue_count': overdue_count,
            'active_count': active_count,
        })


class AdminOrdersPollView(views.APIView):
    """
    Real-time admin polling endpoint — yangi buyurtmalarni darhol aniqlash uchun.

    GET /api/orders/admin/poll/?since=<last_seen_id>

    NIMA UCHUN POLLING (WebSocket emas):
        Render Free tier WebSocket persistent connection'ni ishonchli
        qo'llab-quvvatlamaydi. Django Channels yangi deploy stack (Daphne ASGI +
        Redis channel layer) talab qiladi. Bozor uchun 10s polling — operativ
        "real-time yetarli" UX va minimal infrastruktura yuki.

    QUERY YUKI:
        2 ta cheap agregat: Max(id) + WHERE id > N COUNT — har ikkalasi
        PK (indexed). Mln+ buyurtmali bazaga ham millisecond.

    JAVOB:
        {
          "has_new":    bool,    -- since'dan yangi buyurtma bor
          "new_count":  int,     -- nechta yangi
          "latest_id":  int,     -- joriy eng katta order id (lastSeen reset uchun)
          "server_time": iso datetime  -- klient soat balansi uchun
        }

    PERMISSION:
        IsStaffMember — admin, sotuvchi va kuryer ham ko'rishi mumkin
        (har biri o'z buyurtmalarini kuzatadi).
    """
    permission_classes = (IsAuthenticated, IsStaffMember)

    def get(self, request, *args, **kwargs):
        # ?since parametri — frontend lastSeenId. Yo'q yoki noto'g'ri bo'lsa 0.
        try:
            since_id = max(0, int(request.query_params.get('since', 0)))
        except (ValueError, TypeError):
            since_id = 0

        # Bitta agregat — eng katta order id (yangi buyurtma) + eng so'nggi
        # updated_at (HAR QANDAY o'zgarish signali: status, kredit, bekor...).
        # Ikkalasi ham indekslangan (PK + order_updated_at_idx) → millisekund.
        agg = Order.objects.aggregate(
            latest_id=Max('id'),
            last_update=Max('updated_at'),
        )
        latest_id = agg['latest_id'] or 0
        last_update = agg['last_update']

        # Yangi soni — faqat since'dan katta bo'lsa qo'shimcha query
        if latest_id > since_id:
            new_count = Order.objects.filter(id__gt=since_id).count()
        else:
            new_count = 0

        from django.utils import timezone
        return Response({
            'has_new': new_count > 0,
            'new_count': new_count,
            'latest_id': latest_id,
            # KRITIK real-time signali: bu qiymat o'zgarsa — biror buyurtma
            # o'zgargan (yangi YOKI status/maydon yangilangan) → ro'yxatni refetch.
            'last_update': last_update.isoformat() if last_update else None,
            'server_time': timezone.now().isoformat(),
        })


class AdminOrderStatusUpdateView(views.APIView):
    permission_classes = (IsAuthenticated, IsStaffMember)

    def post(self, request, pk, *args, **kwargs):

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

        user = request.user
        today = timezone.now().date()

        # Phase 2.5 — Disput muddati hisobga olingan overdue tekshiruvi (DRY helper).
        # dispute_deadline > now bo'lgan buyurtmalar overdue deb belgilanmaydi.
        mark_overdue_credits(user)

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
        # Phase 3.5: Replacement Order'lar gross_revenue'dan chiqariladi —
        # ular almashtirish uchun yaratilgan, mijozdan yangi pul kelmagan
        # (technical artifact, accounting'da ikki marta sanab bo'lmaydi).
        delivered_qs = qs.filter(
            status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED],
        ).filter(replacement_of__isnull=True)
        cancelled_qs = qs.filter(status__in=[
            Order.STATUS_CANCELLED_BY_USER,
            Order.STATUS_CANCELLED_BY_ADMIN,
            Order.STATUS_SYSTEM_AUTO_CANCEL,
        ])

        total_revenue = delivered_qs.aggregate(total=Sum('total_price'))['total'] or 0
        # Bug fix: Order.discount_price = 0 chunki chegirma per-item (master,
        # variant, product) hisoblanadi. Haqiqiy chegirma items iteratsiyasidan
        # keyin orders_list dan yig'iladi (628-qator atrofida).
        # Bu yerda placeholder — keyin qayta yoziladi.
        total_discount = 0
        avg_order = delivered_qs.aggregate(avg=Avg('total_price'))['avg'] or 0
        total_orders = qs.count()
        delivered_count = delivered_qs.count()
        cancelled_count = cancelled_qs.count()
        pending_count = qs.filter(status=Order.STATUS_PENDING).count()

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

        # --- Mahsulotlar bo'yicha batafsil statistika (DB level) ---
        # Bug fix: F/Sum/DecimalField global import'da bor (line 12).
        # Lokal qayta import'lash Python local-shadowing'ga olib kelardi:
        # `Sum` get() ichida lokal aniqlanardi va undan oldin (505-qator,
        # delivered_qs.aggregate) ishlatilsa UnboundLocalError chiqarardi.
        # Faqat global'da yo'q bo'lganini import qilamiz.
        from orders.models import OrderItem
        from django.db.models import FloatField
        from django.db.models.functions import Coalesce

        # Hisoblashlarni bitta so'rovda bajarish.
        # Phase 3.5: returned_qty va total_refunded ham qo'shildi — har mahsulot
        # uchun "qaytarish darajasi" (return rate per product) hisoblash uchun.
        # OrderItem.returned_qty INVARIANT'i: SUCCESS statusda turgan
        # OrderReturnItem.quantity yig'indisi. Mavjud qiymatdan o'qiymiz —
        # JOIN'siz va aniq.
        items_stats = (
            OrderItem.objects
            .filter(order__in=qs)
            .values(
                'product_id', 'product__name', 'product__price', 'product__discount_price', 'product__cost_price',
                'variant_id', 'variant__quality', 'variant__model', 'variant__size', 'variant__color', 'variant__sku',
                'variant__price', 'variant__discount_price', 'variant__cost_price'
            )
            .annotate(
                quantity_sold=Sum('quantity'),
                quantity_returned=Sum('returned_qty'),  # Phase 3.5
                total_revenue=Sum(F('price_snapshot') * F('quantity'), output_field=FloatField()),
                total_refunded=Sum(
                    F('price_snapshot') * F('returned_qty'), output_field=FloatField()
                ),  # Phase 3.5
            )
            .order_by('-quantity_sold')
        )

        products_list = []
        for idx, item in enumerate(items_stats, start=1):
            p_id = item['product_id']
            if not p_id:
                continue

            qty_sold = item['quantity_sold'] or 0
            qty_returned = item['quantity_returned'] or 0
            rev = item['total_revenue'] or 0.0
            refunded = item['total_refunded'] or 0.0
            # Sof qiymatlar — qaytarilgan tovarni chiqarib
            net_qty = max(0, qty_sold - qty_returned)
            net_rev = rev - refunded
            product_return_rate = round(
                (refunded / rev * 100) if rev > 0 else 0, 2
            )

            # cost price
            v_cost = item['variant__cost_price']
            p_cost = item['product__cost_price']
            cost_price = float(v_cost if v_cost is not None else (p_cost or 0))

            # original price
            v_price = item['variant__price']
            p_price = item['product__price']
            original_price = float(v_price if v_price is not None else (p_price or 0))

            v_disc = item['variant__discount_price']
            p_disc = item['product__discount_price']
            disc_price = float(v_disc) if v_disc is not None else (float(p_disc) if p_disc else None)

            # Gross (qaytarmasdan)
            total_cost_item = cost_price * qty_sold
            net_profit_item = rev - total_cost_item
            # Net (qaytarib stokga kelganlarni hisobga olib) — soddalashtirilgan:
            # qaytarilgan tovarning ham tannarxi qaytariladi (restock=True
            # standart). Realistik approximation; aniq writeoff sub-status
            # detail'da bilinadi.
            net_profit_after_returns = net_rev - (cost_price * net_qty)

            products_list.append({
                'rank': idx,
                'id': p_id,
                'name': item['product__name'],
                'quality': item['variant__quality'] or '',
                'model': item['variant__model'] or '',
                'size': item['variant__size'] or '',
                'color': item['variant__color'] or '',
                'sku': item['variant__sku'] or '',
                'price': original_price,
                'discount_price': disc_price,
                'cost_price': cost_price,
                'quantity_sold': qty_sold,
                'total_revenue': rev,
                'total_cost': total_cost_item,
                'sold_price': rev / qty_sold if qty_sold > 0 else 0,
                'net_profit': net_profit_item,
                # Phase 3.5
                'quantity_returned': qty_returned,
                'net_quantity_sold': net_qty,
                'total_refunded': refunded,
                'net_revenue': net_rev,
                'return_rate': product_return_rate,
                'net_profit_after_returns': net_profit_after_returns,
            })

        # --- Jami tushum (Cost & Discount) (Faqat delivered_qs uchun) ---
        from decimal import Decimal
        delivered_items_qs = OrderItem.objects.filter(order__in=delivered_qs)
        
        # Calculate cost via ORM
        cost_agg = delivered_items_qs.aggregate(
            t_cost=Sum(
                F('quantity') * Coalesce('variant__cost_price', 'product__cost_price', Decimal('0')),
                output_field=FloatField()
            )
        )
        total_cost = cost_agg['t_cost'] or 0.0

        # Calculate discount via ORM (original_price - price_snapshot)
        disc_agg = delivered_items_qs.aggregate(
            t_disc=Sum(
                F('quantity') * (
                    Coalesce('variant__price', 'product__price', Decimal('0')) - F('price_snapshot')
                ),
                output_field=FloatField()
            )
        )
        total_discount = max(0.0, disc_agg['t_disc'] or 0.0)

        # ── Phase 3.5: Qaytarish (Return) hisoboti ─────────────────────────
        # Industry naqsh (Amazon/Shopify/Wildberries):
        #   - returns_amount = davr ichida pul qaytarilgan summa (cash out)
        #   - replacement_count = almashtirilganlar (pul harakatsiz)
        #   - net_revenue = gross_revenue - returns_amount (sof tushum)
        #   - return_rate = returns_amount / gross_revenue × 100% (sifat KPI)
        #
        # Sana filteri OrderReturn.created_at bo'yicha — bu cash basis
        # (qaytarish yangi davrda bo'lsa o'sha davrning hisobotida ko'rinadi).
        # Pul KASSADAN qachon chiqqani — admin uchun eng tushunarli ko'rinish.
        from .models import OrderReturn
        returns_qs = OrderReturn.objects.filter(status__in=OrderReturn.SUCCESS_STATUSES)
        if date_from_str:
            d = parse_date(date_from_str)
            if d:
                returns_qs = returns_qs.filter(created_at__date__gte=d)
        if date_to_str:
            d = parse_date(date_to_str)
            if d:
                returns_qs = returns_qs.filter(created_at__date__lte=d)

        # Refund (REFUNDED — haqiqiy cash out) va Replacement (REPLACED —
        # pul harakatsiz, informational) ALOHIDA hisoblanadi.
        refund_agg = returns_qs.filter(status=OrderReturn.STATUS_REFUNDED).aggregate(
            amount=Sum('refund_amount'),
            count=Count('id'),
        )
        replacement_agg = returns_qs.filter(status=OrderReturn.STATUS_REPLACED).aggregate(
            amount=Sum('refund_amount'),
            count=Count('id'),
        )
        returns_amount = float(refund_agg['amount'] or 0)
        returns_count = refund_agg['count'] or 0
        replacement_amount = float(replacement_agg['amount'] or 0)
        replacement_count = replacement_agg['count'] or 0

        # ── Net Profit (sof foyda) — qaytarib STOKGA kelgan tovar tannarxi
        # qaytariladi (writeoff bo'lsa qaytarilmaydi). OrderReturnItem.restock
        # bo'yicha hisoblaymiz: faqat restock=True bo'lganlar uchun tannarx
        # qaytariladi.
        from .models import OrderReturnItem
        restock_cost_agg = OrderReturnItem.objects.filter(
            return_obj__in=returns_qs,
            restock=True,
        ).aggregate(
            recovered=Sum(
                F('quantity') * Coalesce(
                    'order_item__variant__cost_price',
                    'order_item__product__cost_price',
                    Decimal('0'),
                ),
                output_field=FloatField(),
            ),
        )
        recovered_cost = float(restock_cost_agg['recovered'] or 0)

        # Sof tushum va sof foyda
        gross_revenue = float(total_revenue)
        net_revenue = gross_revenue - returns_amount
        gross_profit = gross_revenue - float(total_cost)
        # Net profit: returns qaytarilgan + tannarx restock bo'lgani recover
        # qilingani — chuqurroq accuracy uchun.
        net_profit = net_revenue - (float(total_cost) - recovered_cost)
        return_rate = (
            (returns_amount / gross_revenue * 100) if gross_revenue > 0 else 0
        )

        summary = {
            # Gross (yalpi — historik, qaytmaydi)
            'total_revenue': gross_revenue,
            'total_discount': float(total_discount),
            'total_cost': float(total_cost),
            'avg_order_value': float(avg_order),
            'total_orders': total_orders,
            'delivered_orders': delivered_count,
            'cancelled_orders': cancelled_count,
            'pending_orders': pending_count,
            'net_profit': gross_profit,        # backwards compat: net_profit avval gross_profit edi
            # Phase 3.5 — Qaytarish KPI'lari
            'returns_amount': returns_amount,
            'returns_count': returns_count,
            'replacement_amount': replacement_amount,
            'replacement_count': replacement_count,
            'recovered_cost': recovered_cost,
            'net_revenue': net_revenue,          # gross - returns
            'net_profit_after_returns': net_profit,  # accuracy uchun yangi maydon
            'return_rate': round(return_rate, 2),    # %
        }

        return Response({
            'summary': summary,
            'timeline': timeline,
            'products': products_list,
        })


class AdminReportOrdersView(views.APIView, OrderPagePagination):
    """Admin Hisobot sahifasidagi 'Cheklar' ro'yxati (Paginatsiyalangan)."""
    permission_classes = (IsAuthenticated, CanAccessReports)

    def get(self, request, *args, **kwargs):
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')

        # Phase 3.5: returns ham prefetch — har item uchun qaytarish holatini
        # JOIN'siz o'qish uchun. Replacement Order'lar bu yerdan chiqarilmaydi
        # (admin Cheklar tabida ko'rsin — alohida "↪ Almashtirish chek"
        # belgisi bilan kelajak phase'da).
        qs = Order.objects.filter(
            status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED]
        ).select_related('payment').prefetch_related(
            'items__product__variants', 'items__variant',
            'returns',
        ).order_by('-created_at')

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

        page = self.paginate_queryset(qs, request, view=self)
        
        from decimal import Decimal as _D
        from .models import OrderReturn
        orders_list = []
        for order in page:
            order_items = []
            order_discount_sum = 0.0
            order_original_sum = 0.0
            # Phase 3.5: chek bo'yicha qaytarish hisobi
            order_returned_qty = 0
            order_refunded_amount = 0.0
            order_total_qty = 0

            for item in order.items.all():
                variant = item.variant
                product = item.product

                original_price = float(
                    variant.price if variant and variant.price is not None
                    else (product.price if product else 0)
                )
                sold_price = float(item.price_snapshot)
                discount_amount = max(0, original_price - sold_price) * item.quantity
                discount_percent = (
                    ((original_price - sold_price) / original_price) * 100
                    if original_price > 0 and sold_price < original_price
                    else 0.0
                )
                order_discount_sum += discount_amount
                order_original_sum += original_price * item.quantity

                full_name = product.name if product else 'Unknown'
                if variant:
                    attrs = []
                    if variant.quality: attrs.append(variant.quality)
                    if variant.size: attrs.append(variant.size)
                    elif variant.model: attrs.append(variant.model)
                    if variant.color: attrs.append(variant.color)
                    if attrs:
                        full_name = f"{full_name} • {' • '.join(attrs)}"

                # Phase 3.5: item-darajasidagi qaytarish.
                # `returned_qty` INVARIANT'i: faqat SUCCESS (REFUNDED/REPLACED)
                # statusdagi OrderReturnItem.quantity yig'indisi. Demak admin
                # "bu chekdan X dona qaytarilgan" deb ishonchli ko'rsata oladi.
                returned_qty = item.returned_qty or 0
                refunded_amount = float(item.price_snapshot) * returned_qty
                order_returned_qty += returned_qty
                order_refunded_amount += refunded_amount
                order_total_qty += item.quantity

                order_items.append({
                    'id': item.id,
                    'product_name': full_name,
                    'quantity': item.quantity,
                    'original_price': original_price,
                    'sold_price': sold_price,
                    'discount_percent': round(discount_percent, 2),
                    'discount_amount': discount_amount,
                    # Phase 3.5 — qaytarish maydonlari
                    'returned_qty': returned_qty,
                    'net_quantity': max(0, item.quantity - returned_qty),
                    'refunded_amount': refunded_amount,
                })

            # Phase 3.5: chek (Order) darajasidagi qaytarish holati.
            # `return_status`: none | partial | full — UI badge'ni belgilaydi.
            if order_returned_qty <= 0:
                return_status = 'none'
            elif order_returned_qty >= order_total_qty:
                return_status = 'full'
            else:
                return_status = 'partial'

            # So'nggi qaytarish raqami (UI'da bosib ochish uchun foydali —
            # kelajak link). Faqat SUCCESS statusdagilar.
            success_returns = [
                r for r in order.returns.all()
                if r.status in OrderReturn.SUCCESS_STATUSES
            ]
            success_returns.sort(key=lambda r: r.created_at, reverse=True)
            latest_return = success_returns[0] if success_returns else None

            orders_list.append({
                'id': order.id,
                'created_at': order.created_at.isoformat(),
                'receiver_name': order.receiver_name,
                'receiver_phone': order.receiver_phone,
                'total_price': float(order.total_price),
                'total_discount': order_discount_sum,
                'total_original': order_original_sum,
                'items': order_items,
                # Phase 3.5 — chek bo'yicha qaytarish
                'return_status': return_status,
                'returned_qty': order_returned_qty,
                'refunded_amount': order_refunded_amount,
                'net_total': float(order.total_price) - order_refunded_amount,
                'returns_count': len(success_returns),
                'latest_return_number': (
                    latest_return.return_number if latest_return else None
                ),
            })

        return self.get_paginated_response(orders_list)


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

        # ── POS MUDDATLI TO'LOV — ULTRA-SECURE 4 QATLAMLI HIMOYA ─────────────
        # skip_credit_check=True POS'da admin tomondan ataylab o'tkazib
        # yuboriladi (admin oddiy sotuv jarayonini boshqaradi), AMMO biznes-
        # kritik kredit qoidalari hech qachon o'tkazib yuborilmasligi kerak.
        # Bu yerda 4 qatlam — sayt va POS bir xil qattiq qoidalarga buyincha:
        #
        #   1. MASTER GUARD     — ustadan boshqa hech kim kredit ololmaydi
        #   2. BAN GUARD        — 3 marta o'tkazib yuborgan mijoz doimiy blok
        #   3. OVERDUE GUARD    — muddati o'tgan to'lanmagan kredit bor —
        #                          avval uni to'lash kerak
        #   4. ACTIVE GUARD     — hozir aktiv to'lanmagan kredit bor —
        #                          bir vaqtda bitta kredit qoidasi
        #
        # Har biriga uniq error code → admin UI aniq sabab ko'rsatadi.
        # ────────────────────────────────────────────────────────────────────
        if payment_method == Order.PAYMENT_METHOD_CREDIT and user:
            from .services import mark_overdue_credits

            # 1) MASTER GUARD
            if not user.can_use_credit:
                return Response(
                    {
                        "error": (
                            "Muddatli to'lov faqat ustalar uchun. "
                            "Bu mijoz Ustalar ro'yxatida emas."
                        ),
                        "code": "master_required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 2) BAN GUARD — refresh from DB (cached user obyekt eskirgan
            # bo'lishi mumkin: cron unbanga olib kelgan bo'lsa)
            user.refresh_from_db(fields=['credit_ban', 'overdue_credit_count'])
            if user.credit_ban:
                return Response(
                    {
                        "error": (
                            "Bu mijoz kredit ban'da — 3 marta to'lov muddatini "
                            "o'tkazib yuborgan. Avval Super Admin ban'ni "
                            "olib tashlashi kerak."
                        ),
                        "code": "credit_banned",
                        "overdue_count": user.overdue_credit_count,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # 3) OVERDUE GUARD — disput muddati hisobga olingan overdue mark
            # (mark_overdue_credits Phase 2.5 dispute_deadline'ni hurmat
            # qiladi — bu yerda double-purpose: ham mark, ham hisob yangilash)
            try:
                mark_result = mark_overdue_credits(user)
                if mark_result['banned']:
                    return Response(
                        {
                            "error": (
                                "Bu mijozning to'lov muddati 3 marta o'tib ketdi. "
                                "Kredit imkoniyati doimiy bloklandi."
                            ),
                            "code": "credit_banned",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if mark_result['count'] > 0:
                    return Response(
                        {
                            "error": (
                                "Bu mijozning muddati o'tgan to'lanmagan "
                                "kredit buyurtmasi mavjud. Avval uni to'laydi, "
                                "keyin yangi kredit beriladi."
                            ),
                            "code": "credit_overdue",
                            "new_overdue_count": mark_result['count'],
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except Exception as exc:
                # mark_overdue_credits race-safe — lekin kutilmagan xato
                # bo'lsa, xavfsizlik tomondan blok qilamiz (fail-safe).
                import logging
                logging.getLogger('orders.pos').exception(
                    "POS overdue check xato: %s", exc,
                )
                return Response(
                    {
                        "error": "Kredit holatini tekshirib bo'lmadi. Qayta urinib ko'ring.",
                        "code": "credit_check_failed",
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # 4) ACTIVE GUARD — hali muddati kelmagan, lekin to'lanmagan
            active_credit = (
                Order.objects
                .filter(user=user, is_credit=True, credit_paid=False)
                .exclude(status__in=Order.CANCELLATION_STATUSES)
                .order_by('credit_due_date')
                .first()
            )
            if active_credit:
                return Response(
                    {
                        "error": (
                            f"Bu mijozning to'lanmagan kredit buyurtmasi bor "
                            f"(#{active_credit.id}, muddat: "
                            f"{active_credit.credit_due_date}). "
                            f"Avval uni to'laydi, keyin yangisi beriladi."
                        ),
                        "code": "credit_active",
                        "active_order_id": active_credit.id,
                        "active_due_date": str(active_credit.credit_due_date),
                    },
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
        from decimal import Decimal, InvalidOperation
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

            # ── POS kelishuv narxi (ixtiyoriy) ───────────────────────────────
            # Sotuvchi har bir mahsulotning narxini qo'lda kiritishi mumkin
            # (chegirma / qaytarib berish). Bo'sh / yo'q bo'lsa — tizim narxi.
            # Tannarxdan past / manfiy tekshiruvlar `create_order_with_items`
            # ichida bajariladi (yagona avtoritar manba).
            raw_price = item_data.get('price', None)
            price_val = None
            if raw_price is not None and raw_price != '':
                try:
                    price_val = Decimal(str(raw_price))
                except (InvalidOperation, TypeError, ValueError):
                    return Response(
                        {"error": f"\"{product.name}\" uchun narx noto'g'ri kiritildi."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            items.append({
                'product': product,
                'variant': variant,
                'quantity': max(1, int(item_data.get('quantity', 1))),
                'price': price_val,
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
            allow_price_override=True,  # POS'da kelishuv narxi (chegirma) mumkin
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

        # ── KUCHLI LOG: POS savdo + kelishuv narxi (chegirma) tarixi ─────────
        # Har bir mahsulotning sotilgan narxi `price_snapshot`'da doimiy
        # saqlanadi (eng ishonchli log). Bu yerda OrderHistory note'ga
        # inson o'qiy oladigan qisqa xulosa yoziladi — admin "Buyurtma tarixi"
        # bo'limida kim, qancha chegirma berganini ko'radi. AuditMiddleware
        # esa to'liq so'rov tanasini (har bir narx) avtomat yozib oladi.
        discount_amount = order.discount_price or Decimal('0.00')
        note = "POS orqali do'konda sotildi."
        if discount_amount > 0:
            note += f" Kelishuv chegirmasi: {discount_amount:.0f} so'm."

        _create_history(
            order,
            to_status=Order.STATUS_RECEIVED,
            from_status=prev_status,
            actor_type=OrderHistory.ACTOR_ADMIN,
            actor=request.user,
            note=note,
        )

        import logging
        logging.getLogger('orders.pos').info(
            "POS savdo #%s | xodim=%s | mijoz=%s | to'lov=%s | jami=%s | chegirma=%s | mahsulotlar=%s",
            order.id,
            getattr(request.user, 'phone', None),
            phone,
            payment_method,
            order.total_price,
            discount_amount,
            [
                {
                    'product_id': oi.product_id,
                    'variant_id': oi.variant_id,
                    'qty': oi.quantity,
                    'sold_unit': str(oi.price_snapshot),
                }
                for oi in order.items.all()
            ],
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
    """
    Admin kassadan pul yechib olishi.

    #21 FIX: Withdrawal.amount — balans tekshirish race condition.

    MUAMMO — Race Condition:
      Ikki admin bir vaqtda pul yechsa:
        Admin A: balance = 500_000 so'm tekshiradi  ← READ
        Admin B: balance = 500_000 so'm tekshiradi  ← READ (bir vaqtda)
        Admin A: 300_000 yechadi → Withdrawal yaratadi  ← WRITE
        Admin B: 300_000 yechadi → Withdrawal yaratadi  ← WRITE
        Natija: balance = 500_000 - 300_000 - 300_000 = -100_000 so'm! ← SALBIY!

      Bu "TOCTOU" (Time Of Check To Time Of Use) race condition.
      Oddiy tekshiruv: CHECK then ACT — ular atomik emas.

    YECHIM — Database-level locking:
      @transaction.atomic + SELECT ... FOR UPDATE (skip_locked=False):
        1. Tranzaksiya boshlanadi
        2. Barcha Withdrawal qatorlarini LOCK qilamiz (SELECT FOR UPDATE)
           → boshqa tranzaksiya kutadi, lock bo'shashguncha
        3. Balans hisoblanadi (lock ostida — yangi qiymat)
        4. Yetarli bo'lsa — Withdrawal yaratiladi
        5. Tranzaksiya commit → lock bo'shatiladi
        6. Ikkinchi admin kutishdan chiqadi → yangi balansni ko'radi

      select_for_update(of=('self',)) — PostgreSQL'da faqat Withdrawal
      jadvali lock qilinadi, Order jadvali emas.

      Nima uchun Withdrawal lock, Order emas:
        Order jadvali katta va tez o'zgaradi. Uni lock qilish
        buyurtmalar qabul qilishni bloklab qo'yadi.
        Balance = Income - Expense. Income (Order) o'qish uchun
        qulflash shart emas (conservative balance yondashuvi):
        eng yangi Income qiymatini olamiz, lekin Expense (Withdrawal)
        ni qulfoymiz. Bu yetarli: agar Income o'rtada o'ssa,
        balans faqat OSHADI — salbiy bo'lmaydi.
    """
    permission_classes = (IsAuthenticated, CanAccessKassa)

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        from decimal import Decimal, InvalidOperation
        from orders.models import Order, Withdrawal

        # ── Summa validatsiyasi — DECIMAL, hech qachon float ─────────────────
        # float(1_234_567.89) → 1234567.8900000001  (moliyaviy xato!)
        # Decimal(str('1234567.89')) → 1234567.89   (aniq!)
        amount_raw = request.data.get('amount')
        # ⚠ BACKWARD COMPAT: eski mobile APK 'note' yuborardi (bug fix-dan
        # oldin). Yangi clientlar 'reason' yuboradi (sayt + yangi mobile).
        # Ikkalasini ham qabul qilamiz — eski APK ishlatuvchilar darhol
        # yana ishlay boshlaydi (App Store update kutmasdan).
        # Tartib: reason birinchi, bo'sh bo'lsa note ga fallback.
        reason = (
            request.data.get('reason')
            or request.data.get('note')
            or ''
        )
        if isinstance(reason, str):
            reason = reason.strip()

        try:
            amount = Decimal(str(amount_raw)).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'error': "Summa to'g'ri musbat raqam bo'lishi kerak (masalan: 150000.00)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if amount <= 0:
            return Response(
                {'error': "Summa musbat son bo'lishi kerak."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not reason:
            return Response(
                {'error': "Maqsad/izoh kiritilishi shart."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── #21 FIX: Race condition himoyasi — SELECT FOR UPDATE ──────────────
        #
        # Barcha Withdrawal qatorlarini lock qilamiz.
        # Boshqa parallel tranzaksiya ham shu qatorlarga SELECT FOR UPDATE
        # yuborganida — u lock bo'shashguncha (bu tranzaksiya commit/rollback)
        # kutadi. Shu tariqa ikki admin bir vaqtda yechib salbiy qoldiq hosil
        # qilishi MUMKIN EMAS.
        #
        # lock_qatorlar: Withdrawal.objects.select_for_update() → DB ROW LOCK
        # Bu SELECT barcha mavjud Withdrawal qatorlarini lock qiladi.
        # Agar Withdrawal jadvali bo'sh bo'lsa — keyingi INSERT ham xavfsiz,
        # chunki tranzaksiya `Withdrawal` jadvalida SERIALIZABLE kafolat beradi.
        #
        # nowait=False (default): parallel so'rov kutadi (bo'shatilguncha).
        # nowait=True: parallel so'rov darhol xato qaytaradi — bu holat uchun
        #   kutish yaxshiroq, chunki admin "Kassada mablag' yo'q" xatosini
        #   noto'g'ri ko'rishi mumkin.
        # ─────────────────────────────────────────────────────────────────────
        _zero = Decimal('0')

        # Lock: barcha Withdrawal qatorlarini tranzaksiya ichida lock qilamiz
        # PostgreSQL: SELECT ... FOR UPDATE
        # SQLite: tranzaksiya darajasida himoya (BEGIN EXCLUSIVE)
        Withdrawal.objects.select_for_update().aggregate(
            total=Sum('amount')
        )  # Lock maqsadida: natija quyida qayta hisoblanadi

        # Balansni lock ostida (yangi qiymatlar bilan) hisoblaymiz
        delivered_qs = Order.objects.filter(
            status__in=[Order.STATUS_DELIVERED, Order.STATUS_RECEIVED]
        )
        total_income  = delivered_qs.aggregate(total=Sum('total_price'))['total'] or _zero
        total_expense = Withdrawal.objects.aggregate(total=Sum('amount'))['total'] or _zero
        balance = total_income - total_expense   # Decimal - Decimal = Decimal ✅

        if amount > balance:
            return Response(
                {'error': f"Kassada yetarli mablag' yo'q. Qoldiq: {balance:.2f} so'm."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Lock ostida atomik yaratish — race condition YO'Q
        w = Withdrawal.objects.create(amount=amount, reason=reason, admin=request.user)

        return Response({
            'message': "Pul muvaffaqiyatli yechildi",
            'withdrawal': {
                'id': w.id,
                'amount': float(w.amount),
                'reason': w.reason,
                'created_at': w.created_at.isoformat(),
                'admin_name': w.admin.get_full_name() if w.admin else "Noma'lum",
            },
            'remaining_balance': float(balance - amount),
        })



class AdminDashboardView(views.APIView):
    """
    Admin bosh sahifasi — barcha asosiy ko'rsatkichlar.

    #16 FIX: select_related/prefetch_related + conditional aggregation.

    ESKI MUAMMO (10+ alohida query):
      Order.objects.filter(created_at__date=today).count()         ← 1 SELECT
      Order.objects.filter(...).aggregate(Sum('total_price'))      ← 2 SELECT
      Order.objects.filter(status='PENDING').count()               ← 3 SELECT
      ... (har bir kpi = alohida SQL)
      for order in recent_orders:
          order.items.count()    ← N+1 (8 ta ORDER = 8 ta COUNT query)

    YANGI YECHIM:
      stats = Order.objects.aggregate(
          today_orders      = Count('id', filter=Q(created_at__date=today)),
          today_revenue     = Sum('total_price', filter=Q(... status__in=...)),
          month_orders      = Count('id', filter=Q(...)),
          pending_count     = Count('id', filter=Q(status='PENDING')),
          processing_count  = Count('id', filter=Q(status__in=[...])),
          overdue_credits   = Count('id', filter=Q(is_credit=True,...)),
          total_income      = Sum('total_price', filter=Q(status__in=DELIVERED)),
      )
      → bitta SELECT, barcha KPI bir vaqtda

      recent_orders: annotate(item_count=Count('items'))   ← N+1 YO'Q
      stock: .aggregate(low=Count(...), out=Count(...))     ← bitta SELECT
      status_breakdown: values('status').annotate(cnt=Count('id')) ← bitta SELECT

    Jami: ~15 query → 5 query
    """
    permission_classes = (IsAuthenticated, IsStaffMember)

    def get(self, request, *args, **kwargs):
        from django.db.models import Sum, Count, Q
        from django.db.models.functions import TruncDay
        from django.utils import timezone
        from orders.models import Order, Withdrawal
        from products.models import Product

        today = timezone.now().date()
        month_start = today.replace(day=1)

        DELIVERED_STATUSES = [Order.STATUS_DELIVERED, Order.STATUS_RECEIVED]
        PROCESSING_STATUSES = ['CONFIRMED', 'PACKING', 'SHIPPING']

        # ── #16 FIX: Barcha KPI — BITTA SQL SELECT (conditional aggregation) ──
        stats = Order.objects.aggregate(
            today_orders=Count(
                'id',
                filter=Q(created_at__date=today),
            ),
            today_revenue=Sum(
                'total_price',
                filter=Q(created_at__date=today, status__in=DELIVERED_STATUSES),
            ),
            month_orders=Count(
                'id',
                filter=Q(created_at__date__gte=month_start),
            ),
            month_revenue=Sum(
                'total_price',
                filter=Q(created_at__date__gte=month_start, status__in=DELIVERED_STATUSES),
            ),
            pending_count=Count(
                'id',
                filter=Q(status='PENDING'),
            ),
            processing_count=Count(
                'id',
                filter=Q(status__in=PROCESSING_STATUSES),
            ),
            overdue_credits=Count(
                'id',
                filter=Q(is_credit=True, credit_paid=False, credit_due_date__lt=today),
            ),
            total_income=Sum(
                'total_price',
                filter=Q(status__in=DELIVERED_STATUSES),
            ),
        )

        # Kassa chiqimi — alohida jadval (1 ta SO'ROV)
        total_expense = (
            Withdrawal.objects.aggregate(total=Sum('amount'))['total'] or 0
        )
        kassa_balance = float(stats['total_income'] or 0) - float(total_expense)

        # ── #16 FIX: Zaxira — bitta aggregate (2 ta COUNT → 1 SELECT) ─────────
        stock_agg = Product.objects.filter(is_active=True).aggregate(
            low_stock=Count('id', filter=Q(stock__gt=0, stock__lte=5)),
            out_of_stock=Count('id', filter=Q(stock=0)),
        )

        # ── #16 FIX: Status taqsimoti — values().annotate() (1 SELECT) ────────
        status_rows = (
            Order.objects
            .values('status')
            .annotate(cnt=Count('id'))
        )
        status_breakdown = {val: 0 for val, _ in Order.STATUS_CHOICES}
        for row in status_rows:
            if row['status'] in status_breakdown:
                status_breakdown[row['status']] = row['cnt']

        # ── #16 FIX: Oxirgi 8 buyurtma — annotate(item_count) + select_related ─
        #
        # ESKI: order.items.count() → 8 ta alohida COUNT query (N+1)
        # YANGI: annotate(item_count=Count('items')) → bitta JOIN'da hisoblaydi
        recent_orders = []
        for order in (
            Order.objects
            .select_related('user')                       # ← user FK → JOIN, N+1 YO'Q
            .annotate(item_count=Count('items'))           # ← COUNT JOIN, N+1 YO'Q
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
                'item_count': order.item_count,           # ← annotated, 0 extra query
            })

        # ── Haftalik grafik — bitta GROUP BY query ────────────────────────────
        weekly_start = today - datetime.timedelta(days=6)
        weekly_rows = (
            Order.objects
            .filter(created_at__date__gte=weekly_start)
            .annotate(day=TruncDay('created_at'))
            .values('day')
            .annotate(
                order_count=Count('id'),
                delivered_revenue=Sum(
                    'total_price',
                    filter=Q(status__in=DELIVERED_STATUSES),
                ),
            )
            .order_by('day')
        )
        weekly_map = {
            row['day'].date(): {
                'orders': row['order_count'],
                'revenue': float(row['delivered_revenue'] or 0),
            }
            for row in weekly_rows
        }
        weekly_chart = []
        for i in range(7):
            d = weekly_start + datetime.timedelta(days=i)
            entry = weekly_map.get(d, {'orders': 0, 'revenue': 0})
            weekly_chart.append({
                'date': d.isoformat(),
                'orders': entry['orders'],
                'revenue': entry['revenue'],
            })

        from users.models import Feedback
        feedback_new = Feedback.objects.filter(status='new').count()

        return Response({
            'today': {
                'orders': stats['today_orders'] or 0,
                'revenue': float(stats['today_revenue'] or 0),
            },
            'month': {
                'orders': stats['month_orders'] or 0,
                'revenue': float(stats['month_revenue'] or 0),
            },
            'pending_orders': stats['pending_count'] or 0,
            'processing_orders': stats['processing_count'] or 0,
            'overdue_credits': stats['overdue_credits'] or 0,
            'kassa_balance': kassa_balance,
            'stock': {
                'low_stock': stock_agg['low_stock'] or 0,
                'out_of_stock': stock_agg['out_of_stock'] or 0,
            },
            'status_breakdown': status_breakdown,
            'recent_orders': recent_orders,
            'weekly_chart': weekly_chart,
            'feedback_new': feedback_new,
        })


# ── Phase 2.6 — Order dispute views ─────────────────────────────────────────

class CustomerCreateDisputeView(views.APIView):
    """
    POST /api/orders/<pk>/dispute/

    Mijoz yetkazilgan buyurtmasiga shikoyat ochadi.
    Body (multipart/form-data):
      reason: kamida 10 belgi
      evidence_images: 0-5 ta rasm (multi-upload — `evidence_images` ko'p qiymat)

    Response 201:
      OrderDisputeSerializer payload
    Response 400:
      Disput cheklovlari buzilsa (status, deadline, mavjud aktiv)
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk, *args, **kwargs):
        order = get_object_or_404(Order, pk=pk, user=request.user)

        serializer = CreateOrderDisputeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        dispute = create_order_dispute(
            order=order,
            customer=request.user,
            reason=serializer.validated_data['reason'],
            evidence_images=serializer.validated_data.get('evidence_images', []),
        )
        return Response(
            OrderDisputeSerializer(dispute, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class CustomerOrderDisputesView(generics.ListAPIView):
    """
    GET /api/orders/<pk>/dispute/

    Mijoz o'z buyurtmasidagi disputlarni ko'radi (eskidan yangiga teskari).
    """
    permission_classes = (IsAuthenticated,)
    serializer_class = OrderDisputeSerializer
    pagination_class = None  # 1-2 ta disput odatda — paginatsiya kerakmas

    def get_queryset(self):
        return (
            OrderDispute.objects
            .filter(order__pk=self.kwargs['pk'], order__user=self.request.user)
            .prefetch_related('images')
            .order_by('-created_at')
        )


class _AdminDisputePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminDisputeListView(generics.ListAPIView):
    """
    GET /api/admin/disputes/

    Filterlar:
      ?status=open                  — aniq status
      ?order=123                    — buyurtma ID
      ?active=true                  — faqat aktiv (open + under_review)

    Response: pagination'li ro'yxat.
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)
    serializer_class   = OrderDisputeSerializer
    pagination_class   = _AdminDisputePagination

    def get_queryset(self):
        qs = (
            OrderDispute.objects
            .all()
            .prefetch_related('images')
            .select_related('order', 'resolved_by')
        )
        params = self.request.query_params
        if (st := params.get('status')):
            qs = qs.filter(status=st)
        if (order_id := params.get('order')):
            qs = qs.filter(order_id=order_id)
        if params.get('active') == 'true':
            qs = qs.filter(status__in=OrderDispute.ACTIVE_STATUSES)
        return qs


class AdminDisputeDetailView(views.APIView):
    """
    GET    /api/admin/disputes/<pk>/   — bitta disput
    PATCH  /api/admin/disputes/<pk>/   — status/resolution_note yangilash
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, pk, *args, **kwargs):
        dispute = get_object_or_404(
            OrderDispute.objects.prefetch_related('images').select_related('order', 'resolved_by'),
            pk=pk,
        )
        return Response(OrderDisputeSerializer(dispute, context={'request': request}).data)

    def patch(self, request, pk, *args, **kwargs):
        dispute = get_object_or_404(OrderDispute, pk=pk)
        serializer = AdminUpdateDisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dispute = update_order_dispute(
            dispute=dispute,
            admin=request.user,
            new_status=serializer.validated_data.get('status'),
            resolution_note=serializer.validated_data.get('resolution_note'),
        )
        # Yangi qiymatlar bilan refresh + images prefetch
        dispute = (
            OrderDispute.objects
            .prefetch_related('images')
            .select_related('order', 'resolved_by')
            .get(pk=dispute.pk)
        )
        return Response(OrderDisputeSerializer(dispute, context={'request': request}).data)


# ────────────────────────────────────────────────────────────────────────────
#  Phase 3.2 — Qaytarish (Return) admin endpointlari
#
#  GET    /api/admin/orders/<id>/return-eligibility/   — eligibility tekshiruv
#  GET    /api/admin/returns/                          — ro'yxat (filter: status, order, active)
#  POST   /api/admin/orders/<id>/returns/              — yangi qaytarish yaratish
#  GET    /api/admin/returns/<id>/                     — bitta qaytarish
#  PATCH  /api/admin/returns/<id>/transition/          — status o'tkazish
#  PATCH  /api/admin/returns/<id>/items/<item_id>/     — inspector qarorlari
#  POST   /api/admin/returns/<id>/photos/              — rasm qo'shish
# ────────────────────────────────────────────────────────────────────────────


class _AdminReturnPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class CustomerReturnEligibilityView(views.APIView):
    """
    GET /api/orders/<int:pk>/return-eligibility/

    Mijoz O'Z buyurtmasi uchun qaytarish mumkinligini tekshiradi.
    Authoritative manba (`check_return_eligibility`) bilan bir xil — admin
    bilan farq faqat owner check'da.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk, *args, **kwargs):
        from .models import OrderReturn
        order = get_object_or_404(
            Order.objects.prefetch_related('items__product', 'items__variant', 'returns'),
            pk=pk, user=request.user,  # XAVFSIZLIK: faqat o'z buyurtmasi
        )
        try:
            result = check_return_eligibility(order)
        except drf_serializers.ValidationError as exc:
            payload = exc.detail if isinstance(exc.detail, dict) else {'error': str(exc.detail)}
            return Response({'eligible': False, **payload}, status=200)
        return Response({
            'eligible': True,
            'window_left_seconds': result['window_left_seconds'],
            'returnable_items': result['returnable_items'],
            'reasons': [
                {'code': c[0], 'label': c[1]} for c in OrderReturn.REASON_CHOICES
            ],
        })


class CustomerCreateReturnView(views.APIView):
    """
    POST /api/orders/<int:pk>/returns/

    Mijoz qaytarish so'rovini yuboradi. Status REQUESTED'da boshlanadi,
    admin keyin APPROVED/REJECTED qiladi (yagona transition chokepoint).
    """
    permission_classes = (IsAuthenticated,)

    @transaction.atomic
    def post(self, request, pk, *args, **kwargs):
        from .models import OrderReturn, OrderReturnItem, OrderReturnPhoto
        order = get_object_or_404(
            Order.objects.prefetch_related('items'),
            pk=pk, user=request.user,
        )

        serializer = CreateOrderReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        items_input = data.get('items') or []
        result = check_return_eligibility(
            order,
            items=items_input if items_input else None,
        )

        ret = OrderReturn.objects.create(
            order=order,
            reason_code=data['reason_code'],
            reason_text=data.get('reason_text', ''),
            customer_request_note=data.get('customer_request_note', ''),
            initiated_by=request.user,
            initiator_role=OrderReturn.INITIATOR_CUSTOMER,
            status=OrderReturn.STATUS_REQUESTED,
            status_changed_by=request.user,
        )

        _cond, _restock, _writeoff = default_return_item_disposition(ret.reason_code)
        for ri_info in result['returnable_items']:
            order_item = order.items.get(pk=ri_info['order_item_id'])
            OrderReturnItem.objects.create(
                return_obj=ret,
                order_item=order_item,
                quantity=ri_info['returnable_qty'],
                refund_unit_price=order_item.price_snapshot,
                # Sababga qarab: defekt → restock=False (defektsga), aks holda stokka.
                condition=_cond,
                restock=_restock,
                writeoff_reason=_writeoff,
            )

        for img in data.get('claim_images', []) or []:
            OrderReturnPhoto.objects.create(
                return_obj=ret, image=img, kind=OrderReturnPhoto.KIND_CLAIM,
                uploaded_by=request.user,
            )

        # Telegram alert admin'larga (commit'dan keyin, biznesni buzmaydi)
        def _alert():
            try:
                from core.notifications import send_admin_alert, AlertSeverity
                send_admin_alert(
                    (
                        f"*Mijoz qaytarish so'rovi:* `{ret.return_number}`\n"
                        f"Buyurtma: #{order.id}\n"
                        f"Mijoz: {getattr(request.user, 'phone', '?')}\n"
                        f"Sabab: {ret.reason_code}\n"
                        + (f"Izoh: {ret.reason_text[:200]}\n" if ret.reason_text else '')
                    ),
                    severity=AlertSeverity.INFO,
                )
            except Exception:
                import logging
                logging.getLogger('orders.return').warning(
                    'Customer return alert failed', exc_info=True,
                )
        transaction.on_commit(_alert)

        ret = (
            OrderReturn.objects
            .prefetch_related('items__order_item__product', 'items__order_item__variant', 'photos')
            .select_related('order', 'initiated_by', 'status_changed_by')
            .get(pk=ret.pk)
        )
        return Response(
            OrderReturnSerializer(ret, context={'request': request}).data,
            status=201,
        )


class CustomerMyReturnsView(generics.ListAPIView):
    """GET /api/me/returns/ — mijozning barcha qaytarishlari (eng yangi avval)."""
    permission_classes = (IsAuthenticated,)
    serializer_class = OrderReturnSerializer
    pagination_class = _AdminReturnPagination

    def get_queryset(self):
        from .models import OrderReturn
        return (
            OrderReturn.objects
            .filter(order__user=self.request.user)
            .prefetch_related(
                'items__order_item__product', 'items__order_item__variant', 'photos',
            )
            .select_related(
                'order', 'dispute', 'replacement_order',
                'initiated_by', 'status_changed_by',
            )
        )


class AdminReturnEligibilityView(views.APIView):
    """
    GET /api/admin/orders/<int:pk>/return-eligibility/

    Admin "Qaytarish boshlash" tugmasini bossa — UI avval shu endpoint'ga
    so'rov yuboradi. AYNAN nima uchun mumkin/mumkin emasligi qaytariladi.
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, pk, *args, **kwargs):
        from .models import OrderReturn
        order = get_object_or_404(
            Order.objects.prefetch_related('items__product', 'items__variant', 'returns'),
            pk=pk,
        )
        try:
            result = check_return_eligibility(order)
        except drf_serializers.ValidationError as exc:
            # check_return_eligibility o'zining `{error, code}` formatida
            # ValidationError raise qiladi. UI uchun ajratamiz:
            payload = exc.detail if isinstance(exc.detail, dict) else {'error': str(exc.detail)}
            return Response(
                {'eligible': False, **payload},
                status=200,  # 200 — bu rejected emas, axborot
            )

        # Phase 3.3: kassa balansi ham qaytariladi — UI'da cash refund
        # tanlanganda admin darhol ko'rishi uchun.
        return Response({
            'eligible': True,
            'window_left_seconds': result['window_left_seconds'],
            'returnable_items': result['returnable_items'],
            'reasons': [
                {'code': c[0], 'label': c[1]} for c in OrderReturn.REASON_CHOICES
            ],
            'refund_methods': [
                {'code': c[0], 'label': c[1]} for c in OrderReturn.REFUND_METHOD_CHOICES
            ],
            'kassa_balance': float(get_kassa_balance()),
        })


class AdminReturnListView(generics.ListAPIView):
    """
    GET /api/admin/returns/

    Filterlar:
      ?status=REQUESTED              — aniq status
      ?order=123                     — buyurtma ID
      ?active=true                   — faqat aktiv (TERMINAL emas)
      ?reason_code=defective         — sabab kodi bo'yicha
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)
    serializer_class   = OrderReturnSerializer
    pagination_class   = _AdminReturnPagination

    def get_queryset(self):
        from .models import OrderReturn
        qs = (
            OrderReturn.objects
            .all()
            .prefetch_related(
                'items__order_item__product', 'items__order_item__variant', 'photos',
            )
            .select_related(
                'order', 'dispute', 'replacement_order',
                'initiated_by', 'status_changed_by',
                'inspector', 'refund_processed_by', 'pickup_courier',
            )
        )
        params = self.request.query_params
        if (st := params.get('status')):
            qs = qs.filter(status=st)
        if (order_id := params.get('order')):
            qs = qs.filter(order_id=order_id)
        if params.get('active') == 'true':
            qs = qs.filter(status__in=OrderReturn.ACTIVE_STATUSES)
        if (rc := params.get('reason_code')):
            qs = qs.filter(reason_code=rc)
        return qs


class AdminCreateReturnView(views.APIView):
    """
    POST /api/admin/orders/<int:pk>/returns/

    Yangi qaytarish ochadi. Eligibility AVVAL tekshiriladi (yagona AUTHORITATIVE
    manba — `check_return_eligibility`). Muvaffaqiyatli yaratsa OrderReturn,
    OrderReturnItem'lar va OrderReturnPhoto'larni atomic ravishda yaratadi.
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    @transaction.atomic
    def post(self, request, pk, *args, **kwargs):
        from .models import OrderReturn, OrderReturnItem, OrderReturnPhoto
        order = get_object_or_404(Order.objects.prefetch_related('items'), pk=pk)

        serializer = CreateOrderReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        items_input = data.get('items') or []
        # check_return_eligibility ham raise qiladi — view'ning try qilishi
        # kerak emas, DRF avtomat 400 qaytaradi.
        result = check_return_eligibility(
            order,
            items=items_input if items_input else None,
        )

        ret = OrderReturn.objects.create(
            order=order,
            reason_code=data['reason_code'],
            reason_text=data.get('reason_text', ''),
            customer_request_note=data.get('customer_request_note', ''),
            initiated_by=request.user,
            initiator_role=OrderReturn.INITIATOR_ADMIN,
            status=OrderReturn.STATUS_REQUESTED,
            status_changed_by=request.user,
        )

        # Eligibility natijasidagi `returnable_items` allaqachon validated.
        # Sababga qarab default: defekt → restock=False (defektsga), aks holda stokka.
        # Inspector keyinroq AdminReturnItemUpdateView orqali o'zgartira oladi.
        _cond, _restock, _writeoff = default_return_item_disposition(ret.reason_code)
        for ri_info in result['returnable_items']:
            oi_id = ri_info['order_item_id']
            qty = ri_info['returnable_qty']
            order_item = order.items.get(pk=oi_id)
            OrderReturnItem.objects.create(
                return_obj=ret,
                order_item=order_item,
                quantity=qty,
                refund_unit_price=order_item.price_snapshot,
                condition=_cond,
                restock=_restock,
                writeoff_reason=_writeoff,
            )

        # Foto dalillar
        for img in data.get('claim_images', []) or []:
            OrderReturnPhoto.objects.create(
                return_obj=ret, image=img, kind=OrderReturnPhoto.KIND_CLAIM,
                uploaded_by=request.user,
            )

        ret = (
            OrderReturn.objects
            .prefetch_related(
                'items__order_item__product', 'items__order_item__variant', 'photos',
            )
            .select_related(
                'order', 'initiated_by', 'status_changed_by',
            )
            .get(pk=ret.pk)
        )

        # Phase 3.5: Yangi qaytarish — Telegram alert (commit'dan keyin)
        def _alert():
            try:
                from core.notifications import send_admin_alert, AlertSeverity
                send_admin_alert(
                    (
                        f"*Yangi qaytarish:* `{ret.return_number}`\n"
                        f"Buyurtma: #{ret.order_id}\n"
                        f"Sabab: {ret.reason_code}\n"
                        f"Admin: {getattr(request.user, 'phone', None) or 'system'}"
                    ),
                    severity=AlertSeverity.INFO,
                )
            except Exception:
                import logging
                logging.getLogger('orders.return').warning(
                    'Return Telegram alert failed', exc_info=True,
                )
        transaction.on_commit(_alert)

        return Response(
            OrderReturnSerializer(ret, context={'request': request}).data,
            status=201,
        )


class AdminReturnDetailView(views.APIView):
    """GET /api/admin/returns/<int:pk>/ — bitta qaytarish (+ kassa balansi)."""
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, pk, *args, **kwargs):
        from .models import OrderReturn
        ret = get_object_or_404(
            OrderReturn.objects
            .prefetch_related(
                'items__order_item__product', 'items__order_item__variant', 'photos',
            )
            .select_related(
                'order', 'dispute', 'replacement_order',
                'initiated_by', 'status_changed_by',
                'inspector', 'refund_processed_by', 'pickup_courier',
            ),
            pk=pk,
        )
        data = OrderReturnSerializer(ret, context={'request': request}).data
        # Phase 3.3: kassa balansi — admin cash refund qilishidan oldin ko'rsin
        data['kassa_balance'] = float(get_kassa_balance())
        return Response(data)


class AdminReturnTransitionView(views.APIView):
    """
    PATCH /api/admin/returns/<int:pk>/transition/

    State machine tekshiruvi backend services'da; bu view faqat input
    parser + refund metadata'ni yozadi.
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    @transaction.atomic
    def patch(self, request, pk, *args, **kwargs):
        from .models import OrderReturn, OrderReturnPhoto
        ret = get_object_or_404(OrderReturn, pk=pk)

        serializer = TransitionReturnStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Refund metadata (REFUNDED ga o'tish oldidan yoki birga yuborilishi mumkin)
        update_fields = []
        if (rm := data.get('refund_method')):
            ret.refund_method = rm
            update_fields.append('refund_method')
        if (ra := data.get('refund_amount')) is not None:
            ret.refund_amount = ra
            update_fields.append('refund_amount')
        if (rr := data.get('refund_reference')):
            ret.refund_reference = rr
            update_fields.append('refund_reference')
        if update_fields:
            ret.save(update_fields=update_fields + ['updated_at'])

        # Inspeksiya rasmlari (INSPECTING ga o'tish bilan birga)
        for img in data.get('inspection_images', []) or []:
            OrderReturnPhoto.objects.create(
                return_obj=ret, image=img, kind=OrderReturnPhoto.KIND_INSPECTION,
                uploaded_by=request.user,
            )

        # Yagona chokepoint — state machine + side-effects shu yerda
        ret = transition_return_status(
            return_obj=ret,
            new_status=data['new_status'],
            actor=request.user,
            note=data.get('note', ''),
            inspection_notes=data.get('inspection_notes', ''),
        )
        ret = (
            OrderReturn.objects
            .prefetch_related(
                'items__order_item__product', 'items__order_item__variant', 'photos',
            )
            .select_related(
                'order', 'dispute', 'replacement_order',
                'initiated_by', 'status_changed_by',
                'inspector', 'refund_processed_by',
            )
            .get(pk=ret.pk)
        )
        return Response(OrderReturnSerializer(ret, context={'request': request}).data)


class AdminReturnItemUpdateView(views.APIView):
    """
    PATCH /api/admin/returns/<int:pk>/items/<int:item_id>/

    Inspector item qarorlarini yangilaydi (condition / restock / writeoff_reason).
    INSPECTING yoki undan oldingi statuslarda ruxsat — ACCEPTED/REFUNDED'dan keyin
    bloklanadi (chunki SUCCESS yo'lida bu maydonlar stok logikasini boshqaradi).
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def patch(self, request, pk, item_id, *args, **kwargs):
        from .models import OrderReturn, OrderReturnItem
        ret = get_object_or_404(OrderReturn, pk=pk)
        if ret.status not in {
            OrderReturn.STATUS_REQUESTED, OrderReturn.STATUS_APPROVED,
            OrderReturn.STATUS_PICKUP_SCHEDULED, OrderReturn.STATUS_PICKED_UP,
            OrderReturn.STATUS_INSPECTING,
        }:
            return Response(
                {
                    'error': "Item qarorlarini bu statusda yangilab bo'lmaydi.",
                    'code': 'too_late',
                },
                status=400,
            )
        item = get_object_or_404(OrderReturnItem, pk=item_id, return_obj=ret)

        serializer = UpdateReturnItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        update_fields = []
        if 'condition' in data:
            item.condition = data['condition']; update_fields.append('condition')
        if 'restock' in data:
            item.restock = data['restock']; update_fields.append('restock')
        if 'writeoff_reason' in data:
            item.writeoff_reason = data['writeoff_reason']
            update_fields.append('writeoff_reason')
        if update_fields:
            item.save(update_fields=update_fields)
        return Response(OrderReturnSerializer(ret, context={'request': request}).data)


class AdminReturnsStatsView(views.APIView):
    """
    GET /api/orders/admin/returns/stats/

    Phase 3.5 — Qaytarish hisoboti (Reports tab):
      - Status bo'yicha taqsimot (REQUESTED/.../REFUNDED)
      - Sabab bo'yicha taqsimot (defective/wrong_item/...)
      - Refund usuli taqsimoti (cash/card/...)
      - Jami summa: qaytarilgan pul + almashtirilgan summa
      - Vaqt diapazoni: ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    """
    permission_classes = (IsAuthenticated, CanAccessReports)

    def get(self, request, *args, **kwargs):
        from .models import OrderReturn
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')

        qs = OrderReturn.objects.all()
        if date_from_str:
            d = parse_date(date_from_str)
            if d:
                qs = qs.filter(created_at__date__gte=d)
        if date_to_str:
            d = parse_date(date_to_str)
            if d:
                qs = qs.filter(created_at__date__lte=d)

        # Status taqsimoti
        by_status = list(
            qs.values('status').annotate(c=Count('id')).order_by('status')
        )
        # Sabab taqsimoti
        by_reason = list(
            qs.values('reason_code').annotate(c=Count('id')).order_by('-c')
        )
        # Refund usul taqsimoti — faqat success'lar
        refund_qs = qs.filter(status__in=OrderReturn.SUCCESS_STATUSES)
        by_method = list(
            refund_qs.values('refund_method')
            .annotate(c=Count('id'), total=Sum('refund_amount'))
            .order_by('-c')
        )

        totals = refund_qs.aggregate(
            total_refunded=Sum('refund_amount'),
            count=Count('id'),
        )

        return Response({
            'total_returns': qs.count(),
            'success_count': totals['count'] or 0,
            'total_refunded_amount': float(totals['total_refunded'] or 0),
            'by_status': by_status,
            'by_reason': by_reason,
            'by_method': by_method,
        })


class AdminReturnPhotoUploadView(views.APIView):
    """
    POST /api/admin/returns/<int:pk>/photos/

    Multipart: image (file) + kind (claim|inspection).
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def post(self, request, pk, *args, **kwargs):
        from .models import OrderReturn, OrderReturnPhoto
        ret = get_object_or_404(OrderReturn, pk=pk)
        image = request.FILES.get('image')
        if not image:
            return Response({'error': "Rasm yuborilmagan."}, status=400)
        kind = request.data.get('kind', OrderReturnPhoto.KIND_CLAIM)
        if kind not in (OrderReturnPhoto.KIND_CLAIM, OrderReturnPhoto.KIND_INSPECTION):
            return Response({'error': "kind faqat claim yoki inspection."}, status=400)
        photo = OrderReturnPhoto.objects.create(
            return_obj=ret, image=image, kind=kind, uploaded_by=request.user,
        )
        return Response(
            OrderReturnPhotoSerializer(photo, context={'request': request}).data,
            status=201,
        )


# ═══════════════════════════════════════════════════════════════════════════
#  DEFEKTLAR — sotuvga yaroqsiz (writeoff) buyumlar boshqaruvi
# ═══════════════════════════════════════════════════════════════════════════
#
#  Manba: OrderReturnItem (restock=False, qaytarish SUCCESS holatda).
#  Bu buyumlar tekshiruvda defekt/buzilgan deb topilgan → stokka QAYTMAGAN →
#  saytga/mobil katalogga qayta CHIQMAYDI. Bu yerda admin ularni kuzatadi.
# ═══════════════════════════════════════════════════════════════════════════

class AdminDefectListView(generics.ListAPIView):
    """
    GET /api/orders/admin/defects/ — defekt / writeoff buyumlar ro'yxati.

    Filtrlar:
      ?condition=defective|used_damaged|...   — holat bo'yicha
      ?writeoff_reason=defect|lost|customer_fault
      ?search=<mahsulot nomi>
    """
    serializer_class = AdminDefectItemSerializer
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get_queryset(self):
        from .models import OrderReturn, OrderReturnItem
        qs = (
            OrderReturnItem.objects
            .filter(
                restock=False,
                return_obj__status__in=OrderReturn.SUCCESS_STATUSES,
            )
            .select_related(
                'order_item', 'order_item__product', 'order_item__variant',
                'return_obj',
            )
            .prefetch_related('order_item__product__images')
            .order_by('-return_obj__refund_processed_at', '-id')
        )
        condition = self.request.query_params.get('condition')
        if condition:
            qs = qs.filter(condition=condition)
        writeoff = self.request.query_params.get('writeoff_reason')
        if writeoff:
            qs = qs.filter(writeoff_reason=writeoff)
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(order_item__product__name__icontains=search)
        return qs


class AdminDefectStatsView(views.APIView):
    """GET /api/orders/admin/defects/stats/ — defekt statistikasi (KPI kartalar)."""
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, *args, **kwargs):
        from .models import OrderReturn, OrderReturnItem
        from django.db.models import Sum, Count, F, DecimalField, ExpressionWrapper

        qs = OrderReturnItem.objects.filter(
            restock=False,
            return_obj__status__in=OrderReturn.SUCCESS_STATUSES,
        )
        total_items = qs.aggregate(n=Sum('quantity'))['n'] or 0
        total_loss = qs.aggregate(
            v=Sum(ExpressionWrapper(
                F('refund_unit_price') * F('quantity'),
                output_field=DecimalField(max_digits=16, decimal_places=2),
            ))
        )['v'] or 0
        by_condition = list(
            qs.values('condition').annotate(n=Count('id')).order_by('-n')
        )
        return Response({
            'total_records': qs.count(),
            'total_items': int(total_items),
            'total_loss': str(total_loss),
            'by_condition': by_condition,
        })


