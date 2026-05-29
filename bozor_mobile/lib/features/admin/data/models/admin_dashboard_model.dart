/// `/api/orders/admin/dashboard/` javobi.
class DashboardData {
  final int todayOrders;
  final double todayRevenue;
  final int monthOrders;
  final double monthRevenue;
  final int pendingOrders;
  final int processingOrders;
  final int overdueCredits;
  final double kassaBalance;
  final int lowStock;
  final int outOfStock;
  final Map<String, int> statusBreakdown;
  final List<RecentOrder> recentOrders;
  final List<WeeklyPoint> weeklyChart;
  final int feedbackNew;

  const DashboardData({
    required this.todayOrders,
    required this.todayRevenue,
    required this.monthOrders,
    required this.monthRevenue,
    required this.pendingOrders,
    required this.processingOrders,
    required this.overdueCredits,
    required this.kassaBalance,
    required this.lowStock,
    required this.outOfStock,
    required this.statusBreakdown,
    required this.recentOrders,
    required this.weeklyChart,
    required this.feedbackNew,
  });

  factory DashboardData.fromJson(Map<String, dynamic> json) {
    final today = (json['today'] as Map?) ?? const {};
    final month = (json['month'] as Map?) ?? const {};
    final stock = (json['stock'] as Map?) ?? const {};
    final breakdown = (json['status_breakdown'] as Map?) ?? const {};

    return DashboardData(
      todayOrders: _int(today['orders']),
      todayRevenue: _double(today['revenue']),
      monthOrders: _int(month['orders']),
      monthRevenue: _double(month['revenue']),
      pendingOrders: _int(json['pending_orders']),
      processingOrders: _int(json['processing_orders']),
      overdueCredits: _int(json['overdue_credits']),
      kassaBalance: _double(json['kassa_balance']),
      lowStock: _int(stock['low_stock']),
      outOfStock: _int(stock['out_of_stock']),
      statusBreakdown: breakdown.map(
        (key, value) => MapEntry(key as String, _int(value)),
      ),
      recentOrders: ((json['recent_orders'] as List?) ?? [])
          .map((e) => RecentOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
      weeklyChart: ((json['weekly_chart'] as List?) ?? [])
          .map((e) => WeeklyPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
      feedbackNew: _int(json['feedback_new']),
    );
  }
}

class RecentOrder {
  final int id;
  final String status;
  final double totalPrice;
  final String receiverName;
  final String receiverPhone;
  final DateTime? createdAt;
  final String paymentMethod;
  final bool isCredit;
  final int itemCount;

  const RecentOrder({
    required this.id,
    required this.status,
    required this.totalPrice,
    required this.receiverName,
    required this.receiverPhone,
    required this.createdAt,
    required this.paymentMethod,
    required this.isCredit,
    required this.itemCount,
  });

  factory RecentOrder.fromJson(Map<String, dynamic> json) {
    return RecentOrder(
      id: _int(json['id']),
      status: json['status'] as String? ?? '',
      totalPrice: _double(json['total_price']),
      receiverName: json['receiver_name'] as String? ?? '',
      receiverPhone: json['receiver_phone'] as String? ?? '',
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')?.toLocal(),
      paymentMethod: json['payment_method'] as String? ?? '',
      isCredit: json['is_credit'] as bool? ?? false,
      itemCount: _int(json['item_count']),
    );
  }
}

class WeeklyPoint {
  final String date;
  final double revenue;
  final int orders;

  const WeeklyPoint({
    required this.date,
    required this.revenue,
    required this.orders,
  });

  factory WeeklyPoint.fromJson(Map<String, dynamic> json) {
    return WeeklyPoint(
      date: json['date'] as String? ?? '',
      revenue: _double(json['revenue']),
      orders: _int(json['orders']),
    );
  }
}

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
