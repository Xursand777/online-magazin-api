/// Mahsulot batafsil ma'lumotlari — `/api/products/{id}/` javobiga mos.
///
/// Variantli mahsulot uchun `variants` ro'yxati keladi. Variantsiz mahsulotda
/// bu ro'yxat bo'sh bo'ladi.
class ProductDetailModel {
  final int id;
  final String name;
  final String slug;
  final String description;
  final double price;
  final double? discountPrice;
  final double? masterPrice;
  final int stock;
  final bool isDiscount;
  final bool isNew;
  final bool isPopular;
  final List<ProductImage> images;
  final List<ProductVariant> variants;
  final CategoryRef? category;

  const ProductDetailModel({
    required this.id,
    required this.name,
    this.slug = '',
    this.description = '',
    required this.price,
    this.discountPrice,
    this.masterPrice,
    this.stock = 0,
    this.isDiscount = false,
    this.isNew = false,
    this.isPopular = false,
    this.images = const [],
    this.variants = const [],
    this.category,
  });

  factory ProductDetailModel.fromJson(Map<String, dynamic> json) {
    return ProductDetailModel(
      id: _toInt(json['id']),
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      description: json['description'] as String? ?? '',
      price: _toDouble(json['price']),
      discountPrice: _toDoubleOrNull(json['discount_price']),
      masterPrice: _toDoubleOrNull(json['master_price']),
      stock: _toInt(json['stock']),
      isDiscount: json['is_discount'] as bool? ?? false,
      isNew: json['is_new'] as bool? ?? false,
      isPopular: json['is_popular'] as bool? ?? false,
      images: (json['images'] as List?)
              ?.map((j) => ProductImage.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [],
      variants: (json['variants'] as List?)
              ?.map((j) => ProductVariant.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [],
      category: json['category'] is Map<String, dynamic>
          ? CategoryRef.fromJson(json['category'] as Map<String, dynamic>)
          : null,
    );
  }

  // ── Helperlar ────────────────────────────────────────────────────────────

  static double _toDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0.0;
    return 0.0;
  }

  static double? _toDoubleOrNull(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  static int _toInt(dynamic v) {
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}

/// Mahsulot rasmi.
class ProductImage {
  final int id;
  final String url;
  final bool isMain;

  const ProductImage({required this.id, required this.url, this.isMain = false});

  factory ProductImage.fromJson(Map<String, dynamic> json) => ProductImage(
        id: (json['id'] as num?)?.toInt() ?? 0,
        url: (json['image'] ?? json['url'] ?? '') as String,
        isMain: json['is_main'] as bool? ?? false,
      );
}

/// Variant rasmi (kichik strukturasi).
class VariantImage {
  final int? id;
  final String url;

  const VariantImage({this.id, required this.url});

  factory VariantImage.fromJson(Map<String, dynamic> json) => VariantImage(
        id: (json['id'] as num?)?.toInt(),
        url: (json['url'] ?? '') as String,
      );
}

/// Mahsulot varianti (color, quality, size, narx, stock, rasm).
class ProductVariant {
  final int id;
  final String? color;
  final String? colorHex;
  final String? imageUrl;
  final List<VariantImage> images;
  final String? quality;
  final String? model;
  final String? size;
  final double? price;
  final double? discountPrice;
  final int stock;
  final String? sku;

  const ProductVariant({
    required this.id,
    this.color,
    this.colorHex,
    this.imageUrl,
    this.images = const [],
    this.quality,
    this.model,
    this.size,
    this.price,
    this.discountPrice,
    this.stock = 0,
    this.sku,
  });

  /// Variantning amaldagi narxi (variant narxi yo'q bo'lsa null).
  double? get effectivePrice => discountPrice ?? price;

  /// Variant atributlari to'liq nomi: "Pro • Original • 128/8 • Olive".
  /// Tartib backend `_build_variant_card_name` bilan AYNAN bir xil:
  ///   model • quality • size • color
  /// (Sayt va POS bir xil tartibni ishlatadi — adashtirmaslik uchun.)
  String get attributesLabel {
    final parts = <String>[];
    if (model != null && model!.trim().isNotEmpty) parts.add(model!.trim());
    if (quality != null && quality!.trim().isNotEmpty) parts.add(quality!.trim());
    if (size != null && size!.trim().isNotEmpty) parts.add(size!.trim());
    if (color != null && color!.trim().isNotEmpty) parts.add(color!.trim());
    return parts.join(' • ');
  }

  /// Birinchi rasm — gallery yoki thumbnail.
  String? get displayImage {
    if (images.isNotEmpty) return images.first.url;
    return imageUrl;
  }

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    return ProductVariant(
      id: (json['id'] as num?)?.toInt() ?? 0,
      color: json['color'] as String?,
      colorHex: json['color_hex'] as String?,
      imageUrl: json['image_url'] as String?,
      images: (json['images'] as List?)
              ?.map((j) => VariantImage.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [],
      quality: json['quality'] as String?,
      model: json['model'] as String?,
      size: json['size'] as String?,
      price: ProductDetailModel._toDoubleOrNull(json['price']),
      discountPrice: ProductDetailModel._toDoubleOrNull(json['discount_price']),
      stock: ProductDetailModel._toInt(json['stock']),
      sku: json['sku'] as String?,
    );
  }
}

/// Kategoriya minimal ma'lumoti (detail javobida nested).
class CategoryRef {
  final int id;
  final String name;
  final String? slug;

  const CategoryRef({required this.id, required this.name, this.slug});

  factory CategoryRef.fromJson(Map<String, dynamic> json) => CategoryRef(
        id: (json['id'] as num?)?.toInt() ?? 0,
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String?,
      );
}
