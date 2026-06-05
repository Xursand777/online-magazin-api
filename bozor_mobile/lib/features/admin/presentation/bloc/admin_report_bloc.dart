import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_report_model.dart';
import '../../data/repositories/admin_repository.dart';

abstract class AdminReportEvent {}

class LoadReportData extends AdminReportEvent {}

class LoadMoreReportOrders extends AdminReportEvent {}

class ChangeReportPeriod extends AdminReportEvent {
  final String? dateFrom;
  final String? dateTo;
  final String period; // 'daily', 'monthly', 'yearly'

  ChangeReportPeriod({
    this.dateFrom,
    this.dateTo,
    required this.period,
  });
}

class ChangeReportSubTab extends AdminReportEvent {
  final String subTab; // 'general', 'sales'
  ChangeReportSubTab(this.subTab);
}

class ChangeReportSearch extends AdminReportEvent {
  final String search;
  ChangeReportSearch(this.search);
}

class AdminReportState {
  final bool isLoading;
  final String? error;
  final ReportData? data;

  final String subTab; // 'general', 'sales'
  final String? dateFrom;
  final String? dateTo;
  final String period; // 'daily', 'monthly', 'yearly'
  final String search;

  final List<ReportOrder> orders;
  final bool isFetchingOrders;
  final bool hasReachedMaxOrders;
  final int currentOrdersPage;

  AdminReportState({
    this.isLoading = false,
    this.error,
    this.data,
    this.subTab = 'general',
    this.dateFrom,
    this.dateTo,
    this.period = 'daily',
    this.search = '',
    this.orders = const [],
    this.isFetchingOrders = false,
    this.hasReachedMaxOrders = false,
    this.currentOrdersPage = 1,
  });

  AdminReportState copyWith({
    bool? isLoading,
    String? error,
    ReportData? data,
    String? subTab,
    String? dateFrom,
    String? dateTo,
    String? period,
    String? search,
    List<ReportOrder>? orders,
    bool? isFetchingOrders,
    bool? hasReachedMaxOrders,
    int? currentOrdersPage,
  }) {
    return AdminReportState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      data: data ?? this.data,
      subTab: subTab ?? this.subTab,
      dateFrom: dateFrom ?? this.dateFrom,
      dateTo: dateTo ?? this.dateTo,
      period: period ?? this.period,
      search: search ?? this.search,
      orders: orders ?? this.orders,
      isFetchingOrders: isFetchingOrders ?? this.isFetchingOrders,
      hasReachedMaxOrders: hasReachedMaxOrders ?? this.hasReachedMaxOrders,
      currentOrdersPage: currentOrdersPage ?? this.currentOrdersPage,
    );
  }
}

class AdminReportBloc extends Bloc<AdminReportEvent, AdminReportState> {
  final AdminRepository repository;

  AdminReportBloc({required this.repository}) : super(AdminReportState()) {
    on<LoadReportData>(_onLoad);
    on<ChangeReportPeriod>(_onChangePeriod);
    on<ChangeReportSubTab>(_onChangeSubTab);
    on<ChangeReportSearch>(_onChangeSearch);
    on<LoadMoreReportOrders>(_onLoadMoreOrders);
  }

  Future<void> _onLoad(LoadReportData event, Emitter<AdminReportState> emit) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final response = await repository.getReportData(
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        period: state.period,
      );
      
      final ordersRes = await repository.getReportOrders(
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        page: 1,
      );

      emit(state.copyWith(
        isLoading: false, 
        data: response,
        orders: ordersRes.orders,
        hasReachedMaxOrders: ordersRes.hasReachedMax,
        currentOrdersPage: 1,
      ));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: AdminRepository.parseError(e)));
    }
  }

  Future<void> _onChangePeriod(ChangeReportPeriod event, Emitter<AdminReportState> emit) async {
    emit(state.copyWith(
      dateFrom: event.dateFrom,
      dateTo: event.dateTo,
      period: event.period,
    ));
    add(LoadReportData());
  }

  Future<void> _onChangeSubTab(ChangeReportSubTab event, Emitter<AdminReportState> emit) async {
    emit(state.copyWith(subTab: event.subTab));
  }

  Future<void> _onChangeSearch(ChangeReportSearch event, Emitter<AdminReportState> emit) async {
    emit(state.copyWith(search: event.search));
  }

  Future<void> _onLoadMoreOrders(LoadMoreReportOrders event, Emitter<AdminReportState> emit) async {
    if (state.isFetchingOrders || state.hasReachedMaxOrders) return;
    emit(state.copyWith(isFetchingOrders: true));
    try {
      final nextPage = state.currentOrdersPage + 1;
      final response = await repository.getReportOrders(
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        page: nextPage,
      );
      emit(state.copyWith(
        isFetchingOrders: false,
        orders: [...state.orders, ...response.orders],
        hasReachedMaxOrders: response.hasReachedMax,
        currentOrdersPage: nextPage,
      ));
    } catch (e) {
      emit(state.copyWith(isFetchingOrders: false));
    }
  }
}
