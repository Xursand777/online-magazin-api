// Phase 3.6: Qaytarish (Return) modellari — web ReturnsTab.tsx tipidan
// 1-1 mos. Backend `OrderReturnSerializer` natijasini parse qiladi.

class OrderReturnPhoto {
  final int id;
  final String image;
  final String kind; // 'claim' | 'inspection'
  final String? uploadedAt;

  OrderReturnPhoto({
    required this.id,
    required this.image,
    required this.kind,
    this.uploadedAt,
  });

  factory OrderReturnPhoto.fromJson(Map<String, dynamic> j) => OrderReturnPhoto(
        id: j['id'] as int,
        image: j['image'] as String? ?? '',
        kind: j['kind'] as String? ?? 'claim',
        uploadedAt: j['uploaded_at'] as String?,
      );
}

class OrderReturnItem {
  final int id;
  final int orderItem;
  final int quantity;
  final String refundUnitPrice;
  final String condition;
  final bool restock;
  final String? writeoffReason;
  final String productName;
  final String lineTotal;

  OrderReturnItem({
    required this.id,
    required this.orderItem,
    required this.quantity,
    required this.refundUnitPrice,
    required this.condition,
    required this.restock,
    this.writeoffReason,
    required this.productName,
    required this.lineTotal,
  });

  factory OrderReturnItem.fromJson(Map<String, dynamic> j) => OrderReturnItem(
        id: j['id'] as int,
        orderItem: j['order_item'] as int,
        quantity: j['quantity'] as int? ?? 1,
        refundUnitPrice: j['refund_unit_price']?.toString() ?? '0',
        condition: j['condition'] as String? ?? 'new',
        restock: j['restock'] as bool? ?? true,
        writeoffReason: j['writeoff_reason'] as String?,
        productName: j['product_name'] as String? ?? '',
        lineTotal: j['line_total']?.toString() ?? '0',
      );
}

class OrderReturn {
  final int id;
  final String returnNumber;
  final int orderId;
  final int? replacementOrderId;
  final String status;
  final String reasonCode;
  final String reasonText;
  final String customerRequestNote;
  final String initiatorRole;
  final String refundMethod;
  final String refundAmount;
  final String? refundReference;
  final String? refundProcessedAt;
  final String? inspectionNotes;
  final String? rejectionReason;
  final String createdAt;
  final String? statusChangedAt;
  final List<OrderReturnItem> items;
  final List<OrderReturnPhoto> photos;
  final bool isActive;
  final bool isTerminal;
  final bool isSuccess;
  // Phase 3.3 — kassa balansi (Detail endpointida qaytariladi)
  final double? kassaBalance;

  OrderReturn({
    required this.id,
    required this.returnNumber,
    required this.orderId,
    this.replacementOrderId,
    required this.status,
    required this.reasonCode,
    required this.reasonText,
    required this.customerRequestNote,
    required this.initiatorRole,
    required this.refundMethod,
    required this.refundAmount,
    this.refundReference,
    this.refundProcessedAt,
    this.inspectionNotes,
    this.rejectionReason,
    required this.createdAt,
    this.statusChangedAt,
    required this.items,
    required this.photos,
    required this.isActive,
    required this.isTerminal,
    required this.isSuccess,
    this.kassaBalance,
  });

  factory OrderReturn.fromJson(Map<String, dynamic> j) => OrderReturn(
        id: j['id'] as int,
        returnNumber: j['return_number'] as String? ?? '',
        orderId: j['order'] as int? ?? j['order_number'] as int? ?? 0,
        replacementOrderId: j['replacement_order'] as int?,
        status: j['status'] as String? ?? 'REQUESTED',
        reasonCode: j['reason_code'] as String? ?? '',
        reasonText: j['reason_text'] as String? ?? '',
        customerRequestNote: j['customer_request_note'] as String? ?? '',
        initiatorRole: j['initiator_role'] as String? ?? 'admin',
        refundMethod: j['refund_method'] as String? ?? '',
        refundAmount: j['refund_amount']?.toString() ?? '0',
        refundReference: j['refund_reference'] as String?,
        refundProcessedAt: j['refund_processed_at'] as String?,
        inspectionNotes: j['inspection_notes'] as String?,
        rejectionReason: j['rejection_reason'] as String?,
        createdAt: j['created_at'] as String? ?? '',
        statusChangedAt: j['status_changed_at'] as String?,
        items: (j['items'] as List? ?? [])
            .map((e) => OrderReturnItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        photos: (j['photos'] as List? ?? [])
            .map((e) => OrderReturnPhoto.fromJson(e as Map<String, dynamic>))
            .toList(),
        isActive: j['is_active'] as bool? ?? false,
        isTerminal: j['is_terminal'] as bool? ?? false,
        isSuccess: j['is_success'] as bool? ?? false,
        kassaBalance: (j['kassa_balance'] as num?)?.toDouble(),
      );
}

class ReturnEligibilityItem {
  final int orderItemId;
  final int returnableQty;
  final String price;
  final String productName;

  ReturnEligibilityItem({
    required this.orderItemId,
    required this.returnableQty,
    required this.price,
    required this.productName,
  });

  factory ReturnEligibilityItem.fromJson(Map<String, dynamic> j) =>
      ReturnEligibilityItem(
        orderItemId: j['order_item_id'] as int,
        returnableQty: j['returnable_qty'] as int? ?? 1,
        price: j['price']?.toString() ?? '0',
        productName: j['product_name'] as String? ?? '',
      );
}

class ReasonChoice {
  final String code;
  final String label;
  const ReasonChoice({required this.code, required this.label});
  factory ReasonChoice.fromJson(Map<String, dynamic> j) =>
      ReasonChoice(code: j['code'] as String, label: j['label'] as String);
}

class ReturnEligibility {
  final bool eligible;
  final String? error;
  final String? code;
  final int windowLeftSeconds;
  final List<ReturnEligibilityItem> items;
  final List<ReasonChoice> reasons;
  final double? kassaBalance;

  ReturnEligibility({
    required this.eligible,
    this.error,
    this.code,
    required this.windowLeftSeconds,
    required this.items,
    required this.reasons,
    this.kassaBalance,
  });

  factory ReturnEligibility.fromJson(Map<String, dynamic> j) => ReturnEligibility(
        eligible: j['eligible'] as bool? ?? false,
        error: j['error'] as String?,
        code: j['code'] as String?,
        windowLeftSeconds: j['window_left_seconds'] as int? ?? 0,
        items: (j['returnable_items'] as List? ?? [])
            .map((e) =>
                ReturnEligibilityItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        reasons: (j['reasons'] as List? ?? [])
            .map((e) => ReasonChoice.fromJson(e as Map<String, dynamic>))
            .toList(),
        kassaBalance: (j['kassa_balance'] as num?)?.toDouble(),
      );
}

// UI uchun status va sabab leksikoni (web bilan AYNAN bir xil).
class ReturnLabels {
  // Qisqa label — badge'larda, list/detail header'da
  static const Map<String, String> status = {
    'REQUESTED': "So'rov yuborildi",
    'APPROVED': 'Tasdiqlandi',
    'PICKED_UP': 'Tovar olindi',
    'INSPECTING': 'Tekshirilmoqda',
    'ACCEPTED': 'Qabul qilindi',
    'REFUNDED': 'Pul qaytarildi',
    'REPLACED': 'Almashtirildi',
    'REJECTED': 'Rad etildi',
    'CANCELLED': 'Bekor qilindi',
  };

  // Phase 3.6 — Timeline uchun to'liq, tushunarli o'zbek tilida labellar
  // (web RETURN_STATUS_LABELS_UZ bilan AYNAN bir xil).
  static const Map<String, String> statusTimeline = {
    'REQUESTED': "Qaytarish so'rovi yuborildi",
    'APPROVED': 'Qaytarish tasdiqlandi',
    'PICKUP_SCHEDULED': 'Kuryer biriktirildi',
    'PICKED_UP': 'Kuryer tovarni oldi',
    'INSPECTING': "Do'konda tekshirilmoqda",
    'ACCEPTED': "Do'kon qabul qildi",
    'REFUNDED': "Do'konga qaytarildi — pul qaytarib berildi",
    'REPLACED': "Do'konga qaytarildi — yangi tovarga almashtirildi",
    'REJECTED': 'Qaytarish rad etildi',
    'CANCELLED': 'Qaytarish bekor qilindi',
  };

  static const Map<String, String> reason = {
    'defective': 'Aybli (buzilgan)',
    'wrong_item': "Noto'g'ri mahsulot",
    'not_as_described': 'Tavsifga mos emas',
    'damaged_in_transit': "Yo'lda buzildi",
    'quality_issue': 'Sifat past',
    'size_mismatch': "O'lcham to'g'ri kelmadi",
    'changed_mind': "Fikr o'zgardi",
    'duplicate_order': 'Takroriy buyurtma',
    'customer_refused': 'Mijoz qabul qilmadi',
  };

  static const Map<String, String> refundMethod = {
    'cash': 'Naqd (kassa)',
    'card': 'Karta',
    'click': 'Click',
    'payme': 'Payme',
    'store_credit': "Do'kon balansi",
    'replacement': 'Almashtirish',
  };

  // Status uchun rangli sxema (Material). UI side'da `Color` ga aylantiradi.
  // Format: [base R, G, B] — kelajakda Material 3'da to'g'ridan-to'g'ri ham
  // ishlatish mumkin. Hozir UI side'da darhol Color() bilan o'qiladi.
  static int statusBgColor(String s) {
    switch (s) {
      case 'REQUESTED':
        return 0xFF3B82F6; // blue
      case 'APPROVED':
        return 0xFF8B5CF6; // purple
      case 'PICKUP_SCHEDULED':
        return 0xFF6366F1; // indigo
      case 'PICKED_UP':
        return 0xFF06B6D4; // cyan
      case 'INSPECTING':
        return 0xFFF59E0B; // amber
      case 'ACCEPTED':
        return 0xFF14B8A6; // teal
      case 'REFUNDED':
        return 0xFF22C55E; // green
      case 'REPLACED':
        return 0xFF10B981; // emerald
      case 'REJECTED':
        return 0xFFEF4444; // red
      case 'CANCELLED':
        return 0xFF6B7280; // gray
      default:
        return 0xFF6B7280;
    }
  }

  // Mavjud status'dan keyingi mumkin bo'lganlar (state machine — web bilan
  // bir xil).
  static List<String> nextStates(String current) {
    switch (current) {
      case 'REQUESTED':
        return ['APPROVED', 'REJECTED', 'CANCELLED'];
      case 'APPROVED':
        // Mijoz tovarni O'ZI do'konga olib keladi — kuryer (PICKUP_SCHEDULED) YO'Q.
        return ['PICKED_UP', 'CANCELLED'];
      case 'PICKED_UP':
        return ['INSPECTING', 'CANCELLED'];
      case 'INSPECTING':
        return ['ACCEPTED', 'REJECTED', 'CANCELLED'];
      case 'ACCEPTED':
        return ['REFUNDED', 'REPLACED'];
      default:
        return [];
    }
  }
}
