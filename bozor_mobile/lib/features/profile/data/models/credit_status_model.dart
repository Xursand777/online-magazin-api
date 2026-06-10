import 'package:equatable/equatable.dart';

/// Foydalanuvchining muddatli to'lov holati.
/// `GET /api/orders/credit-status/` javobiga mos.
///
/// MUHIM biznes qoidasi: muddatli to'lov FAQAT ustalar uchun.
/// Bu modeldan foydalanish OLDIDAN UI tomonida `isMaster` tekshirilishi shart.
///
/// Maydonlar:
///   • credit_ban — 3 marta overdue → doimiy bloklash
///   • overdue_credit_count — muddati o'tgan to'lovlar jami soni
///   • has_unpaid_credit — faol to'lanmagan kredit bormi?
///   • unpaid_credit_order_id — agar bo'lsa, buyurtma ID
///   • unpaid_credit_due_date — to'lov muddati
///   • is_overdue — joriy kredit muddati o'tganmi?
class CreditStatusModel extends Equatable {
  final bool creditBan;
  final int overdueCreditCount;
  final bool hasUnpaidCredit;
  final int? unpaidCreditOrderId;
  final DateTime? unpaidCreditDueDate;
  final bool isOverdue;

  const CreditStatusModel({
    this.creditBan = false,
    this.overdueCreditCount = 0,
    this.hasUnpaidCredit = false,
    this.unpaidCreditOrderId,
    this.unpaidCreditDueDate,
    this.isOverdue = false,
  });

  /// UI'da ko'rsatish uchun yagona STATE (state machine yondashuvi):
  ///   • banned     — doimiy bloklangan (3 marta overdue)
  ///   • overdue    — to'lov muddati o'tib ketgan (KRITIK)
  ///   • active     — faol kredit bor, lekin muddatda
  ///   • normal     — hech narsa yo'q, muddatli to'lov ishlatish mumkin
  CreditStatusState get state {
    if (creditBan) return CreditStatusState.banned;
    if (isOverdue) return CreditStatusState.overdue;
    if (hasUnpaidCredit) return CreditStatusState.active;
    return CreditStatusState.normal;
  }

  /// To'lovgacha qancha kun qoldi (faqat faol kredit bo'lsa).
  /// Manfiy bo'lsa o'tib ketgan (kun soni).
  int? get daysUntilDue {
    if (unpaidCreditDueDate == null) return null;
    final today = DateTime.now();
    final due = DateTime(
      unpaidCreditDueDate!.year,
      unpaidCreditDueDate!.month,
      unpaidCreditDueDate!.day,
    );
    final now = DateTime(today.year, today.month, today.day);
    return due.difference(now).inDays;
  }

  factory CreditStatusModel.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic v) {
      if (v == null || v is! String || v.isEmpty) return null;
      return DateTime.tryParse(v);
    }

    int parseInt(dynamic v) {
      if (v == null) return 0;
      if (v is int) return v;
      if (v is double) return v.toInt();
      if (v is String) return int.tryParse(v) ?? 0;
      return 0;
    }

    return CreditStatusModel(
      creditBan: (json['credit_ban'] as bool?) ?? false,
      overdueCreditCount: parseInt(json['overdue_credit_count']),
      hasUnpaidCredit: (json['has_unpaid_credit'] as bool?) ?? false,
      unpaidCreditOrderId: json['unpaid_credit_order_id'] == null
          ? null
          : parseInt(json['unpaid_credit_order_id']),
      unpaidCreditDueDate: parseDate(json['unpaid_credit_due_date']),
      isOverdue: (json['is_overdue'] as bool?) ?? false,
    );
  }

  static const empty = CreditStatusModel();

  @override
  List<Object?> get props => [
        creditBan,
        overdueCreditCount,
        hasUnpaidCredit,
        unpaidCreditOrderId,
        unpaidCreditDueDate,
        isOverdue,
      ];
}

/// Credit status — UI uchun yagona enum (state machine).
enum CreditStatusState {
  /// Hech qanday muammo yo'q. Kredit ishlatish mumkin.
  normal,

  /// Faol kredit bor, muddatda to'liq to'lash mumkin.
  active,

  /// To'lov muddati o'tib ketgan — DARHOL to'lash kerak.
  overdue,

  /// Foydalanuvchi 3 marta muddatni o'tkazib yuborgan — DOIMIY ban.
  banned,
}
