from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _


class UserRole(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Admin'   # faqat is_superuser, tayinlab bo'lmaydi
    ADMIN       = 'admin',       'Admin'
    SELLER      = 'seller',      'Sotuvchi'
    COURIER     = 'courier',     'Kuryer'


class User(AbstractUser):
    username = models.CharField(max_length=150, blank=True, null=True)
    phone    = models.CharField(_("Phone number"), max_length=15, unique=True)

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
