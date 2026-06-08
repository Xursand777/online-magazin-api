import 'dart:convert';
import 'package:dio/dio.dart';
import '../../../../core/models/cart_item_model.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';

class CartRepository {
  final ApiClient apiClient;

  CartRepository({required this.apiClient});

  // Local o'qish tez bo'lishi uchun (app ochilganda srazi chiqadi)
  List<CartItemModel> getCartItemsLocal() {
    final cartBox = LocalStorage.cartBox;
    final List<CartItemModel> items = [];

    for (var key in cartBox.keys) {
      final String? jsonString = cartBox.get(key);
      if (jsonString != null) {
        try {
          items.add(CartItemModel.fromJson(jsonDecode(jsonString)));
        } catch (e) {
          // parse error
        }
      }
    }
    return items;
  }

  // Tarmoqdan yangi holatni olib local'ni yangilash
  Future<List<CartItemModel>> fetchCartFromServer() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.cart);
      return _parseAndSaveCart(response.data);
    } catch (e) {
      // Tarmoq xatosi bo'lsa lokalni qaytaramiz
      return getCartItemsLocal();
    }
  }

  Future<void> addToCart(ProductModel product, {int quantity = 1}) async {
    // Optimistic qo'shish
    final tempItems = getCartItemsLocal();
    final idx = tempItems.indexWhere((i) => i.product.id == product.id);
    if (idx != -1) {
      tempItems[idx].quantity += quantity;
    } else {
      tempItems.add(CartItemModel(product: product, quantity: quantity));
    }
    await _saveLocalOnly(tempItems);

    try {
      final response = await apiClient.dio.post(
        ApiConstants.cartItems,
        data: {
          'product_id': product.id,
          'quantity': quantity,
          // Variantli karta bo'lsa, variant ID ham yuboriladi —
          // backend aynan shu variantni savatga qo'shadi.
          if (product.variantId != null) 'variant_id': product.variantId,
        },
      );
      _parseAndSaveCart(response.data);
    } catch (e) {
      // error handling can be added here
    }
  }

  Future<void> removeFromCart(int productId) async {
    // Optimistic o'chirish
    final tempItems = getCartItemsLocal();
    final itemToRemove = tempItems.where((i) => i.product.id == productId).firstOrNull;
    tempItems.removeWhere((i) => i.product.id == productId);
    await _saveLocalOnly(tempItems);

    if (itemToRemove?.id != null) {
      try {
        final response = await apiClient.dio.delete(
          '${ApiConstants.cartItems}${itemToRemove!.id}/',
        );
        _parseAndSaveCart(response.data);
      } catch (e) {
        // tarmoq xatosi
      }
    }
  }

  Future<void> updateQuantity(int productId, int quantity) async {
    if (quantity <= 0) {
      await removeFromCart(productId);
      return;
    }

    final tempItems = getCartItemsLocal();
    final itemToUpdate = tempItems.where((i) => i.product.id == productId).firstOrNull;
    if (itemToUpdate != null) {
      itemToUpdate.quantity = quantity;
      await _saveLocalOnly(tempItems);
      
      if (itemToUpdate.id != null) {
        try {
          final response = await apiClient.dio.patch(
            '${ApiConstants.cartItems}${itemToUpdate.id}/',
            data: {'quantity': quantity},
          );
          _parseAndSaveCart(response.data);
        } catch (e) {
          // tarmoq xatosi
        }
      } else {
        // Agar hali id yo'q bo'lsa (yangi qo'shilgan), qayta qo'shamiz
        await addToCart(itemToUpdate.product, quantity: quantity);
      }
    }
  }

  Future<void> clearCart() async {
    await LocalStorage.cartBox.clear();
    // Backend API'sida to'liq tozalash uchun alohida endpoint yo'q ekan.
    // Odatda logout bo'lganda tozalash chaqiriladi. O'chirib turish yetarli.
  }

  Future<List<CartItemModel>> syncLocalCartWithServer() async {
    final localItems = getCartItemsLocal();
    if (localItems.isEmpty) {
      return fetchCartFromServer(); // shunchaki yuklab olamiz
    }

    try {
      final itemsData = localItems.map((i) => {
        'product_id': i.product.id,
        'quantity': i.quantity,
        // Variant ID ham yuboriladi (variantli kartalar uchun)
        if (i.product.variantId != null) 'variant_id': i.product.variantId,
      }).toList();

      final response = await apiClient.dio.post(
        ApiConstants.syncLocalCart,
        data: {'items': itemsData},
      );
      return _parseAndSaveCart(response.data['cart']);
    } catch (e) {
      return localItems;
    }
  }

  // --- Helpers ---
  List<CartItemModel> _parseAndSaveCart(Map<String, dynamic> cartData) {
    final itemsList = cartData['items'] as List<dynamic>? ?? [];
    final items = itemsList.map((i) {
      // product detail backend'dan qaytadi (ProductListSerializer)
      final productData = i['product_details']; 
      final qty = i['quantity'];
      final cartItemId = i['id'];
      
      return CartItemModel(
        id: cartItemId,
        product: ProductModel.fromJson(productData),
        quantity: qty,
      );
    }).toList();

    _saveLocalOnly(items);
    return items;
  }

  Future<void> _saveLocalOnly(List<CartItemModel> items) async {
    final cartBox = LocalStorage.cartBox;
    await cartBox.clear();
    for (final item in items) {
      await cartBox.put(item.product.id.toString(), jsonEncode(item.toJson()));
    }
  }
}
