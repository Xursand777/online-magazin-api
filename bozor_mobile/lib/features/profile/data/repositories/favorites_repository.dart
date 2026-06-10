import 'dart:convert';
import '../../../../core/models/product_model.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/storage/local_storage.dart';

class FavoritesRepository {
  final ApiClient apiClient;

  FavoritesRepository({required this.apiClient});

  /// Reads favorites cached locally in Hive (instant load for guest and offline)
  List<ProductModel> getFavoritesLocal() {
    final favoritesBox = LocalStorage.favoritesBox;
    final List<ProductModel> items = [];
    for (var key in favoritesBox.keys) {
      final String? jsonString = favoritesBox.get(key) as String?;
      if (jsonString != null) {
        try {
          items.add(ProductModel.fromJson(jsonDecode(jsonString) as Map<String, dynamic>));
        } catch (_) {
          // Ignore corrupt data
        }
      }
    }
    return items;
  }

  /// Fetches fresh favorites list from the server and caches them locally
  Future<List<ProductModel>> fetchFavoritesFromServer() async {
    final isLoggedIn = await apiClient.tokenService.hasTokens();
    if (!isLoggedIn) {
      return getFavoritesLocal();
    }
    try {
      final response = await apiClient.dio.get(ApiConstants.favorites);
      final List<dynamic> dataList = response.data as List<dynamic>;
      final items = dataList.map((json) {
        return ProductModel.fromJson(json as Map<String, dynamic>);
      }).toList();

      await _saveLocalOnly(items);
      return items;
    } catch (_) {
      return getFavoritesLocal();
    }
  }

  /// Toggles favorite status on server and local database.
  /// Returns updated status: `true` (is favorite) or `false`.
  Future<bool> toggleFavorite(ProductModel product) async {
    final tempItems = getFavoritesLocal();
    final isFav = tempItems.any((i) => i.id == product.id);

    if (isFav) {
      tempItems.removeWhere((i) => i.id == product.id);
    } else {
      tempItems.add(product);
    }
    await _saveLocalOnly(tempItems);

    final isLoggedIn = await apiClient.tokenService.hasTokens();
    if (isLoggedIn) {
      try {
        final response = await apiClient.dio.post(
          ApiConstants.favoriteToggle,
          data: {'product_id': product.id},
        );
        final bool isFavServer = response.data['is_favorite'] as bool? ?? !isFav;
        return isFavServer;
      } catch (_) {
        // Fallback to local state
      }
    }
    return !isFav;
  }

  /// Synchronizes locally saved favorites with the Django backend database
  Future<List<ProductModel>> syncLocalFavoritesWithServer() async {
    final localItems = getFavoritesLocal();
    final isLoggedIn = await apiClient.tokenService.hasTokens();
    if (!isLoggedIn || localItems.isEmpty) {
      return fetchFavoritesFromServer();
    }

    try {
      final productIds = localItems.map((i) => i.id).toList();
      final response = await apiClient.dio.post(
        ApiConstants.favoriteSync,
        data: {'product_ids': productIds},
      );

      final List<dynamic> dataList = response.data as List<dynamic>;
      final items = dataList.map((json) {
        return ProductModel.fromJson(json as Map<String, dynamic>);
      }).toList();

      await _saveLocalOnly(items);
      return items;
    } catch (_) {
      return fetchFavoritesFromServer();
    }
  }

  /// Clears local favorites cache
  Future<void> clearFavorites() async {
    await LocalStorage.favoritesBox.clear();
  }

  /// Overwrites current local Hive box items
  Future<void> _saveLocalOnly(List<ProductModel> items) async {
    final favoritesBox = LocalStorage.favoritesBox;
    await favoritesBox.clear();
    for (final item in items) {
      await favoritesBox.put(item.id.toString(), jsonEncode(item.toJson()));
    }
  }
}
