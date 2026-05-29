import 'dart:convert';
import '../../../../core/models/cart_item_model.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/storage/local_storage.dart';

class CartRepository {
  List<CartItemModel> getCartItems() {
    final cartBox = LocalStorage.cartBox;
    final List<CartItemModel> items = [];

    for (var key in cartBox.keys) {
      final String? jsonString = cartBox.get(key);
      if (jsonString != null) {
        try {
          items.add(CartItemModel.fromJson(jsonDecode(jsonString)));
        } catch (e) {
          // ignore parsing error
        }
      }
    }
    return items;
  }

  Future<void> addToCart(ProductModel product) async {
    final cartBox = LocalStorage.cartBox;
    final existingJson = cartBox.get(product.id.toString());

    if (existingJson != null) {
      final existingItem = CartItemModel.fromJson(jsonDecode(existingJson));
      existingItem.quantity += 1;
      await cartBox.put(
        product.id.toString(),
        jsonEncode(existingItem.toJson()),
      );
    } else {
      final newItem = CartItemModel(product: product, quantity: 1);
      await cartBox.put(product.id.toString(), jsonEncode(newItem.toJson()));
    }
  }

  Future<void> removeFromCart(int productId) async {
    await LocalStorage.cartBox.delete(productId.toString());
  }

  Future<void> updateQuantity(int productId, int quantity) async {
    final cartBox = LocalStorage.cartBox;
    if (quantity <= 0) {
      await removeFromCart(productId);
      return;
    }

    final existingJson = cartBox.get(productId.toString());
    if (existingJson != null) {
      final existingItem = CartItemModel.fromJson(jsonDecode(existingJson));
      existingItem.quantity = quantity;
      await cartBox.put(
        productId.toString(),
        jsonEncode(existingItem.toJson()),
      );
    }
  }

  Future<void> clearCart() async {
    await LocalStorage.cartBox.clear();
  }
}
