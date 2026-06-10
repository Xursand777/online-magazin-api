import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/models/credit_status_model.dart';
import '../../data/models/master_status_model.dart';
import '../../data/repositories/master_credit_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE — to'liq usta + kredit holati
// ═══════════════════════════════════════════════════════════════════════════════

class MasterCreditState extends Equatable {
  final MasterStatusModel master;
  final CreditStatusModel credit;
  final bool isLoading;
  final String? errorMessage;
  final DateTime? lastFetchedAt;

  const MasterCreditState({
    this.master = MasterStatusModel.empty,
    this.credit = CreditStatusModel.empty,
    this.isLoading = false,
    this.errorMessage,
    this.lastFetchedAt,
  });

  /// UI ko'rsatish sharti — backend autoritative:
  /// Backend `is_master=true` qaytarsa, kartalar ko'rinadi.
  /// AuthBloc tomondagi gating qo'shimcha (UX optimizatsiyasi).
  bool get shouldShowCards => master.isMaster;

  /// Ma'lumot eski bo'lib qolganmi (5 daqiqadan ko'p)?
  /// Foydalanuvchi Profile'ga qaytib kelsa, qayta yuklash uchun.
  bool get isStale {
    if (lastFetchedAt == null) return true;
    return DateTime.now().difference(lastFetchedAt!) >
        const Duration(minutes: 5);
  }

  MasterCreditState copyWith({
    MasterStatusModel? master,
    CreditStatusModel? credit,
    bool? isLoading,
    String? errorMessage,
    DateTime? lastFetchedAt,
    bool clearError = false,
  }) {
    return MasterCreditState(
      master: master ?? this.master,
      credit: credit ?? this.credit,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      lastFetchedAt: lastFetchedAt ?? this.lastFetchedAt,
    );
  }

  @override
  List<Object?> get props =>
      [master, credit, isLoading, errorMessage, lastFetchedAt];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUBIT
// ═══════════════════════════════════════════════════════════════════════════════

class MasterCreditCubit extends Cubit<MasterCreditState> {
  final MasterCreditRepository repository;

  MasterCreditCubit({required this.repository})
      : super(const MasterCreditState());

  /// Ikkala statusni parallel yuklash.
  ///
  /// `force=true` bilan kesh tekshirilmaydi — pull-to-refresh uchun.
  Future<void> loadStatuses({bool force = false}) async {
    // Agar fresh ma'lumot bor va force emas — qayta yuklamaymiz
    if (!force && !state.isStale && state.lastFetchedAt != null) {
      return;
    }

    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final (masterStatus, creditStatus) = await repository.fetchBoth();
      emit(state.copyWith(
        master: masterStatus,
        credit: creditStatus,
        isLoading: false,
        lastFetchedAt: DateTime.now(),
      ));
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        errorMessage: repository.parseError(e),
      ));
    }
  }

  /// Faqat credit status'ni qayta yuklash (kredit to'langandan keyin).
  Future<void> refreshCreditOnly() async {
    try {
      final fresh = await repository.fetchCreditStatus();
      emit(state.copyWith(credit: fresh, lastFetchedAt: DateTime.now()));
    } catch (_) {
      // Sukut bilan — eski credit qoladi
    }
  }
}
