import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from orders.serializers import OrderFromCartSerializer

data = {
    'receiver_name': 'Test',
    'receiver_phone': '998901234567',
    'delivery_address': 'Test',
    'payment_method': 'cash'
}
s = OrderFromCartSerializer(data=data)
if s.is_valid():
    print("VALID:", s.validated_data)
else:
    print("ERRORS:", s.errors)
