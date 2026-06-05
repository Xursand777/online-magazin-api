import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/repositories/admin_repository.dart';
import '../../data/models/admin_kassa_model.dart';

abstract class AdminKassaEvent {}

class LoadKassaData extends AdminKassaEvent {}

class WithdrawKassaEvent extends AdminKassaEvent {
  final double amount;
  final String reason;

  WithdrawKassaEvent({required this.amount, required this.reason});
}

class AdminKassaState {
  final bool isLoading;
  final String? error;
  final AdminKassaModel? data;
  final bool isWithdrawing;
  final String? withdrawError;
  final bool withdrawSuccess;

  AdminKassaState({
    this.isLoading = false,
    this.error,
    this.data,
    this.isWithdrawing = false,
    this.withdrawError,
    this.withdrawSuccess = false,
  });

  AdminKassaState copyWith({
    bool? isLoading,
    String? error,
    AdminKassaModel? data,
    bool? isWithdrawing,
    String? withdrawError,
    bool? withdrawSuccess,
  }) {
    return AdminKassaState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
      data: data ?? this.data,
      isWithdrawing: isWithdrawing ?? this.isWithdrawing,
      withdrawError: withdrawError,
      withdrawSuccess: withdrawSuccess ?? this.withdrawSuccess,
    );
  }
}

class AdminKassaBloc extends Bloc<AdminKassaEvent, AdminKassaState> {
  final AdminRepository repository;

  AdminKassaBloc({required this.repository}) : super(AdminKassaState()) {
    on<LoadKassaData>(_onLoadKassaData);
    on<WithdrawKassaEvent>(_onWithdrawKassa);
  }

  Future<void> _onLoadKassaData(LoadKassaData event, Emitter<AdminKassaState> emit) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final data = await repository.getKassaData();
      emit(state.copyWith(isLoading: false, data: data));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: AdminRepository.parseError(e)));
    }
  }

  Future<void> _onWithdrawKassa(WithdrawKassaEvent event, Emitter<AdminKassaState> emit) async {
    emit(state.copyWith(isWithdrawing: true, withdrawError: null, withdrawSuccess: false));
    try {
      await repository.withdrawKassa(event.amount, event.reason);
      emit(state.copyWith(isWithdrawing: false, withdrawSuccess: true));
      add(LoadKassaData()); // Refresh data after successful withdrawal
    } catch (e) {
      emit(state.copyWith(isWithdrawing: false, withdrawError: AdminRepository.parseError(e)));
    }
  }
}
