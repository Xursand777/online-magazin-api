import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import OrderHistory
from .sms import send_order_status_sms_async

logger = logging.getLogger(__name__)


@receiver(post_save, sender=OrderHistory)
def on_order_history_created(sender, instance: OrderHistory, created: bool, **kwargs):
    """
    Buyurtma holati har o'zgarganda mijozga SMS yuboradi.
    SMS alohida thread'da yuboriladi — HTTP response'ni bloklamaydi.
    """
    if not created:
        return

    order = instance.order
    phone = order.receiver_phone
    if not phone:
        return

    send_order_status_sms_async(
        phone=phone,
        order_id=order.id,
        status=instance.to_status,
    )
