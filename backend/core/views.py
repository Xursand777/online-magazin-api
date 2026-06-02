"""
core/views.py — App-wide views (mobil ilova sozlamalari va h.k.).

MobileConfigView — Phase 1.2 endpoint, mobil ilova ochilganda chaqiriladi.
"""
from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import MOBILE_CONFIG_CACHE_KEY, MobileConfig


class MobileConfigView(views.APIView):
    """
    GET /api/app-config/?platform=android

    Mobil ilova bu endpoint ni darhol ochilganda chaqiradi.
    Javob orqali:
      • Joriy versiya kifoyalanyaptimi (min_version solishtiruv mobile tomonda)
      • Maintenance mode aktivmi
      • "Yangilash" ekrani uchun matn (3 tilda) va store URL

    QUERY PARAMS:
      platform: 'android' (default) yoki 'ios'

    CACHING:
      5 daqiqa server-side cache (cache_page decorator).
      Admin sozlamani o'zgartirsa, MobileConfig.save() cache'ni darhol tozalaydi.

    AUTH:
      AllowAny — bu endpoint login'gacha chaqirilishi mumkin (yangilashga undash
      login ekranidan oldin sodir bo'ladi).

    THROTTLING:
      Mobil ilova har 5 daqiqada bir marta chaqiradi — yuk minimal.
      Lekin DRF default throttle qo'llanadi (anon: 200/soat).
    """

    permission_classes = (AllowAny,)
    authentication_classes = ()  # Auth tekshiruvi shart emas

    @method_decorator(cache_page(300, key_prefix='mobile_config'))
    def get(self, request, *args, **kwargs):
        platform = (request.query_params.get('platform') or 'android').lower()
        if platform not in ('android', 'ios'):
            platform = 'android'

        config = MobileConfig.load()

        if platform == 'android':
            min_version = config.min_android_version
            latest_version = config.latest_android_version
            store_url = config.play_store_url
        else:
            min_version = config.min_ios_version
            latest_version = config.latest_ios_version
            store_url = config.app_store_url

        data = {
            'platform': platform,
            'min_version': min_version,
            'latest_version': latest_version,
            'store_url': store_url,
            'force_update_message': {
                'uz': config.force_update_message_uz,
                'ru': config.force_update_message_ru,
                'en': config.force_update_message_en,
            },
            'maintenance_mode': config.maintenance_mode,
            'maintenance_message': (
                {
                    'uz': config.maintenance_message_uz,
                    'ru': config.maintenance_message_ru,
                    'en': config.maintenance_message_en,
                }
                if config.maintenance_mode
                else None
            ),
        }
        return Response(data)
