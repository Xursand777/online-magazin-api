import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/product_model.dart';
import '../../data/repositories/favorites_repository.dart';
import 'favorites_state.dart';

class FavoritesCubit extends Cubit<FavoritesState> {
  final FavoritesRepository repository;

  FavoritesCubit({required this.repository}) : super(FavoritesInitial());

  /// Loads favorites: shows local cache instantly (optimistic UX) and refreshes from server
  Future<void> loadFavorites() async {
    final localItems = repository.getFavoritesLocal();
    
    // Show local cache immediately if available
    if (localItems.isNotEmpty) {
      emit(FavoritesLoaded(List.from(localItems)));
    } else {
      emit(FavoritesLoading());
    }

    try {
      final serverItems = await repository.fetchFavoritesFromServer();
      emit(FavoritesLoaded(serverItems));
    } catch (e) {
      // If we already displayed local items, keep them. Otherwise emit error.
      if (state is! FavoritesLoaded) {
        emit(FavoritesError("Sevimlilarni yuklab bo'lmadi: ${e.toString()}"));
      }
    }
  }

  /// Toggles favorite status: updates the UI optimistically first
  Future<void> toggleFavorite(ProductModel product) async {
    List<ProductModel> currentFavorites = [];
    final currentState = state;
    if (currentState is FavoritesLoaded) {
      currentFavorites = List.from(currentState.favorites);
    } else {
      currentFavorites = List.from(repository.getFavoritesLocal());
    }

    final isFav = currentFavorites.any((i) => i.id == product.id);

    if (isFav) {
      currentFavorites.removeWhere((i) => i.id == product.id);
    } else {
      currentFavorites.add(product);
    }

    // Emit optimistic state immediately
    emit(FavoritesLoaded(currentFavorites));

    try {
      // Repository handles local Hive updates and server POST
      await repository.toggleFavorite(product);
      
      // Fetch fresh list from server if possible to ensure absolute sync
      final freshList = await repository.fetchFavoritesFromServer();
      emit(FavoritesLoaded(freshList));
    } catch (_) {
      // If server toggle fails, we keep the optimistic state (local Hive is already updated)
    }
  }

  /// Synchronizes guest offline favorites with backend DB after login
  Future<void> syncFavoritesWithServer() async {
    try {
      final items = await repository.syncLocalFavoritesWithServer();
      emit(FavoritesLoaded(items));
    } catch (e) {
      // Keep existing list on failure
    }
  }

  /// Checks if a product is favorited
  bool isProductFavorite(int productId) {
    final currentState = state;
    if (currentState is FavoritesLoaded) {
      return currentState.favorites.any((p) => p.id == productId);
    }
    // Fallback to local
    return repository.getFavoritesLocal().any((p) => p.id == productId);
  }

  /// Clears all favorites on logout
  Future<void> clearFavorites() async {
    await repository.clearFavorites();
    emit(const FavoritesLoaded([]));
  }
}
