import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_master_model.dart';
import '../../data/repositories/admin_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract class AdminMasterEvent extends Equatable {
  const AdminMasterEvent();
  @override
  List<Object?> get props => [];
}

/// Ustalar ro'yxati va chegirma foizini parallel yuklaydi.
class LoadMasters extends AdminMasterEvent {
  const LoadMasters();
}

/// Foydalanuvchini usta qiladi (telefon raqami bo'yicha).
class AssignMaster extends AdminMasterEvent {
  final String phone;
  const AssignMaster({required this.phone});
  @override
  List<Object?> get props => [phone];
}

/// Ustadan olib tashlaydi.
class RemoveMaster extends AdminMasterEvent {
  final int masterId;
  final String masterPhone;
  const RemoveMaster({required this.masterId, required this.masterPhone});
  @override
  List<Object?> get props => [masterId, masterPhone];
}

/// Chegirma foizini o'zgartiradi.
class UpdateMasterDiscount extends AdminMasterEvent {
  final double percent;
  const UpdateMasterDiscount({required this.percent});
  @override
  List<Object?> get props => [percent];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════════════════════════════

abstract class AdminMasterState extends Equatable {
  const AdminMasterState();
  @override
  List<Object?> get props => [];
}

class MasterInitial extends AdminMasterState {
  const MasterInitial();
}

class MasterLoading extends AdminMasterState {
  const MasterLoading();
}

/// Muvaffaqiyatli yuklangan holat.
class MasterLoaded extends AdminMasterState {
  final List<MasterMember> masters;
  final double discountPercent;

  const MasterLoaded({required this.masters, required this.discountPercent});
  @override
  List<Object?> get props => [masters, discountPercent];
}

class MasterError extends AdminMasterState {
  final String message;
  const MasterError(this.message);
  @override
  List<Object?> get props => [message];
}

/// Action muvaffaqiyatli (qo'shish / olib tashlash / chegirma).
class MasterActionSuccess extends AdminMasterState {
  final List<MasterMember> masters;
  final double discountPercent;
  final String action; // 'assigned' | 'removed' | 'discount_updated'
  final String detail;

  const MasterActionSuccess({
    required this.masters,
    required this.discountPercent,
    required this.action,
    required this.detail,
  });
  @override
  List<Object?> get props => [masters, discountPercent, action, detail];
}

/// Action xato berdi, lekin ro'yxat mavjud.
class MasterActionError extends AdminMasterState {
  final List<MasterMember> masters;
  final double discountPercent;
  final String message;

  const MasterActionError({
    required this.masters,
    required this.discountPercent,
    required this.message,
  });
  @override
  List<Object?> get props => [masters, discountPercent, message];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════════

class AdminMasterBloc extends Bloc<AdminMasterEvent, AdminMasterState> {
  final AdminRepository repository;

  AdminMasterBloc({required this.repository}) : super(const MasterInitial()) {
    on<LoadMasters>(_onLoad);
    on<AssignMaster>(_onAssign);
    on<RemoveMaster>(_onRemove);
    on<UpdateMasterDiscount>(_onUpdateDiscount);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  List<MasterMember> get _currentMasters {
    final s = state;
    if (s is MasterLoaded) return s.masters;
    if (s is MasterActionSuccess) return s.masters;
    if (s is MasterActionError) return s.masters;
    return [];
  }

  double get _currentDiscount {
    final s = state;
    if (s is MasterLoaded) return s.discountPercent;
    if (s is MasterActionSuccess) return s.discountPercent;
    if (s is MasterActionError) return s.discountPercent;
    return 5.0;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  Future<void> _onLoad(LoadMasters event, Emitter<AdminMasterState> emit) async {
    emit(const MasterLoading());
    try {
      // Parallel yuklash — tezroq
      final results = await Future.wait([
        repository.getMasters(),
        repository.getMasterDiscount(),
      ]);
      final masters  = results[0] as List<MasterMember>;
      final discount = results[1] as MasterDiscount;
      emit(MasterLoaded(masters: masters, discountPercent: discount.percent));
    } catch (e) {
      emit(MasterError(AdminRepository.parseError(e)));
    }
  }

  Future<void> _onAssign(AssignMaster event, Emitter<AdminMasterState> emit) async {
    try {
      final result = await repository.assignMaster(phone: event.phone);
      final detail = result['detail'] as String? ?? '${event.phone} usta bo\'ldi';

      // Ro'yxatni qayta yuklaymiz
      final masters = await repository.getMasters();
      emit(MasterActionSuccess(
        masters: masters,
        discountPercent: _currentDiscount,
        action: 'assigned',
        detail: detail,
      ));
    } catch (e) {
      emit(MasterActionError(
        masters: _currentMasters,
        discountPercent: _currentDiscount,
        message: AdminRepository.parseError(e),
      ));
    }
  }

  Future<void> _onRemove(RemoveMaster event, Emitter<AdminMasterState> emit) async {
    try {
      await repository.removeMaster(event.masterId);

      final masters = await repository.getMasters();
      emit(MasterActionSuccess(
        masters: masters,
        discountPercent: _currentDiscount,
        action: 'removed',
        detail: '${event.masterPhone} usta ro\'yxatidan olib tashlandi',
      ));
    } catch (e) {
      emit(MasterActionError(
        masters: _currentMasters,
        discountPercent: _currentDiscount,
        message: AdminRepository.parseError(e),
      ));
    }
  }

  Future<void> _onUpdateDiscount(
      UpdateMasterDiscount event, Emitter<AdminMasterState> emit) async {
    try {
      await repository.setMasterDiscount(event.percent);

      emit(MasterActionSuccess(
        masters: _currentMasters,
        discountPercent: event.percent,
        action: 'discount_updated',
        detail: 'Usta chegirmasi ${event.percent}% ga o\'rnatildi',
      ));
    } catch (e) {
      emit(MasterActionError(
        masters: _currentMasters,
        discountPercent: _currentDiscount,
        message: AdminRepository.parseError(e),
      ));
    }
  }
}
