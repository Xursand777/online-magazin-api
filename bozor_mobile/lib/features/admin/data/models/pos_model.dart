// Do'kon (POS) uchun modellar — sayt `AdminPOS.tsx` bilan bir xil logika.

class PosProduct {
  final int id;
  final String name;
  final double price;
  final double? discountPrice;
  final double costPrice;
  // Optom (ulgurji) narx — faqat admin/POS (0/null = kiritilmagan).
  final double? optomPrice;
  final int stock;
  final String? mainImage;
  final List<PosVariant> variants;
  // Phase 4.2 — product darajasidagi polka. Variantsiz mahsulot uchun asosiy,
  // variantli mahsulotda variant'da polka bo'sh bo'lsa fallback (backend
  // `effective_shelf` qaytaradi). Mobil POS karta ko'rsatishida ishlatamiz.
  final String shelfLocation;

  const PosProduct({
    required this.id,
    required this.name,
    required this.price,
    required this.discountPrice,
    required this.costPrice,
    this.optomPrice,
    required this.stock,
    required this.mainImage,
    required this.variants,
    this.shelfLocation = '',
  });

  factory PosProduct.fromJson(Map<String, dynamic> json) {
    // Mahsulot rasm fallback'i: main_image bo'lmasa — images[0]
    String? mainImg = json['main_image'] as String?;
    if (mainImg == null || mainImg.isEmpty) {
      final imgs = json['images'] as List?;
      if (imgs != null && imgs.isNotEmpty) {
        final first = imgs[0];
        if (first is Map && first['image'] is String) {
          mainImg = first['image'] as String;
        }
      }
    }
    return PosProduct(
      id: _int(json['id']),
      name: json['name'] as String? ?? '',
      price: _double(json['price']),
      discountPrice: _doubleOrNull(json['discount_price']),
      costPrice: _double(json['cost_price']),
      optomPrice: _doubleOrNull(json['optom_price']),
      stock: _int(json['stock']),
      mainImage: mainImg,
      shelfLocation: (json['shelf_location'] as String? ?? '').trim(),
      variants: ((json['variants'] as List?) ?? [])
          .map((e) => PosVariant.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// Mahsulot + variantlarni POS savatchasi uchun "tanlash birliklari"ga aylantiradi.
  /// Variantlar uchun "color-grouped image fallback" (Wildberries-stil) ham qo'llanadi:
  /// admin har sifatga rasm yuklamasa, bir xil rangdagi boshqa variantning rasmi
  /// olinadi — foydalanuvchi to'g'ri rangdagi tovarni ko'radi.
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
          image: mainImage,
          price: discountPrice ?? price,
          costPrice: costPrice,
          optomPrice: optomPrice ?? 0,
          quantity: 1,
          stock: stock,
          sku: '',
          // Phase 4.2 — variantsiz mahsulot polkasi product darajasida.
          shelfLocation: shelfLocation,
        ),
      ];
    }
    // Bir xil rang uchun birinchi mavjud rasmni yodda saqlaymiz (fallback)
    final colorToImage = <String, String>{};
    for (final v in variants) {
      final c = v.color.trim().toLowerCase();
      if (c.isEmpty) continue;
      final img = v.imageUrl;
      if (img != null && img.isNotEmpty && !colorToImage.containsKey(c)) {
        colorToImage[c] = img;
      }
    }
    return variants.map((v) {
      final colorImg = colorToImage[v.color.trim().toLowerCase()];
      // Phase 4.2 — variant polkasi bo'sh bo'lsa product polkasiga fallback
      // (backend `effective_shelf` ham shunday qaytaradi — defensive layer).
      final effectiveShelf = v.shelfLocation.isNotEmpty
          ? v.shelfLocation
          : shelfLocation;
      return PosCartItem(
        cartId: 'v-${v.id}',
        productId: id,
        variantId: v.id,
        name: name,
        quality: v.quality,
        model: v.model,
        size: v.size,
        color: v.color,
        image: v.imageUrl ?? colorImg ?? mainImage,
        price: v.discountPrice ?? v.price ?? discountPrice ?? price,
        costPrice: v.costPrice ?? costPrice,
        // Optom: variantniki, bo'lmasa mahsulotnikiga fallback (0 = yo'q).
        optomPrice: v.optomPrice ?? optomPrice ?? 0,
        quantity: 1,
        stock: v.stock,
        sku: v.sku,
        shelfLocation: effectiveShelf,
      );
    }).toList();
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
  // Optom (ulgurji) narx — faqat admin/POS (null = kiritilmagan).
  final double? optomPrice;
  final int stock;
  final String? imageUrl;
  // Phase 4.0 — do'kondagi polka manzili (admin/POS uchun). Backend
  // public API'da yo'q → faqat admin token bilan keladi.
  final String shelfLocation;

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
    this.optomPrice,
    required this.stock,
    required this.imageUrl,
    this.shelfLocation = '',
  });

  factory PosVariant.fromJson(Map<String, dynamic> json) {
    // Variantning birinchi rasmi — gallery > image_url
    String? img;
    final imgs = json['images'] as List?;
    if (imgs != null && imgs.isNotEmpty) {
      final first = imgs[0];
      if (first is Map && first['url'] is String) img = first['url'] as String;
    }
    img ??= json['image_url'] as String?;
    // Phase 4.2 — variant'da o'z polkasi bo'sh bo'lsa, backend `effective_shelf`
    // qaytaradi (variant'niki yoki parent product.shelf_location). Defensive
    // 2-pog'onali fallback: own → effective.
    final ownShelf = (json['shelf_location'] as String? ?? '').trim();
    final effShelf = (json['effective_shelf'] as String? ?? '').trim();
    final shelf = ownShelf.isNotEmpty ? ownShelf : effShelf;
    return PosVariant(
      id: _int(json['id']),
      color: json['color'] as String? ?? '',
      quality: json['quality'] as String? ?? '',
      model: json['model'] as String? ?? '',
      size: json['size'] as String? ?? '',
      sku: json['sku'] as String? ?? '',
      shelfLocation: shelf,
      price: _doubleOrNull(json['price']),
      discountPrice: _doubleOrNull(json['discount_price']),
      costPrice: _doubleOrNull(json['cost_price']),
      optomPrice: _doubleOrNull(json['optom_price']),
      stock: _int(json['stock']),
      imageUrl: img,
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
  final String? image;
  final double price; // mahsulotda KO'RSATILGAN narx (chegirma bazasi)
  final double soldPrice; // kelishuv (sotiladigan) narx — admin tahrirlaydi
  final double costPrice; // tannarx — narx bundan past bo'la olmaydi
  final double optomPrice; // optom (ulgurji) narx — 0 = kiritilmagan
  final int quantity;
  final int stock;
  final String sku;
  // Phase 4.0 — do'kondagi polka manzili (FAQAT admin/POS). Backend public
  // API'da bu maydon yo'q → oddiy foydalanuvchi tomonida bu joy mavjud emas.
  final String shelfLocation;

  const PosCartItem({
    required this.cartId,
    required this.productId,
    required this.variantId,
    required this.name,
    required this.quality,
    required this.model,
    required this.size,
    required this.color,
    this.image,
    required this.price,
    double? soldPrice,
    required this.costPrice,
    this.optomPrice = 0,
    required this.quantity,
    required this.stock,
    required this.sku,
    this.shelfLocation = '',
  }) : soldPrice = soldPrice ?? price;

  /// Variant atributlari — sifat • model • hajm • rang (backend tartibi bilan).
  /// Saytdagi `_build_variant_card_name` bilan AYNAN bir xil.
  String get variantText => [quality, model, size, color]
      .where((e) => e.trim().isNotEmpty)
      .join(' · ');

  /// To'liq nom: Mahsulot • Sifat • Model • Hajm • Rang.
  /// Variantsiz mahsulotda — faqat mahsulot nomi.
  String get fullName {
    final attrs = [quality, model, size, color]
        .where((e) => e.trim().isNotEmpty)
        .toList();
    return attrs.isEmpty ? name : '$name • ${attrs.join(' • ')}';
  }

  double get lineTotal => soldPrice * quantity;
  double get normalLineTotal => price * quantity;
  double get lineProfit => (soldPrice - costPrice) * quantity;
  double get lineDiscount {
    final d = (price - soldPrice) * quantity;
    return d > 0 ? d : 0;
  }

  /// Tannarxdan past sotilyaptimi — bo'lsa sotuv bloklanadi.
  bool get belowCost => soldPrice < costPrice;

  /// Optom narxi kiritilganmi (mavjudmi).
  bool get hasOptom => optomPrice > 0;

  /// Hozir aynan optom narxda sotilyaptimi (soldPrice === optomPrice).
  bool get isOptom => optomPrice > 0 && soldPrice == optomPrice;

  PosCartItem copyWith({int? quantity, double? soldPrice}) => PosCartItem(
        cartId: cartId,
        productId: productId,
        variantId: variantId,
        name: name,
        quality: quality,
        model: model,
        size: size,
        color: color,
        image: image,
        price: price,
        soldPrice: soldPrice ?? this.soldPrice,
        costPrice: costPrice,
        optomPrice: optomPrice,
        quantity: quantity ?? this.quantity,
        stock: stock,
        sku: sku,
        shelfLocation: shelfLocation,
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
