import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_staff_model.dart';
import '../../data/repositories/admin_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract class AdminStaffEvent extends Equatable {
  const AdminStaffEvent();
  @override
  List<Object?> get props => [];
}

/// Xodimlar ro'yxatini yuklaydi.
class LoadStaff extends AdminStaffEvent {
  const LoadStaff();
}

/// Foydalanuvchiga rol tayinlaydi yoki o'zgartiradi.
class AssignRole extends AdminStaffEvent {
  final String phone;
  final String role; // 'admin' | 'seller' | 'courier' | '' (olib tashlash)

  const AssignRole({required this.phone, required this.role});
  @override
  List<Object?> get props => [phone, role];
}

/// Xodimni ishdan bo'shatadi.
class FireStaff extends AdminStaffEvent {
  final int staffId;
  final String staffPhone; // SnackBar xabari uchun

  const FireStaff({required this.staffId, required this.staffPhone});
  @override
  List<Object?> get props => [staffId, staffPhone];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════════════════════════════

abstract class AdminStaffState extends Equatable {
  const AdminStaffState();
  @override
  List<Object?> get props => [];
}

class StaffInitial extends AdminStaffState {
  const StaffInitial();
}

class StaffLoading extends AdminStaffState {
  const StaffLoading();
}

class StaffLoaded extends AdminStaffState {
  final List<StaffMember> staff;

  const StaffLoaded({required this.staff});
  @override
  List<Object?> get props => [staff];
}

class StaffError extends AdminStaffState {
  final String message;

  const StaffError(this.message);
  @override
  List<Object?> get props => [message];
}

/// Rol tayinlash yoki bo'shatish muvaffaqiyatli — ro'yxat yangilanadi.
/// [action] — SnackBar xabari uchun: 'assigned' | 'fired'.
class StaffActionSuccess extends AdminStaffState {
  final List<StaffMember> staff;
  final String action;
  final String detail;

  const StaffActionSuccess({
    required this.staff,
    required this.action,
    required this.detail,
  });
  @override
  List<Object?> get props => [staff, action, detail];
}

/// Ro'yxat yuklangan, lekin action xato berdi.
class StaffActionError extends AdminStaffState {
  final List<StaffMember> staff;
  final String message;

  const StaffActionError({required this.staff, required this.message});
  @override
  List<Object?> get props => [staff, message];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════════

class AdminStaffBloc extends Bloc<AdminStaffEvent, AdminStaffState> {
  final AdminRepository repository;

  AdminStaffBloc({required this.repository}) : super(const StaffInitial()) {
    on<LoadStaff>(_onLoadStaff);
    on<AssignRole>(_onAssignRole);
    on<FireStaff>(_onFireStaff);
  }

  /// Joriy ro'yxatni oladi (agar state'da bor bo'lsa).
  List<StaffMember> get _currentStaff {
    final s = state;
    if (s is StaffLoaded) return s.staff;
    if (s is StaffActionSuccess) return s.staff;
    if (s is StaffActionError) return s.staff;
    return [];
  }

  Future<void> _onLoadStaff(LoadStaff event, Emitter<AdminStaffState> emit) async {
    emit(const StaffLoading());
    try {
      final staff = await repository.getStaff();
      emit(StaffLoaded(staff: staff));
    } catch (e) {
      emit(StaffError(AdminRepository.parseError(e)));
    }
  }

  Future<void> _onAssignRole(AssignRole event, Emitter<AdminStaffState> emit) async {
    // Ro'yxatni saqlab turgan holda loading ko'rsatmaymiz (UX: tezroq his qiladi)
    try {
      final result = await repository.assignRole(
        phone: event.phone,
        role: event.role,
      );

      // Muvaffaqiyatli — ro'yxatni qayta yuklaymiz (server tomonda o'zgarish bo'ldi)
      final staff = await repository.getStaff();

      final roleLabel = event.role.isEmpty
          ? 'olib tashlandi'
          : StaffRoles.label(result.newRole);
      final detail = '${result.phone} → $roleLabel';

      emit(StaffActionSuccess(
        staff: staff,
        action: 'assigned',
        detail: detail,
      ));
    } catch (e) {
      emit(StaffActionError(
        staff: _currentStaff,
        message: AdminRepository.parseError(e),
      ));
    }
  }

  Future<void> _onFireStaff(FireStaff event, Emitter<AdminStaffState> emit) async {
    try {
      await repository.fireStaff(event.staffId);

      // Muvaffaqiyatli — ro'yxatni qayta yuklaymiz
      final staff = await repository.getStaff();

      emit(StaffActionSuccess(
        staff: staff,
        action: 'fired',
        detail: '${event.staffPhone} ishdan bo\'shatildi',
      ));
    } catch (e) {
      emit(StaffActionError(
        staff: _currentStaff,
        message: AdminRepository.parseError(e),
      ));
    }
  }
}
