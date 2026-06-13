/// Foydalanuvchi profili — `/api/profile/` javobiga mos.
///
/// Backend UserProfileSerializer maydonlari:
///   • phone — login raqami (READ-ONLY, o'zgartirib bo'lmaydi)
///   • first_name, last_name — User modeldan (editable)
///   • delivery_address — UserProfile modelidan (editable, TextField)
///   • is_admin, role, is_master, can_use_credit — read-only meta
///
/// Foydalanuvchi 1 ta manzil saqlaydi — checkout vaqtida shu auto-fill bo'ladi.
class ProfileModel {
  /// Login telefon raqami — DOIM read-only, foydalanuvchi o'zgartira olmaydi.
  final String phone;
  final String firstName;
  final String lastName;

  /// Yagona yetkazib berish manzili (TextField).
  final String deliveryAddress;

  // ── Phase 3.1 — Manzil koordinatasi va kuryer eslatmasi ────────────────
  // Mening manzilim sahifasida AddressPicker xaritasidan tanlagan koordinata.
  // Order yaratilganida bu koordinata avtomat ishlatiladi — har checkout'da
  // qayta xaritadan tanlash shart emas.
  final double? deliveryLat;
  final double? deliveryLng;
  final String deliveryNotes;

  /// Meta — read-only
  final bool isAdmin;
  final bool isMaster;
  final bool canUseCredit;

  const ProfileModel({
    required this.phone,
    this.firstName = '',
    this.lastName = '',
    this.deliveryAddress = '',
    this.deliveryLat,
    this.deliveryLng,
    this.deliveryNotes = '',
    this.isAdmin = false,
    this.isMaster = false,
    this.canUseCredit = false,
  });

  /// Ism + familya yaxlit ko'rinishi
  String get fullName {
    final parts = [firstName, lastName].where((s) => s.trim().isNotEmpty);
    return parts.join(' ');
  }

  /// Foydalanuvchi profilini to'ldirganmi (checkout uchun)?
  bool get isComplete =>
      firstName.trim().isNotEmpty &&
      lastName.trim().isNotEmpty &&
      deliveryAddress.trim().isNotEmpty;

  /// Profilda xarita koordinatasi saqlanganmi.
  bool get hasCoords => deliveryLat != null && deliveryLng != null;

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      phone: (json['phone'] as String?) ?? '',
      firstName: (json['first_name'] as String?) ?? '',
      lastName: (json['last_name'] as String?) ?? '',
      deliveryAddress: (json['delivery_address'] as String?) ?? '',
      // Phase 3.1 — koordinata Decimal sifatida string ham keladi
      deliveryLat: _doubleOrNull(json['delivery_lat']),
      deliveryLng: _doubleOrNull(json['delivery_lng']),
      deliveryNotes: (json['delivery_notes'] as String?) ?? '',
      isAdmin: (json['is_admin'] as bool?) ?? false,
      isMaster: (json['is_master'] as bool?) ?? false,
      canUseCredit: (json['can_use_credit'] as bool?) ?? false,
    );
  }

  /// PATCH payload — faqat editable maydonlar.
  /// Phone hech qachon yuborilmaydi (backend baribir rad etadi).
  Map<String, dynamic> toUpdateJson() {
    final payload = <String, dynamic>{
      'first_name': firstName.trim(),
      'last_name': lastName.trim(),
      'delivery_address': deliveryAddress.trim(),
      'delivery_notes': deliveryNotes.trim(),
    };
    // Koordinata — 6 kasrgacha qisqartirilgan (Leaflet 14 kasrli son)
    if (deliveryLat != null) {
      payload['delivery_lat'] = double.parse(deliveryLat!.toStringAsFixed(6));
    }
    if (deliveryLng != null) {
      payload['delivery_lng'] = double.parse(deliveryLng!.toStringAsFixed(6));
    }
    return payload;
  }

  ProfileModel copyWith({
    String? phone,
    String? firstName,
    String? lastName,
    String? deliveryAddress,
    double? deliveryLat,
    double? deliveryLng,
    String? deliveryNotes,
    bool? isAdmin,
    bool? isMaster,
    bool? canUseCredit,
  }) {
    return ProfileModel(
      phone: phone ?? this.phone,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      deliveryLat: deliveryLat ?? this.deliveryLat,
      deliveryLng: deliveryLng ?? this.deliveryLng,
      deliveryNotes: deliveryNotes ?? this.deliveryNotes,
      isAdmin: isAdmin ?? this.isAdmin,
      isMaster: isMaster ?? this.isMaster,
      canUseCredit: canUseCredit ?? this.canUseCredit,
    );
  }
}

/// Null-tolerant double parser — koordinata maydoni NULL bo'lishi mumkin.
/// Backend Decimal'ni string sifatida qaytaradi: "41.549912" yoki 41.549912.
double? _doubleOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) {
    if (v.isEmpty) return null;
    return double.tryParse(v);
  }
  return null;
}
