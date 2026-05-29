import 'package:json_annotation/json_annotation.dart';

part 'product_model.g.dart';

@JsonSerializable()
class ProductModel {
  final int id;
  final String name;
  final String description;
  @JsonKey(name: 'price')
  final double price;
  @JsonKey(name: 'old_price')
  final double? oldPrice;
  @JsonKey(name: 'image_url')
  final String imageUrl;
  @JsonKey(name: 'is_new')
  final bool isNew;
  @JsonKey(name: 'discount_percent')
  final int? discountPercent;
  final double rating;

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
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    final originalPrice = _toDouble(json['price']);
    final discountPrice = _toDoubleOrNull(json['discount_price']);
    final oldPrice =
        _toDoubleOrNull(json['old_price']) ??
        (discountPrice != null ? originalPrice : null);
    final currentPrice = discountPrice ?? originalPrice;
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
      discountPercent:
          _toIntOrNull(json['discount_percent']) ??
          _discountPercent(oldPrice, currentPrice),
      rating: _toDouble(json['rating']),
    );
  }

  static double _toDouble(dynamic value) {
    if (value is num) {
      return value.toDouble();
    }
    if (value is String) {
      return double.tryParse(value) ?? 0.0;
    }
    return 0.0;
  }

  static double? _toDoubleOrNull(dynamic value) {
    if (value == null) {
      return null;
    }
    if (value is num) {
      return value.toDouble();
    }
    if (value is String) {
      return double.tryParse(value);
    }
    return null;
  }

  static int _toInt(dynamic value) {
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value) ?? 0;
    }
    return 0;
  }

  static int? _toIntOrNull(dynamic value) {
    if (value == null) {
      return null;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value);
    }
    return null;
  }

  static int? _discountPercent(double? oldPrice, double price) {
    if (oldPrice == null || oldPrice <= 0 || price >= oldPrice) {
      return null;
    }
    return (((oldPrice - price) / oldPrice) * 100).round();
  }

  Map<String, dynamic> toJson() => _$ProductModelToJson(this);
}
