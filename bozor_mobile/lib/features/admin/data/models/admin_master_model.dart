/// Usta (Master) modeli — backend MasterListView javobiga mos.
class MasterMember {
  final int id;
  final String phone;
  final String firstName;
  final String lastName;
  final String? fullName;
  final bool isMaster;
  final bool isActive;
  final String? dateJoined;

  const MasterMember({
    required this.id,
    required this.phone,
    this.firstName = '',
    this.lastName = '',
    this.fullName,
    this.isMaster = true,
    this.isActive = true,
    this.dateJoined,
  });

  /// Serverdan full_name keladi. Fallback: firstName + lastName, yoki phone.
  String get displayName {
    if (fullName != null && fullName!.trim().isNotEmpty) return fullName!;
    final parts = [firstName, lastName].where((s) => s.trim().isNotEmpty);
    return parts.isNotEmpty ? parts.join(' ') : phone;
  }

  factory MasterMember.fromJson(Map<String, dynamic> json) {
    return MasterMember(
      id: json['id'] as int? ?? 0,
      phone: json['phone'] as String? ?? '',
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
      fullName: json['full_name'] as String?,
      isMaster: json['is_master'] as bool? ?? true,
      isActive: json['is_active'] as bool? ?? true,
      dateJoined: json['date_joined'] as String?,
    );
  }
}

/// Chegirma foizi modeli.
class MasterDiscount {
  final double percent;

  const MasterDiscount({required this.percent});

  factory MasterDiscount.fromJson(Map<String, dynamic> json) {
    return MasterDiscount(
      percent: (json['percent'] as num?)?.toDouble() ?? 5.0,
    );
  }
}

/// Faollikka asoslangan chegirma darajalari (4 pog'onali tizim).
///
/// Backend logikasi:
///   level 4 = 100% of base (har kuni xarid)
///   level 3 = 75%  (2 kunda bir)
///   level 2 = 50%  (3-4 kunda bir)
///   level 1 = 25%  (5-6 kun sust)
///   level 0 = 0%   (7+ kun harakatsiz)
class MasterDiscountTiers {
  static List<DiscountTier> calculate(double basePercent) {
    return [
      DiscountTier(
        label: 'Har kuni (0-1 kun)',
        percent: basePercent,
        level: 4,
      ),
      DiscountTier(
        label: '2 kunda bir',
        percent: basePercent * 0.75,
        level: 3,
      ),
      DiscountTier(
        label: '3-4 kunda bir',
        percent: basePercent * 0.50,
        level: 2,
      ),
      DiscountTier(
        label: '5-6 kun sust',
        percent: basePercent * 0.25,
        level: 1,
      ),
      DiscountTier(
        label: 'Haftada bir / 10 kun',
        percent: 0,
        level: 0,
      ),
      DiscountTier(
        label: 'Yangi usta',
        percent: basePercent,
        level: 4,
        isWelcome: true,
      ),
    ];
  }
}

class DiscountTier {
  final String label;
  final double percent;
  final int level;
  final bool isWelcome;

  const DiscountTier({
    required this.label,
    required this.percent,
    required this.level,
    this.isWelcome = false,
  });

  String get percentText => '${percent.toStringAsFixed(percent == percent.roundToDouble() ? 0 : 1)}%';

  /// YANGI MODEL: tier narxining ma'nosi (optom asosida).
  ///   level 4 → "optom + base%" (eng arzon)
  ///   0<level<4 → optom↔oddiy oralig'i
  ///   level 0 → oddiy narx (imtiyoz yo'q)
  String get benefitText {
    if (level <= 0) return 'oddiy narx';
    if (level >= 4) {
      final p = percent.toStringAsFixed(percent == percent.roundToDouble() ? 0 : 1);
      return 'optom + $p%';
    }
    return "optom↔oddiy";
  }

  /// Imtiyoz kuchi (level/4): 100% / ¾ / ½ / ¼ / 0.
  String get strengthText {
    switch (level) {
      case 4:
        return '100%';
      case 3:
        return '¾';
      case 2:
        return '½';
      case 1:
        return '¼';
      default:
        return '0';
    }
  }
}
