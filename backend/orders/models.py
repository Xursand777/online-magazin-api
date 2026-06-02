import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

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

    # ── Phase 2.2 — Dispute window ───────────────────────────────────────────
    # DELIVERED'dan keyin mijoz nechta kun ichida shikoyat (dispute) qila olishi.
    # Bu muddat ichida `credit_overdue` belgilanmaydi (Phase 2.5). 7 kun —
    # rasmiy iste'molchi himoyasi me'yorlariga mos keladi.
    DISPUTE_WINDOW_DAYS = 7

    # 6 xonali numerik qabul kodi — mijozga SMS'da yuboriladi, kuryerga
    # ko'rsatiladi. Brute-force xavfini kamaytirish uchun `secrets` kutubxonasi
    # ishlatiladi (cryptographic RNG).
    RECEIVED_CODE_LENGTH = 6

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

    # ── Phase 2.2 — Qabul kodi va disput muddati ─────────────────────────────
    # `received_code` — kuryer mijozdan so'raydigan 6 xonali kod.
    #   Yaratilish vaqti: SHIPPING -> DELIVERED transition'da (Phase 2.3).
    #   Ishlatilish: POST /api/orders/<id>/courier-confirm/ (Phase 2.4).
    #   Bo'sh string emas null — SQLite/Postgres uniqueness va NULL-checklar
    #   uchun aniq holatga ega bo'lish.
    received_code = models.CharField(
        max_length=6,
        null=True,
        blank=True,
        help_text="Kuryer mijozdan so'raydigan 6 xonali yetkazib berish kodi",
    )
    received_code_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Qabul kodi SMS'da yuborilgan vaqt",
    )
    # `dispute_deadline` — DELIVERED'dan keyin +DISPUTE_WINDOW_DAYS kun.
    # Bu muddat o'tmaguncha kreditga `overdue` belgilanmaydi (Phase 2.5).
    # `mark_credit_overdue` cron query'si uchun `db_index=True`.
    dispute_deadline = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Shu vaqtgacha mijoz disput ocha oladi (DELIVERED + 7 kun)",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} by {self.receiver_name}"

    # ── Phase 2.2 — Qabul kodi va disput muddati helperlari ──────────────────

    def generate_received_code(self) -> str:
        """6 xonali kriptografik tasodifiy qabul kodini hosil qiladi.

        `secrets.randbelow` brute-force xavfini kamaytiradi (PRNG emas, OS-level
        entropy). Idempotent emas: har chaqirilganda yangi kod yaratadi —
        chaqiruvchi (services.transition_order_status) `received_code` allaqachon
        belgilanganligini tekshirishi shart.

        Saqlamaydi — faqat qaytaradi. Chaqiruvchi `save()` qilishi kerak.
        """
        n = secrets.randbelow(10 ** self.RECEIVED_CODE_LENGTH)
        return f"{n:0{self.RECEIVED_CODE_LENGTH}d}"

    @property
    def is_within_dispute_window(self) -> bool:
        """True bo'lsa, mijoz hali shikoyat qila oladi va kredit
        `overdue` deb belgilanmasligi kerak.

        `dispute_deadline` belgilanmagan bo'lsa — DELIVERED'ga hali yetmagan,
        shuning uchun himoya yo'q (False).
        """
        if self.dispute_deadline is None:
            return False
        return timezone.now() < self.dispute_deadline

    def compute_dispute_deadline(self, *, base_time=None):
        """DELIVERED transition'ida ishlatiladi: base_time + 7 kun.

        base_time None bo'lsa, `timezone.now()` ishlatiladi. Bu funksiya
        faqat hisoblaydi — saqlash chaqiruvchi javobgarligida.
        """
        base = base_time or timezone.now()
        return base + timedelta(days=self.DISPUTE_WINDOW_DAYS)

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

    # ── Phase 2.1 — Delivery proof ──────────────────────────────────────────
    # Kuryer yetkazib berish dalili. Faqat SHIPPING → DELIVERED yoki
    # DELIVERED → RECEIVED o'tishlarida to'ldiriladi; boshqa transitions
    # uchun null qoladi.
    #
    # NIMA UCHUN: kreditli buyurtmalarda mijoz "olmadim" deb shikoyat qilsa,
    # kuryer rasmi + GPS + qabul kodi tasdig'i orqali disput (Phase 2.6)
    # ob'ektiv hal qilinadi. Brand obro'sini va kuryerlarni himoyalaydi.
    delivery_photo = models.ImageField(
        upload_to='orders/delivery_proof/%Y/%m/',
        null=True,
        blank=True,
        help_text="Kuryer tomonidan yetkazib berish paytida olingan rasm",
    )
    delivery_latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(Decimal('-90')),
            MaxValueValidator(Decimal('90')),
        ],
        help_text="Yetkazib berish nuqtasi kengligi (GPS, -90...90)",
    )
    delivery_longitude = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[
            MinValueValidator(Decimal('-180')),
            MaxValueValidator(Decimal('180')),
        ],
        help_text="Yetkazib berish nuqtasi uzunligi (GPS, -180...180)",
    )
    # NULL = bu transition uchun amal qilmaydi (masalan PENDING -> CONFIRMED).
    # True  = mijoz kuryerga ayttirgan 6 xonali kod to'g'ri kiritilgan.
    # False = noto'g'ri kod kiritilgan (kuzatuv uchun yoziladi, RECEIVED'ga o'tilmaydi).
    received_code_verified = models.BooleanField(
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Mijoz tomonidan kuryerga ayttirilgan qabul kodi to'g'ri "
            "kiritilganmi (null = bu transition uchun amal qilmaydi)"
        ),
    )

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f"Order #{self.order_id}: {self.from_status or 'START'} -> {self.to_status}"

    @property
    def has_delivery_proof(self) -> bool:
        """True bo'lsa kuryer rasm/GPS/kod tasdig'ini biriktirgan."""
        return bool(
            self.delivery_photo
            or self.delivery_latitude is not None
            or self.delivery_longitude is not None
            or self.received_code_verified is not None
        )

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


# ── Phase 2.6 — Order dispute (mijoz shikoyati) ─────────────────────────────
#
# NIMA UCHUN:
#   Mijoz yetkazib berilgan buyurtma haqida shikoyat qilishi mumkin
#   ("olmadim", "buzilgan keldi", "boshqa narsa"). Admin uni ko'radi va hal
#   qiladi. Phase 2.1 dalillari (rasm + GPS + kod) admin tomon obyektiv
#   qaror qabul qilishga yordam beradi.
#
# KREDIT BILAN BOG'LANISH:
#   Aktiv disput credit_overdue belgilash xulqiga TA'SIR QILMAYDI — Phase 2.5
#   dispute_deadline (7 kun) bilan himoyalanadi. Disput hal qilinguncha mijoz
#   boshqa kreditli buyurtma berolmasligi (Phase 4.1 refund) keyingi
#   phase'da hisobga olinadi.
class OrderDispute(models.Model):
    STATUS_OPEN              = 'open'
    STATUS_UNDER_REVIEW      = 'under_review'
    STATUS_RESOLVED_CUSTOMER = 'resolved_for_customer'
    STATUS_RESOLVED_BUSINESS = 'resolved_for_business'

    STATUS_CHOICES = [
        (STATUS_OPEN,              "Ochiq"),
        (STATUS_UNDER_REVIEW,      "Ko'rib chiqilmoqda"),
        (STATUS_RESOLVED_CUSTOMER, "Mijoz foydasiga hal qilindi"),
        (STATUS_RESOLVED_BUSINESS, "Biznes foydasiga hal qilindi"),
    ]

    ACTIVE_STATUSES   = frozenset({STATUS_OPEN, STATUS_UNDER_REVIEW})
    RESOLVED_STATUSES = frozenset({STATUS_RESOLVED_CUSTOMER, STATUS_RESOLVED_BUSINESS})

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='disputes',
    )
    reason = models.TextField(
        help_text="Mijoz shikoyatining tafsiloti",
    )
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_OPEN,
        db_index=True,
    )
    resolution_note = models.TextField(
        blank=True,
        default='',
        help_text="Admin tomonidan qaror sababi va batafsil ma'lumot",
    )
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='disputes_resolved',
        help_text="Qaror qabul qilgan admin",
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Admin dashboard: aktiv disputlarni ro'yxat olish
            models.Index(fields=['status', '-created_at'], name='dispute_status_created_idx'),
        ]

    def __str__(self):
        return f"Dispute #{self.id} — Order #{self.order_id} ({self.status})"

    @property
    def is_active(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    @property
    def is_resolved(self) -> bool:
        return self.status in self.RESOLVED_STATUSES


def _dispute_image_upload_path(instance, filename):
    """Cloudinary yo'li: orders/disputes/<year>/<month>/<filename>."""
    now = timezone.now()
    return f"orders/disputes/{now:%Y/%m}/{filename}"


class OrderDisputeImage(models.Model):
    """
    Mijoz tomonidan disputga qo'shilgan dalil rasmlari. Ko'p rasm mumkin
    (FK reverse: dispute.images.all()).
    """
    dispute = models.ForeignKey(
        OrderDispute,
        on_delete=models.CASCADE,
        related_name='images',
    )
    image = models.ImageField(upload_to=_dispute_image_upload_path)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"DisputeImage #{self.id} (dispute #{self.dispute_id})"
