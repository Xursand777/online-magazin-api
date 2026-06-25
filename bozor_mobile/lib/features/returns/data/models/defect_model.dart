// Defektlar — sotuvga yaroqsiz (writeoff) buyumlar.
// Backend: AdminDefectItemSerializer / AdminDefectStatsView.
// Web ekvivalenti: frontend/src/pages/admin/DefectsTab.tsx.

class DefectItem {
  final int id;
  final String productName;
  final String? color;
  final String? quality;
  final String? model;
  final String? size;
  final String? image;
  final int quantity;
  final String condition;
  final String conditionDisplay;
  final String? writeoffReason;
  final String? writeoffReasonDisplay;
  final String refundUnitPrice;
  final String lineTotal;
  final String returnNumber;
  final int? returnId;
  final int? orderId;
  final DateTime? createdAt;

  DefectItem({
    required this.id,
    required this.productName,
    this.color,
    this.quality,
    this.model,
    this.size,
    this.image,
    required this.quantity,
    required this.condition,
    required this.conditionDisplay,
    this.writeoffReason,
    this.writeoffReasonDisplay,
    required this.refundUnitPrice,
    required this.lineTotal,
    required this.returnNumber,
    this.returnId,
    this.orderId,
    this.createdAt,
  });

  factory DefectItem.fromJson(Map<String, dynamic> j) => DefectItem(
        id: j['id'] as int,
        productName: j['product_name'] as String? ?? 'Noma\'lum',
        color: j['color'] as String?,
        quality: j['quality'] as String?,
        model: j['model'] as String?,
        size: j['size'] as String?,
        image: j['image'] as String?,
        quantity: j['quantity'] as int? ?? 1,
        condition: j['condition'] as String? ?? 'defective',
        conditionDisplay: j['condition_display'] as String? ?? 'Aybli',
        writeoffReason: j['writeoff_reason'] as String?,
        writeoffReasonDisplay: j['writeoff_reason_display'] as String?,
        refundUnitPrice: j['refund_unit_price']?.toString() ?? '0',
        lineTotal: j['line_total']?.toString() ?? '0',
        returnNumber: j['return_number'] as String? ?? '',
        returnId: j['return_id'] as int?,
        orderId: j['order_id'] as int?,
        createdAt: j['created_at'] != null
            ? DateTime.tryParse(j['created_at'].toString())
            : null,
      );
}

class DefectConditionCount {
  final String condition;
  final int count;
  DefectConditionCount({required this.condition, required this.count});
  factory DefectConditionCount.fromJson(Map<String, dynamic> j) =>
      DefectConditionCount(
        condition: j['condition'] as String? ?? '',
        count: j['n'] as int? ?? 0,
      );
}

class DefectStats {
  final int totalRecords;
  final int totalItems;
  final String totalLoss;
  final List<DefectConditionCount> byCondition;

  DefectStats({
    required this.totalRecords,
    required this.totalItems,
    required this.totalLoss,
    required this.byCondition,
  });

  factory DefectStats.fromJson(Map<String, dynamic> j) => DefectStats(
        totalRecords: j['total_records'] as int? ?? 0,
        totalItems: j['total_items'] as int? ?? 0,
        totalLoss: j['total_loss']?.toString() ?? '0',
        byCondition: (j['by_condition'] as List<dynamic>? ?? [])
            .map((e) => DefectConditionCount.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
