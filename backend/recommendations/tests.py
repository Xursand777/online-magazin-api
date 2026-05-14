from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from products.models import Category, Product


class RecommendationFlowTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Telefonlar')
        self.samsung = Product.objects.create(
            category=self.category,
            name='Samsung S25 Ultra',
            description='Samsung flagman telefoni',
            price=Decimal('14000000.00'),
            stock=10,
            is_active=True,
            is_popular=True,
        )
        self.redmi = Product.objects.create(
            category=self.category,
            name='Redmi Note 15',
            description='Xiaomi Redmi smartfoni',
            price=Decimal('3200000.00'),
            stock=7,
            is_active=True,
        )

    def test_search_tracking_creates_guest_session_and_personalized_home_feed(self):
        response = self.client.get(reverse('product_search'), {'q': 'Samsung', 'track': 'true'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('X-Guest-Session-Id', response)

        guest_session_id = response['X-Guest-Session-Id']
        home_response = self.client.get(
            reverse('main_page'),
            HTTP_X_GUEST_SESSION_ID=guest_session_id,
        )

        self.assertEqual(home_response.status_code, status.HTTP_200_OK)
        self.assertEqual(home_response.data['recommended_title'], "Siz qidirganlarga o'xshash")
        self.assertGreaterEqual(len(home_response.data['recommended_products']), 1)
        self.assertIn(
            'Samsung',
            home_response.data['recommended_products'][0]['name'],
        )

    def test_live_search_without_tracking_does_not_create_guest_session(self):
        response = self.client.get(reverse('product_search'), {'q': 'Samsung', 'track': 'false'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('X-Guest-Session-Id', response)
