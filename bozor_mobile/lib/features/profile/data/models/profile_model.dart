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
  /// User to'liq formatda yozadi: "Toshkent shahar, Yunusobod tumani,
  /// Bobur ko'chasi 12-uy, 5-xonadon".
  final String deliveryAddress;

  /// Meta — read-only
  final bool isAdmin;
  final bool isMaster;
  final bool canUseCredit;

  const ProfileModel({
    required this.phone,
    this.firstName = '',
    this.lastName = '',
    this.deliveryAddress = '',
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

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    return ProfileModel(
      phone: (json['phone'] as String?) ?? '',
      firstName: (json['first_name'] as String?) ?? '',
      lastName: (json['last_name'] as String?) ?? '',
      deliveryAddress: (json['delivery_address'] as String?) ?? '',
      isAdmin: (json['is_admin'] as bool?) ?? false,
      isMaster: (json['is_master'] as bool?) ?? false,
      canUseCredit: (json['can_use_credit'] as bool?) ?? false,
    );
  }

  /// PATCH payload — faqat editable maydonlar.
  /// Phone hech qachon yuborilmaydi (backend baribir rad etadi).
  Map<String, dynamic> toUpdateJson() => {
        'first_name': firstName.trim(),
        'last_name': lastName.trim(),
        'delivery_address': deliveryAddress.trim(),
      };

  ProfileModel copyWith({
    String? phone,
    String? firstName,
    String? lastName,
    String? deliveryAddress,
    bool? isAdmin,
    bool? isMaster,
    bool? canUseCredit,
  }) {
    return ProfileModel(
      phone: phone ?? this.phone,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      isAdmin: isAdmin ?? this.isAdmin,
      isMaster: isMaster ?? this.isMaster,
      canUseCredit: canUseCredit ?? this.canUseCredit,
    );
  }
}
