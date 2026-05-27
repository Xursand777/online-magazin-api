from datetime import datetime, timezone as dt_tz

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class RoleAwareJWTAuthentication(JWTAuthentication):
    """
    Standart SimpleJWT autentifikatsiyasini kengaytiradi.

    Xavfsizlik qatlami:
    - Token chiqarilgan vaqt (iat) < role_invalidated_at bo'lsa → 401 qaytaradi.
    - Bu xodimni "o'chirish" (roldan mahrum qilish) paytida barcha eski
      tokenlarini darhol bekor qiladi, ular muddati tugamaguncha ham.
    - JWT tokenni HttpOnly cookie orqali ham qabul qiladi (XSS ga qarshi).
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            raw_token = request.COOKIES.get('access')
        else:
            raw_token = self.get_raw_token(header)

        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        invalidated_at = getattr(user, 'role_invalidated_at', None)
        if invalidated_at is None:
            return user

        iat = validated_token.get('iat')
        if iat is None:
            return user

        try:
            token_issued = datetime.fromtimestamp(int(iat), tz=dt_tz.utc)

            # invalidated_at timezone-aware ekanini kafolatlaymiz
            if invalidated_at.tzinfo is None:
                from django.utils import timezone
                invalidated_at = invalidated_at.replace(tzinfo=dt_tz.utc)

            if token_issued < invalidated_at:
                raise AuthenticationFailed(
                    detail={
                        'code': 'role_invalidated',
                        'detail': "Sizning ruxsatingiz o'zgartirildi. Qayta kiring.",
                    }
                )
        except (TypeError, ValueError, OSError):
            pass

        return user
