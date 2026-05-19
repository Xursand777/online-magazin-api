import random
from django.conf import settings
from django.db.models import Count, Sum, Q
from rest_framework import generics, status, views
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.core.cache import cache

from .models import UserProfile, Address, Feedback
from .serializers import (
    RegisterSerializer, LoginRequestSerializer, VerifyOTPSerializer, PasswordLoginSerializer,
    UserProfileSerializer, AddressSerializer, FeedbackSerializer
)
from cart.views import merge_cart
from recommendations.services import merge_guest_profile_into_user
from .utils import find_user_by_phone

User = get_user_model()
FAKE_OTP_CODE = "121212"

def generate_otp():
    return str(random.randint(100000, 999999))

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = RegisterSerializer

class SendOTPView(views.APIView):
    permission_classes = (AllowAny,)
    serializer_class = LoginRequestSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data['phone']
        
        user = find_user_by_phone(phone)
        if not user:
            return Response(
                {"error": "Ushbu telefon raqami bazada mavjud emas. Iltimos, ro'yxatdan o'ting."}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Fixed OTP for local development until real SMS is integrated.
        try:
            otp_code = FAKE_OTP_CODE
            cache.set(f"otp_{phone}", otp_code, timeout=300) # 5 minutes
            print(f"--- MOCK SMS --- to {phone}: Your code is {otp_code}")
        except Exception as e:
            # If cache fails (e.g. Redis not configured), we still succeed
            # because VerifyOTPView accepts the fixed development code.
            print(f"Cache system error: {e}")
        
        return Response({
            "message": f"OTP muvaffaqiyatli yuborildi. Test uchun {FAKE_OTP_CODE} kodidan foydalaning.",
            "debug_code": FAKE_OTP_CODE,
        })

class VerifyOTPView(views.APIView):
    permission_classes = (AllowAny,)
    serializer_class = VerifyOTPSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data['phone']
        code = serializer.validated_data['code']
        
        # Allow the fixed development code even if cache/SMS fails.
        cached_otp = cache.get(f"otp_{phone}")
        
        if code == FAKE_OTP_CODE:
            pass
        elif not cached_otp or cached_otp != code:
            return Response({"error": "Kod noto'g'ri yoki muddati o'tgan."}, status=status.HTTP_400_BAD_REQUEST)
        
        user = find_user_by_phone(phone)
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
            
        user.is_verified = True
        user.is_active = True
        user.save()
        
        cache.delete(f"otp_{phone}")
        
        # Merge guest cart to user cart
        guest_session_id = request.headers.get('X-Guest-Session-Id')
        if guest_session_id:
            from cart.views import merge_cart
            merge_cart(user, guest_session_id)
            merge_guest_profile_into_user(user, guest_session_id)

        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'id': user.id,
                'phone': user.phone,
                'is_admin': user.is_staff or user.is_superuser
            }
        })

# LoginView triggers SendOTP for phone-based login (OTP flow)
class LoginView(SendOTPView):
    pass

# Password-based login (while SMS is not integrated)
class PasswordLoginView(views.APIView):
    permission_classes = (AllowAny,)
    serializer_class = PasswordLoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data['phone']
        password = serializer.validated_data['password']

        user = find_user_by_phone(phone)
        if not user:
            return Response({"error": "Telefon raqam topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        if not user.check_password(password):
            return Response({"error": "Parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Auto-activate user if not yet verified (SMS bypass)
        if not user.is_active:
            user.is_active = True
            user.is_verified = True
            user.save()

        # Merge guest cart to user cart
        guest_session_id = request.headers.get('X-Guest-Session-Id')
        if guest_session_id:
            merge_cart(user, guest_session_id)
            merge_guest_profile_into_user(user, guest_session_id)

        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'id': user.id,
                'phone': user.phone,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_admin': user.is_superuser or user.is_staff,
            }
        })

class UserProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = UserProfileSerializer

    def get_object(self):
        profile, created = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

    def perform_update(self, serializer):
        user = self.request.user
        first_name = self.request.data.get('first_name')
        last_name = self.request.data.get('last_name')
        
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        user.save()
        
        serializer.save()

class AddressListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        if serializer.validated_data.get('is_default'):
            Address.objects.filter(user=self.request.user).update(is_default=False)
        serializer.save(user=self.request.user)

class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)
        
    def perform_update(self, serializer):
        if serializer.validated_data.get('is_default'):
             Address.objects.filter(user=self.request.user).exclude(id=self.get_object().id).update(is_default=False)
        serializer.save()

class FeedbackCreateView(generics.CreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = FeedbackSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class AdminUserSearchView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        phone = request.query_params.get('phone', '').strip()
        if not phone:
            return Response({"error": "Telefon raqam ko'rsatilmadi"}, status=status.HTTP_400_BAD_REQUEST)

        user = find_user_by_phone(phone)
        if not user:
            return Response({"error": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "id": user.id,
            "phone": user.phone,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "credit_ban": user.credit_ban,
            "overdue_credit_count": user.overdue_credit_count
        })


class UserPagePagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100
    page_size_query_param = 'page_size'


def _require_admin(request):
    return request.user.is_staff or request.user.is_superuser


class AdminUserListView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not _require_admin(request):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        q = request.query_params.get('q', '').strip()
        is_active_param = request.query_params.get('is_active', '')
        credit_ban_param = request.query_params.get('credit_ban', '')

        qs = User.objects.annotate(
            order_count=Count('orders', distinct=True),
            total_spent=Sum('orders__total_price'),
        ).order_by('-date_joined')

        if q:
            qs = qs.filter(
                Q(phone__icontains=q) |
                Q(first_name__icontains=q) |
                Q(last_name__icontains=q)
            )
        if is_active_param in ('true', 'false'):
            qs = qs.filter(is_active=(is_active_param == 'true'))
        if credit_ban_param in ('true', 'false'):
            qs = qs.filter(credit_ban=(credit_ban_param == 'true'))

        paginator = UserPagePagination()
        page = paginator.paginate_queryset(qs, request)
        data = [
            {
                'id': u.id,
                'phone': u.phone,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'is_active': u.is_active,
                'is_verified': u.is_verified,
                'is_staff': u.is_staff,
                'credit_ban': u.credit_ban,
                'overdue_credit_count': u.overdue_credit_count,
                'date_joined': u.date_joined,
                'order_count': u.order_count or 0,
                'total_spent': float(u.total_spent or 0),
            }
            for u in page
        ]
        return paginator.get_paginated_response(data)


class AdminUserDetailView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk):
        if not _require_admin(request):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        try:
            u = User.objects.annotate(
                order_count=Count('orders', distinct=True),
                total_spent=Sum('orders__total_price'),
            ).get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        from orders.models import Order
        recent_orders = list(
            Order.objects.filter(user=u)
            .order_by('-created_at')[:10]
            .values('id', 'status', 'total_price', 'created_at', 'payment_method', 'is_credit')
        )

        return Response({
            'id': u.id,
            'phone': u.phone,
            'first_name': u.first_name,
            'last_name': u.last_name,
            'is_active': u.is_active,
            'is_verified': u.is_verified,
            'is_staff': u.is_staff,
            'credit_ban': u.credit_ban,
            'overdue_credit_count': u.overdue_credit_count,
            'date_joined': u.date_joined,
            'last_login': u.last_login,
            'order_count': u.order_count or 0,
            'total_spent': float(u.total_spent or 0),
            'recent_orders': recent_orders,
        })


class AdminUserToggleBanView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        if not _require_admin(request):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        try:
            u = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        u.credit_ban = not u.credit_ban
        if not u.credit_ban:
            u.overdue_credit_count = 0
        u.save(update_fields=['credit_ban', 'overdue_credit_count'])
        return Response({'credit_ban': u.credit_ban, 'overdue_credit_count': u.overdue_credit_count})


class AdminUserToggleActiveView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        if not _require_admin(request):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        try:
            u = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        if u.is_superuser:
            return Response({"error": "Superuser bloklanmaydi"}, status=status.HTTP_403_FORBIDDEN)

        u.is_active = not u.is_active
        u.save(update_fields=['is_active'])
        return Response({'is_active': u.is_active})


class AdminFeedbackListView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not _require_admin(request):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        status_filter = request.query_params.get('status', '').strip()
        q = request.query_params.get('q', '').strip()

        qs = Feedback.objects.select_related('user').order_by('-created_at')

        if status_filter in ('new', 'read', 'resolved'):
            qs = qs.filter(status=status_filter)
        if q:
            qs = qs.filter(
                Q(user__phone__icontains=q) |
                Q(user__first_name__icontains=q) |
                Q(message__icontains=q)
            )

        paginator = UserPagePagination()
        page = paginator.paginate_queryset(qs, request)
        data = [
            {
                'id': f.id,
                'user_id': f.user_id,
                'user_phone': f.user.phone,
                'user_name': f'{f.user.first_name} {f.user.last_name}'.strip(),
                'message': f.message,
                'status': f.status,
                'created_at': f.created_at.isoformat(),
            }
            for f in page
        ]
        return paginator.get_paginated_response(data)


class AdminFeedbackUpdateView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, pk):
        if not _require_admin(request):
            return Response({"error": "Admin huquqi talab qilinadi"}, status=status.HTTP_403_FORBIDDEN)

        try:
            feedback = Feedback.objects.select_related('user').get(pk=pk)
        except Feedback.DoesNotExist:
            return Response({"error": "Fikr topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status', '').strip()
        if new_status not in ('new', 'read', 'resolved'):
            return Response({"error": "Noto'g'ri status"}, status=status.HTTP_400_BAD_REQUEST)

        feedback.status = new_status
        feedback.save(update_fields=['status'])
        return Response({
            'id': feedback.id,
            'status': feedback.status,
            'user_phone': feedback.user.phone,
        })
