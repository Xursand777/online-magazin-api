class UserOrderPage {
  final List<UserOrderModel> orders;
  final int count;
  final bool hasNext;
  final bool hasPrev;

  const UserOrderPage({
    required this.orders,
    required this.count,
    required this.hasNext,
    required this.hasPrev,
  });

  factory UserOrderPage.fromJson(dynamic data) {
    if (data is List) {
      final list = data
          .map((e) => UserOrderModel.fromJson(e as Map<String, dynamic>))
          .toList();
      return UserOrderPage(
        orders: list,
        count: list.length,
        hasNext: false,
        hasPrev: false,
      );
    }
    final map = data as Map<String, dynamic>;
    final results = (map['results'] as List? ?? [])
        .map((e) => UserOrderModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return UserOrderPage(
      orders: results,
      count: map['count'] as int? ?? results.length,
      hasNext: map['next'] != null,
      hasPrev: map['previous'] != null,
    );
  }
}

class UserOrderModel {
  final int id;
  final String receiverName;
  final String receiverPhone;
  final String deliveryAddress;
  final String paymentMethod;
  final String status;
  final double totalPrice;
  final double deliveryPrice;
  final double discountPrice;
  final String? cancellationReason;
  final bool isCredit;
  final int? creditDays;
  final String? creditDueDate;
  final bool creditPaid;
  final String? creditPaidAt;
  final bool creditIsOverdue;
  final DateTime? createdAt;
  final bool canCancel;
  final List<UserOrderItemModel> items;
  final UserPaymentModel? payment;
  final List<UserOrderHistoryModel> history;

  const UserOrderModel({
    required this.id,
    required this.receiverName,
    required this.receiverPhone,
    required this.deliveryAddress,
    required this.paymentMethod,
    required this.status,
    required this.totalPrice,
    required this.deliveryPrice,
    required this.discountPrice,
    required this.cancellationReason,
    required this.isCredit,
    required this.creditDays,
    required this.creditDueDate,
    required this.creditPaid,
    required this.creditPaidAt,
    required this.creditIsOverdue,
    required this.createdAt,
    required this.canCancel,
    required this.items,
    required this.payment,
    required this.history,
  });

  factory UserOrderModel.fromJson(Map<String, dynamic> json) {
    return UserOrderModel(
      id: _int(json['id']),
      receiverName: json['receiver_name'] as String? ?? '',
      receiverPhone: json['receiver_phone'] as String? ?? '',
      deliveryAddress: json['delivery_address'] as String? ?? '',
      paymentMethod: json['payment_method'] as String? ?? '',
      status: json['status'] as String? ?? '',
      totalPrice: _double(json['total_price']),
      deliveryPrice: _double(json['delivery_price']),
      discountPrice: _double(json['discount_price']),
      cancellationReason: json['cancellation_reason'] as String?,
      isCredit: json['is_credit'] as bool? ?? false,
      creditDays: json['credit_days'] as int?,
      creditDueDate: json['credit_due_date']?.toString(),
      creditPaid: json['credit_paid'] as bool? ?? false,
      creditPaidAt: json['credit_paid_at']?.toString(),
      creditIsOverdue: json['credit_is_overdue'] as bool? ?? false,
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')?.toLocal(),
      canCancel: json['can_cancel'] as bool? ?? false,
      items: ((json['items'] as List?) ?? [])
          .map((e) => UserOrderItemModel.fromJson(e as Map<String, dynamic>))
          .toList(),
      payment: json['payment'] is Map
          ? UserPaymentModel.fromJson(json['payment'] as Map<String, dynamic>)
          : null,
      history: ((json['history'] as List?) ?? [])
          .map((e) => UserOrderHistoryModel.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class UserOrderItemModel {
  final int id;
  final int quantity;
  final double priceSnapshot;
  final String productName;
  final String? mainImage;
  final String variantText;

  const UserOrderItemModel({
    required this.id,
    required this.quantity,
    required this.priceSnapshot,
    required this.productName,
    required this.mainImage,
    required this.variantText,
  });

  factory UserOrderItemModel.fromJson(Map<String, dynamic> json) {
    final pd = (json['product_details'] as Map?) ?? const {};
    final vd = json['variant_details'] as Map?;
    String variantText = '';
    if (vd != null) {
      variantText = [vd['color'], vd['quality'], vd['model'], vd['size']]
          .where((e) => e != null && '$e'.trim().isNotEmpty)
          .join(' / ');
    }
    return UserOrderItemModel(
      id: _int(json['id']),
      quantity: _int(json['quantity']),
      priceSnapshot: _double(json['price_snapshot']),
      productName: pd['name'] as String? ?? 'Mahsulot',
      mainImage: pd['main_image'] as String?,
      variantText: variantText,
    );
  }
}

class UserPaymentModel {
  final String method;
  final String status;

  const UserPaymentModel({required this.method, required this.status});

  factory UserPaymentModel.fromJson(Map<String, dynamic> json) {
    return UserPaymentModel(
      method: json['method'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class UserOrderHistoryModel {
  final int id;
  final String fromStatus;
  final String toStatus;
  final String actorType;
  final String? actorName;
  final String? note;
  final DateTime? createdAt;

  const UserOrderHistoryModel({
    required this.id,
    required this.fromStatus,
    required this.toStatus,
    required this.actorType,
    required this.actorName,
    required this.note,
    required this.createdAt,
  });

  factory UserOrderHistoryModel.fromJson(Map<String, dynamic> json) {
    return UserOrderHistoryModel(
      id: _int(json['id']),
      fromStatus: json['from_status'] as String? ?? '',
      toStatus: json['to_status'] as String? ?? '',
      actorType: json['actor_type'] as String? ?? '',
      actorName: json['actor_name'] as String?,
      note: json['note'] as String?,
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')?.toLocal(),
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
