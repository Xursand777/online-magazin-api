from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from orders.models import Order, OrderHistory, Payment
from orders.services import create_order_with_items
from products.models import Product


User = get_user_model()


class OrderFlowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='+998901111111',
            phone='+998901111111',
            password='StrongPass123',
        )
        self.admin = User.objects.create_user(
            username='+998902222222',
            phone='+998902222222',
            password='StrongPass123',
            is_staff=True,
            is_superuser=True,
        )
        self.product = Product.objects.create(name='Test Phone', price='1000000', stock=8, is_active=True)

    def test_create_order_from_cart_reserves_stock_and_history(self):
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=2)

        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse('order_from_cart'),
            {
                'receiver_name': 'Ali Valiyev',
                'receiver_phone': '+998901111111',
                'delivery_address': 'Samarkand, Registon 1',
                'payment_method': 'cash',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(pk=response.data['id'])

        self.product.refresh_from_db()
        cart.refresh_from_db()

        self.assertEqual(order.status, Order.STATUS_PENDING)
        self.assertEqual(self.product.stock, 6)
        self.assertEqual(cart.items.count(), 0)
        self.assertEqual(order.history.count(), 1)
        self.assertEqual(order.history.first().to_status, Order.STATUS_PENDING)
        self.assertEqual(order.payment.status, Payment.STATUS_PENDING)

    def test_admin_cancellation_restores_stock_and_refunds_paid_order(self):
        order = create_order_with_items(
            user=self.user,
            receiver_name='Ali Valiyev',
            receiver_phone='+998901111111',
            delivery_address='Samarkand, Registon 1',
            payment_method=Order.PAYMENT_METHOD_CARD,
            items=[{'product': self.product, 'quantity': 2}],
        )

        self.client.force_authenticate(self.admin)
        confirm_response = self.client.post(
            reverse('admin_order_status_update', kwargs={'pk': order.id}),
            {'status': Order.STATUS_CONFIRMED, 'note': "To'lov tasdiqlandi"},
            format='json',
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        cancel_response = self.client.post(
            reverse('admin_order_status_update', kwargs={'pk': order.id}),
            {'status': Order.STATUS_CANCELLED_BY_ADMIN, 'note': 'Omborda nuqson aniqlandi'},
            format='json',
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)

        order.refresh_from_db()
        self.product.refresh_from_db()
        order.payment.refresh_from_db()

        self.assertEqual(order.status, Order.STATUS_CANCELLED_BY_ADMIN)
        self.assertEqual(order.cancellation_reason, 'Omborda nuqson aniqlandi')
        self.assertEqual(self.product.stock, 8)
        self.assertEqual(order.payment.status, Payment.STATUS_REFUNDED)
        self.assertGreaterEqual(order.history.count(), 3)

    def test_pending_card_order_auto_cancels_after_timeout(self):
        order = create_order_with_items(
            user=self.user,
            receiver_name='Ali Valiyev',
            receiver_phone='+998901111111',
            delivery_address='Samarkand, Registon 1',
            payment_method=Order.PAYMENT_METHOD_CARD,
            items=[{'product': self.product, 'quantity': 1}],
        )
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(minutes=31))

        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('order_list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        order.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(order.status, Order.STATUS_SYSTEM_AUTO_CANCEL)
        self.assertEqual(self.product.stock, 8)
        self.assertTrue(
            OrderHistory.objects.filter(order=order, to_status=Order.STATUS_SYSTEM_AUTO_CANCEL).exists()
        )
