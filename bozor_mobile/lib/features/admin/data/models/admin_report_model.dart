class ReportSummary {
  final double totalRevenue;
  final double totalDiscount;
  final double totalCost;
  final double avgOrderValue;
  final int totalOrders;
  final int deliveredOrders;
  final int cancelledOrders;
  final int pendingOrders;
  final double netProfit;
  // Phase 3.5 — Qaytarish (Returns) maydonlari (backend bilan bir xil)
  final double returnsAmount;
  final int returnsCount;
  final double replacementAmount;
  final int replacementCount;
  final double recoveredCost;
  final double netRevenue;
  final double netProfitAfterReturns;
  final double returnRate;

  ReportSummary({
    required this.totalRevenue,
    required this.totalDiscount,
    required this.totalCost,
    required this.avgOrderValue,
    required this.totalOrders,
    required this.deliveredOrders,
    required this.cancelledOrders,
    required this.pendingOrders,
    required this.netProfit,
    this.returnsAmount = 0,
    this.returnsCount = 0,
    this.replacementAmount = 0,
    this.replacementCount = 0,
    this.recoveredCost = 0,
    this.netRevenue = 0,
    this.netProfitAfterReturns = 0,
    this.returnRate = 0,
  });

  factory ReportSummary.fromJson(Map<String, dynamic> json) {
    return ReportSummary(
      totalRevenue: _double(json['total_revenue']),
      totalDiscount: _double(json['total_discount']),
      totalCost: _double(json['total_cost']),
      avgOrderValue: _double(json['avg_order_value']),
      totalOrders: _int(json['total_orders']),
      deliveredOrders: _int(json['delivered_orders']),
      cancelledOrders: _int(json['cancelled_orders']),
      pendingOrders: _int(json['pending_orders']),
      netProfit: _double(json['net_profit']),
      returnsAmount: _double(json['returns_amount']),
      returnsCount: _int(json['returns_count']),
      replacementAmount: _double(json['replacement_amount']),
      replacementCount: _int(json['replacement_count']),
      recoveredCost: _double(json['recovered_cost']),
      netRevenue: _double(json['net_revenue']),
      netProfitAfterReturns: _double(json['net_profit_after_returns']),
      returnRate: _double(json['return_rate']),
    );
  }

  bool get hasReturns => returnsCount > 0 || replacementCount > 0;
}

class ReportProduct {
  final int rank;
  final int id;
  final String name;
  final String? quality;
  final String? model;
  final String? size;
  final String? color;
  final String? sku;
  final double price;
  final double? priceUsd;
  final double? discountPrice;
  final double? discountPriceUsd;
  final double soldPrice;
  // Sotuv narx turi (sotuv vaqtida belgilangan) + chegirma miqdori.
  // 'retail' | 'discount' | 'optom' | 'master'. Optom → orange ramka.
  final String priceType;
  final double discountAmount;
  final double costPrice;
  final int stock;
  final int quantitySold;
  final double totalRevenue;
  final double netProfit;
  // Phase 3.5 — per-product qaytarish ma'lumotlari (web bilan 1:1 mos)
  final int quantityReturned;
  final int netQuantitySold;
  final double totalRefunded;
  final double netRevenue;
  final double returnRate;
  final double netProfitAfterReturns;

  ReportProduct({
    required this.rank,
    required this.id,
    required this.name,
    this.quality,
    this.model,
    this.size,
    this.color,
    this.sku,
    required this.price,
    this.priceUsd,
    this.discountPrice,
    this.discountPriceUsd,
    required this.soldPrice,
    this.priceType = 'retail',
    this.discountAmount = 0,
    required this.costPrice,
    required this.stock,
    required this.quantitySold,
    required this.totalRevenue,
    required this.netProfit,
    this.quantityReturned = 0,
    this.netQuantitySold = 0,
    this.totalRefunded = 0,
    this.netRevenue = 0,
    this.returnRate = 0,
    this.netProfitAfterReturns = 0,
  });

  bool get hasReturns => quantityReturned > 0;

  factory ReportProduct.fromJson(Map<String, dynamic> json) {
    final qs = _int(json['quantity_sold']);
    final qr = _int(json['quantity_returned']);
    return ReportProduct(
      rank: _int(json['rank']),
      id: _int(json['id']),
      name: json['name'] as String? ?? 'Noma\'lum',
      quality: json['quality'] as String?,
      model: json['model'] as String?,
      size: json['size'] as String?,
      color: json['color'] as String?,
      sku: json['sku'] as String?,
      price: _double(json['price']),
      priceUsd: json['price_usd'] != null ? _double(json['price_usd']) : null,
      discountPrice: json['discount_price'] != null ? _double(json['discount_price']) : null,
      discountPriceUsd: json['discount_price_usd'] != null ? _double(json['discount_price_usd']) : null,
      soldPrice: _double(json['sold_price']),
      priceType: json['price_type'] as String? ?? 'retail',
      discountAmount: _double(json['discount_amount']),
      costPrice: _double(json['cost_price']),
      stock: _int(json['stock']),
      quantitySold: qs,
      totalRevenue: _double(json['total_revenue']),
      netProfit: _double(json['net_profit']),
      quantityReturned: qr,
      netQuantitySold: _int(json['net_quantity_sold']) > 0
          ? _int(json['net_quantity_sold'])
          : (qs - qr),
      totalRefunded: _double(json['total_refunded']),
      netRevenue: _double(json['net_revenue']),
      returnRate: _double(json['return_rate']),
      netProfitAfterReturns: _double(json['net_profit_after_returns']),
    );
  }
}

class ReportTimeline {
  final String date;
  final double revenue;
  final double discount;
  final int count;

  ReportTimeline({
    required this.date,
    required this.revenue,
    required this.discount,
    required this.count,
  });

  factory ReportTimeline.fromJson(Map<String, dynamic> json) {
    return ReportTimeline(
      date: json['date'] as String? ?? '',
      revenue: _double(json['revenue']),
      discount: _double(json['discount']),
      count: _int(json['count']),
    );
  }
}

class ReportOrderItem {
  final int id;
  final String productName;
  final String? variantStr;
  final int quantity;
  final double originalPrice;
  final double soldPrice;
  final double discountPercent;
  final double discountAmount;
  // Phase 3.5
  final int returnedQty;
  final int netQuantity;
  final double refundedAmount;

  ReportOrderItem({
    required this.id,
    required this.productName,
    this.variantStr,
    required this.quantity,
    required this.originalPrice,
    required this.soldPrice,
    required this.discountPercent,
    required this.discountAmount,
    this.returnedQty = 0,
    this.netQuantity = 0,
    this.refundedAmount = 0,
  });

  bool get isFullyReturned => returnedQty > 0 && returnedQty >= quantity;
  bool get isPartiallyReturned => returnedQty > 0 && returnedQty < quantity;

  factory ReportOrderItem.fromJson(Map<String, dynamic> json) {
    final qty = _int(json['quantity']);
    final ret = _int(json['returned_qty']);
    return ReportOrderItem(
      id: _int(json['id']),
      productName: json['product_name'] as String? ?? 'Noma\'lum',
      variantStr: json['variant_str'] as String?,
      quantity: qty,
      originalPrice: _double(json['original_price']),
      soldPrice: _double(json['sold_price']),
      discountPercent: _double(json['discount_percent']),
      discountAmount: _double(json['discount_amount']),
      returnedQty: ret,
      netQuantity: _int(json['net_quantity']) > 0
          ? _int(json['net_quantity'])
          : (qty - ret),
      refundedAmount: _double(json['refunded_amount']),
    );
  }
}

class ReportOrder {
  final int id;
  final String createdAt;
  final String receiverName;
  final String receiverPhone;
  final double totalPrice;
  final double totalDiscount;
  final List<ReportOrderItem> items;
  // Phase 3.5
  final String returnStatus; // 'none' | 'partial' | 'full'
  final int returnedQty;
  final double refundedAmount;
  final double netTotal;
  final String? latestReturnNumber;

  ReportOrder({
    required this.id,
    required this.createdAt,
    required this.receiverName,
    required this.receiverPhone,
    required this.totalPrice,
    required this.totalDiscount,
    required this.items,
    this.returnStatus = 'none',
    this.returnedQty = 0,
    this.refundedAmount = 0,
    this.netTotal = 0,
    this.latestReturnNumber,
  });

  bool get isReturned => returnStatus != 'none';
  bool get isFullyReturned => returnStatus == 'full';

  factory ReportOrder.fromJson(Map<String, dynamic> json) {
    final total = _double(json['total_price']);
    final refunded = _double(json['refunded_amount']);
    return ReportOrder(
      id: _int(json['id']),
      createdAt: json['created_at'] as String? ?? '',
      receiverName: json['receiver_name'] as String? ?? 'Noma\'lum',
      receiverPhone: json['receiver_phone'] as String? ?? '',
      totalPrice: total,
      totalDiscount: _double(json['total_discount']),
      items: ((json['items'] as List?) ?? [])
          .map((e) => ReportOrderItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      returnStatus: json['return_status'] as String? ?? 'none',
      returnedQty: _int(json['returned_qty']),
      refundedAmount: refunded,
      netTotal: _double(json['net_total']) > 0
          ? _double(json['net_total'])
          : (total - refunded),
      latestReturnNumber: json['latest_return_number'] as String?,
    );
  }
}

class ReportData {
  final ReportSummary summary;
  final List<ReportTimeline> timeline;
  final List<ReportProduct> products;
  final List<ReportOrder> orders;

  ReportData({
    required this.summary,
    required this.timeline,
    required this.products,
    required this.orders,
  });

  factory ReportData.fromJson(Map<String, dynamic> json) {
    return ReportData(
      summary: json['summary'] != null
          ? ReportSummary.fromJson(json['summary'] as Map<String, dynamic>)
          : ReportSummary(
              totalRevenue: 0,
              totalDiscount: 0,
              totalCost: 0,
              avgOrderValue: 0,
              totalOrders: 0,
              deliveredOrders: 0,
              cancelledOrders: 0,
              pendingOrders: 0,
              netProfit: 0,
            ),
      timeline: ((json['timeline'] as List?) ?? [])
          .map((e) => ReportTimeline.fromJson(e as Map<String, dynamic>))
          .toList(),
      products: ((json['products'] as List?) ?? [])
          .map((e) => ReportProduct.fromJson(e as Map<String, dynamic>))
          .toList(),
      orders: ((json['orders'] as List?) ?? [])
          .map((e) => ReportOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
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
