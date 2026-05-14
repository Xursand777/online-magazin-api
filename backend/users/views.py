import random
from django.conf import settings
from rest_framework import generics, status, views
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
