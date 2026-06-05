class AdminKassaPaymentBreakdown {
  final double cash;
  final double card;
  final double credit;

  AdminKassaPaymentBreakdown({
    required this.cash,
    required this.card,
    required this.credit,
  });

  factory AdminKassaPaymentBreakdown.fromJson(Map<String, dynamic> json) {
    return AdminKassaPaymentBreakdown(
      cash: _d(json['cash']),
      card: _d(json['card']),
      credit: _d(json['credit']),
    );
  }

  static double _d(dynamic v) => (v ?? 0).toString().isEmpty ? 0.0 : double.tryParse(v.toString()) ?? 0.0;
}

class AdminKassaChartItem {
  final String date;
  final double income;

  AdminKassaChartItem({
    required this.date,
    required this.income,
  });

  factory AdminKassaChartItem.fromJson(Map<String, dynamic> json) {
    return AdminKassaChartItem(
      date: json['date'] as String? ?? '',
      income: _d(json['income']),
    );
  }

  static double _d(dynamic v) => (v ?? 0).toString().isEmpty ? 0.0 : double.tryParse(v.toString()) ?? 0.0;
}

class AdminKassaHistoryItem {
  final int id;
  final double amount;
  final String reason;
  final String createdAt;
  final String adminName;

  AdminKassaHistoryItem({
    required this.id,
    required this.amount,
    required this.reason,
    required this.createdAt,
    required this.adminName,
  });

  factory AdminKassaHistoryItem.fromJson(Map<String, dynamic> json) {
    return AdminKassaHistoryItem(
      id: json['id'] as int? ?? 0,
      amount: _d(json['amount']),
      reason: json['reason'] as String? ?? '',
      createdAt: json['created_at'] as String? ?? '',
      adminName: json['admin_name'] as String? ?? '',
    );
  }

  static double _d(dynamic v) => (v ?? 0).toString().isEmpty ? 0.0 : double.tryParse(v.toString()) ?? 0.0;
}

class AdminKassaModel {
  final double totalIncome;
  final double totalExpense;
  final double balance;
  final AdminKassaPaymentBreakdown paymentBreakdown;
  final List<AdminKassaChartItem> weeklyChart;
  final List<AdminKassaHistoryItem> history;

  AdminKassaModel({
    required this.totalIncome,
    required this.totalExpense,
    required this.balance,
    required this.paymentBreakdown,
    required this.weeklyChart,
    required this.history,
  });

  factory AdminKassaModel.fromJson(Map<String, dynamic> json) {
    return AdminKassaModel(
      totalIncome: _d(json['total_income']),
      totalExpense: _d(json['total_expense']),
      balance: _d(json['balance']),
      paymentBreakdown: json['payment_breakdown'] != null 
          ? AdminKassaPaymentBreakdown.fromJson(json['payment_breakdown']) 
          : AdminKassaPaymentBreakdown(cash: 0, card: 0, credit: 0),
      weeklyChart: (json['weekly_chart'] as List<dynamic>?)
          ?.map((e) => AdminKassaChartItem.fromJson(e as Map<String, dynamic>))
          .toList() ?? [],
      history: (json['history'] as List<dynamic>?)
          ?.map((e) => AdminKassaHistoryItem.fromJson(e as Map<String, dynamic>))
          .toList() ?? [],
    );
  }

  static double _d(dynamic v) => (v ?? 0).toString().isEmpty ? 0.0 : double.tryParse(v.toString()) ?? 0.0;
}
