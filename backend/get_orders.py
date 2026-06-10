import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from orders.models import Order
for o in Order.objects.order_by('-id')[:10]:
    user_phone = o.user.phone if o.user else 'Guest'
    is_master = o.user.is_master if o.user else False
    print(f"ID: {o.id}, User: {user_phone}, is_master: {is_master}, payment: {o.payment_method}, is_credit: {o.is_credit}")
