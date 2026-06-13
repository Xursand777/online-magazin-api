from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _


# ── ULTRA-SECURE: O'zbekiston telefon raqami validatori ─────────────────────
# DB darajasida (model field validator) — har qanday yo'l bilan noto'g'ri
# raqam saqlash imkonsiz: full_clean() chaqiruvchi har serializer, admin form,
# DRF — barchasi shu validator orqali o'tadi. Operator prefiksi cheklangan:
#   33, 88                          — Humans, Beeline biznes
#   90, 91, 93, 94, 95, 97, 98, 99  — Mobile operatorlar
# Boshqa har qanday format → ValidationError.
UZ_PHONE_VALIDATOR = RegexValidator(
    regex=r'^\+998(33|88|90|91|93|94|95|97|98|99)\d{7}$',
    message=(
        "Telefon raqami O'zbekiston standartiga mos kelmaydi. "
        "Format: +998XXXXXXXXX (90, 91, 93, 94, 95, 97, 98, 99, 33, 88)."
    ),
    code='invalid_uz_phone',
)


class UserRole(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Admin'   # faqat is_superuser, tayinlab bo'lmaydi
    ADMIN       = 'admin',       'Admin'
    SELLER      = 'seller',      'Sotuvchi'
    COURIER     = 'courier',     'Kuryer'


class User(AbstractUser):
    username = models.CharField(max_length=150, blank=True, null=True)
    phone    = models.CharField(
        _("Phone number"),
        max_length=15,
        unique=True,
        validators=[UZ_PHONE_VALIDATOR],
        help_text="O'zbekiston telefon raqami: +998XXXXXXXXX",
    )

    is_verified = models.BooleanField(
        default=False,
        help_text="Foydalanuvchi telefon raqamini tasdiqlagan.",
    )

    # Xodim roli — bo'sh bo'lsa oddiy mijoz
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        blank=True,
        null=True,
        db_index=True,
        help_text="Xodim roli. Bo'sh bo'lsa — oddiy foydalanuvchi.",
    )

    # Rol o'zgarganda eski JWT tokenlarni bloklash uchun timestamp
    # CustomJWTAuth: token.iat < role_invalidated_at → rad etiladi
    role_invalidated_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Rol o'zgartirilgan vaqt. Bundan oldingi tokenlar bekor bo'ladi.",
    )

    # Usta (master/craftsman) — maxsus chegirma tizimi
    is_master = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Usta foydalanuvchi. Barcha mahsulotlarda 5% chegirma oladi.",
    )

    # Kredit (qarzga xarid) tizimi
    credit_ban = models.BooleanField(
        default=False,
        help_text="3 marta muddati o'tgan to'lovdan so'ng buyurtma berish taqiqlanadi.",
    )
    overdue_credit_count = models.PositiveSmallIntegerField(
        default=0,
        help_text="Muddati o'tgan kredit buyurtmalar soni. 3 taga yetsa credit_ban=True bo'ladi.",
    )

    USERNAME_FIELD  = 'phone'
    REQUIRED_FIELDS = []

    # ── Rol yordamchi metodlari ───────────────────────────────────────────────

    def has_role(self, *roles: str) -> bool:
        """Foydalanuvchi berilgan rollardan birida ekanini tekshiradi."""
        if self.is_superuser:
            return True
        return self.role in roles

    def can_access_admin(self) -> bool:
        """Admin panelga kirish huquqi."""
        return bool(self.role) or self.is_superuser

    @property
    def can_use_credit(self) -> bool:
        """
        Muddatli to'lov huquqi — FAQAT ustalarda.

        Biznes qoidasi: muddatli to'lov (kredit) — bizning brendga ishonchli
        mijozlar (ustalar) uchun. Oddiy mijozlar faqat naqd yoki karta bilan
        to'laydi. Backend bu xususiyatni ham authoritative tarzda tekshiradi
        (frontend gating'i UX uchun, lekin xavfsizlik backend'da).

        Kelajakda boshqa shartlar qo'shilsa (masalan, "kamida 5 ta sotib
        olgan ustalar"), shu yerda jam qilamiz — joriy chaqiruvchilar
        o'zgarmaydi.
        """
        return bool(self.is_master)

    @property
    def role_display(self) -> str:
        if self.is_superuser and not self.role:
            return 'Super Admin'
        return self.get_role_display() if self.role else 'Mijoz'

    def save(self, *args, **kwargs):
        # Rol berilganda is_staff avtomatik True bo'lsin (Django admin uchun)
        if self.role and not self.is_staff:
            self.is_staff = True
        elif not self.role and not self.is_superuser and self.is_staff:
            self.is_staff = False

        # Rol o'zgarganda role_invalidated_at ni yangilaymiz
        # Bu eski JWT tokenlarni avtomatik bloklaydi
        if self.pk:
            try:
                old = User.objects.only('role').get(pk=self.pk)
                if old.role != self.role:
                    from django.utils import timezone
                    self.role_invalidated_at = timezone.now()
            except User.DoesNotExist:
                pass

        super().save(*args, **kwargs)

    def __str__(self):
        return self.phone

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to='users/avatars/', null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    gender_choices = [
        ('M', 'Male'),
        ('F', 'Female'),
        ('O', 'Other'),
    ]
    gender = models.CharField(max_length=1, choices=gender_choices, null=True, blank=True)
    language = models.CharField(max_length=10, default='uz')
    delivery_address = models.TextField(blank=True, default='')

    # ── Phase 3.1 — Saqlangan manzil koordinatasi (kuryer navigatsiyasi) ────
    # Foydalanuvchi Profile/Mening manzilim'da AddressPicker xaritasidan tanlagan
    # koordinata. Order yaratilganida bu qiymatlar Order.delivery_lat/lng'ga
    # nusxalanadi (auto-fill). Mijoz har safar xaritadan qayta tanlash shart emas.
    delivery_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        help_text="Foydalanuvchi default manzili koordinatasi (lat)",
    )
    delivery_lng = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True,
        help_text="Foydalanuvchi default manzili koordinatasi (lng)",
    )
    delivery_notes = models.TextField(
        blank=True, default='',
        help_text="Kuryer uchun default eslatma (domofon kodi, qavat, belgilar)",
    )

    def __str__(self):
        return f"{self.user.phone} Profile"

class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    title = models.CharField(max_length=255, help_text="E.g., Home, Work")
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100)
    street = models.CharField(max_length=255)
    latitude = models.DecimalField(max_length=20, max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_length=20, max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title} - {self.user.phone}"

class StaffProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='staff_profile')
    position = models.CharField(max_length=100)
    salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    permissions = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Staff: {self.user.phone}"

class Feedback(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('read', 'Read'),
        ('resolved', 'Resolved'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='feedbacks')
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Feedback from {self.user.phone} - {self.status}"


# ─────────────────────────────────────────────────────────────────────────────
# AUDIT LOG — Admin amallarini kuzatuv
# ─────────────────────────────────────────────────────────────────────────────
#
# NIMA UCHUN:
#   Mijoz "men buyurtmani bekor qilganman edi-ku" deyishi mumkin.
#   Admin "men mahsulotni o'chirmaganman" deyishi mumkin.
#   Bug: stock 0 ga tushdi — kim o'zgartirgan?
#
#   AuditLog bularning hammasini kuzatib boradi: kim, qachon, qaysi resurs,
#   qaysi amal, qaysi IP'dan.
#
# QACHON YOZILADI:
#   • Admin POST/PATCH/PUT/DELETE so'rovi muvaffaqiyatli (2xx)
#   • AuditMiddleware avtomat yozadi (core/middleware.py)
#   • Yoki views ichidan explicit: users/audit.py::audit(...) chaqirish
#
# QACHON YOZILMAYDI:
#   • GET so'rovlari (faqat o'qish)
#   • Mehmon va oddiy mijoz amallari (faqat staff/superuser)
#   • Health check, refresh token kabi noisy yo'llar
#   • 4xx/5xx javoblari (xato yoki noruxsat amal)
#
# RETENTION:
#   180 kun saqlanadi. Eski yozuvlar:
#     python manage.py purge_old_audit_logs
class AuditLog(models.Model):
    """Admin amallarini kuzatuv jadvali."""

    # Kim — User o'chsa NULL bo'ladi, lekin actor_phone_snapshot saqlanadi
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text="Amalni bajargan foydalanuvchi",
    )
    # Denormalize: User o'chsa ham kim qilgani saqlanadi
    actor_phone_snapshot = models.CharField(
        max_length=15,
        blank=True,
        default='',
        help_text="Actor telefoni (User o'chsa ham saqlanadi)",
    )

    # Amal turi — "admin.products.create", "admin.orders.cancel"
    action = models.CharField(max_length=100, db_index=True)

    # Maqsad resursi — "product", "order", "user"
    target_type = models.CharField(max_length=50, blank=True, default='', db_index=True)
    target_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    # Qo'shimcha ma'lumot — diff, snapshot, request body
    # Misol: {"method": "DELETE", "path": "/api/admin/products/123/", "status_code": 204}
    # Yoki: {"old_role": "seller", "new_role": "admin"}
    data = models.JSONField(default=dict, blank=True)

    # Where va how
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, default='')

    # Qachon
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            # Foydalanuvchi bo'yicha: "Bu admin oxirgi haftada nima qildi"
            models.Index(fields=['actor', '-created_at'], name='auditlog_actor_idx'),
            # Resurs bo'yicha: "Mahsulot #123 tarixi"
            models.Index(
                fields=['target_type', 'target_id', '-created_at'],
                name='auditlog_target_idx',
            ),
            # Amal turi bo'yicha: "Barcha o'chirilgan mahsulotlar"
            models.Index(fields=['action', '-created_at'], name='auditlog_action_idx'),
        ]
        verbose_name = 'Audit log'
        verbose_name_plural = 'Audit log yozuvlari'

    def __str__(self):
        actor_str = self.actor_phone_snapshot or (self.actor.phone if self.actor else 'unknown')
        return f'{self.action} by {actor_str} at {self.created_at:%Y-%m-%d %H:%M}'
