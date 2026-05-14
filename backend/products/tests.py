import json
import shutil
import tempfile
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import User
from .models import Category, HomeBanner, Product, ProductImage, ProductVariant


TEST_MEDIA_ROOT = tempfile.mkdtemp()


def make_test_image(name='test.gif'):
    return SimpleUploadedFile(
        name,
        (
            b'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!'
            b'\xf9\x04\x01\x0a\x00\x01\x00,\x00\x00\x00\x00\x01\x00\x01\x00'
            b'\x00\x02\x02L\x01\x00;'
        ),
        content_type='image/gif',
    )


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class AdminProductApiTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.admin_user = User.objects.create(
            phone='+998900000001',
            username='+998900000001',
            is_staff=True,
            is_superuser=True,
            is_active=True,
        )
        self.admin_user.set_password('secret123')
        self.admin_user.save()
        self.client.force_authenticate(self.admin_user)

        self.category = Category.objects.create(name='Telefonlar')
        self.product = Product.objects.create(
            category=self.category,
            name='Galaxy S24',
            description='Eski tavsif',
            price=Decimal('14000000.00'),
            discount_price=Decimal('13500000.00'),
            stock=8,
            is_active=True,
            is_new=True,
            is_popular=False,
        )
        ProductImage.objects.create(product=self.product, image=make_test_image('old.gif'), is_main=True, order=0)
        self.variant = ProductVariant.objects.create(
            product=self.product,
            color='Qora',
            color_hex='#111827',
            quality='Original',
            model='Base',
            size='256GB',
            price=Decimal('14100000.00'),
            discount_price=Decimal('13850000.00'),
            cost_price=Decimal('12000000.00'),
            stock=4,
            sku='SKU-OLD',
            barcode='1234567890123',
            position=0,
        )

    def test_admin_can_update_all_product_fields_and_variants(self):
        url = reverse('admin-product-detail', args=[self.product.id])
        payload = {
            'name': 'Galaxy S24 Ultra',
            'description': 'Yangilangan tavsif',
            'price': '15000000',
            'discount_price': '',
            'stock': '12',
            'category': '',
            'is_active': 'false',
            'is_new': 'false',
            'is_popular': 'true',
            'remove_image': 'true',
            'variants_data': json.dumps([
                {
                    'id': self.variant.id,
                    'color': 'Oq',
                    'color_hex': '#f8fafc',
                    'quality': 'Premium',
                    'model': 'Plus',
                    'size': '512GB',
                    'price': '15250000',
                    'discount_price': '14900000',
                    'cost_price': '12100000',
                    'stock': 6,
                    'sku': 'SKU-NEW',
                    'barcode': '9988123412345',
                    'position': 1,
                },
                {
                    'color': 'Ko\'k',
                    'color_hex': '#2563eb',
                    'quality': 'OEM',
                    'model': 'Lite',
                    'size': '256GB',
                    'price': '14800000',
                    'cost_price': '11600000',
                    'stock': 3,
                    'sku': 'SKU-BLUE',
                    'barcode': '9988123412346',
                    'position': 2,
                },
            ]),
            'variant_image_0': make_test_image('variant.gif'),
        }

        response = self.client.patch(url, payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.variant.refresh_from_db()

        self.assertEqual(self.product.name, 'Galaxy S24 Ultra')
        self.assertEqual(self.product.description, 'Yangilangan tavsif')
        self.assertEqual(str(self.product.price), '15000000.00')
        self.assertIsNone(self.product.discount_price)
        self.assertFalse(self.product.is_discount)
        self.assertEqual(self.product.stock, 12)
        self.assertIsNone(self.product.category)
        self.assertFalse(self.product.is_active)
        self.assertFalse(self.product.is_new)
        self.assertTrue(self.product.is_popular)
        self.assertEqual(self.product.slug, 'galaxy-s24-ultra')
        self.assertEqual(self.product.images.count(), 0)

        self.assertEqual(self.product.variants.count(), 2)
        self.assertEqual(self.variant.color, 'Oq')
        self.assertEqual(self.variant.color_hex, '#f8fafc')
        self.assertTrue(self.variant.image.name.endswith('variant.gif'))
        self.assertEqual(self.variant.quality, 'Premium')
        self.assertEqual(self.variant.model, 'Plus')
        self.assertEqual(self.variant.size, '512GB')
        self.assertEqual(str(self.variant.price), '15250000.00')
        self.assertEqual(str(self.variant.discount_price), '14900000.00')
        self.assertEqual(str(self.variant.cost_price), '12100000.00')
        self.assertEqual(self.variant.stock, 6)
        self.assertEqual(self.variant.sku, 'SKU-NEW')
        self.assertEqual(self.variant.barcode, '9988123412345')
        self.assertEqual(self.variant.position, 1)
        self.assertTrue(
            self.product.variants.filter(
                sku='SKU-BLUE',
                color_hex='#2563eb',
                quality='OEM',
                cost_price=Decimal('11600000.00'),
            ).exists()
        )

    def test_admin_update_rejects_invalid_discount_price(self):
        url = reverse('admin-product-detail', args=[self.product.id])

        response = self.client.patch(
            url,
            {
                'price': '10000000',
                'discount_price': '10000000',
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('discount_price', response.data)

    def test_public_search_returns_matching_products_with_required_fields(self):
        Product.objects.create(
            category=self.category,
            name='Samsung S26 Ultra',
            description='Samsung flagman telefon',
            price=Decimal('14000000.00'),
            stock=5,
            is_active=True,
            is_popular=True,
        )

        self.client.force_authenticate(user=None)
        response = self.client.get(reverse('product_search'), {'q': 'Samsung'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

        first_item = response.data[0]
        self.assertIn('id', first_item)
        self.assertIn('name', first_item)
        self.assertIn('category_name', first_item)
        self.assertIn('price', first_item)
        self.assertEqual(first_item['category_name'], 'Telefonlar')

    def test_public_similar_products_prioritizes_brand_model_and_category(self):
        source = Product.objects.create(
            category=self.category,
            name='iPhone 17 Pro Max',
            description='Apple flagman smartfoni, titanium korpus va kuchli kamera',
            price=Decimal('16000000.00'),
            discount_price=Decimal('15500000.00'),
            stock=4,
            is_active=True,
            is_popular=True,
        )
        Product.objects.create(
            category=self.category,
            name='Apple iPhone 16 Pro Max',
            description='iPhone Pro Max seriyasi',
            price=Decimal('15000000.00'),
            stock=5,
            is_active=True,
            is_popular=True,
        )
        Product.objects.create(
            category=self.category,
            name='iPhone 15 Plus',
            description='Apple iPhone telefoni',
            price=Decimal('12800000.00'),
            stock=6,
            is_active=True,
        )
        Product.objects.create(
            category=self.category,
            name='Samsung Galaxy S26 Ultra',
            description='Samsung flagman telefoni',
            price=Decimal('14000000.00'),
            stock=7,
            is_active=True,
            is_popular=True,
        )
        accessory_category = Category.objects.create(name='Quloqchin')
        Product.objects.create(
            category=accessory_category,
            name='Simsiz quloqchin Marshall Major V Black',
            description='Quloqchin',
            price=Decimal('1950000.00'),
            stock=3,
            is_active=True,
        )

        self.client.force_authenticate(user=None)
        response = self.client.get(reverse('product_similar_list', args=[source.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item['name'] for item in response.data]

        self.assertNotIn(source.name, names)
        self.assertEqual(names[:2], ['Apple iPhone 16 Pro Max', 'iPhone 15 Plus'])
        self.assertIn('Samsung Galaxy S26 Ultra', names)
        self.assertNotIn('Simsiz quloqchin Marshall Major V Black', names[:3])

    def test_admin_can_create_home_banner_and_public_main_returns_it(self):
        url = reverse('admin-banner-list')
        payload = {
            'title': 'Xiaomi Redmi Note 15',
            'subtitle': 'Yangi aksiya uchun asosiy reklama banneri',
            'product': str(self.product.id),
            'original_price': '15000000',
            'discount_price': '13500000',
            'background_color': '#111827',
            'accent_color': '#007a4d',
            'button_label': "Mahsulotni ko'rish",
            'order': '1',
            'is_active': 'true',
            'product_image': make_test_image('banner-product.gif'),
            'background_image': make_test_image('banner-bg.gif'),
        }

        response = self.client.post(url, payload, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HomeBanner.objects.count(), 1)

        self.client.force_authenticate(user=None)
        main_response = self.client.get(reverse('main_page'))

        self.assertEqual(main_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(main_response.data['banners']), 1)
        banner = main_response.data['banners'][0]
        self.assertEqual(banner['title'], 'Xiaomi Redmi Note 15')
        self.assertEqual(banner['target_url'], f"/products/{self.product.id}")
        self.assertTrue(banner['product_image_url'].startswith('http://testserver/media/'))
        self.assertTrue(banner['background_image_url'].startswith('http://testserver/media/'))

    def test_public_main_excludes_inactive_or_expired_banners(self):
        HomeBanner.objects.create(
            title='Faol banner',
            subtitle="Ko'rinishi kerak",
            product=self.product,
            is_active=True,
            order=1,
        )
        HomeBanner.objects.create(
            title='Eski banner',
            subtitle="Ko'rinmasligi kerak",
            product=self.product,
            is_active=True,
            end_date=timezone.now() - timezone.timedelta(days=1),
            order=2,
        )
        HomeBanner.objects.create(
            title='Passiv banner',
            product=self.product,
            is_active=False,
            order=3,
        )

        self.client.force_authenticate(user=None)
        response = self.client.get(reverse('main_page'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['title'] for item in response.data['banners']], ['Faol banner'])
