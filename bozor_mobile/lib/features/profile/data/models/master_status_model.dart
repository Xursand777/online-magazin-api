import 'package:equatable/equatable.dart';

/// Usta (Master) statusi — `GET /api/master/status/` javobiga mos.
///
/// Backend `master_status(user)` funksiyasidan keladi (orders/services.py).
///
/// Maydonlar:
///   • is_master — foydalanuvchi ustami? (False bo'lsa, kart ko'rsatilmaydi)
///   • base_percent — global usta chegirma foizi (admin sozlamasi)
///   • effective_percent — joriy AMALDAGI chegirma (faollikka qarab kamayishi mumkin)
///   • level — joriy daraja (0–max_level). Yuqori daraja = ko'proq chegirma.
///   • max_level — eng yuqori mumkin bo'lgan daraja (3 odatda)
///   • days_since_last_purchase — oxirgi xariddan o'tgan kunlar
///   • last_purchase_at — oxirgi xarid sanasi
class MasterStatusModel extends Equatable {
  final bool isMaster;
  final double basePercent;
  final double effectivePercent;
  final int level;
  final int maxLevel;
  final int? daysSinceLastPurchase;
  final DateTime? lastPurchaseAt;

  const MasterStatusModel({
    required this.isMaster,
    this.basePercent = 0,
    this.effectivePercent = 0,
    this.level = 0,
    this.maxLevel = 3,
    this.daysSinceLastPurchase,
    this.lastPurchaseAt,
  });

  /// Chegirma foizi NORMALDA berilayaptimi? (effective >= base ning yarmidan)
  /// UI'da "daraja kamaymoqda" ogohlantirishi uchun.
  bool get isAtFullDiscount =>
      basePercent > 0 && effectivePercent >= basePercent;

  /// Foydalanuvchi sotib olishni kechiktiryaptimi?
  /// 30 kun va undan ko'p bo'lsa, daraja avtomatik kamayadi.
  bool get isInactiveLong =>
      daysSinceLastPurchase != null && daysSinceLastPurchase! >= 30;

  /// Yangi mehmon (hali xarid qilmagan) — UI'da "boshlash" rejimi.
  bool get hasNeverPurchased => lastPurchaseAt == null;

  factory MasterStatusModel.fromJson(Map<String, dynamic> json) {
    double parseDouble(dynamic v) {
      if (v == null) return 0;
      if (v is double) return v;
      if (v is int) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? 0;
      return 0;
    }

    int parseInt(dynamic v) {
      if (v == null) return 0;
      if (v is int) return v;
      if (v is double) return v.toInt();
      if (v is String) return int.tryParse(v) ?? 0;
      return 0;
    }

    DateTime? parseDate(dynamic v) {
      if (v == null || v is! String || v.isEmpty) return null;
      return DateTime.tryParse(v);
    }

    return MasterStatusModel(
      isMaster: (json['is_master'] as bool?) ?? false,
      basePercent: parseDouble(json['base_percent']),
      effectivePercent: parseDouble(json['effective_percent']),
      level: parseInt(json['level']),
      maxLevel: parseInt(json['max_level']),
      daysSinceLastPurchase: json['days_since_last_purchase'] == null
          ? null
          : parseInt(json['days_since_last_purchase']),
      lastPurchaseAt: parseDate(json['last_purchase_at']),
    );
  }

  /// Bo'sh placeholder — backend xato qaytarsa fallback.
  static const empty = MasterStatusModel(isMaster: false);

  @override
  List<Object?> get props => [
        isMaster,
        basePercent,
        effectivePercent,
        level,
        maxLevel,
        daysSinceLastPurchase,
        lastPurchaseAt,
      ];
}
