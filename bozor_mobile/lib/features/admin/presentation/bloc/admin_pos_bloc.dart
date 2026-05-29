import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_order_model.dart';
import '../../data/models/pos_model.dart';
import '../../data/repositories/admin_repository.dart';

// ─── Events ──────────────────────────────────────────────────────────────────
abstract class AdminPosEvent extends Equatable {
  const AdminPosEvent();
  @override
  List<Object?> get props => [];
}

class LoadPosProducts extends AdminPosEvent {
  const LoadPosProducts();
}

class PosSearchChanged extends AdminPosEvent {
  final String query;
  const PosSearchChanged(this.query);
  @override
  List<Object?> get props => [query];
}

class PosAddToCart extends AdminPosEvent {
  final PosCartItem item;
  const PosAddToCart(this.item);
  @override
  List<Object?> get props => [item];
}

class PosRemoveFromCart extends AdminPosEvent {
  final String cartId;
  const PosRemoveFromCart(this.cartId);
  @override
  List<Object?> get props => [cartId];
}

class PosUpdateQty extends AdminPosEvent {
  final String cartId;
  final int delta;
  const PosUpdateQty(this.cartId, this.delta);
  @override
  List<Object?> get props => [cartId, delta];
}

class PosClearCart extends AdminPosEvent {
  const PosClearCart();
}

class PosClearMessages extends AdminPosEvent {
  const PosClearMessages();
}

class PosCheckout extends AdminPosEvent {
  final String phone; // 9 digits
  final String firstName;
  final String lastName;
  final String paymentMethod; // cash | card | credit
  final int? creditDays;
  const PosCheckout({
    required this.phone,
    required this.firstName,
    required this.lastName,
    required this.paymentMethod,
    this.creditDays,
  });
  @override
  List<Object?> get props =>
      [phone, firstName, lastName, paymentMethod, creditDays];
}

// ─── State ───────────────────────────────────────────────────────────────────
enum PosStatus { initial, loading, success, failure }

class AdminPosState extends Equatable {
  final PosStatus status;
  final List<PosProduct> products;
  final List<PosCartItem> cart;
  final String search;
  final bool isCheckingOut;
  final String? error;
  final String? warning; // savatcha bo'yicha tezkor ogohlantirish
  final AdminOrder? completedOrder;

  const AdminPosState({
    this.status = PosStatus.initial,
    this.products = const [],
    this.cart = const [],
    this.search = '',
    this.isCheckingOut = false,
    this.error,
    this.warning,
    this.completedOrder,
  });

  double get totalAmount =>
      cart.fold(0, (sum, i) => sum + i.lineTotal);
  double get totalProfit =>
      cart.fold(0, (sum, i) => sum + i.lineProfit);
  int get cartCount => cart.length;

  /// Qidiruvga mos keluvchi tanlash birliklari.
  List<PosCartItem> get filteredUnits {
    final q = search.toLowerCase().trim();
    final result = <PosCartItem>[];
    for (final p in products) {
      for (final unit in p.toCartUnits()) {
        if (q.isEmpty ||
            unit.name.toLowerCase().contains(q) ||
            unit.sku.toLowerCase().contains(q) ||
            unit.model.toLowerCase().contains(q) ||
            unit.color.toLowerCase().contains(q)) {
          result.add(unit);
        }
      }
    }
    return result;
  }

  AdminPosState copyWith({
    PosStatus? status,
    List<PosProduct>? products,
    List<PosCartItem>? cart,
    String? search,
    bool? isCheckingOut,
    String? error,
    String? warning,
    AdminOrder? completedOrder,
    bool clearCompleted = false,
  }) {
    return AdminPosState(
      status: status ?? this.status,
      products: products ?? this.products,
      cart: cart ?? this.cart,
      search: search ?? this.search,
      isCheckingOut: isCheckingOut ?? this.isCheckingOut,
      error: error,
      warning: warning,
      completedOrder:
          clearCompleted ? null : (completedOrder ?? this.completedOrder),
    );
  }

  @override
  List<Object?> get props => [
        status,
        products,
        cart,
        search,
        isCheckingOut,
        error,
        warning,
        completedOrder,
      ];
}

// ─── BLoC ────────────────────────────────────────────────────────────────────
class AdminPosBloc extends Bloc<AdminPosEvent, AdminPosState> {
  final AdminRepository repository;

  AdminPosBloc({required this.repository}) : super(const AdminPosState()) {
    on<LoadPosProducts>(_onLoad);
    on<PosSearchChanged>(_onSearch);
    on<PosAddToCart>(_onAdd);
    on<PosRemoveFromCart>(_onRemove);
    on<PosUpdateQty>(_onUpdateQty);
    on<PosClearCart>(_onClear);
    on<PosClearMessages>(_onClearMessages);
    on<PosCheckout>(_onCheckout);
  }

  Future<void> _onLoad(LoadPosProducts event, Emitter<AdminPosState> emit) async {
    emit(state.copyWith(status: PosStatus.loading, error: null));
    try {
      final products = await repository.getPosProducts();
      emit(state.copyWith(status: PosStatus.success, products: products));
    } catch (e) {
      emit(state.copyWith(
          status: PosStatus.failure, error: AdminRepository.parseError(e)));
    }
  }

  void _onSearch(PosSearchChanged event, Emitter<AdminPosState> emit) {
    emit(state.copyWith(search: event.query));
  }

  void _onAdd(PosAddToCart event, Emitter<AdminPosState> emit) {
    final item = event.item;
    final existing = state.cart.where((i) => i.cartId == item.cartId).toList();
    if (existing.isEmpty) {
      if (item.stock < 1) {
        emit(state.copyWith(warning: 'Omborda qolmagan!'));
        return;
      }
      emit(state.copyWith(
        cart: [...state.cart, item.copyWith(quantity: 1)],
        warning: null,
      ));
      return;
    }
    final current = existing.first;
    if (current.quantity >= current.stock) {
      emit(state.copyWith(warning: 'Omborda yetarli emas!'));
      return;
    }
    emit(state.copyWith(
      cart: state.cart
          .map((i) => i.cartId == item.cartId
              ? i.copyWith(quantity: i.quantity + 1)
              : i)
          .toList(),
      warning: null,
    ));
  }

  void _onRemove(PosRemoveFromCart event, Emitter<AdminPosState> emit) {
    emit(state.copyWith(
      cart: state.cart.where((i) => i.cartId != event.cartId).toList(),
      warning: null,
    ));
  }

  void _onUpdateQty(PosUpdateQty event, Emitter<AdminPosState> emit) {
    final updated = <PosCartItem>[];
    String? warning;
    for (final i in state.cart) {
      if (i.cartId != event.cartId) {
        updated.add(i);
        continue;
      }
      final nq = i.quantity + event.delta;
      if (nq > i.stock) {
        warning = "Omborda buncha yo'q";
        updated.add(i);
      } else if (nq < 1) {
        updated.add(i);
      } else {
        updated.add(i.copyWith(quantity: nq));
      }
    }
    emit(state.copyWith(cart: updated, warning: warning));
  }

  void _onClear(PosClearCart event, Emitter<AdminPosState> emit) {
    emit(state.copyWith(cart: const [], warning: null));
  }

  void _onClearMessages(PosClearMessages event, Emitter<AdminPosState> emit) {
    emit(state.copyWith(error: null, warning: null, clearCompleted: true));
  }

  Future<void> _onCheckout(PosCheckout event, Emitter<AdminPosState> emit) async {
    if (state.cart.isEmpty) {
      emit(state.copyWith(error: "Savat bo'sh!"));
      return;
    }
    emit(state.copyWith(isCheckingOut: true, error: null));
    try {
      final order = await repository.createPosOrder(
        phone: '+998${event.phone}',
        firstName: event.firstName,
        lastName: event.lastName,
        paymentMethod: event.paymentMethod,
        creditDays: event.creditDays,
        items: state.cart,
      );
      // Sotuvdan keyin mahsulot zaxiralari o'zgargani uchun ro'yxatni yangilaymiz.
      List<PosProduct> products = state.products;
      try {
        products = await repository.getPosProducts();
      } catch (_) {/* zaxira yangilanmasa ham savdo muvaffaqiyatli */}
      emit(state.copyWith(
        isCheckingOut: false,
        cart: const [],
        products: products,
        completedOrder: order,
      ));
    } catch (e) {
      emit(state.copyWith(
          isCheckingOut: false, error: AdminRepository.parseError(e)));
    }
  }
}
