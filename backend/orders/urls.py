from django.urls import path
from .views import (
    AdminCreditPayView,
    AdminCustomerHistoryView,
    AdminDashboardView,
    AdminDisputeDetailView,
    AdminDisputeListView,
    AdminOrderListView,
    AdminOrderStatusUpdateView,
    AdminPOSOrderView,
    AdminReportView,
    CourierConfirmDeliveryView,
    CustomerCreateDisputeView,
    CustomerOrderDisputesView,
    QuickOrderView,
    OrderFromCartView,
    OrderListView,
    OrderDetailView,
    UserCancelOrderView,
    UserCreditStatusView,
    KassaView,
    KassaWithdrawView,
)

urlpatterns = [
    path('admin/dashboard/', AdminDashboardView.as_view(), name='admin_dashboard'),
    path('admin/', AdminOrderListView.as_view(), name='admin_order_list'),
    path('admin/<int:pk>/status/', AdminOrderStatusUpdateView.as_view(), name='admin_order_status_update'),
    path('admin/<int:pk>/pay-credit/', AdminCreditPayView.as_view(), name='admin_credit_pay'),
    path('admin/report/', AdminReportView.as_view(), name='admin_order_report'),
    path('admin/pos-order/', AdminPOSOrderView.as_view(), name='admin_pos_order'),
    path('admin/customer-history/', AdminCustomerHistoryView.as_view(), name='admin_customer_history'),
    path('admin/kassa/', KassaView.as_view(), name='admin_kassa_stats'),
    path('admin/kassa/withdraw/', KassaWithdrawView.as_view(), name='admin_kassa_withdraw'),
    path('credit-status/', UserCreditStatusView.as_view(), name='user_credit_status'),
    path('', OrderListView.as_view(), name='order_list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order_detail'),
    path('<int:pk>/cancel/', UserCancelOrderView.as_view(), name='order_cancel'),
    # Phase 2.4 — Kuryer qabul kodi + rasm + GPS bilan yetkazib berishni tasdiqlaydi
    path('<int:pk>/courier-confirm/', CourierConfirmDeliveryView.as_view(), name='order_courier_confirm'),
    # Phase 2.6 — Mijoz shikoyati (Order dispute)
    path('<int:pk>/dispute/', CustomerCreateDisputeView.as_view(), name='order_dispute_create'),
    path('<int:pk>/disputes/', CustomerOrderDisputesView.as_view(), name='order_disputes_list'),
    # Phase 2.6 — Admin disput boshqaruvi
    path('admin/disputes/', AdminDisputeListView.as_view(), name='admin_disputes_list'),
    path('admin/disputes/<int:pk>/', AdminDisputeDetailView.as_view(), name='admin_dispute_detail'),
    path('quick/', QuickOrderView.as_view(), name='quick_order'),
    path('from-cart/', OrderFromCartView.as_view(), name='order_from_cart'),
]
