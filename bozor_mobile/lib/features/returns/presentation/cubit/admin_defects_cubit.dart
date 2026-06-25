// Admin Defektlar sahifasi uchun Cubit.
// Web DefectsTab.tsx funksiyalarining mobil ekvivalenti.

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../data/models/defect_model.dart';
import '../../data/repositories/returns_repository.dart';

class AdminDefectsState extends Equatable {
  final bool isLoading;
  final String? error;
  final List<DefectItem> items;
  final DefectStats? stats;
  final String conditionFilter; // '' = hammasi

  const AdminDefectsState({
    this.isLoading = false,
    this.error,
    this.items = const [],
    this.stats,
    this.conditionFilter = '',
  });

  AdminDefectsState copyWith({
    bool? isLoading,
    String? error,
    List<DefectItem>? items,
    DefectStats? stats,
    String? conditionFilter,
    bool clearError = false,
  }) =>
      AdminDefectsState(
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : (error ?? this.error),
        items: items ?? this.items,
        stats: stats ?? this.stats,
        conditionFilter: conditionFilter ?? this.conditionFilter,
      );

  @override
  List<Object?> get props => [isLoading, error, items, stats, conditionFilter];
}

class AdminDefectsCubit extends Cubit<AdminDefectsState> {
  final ReturnsRepository repo;
  AdminDefectsCubit(this.repo) : super(const AdminDefectsState());

  Future<void> load() async {
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final items = await repo.adminDefects(condition: state.conditionFilter);
      DefectStats? stats;
      try {
        stats = await repo.adminDefectStats();
      } catch (_) {/* stats opsional */}
      emit(state.copyWith(isLoading: false, items: items, stats: stats));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  void setConditionFilter(String c) {
    emit(state.copyWith(conditionFilter: c));
    load();
  }
}
