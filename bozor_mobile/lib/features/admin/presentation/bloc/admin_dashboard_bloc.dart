import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_dashboard_model.dart';
import '../../data/repositories/admin_repository.dart';

// ─── Events ──────────────────────────────────────────────────────────────────
abstract class AdminDashboardEvent extends Equatable {
  const AdminDashboardEvent();
  @override
  List<Object?> get props => [];
}

class LoadDashboard extends AdminDashboardEvent {
  const LoadDashboard();
}

class RefreshDashboard extends AdminDashboardEvent {
  const RefreshDashboard();
}

// ─── State ───────────────────────────────────────────────────────────────────
enum DashboardStatus { initial, loading, success, failure }

class AdminDashboardState extends Equatable {
  final DashboardStatus status;
  final DashboardData? data;
  final String? error;
  final DateTime? updatedAt;

  const AdminDashboardState({
    this.status = DashboardStatus.initial,
    this.data,
    this.error,
    this.updatedAt,
  });

  AdminDashboardState copyWith({
    DashboardStatus? status,
    DashboardData? data,
    String? error,
    DateTime? updatedAt,
  }) {
    return AdminDashboardState(
      status: status ?? this.status,
      data: data ?? this.data,
      error: error,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  List<Object?> get props => [status, data, error, updatedAt];
}

// ─── BLoC ────────────────────────────────────────────────────────────────────
class AdminDashboardBloc extends Bloc<AdminDashboardEvent, AdminDashboardState> {
  final AdminRepository repository;

  AdminDashboardBloc({required this.repository})
      : super(const AdminDashboardState()) {
    on<LoadDashboard>(_onLoad);
    on<RefreshDashboard>(_onLoad);
  }

  Future<void> _onLoad(
    AdminDashboardEvent event,
    Emitter<AdminDashboardState> emit,
  ) async {
    emit(state.copyWith(status: DashboardStatus.loading, error: null));
    try {
      final data = await repository.getDashboard();
      emit(state.copyWith(
        status: DashboardStatus.success,
        data: data,
        updatedAt: DateTime.now(),
      ));
    } catch (e) {
      emit(state.copyWith(
        status: DashboardStatus.failure,
        error: AdminRepository.parseError(e),
      ));
    }
  }
}
