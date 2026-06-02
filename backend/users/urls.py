from django.urls import path
from .views import (
    RegisterView, SendOTPView, VerifyOTPView, LoginView, PasswordLoginView,
    CookieTokenRefreshView, CookieLogoutView,
    UserProfileView, AddressListCreateView, AddressDetailView, FeedbackCreateView,
    AdminUserSearchView, AdminUserListView, AdminUserDetailView,
    AdminUserToggleBanView, AdminUserToggleActiveView,
    AdminFeedbackListView, AdminFeedbackUpdateView,
    StaffListView, AssignRoleView, FireStaffView,
    MasterListView, AssignMasterView, RemoveMasterView, AdminMasterDiscountView,
    MasterStatusView,
    AuditLogListView,  # Phase 1.1
)

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/send-otp/', SendOTPView.as_view(), name='send_otp'),
    path('auth/verify-otp/', VerifyOTPView.as_view(), name='verify_otp'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/login-password/', PasswordLoginView.as_view(), name='login_password'),
    # Refresh token cookie'dan o'qiladi (httpOnly) — body'dan emas
    path('auth/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    # Logout: cookie blacklist'ga qo'shiladi va o'chiriladi
    path('auth/logout/', CookieLogoutView.as_view(), name='token_logout'),

    path('profile/', UserProfileView.as_view(), name='profile'),
    path('master/status/', MasterStatusView.as_view(), name='master_status'),
    path('addresses/', AddressListCreateView.as_view(), name='address_list_create'),
    path('addresses/<int:pk>/', AddressDetailView.as_view(), name='address_detail'),
    path('feedback/', FeedbackCreateView.as_view(), name='feedback'),
    path('admin-search/', AdminUserSearchView.as_view(), name='admin_user_search'),

    path('admin/users/', AdminUserListView.as_view(), name='admin_user_list'),
    path('admin/users/<int:pk>/', AdminUserDetailView.as_view(), name='admin_user_detail'),
    path('admin/users/<int:pk>/toggle-ban/', AdminUserToggleBanView.as_view(), name='admin_user_toggle_ban'),
    path('admin/users/<int:pk>/toggle-active/', AdminUserToggleActiveView.as_view(), name='admin_user_toggle_active'),

    path('admin/feedback/', AdminFeedbackListView.as_view(), name='admin_feedback_list'),
    path('admin/feedback/<int:pk>/', AdminFeedbackUpdateView.as_view(), name='admin_feedback_update'),

    # Xodim boshqaruvi (faqat Super Admin)
    path('admin/staff/', StaffListView.as_view(), name='admin_staff_list'),
    path('admin/staff/assign-role/', AssignRoleView.as_view(), name='admin_assign_role'),
    path('admin/staff/<int:pk>/fire/', FireStaffView.as_view(), name='admin_fire_staff'),

    # Usta boshqaruvi (faqat Super Admin)
    path('admin/masters/', MasterListView.as_view(), name='admin_master_list'),
    path('admin/masters/assign/', AssignMasterView.as_view(), name='admin_assign_master'),
    path('admin/masters/discount/', AdminMasterDiscountView.as_view(), name='admin_master_discount'),
    path('admin/masters/<int:pk>/remove/', RemoveMasterView.as_view(), name='admin_remove_master'),

    # Phase 1.1 — AuditLog ko'rish (faqat Super Admin)
    path('admin/audit-logs/', AuditLogListView.as_view(), name='admin_audit_logs'),
]
