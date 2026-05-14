from django.urls import path
from .views import CartView, AddToCartView, UpdateCartItemView, SyncLocalCartView

urlpatterns = [
    path('', CartView.as_view(), name='cart_view'),
    path('items/', AddToCartView.as_view(), name='add_to_cart'),
    path('items/<int:pk>/', UpdateCartItemView.as_view(), name='update_delete_cart_item'),
    path('sync-local/', SyncLocalCartView.as_view(), name='sync_local_cart'),
]
