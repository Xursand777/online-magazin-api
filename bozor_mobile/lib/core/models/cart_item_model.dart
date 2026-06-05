import 'package:json_annotation/json_annotation.dart';
import 'product_model.dart';

part 'cart_item_model.g.dart';

@JsonSerializable()
class CartItemModel {
  final int? id; // Serverdagi CartItem ID'si
  final ProductModel product;
  int quantity;

  CartItemModel({
    this.id,
    required this.product, 
    this.quantity = 1,
  });

  factory CartItemModel.fromJson(Map<String, dynamic> json) =>
      _$CartItemModelFromJson(json);
  Map<String, dynamic> toJson() => _$CartItemModelToJson(this);

  CartItemModel copyWith({
    int? id,
    ProductModel? product, 
    int? quantity,
  }) {
    return CartItemModel(
      id: id ?? this.id,
      product: product ?? this.product,
      quantity: quantity ?? this.quantity,
    );
  }
}
