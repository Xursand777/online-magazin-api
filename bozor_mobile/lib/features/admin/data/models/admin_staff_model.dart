/// Xodim (Staff) modeli — backend StaffListView javobiga mos.
class StaffMember {
  final int id;
  final String phone;
  final String firstName;
  final String lastName;
  final String? role;
  final String? roleDisplay;
  final bool isActive;
  final String? dateJoined;

  const StaffMember({
    required this.id,
    required this.phone,
    this.firstName = '',
    this.lastName = '',
    this.role,
    this.roleDisplay,
    this.isActive = true,
    this.dateJoined,
  });

  /// Ism + familiyani birlashtirib qaytaradi. Bo'sh bo'lsa — phone fallback.
  String get displayName {
    final parts = [firstName, lastName].where((s) => s.trim().isNotEmpty);
    return parts.isNotEmpty ? parts.join(' ') : phone;
  }

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    return StaffMember(
      id: json['id'] as int? ?? 0,
      phone: json['phone'] as String? ?? '',
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
      role: json['role'] as String?,
      roleDisplay: json['role_display'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      dateJoined: json['date_joined'] as String?,
    );
  }
}

/// Rol tayinlash javob modeli.
class AssignRoleResult {
  final String phone;
  final String? oldRole;
  final String? newRole;
  final bool isStaff;

  const AssignRoleResult({
    required this.phone,
    this.oldRole,
    this.newRole,
    required this.isStaff,
  });

  factory AssignRoleResult.fromJson(Map<String, dynamic> json) {
    return AssignRoleResult(
      phone: json['phone'] as String? ?? '',
      oldRole: json['old_role'] as String?,
      newRole: json['new_role'] as String?,
      isStaff: json['is_staff'] as bool? ?? false,
    );
  }
}

/// Rol konstantalari va ularning o'zbekcha nomlari.
class StaffRoles {
  static const String admin   = 'admin';
  static const String seller  = 'seller';
  static const String courier = 'courier';

  /// API ga yuboriladigan rollar ro'yxati (super_admin yo'q — tayinlab bo'lmaydi).
  static const List<String> assignableRoles = [admin, seller, courier];

  /// Rol → o'zbekcha nom
  static const Map<String, String> labels = {
    'super_admin': 'Super Admin',
    admin:         'Admin',
    seller:        'Sotuvchi',
    courier:       'Kuryer',
  };

  /// Rol → tushuntirish
  static const Map<String, String> descriptions = {
    'super_admin': 'Barcha huquqlar. Tizim yaratuvchisi.',
    admin:         'Mahsulot, kategoriya, buyurtma, kassa, hisobot, banner.',
    seller:        'POS savdo, buyurtma tasdiqlash, ombor.',
    courier:       'Buyurtmalarni ko\'rish va yetkazib berish.',
  };

  static String label(String? role) => labels[role] ?? role ?? 'Noma\'lum';
}
