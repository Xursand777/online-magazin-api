from django.urls import path
from .views import (
    AdminOrderListView,
    AdminOrderStatusUpdateView,
    AdminReportView,
    QuickOrderView,
    OrderFromCartView,
    OrderListView,
    OrderDetailView,
    UserCancelOrderView,
)

urlpatterns = [
    path('admin/', AdminOrderListView.as_view(), name='admin_order_list'),
    path('admin/<int:pk>/status/', AdminOrderStatusUpdateView.as_view(), name='admin_order_status_update'),
    path('admin/report/', AdminReportView.as_view(), name='admin_order_report'),
    path('', OrderListView.as_view(), name='order_list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order_detail'),
    path('<int:pk>/cancel/', UserCancelOrderView.as_view(), name='order_cancel'),
    path('quick/', QuickOrderView.as_view(), name='quick_order'),
    path('from-cart/', OrderFromCartView.as_view(), name='order_from_cart'),
]
