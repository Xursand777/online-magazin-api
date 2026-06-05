import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_order_model.dart';
import '../../data/repositories/admin_repository.dart';

abstract class AdminNasiyaEvent {}

class LoadNasiya extends AdminNasiyaEvent {}

class LoadMoreNasiya extends AdminNasiyaEvent {}

class ChangeNasiyaFilter extends AdminNasiyaEvent {
  final String filter; // 'active', 'overdue', 'paid'
  ChangeNasiyaFilter(this.filter);
}

class PayNasiyaOrder extends AdminNasiyaEvent {
  final int orderId;
  PayNasiyaOrder(this.orderId);
}

class AdminNasiyaState {
  final bool isLoading;
  final bool isFetchingMore;
  final bool hasReachedMax;
  final String? error;
  
  final List<AdminOrder> orders;
  final int currentPage;
  
  final int activeCount;
  final int overdueCount;
  final int paidCount;
  
  final String filter; // 'active', 'overdue', 'paid'
  
  final bool isPaying;
  final String? payError;
  final bool paySuccess;

  AdminNasiyaState({
    this.isLoading = false,
    this.isFetchingMore = false,
    this.hasReachedMax = false,
    this.error,
    this.orders = const [],
    this.currentPage = 1,
    this.activeCount = 0,
    this.overdueCount = 0,
    this.paidCount = 0,
    this.filter = 'active',
    this.isPaying = false,
    this.payError,
    this.paySuccess = false,
  });

  AdminNasiyaState copyWith({
    bool? isLoading,
    bool? isFetchingMore,
    bool? hasReachedMax,
    String? error,
    List<AdminOrder>? orders,
    int? currentPage,
    int? activeCount,
    int? overdueCount,
    int? paidCount,
    String? filter,
    bool? isPaying,
    String? payError,
    bool? paySuccess,
  }) {
    return AdminNasiyaState(
      isLoading: isLoading ?? this.isLoading,
      isFetchingMore: isFetchingMore ?? this.isFetchingMore,
      hasReachedMax: hasReachedMax ?? this.hasReachedMax,
      error: error, // clears if not provided
      orders: orders ?? this.orders,
      currentPage: currentPage ?? this.currentPage,
      activeCount: activeCount ?? this.activeCount,
      overdueCount: overdueCount ?? this.overdueCount,
      paidCount: paidCount ?? this.paidCount,
      filter: filter ?? this.filter,
      isPaying: isPaying ?? this.isPaying,
      payError: payError,
      paySuccess: paySuccess ?? this.paySuccess,
    );
  }
}

class AdminNasiyaBloc extends Bloc<AdminNasiyaEvent, AdminNasiyaState> {
  final AdminRepository repository;

  AdminNasiyaBloc({required this.repository}) : super(AdminNasiyaState()) {
    on<LoadNasiya>(_onLoad);
    on<LoadMoreNasiya>(_onLoadMore);
    on<ChangeNasiyaFilter>(_onChangeFilter);
    on<PayNasiyaOrder>(_onPayOrder);
  }

  Future<void> _onLoad(LoadNasiya event, Emitter<AdminNasiyaState> emit) async {
    emit(state.copyWith(isLoading: true, error: null, hasReachedMax: false, currentPage: 1));
    try {
      final summaryFuture = repository.getNasiyaSummary();
      final ordersFuture = repository.getOrders(nasiyaStatus: state.filter, page: 1);

      final summary = await summaryFuture;
      final response = await ordersFuture;

      emit(state.copyWith(
        isLoading: false,
        orders: response.orders,
        currentPage: 1,
        hasReachedMax: !response.hasNext,
        activeCount: summary['active_count'] ?? 0,
        overdueCount: summary['overdue_count'] ?? 0,
        paidCount: summary['paid_count'] ?? 0,
      ));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: AdminRepository.parseError(e)));
    }
  }

  Future<void> _onLoadMore(LoadMoreNasiya event, Emitter<AdminNasiyaState> emit) async {
    if (state.hasReachedMax || state.isLoading || state.isFetchingMore) return;
    
    emit(state.copyWith(isFetchingMore: true, error: null));
    try {
      final nextPage = state.currentPage + 1;
      final response = await repository.getOrders(nasiyaStatus: state.filter, page: nextPage);

      emit(state.copyWith(
        isFetchingMore: false,
        orders: List.of(state.orders)..addAll(response.orders),
        currentPage: nextPage,
        hasReachedMax: !response.hasNext,
      ));
    } catch (e) {
      emit(state.copyWith(isFetchingMore: false, error: AdminRepository.parseError(e)));
    }
  }

  Future<void> _onChangeFilter(ChangeNasiyaFilter event, Emitter<AdminNasiyaState> emit) async {
    if (state.filter == event.filter) return;
    emit(state.copyWith(filter: event.filter));
    add(LoadNasiya());
  }

  Future<void> _onPayOrder(PayNasiyaOrder event, Emitter<AdminNasiyaState> emit) async {
    emit(state.copyWith(isPaying: true, payError: null, paySuccess: false));
    try {
      await repository.payCreditOrder(event.orderId);
      emit(state.copyWith(isPaying: false, paySuccess: true));
      add(LoadNasiya()); // Refresh page to recalculate summary and list
    } catch (e) {
      emit(state.copyWith(isPaying: false, payError: AdminRepository.parseError(e)));
    }
  }
}
