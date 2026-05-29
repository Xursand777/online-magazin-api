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
  }

  void _onLoadCart(LoadCart event, Emitter<CartState> emit) {
    final items = repository.getCartItems();
    emit(CartState(items: items));
  }

  Future<void> _onAddToCart(AddToCart event, Emitter<CartState> emit) async {
    await repository.addToCart(event.product);
    add(LoadCart());
  }

  Future<void> _onRemoveFromCart(
    RemoveFromCart event,
    Emitter<CartState> emit,
  ) async {
    await repository.removeFromCart(event.productId);
    add(LoadCart());
  }

  Future<void> _onUpdateQuantity(
    UpdateQuantity event,
    Emitter<CartState> emit,
  ) async {
    await repository.updateQuantity(event.productId, event.quantity);
    add(LoadCart());
  }

  Future<void> _onClearCart(ClearCart event, Emitter<CartState> emit) async {
    await repository.clearCart();
    add(LoadCart());
  }
}
