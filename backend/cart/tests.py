from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from products.models import Product, ProductImage


User = get_user_model()


class LocalCartSyncTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='+998903333333',
            phone='+998903333333',
            password='StrongPass123',
        )
        self.product = Product.objects.create(name='Cart Product', price='250000', stock=12, is_active=True)
        ProductImage.objects.create(
            product=self.product,
            image=SimpleUploadedFile(
                'cart-test.gif',
                (
                    b'GIF89a\x01\x00\x01\x00\x80\x00\x00'
                    b'\x00\x00\x00\xff\xff\xff!\xf9\x04\x01'
                    b'\x00\x00\x00\x00,\x00\x00\x00\x00\x01'
                    b'\x00\x01\x00\x00\x02\x02D\x01\x00;'
                ),
                content_type='image/gif',
            ),
            is_main=True,
        )

    def test_sync_local_cart_moves_items_into_backend_cart(self):
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=1)

        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse('sync_local_cart'),
            {
                'items': [
                    {
                        'product_id': self.product.id,
                        'quantity': 2,
                    }
                ]
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cart.refresh_from_db()
        item = cart.items.get(product=self.product)
        self.assertEqual(item.quantity, 3)
        self.assertEqual(response.data['synced_count'], 1)

    def test_add_to_cart_response_contains_absolute_product_image_url(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse('add_to_cart'),
            {
                'product_id': self.product.id,
                'quantity': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        image_url = response.data['items'][0]['product_details']['main_image']
        self.assertTrue(image_url.startswith('http://testserver/media/'))

    def test_cart_total_falls_back_to_price_when_discount_price_missing(self):
        Product.objects.filter(pk=self.product.pk).update(is_discount=True, discount_price=None)
        self.product.refresh_from_db()
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=self.product, quantity=2)

        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('cart_view'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_price'], self.product.price * 2)

    def test_add_to_cart_rejects_quantity_above_stock(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse('add_to_cart'),
            {
                'product_id': self.product.id,
                'quantity': self.product.stock + 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_update_cart_item_rejects_quantity_above_stock(self):
        cart = Cart.objects.create(user=self.user)
        item = CartItem.objects.create(cart=cart, product=self.product, quantity=1)

        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse('update_delete_cart_item', kwargs={'pk': item.id}),
            {'quantity': self.product.stock + 1},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
