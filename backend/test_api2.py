import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from users.models import User
from orders.views import OrderFromCartView
from cart.models import Cart, CartItem
from products.models import Product
from django.test import RequestFactory
from rest_framework.test import force_authenticate

user = User.objects.filter(is_master=False).first()

# Give user a product in cart
cart, _ = Cart.objects.get_or_create(user=user)
product = Product.objects.first()
CartItem.objects.get_or_create(cart=cart, product=product, defaults={'quantity': 1})

factory = RequestFactory()
request = factory.post('/api/orders/from-cart/', {
    'receiver_name': 'Test',
    'receiver_phone': '998901234567',
    'delivery_address': 'Test Address',
    'payment_method': 'cash'
}, content_type='application/json')
force_authenticate(request, user=user)

view = OrderFromCartView.as_view()
response = view(request)
print("Status:", response.status_code)
print("Response:", response.data)
