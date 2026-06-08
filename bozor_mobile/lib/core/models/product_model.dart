// Variant atributlari (color, color_hex, quality, model, size).
// Backend `?expand_variants=true` rejimida har bir variant karta sifatida keladi
// va `variant` maydonida ushbu ma'lumotlar bo'ladi.
class VariantAttrs {
  final String? color;
  final String? colorHex;
  final String? quality;
  final String? model;
  final String? size;

  const VariantAttrs({
    this.color,
    this.colorHex,
    this.quality,
    this.model,
    this.size,
  });

  factory VariantAttrs.fromJson(Map<String, dynamic> json) => VariantAttrs(
        color: json['color'] as String?,
        colorHex: json['color_hex'] as String?,
        quality: json['quality'] as String?,
        model: json['model'] as String?,
        size: json['size'] as String?,
      );

  Map<String, dynamic> toJson() => {
        if (color != null) 'color': color,
        if (colorHex != null) 'color_hex': colorHex,
        if (quality != null) 'quality': quality,
        if (model != null) 'model': model,
        if (size != null) 'size': size,
      };
}

class ProductModel {
  final int id;
  final String name;
  final String description;
  final double price;
  final double? oldPrice;
  final String imageUrl;
  final bool isNew;
  final int? discountPercent;
  final double rating;

  // ── Variant-aware fieldlar (Amazon/Wildberries uslubi) ─────────────────────
  // Backend `?expand_variants=true` bilan har variant alohida karta sifatida
  // qaytaradi. Variantsiz mahsulot uchun bu fieldlar null.
  final String? cardId;        // unikal kalit: "23-7" yoki "23"
  final int? variantId;        // variant ID (savatga qo'shishda kerak)
  final int? stock;            // joriy variant/mahsulot stock'i
  final VariantAttrs? variant; // color/quality/size/model

  ProductModel({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    this.oldPrice,
    required this.imageUrl,
    this.isNew = false,
    this.discountPercent,
    this.rating = 0.0,
    this.cardId,
    this.variantId,
    this.stock,
    this.variant,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    final originalPrice = _toDouble(json['price']);
    final discountPrice = _toDoubleOrNull(json['discount_price']);
    final oldPrice =
        _toDoubleOrNull(json['old_price']) ??
            (discountPrice != null ? originalPrice : null);
    final currentPrice = discountPrice ?? originalPrice;

    // Variant info — backend `?expand_variants=true` bilan yuborgan bo'lsa
    final variantJson = json['variant'];
    final variant = variantJson is Map<String, dynamic>
        ? VariantAttrs.fromJson(variantJson)
        : null;

    return ProductModel(
      id: _toInt(json['id']),
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      price: currentPrice,
      oldPrice: oldPrice,
      imageUrl:
          (json['image_url'] ?? json['main_image'] ?? json['image'] ?? '')
              as String,
      isNew: json['is_new'] as bool? ?? false,
      discountPercent: _toIntOrNull(json['discount_percent']) ??
          _discountPercent(oldPrice, currentPrice),
      rating: _toDouble(json['rating']),
      // ── Variant fieldlar ──
      cardId: json['card_id'] as String?,
      variantId: _toIntOrNull(json['variant_id']),
      stock: _toIntOrNull(json['stock']),
      variant: variant,
    );
  }

  /// Variant bo'yicha unikal kalit (ListView key uchun).
  /// Variantli: "23-7", variantsiz: "23".
  String get uniqueKey => cardId ?? id.toString();

  /// Bu variant kartasi (variantli mahsulotning bitta varianti)?
  bool get isVariantCard => variantId != null;

  /// Stock < 1 — savatga qo'shib bo'lmaydi.
  bool get isOutOfStock {
    final s = stock;
    if (s == null) return false; // ma'lumot yo'q — qo'shilishiga ruxsat
    return s <= 0;
  }

  static double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0.0;
    return 0.0;
  }

  static double? _toDoubleOrNull(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static int _toInt(dynamic value) {
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }

  static int? _toIntOrNull(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  static int? _discountPercent(double? oldPrice, double price) {
    if (oldPrice == null || oldPrice <= 0 || price >= oldPrice) return null;
    return (((oldPrice - price) / oldPrice) * 100).round();
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'price': price,
        if (oldPrice != null) 'old_price': oldPrice,
        'image_url': imageUrl,
        'is_new': isNew,
        if (discountPercent != null) 'discount_percent': discountPercent,
        'rating': rating,
        // Variant fieldlar
        if (cardId != null) 'card_id': cardId,
        if (variantId != null) 'variant_id': variantId,
        if (stock != null) 'stock': stock,
        if (variant != null) 'variant': variant!.toJson(),
      };
}
