import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from orders.views import QuickOrderView
from products.models import Product
from rest_framework.test import force_authenticate

User = get_user_model()
user = User.objects.filter(is_master=False).first()

if not user:
    print("No normal user found.")
else:
    print(f"Testing with normal user: {user.phone}, is_master: {user.is_master}")
    
    product = Product.objects.first()

    factory = RequestFactory()
    request = factory.post('/api/orders/quick/', {
        'product_id': product.id,
        'quantity': 1,
        'receiver_name': 'Test User',
        'receiver_phone': '+998901234567',
        'delivery_address': 'Test Address',
        'payment_method': 'cash'
    }, content_type='application/json')
    force_authenticate(request, user=user)

    view = QuickOrderView.as_view()
    try:
        response = view(request)
        print(f"Status code: {response.status_code}")
        print(f"Response: {response.data}")
    except Exception as e:
        print(f"Exception: {e}")

