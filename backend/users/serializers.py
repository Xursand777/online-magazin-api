from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.tokens import RefreshToken
from .models import UserProfile, Address, Feedback
from .utils import normalize_phone_number, phone_lookup_variants

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)
    terms_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = ('phone', 'password', 'confirm_password', 'terms_accepted')

    def validate_phone(self, value):
        normalized = normalize_phone_number(value)
        if User.objects.filter(phone__in=phone_lookup_variants(normalized)).exists():
            raise serializers.ValidationError("User with this phone already exists.")
        return normalized

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"password": "Passwords must match."})
        if not attrs.get('terms_accepted'):
            raise serializers.ValidationError({"terms_accepted": "You must accept the terms."})
        return attrs

    def create(self, validated_data):
        user = User.objects.create(
            phone=validated_data['phone'],
            username=validated_data['phone'], # fallback
            is_active=False # Becomes active after OTP verification
        )
        user.set_password(validated_data['password'])
        user.save()
        # Initialize default profile
        UserProfile.objects.get_or_create(user=user)
        return user

class LoginRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)

    def validate_phone(self, value):
        return normalize_phone_number(value)

class PasswordLoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True)

    def validate_phone(self, value):
        return normalize_phone_number(value)

class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    code = serializers.CharField(max_length=6)

    def validate_phone(self, value):
        return normalize_phone_number(value)

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
