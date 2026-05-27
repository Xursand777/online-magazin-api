from django.conf import settings
from django.db import models

from products.models import Product, ProductVariant


class Order(models.Model):
    # ── Karta to'lovi uchun boshlang'ich holat ──────────────────────────────────
    STATUS_AWAITING_PAYMENT = 'AWAITING_PAYMENT'   # Faqat karta: to'lov kutilmoqda
    # ── Asosiy zanjir ────────────────────────────────────────────────────────────
    STATUS_PENDING   = 'PENDING'                   # Naqd / kredit: yangi buyurtma
    STATUS_CONFIRMED = 'CONFIRMED'                 # Admin tasdiqladi
    STATUS_PACKING   = 'PACKING'                   # Yig'ilmoqda
    STATUS_SHIPPING  = 'SHIPPING'                  # Kuryerda / Yo'lda
    STATUS_DELIVERED = 'DELIVERED'                 # Kuryer manzilga yetdi (eshikda)
    STATUS_RECEIVED  = 'RECEIVED'                  # Xaridorga topshirildi (yakuniy)
    # ── Bekor qilish holatlari ────────────────────────────────────────────────────
    STATUS_CANCELLED_BY_USER   = 'CANCELLED_BY_USER'
    STATUS_CANCELLED_BY_ADMIN  = 'CANCELLED_BY_ADMIN'
    STATUS_SYSTEM_AUTO_CANCEL  = 'SYSTEM_AUTO_CANCEL'

    STATUS_CHOICES = [
        (STATUS_AWAITING_PAYMENT,  "To'lov kutilmoqda (karta)"),
        (STATUS_PENDING,           "Yangi buyurtma"),
        (STATUS_CONFIRMED,         "Tasdiqlandi"),
        (STATUS_PACKING,           "Yig'ilmoqda"),
        (STATUS_SHIPPING,          "Yo'lda (kuryerda)"),
        (STATUS_DELIVERED,         "Yetkazildi (eshikda)"),
        (STATUS_RECEIVED,          "Xaridorga topshirildi"),
        (STATUS_CANCELLED_BY_USER,  "Foydalanuvchi bekor qildi"),
        (STATUS_CANCELLED_BY_ADMIN, "Admin bekor qildi"),
        (STATUS_SYSTEM_AUTO_CANCEL, "Tizim avtomatik bekor qildi"),
    ]

    # Faol buyurtmalar: hali yakunlanmagan va bekor qilinmagan
    ACTIVE_STATUSES = {
        STATUS_AWAITING_PAYMENT,  # karta to'lovi kutilmoqda
        STATUS_PENDING,
        STATUS_CONFIRMED,
        STATUS_PACKING,
        STATUS_SHIPPING,
        STATUS_DELIVERED,         # kuryer eshikda — hali xaridorga topshirilmagan
    }
    CANCELLATION_STATUSES = {
        STATUS_CANCELLED_BY_USER,
        STATUS_CANCELLED_BY_ADMIN,
        STATUS_SYSTEM_AUTO_CANCEL,
    }
    # Foydalanuvchi faqat PENDING va CONFIRMED ni bekor qila oladi
    CANCELLABLE_STATUSES = {
        STATUS_PENDING,
        STATUS_CONFIRMED,
        STATUS_AWAITING_PAYMENT,
    }
    # Admin RECEIVED dan oldingi barcha faol holatlarda bekor qila oladi
    ADMIN_CANCELLABLE_STATUSES = {
        STATUS_AWAITING_PAYMENT,
        STATUS_PENDING,
        STATUS_CONFIRMED,
        STATUS_PACKING,
        STATUS_SHIPPING,
        STATUS_DELIVERED,         # kuryer yetkazolmagan holatlarda
    }

    PAYMENT_METHOD_CASH = 'cash'
    PAYMENT_METHOD_CARD = 'card'
    PAYMENT_METHOD_CREDIT = 'credit'
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_METHOD_CASH, 'Naqd pul'),
        (PAYMENT_METHOD_CARD, 'Karta (Click/Payme)'),
        (PAYMENT_METHOD_CREDIT, "Muddatli to'lov"),
    ]

    CREDIT_DAYS_MIN = 5
    CREDIT_DAYS_MAX = 20

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
        db_index=True,
    )

    delivery_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    cancellation_reason = models.TextField(blank=True, default='')
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # Kredit maydonlari
    is_credit = models.BooleanField(default=False, db_index=True)
    credit_days = models.PositiveSmallIntegerField(null=True, blank=True)
    credit_due_date = models.DateField(null=True, blank=True, db_index=True)
    credit_paid = models.BooleanField(default=False)
    credit_paid_at = models.DateTimeField(null=True, blank=True)
    credit_overdue_counted = models.BooleanField(
        default=False,
        help_text="Muddati o'tganligi foydalanuvchi hisobiga qo'shilganmi."
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} by {self.receiver_name}"

    class Meta:
        # ── #17 & #22 FIX: DB Indexes ────────────────────────────────────────
        #
        # MUAMMO:
        #   Order.objects.filter(status='PENDING')          → FULL TABLE SCAN
        #   Order.objects.filter(created_at__date=today)    → FULL TABLE SCAN
        #   AdminOrderListView filtri status+created_at birga → ikki marta scan
        #
        # YECHIM — Composite + alohida indexlar:
        #
        #   1. (status, created_at) composite index:
        #      AdminOrderListView ?status=PENDING&date_from=... → INDEX SCAN
        #      Composite muhim: WHERE status='PENDING' ORDER BY created_at DESC
        #      → bitta B-tree traversal. Alohida indexlar kamroq samarali.
        #
        #   2. created_at alohida index:
        #      date_from/date_to filtri status filtrisiz ham tez ishlashi uchun.
        #      AdminDashboardView today/month filtrlari uchun ham muhim.
        #
        # SQLite: Bu indexlar SQLite'da ham ishlaydi.
        # PostgreSQL: BRIN index created_at uchun yanada samaraliroq bo'lardi,
        #   lekin models.Index (B-tree) barcha DB uchun universal.
        # ─────────────────────────────────────────────────────────────────────
        indexes = [
            # #17 FIX: status bo'yicha filter → O(log n) instead of O(n)
            models.Index(fields=['status'], name='order_status_idx'),

            # #22 FIX: created_at bo'yicha sort/filter → O(log n) instead of O(n)
            models.Index(fields=['-created_at'], name='order_created_at_idx'),

            # Composite: status + created_at (AdminOrderListView, AdminDashboardView)
            # WHERE status='PENDING' ORDER BY created_at DESC → bitta B-tree traversal
            models.Index(fields=['status', '-created_at'], name='order_status_created_idx'),

            # Kredit filtrlari (UserCreditStatusView, KassaView)
            models.Index(
                fields=['is_credit', 'credit_paid', 'credit_due_date'],
                name='order_credit_idx',
            ),

            # Foydalanuvchi buyurtmalari (OrderListView)
            models.Index(fields=['user', '-created_at'], name='order_user_created_idx'),
        ]


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
    to_status = models.CharField(max_length=32)
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

class Withdrawal(models.Model):
    amount = models.DecimalField(max_digits=12, decimal_places=2, verbose_name="Yechilgan summa")
    reason = models.CharField(max_length=255, verbose_name="Maqsad/Izoh")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Sana va vaqt")
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="Kassir (Admin)",
        related_name="withdrawals"
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Kassa chiqimi (Withdrawal)"
        verbose_name_plural = "Kassa chiqimlari"

    def __str__(self):
        return f"{self.amount} so'm - {self.reason}"
