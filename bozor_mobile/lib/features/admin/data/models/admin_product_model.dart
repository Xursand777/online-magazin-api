class AdminProductModel {
  final int id;
  final String name;
  final String slug;
  final String description;
  final int? categoryId;
  final String? categoryName;
  final double price;
  final double? discountPrice;
  final int stock;
  final bool isActive;
  final bool isPopular;
  final bool isNew;
  final bool isDiscount;
  final String? mainImage;

  AdminProductModel({
    required this.id,
    required this.name,
    required this.slug,
    required this.description,
    this.categoryId,
    this.categoryName,
    required this.price,
    this.discountPrice,
    required this.stock,
    required this.isActive,
    required this.isPopular,
    required this.isNew,
    required this.isDiscount,
    this.mainImage,
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
      discountPrice: _toDoubleOrNull(json['discount_price']),
      stock: json['stock'] as int? ?? 0,
      isActive: json['is_active'] as bool? ?? true,
      isPopular: json['is_popular'] as bool? ?? false,
      isNew: json['is_new'] as bool? ?? true,
      isDiscount: json['is_discount'] as bool? ?? false,
      mainImage: json['main_image'] as String?,
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
  final bool isActive;
  final bool isPopular;

  AdminCategoryModel({
    required this.id,
    required this.name,
    this.parentId,
    required this.isActive,
    required this.isPopular,
  });

  factory AdminCategoryModel.fromJson(Map<String, dynamic> json) {
    return AdminCategoryModel(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      parentId: json['parent'] as int?,
      isActive: json['is_active'] as bool? ?? true,
      isPopular: json['is_popular'] as bool? ?? false,
    );
  }
}

class AdminBannerModel {
  final int id;
  final String title;
  final String? subtitle;
  final String? imageUrl;
  final bool isActive;
  final int order;
  final int? productId;
  final String? productName;

  AdminBannerModel({
    required this.id,
    required this.title,
    this.subtitle,
    this.imageUrl,
    required this.isActive,
    required this.order,
    this.productId,
    this.productName,
  });

  factory AdminBannerModel.fromJson(Map<String, dynamic> json) {
    final product = json['product'];
    return AdminBannerModel(
      id: json['id'] as int,
      title: json['title'] as String? ?? '',
      subtitle: json['subtitle'] as String?,
      imageUrl: json['image_url'] as String?,
      isActive: json['is_active'] as bool? ?? true,
      order: json['order'] as int? ?? 0,
      productId: product is Map ? product['id'] as int? : (product as int?),
      productName: product is Map ? product['name'] as String? : null,
    );
  }
}
