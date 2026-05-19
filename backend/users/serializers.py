from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.tokens import RefreshToken
from .models import UserProfile, Address, Feedback
from .utils import normalize_phone_number, phone_lookup_variants

User = get_user_model()

def _validate_and_normalize_phone(value: str) -> str:
    """
    Telefon raqamni tekshiradi va +998XXXXXXXXX formatiga keltiradi.
    Noto'g'ri formatda bo'lsa ValidationError beradi.
    """
    from .utils import normalize_phone_number, is_valid_uz_phone
    normalized = normalize_phone_number(value)
    if not is_valid_uz_phone(normalized):
        raise serializers.ValidationError(
            "Telefon raqam noto'g'ri. +998 bilan boshlanuvchi 9 ta raqam kiriting. "
            "Masalan: +998 90 123 45 67"
        )
    return normalized


class RegisterSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)
    terms_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = ('phone', 'password', 'confirm_password', 'terms_accepted')

    def validate_phone(self, value):
        normalized = _validate_and_normalize_phone(value)
        if User.objects.filter(phone=normalized).exists():
            raise serializers.ValidationError(
                "Bu telefon raqam allaqachon ro'yxatdan o'tgan. Kirish sahifasiga o'ting."
            )
        return normalized

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"password": "Parollar mos kelmadi."})
        if not attrs.get('terms_accepted'):
            raise serializers.ValidationError({"terms_accepted": "Shartlarga rozilik bildiring."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        validated_data.pop('terms_accepted')
        phone = validated_data['phone']  # already +998XXXXXXXXX
        user = User.objects.create(
            phone=phone,
            username=phone,
            is_active=False,
        )
        user.set_password(validated_data['password'])
        user.save()
        UserProfile.objects.get_or_create(user=user)
        return user


class LoginRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value):
        return _validate_and_normalize_phone(value)


class PasswordLoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True)

    def validate_phone(self, value):
        return _validate_and_normalize_phone(value)


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=6)

    def validate_phone(self, value):
        return _validate_and_normalize_phone(value)

class UserProfileSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(source='user.phone', read_only=True)
    first_name = serializers.CharField(source='user.first_name', required=False)
    last_name = serializers.CharField(source='user.last_name', required=False)

    class Meta:
        model = UserProfile
        fields = ('phone', 'first_name', 'last_name', 'avatar', 'birth_date', 'gender', 'language')

class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ('id', 'title', 'city', 'district', 'street', 'latitude', 'longitude', 'is_default')

class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = ('id', 'message', 'status', 'created_at')
        read_only_fields = ('status', 'created_at')
