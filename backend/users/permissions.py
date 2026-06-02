from rest_framework.permissions import BasePermission

ROLE_SUPER_ADMIN = 'super_admin'
ROLE_ADMIN       = 'admin'
ROLE_SELLER      = 'seller'
ROLE_COURIER     = 'courier'

# Tayinlab bo'lmaydigan rollar (faqat is_superuser orqali)
NON_ASSIGNABLE_ROLES = frozenset({ROLE_SUPER_ADMIN})

_ALL_STAFF = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SELLER, ROLE_COURIER})
_MGMT      = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN})
_POS       = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SELLER})
_STOCK     = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SELLER})

# Har bir rol uchun ruxsat etilgan status o'tishlari.
#
# MUHIM: Bu qiymatlar orders.models.Order STATUS_* konstantalari bilan
# TO'LIQ MOS KELISHI shart — katta-kichik harf farqi qat'iy ('PENDING', 'CONFIRMED', ...).
# can_transition() order.status ni to'g'ridan-to'g'ri bu to'plamga tekshiradi.
#
# ┌─ SOTUVCHI (ROLE_SELLER) ──────────────────────────────────────────────────┐
# │  PENDING   → CONFIRMED          Yangi buyurtmani tasdiqlash               │
# │  CONFIRMED → PACKING            Yig'ishni boshlash                        │
# │  PENDING   → CANCELLED_BY_ADMIN Tasdiqlashdan avval bekor qilish          │
# │  CONFIRMED → CANCELLED_BY_ADMIN Tasdiqdan keyin bekor qilish              │
# └───────────────────────────────────────────────────────────────────────────┘
# ┌─ KURYER (ROLE_COURIER) ───────────────────────────────────────────────────┐
# │  SHIPPING  → DELIVERED          Buyurtma manzilga yetkazildi              │
# └───────────────────────────────────────────────────────────────────────────┘
#
# Admin / Super Admin — barcha o'tishlar (can_transition'dagi _MGMT tekshiruvi)
ROLE_TRANSITIONS: dict = {
    ROLE_SELLER: {
        ('PENDING',    'CONFIRMED'),            # Yangi buyurtmani tasdiqlash
        ('CONFIRMED',  'PACKING'),              # Yig'ishni boshlash
        ('PENDING',    'CANCELLED_BY_ADMIN'),   # Tasdiqlashdan avval bekor qilish
        ('CONFIRMED',  'CANCELLED_BY_ADMIN'),   # Tasdiqdan keyin bekor qilish
    },
    ROLE_COURIER: {
        ('SHIPPING', 'DELIVERED'),              # Buyurtma manzilga yetkazildi
        # Phase 2.4 — kuryer qabul kodi bilan xaridorga topshirgan deb tasdiqlaydi.
        # Bu o'tish faqat /api/orders/<id>/courier-confirm/ endpoint orqali
        # ishlaydi (kod + rasm + GPS); oddiy status update bilan ishlatilmasin.
        ('DELIVERED', 'RECEIVED'),
    },
}


def _has(user, roles: frozenset) -> bool:
    return (
        user.is_authenticated
        and (user.is_superuser or getattr(user, 'role', None) in roles)
    )


class IsStaffMember(BasePermission):
    """Har qanday xodim (roli bor yoki superuser)."""
    message = "Faqat xodimlar uchun."

    def has_permission(self, request, view):
        return _has(request.user, _ALL_STAFF)


class IsSuperAdmin(BasePermission):
    """Faqat Django superuser (is_superuser=True)."""
    message = "Faqat Super Admin uchun."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superuser


class IsAdminOrAbove(BasePermission):
    """Admin yoki Super Admin."""
    message = "Faqat Admin yoki Super Admin uchun."

    def has_permission(self, request, view):
        return _has(request.user, _MGMT)


class CanManageOrders(BasePermission):
    """Barcha xodimlar buyurtmalarni ko'ra oladi."""
    message = "Faqat xodimlar uchun."

    def has_permission(self, request, view):
        return _has(request.user, _ALL_STAFF)


class CanAccessKassa(BasePermission):
    """Kassa: faqat Admin va Super Admin."""
    message = "Kassaga faqat Admin kira oladi."

    def has_permission(self, request, view):
        return _has(request.user, _MGMT)


class CanAccessReports(BasePermission):
    """Hisobotlar: faqat Admin va Super Admin."""
    message = "Hisobotlarga faqat Admin kira oladi."

    def has_permission(self, request, view):
        return _has(request.user, _MGMT)


class CanAccessStockReport(BasePermission):
    """Ombor hisoboti: Admin+ va Sotuvchi."""
    message = "Ombor hisobotiga Admin va Sotuvchi kira oladi."

    def has_permission(self, request, view):
        return _has(request.user, _STOCK)


class CanCreatePOS(BasePermission):
    """POS buyurtma: Admin+ va Sotuvchi."""
    message = "POS buyurtmani faqat Sotuvchi va Admin yaratishi mumkin."

    def has_permission(self, request, view):
        return _has(request.user, _POS)


class CanConfirmDelivery(BasePermission):
    """
    Phase 2.4 — Kuryer qabul kodi + rasm + GPS bilan yetkazib berishni
    tasdiqlaydi. Admin/Super Admin ham (kuryer ishlamay qolgan favqulodda
    holatlar uchun) shu endpoint orqali tasdiqlashi mumkin.
    """
    message = "Yetkazib berishni faqat kuryer yoki admin tasdiqlay oladi."

    def has_permission(self, request, view):
        return _has(request.user, frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_COURIER}))


def can_transition(user, from_status: str, to_status: str) -> bool:
    """Foydalanuvchi ushbu status o'tishga ruxsati bormi?"""
    if user.is_superuser or getattr(user, 'role', None) in _MGMT:
        return True
    role = getattr(user, 'role', None)
    allowed = ROLE_TRANSITIONS.get(role, set())
    return (from_status, to_status) in allowed
