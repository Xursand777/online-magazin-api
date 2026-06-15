import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_order_model.dart';
import '../../data/repositories/admin_repository.dart';

// ─── Filtr ───────────────────────────────────────────────────────────────────
class OrderFilters extends Equatable {
  final String q;
  final String status;
  final String paymentMethod;
  final String isCredit;
  final String dateFrom;
  final String dateTo;
  final int page;

  const OrderFilters({
    this.q = '',
    this.status = '',
    this.paymentMethod = '',
    this.isCredit = '',
    this.dateFrom = '',
    this.dateTo = '',
    this.page = 1,
  });

  OrderFilters copyWith({
    String? q,
    String? status,
    String? paymentMethod,
    String? isCredit,
    String? dateFrom,
    String? dateTo,
    int? page,
  }) {
    return OrderFilters(
      q: q ?? this.q,
      status: status ?? this.status,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      isCredit: isCredit ?? this.isCredit,
      dateFrom: dateFrom ?? this.dateFrom,
      dateTo: dateTo ?? this.dateTo,
      page: page ?? this.page,
    );
  }

  bool get hasActive =>
      q.isNotEmpty ||
      status.isNotEmpty ||
      paymentMethod.isNotEmpty ||
      isCredit.isNotEmpty ||
      dateFrom.isNotEmpty ||
      dateTo.isNotEmpty;

  @override
  List<Object?> get props =>
      [q, status, paymentMethod, isCredit, dateFrom, dateTo, page];
}

// ─── Events ──────────────────────────────────────────────────────────────────
abstract class AdminOrdersEvent extends Equatable {
  const AdminOrdersEvent();
  @override
  List<Object?> get props => [];
}

class LoadOrders extends AdminOrdersEvent {
  const LoadOrders();
}

/// Joriy filtr bo'yicha ro'yxatni JIM (loading-flash'siz) qayta yuklash —
/// real-time polling yangi buyurtma aniqlaganda ishlatiladi. Foydalanuvchi
/// loading spinnerni ko'rmaydi, ro'yxat shunchaki yangilanadi.
class SilentReloadOrders extends AdminOrdersEvent {
  const SilentReloadOrders();
}

class ApplyOrderFilters extends AdminOrdersEvent {
  final OrderFilters filters;
  const ApplyOrderFilters(this.filters);
  @override
  List<Object?> get props => [filters];
}

class ChangeOrderPage extends AdminOrdersEvent {
  final int page;
  const ChangeOrderPage(this.page);
  @override
  List<Object?> get props => [page];
}

class UpdateOrderStatus extends AdminOrdersEvent {
  final int id;
  final String status;
  final String note;
  const UpdateOrderStatus(this.id, this.status, {this.note = ''});
  @override
  List<Object?> get props => [id, status, note];
}

class PayCreditOrder extends AdminOrdersEvent {
  final int id;
  const PayCreditOrder(this.id);
  @override
  List<Object?> get props => [id];
}

// ─── State ───────────────────────────────────────────────────────────────────
enum OrdersStatus { initial, loading, success, failure }

class AdminOrdersState extends Equatable {
  final OrdersStatus status;
  final List<AdminOrder> orders;
  final int count;
  final bool hasNext;
  final bool hasPrev;
  final OrderFilters filters;
  final bool isMutating;
  final String? error;
  final String? successMessage;

  const AdminOrdersState({
    this.status = OrdersStatus.initial,
    this.orders = const [],
    this.count = 0,
    this.hasNext = false,
    this.hasPrev = false,
    this.filters = const OrderFilters(),
    this.isMutating = false,
    this.error,
    this.successMessage,
  });

  int get totalPages => count <= 0 ? 1 : ((count + 19) ~/ 20);

  AdminOrdersState copyWith({
    OrdersStatus? status,
    List<AdminOrder>? orders,
    int? count,
    bool? hasNext,
    bool? hasPrev,
    OrderFilters? filters,
    bool? isMutating,
    String? error,
    String? successMessage,
  }) {
    return AdminOrdersState(
      status: status ?? this.status,
      orders: orders ?? this.orders,
      count: count ?? this.count,
      hasNext: hasNext ?? this.hasNext,
      hasPrev: hasPrev ?? this.hasPrev,
      filters: filters ?? this.filters,
      isMutating: isMutating ?? this.isMutating,
      error: error,
      successMessage: successMessage,
    );
  }

  @override
  List<Object?> get props => [
        status,
        orders,
        count,
        hasNext,
        hasPrev,
        filters,
        isMutating,
        error,
        successMessage,
      ];
}

// ─── BLoC ────────────────────────────────────────────────────────────────────
class AdminOrdersBloc extends Bloc<AdminOrdersEvent, AdminOrdersState> {
  final AdminRepository repository;

  AdminOrdersBloc({required this.repository}) : super(const AdminOrdersState()) {
    on<LoadOrders>(_onLoad);
    on<SilentReloadOrders>(_onSilentReload);
    on<ApplyOrderFilters>(_onApplyFilters);
    on<ChangeOrderPage>(_onChangePage);
    on<UpdateOrderStatus>(_onUpdateStatus);
    on<PayCreditOrder>(_onPayCredit);
  }

  /// Jim qayta yuklash — joriy filtr saqlanadi, loading holati EMIT QILINMAYDI
  /// (ro'yxat eski ma'lumotni ko'rsatib turadi, kelgach yangilanadi). Xato bo'lsa
  /// jim o'tkaziladi — keyingi poll/yangilashda qayta urinadi.
  Future<void> _onSilentReload(
    SilentReloadOrders event,
    Emitter<AdminOrdersState> emit,
  ) async {
    try {
      final f = state.filters;
      final page = await repository.getOrders(
        q: f.q,
        status: f.status,
        paymentMethod: f.paymentMethod,
        isCredit: f.isCredit,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        page: f.page,
      );
      emit(state.copyWith(
        status: OrdersStatus.success,
        orders: page.orders,
        count: page.count,
        hasNext: page.hasNext,
        hasPrev: page.hasPrev,
      ));
    } catch (_) {
      // jim — keyingi tick'da qayta urinadi
    }
  }

  Future<void> _fetch(Emitter<AdminOrdersState> emit, OrderFilters f) async {
    emit(state.copyWith(
        status: OrdersStatus.loading, filters: f, error: null, successMessage: null));
    try {
      final page = await repository.getOrders(
        q: f.q,
        status: f.status,
        paymentMethod: f.paymentMethod,
        isCredit: f.isCredit,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        page: f.page,
      );
      emit(state.copyWith(
        status: OrdersStatus.success,
        orders: page.orders,
        count: page.count,
        hasNext: page.hasNext,
        hasPrev: page.hasPrev,
      ));
    } catch (e) {
      emit(state.copyWith(
        status: OrdersStatus.failure,
        error: AdminRepository.parseError(e),
      ));
    }
  }

  Future<void> _onLoad(LoadOrders event, Emitter<AdminOrdersState> emit) =>
      _fetch(emit, state.filters);

  Future<void> _onApplyFilters(
    ApplyOrderFilters event,
    Emitter<AdminOrdersState> emit,
  ) =>
      _fetch(emit, event.filters.copyWith(page: 1));

  Future<void> _onChangePage(
    ChangeOrderPage event,
    Emitter<AdminOrdersState> emit,
  ) =>
      _fetch(emit, state.filters.copyWith(page: event.page));

  Future<void> _onUpdateStatus(
    UpdateOrderStatus event,
    Emitter<AdminOrdersState> emit,
  ) async {
    emit(state.copyWith(isMutating: true, error: null, successMessage: null));
    try {
      final updated = await repository.updateOrderStatus(
        event.id,
        status: event.status,
        note: event.note,
      );
      final list = state.orders
          .map((o) => o.id == updated.id ? updated : o)
          .toList();
      emit(state.copyWith(
        orders: list,
        isMutating: false,
        successMessage: 'Buyurtma holati yangilandi.',
      ));
    } catch (e) {
      emit(state.copyWith(
          isMutating: false, error: AdminRepository.parseError(e)));
    }
  }

  Future<void> _onPayCredit(
    PayCreditOrder event,
    Emitter<AdminOrdersState> emit,
  ) async {
    emit(state.copyWith(isMutating: true, error: null, successMessage: null));
    try {
      final updated = await repository.payCreditOrder(event.id);
      final list = state.orders
          .map((o) => o.id == updated.id ? updated : o)
          .toList();
      emit(state.copyWith(
        orders: list,
        isMutating: false,
        successMessage: "Muddatli to'lov qabul qilindi.",
      ));
    } catch (e) {
      emit(state.copyWith(
          isMutating: false, error: AdminRepository.parseError(e)));
    }
  }
}
