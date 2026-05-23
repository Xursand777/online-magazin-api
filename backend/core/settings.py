"""
Django settings for Bozor e-commerce platform.
"""
from pathlib import Path
import os
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# ─────────────────────────────────────────────────────────────────────────────
# MUHIT (Environment)
# ─────────────────────────────────────────────────────────────────────────────
# Production'da .env yoki server env vars orqali quyidagilarni o'rnating:
#   DJANGO_DEBUG=False
#   DJANGO_SECRET_KEY=<yangi_kalit>
#   DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
#   CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

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
    'corsheaders.middleware.CorsMiddleware',        # SecurityMiddleware'dan keyin bo'lishi shart
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
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
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
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
# STATIK VA MEDIA FAYLLAR
# ─────────────────────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─────────────────────────────────────────────────────────────────────────────
# CDN — Rasm va Fayl Xizmati
# ─────────────────────────────────────────────────────────────────────────────
# CDN_PROVIDER qiymatlari:
#   'local'      — serverning o'z diski (default, development)
#   'cloudinary' — Cloudinary CDN (production uchun tavsiya etiladi)
#
# Cloudinary bepul reja: 25GB saqlash + 25GB o'tkazish/oy
# Hisob oching: https://cloudinary.com/users/register/free

CDN_PROVIDER = os.getenv('CDN_PROVIDER', 'local')

if CDN_PROVIDER == 'cloudinary':
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
        # Fayllar `bozor/` papkasiga yuklanadi (Cloudinary Media Library'da tartibli ko'rinadi)
        'MEDIA_TAG':  'bozor',
        # Yuklangan fayllarni avtomatik optimallashtirish
        'MAGIC_FILE_PATH': 'cloudinary_storage/magic',
    }

    # Django barcha ImageField va FileField'larni Cloudinary'ga saqlaydi
    DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'

    # Cloudinary'dan static fayllar (kerak bo'lsa yoqish mumkin)
    # STATICFILES_STORAGE = 'cloudinary_storage.storage.StaticHashedCloudinaryStorage'

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
    'x-guest-session-id',  # Mehmon cart sessiyasi uchun
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
# DRF — Django REST Framework
# ─────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
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
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,   # Eski refresh token qayta ishlatilmaydi
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'ALGORITHM': 'HS256',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

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
