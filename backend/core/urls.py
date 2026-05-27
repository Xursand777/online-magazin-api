from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # Admin yo'li sozlanadigan (production'da DJANGO_ADMIN_URL bilan maxfiy qilinadi)
    path(settings.ADMIN_URL, admin.site.urls),

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

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
