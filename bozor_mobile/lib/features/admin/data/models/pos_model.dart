// Do'kon (POS) uchun modellar — sayt `AdminPOS.tsx` bilan bir xil logika.

class PosProduct {
  final int id;
  final String name;
  final double price;
  final double? discountPrice;
  final double costPrice;
  final int stock;
  final List<PosVariant> variants;

  const PosProduct({
    required this.id,
    required this.name,
    required this.price,
    required this.discountPrice,
    required this.costPrice,
    required this.stock,
    required this.variants,
  });

  factory PosProduct.fromJson(Map<String, dynamic> json) {
    return PosProduct(
      id: _int(json['id']),
      name: json['name'] as String? ?? '',
      price: _double(json['price']),
      discountPrice: _doubleOrNull(json['discount_price']),
      costPrice: _double(json['cost_price']),
      stock: _int(json['stock']),
      variants: ((json['variants'] as List?) ?? [])
          .map((e) => PosVariant.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// Mahsulot + variantlarni POS savatchasi uchun "tanlash birliklari"ga aylantiradi.
  List<PosCartItem> toCartUnits() {
    if (variants.isEmpty) {
      return [
        PosCartItem(
          cartId: 'p-$id',
          productId: id,
          variantId: null,
          name: name,
          quality: '',
          model: '',
          size: '',
          color: '',
          price: discountPrice ?? price,
          costPrice: costPrice,
          quantity: 1,
          stock: stock,
          sku: '',
        ),
      ];
    }
    return variants
        .map((v) => PosCartItem(
              cartId: 'v-${v.id}',
              productId: id,
              variantId: v.id,
              name: name,
              quality: v.quality,
              model: v.model,
              size: v.size,
              color: v.color,
              price: v.discountPrice ?? v.price ?? discountPrice ?? price,
              costPrice: v.costPrice ?? costPrice,
              quantity: 1,
              stock: v.stock,
              sku: v.sku,
            ))
        .toList();
  }
}

class PosVariant {
  final int id;
  final String color;
  final String quality;
  final String model;
  final String size;
  final String sku;
  final double? price;
  final double? discountPrice;
  final double? costPrice;
  final int stock;

  const PosVariant({
    required this.id,
    required this.color,
    required this.quality,
    required this.model,
    required this.size,
    required this.sku,
    required this.price,
    required this.discountPrice,
    required this.costPrice,
    required this.stock,
  });

  factory PosVariant.fromJson(Map<String, dynamic> json) {
    return PosVariant(
      id: _int(json['id']),
      color: json['color'] as String? ?? '',
      quality: json['quality'] as String? ?? '',
      model: json['model'] as String? ?? '',
      size: json['size'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      price: _doubleOrNull(json['price']),
      discountPrice: _doubleOrNull(json['discount_price']),
      costPrice: _doubleOrNull(json['cost_price']),
      stock: _int(json['stock']),
    );
  }
}

class PosCartItem {
  final String cartId;
  final int productId;
  final int? variantId;
  final String name;
  final String quality;
  final String model;
  final String size;
  final String color;
  final double price; // mahsulotda KO'RSATILGAN narx (chegirma bazasi)
  final double soldPrice; // kelishuv (sotiladigan) narx — admin tahrirlaydi
  final double costPrice; // tannarx — narx bundan past bo'la olmaydi
  final int quantity;
  final int stock;
  final String sku;

  const PosCartItem({
    required this.cartId,
    required this.productId,
    required this.variantId,
    required this.name,
    required this.quality,
    required this.model,
    required this.size,
    required this.color,
    required this.price,
    double? soldPrice,
    required this.costPrice,
    required this.quantity,
    required this.stock,
    required this.sku,
  }) : soldPrice = soldPrice ?? price;

  String get variantText =>
      [color, size, model].where((e) => e.trim().isNotEmpty).join(' · ');

  double get lineTotal => soldPrice * quantity;
  double get normalLineTotal => price * quantity;
  double get lineProfit => (soldPrice - costPrice) * quantity;
  double get lineDiscount {
    final d = (price - soldPrice) * quantity;
    return d > 0 ? d : 0;
  }

  /// Tannarxdan past sotilyaptimi — bo'lsa sotuv bloklanadi.
  bool get belowCost => soldPrice < costPrice;

  PosCartItem copyWith({int? quantity, double? soldPrice}) => PosCartItem(
        cartId: cartId,
        productId: productId,
        variantId: variantId,
        name: name,
        quality: quality,
        model: model,
        size: size,
        color: color,
        price: price,
        soldPrice: soldPrice ?? this.soldPrice,
        costPrice: costPrice,
        quantity: quantity ?? this.quantity,
        stock: stock,
        sku: sku,
      );
}

/// `/api/admin-search/` javobi (ro'yxatdan o'tgan mijoz).
class PosCustomer {
  final int id;
  final String phone;
  final String firstName;
  final String lastName;
  final bool creditBan;
  final int overdueCreditCount;

  const PosCustomer({
    required this.id,
    required this.phone,
    required this.firstName,
    required this.lastName,
    required this.creditBan,
    required this.overdueCreditCount,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory PosCustomer.fromJson(Map<String, dynamic> json) {
    return PosCustomer(
      id: _int(json['id']),
      phone: json['phone'] as String? ?? '',
      firstName: json['first_name'] as String? ?? '',
      lastName: json['last_name'] as String? ?? '',
      creditBan: json['credit_ban'] as bool? ?? false,
      overdueCreditCount: _int(json['overdue_credit_count']),
    );
  }
}

/// `/api/orders/admin/customer-history/` javobi.
class CustomerHistory {
  final PosCustomer? customer;
  final List<HistoryOrder> orders;

  const CustomerHistory({required this.customer, required this.orders});

  factory CustomerHistory.fromJson(Map<String, dynamic> json) {
    return CustomerHistory(
      customer: json['customer'] is Map
          ? PosCustomer.fromJson(json['customer'] as Map<String, dynamic>)
          : null,
      orders: ((json['orders'] as List?) ?? [])
          .map((e) => HistoryOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class HistoryOrder {
  final int id;
  final DateTime? createdAt;
  final String status;
  final String paymentMethod;
  final double totalPrice;
  final bool isCredit;
  final bool creditPaid;
  final String? creditDueDate;
  final String deliveryAddress;
  final List<HistoryItem> items;

  const HistoryOrder({
    required this.id,
    required this.createdAt,
    required this.status,
    required this.paymentMethod,
    required this.totalPrice,
    required this.isCredit,
    required this.creditPaid,
    required this.creditDueDate,
    required this.deliveryAddress,
    required this.items,
  });

  bool get isPos => deliveryAddress.contains('POS');

  factory HistoryOrder.fromJson(Map<String, dynamic> json) {
    return HistoryOrder(
      id: _int(json['id']),
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '')?.toLocal(),
      status: json['status'] as String? ?? '',
      paymentMethod: json['payment_method'] as String? ?? '',
      totalPrice: _double(json['total_price']),
      isCredit: json['is_credit'] as bool? ?? false,
      creditPaid: json['credit_paid'] as bool? ?? false,
      creditDueDate: json['credit_due_date']?.toString(),
      deliveryAddress: json['delivery_address'] as String? ?? '',
      items: ((json['items'] as List?) ?? [])
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class HistoryItem {
  final String name;
  final String variant;
  final int quantity;
  final double price;

  const HistoryItem({
    required this.name,
    required this.variant,
    required this.quantity,
    required this.price,
  });

  factory HistoryItem.fromJson(Map<String, dynamic> json) {
    return HistoryItem(
      name: json['name'] as String? ?? '',
      variant: json['variant'] as String? ?? '',
      quantity: _int(json['quantity']),
      price: _double(json['price']),
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

double? _doubleOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}
