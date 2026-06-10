import os
import sys
import django

sys.path.append(os.path.abspath('/Users/xursand/Online Magazin API/backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from orders.serializers import QuickOrderSerializer

data = {
    "product_id": 1,
    "receiver_name": "Test User",
    "receiver_phone": "+998901234567",
    "delivery_address": "Test Address",
    "payment_method": "cash"
}

serializer = QuickOrderSerializer(data=data)
if serializer.is_valid():
    print("VALID:", serializer.validated_data)
else:
    print("INVALID:", serializer.errors)
