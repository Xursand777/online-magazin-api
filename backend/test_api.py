import requests
import json
import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from users.models import User
from rest_framework.authtoken.models import Token

user = User.objects.filter(is_master=False).first()
token, _ = Token.objects.get_or_create(user=user)

headers = {'Authorization': f'Token {token.key}', 'Content-Type': 'application/json'}
data = {
    'receiver_name': 'Test',
    'receiver_phone': '998901234567',
    'delivery_address': 'Test Address',
    'payment_method': 'cash'
}
response = requests.post('http://127.0.0.1:8000/api/orders/from-cart/', headers=headers, json=data)
print("Status:", response.status_code)
print("Response:", response.text)
