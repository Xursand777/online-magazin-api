// `/api/orders/admin/` (OrderSerializer) modeli.

class AdminOrderPage {
  final List<AdminOrder> orders;
  final int count;
  final bool hasNext;
  final bool hasPrev;

  const AdminOrderPage({
    required this.orders,
    required this.count,
    required this.hasNext,
    required this.hasPrev,
  });

  factory AdminOrderPage.fromJson(dynamic data) {
    if (data is List) {
      final list = data
          .map((e) => AdminOrder.fromJson(e as Map<String, dynamic>))
          .toList();
      return AdminOrderPage(
        orders: list,
        count: list.length,
        hasNext: false,
        hasPrev: false,
      );
    }
    final map = data as Map<String, dynamic>;
    final results = (map['results'] as List? ?? [])
        .map((e) => AdminOrder.fromJson(e as Map<String, dynamic>))
        .toList();
    return AdminOrderPage(
      orders: results,
      count: map['count'] as int? ?? results.length,
      hasNext: map['next'] != null,
      hasPrev: map['previous'] != null,
    );
  }
}

class AdminOrder {
  final int id;
  final String receiverName;
  final String receiverPhone;
  final String deliveryAddress;
  // ── Phase 3.0 — Kuryer navigatsiyasi maydonlari ───────────────────────
  // Mijoz AddressPicker xaritasida tanlagan koordinata. NULL bo'lishi
  // mumkin (eski buyurtmalar yoki mijoz xaritadan tanlamagan).
  // Kuryer xaritasi (CourierRouteMapPage) shu nuqtaga real-time yo'l chizadi.
  final double? deliveryLat;
  final double? deliveryLng;
  final String deliveryNotes;
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
  final bool canAdminCancel;
  // Backend-avtoritar: nasiyani yopa oladimi (faqat admin/super). Kuryer/sotuvchi
  // uchun false → "Nasiyani yopish" tugmasi ko'rinmaydi.
  final bool canPayCredit;
  // Backend-avtoritar: shu xodim o'tkaza oladigan oldinga holatlar (rol bo'yicha).
  // Kuryer: SHIPPING→['DELIVERED'], DELIVERED→['RECEIVED']. Tugmalar shu bo'yicha.
  final List<String> allowedTransitions;
  final String? userPhone;
  final List<AdminOrderItem> items;
  final AdminPayment? payment;
  final List<AdminOrderHistory> history;

  const AdminOrder({
    required this.id,
    required this.receiverName,
    required this.receiverPhone,
    required this.deliveryAddress,
    required this.deliveryLat,
    required this.deliveryLng,
    required this.deliveryNotes,
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
    required this.canAdminCancel,
    required this.canPayCredit,
    required this.allowedTransitions,
    required this.userPhone,
    required this.items,
    required this.payment,
    required this.history,
  });

  bool get isPos => deliveryAddress.contains('POS');

  /// Kuryer xaritasi mavjudmi — koordinata bor va SHIPPING jarayonidagi
  /// holatlardan biri. Mahalliy buyurtmalar (POS) uchun xarita kerakmas.
  bool get hasDeliveryRoute =>
      deliveryLat != null && deliveryLng != null && !isPos;

  /// Phase 3.1 — "Xaritadan borish" tugmasi ko'rinishi kerakmi.
  ///
  /// MUKAMMAL LOGIKA:
  ///   • Faqat PACKING/SHIPPING/DELIVERED holatlarda ko'rinadi
  ///     (kuryer aktiv ishlayotgan vaqt — buyurtma yig'ilgan/yo'lda)
  ///   • PENDING/AWAITING_PAYMENT/CONFIRMED da hali kuryer kerakmas
  ///   • RECEIVED (xaridorga topshirilgan) da YO'Q — yetkazib berish tugadi,
  ///     navigatsiya kerakmas (barcha rollarda yo'qoladi)
  ///   • POS buyurtmalarda yo'q (do'kondan olib ketiladi)
  ///   • Bekor qilingan buyurtmalarda yo'q
  ///   • Koordinata bo'lmasa ham ko'rinadi — sahifa fallback bilan
  ///     tashqi xaritalar (Yandex/Google/2GIS) deep link ko'rsatadi.
  bool get canShowRouteButton {
    if (isPos) return false;
    const allowed = {'PACKING', 'SHIPPING', 'DELIVERED'};
    return allowed.contains(status);
  }

  factory AdminOrder.fromJson(Map<String, dynamic> json) {
    final user = json['user'];
    return AdminOrder(
      id: _int(json['id']),
      receiverName: json['receiver_name'] as String? ?? '',
      receiverPhone: json['receiver_phone'] as String? ?? '',
      deliveryAddress: json['delivery_address'] as String? ?? '',
      // Phase 3.0 — koordinata Decimal sifatida string ham keladi
      deliveryLat: _doubleOrNull(json['delivery_lat']),
      deliveryLng: _doubleOrNull(json['delivery_lng']),
      deliveryNotes: json['delivery_notes'] as String? ?? '',
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
      canAdminCancel: json['can_admin_cancel'] as bool? ?? false,
      canPayCredit: json['can_pay_credit'] as bool? ?? false,
      allowedTransitions: ((json['allowed_transitions'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      userPhone: user is Map ? user['phone'] as String? : null,
      items: ((json['items'] as List?) ?? [])
          .map((e) => AdminOrderItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      payment: json['payment'] is Map
          ? AdminPayment.fromJson(json['payment'] as Map<String, dynamic>)
          : null,
      history: ((json['history'] as List?) ?? [])
          .map((e) => AdminOrderHistory.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class AdminOrderItem {
  final int id;
  final int quantity;
  final double priceSnapshot;
  final String productName;
  final String? mainImage;
  final String variantText;

  const AdminOrderItem({
    required this.id,
    required this.quantity,
    required this.priceSnapshot,
    required this.productName,
    required this.mainImage,
    required this.variantText,
  });

  factory AdminOrderItem.fromJson(Map<String, dynamic> json) {
    final pd = (json['product_details'] as Map?) ?? const {};
    final vd = json['variant_details'] as Map?;
    String variantText = '';
    if (vd != null) {
      variantText = [vd['color'], vd['quality'], vd['model'], vd['size']]
          .where((e) => e != null && '$e'.trim().isNotEmpty)
          .join(' / ');
    }
    return AdminOrderItem(
      id: _int(json['id']),
      quantity: _int(json['quantity']),
      priceSnapshot: _double(json['price_snapshot']),
      productName: pd['name'] as String? ?? 'Mahsulot',
      mainImage: pd['main_image'] as String?,
      variantText: variantText,
    );
  }
}

class AdminPayment {
  final String method;
  final String status;

  const AdminPayment({required this.method, required this.status});

  factory AdminPayment.fromJson(Map<String, dynamic> json) {
    return AdminPayment(
      method: json['method'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class AdminOrderHistory {
  final int id;
  final String toStatus;
  final String? actorName;
  final String actorType;
  final String? note;
  final DateTime? createdAt;

  const AdminOrderHistory({
    required this.id,
    required this.toStatus,
    required this.actorName,
    required this.actorType,
    required this.note,
    required this.createdAt,
  });

  factory AdminOrderHistory.fromJson(Map<String, dynamic> json) {
    return AdminOrderHistory(
      id: _int(json['id']),
      toStatus: json['to_status'] as String? ?? '',
      actorName: json['actor_name'] as String?,
      actorType: json['actor_type'] as String? ?? '',
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

/// Null-tolerant double parser — koordinata maydonlari NULL bo'lishi mumkin.
/// Backend Decimal'ni string sifatida qaytaradi: "41.549912".
double? _doubleOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) {
    if (v.isEmpty) return null;
    return double.tryParse(v);
  }
  return null;
}
