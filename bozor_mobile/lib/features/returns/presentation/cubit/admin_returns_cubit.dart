// Phase 3.6: Admin Qaytarishlar sahifasi uchun Cubit.
// Web ReturnsTab.tsx funksiyalarining mobil ekvivalenti.

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../data/models/order_return_model.dart';
import '../../data/repositories/returns_repository.dart';

class AdminReturnsState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<OrderReturn> items;
  final int totalCount;
  final String statusFilter;
  final bool activeOnly;
  final ReturnsStats? stats;

  const AdminReturnsState({
    this.isLoading = false,
    this.error,
    this.items = const [],
    this.totalCount = 0,
    this.statusFilter = '',
    this.activeOnly = true,
    this.stats,
  });

  AdminReturnsState copyWith({
    bool? isLoading,
    String? error,
    List<OrderReturn>? items,
    int? totalCount,
    String? statusFilter,
    bool? activeOnly,
    ReturnsStats? stats,
    bool clearError = false,
  }) =>
      AdminReturnsState(
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : (error ?? this.error),
        items: items ?? this.items,
        totalCount: totalCount ?? this.totalCount,
        statusFilter: statusFilter ?? this.statusFilter,
        activeOnly: activeOnly ?? this.activeOnly,
        stats: stats ?? this.stats,
      );

  @override
  List<Object?> get props =>
      [isLoading, error, items, totalCount, statusFilter, activeOnly, stats];
}

class AdminReturnsCubit extends Cubit<AdminReturnsState> {
  final ReturnsRepository repo;
  AdminReturnsCubit(this.repo) : super(const AdminReturnsState());

  Future<void> load() async {
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final page = await repo.adminList(
        status: state.statusFilter,
        activeOnly: state.activeOnly,
      );
      ReturnsStats? stats;
      try {
        stats = await repo.adminStats();
      } catch (_) {/* stats opsional */}
      emit(state.copyWith(
        isLoading: false,
        items: page.items,
        totalCount: page.count,
        stats: stats,
      ));
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        error: e.toString(),
      ));
    }
  }

  void setStatusFilter(String s) {
    emit(state.copyWith(statusFilter: s));
    load();
  }

  void setActiveOnly(bool v) {
    emit(state.copyWith(activeOnly: v));
    load();
  }
}
