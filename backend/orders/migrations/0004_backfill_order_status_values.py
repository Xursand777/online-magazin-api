from django.db import migrations


ORDER_STATUS_MAP = {
    'new': 'PENDING',
    'accepted': 'CONFIRMED',
    'preparing': 'PACKING',
    'delivering': 'SHIPPING',
    'delivered': 'DELIVERED',
    'cancelled': 'CANCELLED_BY_ADMIN',
}

PAYMENT_STATUS_MAP = {
    'pending': 'PENDING',
    'completed': 'PAID',
    'failed': 'FAILED',
    'refunded': 'REFUNDED',
}


def forwards(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    Payment = apps.get_model('orders', 'Payment')

    for old_value, new_value in ORDER_STATUS_MAP.items():
        Order.objects.filter(status=old_value).update(status=new_value)

    for old_value, new_value in PAYMENT_STATUS_MAP.items():
        Payment.objects.filter(status=old_value).update(status=new_value)


def backwards(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    Payment = apps.get_model('orders', 'Payment')

    reverse_order_map = {new: old for old, new in ORDER_STATUS_MAP.items()}
    reverse_payment_map = {new: old for old, new in PAYMENT_STATUS_MAP.items()}

    for new_value, old_value in reverse_order_map.items():
        Order.objects.filter(status=new_value).update(status=old_value)

    for new_value, old_value in reverse_payment_map.items():
        Payment.objects.filter(status=new_value).update(status=old_value)


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0003_order_cancellation_reason_order_cancelled_at_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
