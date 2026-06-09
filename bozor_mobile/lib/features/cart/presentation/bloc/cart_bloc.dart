import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/cart_item_model.dart';
import '../../../../core/models/product_model.dart';
import '../../data/repositories/cart_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS — variant-aware (productId + variantId hammasida)
// ═══════════════════════════════════════════════════════════════════════════════

abstract class CartEvent extends Equatable {
  const CartEvent();
  @override
  List<Object?> get props => [];
}

class LoadCart extends CartEvent {}

/// Mahsulotni savatga qo'shadi. variant_id `ProductModel.variantId` dan olinadi
/// (variant kartasi bo'lsa). Bu — backend bilan to'liq mos.
class AddToCart extends CartEvent {
  final ProductModel product;
  const AddToCart(this.product);
  @override
  List<Object?> get props => [product];
}

/// Variant-aware o'chirish: bir mahsulotning faqat bitta varianti olib
/// tashlanadi (boshqa variantlari saqlanadi).
class RemoveFromCart extends CartEvent {
  final int productId;
  final int? variantId;
  const RemoveFromCart(this.productId, {this.variantId});
  @override
  List<Object?> get props => [productId, variantId];
}

/// Variant-aware quantity yangilash.
class UpdateQuantity extends CartEvent {
  final int productId;
  final int? variantId;
  final int quantity;
  const UpdateQuantity(this.productId, this.quantity, {this.variantId});
  @override
  List<Object?> get props => [productId, variantId, quantity];
}

class ClearCart extends CartEvent {}

class ResetCart extends CartEvent {
  const ResetCart();
  @override
  List<Object?> get props => [];
}

class SyncCartWithServer extends CartEvent {
  const SyncCartWithServer();
  @override
  List<Object?> get props => [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

class CartState extends Equatable {
  final List<CartItemModel> items;

  const CartState({this.items = const []});

  /// Variant-aware quantity lookup helper.
  /// CartActionButton va ProductDetail tomonidan ishlatiladi.
  int quantityFor(int productId, int? variantId) {
    for (final item in items) {
      if (item.product.id == productId &&
          item.product.variantId == variantId) {
        return item.quantity;
      }
    }
    return 0;
  }

  /// Variant-aware cart item topish.
  CartItemModel? findItem(int productId, int? variantId) {
    for (final item in items) {
      if (item.product.id == productId &&
          item.product.variantId == variantId) {
        return item;
      }
    }
    return null;
  }

  double get totalAmount {
    return items.fold(
      0,
      (sum, item) => sum + (item.product.price * item.quantity),
    );
  }

  /// Soni — barcha cart item'lar miqdorlarining yig'indisi.
  /// Cart badge'da ko'rinadi (savat ikonidagi raqam).
  int get totalItemCount => items.fold(0, (sum, i) => sum + i.quantity);

  @override
  List<Object?> get props => [items];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════════

class CartBloc extends Bloc<CartEvent, CartState> {
  final CartRepository repository;

  CartBloc({required this.repository}) : super(const CartState()) {
    on<LoadCart>(_onLoadCart);
    on<AddToCart>(_onAddToCart);
    on<RemoveFromCart>(_onRemoveFromCart);
    on<UpdateQuantity>(_onUpdateQuantity);
    on<ClearCart>(_onClearCart);
    on<ResetCart>(_onResetCart);
    on<SyncCartWithServer>(_onSyncCartWithServer);
  }

  void _onLoadCart(LoadCart event, Emitter<CartState> emit) {
    final items = repository.getCartItemsLocal();
    emit(CartState(items: items));
    _fetchAndEmit(emit);
  }

  Future<void> _fetchAndEmit(Emitter<CartState> emit) async {
    final serverItems = await repository.fetchCartFromServer();
    emit(CartState(items: serverItems));
  }

  Future<void> _onAddToCart(AddToCart event, Emitter<CartState> emit) async {
    // Optimistic update — UI darhol yangilanadi
    final currentItems = List<CartItemModel>.from(state.items);
    // Variant-aware index — variantId bo'yicha ham qidiramiz
    final idx = currentItems.indexWhere((i) =>
        i.product.id == event.product.id &&
        i.product.variantId == event.product.variantId);
    if (idx != -1) {
      currentItems[idx].quantity += 1;
    } else {
      currentItems.add(CartItemModel(product: event.product, quantity: 1));
    }
    emit(CartState(items: currentItems));

    // Server'ga POST
    await repository.addToCart(event.product);
    // Server javobidagi yangi ID lar bilan qayta sinxron
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onRemoveFromCart(
    RemoveFromCart event,
    Emitter<CartState> emit,
  ) async {
    final currentItems = List<CartItemModel>.from(state.items);
    currentItems.removeWhere((i) =>
        i.product.id == event.productId &&
        i.product.variantId == event.variantId);
    emit(CartState(items: currentItems));

    await repository.removeFromCart(event.productId, variantId: event.variantId);
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onUpdateQuantity(
    UpdateQuantity event,
    Emitter<CartState> emit,
  ) async {
    final currentItems = List<CartItemModel>.from(state.items);
    final idx = currentItems.indexWhere((i) =>
        i.product.id == event.productId &&
        i.product.variantId == event.variantId);
    if (idx != -1) {
      if (event.quantity <= 0) {
        currentItems.removeAt(idx);
      } else {
        currentItems[idx].quantity = event.quantity;
      }
    }
    emit(CartState(items: currentItems));

    await repository.updateQuantity(
      event.productId,
      event.quantity,
      variantId: event.variantId,
    );
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onClearCart(ClearCart event, Emitter<CartState> emit) async {
    // UI darhol bo'shaydi (optimistic) — repository server + lokal'ni tozalaydi
    emit(const CartState());
    await repository.clearCart();
    // Server javobi keldi — endi mantiqan ham, fizikan ham bo'sh
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onSyncCartWithServer(
    SyncCartWithServer event,
    Emitter<CartState> emit,
  ) async {
    final syncedItems = await repository.syncLocalCartWithServer();
    emit(CartState(items: syncedItems));
  }

  Future<void> _onResetCart(ResetCart event, Emitter<CartState> emit) async {
    await repository.clearCart();
    emit(const CartState());
  }
}
