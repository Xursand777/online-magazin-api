from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView, SendOTPView, VerifyOTPView, LoginView, PasswordLoginView,
    UserProfileView, AddressListCreateView, AddressDetailView, FeedbackCreateView
)

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/send-otp/', SendOTPView.as_view(), name='send_otp'),
    path('auth/verify-otp/', VerifyOTPView.as_view(), name='verify_otp'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/login-password/', PasswordLoginView.as_view(), name='login_password'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('addresses/', AddressListCreateView.as_view(), name='address_list_create'),
    path('addresses/<int:pk>/', AddressDetailView.as_view(), name='address_detail'),
    path('feedback/', FeedbackCreateView.as_view(), name='feedback'),
]
