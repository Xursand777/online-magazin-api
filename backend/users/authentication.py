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
    """

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
