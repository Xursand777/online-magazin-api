class AdminProductImageModel {
  final int? id;
  final String url;
  final bool isMain;

  AdminProductImageModel({
    this.id,
    required this.url,
    required this.isMain,
  });

  factory AdminProductImageModel.fromJson(Map<String, dynamic> json) {
    return AdminProductImageModel(
      id: json['id'] as int?,
      url: json['image'] as String? ?? json['url'] as String? ?? '',
      isMain: json['is_main'] as bool? ?? false,
    );
  }
}

class AdminProductVariantModel {
  final int? id;
  final String? color;
  final String? colorHex;
  final String? quality;
  final String? model;
  final String? size;
  final double? price;
  final double? priceUsd;
  final double? discountPrice;
  final double? discountPriceUsd;
  final double? costPrice;
  final double? costPriceUsd;
  // Optom (ulgurji) narx — faqat admin/POS. Public API qaytarmaydi.
  final double? optomPrice;
  final double? optomPriceUsd;
  final int stock;
  final String? sku;
  final String? barcode;
  final bool isActive;
  final String? imageUrl;
  final List<AdminProductImageModel> images;
  // Phase 4.0 — do'kondagi polka manzili. FAQAT admin paneli (POS, buyurtmalar)
  // uchun keladi — backend public `ProductVariantSerializer` bu maydonni
  // qaytarmaydi → oddiy foydalanuvchilarda bu yo'q.
  final String? shelfLocation;
  // Phase 4.2 — backend fallback bilan amaldagi polka (variant'niki yoki
  // parent product.shelfLocation). UI faqat shuni o'qisa kifoya — fallback
  // mantig'i backend tomonida bir joyda hal qilingan (DRY).
  final String? effectiveShelf;
  // Kimdan kelgan (yetkazib beruvchi) — faqat admin/POS. Public API'da yo'q.
  final String? supplier;
  final String? effectiveSupplier;

  AdminProductVariantModel({
    this.id,
    this.color,
    this.colorHex,
    this.quality,
    this.model,
    this.size,
    this.price,
    this.priceUsd,
    this.discountPrice,
    this.discountPriceUsd,
    this.costPrice,
    this.costPriceUsd,
    this.optomPrice,
    this.optomPriceUsd,
    required this.stock,
    this.sku,
    this.barcode,
    required this.isActive,
    this.imageUrl,
    required this.images,
    this.shelfLocation,
    this.effectiveShelf,
    this.supplier,
    this.effectiveSupplier,
  });

  factory AdminProductVariantModel.fromJson(Map<String, dynamic> json) {
    return AdminProductVariantModel(
      id: json['id'] as int?,
      color: json['color'] as String?,
      colorHex: json['color_hex'] as String?,
      quality: json['quality'] as String?,
      model: json['model'] as String?,
      size: json['size'] as String?,
      price: _toDoubleOrNull(json['price']),
      priceUsd: _toDoubleOrNull(json['price_usd']),
      discountPrice: _toDoubleOrNull(json['discount_price']),
      discountPriceUsd: _toDoubleOrNull(json['discount_price_usd']),
      costPrice: _toDoubleOrNull(json['cost_price']),
      costPriceUsd: _toDoubleOrNull(json['cost_price_usd']),
      optomPrice: _toDoubleOrNull(json['optom_price']),
      optomPriceUsd: _toDoubleOrNull(json['optom_price_usd']),
      stock: json['stock'] as int? ?? 0,
      sku: json['sku'] as String?,
      barcode: json['barcode'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      imageUrl: json['image_url'] as String?,
      images: (json['images'] as List?)
              ?.map((e) => AdminProductImageModel.fromJson(e))
              .toList() ??
          [],
      shelfLocation: json['shelf_location'] as String?,
      effectiveShelf: json['effective_shelf'] as String?,
      supplier: json['supplier'] as String?,
      effectiveSupplier: json['effective_supplier'] as String?,
    );
  }

  static double? _toDoubleOrNull(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }
}

class AdminProductModel {
  final int id;
  final String name;
  final String slug;
  final String description;
  final int? categoryId;
  final String? categoryName;
  final double price;
  final double? priceUsd;
  final double? discountPrice;
  final double? discountPriceUsd;
  final double? costPrice;
  final double? costPriceUsd;
  // Optom (ulgurji) narx — faqat admin/POS. Public API qaytarmaydi.
  final double? optomPrice;
  final double? optomPriceUsd;
  final int stock;
  final bool isActive;
  final bool isPopular;
  final bool isNew;
  final bool isDiscount;
  final String? mainImage;
  final List<AdminProductImageModel> images;
  final List<AdminProductVariantModel> variants;
  // Phase 4.2 — product darajasidagi polka (variantsiz mahsulot uchun yoki
  // variantli mahsulot uchun default fallback). Variant'da polka bo'sh bo'lsa
  // backend bu yerdan oladi. UI har joyda `effectiveShelf` bilan ishlasa kifoya.
  final String? shelfLocation;
  // Kimdan kelgan (yetkazib beruvchi) — faqat admin/POS. Public API'da yo'q.
  final String? supplier;

  AdminProductModel({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    this.categoryId,
    this.categoryName,
    required this.price,
    this.priceUsd,
    this.discountPrice,
    this.discountPriceUsd,
    this.costPrice,
    this.costPriceUsd,
    this.optomPrice,
    this.optomPriceUsd,
    required this.stock,
    required this.isActive,
    required this.isPopular,
    required this.isNew,
    required this.isDiscount,
    this.mainImage,
    required this.images,
    required this.variants,
    this.shelfLocation,
    this.supplier,
  });

  factory AdminProductModel.fromJson(Map<String, dynamic> json) {
    return AdminProductModel(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      description: json['description'] as String? ?? '',
      categoryId: json['category'] is int ? json['category'] as int : null,
      categoryName: json['category_name'] as String?,
      price: _toDouble(json['price']),
      priceUsd: _toDoubleOrNull(json['price_usd']),
      discountPrice: _toDoubleOrNull(json['discount_price']),
      discountPriceUsd: _toDoubleOrNull(json['discount_price_usd']),
      costPrice: _toDoubleOrNull(json['cost_price']),
      costPriceUsd: _toDoubleOrNull(json['cost_price_usd']),
      optomPrice: _toDoubleOrNull(json['optom_price']),
      optomPriceUsd: _toDoubleOrNull(json['optom_price_usd']),
      stock: json['stock'] as int? ?? 0,
      isActive: json['is_active'] as bool? ?? true,
      isPopular: json['is_popular'] as bool? ?? false,
      isNew: json['is_new'] as bool? ?? true,
      isDiscount: json['is_discount'] as bool? ?? false,
      mainImage: json['main_image'] as String?,
      images: (json['images'] as List?)
              ?.map((e) => AdminProductImageModel.fromJson(e))
              .toList() ??
          [],
      variants: (json['variants'] as List?)
              ?.map((e) => AdminProductVariantModel.fromJson(e))
              .toList() ??
          [],
      shelfLocation: json['shelf_location'] as String?,
      supplier: json['supplier'] as String?,
    );
  }

  static double _toDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0;
    return 0;
  }

  static double? _toDoubleOrNull(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }
}

class AdminCategoryModel {
  final int id;
  final String name;
  final int? parentId;
  final String? parentName;
  final bool isActive;
  final bool isPopular;
  final String? imageUrl;

  AdminCategoryModel({
    required this.id,
    required this.name,
    this.parentId,
    this.parentName,
    required this.isActive,
    required this.isPopular,
    this.imageUrl,
  });

  /// Ko'rsatish nomi: "Katalog / Kategoriya" (ota-kategoriya bo'lsa) — web
  /// `categoryLabel` bilan bir xil. Qidiruv ham shu bo'yicha ishlaydi.
  String get label =>
      (parentName != null && parentName!.trim().isNotEmpty)
          ? '$parentName / $name'
          : name;

  factory AdminCategoryModel.fromJson(Map<String, dynamic> json) {
    return AdminCategoryModel(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      parentId: json['parent'] as int?,
      parentName: json['parent_name'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      isPopular: json['is_popular'] as bool? ?? false,
      imageUrl: json['image_url'] as String? ?? json['image'] as String?,
    );
  }
}

class AdminBannerModel {
  final int id;
  final String title;
  final String? subtitle;

  /// Mahsulot rasmi URL (API: product_image_url)
  final String? imageUrl;

  /// Orqa fon rasmi URL (API: background_image_url)
  final String? backgroundImageUrl;

  final bool isActive;
  final int order;
  final int? productId;
  final String? productName;

  /// Fon rangi hex (API: background_color), masalan "#2761dd"
  final String? backgroundColor;

  /// Aksent rangi hex (API: accent_color)
  final String? accentColor;

  /// Tugma matni (API: button_label)
  final String? buttonLabel;

  /// Mahsulot asl narxi
  final double? originalPrice;

  /// Chegirma narxi
  final double? discountPrice;

  /// Boshlanish sanasi
  final DateTime? startDate;

  /// Tugash sanasi
  final DateTime? endDate;

  AdminBannerModel({
    required this.id,
    required this.title,
    this.subtitle,
    this.imageUrl,
    this.backgroundImageUrl,
    required this.isActive,
    required this.order,
    this.productId,
    this.productName,
    this.backgroundColor,
    this.accentColor,
    this.buttonLabel,
    this.originalPrice,
    this.discountPrice,
    this.startDate,
    this.endDate,
  });

  static double? _d(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  factory AdminBannerModel.fromJson(Map<String, dynamic> json) {
    final product = json['product'];
    return AdminBannerModel(
      id: json['id'] as int,
      title: json['title'] as String? ?? '',
      subtitle: json['subtitle'] as String?,
      imageUrl: (json['product_image_url'] ?? json['image_url']) as String?,
      backgroundImageUrl: json['background_image_url'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      order: json['order'] as int? ?? 0,
      productId: product is Map ? product['id'] as int? : (product as int?),
      productName: (json['product_name'] as String?) ??
          (product is Map ? product['name'] as String? : null),
      backgroundColor: json['background_color'] as String?,
      accentColor: json['accent_color'] as String?,
      buttonLabel: json['button_label'] as String?,
      originalPrice: _d(json['original_price']),
      discountPrice: _d(json['discount_price']),
      startDate: json['start_date'] != null ? DateTime.tryParse(json['start_date']) : null,
      endDate: json['end_date'] != null ? DateTime.tryParse(json['end_date']) : null,
    );
  }
}

