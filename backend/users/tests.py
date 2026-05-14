from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()
FAKE_OTP_CODE = "121212"


class AuthOtpFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create(
            phone="+998901234567",
            username="+998901234567",
            is_active=False,
            is_verified=False,
        )
        self.user.set_password("StrongPass123!")
        self.user.save()

    def test_login_request_returns_debug_code(self):
        response = self.client.post(
            "/api/auth/login/",
            {"phone": "90 123 45 67"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["debug_code"], FAKE_OTP_CODE)
        self.assertEqual(cache.get(f"otp_{self.user.phone}"), FAKE_OTP_CODE)

    def test_verify_otp_accepts_fixed_fake_code(self):
        response = self.client.post(
            "/api/auth/verify-otp/",
            {"phone": "90 123 45 67", "code": FAKE_OTP_CODE},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertTrue(self.user.is_verified)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
