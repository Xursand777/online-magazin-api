import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/cart_item_model.dart';
import '../../../../core/models/product_model.dart';
import '../../data/repositories/cart_repository.dart';

// --- Events ---
abstract class CartEvent extends Equatable {
  const CartEvent();
  @override
  List<Object?> get props => [];
}

class LoadCart extends CartEvent {}

class AddToCart extends CartEvent {
  final ProductModel product;
  const AddToCart(this.product);
  @override
  List<Object?> get props => [product];
}

class RemoveFromCart extends CartEvent {
  final int productId;
  const RemoveFromCart(this.productId);
  @override
  List<Object?> get props => [productId];
}

class UpdateQuantity extends CartEvent {
  final int productId;
  final int quantity;
  const UpdateQuantity(this.productId, this.quantity);
  @override
  List<Object?> get props => [productId, quantity];
}

class ClearCart extends CartEvent {}

/// Logout vaqtida butun cart holatini va lokal saqlanmani tozalaydi.
/// ClearCart dan farqi: foydalanuvchi tugmasi orqali emas, sessiya tugaganda.
class ResetCart extends CartEvent {
  const ResetCart();
  @override
  List<Object?> get props => [];
}

/// Tizimga kirgandan so'ng lokal savatchani backend bilan sinxronlash
class SyncCartWithServer extends CartEvent {
  const SyncCartWithServer();
  @override
  List<Object?> get props => [];
}

// --- States ---
class CartState extends Equatable {
  final List<CartItemModel> items;

  const CartState({this.items = const []});

  double get totalAmount {
    return items.fold(
      0,
      (sum, item) => sum + (item.product.price * item.quantity),
    );
  }

  @override
  List<Object?> get props => [items];
}

// --- Bloc ---
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
    // Sinxron tarzda darhol o'qish
    final items = repository.getCartItemsLocal();
    emit(CartState(items: items));

    // Orqa fonda tarmoqdan yuklab olish
    _fetchAndEmit(emit);
  }

  Future<void> _fetchAndEmit(Emitter<CartState> emit) async {
    final serverItems = await repository.fetchCartFromServer();
    emit(CartState(items: serverItems));
  }

  Future<void> _onAddToCart(AddToCart event, Emitter<CartState> emit) async {
    // Darhol lokal cache dan update qilib UI ni yangilaymiz (optimistic update)
    final currentItems = List<CartItemModel>.from(state.items);
    final idx = currentItems.indexWhere((i) => i.product.id == event.product.id);
    if (idx != -1) {
      currentItems[idx].quantity += 1;
    } else {
      currentItems.add(CartItemModel(product: event.product, quantity: 1));
    }
    emit(CartState(items: currentItems));

    // Endi serverga yuboramiz
    await repository.addToCart(event.product);
    // Server javobidan so'ng yana bir bor yangilaymiz (ID lar keladi)
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onRemoveFromCart(
    RemoveFromCart event,
    Emitter<CartState> emit,
  ) async {
    // Optimistic update
    final currentItems = List<CartItemModel>.from(state.items);
    currentItems.removeWhere((i) => i.product.id == event.productId);
    emit(CartState(items: currentItems));

    await repository.removeFromCart(event.productId);
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onUpdateQuantity(
    UpdateQuantity event,
    Emitter<CartState> emit,
  ) async {
    // Optimistic update
    final currentItems = List<CartItemModel>.from(state.items);
    final idx = currentItems.indexWhere((i) => i.product.id == event.productId);
    if (idx != -1) {
      if (event.quantity <= 0) {
        currentItems.removeAt(idx);
      } else {
        currentItems[idx].quantity = event.quantity;
      }
    }
    emit(CartState(items: currentItems));

    await repository.updateQuantity(event.productId, event.quantity);
    emit(CartState(items: repository.getCartItemsLocal()));
  }

  Future<void> _onClearCart(ClearCart event, Emitter<CartState> emit) async {
    await repository.clearCart();
    emit(const CartState());
  }

  Future<void> _onSyncCartWithServer(SyncCartWithServer event, Emitter<CartState> emit) async {
    final syncedItems = await repository.syncLocalCartWithServer();
    emit(CartState(items: syncedItems));
  }

  /// Logout vaqtida cart holatini ham, lokal saqlanmani ham darhol tozalaydi.
  /// LoadCart chaqirilmaydi — yangi sessiya kelganida o'zi yuklaydi.
  Future<void> _onResetCart(ResetCart event, Emitter<CartState> emit) async {
    await repository.clearCart();
    emit(const CartState());
  }
}
