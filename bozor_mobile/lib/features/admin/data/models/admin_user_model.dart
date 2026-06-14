/// Admin foydalanuvchilarni boshqarish — saytdagi AdminPanel.tsx users tab'ining
/// ekvivalenti.
///
/// Backend endpoint: `/api/admin/users/` (UserPagePagination, page_size=20).
/// Response format DRF standard: { count, next, previous, results: [...] }
library;

class AdminUser {
  final int id;
  final String phone;
  final String firstName;
  final String lastName;

  /// Aktivlik holati — false bo'lsa foydalanuvchi tizimga kira olmaydi.
  final bool isActive;

  /// Telefon raqami OTP orqali tasdiqlanganmi.
  final bool isVerified;

  /// Xodimmi (admin/seller/courier)?
  final bool isStaff;

  /// Super Admin (is_superuser=True) — hech kim bloklay olmaydi.
  final bool isSuperuser;

  /// Xodim roli: 'admin', 'seller', 'courier' yoki null (oddiy mijoz).
  final String? role;

  /// Kredit ban — 3 marta o'tkazib yuborgan mijoz.
  final bool creditBan;

  /// O'tkazib yuborilgan kredit buyurtmalar soni.
  final int overdueCreditCount;

  /// Ro'yxatdan o'tgan sana.
  final DateTime? dateJoined;

  /// Jami buyurtmalar soni (annotate dan).
  final int orderCount;

  /// Jami xarid summasi.
  final double totalSpent;

  const AdminUser({
    required this.id,
    required this.phone,
    required this.firstName,
    required this.lastName,
    required this.isActive,
    required this.isVerified,
    required this.isStaff,
    required this.isSuperuser,
    required this.role,
    required this.creditBan,
    required this.overdueCreditCount,
    required this.dateJoined,
    required this.orderCount,
    required this.totalSpent,
  });

  /// To'liq ism — ism + familiya. Bo'sh bo'lsa telefon raqami.
  String get displayName {
    final name = [firstName, lastName]
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join(' ');
    return name.isNotEmpty ? name : phone;
  }

  /// Avatar uchun bosh harf — ism birinchi harfi yoki telefon oxirgi raqami.
  String get initial {
    if (firstName.trim().isNotEmpty) return firstName.trim()[0].toUpperCase();
    if (lastName.trim().isNotEmpty) return lastName.trim()[0].toUpperCase();
    if (phone.isNotEmpty) {
      return phone[phone.length - 1];
    }
    return '?';
  }

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    return AdminUser(
      id: _int(json['id']),
      phone: json['phone'] as String? ?? '',
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
      isActive: json['is_active'] as bool? ?? true,
      isVerified: json['is_verified'] as bool? ?? false,
      isStaff: json['is_staff'] as bool? ?? false,
      isSuperuser: json['is_superuser'] as bool? ?? false,
      role: json['role'] as String?,
      creditBan: json['credit_ban'] as bool? ?? false,
      overdueCreditCount: _int(json['overdue_credit_count']),
      dateJoined: _parseDate(json['date_joined']),
      orderCount: _int(json['order_count']),
      totalSpent: _double(json['total_spent']),
    );
  }
}

/// Sahifalangan javob — DRF PageNumberPagination'dan.
class AdminUserPage {
  final List<AdminUser> users;
  final int totalCount;
  final bool hasNext;

  const AdminUserPage({
    required this.users,
    required this.totalCount,
    required this.hasNext,
  });

  factory AdminUserPage.fromJson(Map<String, dynamic> json) {
    final results = (json['results'] as List? ?? [])
        .map((e) => AdminUser.fromJson(e as Map<String, dynamic>))
        .toList();
    return AdminUserPage(
      users: results,
      totalCount: _int(json['count']),
      hasNext: json['next'] != null,
    );
  }
}

/// Batafsil ko'rinish — bitta foydalanuvchi sahifasi uchun (saytdagidek).
class AdminUserDetail {
  final int id;
  final String phone;
  final String firstName;
  final String lastName;
  final bool isActive;
  final bool isVerified;
  final bool isStaff;
  final bool isSuperuser;
  final String? role;
  final bool creditBan;
  final int overdueCreditCount;
  final DateTime? dateJoined;
  final DateTime? lastLogin;
  final int orderCount;
  final double totalSpent;
  final List<AdminUserRecentOrder> recentOrders;

  const AdminUserDetail({
    required this.id,
    required this.phone,
    required this.firstName,
    required this.lastName,
    required this.isActive,
    required this.isVerified,
    required this.isStaff,
    required this.isSuperuser,
    required this.role,
    required this.creditBan,
    required this.overdueCreditCount,
    required this.dateJoined,
    required this.lastLogin,
    required this.orderCount,
    required this.totalSpent,
    required this.recentOrders,
  });

  String get displayName {
    final name = [firstName, lastName]
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join(' ');
    return name.isNotEmpty ? name : phone;
  }

  String get initial {
    if (firstName.trim().isNotEmpty) return firstName.trim()[0].toUpperCase();
    if (lastName.trim().isNotEmpty) return lastName.trim()[0].toUpperCase();
    if (phone.isNotEmpty) return phone[phone.length - 1];
    return '?';
  }

  factory AdminUserDetail.fromJson(Map<String, dynamic> json) {
    return AdminUserDetail(
      id: _int(json['id']),
      phone: json['phone'] as String? ?? '',
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
      isActive: json['is_active'] as bool? ?? true,
      isVerified: json['is_verified'] as bool? ?? false,
      isStaff: json['is_staff'] as bool? ?? false,
      isSuperuser: json['is_superuser'] as bool? ?? false,
      role: json['role'] as String?,
      creditBan: json['credit_ban'] as bool? ?? false,
      overdueCreditCount: _int(json['overdue_credit_count']),
      dateJoined: _parseDate(json['date_joined']),
      lastLogin: _parseDate(json['last_login']),
      orderCount: _int(json['order_count']),
      totalSpent: _double(json['total_spent']),
      recentOrders: ((json['recent_orders'] as List?) ?? [])
          .map((e) => AdminUserRecentOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Foydalanuvchining oxirgi buyurtmalari — minimal qator.
class AdminUserRecentOrder {
  final int id;
  final String status;
  final double totalPrice;
  final DateTime? createdAt;
  final String paymentMethod;
  final bool isCredit;

  const AdminUserRecentOrder({
    required this.id,
    required this.status,
    required this.totalPrice,
    required this.createdAt,
    required this.paymentMethod,
    required this.isCredit,
  });

  factory AdminUserRecentOrder.fromJson(Map<String, dynamic> json) {
    return AdminUserRecentOrder(
      id: _int(json['id']),
      status: json['status'] as String? ?? '',
      totalPrice: _double(json['total_price']),
      createdAt: _parseDate(json['created_at']),
      paymentMethod: json['payment_method'] as String? ?? '',
      isCredit: json['is_credit'] as bool? ?? false,
    );
  }
}

// ── Yordamchilar ────────────────────────────────────────────────────────────

int _int(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

double _double(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

DateTime? _parseDate(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v.toLocal();
  if (v is String) {
    if (v.isEmpty) return null;
    return DateTime.tryParse(v)?.toLocal();
  }
  return null;
}
