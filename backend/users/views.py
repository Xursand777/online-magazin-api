import secrets
from django.conf import settings
from django.db.models import Count, Sum, Q
from rest_framework import generics, status, views
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.contrib.auth import get_user_model
from django.core.cache import cache

from .models import UserProfile, Address, Feedback
from .permissions import IsSuperAdmin, IsAdminOrAbove
from .serializers import (
    RegisterSerializer, LoginRequestSerializer, VerifyOTPSerializer, PasswordLoginSerializer,
    UserProfileSerializer, AddressSerializer, FeedbackSerializer,
    StaffUserSerializer, AssignRoleSerializer,
    MasterUserSerializer, AssignMasterSerializer,
)
from cart.views import merge_cart
from recommendations.services import merge_guest_profile_into_user
from .utils import find_user_by_phone

User = get_user_model()

# Faqat DEVELOPMENT uchun qulay sobit kod. Production'da (DEBUG=False) bu kod
# HECH QACHON qabul qilinmaydi — haqiqiy tasodifiy OTP generatsiya qilinadi.
FAKE_OTP_CODE = "121212"

# OTP sozlamalari
OTP_TTL_SECONDS = 300          # Kod amal qilish muddati: 5 daqiqa
OTP_SEND_COOLDOWN = 60         # Bitta raqamga ketma-ket yuborish oralig'i: 60s
OTP_MAX_ATTEMPTS = 5           # Bitta kod uchun maksimal tekshirish urinishi


def _use_debug_otp() -> bool:
    """
    Debug OTP (sobit 121212 kod) qachon ishlatiladi:
    - DEBUG=True  (local development)
    - OTP_DEBUG=True  (Render'da Eskiz.uz sozlanmagan bo'lsa)
    - IS_TESTING=True (test suite)
    """
    return bool(
        settings.DEBUG
        or getattr(settings, 'OTP_DEBUG', False)
        or getattr(settings, 'IS_TESTING', False)
    )


def generate_otp() -> str:
    """Kriptografik xavfsiz 6 xonali OTP (random emas, secrets)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _is_privileged_account(user) -> bool:
    """
    Imtiyozli akkauntmi? — super_admin, yoki xodim (admin/sotuvchi/kuryer).

    ── ULTRA-XAVFSIZLIK QOIDASI ─────────────────────────────────────────────────
    Bunday akkauntlar uchun debug OTP (sobit 121212 kod) HECH QACHON ishlamaydi.
    Faqat haqiqiy, kriptografik tasodifiy SMS kod qabul qilinadi — `OTP_DEBUG`
    yoki `DEBUG` qanday bo'lishidan QAT'I NAZAR.

    NIMA UCHUN MUHIM:
        Agar production'da OTP_DEBUG=True bo'lsa (oddiy mijozlar uchun qulaylik
        davrida), bu qoidasiz har kim `121212` bilan super_admin sifatida kira
        olardi — bu KATASTROFA. Bu funksiya shu yo'lni butunlay yopadi.
    """
    return bool(
        getattr(user, 'is_superuser', False)
        or getattr(user, 'is_staff', False)
        or getattr(user, 'role', None)
    )


def _set_auth_cookies(response: Response, access_str: str, refresh_str: str = None) -> None:
    """
    Access va Refresh tokenlarni httpOnly cookie sifatida response'ga yozadi.
    XSS hujumidan to'liq himoya!
    """
    # samesite:
    #   'Lax'  — development (same-origin localhost)
    #   'None' — production cross-origin (Vercel ↔ Railway); Secure=True shart
    _samesite = 'Lax' if settings.DEBUG else 'None'
    response.set_cookie(
        key='access',
        value=access_str,
        max_age=86400,              # 24 soat — SIMPLE_JWT ACCESS_TOKEN_LIFETIME bilan mos
        httponly=True,
        secure=not settings.DEBUG,
        samesite=_samesite,
        path='/',
    )
    if refresh_str:
        response.set_cookie(
            key      = settings.REFRESH_TOKEN_COOKIE_NAME,
            value    = refresh_str,
            max_age  = settings.REFRESH_TOKEN_COOKIE_MAX_AGE,
            httponly = settings.REFRESH_TOKEN_COOKIE_HTTPONLY,
            secure   = settings.REFRESH_TOKEN_COOKIE_SECURE,
            samesite = settings.REFRESH_TOKEN_COOKIE_SAMESITE,
            path     = settings.REFRESH_TOKEN_COOKIE_PATH,
        )


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    authentication_classes = ()
    serializer_class = RegisterSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

class SendOTPView(views.APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    serializer_class = LoginRequestSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'otp'

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

        # SMS bombing himoyasi: bitta raqamga ketma-ket yuborishni cheklash
        cooldown_key = f"otp_cooldown_{phone}"
        if cache.get(cooldown_key):
            return Response(
                {"error": "Kod yaqinda yuborildi. Iltimos, biroz kutib turing."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # DEV / Eskiz hali sozlanmagan davr: qulay sobit kod (121212).
        # PROD (OTP_DEBUG=False, Eskiz tayyor): kriptografik tasodifiy kod + SMS.
        # ── XAVFSIZLIK BOSHQARUVI ────────────────────────────────────────────
        # Sobit kod (121212) FAQAT `OTP_DEBUG=True` bo'lganda, ya'ni Eskiz SMS
        # ruxsatnomasi olinmagan vaqtinchalik davrda ishlaydi. Eskiz tayyor
        # bo'lib `OTP_DEBUG=False` qo'yilgach, BARCHA foydalanuvchilar (shu
        # jumladan super_admin) AVTOMAT ravishda faqat haqiqiy SMS kodga o'tadi.
        use_debug_otp = _use_debug_otp()
        otp_code = FAKE_OTP_CODE if use_debug_otp else generate_otp()

        cache.set(f"otp_{phone}", otp_code, timeout=OTP_TTL_SECONDS)
        cache.delete(f"otp_attempts_{phone}")          # yangi kod → urinishlar nollanadi
        cache.set(cooldown_key, True, timeout=OTP_SEND_COOLDOWN)

        if use_debug_otp:
            print(f"--- MOCK SMS --- to {phone}: {otp_code}")
            # debug_code FAQAT development'da qaytariladi — production'da hech qachon
            return Response({
                "message": "Tasdiqlash kodi yuborildi (development).",
                "debug_code": otp_code,
            })

        # PRODUCTION: haqiqiy SMS yuborish
        from orders.sms import send_otp_sms
        if not send_otp_sms(phone, otp_code):
            cache.delete(cooldown_key)                 # yuborilmadi → qayta urinishga ruxsat
            return Response(
                {"error": "SMS yuborib bo'lmadi. Birozdan so'ng qayta urinib ko'ring."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"message": "Tasdiqlash kodi telefoningizga yuborildi."})


class VerifyOTPView(views.APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    serializer_class = VerifyOTPSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data['phone']
        code = serializer.validated_data['code']

        # Bitta kod uchun urinishlar sonini cheklash (brute-force himoya)
        attempts_key = f"otp_attempts_{phone}"
        attempts = cache.get(attempts_key, 0)
        if attempts >= OTP_MAX_ATTEMPTS:
            cache.delete(f"otp_{phone}")               # kodni kuydiramiz — yangi so'rash kerak
            return Response(
                {"error": "Juda ko'p noto'g'ri urinish. Iltimos, yangi kod so'rang."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        cached_otp = cache.get(f"otp_{phone}")

        # DEV / Eskiz sozlanmagan davr (OTP_DEBUG=True): sobit kodga ruxsat.
        # PROD (OTP_DEBUG=False): FAQAT cache'dagi haqiqiy SMS kod.
        # Solishtirish constant-time (timing attack'dan himoya).
        is_dev_code = _use_debug_otp() and secrets.compare_digest(code, FAKE_OTP_CODE)
        is_real_code = bool(cached_otp) and secrets.compare_digest(code, str(cached_otp))

        if not (is_dev_code or is_real_code):
            cache.set(attempts_key, attempts + 1, timeout=OTP_TTL_SECONDS)
            return Response(
                {"error": "Kod noto'g'ri yoki muddati o'tgan."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = find_user_by_phone(phone)
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user.is_verified = True
        user.is_active = True
        user.save()

        cache.delete(f"otp_{phone}")
        cache.delete(attempts_key)
        
        # Merge guest cart to user cart
        guest_session_id = request.headers.get('X-Guest-Session-Id')
        if guest_session_id:
            from cart.views import merge_cart
            merge_cart(user, guest_session_id)
            merge_guest_profile_into_user(user, guest_session_id)

        refresh = RefreshToken.for_user(user)
        access_token_str  = str(refresh.access_token)
        refresh_token_str = str(refresh)

        response_data = {
            'user': {
                'id': user.id,
                'phone': user.phone,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_admin': user.is_superuser or bool(user.role),
                'role': user.role,
                'is_master': user.is_master,
            }
        }

        # Web (brauzer): tokenlar httpOnly cookie'da — XSS'dan himoya.
        # Mobile (Flutter/React Native) yoki Development (DEBUG=True):
        #   tokenlar body'da ham qaytariladi.
        is_mobile = request.headers.get('X-Client-Type', '').lower() == 'mobile'
        if is_mobile or settings.DEBUG or getattr(settings, 'IS_TESTING', False):
            response_data['access']  = access_token_str
            response_data['refresh'] = refresh_token_str

        response = Response(response_data)
        _set_auth_cookies(response, access_token_str, refresh_token_str)
        return response

# LoginView triggers SendOTP for phone-based login (OTP flow)
class LoginView(SendOTPView):
    pass

# Password-based login (while SMS is not integrated)
class PasswordLoginView(views.APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    serializer_class = PasswordLoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data['phone']
        password = serializer.validated_data['password']

        # ── XAVFSIZLIK: user-enumeration va timing-attack himoyasi ────────────
        # Raqam topilmasa ham, parol noto'g'ri bo'lsa ham AYNAN bir xil javob
        # qaytariladi — shunda tashqaridan qaysi raqam bazada borligini bilib
        # bo'lmaydi. Raqam yo'q bo'lganda ham bir marta hash hisoblanadi
        # (make_password) — javob vaqti bir xil bo'lib, timing orqali raqam
        # mavjudligini aniqlab bo'lmaydi.
        from django.contrib.auth.hashers import make_password
        _GENERIC_LOGIN_ERROR = {"error": "Telefon raqami yoki parol noto'g'ri."}

        user = find_user_by_phone(phone)
        if user is None:
            make_password(password)  # timing equalize
            return Response(_GENERIC_LOGIN_ERROR, status=status.HTTP_401_UNAUTHORIZED)
        if not user.check_password(password):
            return Response(_GENERIC_LOGIN_ERROR, status=status.HTTP_401_UNAUTHORIZED)
        
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
        access_token_str  = str(refresh.access_token)
        refresh_token_str = str(refresh)

        response_data = {
            'user': {
                'id': user.id,
                'phone': user.phone,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_admin': user.is_superuser or bool(user.role),
                'role': user.role,
                'is_master': user.is_master,
            }
        }

        # Mobile yoki Development (DEBUG=True): tokenlar body'da ham qaytariladi.
        is_mobile = request.headers.get('X-Client-Type', '').lower() == 'mobile'
        if is_mobile or settings.DEBUG or getattr(settings, 'IS_TESTING', False):
            response_data['access']  = access_token_str
            response_data['refresh'] = refresh_token_str

        response = Response(response_data)
        _set_auth_cookies(response, access_token_str, refresh_token_str)
        return response

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
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, *args, **kwargs):
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
            "overdue_credit_count": user.overdue_credit_count,
            # POS — muddatli to'lov tugmasi'ni gating uchun
            "is_master": user.is_master,
            "can_use_credit": user.can_use_credit,
        })


class UserPagePagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100
    page_size_query_param = 'page_size'


class AdminUserListView(views.APIView):
    """
    GET /api/admin/users/
    IsAdminOrAbove DRF permission class ishlatiladi.
    Eski _require_admin() yordamchi funksiyasi o'chirildi: u
      1. DRF request lifecycle'dan tashqarida ishlardi (exception handler'ni chetlab o'tardi)
      2. har bir metodda qo'lda chaqirishni talab qilardi → unutish xavfi
      3. DRF schema (drf-spectacular) uchun ko'rinmas edi
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request):
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
                # Phase 3.3 — Block himoyasi uchun frontend gating'i (UX)
                'is_superuser': u.is_superuser,
                'role': u.role,
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
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, pk):
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
            # Phase 3.3 — Block himoyasi UX gating'i uchun
            'is_superuser': u.is_superuser,
            'role': u.role,
            'credit_ban': u.credit_ban,
            'overdue_credit_count': u.overdue_credit_count,
            'date_joined': u.date_joined,
            'last_login': u.last_login,
            'order_count': u.order_count or 0,
            'total_spent': float(u.total_spent or 0),
            'recent_orders': recent_orders,
        })


class AdminLiftCreditBanView(views.APIView):
    """
    POST /api/users/admin/users/<pk>/lift-credit-ban/

    Phase 2.7 (qayta dizayn) — Banlangan mijozni 1 ta imkoniyat bilan
    ban'dan chiqaradi.

    Avvalgi `toggle-ban` endpoint o'rnini bosadi. Eski semantika
    (toggle + count=0) suiiste'molga ochiq edi va admin'ning fikrini
    aks ettirmasdi — banni qo'lda yoqish odatda kerakmas, faqat
    ban'dan chiqarish.

    SEMANTIKA:
      • Faqat `credit_ban=True` foydalanuvchida ishlaydi (400 aks holda).
      • `overdue_credit_count = 2` (1 ta yangi overdue -> qaytadan ban).
      • Mavjud uncounted overdue buyurtmalar `counted=True` deb belgilanadi
        (cron qaytadan ban qilmasin).

    Body (ixtiyoriy):
      { "reason": "..." }   max 500

    Response 200:
      { "credit_ban": false, "overdue_credit_count": 2, "forgiven_orders": 3 }
    Response 400:
      { "error": "Foydalanuvchi kredit ban'da emas." }
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def post(self, request, pk):
        try:
            u = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "Foydalanuvchi topilmadi"}, status=status.HTTP_404_NOT_FOUND)

        # Audit uchun ixtiyoriy sabab
        reason = (request.data or {}).get('reason', '') if hasattr(request, 'data') else ''
        if reason and len(reason) > 500:
            return Response({"error": "Sabab 500 belgidan oshmasin."}, status=status.HTTP_400_BAD_REQUEST)

        # Cross-app service (orders/services.py)
        from orders.services import lift_user_credit_ban
        result = lift_user_credit_ban(user=u, admin=request.user, reason=reason)

        return Response({
            'credit_ban': u.credit_ban,
            'overdue_credit_count': u.overdue_credit_count,
            'forgiven_orders': result['forgiven_orders'],
        })


class AdminUserToggleActiveView(views.APIView):
    """
    POST /api/admin/users/<pk>/toggle-active/ — Foydalanuvchini blok/faollashtirish.

    4 QATLAMLI HIMOYA (har qaysisi mustaqil tekshiriladi):

      1. SUPERUSER PROTECTION — superuser hech qachon bloklanmaydi (root admin).
         Buni bloklab bo'lsa, hech kim tizimni boshqarib bo'lmaydi.

      2. STAFF PROTECTION — is_staff=True (admin/sotuvchi/kuryer) foydalanuvchini
         FAQAT superuser bloklab oladi. Bu admin'lar bir-birini bloklab tizimni
         buzishini oldini oladi (race condition: A bloklaydi B'ni, B bloklaydi A'ni).

      3. ROLE PROTECTION — `role` maydonida admin/seller/courier bo'lganlar uchun
         ham xuddi shu cheklov (is_staff False ga o'tib qolgan bo'lsa ham). Defense
         in depth — agar is_staff sinxron emas bo'lsa, role tekshiruvi qoplaydi.

      4. SELF-BLOCK PROTECTION — administrator o'zini bloklab tushib qola olmaydi.
         Hech qanday holatda admin o'zining is_active'ini false qila olmaydi.
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def post(self, request, pk):
        try:
            u = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"error": "Foydalanuvchi topilmadi"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ── 1. SUPERUSER — hech qachon bloklanmaydi ──────────────────────────
        if u.is_superuser:
            return Response(
                {
                    "error": "Super Admin'ni bloklab bo'lmaydi.",
                    "code": "cannot_block_superuser",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # ── 2. SELF-BLOCK — admin o'zini bloklamaydi ─────────────────────────
        # Foydalanuvchi o'zini bloklasa, qaytadan kira olmaydi va boshqalar uni
        # qaytarib bera olmaydi (faqat superuser). Bu race condition'ni oldini oladi.
        if u.pk == request.user.pk:
            return Response(
                {
                    "error": "O'zingizni bloklab bo'lmaydi.",
                    "code": "cannot_block_self",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # ── 3 & 4. XODIM (STAFF/ROLE) — faqat superuser bloklaydi ────────────
        # is_staff yoki role mavjud bo'lsa — xodim hisoblanadi.
        # Defense in depth: ikkalasini ham tekshiramiz (sinxronizatsiya
        # muammosi bo'lganda himoya saqlanadi).
        is_staff_member = bool(u.is_staff or u.role)
        if is_staff_member and not request.user.is_superuser:
            return Response(
                {
                    "error": (
                        "Xodimlarni faqat Super Admin bloklay oladi. "
                        "Avval uning rolini olib tashlang yoki Super Admin'ga murojaat qiling."
                    ),
                    "code": "staff_block_requires_superuser",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        u.is_active = not u.is_active
        u.save(update_fields=['is_active'])
        return Response({'is_active': u.is_active})


class AdminFeedbackListView(views.APIView):
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request):
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
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def patch(self, request, pk):
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


# ── JWT Cookie: Refresh va Logout ────────────────────────────────────────────

class CookieTokenRefreshView(views.APIView):
    """
    POST /api/auth/refresh/

    WEB (brauzer):
      Refresh token httpOnly cookie'dan o'qiladi — JavaScript ko'ra olmaydi.
      Yangi tokenlar ham cookie'ga yoziladi.

    MOBILE (X-Client-Type: mobile):
      Refresh token request body'dan o'qiladi: {'refresh': '<token>'}.
      Yangi tokenlar response body'da qaytariladi: {'access': '...', 'refresh': '...'}.
      Cookie ishlatilmaydi — mobil ilovalar httpOnly cookie'ni o'qiy olmaydi.

    ROTATE_REFRESH_TOKENS=True bo'lganda (har ikkala holatda):
      • Eski refresh token blacklist'ga qo'shiladi (BLACKLIST_AFTER_ROTATION).
      • Yangi access + refresh token qaytariladi.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes   = [ScopedRateThrottle]
    throttle_scope     = 'auth'

    def post(self, request):
        # ── Refresh token'ni olish ────────────────────────────────────────────
        # 1. Avval request body'dan izlaymiz (mobile yoki frontend fallback)
        refresh_str = None
        if isinstance(request.data, dict):
            refresh_str = request.data.get('refresh')
        
        # 2. Agar body'da bo'lmasa, cookie'dan qidiramiz (web standard)
        if not refresh_str:
            refresh_str = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
            is_mobile = False
        else:
            is_mobile = True

        # Qo'shimcha X-Client-Type tekshiruvi (agar header kelgan bo'lsa)
        if not is_mobile:
            is_mobile = request.headers.get('X-Client-Type', '').lower() == 'mobile'

        if not refresh_str:
            return Response(
                {'error': 'Sessiya tugagan yoki refresh token topilmadi. Qayta kiring.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # ── Token yangilash ───────────────────────────────────────────────────
        serializer = TokenRefreshSerializer(data={'refresh': refresh_str})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            resp = Response(
                {'error': 'Sessiya yaroqsiz. Iltimos, qayta kiring.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            if not is_mobile:
                # Web: cookie'ni tozalaymiz
                resp.delete_cookie(
                    key      = settings.REFRESH_TOKEN_COOKIE_NAME,
                    path     = settings.REFRESH_TOKEN_COOKIE_PATH,
                    samesite = settings.REFRESH_TOKEN_COOKIE_SAMESITE,
                )
            return resp

        new_access  = serializer.validated_data['access']
        new_refresh = serializer.validated_data.get('refresh')

        if is_mobile or settings.DEBUG:
            # Mobile / Dev Fallback: tokenlar body'da qaytariladi
            data = {'access': str(new_access)}
            if new_refresh:
                data['refresh'] = str(new_refresh)
            
            resp = Response(data)
            # Cookie ham baribir yoziladi (ikkala mexanizm parallel ishlaydi)
            _set_auth_cookies(resp, str(new_access), str(new_refresh) if new_refresh else None)
            return resp
        else:
            # Web: tokenlar faqat cookie'ga yoziladi
            resp = Response({'detail': 'Tokenlar yangilandi'})
            _set_auth_cookies(resp, str(new_access), str(new_refresh) if new_refresh else None)
            return resp


class CookieLogoutView(views.APIView):
    """
    POST /api/auth/logout/
    Refresh tokenni blacklist'ga qo'shadi va cookie'ni o'chiradi.

    WEB (brauzer):
      Refresh token httpOnly cookie'dan o'qiladi va cookielar o'chiriladi.

    MOBILE (X-Client-Type: mobile yoki body bor):
      Refresh token request body'dan o'qiladi: {'refresh': '<token>'}.
      Token blacklist'ga qo'shiladi → eski sessiya QAYTA ISHLAY OLMAYDI
      (xavfsizlik #1: o'g'irlangan token sotrudligi tugatiladi).

    AllowAny: access token muddati tugagan bo'lsa ham logout ishlaydi.
    Token mavjud bo'lmasa yoki yaroqsiz bo'lsa — no-op (xato qaytarmaydi),
    chunki maqsad seans tozalash, autentifikatsiya tekshirish emas.
    """
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        # ── Refresh tokenni topish ────────────────────────────────────────────
        # 1. Avval request body (mobile)
        refresh_str = None
        if isinstance(request.data, dict):
            refresh_str = request.data.get('refresh')

        # 2. Body'da bo'lmasa cookie (web)
        if not refresh_str:
            refresh_str = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)

        # ── Blacklist (mobile va web uchun bir xil) ──────────────────────────
        if refresh_str:
            try:
                token = RefreshToken(refresh_str)
                token.blacklist()
            except TokenError:
                pass  # Allaqachon bekor yoki yaroqsiz — muhim emas

        resp = Response({'detail': 'Tizimdan muvaffaqiyatli chiqdingiz.'})
        # Cookie'larni o'chirish — web foydalanuvchilar uchun
        resp.delete_cookie(
            key='access',
            path='/',
            samesite='Lax'
        )
        resp.delete_cookie(
            key      = settings.REFRESH_TOKEN_COOKIE_NAME,
            path     = settings.REFRESH_TOKEN_COOKIE_PATH,
            samesite = settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        )
        return resp


class GlobalLogoutView(views.APIView):
    """
    POST /api/auth/logout-all/
    Foydalanuvchining BARCHA qurilmalardan va sessiyalaridan chiqishi.
    Xavfsizlik maqsadida `tokens_invalidated_at` maydonini yangilaydi
    va joriy barcha outstanding refresh tokenlarni qora ro'yxatga kiritadi.
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        from django.utils import timezone
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

        # 1. Barcha joriy access tokenlarni bekor qilish
        user.tokens_invalidated_at = timezone.now()
        user.save(update_fields=['tokens_invalidated_at'])

        # 2. Barcha mavjud refresh tokenlarni qora ro'yxatga kiritish
        outstanding_tokens = OutstandingToken.objects.filter(user=user)
        for t in outstanding_tokens:
            BlacklistedToken.objects.get_or_create(token=t)

        resp = Response({'detail': "Barcha qurilmalardan xavfsiz chiqdingiz."})
        
        # Web cookie ni tozalaymiz
        resp.delete_cookie('access', path='/', samesite='Lax')
        resp.delete_cookie(
            key=settings.REFRESH_TOKEN_COOKIE_NAME,
            path=settings.REFRESH_TOKEN_COOKIE_PATH,
            samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        )
        return resp


# ── Xodim boshqaruvi (faqat Super Admin) ─────────────────────────────────────

class StaffListView(generics.ListAPIView):
    """GET /api/admin/staff/ — barcha xodimlar ro'yxati."""
    permission_classes = (IsAuthenticated, IsSuperAdmin)
    serializer_class   = StaffUserSerializer
    pagination_class   = None

    def get_queryset(self):
        qs = (
            User.objects
            .filter(role__isnull=False)
            .exclude(role='')
            .order_by('role', 'phone')
        )
        q = self.request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(phone__icontains=q)
        return qs


class AssignRoleView(views.APIView):
    """
    POST /api/admin/staff/assign-role/
    Body: { phone, role }  — role='' bo'lsa rol olib tashlanadi.
    """
    permission_classes = (IsAuthenticated, IsSuperAdmin)

    def post(self, request):
        s = AssignRoleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = s.validated_data['phone']
        role  = s.validated_data['role'] or None

        # Super Admin rolini hech qachon tayinlash mumkin emas
        if role == 'super_admin':
            return Response(
                {'detail': "Super Admin rolini tayinlab bo'lmaydi. "
                           "Bu rol faqat tizim administratori uchun."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user = find_user_by_phone(phone)
        if not user:
            return Response({'detail': 'Foydalanuvchi topilmadi.'}, status=status.HTTP_404_NOT_FOUND)

        # Superuser ni o'zgartirish mumkin emas
        if user.is_superuser:
            return Response(
                {'detail': "Super Admin foydalanuvchisini o'zgartirish mumkin emas."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if user == request.user and not role:
            return Response(
                {'detail': "O'z rolingizni olib tashlay olmaysiz."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_role   = user.role
        user.role  = role
        user.save()   # save() ichida is_staff avtomatik yangilanadi

        return Response({
            'phone':    user.phone,
            'old_role': old_role,
            'new_role': user.role,
            'is_staff': user.is_staff,
        })


class FireStaffView(views.APIView):
    """
    DELETE /api/admin/staff/<pk>/fire/
    Xodimni ishdan bo'shatish: rolini olib tashlaydi va barcha tokenlarini
    darhol bekor qiladi (tokens_invalidated_at yangilanadi).
    Faqat Super Admin ishlatishi mumkin.
    """
    permission_classes = (IsAuthenticated, IsSuperAdmin)

    def delete(self, request, pk):
        try:
            target = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'Xodim topilmadi.'}, status=status.HTTP_404_NOT_FOUND)

        # Superuserni o'chirish mumkin emas
        if target.is_superuser:
            return Response(
                {'detail': "Super Admin foydalanuvchisini roldan mahrum qilib bo'lmaydi."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Roli bo'lmagan foydalanuvchi — xodim emas
        if not target.role:
            return Response(
                {'detail': 'Bu foydalanuvchi xodim emas.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # O'zini ishdan bo'shatishi mumkin emas
        if target == request.user:
            return Response(
                {'detail': "O'z rolingizni olib tashlay olmaysiz."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fired_role = target.role
        target.role = None
        # save() avtomatik: is_staff=False + tokens_invalidated_at=now() → eski tokenlar bekor
        target.save()

        return Response({
            'id':         target.pk,
            'phone':      target.phone,
            'fired_role': fired_role,
            'detail':     f"{target.phone} xodimi ishdan bo'shatildi. Barcha tokenlar bekor qilindi.",
        })


# ── Usta boshqaruvi (faqat Super Admin) ──────────────────────────────────────

class MasterListView(generics.ListAPIView):
    """GET /api/admin/masters/ — barcha ustalar ro'yxati."""
    permission_classes = (IsAuthenticated, IsSuperAdmin)
    serializer_class   = MasterUserSerializer
    pagination_class   = None

    def get_queryset(self):
        qs = User.objects.filter(is_master=True).order_by('phone')
        q = self.request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(phone__icontains=q)
        return qs


class AssignMasterView(views.APIView):
    """
    POST /api/admin/masters/assign/
    Body: { phone }  — foydalanuvchini usta qiladi.
    """
    permission_classes = (IsAuthenticated, IsSuperAdmin)

    def post(self, request):
        s = AssignMasterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = s.validated_data['phone']

        user = find_user_by_phone(phone)
        if not user:
            return Response({'detail': 'Foydalanuvchi topilmadi.'}, status=status.HTTP_404_NOT_FOUND)

        if user.is_master:
            return Response({'detail': 'Bu foydalanuvchi allaqachon usta.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user.is_master = True
        user.save(update_fields=['is_master'])

        return Response({
            'id':     user.pk,
            'phone':  user.phone,
            'detail': f"{user.phone} usta ro'yxatiga qo'shildi.",
        }, status=status.HTTP_201_CREATED)


class RemoveMasterView(views.APIView):
    """
    DELETE /api/admin/masters/<pk>/remove/
    Ustadan olib tashlash.
    """
    permission_classes = (IsAuthenticated, IsSuperAdmin)

    def delete(self, request, pk):
        try:
            target = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'detail': 'Foydalanuvchi topilmadi.'}, status=status.HTTP_404_NOT_FOUND)

        if not target.is_master:
            return Response({'detail': 'Bu foydalanuvchi usta emas.'},
                            status=status.HTTP_400_BAD_REQUEST)

        target.is_master = False
        target.save(update_fields=['is_master'])

        return Response({
            'id':     target.pk,
            'phone':  target.phone,
            'detail': f"{target.phone} usta ro'yxatidan olib tashlandi.",
        })


class MasterStatusView(views.APIView):
    """
    GET /api/master/status/
    Joriy foydalanuvchining usta chegirma holati: bazaviy foiz, amaldagi foiz
    (faollikka qarab), oxirgi xariddan o'tgan kunlar. Shaffoflik uchun.
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        from orders.services import master_status
        return Response(master_status(request.user))


class AdminMasterDiscountView(views.APIView):
    """
    GET  /api/admin/masters/discount/  — usta OPTOM ustiga USTAMA foizini qaytaradi.
    POST /api/admin/masters/discount/  — { percent } — ustamani o'rnatadi (0–90).
    Faqat Super Admin.

    YANGI MODEL: foiz endi "sotuv narxidan chegirma" emas, balki usta to'laydigan
    OPTOM ustiga ustama (master_price = optom × (1 + percent/100), faollikka ko'ra
    gradient). Endpoint yo'li va so'rov maydoni (`percent`) backward-compat uchun
    o'zgarmaydi.
    """
    permission_classes = (IsAuthenticated, IsSuperAdmin)

    def get(self, request):
        from products.models import GlobalSetting
        pct = GlobalSetting.get_master_markup_percent()
        return Response({'percent': float(pct)})

    def post(self, request):
        from decimal import Decimal, InvalidOperation
        from products.models import GlobalSetting

        raw = request.data.get('percent')
        if raw is None or raw == '':
            return Response({'detail': 'Foiz qiymati kiritilishi shart.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            pct = Decimal(str(raw))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': "Noto'g'ri foiz formati."},
                            status=status.HTTP_400_BAD_REQUEST)

        if pct < 0 or pct > 90:
            return Response({'detail': "Foiz 0 va 90 oralig'ida bo'lishi kerak."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Butun son bo'lsa kasrsiz saqlaymiz (5.00 emas, 5)
        stored = pct.to_integral_value() if pct == pct.to_integral_value() else pct

        setting, _ = GlobalSetting.objects.get_or_create(key='master_discount_percent')
        setting.value = str(stored)
        setting.description = "Usta narxi: optom ustiga ustama foizi (%)"
        setting.save()
        # 5 daqiqalik keshni darhol bekor qilamiz — yangi ustama zudlik bilan amal qilsin.
        from django.core.cache import cache
        cache.delete(f'{GlobalSetting._CACHE_PREFIX}master_discount_percent')

        return Response({
            'percent': float(pct),
            'detail':  f"Usta ustamasi optom narx ustiga {stored}% ga o'rnatildi.",
        })


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1.1 — AuditLog API endpoint (admin tomonidan ko'rish)
# ─────────────────────────────────────────────────────────────────────────────

class AuditLogPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class AuditLogListView(generics.ListAPIView):
    """
    GET /api/admin/audit-logs/

    Faqat SUPER_ADMIN ko'ra oladi (oddiy admin emas).

    Filtrlar (query params):
      ?actor=<user_id>            faqat shu foydalanuvchi amallari
      ?action=<substring>          action nomida shu so'z bor (LIKE)
      ?target_type=<type>          'product', 'order', 'user', ...
      ?target_id=<id>              faqat shu resursga oid
      ?date_from=YYYY-MM-DD
      ?date_to=YYYY-MM-DD

    Tartiblash: doim yangidan eskiga (-created_at).

    XAVFSIZLIK:
      AuditLog'da PII bor (telefon, IP). Faqat SUPER_ADMIN ko'rishi shart.
    """
    permission_classes = (IsAuthenticated, IsSuperAdmin)
    pagination_class = AuditLogPagination

    def get_serializer_class(self):
        from .serializers import AuditLogSerializer
        return AuditLogSerializer

    def get_queryset(self):
        from .models import AuditLog
        qs = (
            AuditLog.objects
            .select_related('actor')
            .order_by('-created_at')
        )

        actor = self.request.query_params.get('actor')
        if actor:
            try:
                qs = qs.filter(actor_id=int(actor))
            except (ValueError, TypeError):
                pass

        action = self.request.query_params.get('action', '').strip()
        if action:
            qs = qs.filter(action__icontains=action)

        target_type = self.request.query_params.get('target_type', '').strip()
        if target_type:
            qs = qs.filter(target_type=target_type)

        target_id = self.request.query_params.get('target_id')
        if target_id:
            try:
                qs = qs.filter(target_id=int(target_id))
            except (ValueError, TypeError):
                pass

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs
