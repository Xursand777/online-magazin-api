import os
import re

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.health import HealthCheckView
from core.views import MobileConfigView

urlpatterns = [
    # ── Health check (external monitoring) ───────────────────────────────────
    # UptimeRobot, Render Health Check, Kubernetes liveness/readiness uchun.
    #   GET /healthz/         → shallow (faqat process tirik)
    #   GET /healthz/?deep=1  → deep (DB + Cache tekshiruvi)
    # Public, authsiz. Rate limit qo'llanmaydi (DRF view emas).
    path('healthz/', HealthCheckView.as_view(), name='healthz'),

    # Admin yo'li sozlanadigan (production'da DJANGO_ADMIN_URL bilan maxfiy qilinadi)
    path(settings.ADMIN_URL, admin.site.urls),

    # ── Phase 1.2: App version check ─────────────────────────────────────────
    # Mobil ilova ochilganda chaqiriladi. Min versiya, maintenance rejimi va
    # store URL'ini qaytaradi. 5 daqiqa cache'lanadi.
    path('api/app-config/', MobileConfigView.as_view(), name='app_config'),

    # API Endpoints
    path('api/', include('users.urls')),
    path('api/', include('products.urls')),
    path('api/cart/', include('cart.urls')),
    path('api/orders/', include('orders.urls')),
]

# Swagger/Schema hujjatlari — faqat ENABLE_API_DOCS yoqilganda (default: dev'da)
if settings.ENABLE_API_DOCS:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    ]

# Media fayllarini doimo serve qilamiz (dev + production).
# Muhim: Django'ning static() faqat DEBUG=True'da ishlaydi.
# Shuning uchun django.views.static.serve ni bevosita ishlatamiz —
# bu production'da ham ishlaydi (Render free tier, nginx yo'q).
# CDN_PROVIDER='b2' yoki 'cloudinary' bo'lganda MEDIA_URL CDN'ga ko'rsatadi,
# shuning uchun ushbu pattern faqat 'local' rejimda kerak.
if os.getenv('CDN_PROVIDER', 'local') == 'local':
    media_url = settings.MEDIA_URL.lstrip('/')
    urlpatterns += [
        re_path(
            r'^%s(?P<path>.*)$' % re.escape(media_url),
            serve,
            {'document_root': settings.MEDIA_ROOT},
        ),
    ]
