"""
Django settings for Bozor e-commerce platform.
"""
from pathlib import Path
import os
import sys
from datetime import timedelta
from dotenv import load_dotenv
import dj_database_url

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ─────────────────────────────────────────────────────────────────────────────
# MUHIT (Environment)
# ─────────────────────────────────────────────────────────────────────────────
# Production'da .env yoki server env vars orqali quyidagilarni o'rnating:
#   DJANGO_DEBUG=False
#   DJANGO_SECRET_KEY=<yangi_kalit>
#   DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
#   CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

IS_TESTING = 'test' in sys.argv
DEBUG = True if IS_TESTING else os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

# OTP debug rejimi: DEBUG=False bo'lsa ham debug OTP (121212) ishlatish uchun.
# Haqiqiy SMS (Eskiz.uz) sozlanmagan bo'lsa True qo'ying.
# Render env: OTP_DEBUG=True
OTP_DEBUG = os.getenv('OTP_DEBUG', 'False').lower() in ('true', '1', 'yes')

# Yangi kalit generatsiya:
#   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
_SECRET_KEY_DEFAULT = 'dev-only-insecure-key-MUST-be-changed-in-production'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', _SECRET_KEY_DEFAULT)

# Production'da kalitsiz ishga tushishni butunlay bloklash
if not DEBUG and SECRET_KEY == _SECRET_KEY_DEFAULT:
    raise RuntimeError(
        "\n\n  [XAVFLI] Production'da DJANGO_SECRET_KEY muhit o'zgaruvchisini o'rnating!\n"
        "  Yangi kalit:\n"
        "    python -c \"from django.core.management.utils import "
        "get_random_secret_key; print(get_random_secret_key())\"\n"
    )

# ─────────────────────────────────────────────────────────────────────────────
# ALLOWED HOSTS
# ─────────────────────────────────────────────────────────────────────────────
if DEBUG:
    ALLOWED_HOSTS: list[str] = ['*']
else:
    _raw_hosts = os.getenv('DJANGO_ALLOWED_HOSTS', '')
    ALLOWED_HOSTS = [h.strip() for h in _raw_hosts.split(',') if h.strip()]
    if not ALLOWED_HOSTS:
        raise RuntimeError(
            "[XAVFLI] Production'da DJANGO_ALLOWED_HOSTS muhit o'zgaruvchisini o'rnating!\n"
            "  Misol: DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com"
        )

# ─────────────────────────────────────────────────────────────────────────────
# ILOVALAR
# ─────────────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'cloudinary_storage',   # CDN storage backend (DEFAULT_FILE_STORAGE o'zgarishidan oldin bo'lishi shart)
    'cloudinary',           # Cloudinary Python SDK
    'corsheaders',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',  # logout + token rotatsiya uchun shart
    'drf_spectacular',

    # Mahalliy
    'core',     # Phase 1.2: MobileConfig singleton (app version check)
    'users',
    'products',
    'orders',
    'cart',
    'recommendations',
]

# ─────────────────────────────────────────────────────────────────────────────
# MIDDLEWARE
# ─────────────────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',   # Statik fayllar (admin CSS/JS) — SecurityMiddleware'dan keyin
    'corsheaders.middleware.CorsMiddleware',        # SecurityMiddleware'dan keyin bo'lishi shart
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Phase 1.1 — Admin amallarini AuditLog'ga yozadi
    # AuthenticationMiddleware'dan KEYIN — request.user'ga ehtiyoj bor
    'core.middleware.AuditMiddleware',
    # Phase 1.7 — 429 javoblarini kuzatadi, burst'da Telegram alert
    # Eng oxiriga — barcha view'lar javob qaytargandan keyin tekshirsin
    'core.middleware.RateLimitAlertMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# ─────────────────────────────────────────────────────────────────────────────
# MA'LUMOTLAR BAZASI
# ─────────────────────────────────────────────────────────────────────────────
DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv('DATABASE_URL', f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# ─────────────────────────────────────────────────────────────────────────────
# AUTENTIFIKATSIYA
# ─────────────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─────────────────────────────────────────────────────────────────────────────
# XALQAROLASHTIRISH
# ─────────────────────────────────────────────────────────────────────────────
LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

# ─────────────────────────────────────────────────────────────────────────────
# BUYURTMA QABUL QILISH VAQT OYNASI (Asia/Tashkent, HAR KUNI — dam olish yo'q)
# Buyurtmalar faqat [OPEN, CLOSE) oralig'ida qabul qilinadi (masalan 09:00–19:00).
# Xavfsizlik: bu backend'da server vaqti bilan majburlanadi (client soatini
# o'zgartirish orqali chetlab bo'lmaydi). UI faqat qulaylik uchun ko'rsatadi.
# ─────────────────────────────────────────────────────────────────────────────
ORDER_WINDOW_OPEN_HOUR = int(os.getenv('ORDER_WINDOW_OPEN_HOUR', '9'))
ORDER_WINDOW_CLOSE_HOUR = int(os.getenv('ORDER_WINDOW_CLOSE_HOUR', '19'))

# ─────────────────────────────────────────────────────────────────────────────
# STATIK VA MEDIA FAYLLAR
# ─────────────────────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# WhiteNoise: statik fayllarni siqadi va content-hash qo'shadi (browser caching uchun)
# Development'da ham ishlaydi (Django'ning `runserver --nostatic` kerak emas)
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─────────────────────────────────────────────────────────────────────────────
# CDN — Rasm va Fayl Xizmati
# ─────────────────────────────────────────────────────────────────────────────
# CDN_PROVIDER qiymatlari:
#   'local'      — serverning o'z diski (default, development uchun)
#   'b2'         — Backblaze B2 S3-compatible storage (production uchun tavsiya)
#   'cloudinary' — Cloudinary CDN (Uzbekistonda blok bo'lishi mumkin)
#
# Backblaze B2 bepul: 10GB saqlash + 1GB/kun yuklab olish
# Hisob oching: https://www.backblaze.com/sign-up/cloud-storage
# ─────────────────────────────────────────────────────────────────────────────

CDN_PROVIDER = os.getenv('CDN_PROVIDER', 'local')

if CDN_PROVIDER == 'b2':
    # Backblaze B2 — S3-compatible object storage
    _b2_key_id     = os.getenv('B2_KEY_ID', '')          # Application Key ID
    _b2_app_key    = os.getenv('B2_APPLICATION_KEY', '')  # Application Key
    _b2_bucket     = os.getenv('B2_BUCKET_NAME', '')      # Bucket nomi
    _b2_endpoint   = os.getenv('B2_ENDPOINT_URL', '')     # e.g. https://s3.us-west-004.backblazeb2.com

    if not all([_b2_key_id, _b2_app_key, _b2_bucket, _b2_endpoint]):
        raise RuntimeError(
            "[CDN] CDN_PROVIDER=b2 lekin sozlamalar to'liq emas!\n"
            "  B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT_URL\n"
            "  muhit o'zgaruvchilarini o'rnating."
        )

    # django-storages S3 backend (Backblaze B2 S3-compatible API)
    DEFAULT_FILE_STORAGE  = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_ACCESS_KEY_ID     = _b2_key_id
    AWS_SECRET_ACCESS_KEY = _b2_app_key
    AWS_STORAGE_BUCKET_NAME = _b2_bucket
    AWS_S3_ENDPOINT_URL   = _b2_endpoint
    AWS_S3_REGION_NAME    = os.getenv('B2_REGION', 'us-west-004')
    AWS_DEFAULT_ACL       = 'public-read'
    AWS_QUERYSTRING_AUTH  = False   # URL'lar ochiq (auth token shart emas)
    AWS_S3_FILE_OVERWRITE = False   # Fayl ustiga yozmaslik (xavfsiz)
    AWS_S3_CUSTOM_DOMAIN  = None    # CDN domeni bo'lsa shu yerga (ixtiyoriy)
    # Media URL: Backblaze public URL formatida
    MEDIA_URL = f'{_b2_endpoint}/{_b2_bucket}/'

elif CDN_PROVIDER == 'r2':
    # Cloudflare R2 — S3-mos object storage. Egress (yuklab olish) BEPUL.
    # Uzbekistonda Cloudinary blok bo'lishi mumkin — R2 + Cloudflare CDN ishonchli.
    #
    # MUHIM FARQ (S3'dan): R2 ACL'ni qo'llab-quvvatlamaydi.
    #   → AWS_DEFAULT_ACL = None bo'lishi SHART (aks holda 400 xato).
    #   → Public ko'rinish bucket'ga custom domen (cdn.bozor.uz) ulanishi orqali.
    _r2_account = os.getenv('R2_ACCOUNT_ID', '')        # Cloudflare account ID
    _r2_key_id  = os.getenv('R2_ACCESS_KEY_ID', '')     # R2 API token — Access Key ID
    _r2_secret  = os.getenv('R2_SECRET_ACCESS_KEY', '') # R2 API token — Secret
    _r2_bucket  = os.getenv('R2_BUCKET_NAME', '')       # Bucket nomi (masalan bozor-media)
    _r2_domain  = os.getenv('R2_PUBLIC_DOMAIN', '')     # Custom domen, masalan cdn.bozor.uz

    if not all([_r2_account, _r2_key_id, _r2_secret, _r2_bucket]):
        raise RuntimeError(
            "[CDN] CDN_PROVIDER=r2 lekin sozlamalar to'liq emas!\n"
            "  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME\n"
            "  muhit o'zgaruvchilarini o'rnating."
        )

    DEFAULT_FILE_STORAGE     = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_ACCESS_KEY_ID        = _r2_key_id
    AWS_SECRET_ACCESS_KEY    = _r2_secret
    AWS_STORAGE_BUCKET_NAME  = _r2_bucket
    AWS_S3_ENDPOINT_URL      = f'https://{_r2_account}.r2.cloudflarestorage.com'
    AWS_S3_REGION_NAME       = 'auto'        # R2 uchun doim 'auto'
    AWS_S3_SIGNATURE_VERSION = 's3v4'
    AWS_DEFAULT_ACL          = None          # R2 ACL'ni qo'llamaydi (S3'dan farqi)
    AWS_QUERYSTRING_AUTH     = False         # URL'lar ochiq (imzosiz)
    AWS_S3_FILE_OVERWRITE    = False         # Fayl ustiga yozmaslik
    # Cache-Control — fayl nomlari noyob (tasodifiy suffiks), shuning uchun
    # "immutable" + 1 yil kesh. Brauzer va Cloudflare CDN rasmni qayta yuklamaydi
    # → juda tez, server yuki yo'q (qotish muammosi yo'qoladi).
    AWS_S3_OBJECT_PARAMETERS = {
        'CacheControl': 'public, max-age=31536000, immutable',
    }
    # Public URL: custom domen bo'lsa undan, aks holda R2 endpoint'dan
    if _r2_domain:
        AWS_S3_CUSTOM_DOMAIN = _r2_domain
        MEDIA_URL = f'https://{_r2_domain}/'
    else:
        MEDIA_URL = f'{AWS_S3_ENDPOINT_URL}/{_r2_bucket}/'

elif CDN_PROVIDER == 'cloudinary':
    _cloud_name   = os.getenv('CLOUDINARY_CLOUD_NAME', '')
    _api_key      = os.getenv('CLOUDINARY_API_KEY', '')
    _api_secret   = os.getenv('CLOUDINARY_API_SECRET', '')

    if not all([_cloud_name, _api_key, _api_secret]):
        raise RuntimeError(
            "[CDN] CDN_PROVIDER=cloudinary lekin sozlamalar to'liq emas!\n"
            "  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET\n"
            "  muhit o'zgaruvchilarini o'rnating."
        )

    CLOUDINARY_STORAGE = {
        'CLOUD_NAME': _cloud_name,
        'API_KEY':    _api_key,
        'API_SECRET': _api_secret,
        'MEDIA_TAG':  'bozor',
        'MAGIC_FILE_PATH': 'cloudinary_storage/magic',
    }
    DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'

# ─────────────────────────────────────────────────────────────────────────────
# KESH — OTP, Rate Limiting va Session ma'lumotlari uchun
# ─────────────────────────────────────────────────────────────────────────────
#
# MUAMMO — Django default LocMemCache:
#   Har bir worker (Gunicorn jarayoni) o'z alohida xotirasida saqlaydi.
#   4 ta worker ishlatilsa, OTP 1-worker'da saqlanib 2-worker'da tekshirilsa
#   → "Kod noto'g'ri" xatosi. Rate limiting ham har bir worker'da mustaqil
#   hisoblanadi → brute-force himoyasi samarasiz bo'ladi.
#
# YECHIM — REDIS_URL muhit o'zgaruvchisini o'rnatish:
#   Barcha workerlar umumiy Redis instancedan foydalanadi.
#
# Redis o'rnatish:
#   sudo apt install redis-server && sudo systemctl enable --now redis   # Ubuntu/Debian
#   brew install redis && brew services start redis                      # macOS
#
# REDIS_URL formatlari:
#   redis://127.0.0.1:6379/1               — lokal, parolsiz, 1-database
#   redis://:mypassword@127.0.0.1:6379/1   — parolli
#   rediss://host:6380/1                   — TLS/SSL (masofaviy Redis)
#   redis://redis:6379/1                   — Docker Compose service nomi

_REDIS_URL = os.getenv('REDIS_URL', '')

if IS_TESTING:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'bozor-test-cache',
        }
    }
elif _REDIS_URL:
    # Umumiy Redis keshi — multi-worker'da OTP va rate limiting uchun zarur
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _REDIS_URL,
            # Default TTL: 5 daqiqa — OTP muddatiga mos (views'da maxsus TTL belgilanishi mumkin)
            'TIMEOUT': 300,
            # Kalit prefiksi: bir Redis instanceda bir nechta loyiha bo'lsa to'qnashuvni oldini oladi
            'KEY_PREFIX': 'bozor',
            'OPTIONS': {
                # Ulanish va so'rov vaqt chegaralari (soniya)
                # Redis vaqtinchalik o'chib-yonsa, ulanish 5 soniyadan ko'p kutmaydi
                'socket_connect_timeout': 5,
                'socket_timeout': 5,
            },
        }
    }
elif not DEBUG:
    # Production'da Redis yo'q bo'lsa — xavfli holat, ishga tushmasin
    raise RuntimeError(
        "\n\n  [KESH] Production'da REDIS_URL muhit o'zgaruvchisini o'rnating!\n\n"
        "  Sabab: Django default LocMemCache multi-worker (Gunicorn/uWSGI) muhitida\n"
        "  OTP kodlarini va rate limiting ma'lumotlarini workerlar o'rtasida\n"
        "  almasha olmaydi — bu xavfsizlik zaifligi.\n\n"
        "  Redis o'rnatish: sudo apt install redis-server\n"
        "  REDIS_URL misol:  redis://127.0.0.1:6379/1\n"
    )
# else: DEBUG=True, REDIS_URL yo'q → Django default LocMemCache (development uchun yetarli)

# ─────────────────────────────────────────────────────────────────────────────
# CORS — Cross-Origin Resource Sharing
# ─────────────────────────────────────────────────────────────────────────────
# NIMA: Brauzer boshqa domendan API'ga so'rov yuborganda bu sozlama ishlaydi.
# XAVF: CORS_ALLOW_ALL_ORIGINS=True bo'lsa, har qanday sayt (hacker.com ham)
#       foydalanuvchi nomidan sizning API'ingizga so'rov yuborishi mumkin.

if DEBUG:
    # Local development: barcha origin'larga ruxsat (localhost:5173 kabi)
    CORS_ALLOW_ALL_ORIGINS = True
else:
    # Production: FAQAT ruxsat berilgan domenlar
    CORS_ALLOW_ALL_ORIGINS = False
    _cors_raw = os.getenv('CORS_ALLOWED_ORIGINS', '')
    CORS_ALLOWED_ORIGINS: list[str] = [o.strip() for o in _cors_raw.split(',') if o.strip()]
    if not CORS_ALLOWED_ORIGINS:
        raise RuntimeError(
            "[XAVFLI] Production'da CORS_ALLOWED_ORIGINS muhit o'zgaruvchisini o'rnating!\n"
            "  Misol: CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com"
        )

# Cookie'larni CORS so'rovlarda yuborish (agar kerak bo'lsa)
CORS_ALLOW_CREDENTIALS = True

# Django 4.0+: CSRF middleware frontend domenini ishonchli hisoblasin.
# DRF JWT endpointlari csrf_exempt bo'lsa ham Django admin uchun zarur.
if not DEBUG:
    CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS  # CORS bilan bir xil ro'yxat

# Ruxsat berilgan HTTP metodlar
CORS_ALLOW_METHODS = ('DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT')

# Ruxsat berilgan so'rov sarlavhalari (faqat keraklilar)
CORS_ALLOW_HEADERS = (
    'accept',
    'accept-encoding',
    'accept-language',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-guest-session-id',     # Mehmon cart sessiyasi uchun
    'x-idempotency-key',      # Phase 3.0 — buyurtma takrorlanmasligi uchun (slow internet)
)

# Browser cross-origin javoblarda faqat "simple response headers"ni ko'rsatadi.
# Guest cart sessiyasi frontendga yetib borishi uchun custom headerni explicit
# expose qilish shart; aks holda Vercel → Render productionda savat item ID'lari
# stale bo'lib, PATCH/DELETE /cart/items/<id>/ 404 qaytaradi.
CORS_EXPOSE_HEADERS = (
    'X-Guest-Session-Id',
)

# Brauzer OPTIONS (preflight) javobini cache'lash muddati (sekundda)
CORS_PREFLIGHT_MAX_AGE = 86_400  # 1 kun

# ─────────────────────────────────────────────────────────────────────────────
# XAVFSIZLIK SARLAVHALARI
# ─────────────────────────────────────────────────────────────────────────────
# Har ikkala muhitda ham aktiv — minimal himoya

SECURE_BROWSER_XSS_FILTER = True       # X-XSS-Protection: 1; mode=block
SECURE_CONTENT_TYPE_NOSNIFF = True     # X-Content-Type-Options: nosniff
X_FRAME_OPTIONS = 'DENY'               # Clickjacking: iframe'da ko'rsatishni bloklash

if not DEBUG:
    # Nginx/Apache orqali HTTPS ishlatilsa True; to'g'ridan-to'g'ri ishlatilsa True
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() == 'true'
    # Reverse proxy (Nginx) dan kelgan HTTPS ma'lumotini ishonish
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

    # HSTS: Brauzerga "Bu saytga faqat HTTPS orqali kir" deydi (1 yil)
    # DIQQAT: Birinchi marta qisqaroq vaqt bilan sinab ko'ring (3600)
    SECURE_HSTS_SECONDS = 31_536_000        # 1 yil
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True   # Subdomenlarni ham qamrab oladi
    SECURE_HSTS_PRELOAD = True              # HSTS preload ro'yxatiga kiritish imkoniyati

    # Cookie'lar faqat HTTPS orqali yuboriladi va JavaScript o'qiy olmaydi
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    CSRF_COOKIE_SAMESITE = 'Lax'

    # Session muddati: 2 soat harakatsizlikdan keyin
    SESSION_COOKIE_AGE = 7_200

# ─────────────────────────────────────────────────────────────────────────────
# ADMIN PANEL VA API HUJJATLARI YO'LLARI
# ─────────────────────────────────────────────────────────────────────────────
# Production'da Django admin yo'lini maxfiy qiling — bu avtomatlashtirilgan
# /admin brute-force va skanerlash hujumlarini keskin kamaytiradi.
#   DJANGO_ADMIN_URL=maxfiy-panel-9f3x
ADMIN_URL = (os.getenv('DJANGO_ADMIN_URL', 'admin').strip('/') or 'admin') + '/'

# Swagger/Schema hujjatlari: default'da FAQAT development'da ochiq.
# Production'da yopiq (kerak bo'lsa ENABLE_API_DOCS=True bilan ataylab yoqiladi).
ENABLE_API_DOCS = os.getenv(
    'ENABLE_API_DOCS', 'True' if DEBUG else 'False'
).lower() in ('true', '1', 'yes')

# ─────────────────────────────────────────────────────────────────────────────
# DRF — Django REST Framework
# ─────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'users.authentication.RoleAwareJWTAuthentication',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,

    # ── Rate Limiting (Brute-force va DDoS himoyasi) ──
    # Anon: autentifikatsiya bo'lmagan so'rovlar (IP bo'yicha)
    # User: JWT token bilan autentifikatsiya qilingan
    # auth: login/OTP endpointlari uchun alohida (views'da belgilash kerak)
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '200/hour',    # Mehmon: soatiga 200 ta so'rov
        'user': '2000/hour',   # Tizimga kirgan: soatiga 2000 ta
        'auth': '10/minute',   # Login/OTP: minutiga 10 ta (brute-force himoya)
        'otp':  '5/minute',    # OTP yuborish: minutiga 5 ta
    },
}

# Production'da faqat JSON qaytaradi (HTML Browsable API yopiladi)
if not DEBUG:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [
        'rest_framework.renderers.JSONRenderer',
    ]

# ─────────────────────────────────────────────────────────────────────────────
# JWT — JSON Web Tokens
# ─────────────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    # Access token: 24 soat.
    # Nima uchun 24 soat (1 soat emas)?
    #   - Mobil ilovada foydalanuvchi kuniga bir necha marta kiradi.
    #     Har soatda refresh kerak bo'lsa, ROTATE_REFRESH_TOKENS muhitida
    #     cross-server token blacklist va parallel refresh race condition
    #     xavfi sezilarli oshadi.
    #   - Web'da token httpOnly cookie'da — JavaScript o'g'irlay olmaydi.
    #   - Mobil'da token FlutterSecureStorage'da (Keychain/Keystore).
    #   - Haqiqiy logout uchun role_invalidated_at mexanizmi bor (instant revoke).
    #   - Xavfni kamaytirish: RoleAwareJWTAuthentication iat < role_invalidated_at
    #     tekshiradi va xodim "o'chirilsa" eski tokenlarni DARHOL bekor qiladi.
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=24),

    # Refresh token: 30 kun — foydalanuvchi oyda bir marta qayta login qiladi.
    # Har rotate qilganda eski token blacklist'ga tushadi.
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),

    # ── ROTATION O'CHIRILDI — xavfsizlik tahlili ─────────────────────────────
    # ROTATE_REFRESH_TOKENS=True edi, lekin bu real muammo keltirib chiqardi:
    #
    #   Muammo (cross-tab race condition):
    #   2 ta brauzer tab bir vaqtda token muddati o'tganda refresh qilsa →
    #   tab A muvaffaqiyatli → eski token blacklist → tab B 401 → FORCE-LOGOUT.
    #   BroadcastChannel + single-flight tab ICHIDA hal qiladi, lekin
    #   har tab o'z JS execution context'iga ega — ~50ms window qoladi.
    #
    #   Xavfsizlik (nima yo'qolmaydi):
    #   • httpOnly cookie → XSS token o'g'irlay olmaydi (asosiy himoya).
    #   • SameSite=Lax + Secure → CSRF himoya.
    #   • Logout → token.blacklist() ishlaydi (manual chiqishda).
    #   • role_invalidated_at → admin/xodim rollari DARHOL bekor qilinadi.
    #   • ACCESS_TOKEN_LIFETIME=24h → access token qisqa yashaydi.
    #
    #   Nima yo'qoladi: agar refresh token cookie o'g'irlansa (XSS kerak!),
    #   u "bir martalik" bo'lmaydi. Lekin httpOnly sababli o'g'irlash juda qiyin.
    #
    #   Xulosa: Google, Facebook, GitHub rotation ISHLATMAYDI —
    #   httpOnly cookie + server-side session xavfsizlikni ta'minlaydi.
    #   Rotation bizning use-case uchun foydasidan zarari ko'p.
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,  # Rotation yo'q → rotation blacklist ham yo'q
    # Logout blacklist ISHLAYDI: CookieLogoutView token.blacklist() chaqiradi.
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'ALGORITHM': 'HS256',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# ─────────────────────────────────────────────────────────────────────────────
# JWT COOKIE — Refresh token httpOnly cookie sozlamalari
# ─────────────────────────────────────────────────────────────────────────────
#
# MUAMMO — localStorage'da refresh token (XSS zaiflik):
#   localStorage JavaScript tomonidan o'qiladi. Agar saytda XSS zaiflik bo'lsa
#   (masalan, foydalanuvchi kiritgan matn filtrsiz HTML'ga qo'shilsa), hujumchi
#   localStorage'ni o'qib tokenni o'g'irlashi mumkin.
#
# YECHIM — httpOnly cookie:
#   • httpOnly=True  → JavaScript (document.cookie) o'qiy olmaydi → XSS'dan himoya
#   • secure=True    → Faqat HTTPS orqali yuboriladi (production'da)
#   • samesite='Lax' → Boshqa saytlardan kelgan cross-site POST so'rovlarda
#                      cookie yuborilmaydi → CSRF'dan qisman himoya
#   • path=...       → Cookie faqat refresh endpointiga yuboriladi → hujum
#                      yuzasi kamayadi (login, products va boshqa endpointlarga
#                      refresh token umuman yuborilmaydi)

REFRESH_TOKEN_COOKIE_NAME     = 'bozor_refresh'
REFRESH_TOKEN_COOKIE_MAX_AGE  = 30 * 24 * 3600          # 30 kun (SIMPLE_JWT bilan mos)
REFRESH_TOKEN_COOKIE_HTTPONLY = True
REFRESH_TOKEN_COOKIE_SECURE   = not DEBUG               # Production'da faqat HTTPS
# SameSite:
#   Development (DEBUG=True)   → 'Lax'  — localhost'da same-origin, CSRF'dan himoya
#   Production  (DEBUG=False)  → 'None' — Vercel (frontend) ↔ Railway (backend) cross-origin
#                                          SameSite=None + Secure=True HTTPS talab qiladi
REFRESH_TOKEN_COOKIE_SAMESITE = 'Lax' if DEBUG else 'None'
REFRESH_TOKEN_COOKIE_PATH     = '/api/auth/refresh/'    # Faqat refresh endpointiga

# ─────────────────────────────────────────────────────────────────────────────
# LOGLASH — Xavfsizlik va Xatolarni Kuzatish
# ─────────────────────────────────────────────────────────────────────────────
# Fayllar: backend/logs/
#   errors.log   — barcha ERROR va yuqori darajadagi xatolar
#   security.log — xavfsizlikka oid voqealar (noto'g'ri login, CSRF hujumi va h.k.)
#   api.log      — barcha API so'rovlari (DEBUG rejimdagina)

LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,

    'formatters': {
        'verbose': {
            'format': '{asctime} [{levelname}] {name} pid={process} — {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '{asctime} [{levelname}] {message}',
            'style': '{',
        },
    },

    'filters': {
        'require_debug_true':  {'()': 'django.utils.log.RequireDebugTrue'},
        'require_debug_false': {'()': 'django.utils.log.RequireDebugFalse'},
    },

    'handlers': {
        # Terminal: faqat development'da chiqaradi
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
            'filters': ['require_debug_true'],
        },
        # Xatolar fayli: 10MB * 10 ta arxiv = 100MB maksimum
        'error_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'errors.log',
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 10,
            'formatter': 'verbose',
            'level': 'ERROR',
        },
        # Xavfsizlik fayli: login urinishlari, CSRF, ruxsatsiz kirish
        'security_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'security.log',
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 10,
            'formatter': 'verbose',
            'level': 'WARNING',
        },
        # API loglari: so'rovlar va javoblar
        'api_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'api.log',
            'maxBytes': 10 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'verbose',
            'level': 'INFO',
        },
    },

    'loggers': {
        # Django core
        'django': {
            'handlers': ['console', 'error_file'],
            'level': 'INFO',
            'propagate': False,
        },
        # Xavfsizlik hodisalari (noto'g'ri login, CSRF, SuspiciousOperation)
        'django.security': {
            'handlers': ['security_file'],
            'level': 'WARNING',
            'propagate': False,
        },
        # HTTP xatolari (500, 404 va h.k.)
        'django.request': {
            'handlers': ['error_file'],
            'level': 'ERROR',
            'propagate': False,
        },
        # Bizning API'miz uchun: import logging; logger = logging.getLogger('api')
        'api': {
            'handlers': ['console', 'api_file'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },

    'root': {
        'handlers': ['console', 'error_file'],
        'level': 'WARNING',
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# SWAGGER / API DOCS
# ─────────────────────────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    'TITLE': 'Bozor API',
    'DESCRIPTION': "O'zbekiston e-commerce platformasi uchun REST API",
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    # Production'da Swagger UI ni yopish uchun urls.py'da shartli ulash kerak
}

# ─────────────────────────────────────────────────────────────────────────────
# SMS — Eskiz.uz
# ─────────────────────────────────────────────────────────────────────────────
ESKIZ_EMAIL = os.getenv('ESKIZ_EMAIL', '')
ESKIZ_PASSWORD = os.getenv('ESKIZ_PASSWORD', '')
ESKIZ_SENDER = os.getenv('ESKIZ_SENDER', '4546')

# Balans tekshiruv thresholdlari (UZS da):
#   • Warning  — to'ldirish vaqti keldi, lekin shoshilinch emas
#   • Critical — DARHOL to'ldirilmasa OTP login uzilishi mumkin
# Default'lar: ~50 UZS/SMS hisobida
#   50,000 UZS ≈ 1,000 SMS
#   10,000 UZS ≈ 200 SMS
ESKIZ_BALANCE_WARNING_THRESHOLD = float(os.getenv('ESKIZ_BALANCE_WARNING_THRESHOLD', '50000'))
ESKIZ_BALANCE_CRITICAL_THRESHOLD = float(os.getenv('ESKIZ_BALANCE_CRITICAL_THRESHOLD', '10000'))
# Bitta SMS narxi (UZS) — taxminiy SMS sonini hisoblash uchun.
# Operatorga qarab 40-60 UZS oralig'ida.
ESKIZ_PRICE_PER_SMS = float(os.getenv('ESKIZ_PRICE_PER_SMS', '50'))

# ─────────────────────────────────────────────────────────────────────────────
# RATE LIMIT ALERT — Phase 1.7
# ─────────────────────────────────────────────────────────────────────────────
# Daqiqada shu sondan ko'p 429 javob bo'lsa, Telegram'ga CRITICAL alert.
# Default 100 — kichik-o'rta biznes uchun mos.
# Yirik biznesda: 500-1000 (legit traffic ham 429 olishi mumkin).
RATE_LIMIT_ALERT_THRESHOLD = int(os.getenv('RATE_LIMIT_ALERT_THRESHOLD', '100'))


# ─────────────────────────────────────────────────────────────────────────────
# BACKUP SUPER_ADMIN — Lockout recovery
# ─────────────────────────────────────────────────────────────────────────────
#
# NIMA UCHUN:
#   Birinchi super_admin qulflanib qolsa (parol unutildi, SIM yo'qoldi,
#   SIM swap hujum, dam olish kunlari kasal bo'lib qoldi va h.k.) — biznes
#   to'xtaydi. Yangi admin yaratish, rollarni o'zgartirish, USD kurs
#   yangilash kabi amallar faqat super_admin uchun.
#
# YECHIM:
#   Ikkinchi super_admin (sherigingiz, oilangizdan ishonchli kishi yoki
#   buxgalter) — alohida telefon raqami bilan. Birinchi super_admin
#   yiqilsa, bu shaxs orqali tiklash.
#
# BU RAQAM:
#   +998 94 112 67 77 — Bozor loyihasining backup super_admin telefoni.
#   Yaratish: python manage.py create_backup_superuser
#
# XAVFSIZLIK:
#   Bu telefon SIM swap hujumiga qarshi maxsus muhofazada bo'lishi tavsiya:
#     • Operator'da PIN-himoya yoqilgan
#     • SIM almashtirish faqat shaxsiy keladigan zal orqali
#     • Telegram'da 2FA yoqilgan
BACKUP_SUPERUSER_PHONE = os.getenv('BACKUP_SUPERUSER_PHONE', '+998941126777')

# ─────────────────────────────────────────────────────────────────────────────
# DOIMIY SUPER ADMINLAR — canonical allowlist (FAQAT shu 2 raqam)
# ─────────────────────────────────────────────────────────────────────────────
#
# QOIDA:
#   Tizimda FAQAT quyidagi telefon raqamlari super_admin bo'la oladi. Boshqa
#   hech kim (test akkaunt, eski admin va h.k.) super_admin bo'lib qolmaydi.
#
#   `python manage.py sync_superusers` komandasi (Procfile release bosqichida
#   HAR DEPLOY'da avtomatik ishlaydi) shu ro'yxatni majburlaydi:
#     • Ro'yxatdagi raqamlar  → super_admin (mavjud bo'lsa)
#     • Ro'yxatda yo'q super_admin → huquqi olib tashlanadi (akkaunt o'chmaydi)
#
#   LOCKOUT HIMOYASI: agar ro'yxatdagi birorta super_admin haqiqatan mavjud
#   bo'lmasa, komanda HECH KIMNI tushirmaydi (hammani qulflab qo'ymaslik uchun).
#
#   1-raqam: +998 94 681 09 00 — asosiy (Xursand)
#   2-raqam: +998 94 112 67 77 — backup (BACKUP_SUPERUSER_PHONE bilan bir xil)
#
#   Env orqali o'zgartirsa bo'ladi (vergul bilan):
#     SUPERUSER_PHONES=+998946810900,+998941126777
_DEFAULT_SUPERUSER_PHONES = f'+998946810900,{BACKUP_SUPERUSER_PHONE}'
SUPERUSER_PHONES = [
    p.strip()
    for p in os.getenv('SUPERUSER_PHONES', _DEFAULT_SUPERUSER_PHONES).split(',')
    if p.strip()
]

# ─────────────────────────────────────────────────────────────────────────────
# BACKUP — Database backup'lar uchun
# ─────────────────────────────────────────────────────────────────────────────
# Backup ALOHIDA B2 bucket'ga yuklanadi (media bucket'dan farqli):
#   • Media bucket:  AWS_STORAGE_BUCKET_NAME  (public-read)
#   • Backup bucket: BACKUP_B2_BUCKET         (PRIVATE — PII bor!)
#
# Foydalanuvchi B2'da yangi bucket yaratadi: bozor-backups (yoki shu kabi),
# uni PRIVATE qilib qo'yadi, va B2_BUCKET_BACKUPS env'ga yozadi.
BACKUP_B2_BUCKET = os.getenv('B2_BUCKET_BACKUPS', '').strip()

# Retention: shu kun'dan eski backup'lar avtomat o'chiriladi.
# Lekin har doim eng so'nggi 7 ta backup saqlab qolinadi (MIN_BACKUPS_TO_KEEP).
BACKUP_RETENTION_DAYS = int(os.getenv('BACKUP_RETENTION_DAYS', '30'))

# ─────────────────────────────────────────────────────────────────────────────
# TELEGRAM — Admin alert kanali
# ─────────────────────────────────────────────────────────────────────────────
# Bu sozlamalar quyidagi vazifalar uchun ishlatiladi:
#   • UptimeRobot server o'chsa xabar berishi
#   • Sentry kritik xato'larni yo'naltirishi
#   • Eskiz SMS balans tugayotganini bildirishi
#   • Kam stocked tovarlar ogohlantirish
#   • Daily admin digest
#   • Mijoz feedback / dispute alert
#
# O'RNATISH (3 daqiqada):
#   1. Telegram'da @BotFather'ni toping va /newbot buyrug'ini yuboring
#   2. Bot nomi va username so'raydi (masalan: bozor_alert_bot)
#   3. Token beradi: 7842914738:AAEXxxxxxxxx (TELEGRAM_BOT_TOKEN)
#   4. Botingizni Telegram'da toping va /start bosing (yoki guruhga qo'shing)
#   5. Brauzerda: https://api.telegram.org/bot<TOKEN>/getUpdates
#      Javobda chat.id raqamini topib oling (TELEGRAM_ADMIN_CHAT_ID)
#   6. Test: python manage.py test_telegram
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
TELEGRAM_ADMIN_CHAT_ID = os.getenv('TELEGRAM_ADMIN_CHAT_ID', '').strip()

# ─────────────────────────────────────────────────────────────────────────────
# CELERY — Fon Vazifalar
# ─────────────────────────────────────────────────────────────────────────────
#
# #20 FIX: threading.Thread(daemon=True) o'rniga Celery.
#
# MUAMMO (threading):
#   daemon=True → server restart'da (gunicorn SIGTERM) barcha daemon
#   threadlar O'LDIRILADI. Navbatdagi SMS'lar yo'qoladi.
#
# YECHIM (Celery + Redis):
#   Celery worker alohida jarayon — server restart'dan mustaqil.
#   Task navbatda (Redis) saqlanadi. Worker qayta ishga tushganda
#   navbatdagi barcha tasklarni bajaradi.
#
# O'RNATISH:
#   pip install celery[redis]
#
# ISHGA TUSHIRISH:
#   celery -A core worker --loglevel=info
#
# ENV VARS:
#   REDIS_URL=redis://127.0.0.1:6379/0
#   (Agar REDIS_URL o'rnatilmagan bo'lsa Celery ishlamasdan threading'ga qaytadi)
# ─────────────────────────────────────────────────────────────────────────────
if _REDIS_URL:
    # Celery broker va result backend — Redis orqali
    CELERY_BROKER_URL          = _REDIS_URL
    CELERY_RESULT_BACKEND      = _REDIS_URL

    # Serialization
    CELERY_ACCEPT_CONTENT      = ['json']
    CELERY_TASK_SERIALIZER     = 'json'
    CELERY_RESULT_SERIALIZER   = 'json'

    # Timezone — Django bilan bir xil
    CELERY_TIMEZONE            = TIME_ZONE
    CELERY_ENABLE_UTC          = True

    # Worker sozlamalari
    CELERY_WORKER_PREFETCH_MULTIPLIER = 1   # Long task'lar uchun: 1 task birdan olsin
    CELERY_TASK_ACKS_LATE             = True   # Task bajarilgandan keyin ack (crash-safe)
    CELERY_WORKER_HIJACK_ROOT_LOGGER  = False  # Django logging'ni saqlash

    # Retry sozlamalari (SMS task uchun)
    CELERY_TASK_MAX_RETRIES    = 3
    CELERY_TASK_SOFT_TIME_LIMIT = 30    # 30 soniya — task soft kill (SoftTimeLimitExceeded)
    CELERY_TASK_TIME_LIMIT     = 60    # 60 soniya — task hard kill (SIGKILL)

    # Beat (scheduled tasks) uchun
    # ─────────────────────────────────────────────────────────────────────────
    # Hetzner migratsiyasidan keyin DB backup'lar SHU YERDA bo'shatilmoqda
    # (GitHub Actions emas). Sabab: Hetzner PostgreSQL TASHQARI ko'rinmaydi,
    # faqat docker-compose ichki tarmog'idagi `web`/`worker` konteyneri ulanishi
    # mumkin. Celery Beat → Redis → worker → backup_db management command.
    # Tafsilot: core/tasks.py va core/management/commands/backup_db.py
    # ─────────────────────────────────────────────────────────────────────────
    from celery.schedules import crontab as _crontab

    CELERY_BEAT_SCHEDULE = {
        'auto_cancel_expired_orders_every_10_minutes': {
            'task': 'orders.auto_cancel_expired_orders_task',
            'schedule': 600.0,  # 10 daqiqa
        },
        # Phase 0.3 — kunlik shifrlangan DB backup B2 ga.
        # 03:00 UTC = 08:00 Toshkent (UTC+5). Trafik pasaytirilgan vaqt.
        # Bajaruvchi: backup_db_task → call_command('backup_db')
        #   → pg_dump | gzip | AES-256-GCM → Backblaze B2 (private bucket)
        'backup_db_daily_03_utc': {
            'task': 'core.backup_db_task',
            'schedule': _crontab(hour=3, minute=0),
            'options': {
                # Bir backup bajarilayotganda yangisi qo'yilmasin (resurs
                # himoyasi + concurrent pg_dump muammosi yo'q).
                'expires': 3600,
            },
        },
    }

# ─────────────────────────────────────────────────────────────────────────────
# SENTRY — Xato kuzatish va monitoring
# ─────────────────────────────────────────────────────────────────────────────
#
# NIMA UCHUN:
#   Production'da xatolar log fayllarda yashiringan bo'ladi. Bilmasdan turib
#   24 soatlab xato chiqib turishi mumkin. Sentry har bir Exception'ni
#   real vaqt rejimida tutib, stacktrace, request ma'lumotlari va kontekst
#   bilan dashboard'ga chiqaradi.
#
# O'RNATISH:
#   1. https://sentry.io da hisob ochish (free reja: 5000 event/oy)
#   2. Yangi Django project yaratish → DSN ni nusxalash
#   3. .env'ga SENTRY_DSN=https://...@sentry.io/... qo'shish
#
# XAVFSIZLIK:
#   send_default_pii=False — foydalanuvchi tokenlari, parollari Sentry'ga
#     YUBORILMAYDI. PII (Personal Identifiable Information) tashqariga
#     chiqmasligi GDPR/local privacy talablariga rioya.
#   traces_sample_rate=0.1 — har 10 ta so'rovdan 1 tasi performance kuzatuvi
#     uchun olinadi. Free rejimda event'larni tejaydi.
#
# DEBUG=True'da: Sentry o'chiriladi — local development xatolari uchun
#   Django default tracebacki yetarli.
# ─────────────────────────────────────────────────────────────────────────────
_SENTRY_DSN = os.getenv('SENTRY_DSN', '').strip()

if _SENTRY_DSN.startswith(('http://', 'https://')) and not DEBUG:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        import logging as _logging

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            integrations=[
                DjangoIntegration(
                    transaction_style='url',
                    middleware_spans=True,
                    signals_spans=False,  # signal'lar ko'p — performance overhead
                ),
                CeleryIntegration(monitor_beat_tasks=True),
                LoggingIntegration(
                    level=_logging.INFO,        # INFO va yuqori — breadcrumb sifatida
                    event_level=_logging.ERROR, # ERROR va yuqori — Sentry event sifatida
                ),
            ],
            # Performance monitoring — har 10 ta requestdan 1 tasi
            traces_sample_rate=0.1,
            # Profiling — kerak bo'lsa 0.0 dan 1.0 gacha
            profiles_sample_rate=0.0,
            # ── XAVFSIZLIK ─────────────────────────────────────────────────────
            # PII (Personal Identifiable Information) yuborilmaydi:
            #   • Cookie'lar (refresh token!) tashlanadi
            #   • Authorization header tashlanadi
            #   • Foydalanuvchi telefon raqami / parol maydonlari tashlanadi
            send_default_pii=False,
            # ── Environment / Release ──────────────────────────────────────────
            environment='production',
            release=os.getenv('GIT_COMMIT_SHA', 'unknown'),
            # Hodisalar uchun maksimal request body — katta payload'lar tashlanadi
            max_request_body_size='small',
        )
    except ImportError:
        # sentry-sdk o'rnatilmagan — log faylga yozamiz, lekin server ishlaydi
        import logging as _logging
        _logging.getLogger(__name__).warning(
            'SENTRY_DSN o\'rnatilgan, lekin sentry-sdk o\'rnatilmagan. '
            "pip install 'sentry-sdk[django]'"
        )
