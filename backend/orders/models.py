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
    # Kod amal qilish muddati. Xorazm yetkazib berish odatda 1 kun ichida
    # tugaydi — 24 soat yetarli oyna. Bundan keyin kod rad etiladi va admin
    # yangi kod yaratishi kerak.
    RECEIVED_CODE_TTL_HOURS = 24
    # Bir buyurtma uchun ketma-ket noto'g'ri urinishlar limiti. Limit yetganda
    # 1 soatga blok. Cache key: bozor:code_fails:{order_id}.
    RECEIVED_CODE_MAX_ATTEMPTS = 5
    RECEIVED_CODE_LOCKOUT_SECONDS = 3600

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
    # ── Phase 3.0 — Kuryer Real-time Navigatsiyasi ─────────────────────────
    # Mijoz AddressPicker xaritasida AYNAN o'z eshigiga qo'ygan koordinata.
    # Kuryer navigatsiya xaritasi (CourierRouteMap) shu nuqtagacha yo'l chizadi.
    # Eski buyurtmalarda NULL — kuryer matn manzili bo'yicha boradi.
    delivery_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[
            MinValueValidator(Decimal('-90')),
            MaxValueValidator(Decimal('90')),
        ],
        help_text="Mijoz xaritada tanlagan aniq koordinata: kenglik (lat)",
    )
    delivery_lng = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True,
        validators=[
            MinValueValidator(Decimal('-180')),
            MaxValueValidator(Decimal('180')),
        ],
        help_text="Mijoz xaritada tanlagan aniq koordinata: uzunlik (lng)",
    )
    delivery_notes = models.TextField(
        blank=True, default='',
        help_text=(
            "Kuryer uchun qo'shimcha eslatma: domofon kodi, qavat, belgilar, "
            "alohida ko'rsatmalar. Oxirgi 50 metr muammosini hal qiladi."
        ),
    )

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
    # ── ULTRA-SECURE: one-time use ─────────────────────────────────────────────
    # Kod muvaffaqiyatli ishlatilgan vaqt. NOT NULL bo'lsa — kod ishlatilgan,
    # qayta qabul qilinmaydi (courier_confirm_delivery boshida tekshiriladi).
    # Eski yetkazib berishlarda NULL — backward compat (eski buyurtmalarda
    # status RECEIVED bo'lsa-yu used_at NULL bo'lsa, status guard'i ishlaydi).
    received_code_used_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Kod muvaffaqiyatli ishlatilgan vaqt — qayta ishlatib bo'lmaydi",
    )
    # Kod amal qilish muddati (soat). DEFAULT_CODE_TTL_HOURS bilan bog'liq.
    # SHIPPING -> DELIVERED da hisoblanadi: now + 24 soat.
    received_code_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Kod muddati tugash vaqti (24 soat). Bundan keyin kod rad etiladi.",
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

    def compute_received_code_expiry(self, *, base_time=None):
        """SHIPPING -> DELIVERED transition'ida: base_time + RECEIVED_CODE_TTL_HOURS.

        Kod shu vaqtdan keyin rad etiladi (kuryer kiritsa-da). Admin yangi
        kod yaratishi yoki resend qilishi kerak.
        """
        base = base_time or timezone.now()
        return base + timedelta(hours=self.RECEIVED_CODE_TTL_HOURS)

    @property
    def is_received_code_used(self) -> bool:
        """Kod allaqachon muvaffaqiyatli ishlatilganmi (one-time use)."""
        return self.received_code_used_at is not None

    @property
    def is_received_code_expired(self) -> bool:
        """Kod muddati o'tganmi (24 soatdan keyin)."""
        if self.received_code_expires_at is None:
            return False
        return timezone.now() >= self.received_code_expires_at

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

            # Real-time polling: Max(updated_at) signali har 5-6s so'raladi —
            # AdminOrdersPollView har qanday o'zgarishni (status, kredit, ...) shu
            # orqali aniqlaydi. Indeks Max'ni O(log n) qiladi (seq scan emas).
            models.Index(fields=['-updated_at'], name='order_updated_at_idx'),
        ]


class OrderItem(models.Model):
    # ── Sotuv narx TURI — sotuv VAQTIDA belgilanadi (hisobot uchun) ──────────
    # Hisobotda har bir element qanday narxda sotilganini ANIQ bilish uchun
    # (kurs o'zgarsa ham buzilmaydi — sotuv paytidagi haqiqat saqlanadi):
    #   • RETAIL   — oddiy (ko'rsatilgan) narx
    #   • DISCOUNT — POS'da qo'lda chegirma qilingan (narx retaildan past)
    #   • OPTOM    — optom (ulgurji) narxda sotilgan (admin "optom narxda sotish")
    #   • MASTER   — usta imtiyozi (optom+ustama, faollik gradienti)
    PRICE_TYPE_RETAIL = 'retail'
    PRICE_TYPE_DISCOUNT = 'discount'
    PRICE_TYPE_OPTOM = 'optom'
    PRICE_TYPE_MASTER = 'master'
    PRICE_TYPE_CHOICES = [
        (PRICE_TYPE_RETAIL, 'Oddiy narx'),
        (PRICE_TYPE_DISCOUNT, 'Chegirma narx'),
        (PRICE_TYPE_OPTOM, 'Optom narx'),
        (PRICE_TYPE_MASTER, 'Usta narx'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    variant = models.ForeignKey(ProductVariant, on_delete=models.SET_NULL, null=True, blank=True)

    quantity = models.PositiveIntegerField(default=1)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    # Sotuv vaqtida belgilanadi (orders.services.create_order). Eski yozuvlar
    # uchun default 'retail'.
    price_type = models.CharField(
        max_length=12,
        choices=PRICE_TYPE_CHOICES,
        default=PRICE_TYPE_RETAIL,
    )

    # ── Phase 3.1 — Return tracker ───────────────────────────────────────────
    # Necha donasi allaqachon qaytarib olingan (refunded yoki replaced).
    # INVARIANT: returned_qty <= quantity. Eligibility tekshiruvi shu maydonni
    # ishlatadi: agar `returned_qty >= quantity` bo'lsa, qayta qaytarib bo'lmaydi.
    # Hisobotda haqiqiy sotuv = quantity - returned_qty.
    returned_qty = models.PositiveIntegerField(
        default=0,
        help_text="Necha donasi qaytarib olingan (refunded yoki replaced)",
    )

    @property
    def returnable_qty(self) -> int:
        """Hali qaytarish mumkin bo'lgan miqdor."""
        return max(0, self.quantity - self.returned_qty)

    class Meta:
        # BARQAROR TARTIB — buyurtma elementlari QO'SHILGAN TARTIBDA (id o'sish)
        # ko'rinadi: buyurtma tafsilotlari, chek (receipt), admin ko'rinishi va
        # hisobotlar doim bir xil tartibda chiqadi (savatdagi tartib bilan mos).
        # Aks holda PostgreSQL tartibi noaniq bo'lib, qator yangilanganda
        # (masalan returned_qty) o'rni o'zgarib qolardi — savatdagi bilan bir xil
        # xatolik.
        ordering = ['id']

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


# ────────────────────────────────────────────────────────────────────────────
#  Phase 3.1 — Qaytarish (Return / Refund) tizimi
#
#  Dispute (Phase 2.6) — bu mijoz shikoyati (ko'pincha "muammo bor"). Qaytarish
#  esa alohida ish jarayoni: shikoyatdan kelib chiqishi YOKI mustaqil
#  boshlanishi mumkin. Bir buyurtmada bir nechta qaytarish ham bo'ladi
#  (Amazon/Wildberries kabi — har item alohida qaytarilishi mumkin).
#
#  INVARIANT: Order.total_price o'zgarmaydi (hisobotlar to'g'ri qolishi uchun).
#  "Qaytarilgan summa" = Σ OrderReturn.refund_amount (status=REFUNDED/REPLACED).
#  Foyda hisobi: Σ (price_snapshot - cost) * (quantity - returned_qty).
# ────────────────────────────────────────────────────────────────────────────


def _return_photo_upload_path(instance, filename):
    """Cloudinary yo'li: orders/returns/<year>/<month>/<filename>."""
    now = timezone.now()
    return f"orders/returns/{now:%Y/%m}/{filename}"


class OrderReturn(models.Model):
    # ── Status zanjiri (state machine) ──────────────────────────────────────
    # REQUESTED → APPROVED → PICKUP_SCHEDULED → PICKED_UP → INSPECTING →
    #             ACCEPTED → REFUNDED | REPLACED
    #                                          → REJECTED
    # Har qanday nuqtada (REFUNDED/REPLACED'dan oldin) CANCELLED ga o'tish mumkin.
    STATUS_REQUESTED         = 'REQUESTED'           # admin yaratdi, hali ko'rib chiqilmagan
    STATUS_APPROVED          = 'APPROVED'            # eligibility tasdiqlandi
    STATUS_PICKUP_SCHEDULED  = 'PICKUP_SCHEDULED'    # kuryer biriktirildi
    STATUS_PICKED_UP         = 'PICKED_UP'           # tovar mijozdan olindi (yoki POS ga keltirildi)
    STATUS_INSPECTING        = 'INSPECTING'          # inspector tekshirmoqda
    STATUS_ACCEPTED          = 'ACCEPTED'            # qabul qilindi, pul/almashish kerak
    STATUS_REFUNDED          = 'REFUNDED'            # yakuniy: pul qaytarildi
    STATUS_REPLACED          = 'REPLACED'            # yakuniy: yangi mahsulot berildi
    STATUS_REJECTED          = 'REJECTED'            # rad etildi (inspection_notes da sabab)
    STATUS_CANCELLED         = 'CANCELLED'           # admin/mijoz bekor qildi

    STATUS_CHOICES = [
        (STATUS_REQUESTED,        "So'rov yuborildi"),
        (STATUS_APPROVED,         "Tasdiqlandi"),
        (STATUS_PICKUP_SCHEDULED, "Kuryer biriktirildi"),
        (STATUS_PICKED_UP,        "Tovar olindi"),
        (STATUS_INSPECTING,       "Tekshirilmoqda"),
        (STATUS_ACCEPTED,         "Qabul qilindi"),
        (STATUS_REFUNDED,         "Pul qaytarildi"),
        (STATUS_REPLACED,         "Almashtirildi"),
        (STATUS_REJECTED,         "Rad etildi"),
        (STATUS_CANCELLED,        "Bekor qilindi"),
    ]

    # Hali yakunlanmagan (faol) qaytarishlar — buyurtmaga qarshi qayta yaratish
    # bloklanadi shu statuslarda mavjudlar bo'lsa.
    ACTIVE_STATUSES = frozenset({
        STATUS_REQUESTED, STATUS_APPROVED, STATUS_PICKUP_SCHEDULED,
        STATUS_PICKED_UP, STATUS_INSPECTING, STATUS_ACCEPTED,
    })
    # Yakuniy holatlar — stok va Order.returned_qty shu nuqtada qulflanadi.
    TERMINAL_STATUSES = frozenset({
        STATUS_REFUNDED, STATUS_REPLACED, STATUS_REJECTED, STATUS_CANCELLED,
    })
    # "Buyumlar haqiqatan qaytarildi" — bu nuqtada OrderItem.returned_qty oshadi
    # va (restock=True bo'lsa) stok qaytariladi.
    SUCCESS_STATUSES = frozenset({STATUS_REFUNDED, STATUS_REPLACED})

    # ── Qaytarish sabablari ─────────────────────────────────────────────────
    REASON_DEFECTIVE         = 'defective'           # ishlamayapti / sinishgan
    REASON_WRONG_ITEM        = 'wrong_item'          # boshqa mahsulot keldi
    REASON_NOT_AS_DESCRIBED  = 'not_as_described'    # tavsifga mos emas
    REASON_DAMAGED_IN_TRANSIT = 'damaged_in_transit' # yo'lda buzilgan
    REASON_QUALITY_ISSUE     = 'quality_issue'       # sifat past
    REASON_SIZE_MISMATCH     = 'size_mismatch'       # o'lcham to'g'ri kelmadi
    REASON_CHANGED_MIND      = 'changed_mind'        # fikr o'zgardi
    REASON_DUPLICATE_ORDER   = 'duplicate_order'     # ikki marta buyurtma
    REASON_CUSTOMER_REFUSED  = 'customer_refused'    # kuryerdan rad etish

    REASON_CHOICES = [
        (REASON_DEFECTIVE,         'Aybli (defective)'),
        (REASON_WRONG_ITEM,        "Noto'g'ri mahsulot"),
        (REASON_NOT_AS_DESCRIBED,  'Tavsifga mos emas'),
        (REASON_DAMAGED_IN_TRANSIT,"Yo'lda buzildi"),
        (REASON_QUALITY_ISSUE,     'Sifat masalasi'),
        (REASON_SIZE_MISMATCH,     "O'lcham to'g'ri kelmadi"),
        (REASON_CHANGED_MIND,      "Fikr o'zgardi"),
        (REASON_DUPLICATE_ORDER,   'Takroriy buyurtma'),
        (REASON_CUSTOMER_REFUSED,  'Mijoz qabul qilmadi'),
    ]

    # ── Tashabbus turi ──────────────────────────────────────────────────────
    INITIATOR_ADMIN   = 'admin'
    INITIATOR_COURIER = 'courier'
    INITIATOR_CUSTOMER = 'customer'   # Phase 3.6 uchun (hozir admin kiritadi)

    INITIATOR_CHOICES = [
        (INITIATOR_ADMIN,    'Admin'),
        (INITIATOR_COURIER,  'Kuryer'),
        (INITIATOR_CUSTOMER, 'Mijoz'),
    ]

    # ── Refund usullari ─────────────────────────────────────────────────────
    REFUND_CASH         = 'cash'         # Kassa.withdraw() bilan
    REFUND_CARD         = 'card'         # bank ilovasidan qo'lda
    REFUND_CLICK        = 'click'
    REFUND_PAYME        = 'payme'
    REFUND_STORE_CREDIT = 'store_credit' # foydalanuvchi balansiga (Phase 3.6)
    REFUND_REPLACEMENT  = 'replacement'  # pul qaytarish o'rniga yangi tovar

    REFUND_METHOD_CHOICES = [
        (REFUND_CASH,         'Naqd (kassa)'),
        (REFUND_CARD,         'Karta'),
        (REFUND_CLICK,        'Click'),
        (REFUND_PAYME,        'Payme'),
        (REFUND_STORE_CREDIT, "Do'kon balansi"),
        (REFUND_REPLACEMENT,  'Almashtirish'),
    ]

    # ── Buyurtma bog'lanishlari ─────────────────────────────────────────────
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='returns',
    )
    # Agar qaytarish disputdan kelib chiqsa — link saqlanadi (analitika uchun).
    dispute = models.ForeignKey(
        OrderDispute,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returns',
        help_text="Agar shu disputdan kelib chiqqan bo'lsa",
    )
    # Replacement (almashtirish) holatda — yangi yaratilgan Order ga link.
    replacement_order = models.OneToOneField(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replacement_of',
        help_text="Almashtirish uchun yaratilgan yangi buyurtma",
    )

    # ── Foydalanuvchiga ko'rinadigan raqam (R-2026-000123) ──────────────────
    # Telegram alert va SMS'da ishlatiladi. Bo'sh — keyin save() to'ldiradi.
    return_number = models.CharField(
        max_length=24,
        unique=True,
        db_index=True,
        blank=True,
        default='',
    )

    # ── Kim boshlagan ───────────────────────────────────────────────────────
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='returns_initiated',
    )
    initiator_role = models.CharField(
        max_length=16,
        choices=INITIATOR_CHOICES,
        default=INITIATOR_ADMIN,
    )
    customer_request_note = models.TextField(
        blank=True,
        default='',
        help_text="Admin mijoz so'rovini yozib qoladi (telefon orqali bo'lsa)",
    )

    # ── Sabab ──────────────────────────────────────────────────────────────
    reason_code = models.CharField(
        max_length=32,
        choices=REASON_CHOICES,
        db_index=True,
    )
    reason_text = models.TextField(
        blank=True,
        default='',
        help_text="Sabab batafsil (admin yoki mijoz)",
    )

    # ── Status va status-meta ───────────────────────────────────────────────
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_REQUESTED,
        db_index=True,
    )
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returns_status_changed',
    )

    # ── Pickup (kuryer) ─────────────────────────────────────────────────────
    pickup_address = models.TextField(blank=True, default='')
    pickup_courier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returns_pickup',
    )
    pickup_at = models.DateTimeField(null=True, blank=True)

    # ── Inspeksiya ─────────────────────────────────────────────────────────
    inspector = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returns_inspected',
    )
    inspection_at = models.DateTimeField(null=True, blank=True)
    inspection_notes = models.TextField(blank=True, default='')

    # ── Refund / Replacement ────────────────────────────────────────────────
    refund_method = models.CharField(
        max_length=16,
        choices=REFUND_METHOD_CHOICES,
        blank=True,
        default='',
        help_text="Yakuniy refund usuli (ACCEPTED dan keyin tanlanadi)",
    )
    refund_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Mijozga qaytarilgan summa (UZS)",
    )
    refund_reference = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Bank tranzaksiya raqami / Payme refund ID / Withdrawal #",
    )
    refund_processed_at = models.DateTimeField(null=True, blank=True)
    refund_processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returns_refund_processed',
    )

    rejection_reason = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Admin dashboard: faol qaytarishlar ro'yxati
            models.Index(fields=['status', '-created_at'], name='return_status_created_idx'),
            # Bir buyurtma uchun barcha qaytarishlar (eligibility check tez bo'lsin)
            models.Index(fields=['order', 'status'], name='return_order_status_idx'),
        ]

    def __str__(self):
        return f"Return {self.return_number or f'#{self.id}'} — Order #{self.order_id} ({self.status})"

    @property
    def is_active(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    @property
    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL_STATUSES

    @property
    def is_success(self) -> bool:
        return self.status in self.SUCCESS_STATUSES

    def save(self, *args, **kwargs):
        # Birinchi save() da return_number ni shakllantiramiz.
        # Format: R-YYYY-NNNNNN  (R-2026-000123)
        # ID hali ma'lum emas — birinchi save'dan SO'NG yangilaymiz.
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new and not self.return_number:
            year = self.created_at.year if self.created_at else timezone.now().year
            self.return_number = f"R-{year}-{self.id:06d}"
            super().save(update_fields=['return_number'])


class OrderReturnItem(models.Model):
    """
    Qaytarilayotgan har bir buyum (qisman qaytarish uchun).

    Misol: Buyurtmada 5 ta tovar bor edi, mijoz faqat 2 tasini qaytarmoqchi —
    shu jadvalga 1 ta yozuv (quantity=2) yoziladi. Stok va OrderItem.returned_qty
    AYNAN shu miqdorga qaytariladi/oshiriladi.
    """
    CONDITION_NEW         = 'new'           # ochilmagan, original o'rami
    CONDITION_USED_OPEN   = 'used_open'     # ochilgan, lekin holatda
    CONDITION_USED_DAMAGED = 'used_damaged' # zararlangan
    CONDITION_DEFECTIVE   = 'defective'     # buzilgan/ishlamaydigan

    CONDITION_CHOICES = [
        (CONDITION_NEW,           'Yangi (ochilmagan)'),
        (CONDITION_USED_OPEN,     'Ochilgan'),
        (CONDITION_USED_DAMAGED,  'Zararlangan'),
        (CONDITION_DEFECTIVE,     'Aybli'),
    ]

    # Stok qaytarish qarori (inspector belgilaydi).
    WRITEOFF_NONE     = ''
    WRITEOFF_DEFECT   = 'defect'    # ta'minotchidan kompensatsiya kelajakda
    WRITEOFF_LOST     = 'lost'      # kompaniya zarari
    WRITEOFF_CUSTOMER_FAULT = 'customer_fault'

    WRITEOFF_CHOICES = [
        (WRITEOFF_NONE,            "Yo'q (stokka qaytarildi)"),
        (WRITEOFF_DEFECT,          "Aybli — writeoff"),
        (WRITEOFF_LOST,            "Yo'qotildi"),
        (WRITEOFF_CUSTOMER_FAULT,  "Mijoz aybi — write-off"),
    ]

    return_obj = models.ForeignKey(
        OrderReturn,
        on_delete=models.CASCADE,
        related_name='items',
    )
    order_item = models.ForeignKey(
        OrderItem,
        on_delete=models.PROTECT,   # OrderItem o'chmasin — hisobot integrity
        related_name='return_entries',
    )
    quantity = models.PositiveIntegerField(default=1)
    # Snapshot — OrderItem.price_snapshot dan ko'chiriladi. Hisobot uchun
    # ishonchli manba (OrderItem.price_snapshot kelajak migration'larda
    # o'zgarmaydi, lekin alohida snapshot defensiv yondashuv).
    refund_unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    condition = models.CharField(
        max_length=16,
        choices=CONDITION_CHOICES,
        default=CONDITION_NEW,
    )
    restock = models.BooleanField(
        default=True,
        help_text="Tovar stokka qaytariladimi (False bo'lsa writeoff)",
    )
    writeoff_reason = models.CharField(
        max_length=32,
        choices=WRITEOFF_CHOICES,
        blank=True,
        default=WRITEOFF_NONE,
    )

    class Meta:
        ordering = ['id']
        indexes = [
            # OrderItem bo'yicha "necha marta qaytarilgan" hisoblash uchun
            models.Index(fields=['order_item'], name='return_item_order_item_idx'),
        ]

    @property
    def line_total(self) -> Decimal:
        """Bu satr uchun qaytariladigan summa."""
        return (self.refund_unit_price * self.quantity).quantize(Decimal('0.01'))

    def __str__(self):
        return f"ReturnItem #{self.id} (return #{self.return_obj_id}, qty={self.quantity})"


class OrderReturnPhoto(models.Model):
    """
    Qaytarish bilan bog'liq fotolar (dalil).
      - kind='claim'      → mijoz/admin tomonidan da'voga ilova qilingan
      - kind='inspection' → inspector tekshirgan paytda olingan
    """
    KIND_CLAIM      = 'claim'
    KIND_INSPECTION = 'inspection'

    KIND_CHOICES = [
        (KIND_CLAIM,      "Da'vo (claim) rasmi"),
        (KIND_INSPECTION, "Tekshiruv rasmi"),
    ]

    return_obj = models.ForeignKey(
        OrderReturn,
        on_delete=models.CASCADE,
        related_name='photos',
    )
    image = models.ImageField(upload_to=_return_photo_upload_path)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='return_photos_uploaded',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    kind = models.CharField(
        max_length=16,
        choices=KIND_CHOICES,
        default=KIND_CLAIM,
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"ReturnPhoto #{self.id} (return #{self.return_obj_id}, {self.kind})"
