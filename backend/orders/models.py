from django.conf import settings
from django.db import models

from products.models import Product, ProductVariant


class Order(models.Model):
    STATUS_PENDING = 'PENDING'
    STATUS_CONFIRMED = 'CONFIRMED'
    STATUS_PACKING = 'PACKING'
    STATUS_SHIPPING = 'SHIPPING'
    STATUS_DELIVERED = 'DELIVERED'
    STATUS_CANCELLED_BY_USER = 'CANCELLED_BY_USER'
    STATUS_CANCELLED_BY_ADMIN = 'CANCELLED_BY_ADMIN'
    STATUS_SYSTEM_AUTO_CANCEL = 'SYSTEM_AUTO_CANCEL'

    STATUS_CHOICES = [
        (STATUS_PENDING, "To'lov kutilmoqda / Yangi"),
        (STATUS_CONFIRMED, 'Rasmiylashtirildi'),
        (STATUS_PACKING, "Yig'ilmoqda"),
        (STATUS_SHIPPING, "Yo'lda"),
        (STATUS_DELIVERED, 'Yetib keldi'),
        (STATUS_CANCELLED_BY_USER, 'Foydalanuvchi bekor qildi'),
        (STATUS_CANCELLED_BY_ADMIN, 'Admin bekor qildi'),
        (STATUS_SYSTEM_AUTO_CANCEL, 'Tizim avtomatik bekor qildi'),
    ]

    ACTIVE_STATUSES = {
        STATUS_PENDING,
        STATUS_CONFIRMED,
        STATUS_PACKING,
        STATUS_SHIPPING,
    }
    CANCELLATION_STATUSES = {
        STATUS_CANCELLED_BY_USER,
        STATUS_CANCELLED_BY_ADMIN,
        STATUS_SYSTEM_AUTO_CANCEL,
    }
    CANCELLABLE_STATUSES = {
        STATUS_PENDING,
        STATUS_CONFIRMED,
        STATUS_PACKING,
    }

    PAYMENT_METHOD_CASH = 'cash'
    PAYMENT_METHOD_CARD = 'card'
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_METHOD_CASH, 'Cash on Delivery'),
        (PAYMENT_METHOD_CARD, 'Card (Click/Payme)'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
    )

    receiver_name = models.CharField(max_length=255)
    receiver_phone = models.CharField(max_length=20)
    delivery_address = models.TextField()

    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default=PAYMENT_METHOD_CASH,
    )
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )

    delivery_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    cancellation_reason = models.TextField(blank=True, default='')
    cancelled_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} by {self.receiver_name}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    variant = models.ForeignKey(ProductVariant, on_delete=models.SET_NULL, null=True, blank=True)

    quantity = models.PositiveIntegerField(default=1)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        product_name = self.product.name if self.product else 'Unknown'
        return f"{self.quantity} x {product_name} for Order #{self.order.id}"


class Payment(models.Model):
    STATUS_PENDING = 'PENDING'
    STATUS_PAID = 'PAID'
    STATUS_FAILED = 'FAILED'
    STATUS_REFUNDED = 'REFUNDED'

    PAYMENT_STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PAID, 'Paid'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_REFUNDED, 'Refunded'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='payment')
    method = models.CharField(max_length=20, default=Order.PAYMENT_METHOD_CASH)
    status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_id = models.CharField(max_length=255, null=True, blank=True)
    refund_reference = models.CharField(max_length=255, null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payment for Order #{self.order.id} - {self.status}"


class OrderHistory(models.Model):
    ACTOR_USER = 'USER'
    ACTOR_ADMIN = 'ADMIN'
    ACTOR_SYSTEM = 'SYSTEM'

    ACTOR_CHOICES = [
        (ACTOR_USER, 'User'),
        (ACTOR_ADMIN, 'Admin'),
        (ACTOR_SYSTEM, 'System'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='history')
    from_status = models.CharField(max_length=32, blank=True, default='')
    to_status = models.CharField(max_length=32, choices=Order.STATUS_CHOICES)
    actor_type = models.CharField(max_length=10, choices=ACTOR_CHOICES, default=ACTOR_SYSTEM)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='order_history_events',
    )
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f"Order #{self.order_id}: {self.from_status or 'START'} -> {self.to_status}"
