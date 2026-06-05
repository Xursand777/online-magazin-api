// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductModel _$ProductModelFromJson(Map<String, dynamic> json) => ProductModel(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String,
      description: json['description'] as String,
      price: (json['price'] as num).toDouble(),
      oldPrice: (json['old_price'] as num?)?.toDouble(),
      imageUrl: json['image_url'] as String,
      isNew: json['is_new'] as bool? ?? false,
      discountPercent: (json['discount_percent'] as num?)?.toInt(),
      rating: (json['rating'] as num?)?.toDouble() ?? 0.0,
    );

Map<String, dynamic> _$ProductModelToJson(ProductModel instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'description': instance.description,
      'price': instance.price,
      'old_price': instance.oldPrice,
      'image_url': instance.imageUrl,
      'is_new': instance.isNew,
      'discount_percent': instance.discountPercent,
      'rating': instance.rating,
    };
