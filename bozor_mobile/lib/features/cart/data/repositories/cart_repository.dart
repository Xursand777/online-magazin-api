import 'dart:convert';

import '../../../../core/models/cart_item_model.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/storage/local_storage.dart';

/// Cart repository — **variant-aware**: bir mahsulotning bir nechta variantlari
/// alohida cart line item'lari sifatida saqlanadi.
///
/// Unique kalit = `(product_id, variant_id)`. Variantsiz mahsulot uchun
/// variant_id = null. Bu — sayt va backend bilan to'liq mos.
///
/// Backend CartItem (cart/models.py):
///   class Meta: unique_together = ('cart', 'product', 'variant')
///
/// Mobile cart bu mantiqni AYNI saqlashi shart. Avval qilingan implementatsiya
/// faqat product_id ga qaragan edi — 2 variantni aralashtirib yuborar edi.
class CartRepository {
  final ApiClient apiClient;

  CartRepository({required this.apiClient});

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: server bilan ishlash
  // ═══════════════════════════════════════════════════════════════════════════

  /// Lokal Hive'dan o'qish — app ochilganda darhol UI ko'rsatish uchun.
  List<CartItemModel> getCartItemsLocal() {
    final cartBox = LocalStorage.cartBox;
    final List<CartItemModel> items = [];
    for (var key in cartBox.keys) {
      final String? jsonString = cartBox.get(key);
      if (jsonString != null) {
        try {
          items.add(CartItemModel.fromJson(jsonDecode(jsonString)));
        } catch (_) {
          // Buzilgan JSON — o'tib yuboramiz
        }
      }
    }
    return items;
  }

  /// Server'dan fresh cart oladi va lokalga yozadi.
  Future<List<CartItemModel>> fetchCartFromServer() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.cart);
      return _parseAndSaveCart(response.data);
    } catch (_) {
      return getCartItemsLocal();
    }
  }

  /// Mahsulotni (variant bilan birga) savatga qo'shadi.
  ///
  /// Avval lokalga optimistic yozadi (UI darhol yangilanadi),
  /// keyin serverga POST qiladi va server javobi bilan qayta yozadi.
  Future<void> addToCart(ProductModel product, {int quantity = 1}) async {
    final tempItems = getCartItemsLocal();
    // Variant-aware index: (product_id, variant_id) bo'yicha qidiramiz.
    final idx = _variantIndexOf(tempItems, product.id, product.variantId);
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
          if (product.variantId != null) 'variant_id': product.variantId,
        },
      );
      _parseAndSaveCart(response.data);
    } catch (_) {
      // Tarmoq xatosi — keyingi syncCart vaqtida tuzatiladi
    }
  }

  /// Variant-aware o'chirish.
  Future<void> removeFromCart(int productId, {int? variantId}) async {
    final tempItems = getCartItemsLocal();
    final itemToRemove = _findVariant(tempItems, productId, variantId);
    tempItems.removeWhere(
      (i) => i.product.id == productId && i.product.variantId == variantId,
    );
    await _saveLocalOnly(tempItems);

    if (itemToRemove?.id != null) {
      try {
        final response = await apiClient.dio.delete(
          '${ApiConstants.cartItems}${itemToRemove!.id}/',
        );
        _parseAndSaveCart(response.data);
      } catch (_) {
        // Tarmoq xatosi
      }
    }
  }

  /// Variant-aware quantity yangilash.
  /// quantity <= 0 → removeFromCart chaqiriladi.
  Future<void> updateQuantity(
    int productId,
    int quantity, {
    int? variantId,
  }) async {
    if (quantity <= 0) {
      await removeFromCart(productId, variantId: variantId);
      return;
    }

    final tempItems = getCartItemsLocal();
    final itemToUpdate = _findVariant(tempItems, productId, variantId);
    if (itemToUpdate == null) return;

    itemToUpdate.quantity = quantity;
    await _saveLocalOnly(tempItems);

    if (itemToUpdate.id != null) {
      try {
        final response = await apiClient.dio.patch(
          '${ApiConstants.cartItems}${itemToUpdate.id}/',
          data: {'quantity': quantity},
        );
        _parseAndSaveCart(response.data);
      } catch (_) {
        // Tarmoq xatosi
      }
    } else {
      // ID yo'q — yangi qo'shilgan, qayta POST orqali ID olish kerak
      await addToCart(itemToUpdate.product, quantity: quantity);
    }
  }

  /// Cart'ni butunlay tozalash — **server + lokal**.
  ///
  /// ⚠ KRITIK BUG-FIX:
  ///   Avval faqat lokal Hive box tozalanardi, server cart o'z holicha qolardi.
  ///   Foydalanuvchi cart'ni "tozalagan" deb o'ylar edi, lekin home'dan
  ///   yangi mahsulot qo'shganda POST server'ga ketardi va server javobida
  ///   ESKI itemlar qaytib chiqar edi (chunki server'da hali ham bor edi).
  ///   Bu "ghost items resurrection" bug edi.
  ///
  /// Endi: server cart'ni avval olamiz, har bir item'ni DELETE qilamiz,
  /// keyin lokal tozalanadi. Server bilan local doim sinxron.
  Future<void> clearCart() async {
    // Avval server'dan fresh cart olamiz (lokal stale bo'lishi mumkin)
    List<CartItemModel> serverItems;
    try {
      final response = await apiClient.dio.get(ApiConstants.cart);
      final cartData = response.data as Map<String, dynamic>;
      final itemsList = cartData['items'] as List<dynamic>? ?? [];
      serverItems = itemsList
          .map((rawItem) {
            final i = rawItem as Map<String, dynamic>;
            return CartItemModel(
              id: i['id'] as int?,
              product: ProductModel.fromJson(
                Map<String, dynamic>.from(i['product_details'] as Map),
              ),
              quantity: 0, // qiymat muhim emas, faqat ID kerak
            );
          })
          .toList();
    } catch (_) {
      // Server xato — lokal bilan o'tamiz
      serverItems = getCartItemsLocal();
    }

    // Har bir item'ni server'dan DELETE qilamiz (parallel).
    // Birortasi xato bersa ham boshqalarining muvaffaqiyatiga ta'sir qilmaydi.
    final deleteFutures = serverItems
        .where((item) => item.id != null)
        .map((item) async {
      try {
        await apiClient.dio.delete('${ApiConstants.cartItems}${item.id}/');
      } catch (_) {
        // Item allaqachon o'chirilgan yoki tarmoq xatosi — silently ignore
      }
    });
    await Future.wait(deleteFutures);

    // Lokal'ni tozalaymiz
    await LocalStorage.cartBox.clear();
  }

  /// Login bo'lgandan keyin lokal guest cart'ni server cart'ga merge qiladi.
  Future<List<CartItemModel>> syncLocalCartWithServer() async {
    final localItems = getCartItemsLocal();
    if (localItems.isEmpty) return fetchCartFromServer();

    try {
      final itemsData = localItems
          .map((i) => {
                'product_id': i.product.id,
                'quantity': i.quantity,
                if (i.product.variantId != null)
                  'variant_id': i.product.variantId,
              })
          .toList();

      final response = await apiClient.dio.post(
        ApiConstants.syncLocalCart,
        data: {'items': itemsData},
      );
      final cartData = response.data is Map && (response.data as Map).containsKey('cart')
          ? response.data['cart'] as Map<String, dynamic>
          : response.data as Map<String, dynamic>;
      return _parseAndSaveCart(cartData);
    } catch (_) {
      return localItems;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: variant-aware helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /// `(productId, variantId)` juftligi bo'yicha index topadi. Yo'q bo'lsa -1.
  int _variantIndexOf(List<CartItemModel> items, int productId, int? variantId) {
    return items.indexWhere(
      (i) => i.product.id == productId && i.product.variantId == variantId,
    );
  }

  CartItemModel? _findVariant(
    List<CartItemModel> items,
    int productId,
    int? variantId,
  ) {
    final idx = _variantIndexOf(items, productId, variantId);
    return idx == -1 ? null : items[idx];
  }

  /// Server cart javobini parse qiladi, variant ma'lumotlarini ProductModel
  /// ichiga injekt qiladi (variantId + variant atributlari + variant
  /// narxi + variant rasmi + variant to'liq nomi).
  List<CartItemModel> _parseAndSaveCart(Map<String, dynamic> cartData) {
    final itemsList = cartData['items'] as List<dynamic>? ?? [];
    final items = itemsList.map((rawItem) {
      final i = rawItem as Map<String, dynamic>;
      final cartItemId = i['id'];
      final qty = i['quantity'] is int ? i['quantity'] as int : 1;

      // product_details — ProductListSerializer dan keladi (base mahsulot)
      final productData = Map<String, dynamic>.from(
        i['product_details'] as Map,
      );
      final baseName = productData['name'] as String? ?? '';

      // variant_details — agar variantli bo'lsa, alohida obyekt
      final variantId = i['variant'] is int ? i['variant'] as int : null;
      final variantDetails = i['variant_details'];

      // ─── Variant ma'lumotlarini ProductModel ichiga injekt qilamiz ──────
      productData['variant_id'] = variantId;

      if (variantDetails is Map<String, dynamic>) {
        // Variant atributlari — UI variant pickerlari + qidiruv uchun
        productData['variant'] = {
          'color': variantDetails['color'],
          'color_hex': variantDetails['color_hex'],
          'quality': variantDetails['quality'],
          'model': variantDetails['model'],
          'size': variantDetails['size'],
        };

        // Variant narxi — base price'ni override qiladi
        final vDiscount = variantDetails['discount_price'];
        final vPrice = variantDetails['price'];
        if (vDiscount != null) {
          productData['discount_price'] = vDiscount;
        } else if (vPrice != null) {
          productData['price'] = vPrice;
        }

        // ⚠ KRITIK BUG-FIX: variant.stock'ni base mahsulot stock'i ustiga
        // qo'yamiz. Avval bu yo'q edi → cart item base product stock'i bilan
        // saqlanardi (odatda 0 yoki 1). Bu CartActionButton "+" tugmasini
        // qulflar edi va foydalanuvchi miqdorini oshira olmasdi.
        final vStock = variantDetails['stock'];
        if (vStock != null) {
          productData['stock'] = vStock;
        }

        // Variant rasmi — variant gallery'dan birinchi yoki variant.image_url
        String? variantImage;
        final variantImages = variantDetails['images'];
        if (variantImages is List && variantImages.isNotEmpty) {
          final first = variantImages.first;
          if (first is Map && first['url'] is String) {
            variantImage = first['url'] as String;
          }
        }
        variantImage ??= variantDetails['image_url'] as String?;
        if (variantImage != null && variantImage.isNotEmpty) {
          productData['image_url'] = variantImage;
        }

        // To'liq variant nomi: "Base • model • size • quality • color"
        productData['name'] = _buildVariantName(baseName, variantDetails);
      }

      return CartItemModel(
        id: cartItemId,
        product: ProductModel.fromJson(productData),
        quantity: qty,
      );
    }).toList();

    _saveLocalOnly(items);
    return items;
  }

  /// Variant nomini birlashtirish — backend `_build_variant_card_name` bilan
  /// MOS tartibda: base • model • size • quality • color.
  String _buildVariantName(String baseName, Map<String, dynamic> v) {
    final parts = <String>[baseName];
    for (final attr in const ['model', 'size', 'quality', 'color']) {
      final value = v[attr];
      if (value is String && value.trim().isNotEmpty) {
        parts.add(value.trim());
      }
    }
    return parts.join(' • ');
  }

  /// Lokal Hive'ga yozish — kalit `productId-variantId` formati.
  /// Avval faqat productId edi → 2 variant bir-birini almashtirib yuborardi.
  Future<void> _saveLocalOnly(List<CartItemModel> items) async {
    final cartBox = LocalStorage.cartBox;
    await cartBox.clear();
    for (final item in items) {
      final key = '${item.product.id}-${item.product.variantId ?? 'base'}';
      await cartBox.put(key, jsonEncode(item.toJson()));
    }
  }
}
