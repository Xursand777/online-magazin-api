import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/repositories/auth_repository.dart';
import '../../../../core/auth/auth_token_service.dart';

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════

abstract class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

/// App ishga tushganda mavjud tokenlarni tekshiradi.
class AppStartedEvent extends AuthEvent {
  const AppStartedEvent();
}

/// OTP yuborish uchun raqam kiritildi.
class SendOtpEvent extends AuthEvent {
  final String phone;
  const SendOtpEvent(this.phone);
  @override
  List<Object?> get props => [phone];
}

/// OTP kodi kiritildi — tasdiqlash.
class VerifyOtpEvent extends AuthEvent {
  final String phone;
  final String otp;
  const VerifyOtpEvent(this.phone, this.otp);
  @override
  List<Object?> get props => [phone, otp];
}

/// Foydalanuvchi o'zi tizimdan chiqdi.
class LogoutEvent extends AuthEvent {
  const LogoutEvent();
}

/// Refresh token muddati tugadi — majburiy tizimdan chiqarish.
class _ForceLogoutEvent extends AuthEvent {
  const _ForceLogoutEvent();
}

// ═══════════════════════════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════════════════════════

abstract class AuthState extends Equatable {
  const AuthState();
  @override
  List<Object?> get props => [];
}

/// App hozirgina ishga tushdi, token tekshirilmoqda.
class AuthInitial extends AuthState {}

/// OTP yuborish yoki tasdiqlash jarayonida.
class AuthLoading extends AuthState {}

/// ✅ Tizimga kirgan — tokenlar mavjud va yaroqli.
class AuthAuthenticated extends AuthState {
  final bool isAdmin;
  const AuthAuthenticated({this.isAdmin = false});
  @override
  List<Object?> get props => [isAdmin];
}

/// 🔒 Tizimdan chiqqan — login sahifasiga yo'naltirish kerak.
class AuthUnauthenticated extends AuthState {}

/// OTP yuborildi — kod kiritish ekranini ko'rsatish.
class AuthOtpSent extends AuthState {
  final String phone;
  final String? debugCode; // Faqat OTP_DEBUG=True bo'lganda qaytadi
  const AuthOtpSent(this.phone, {this.debugCode});
  @override
  List<Object?> get props => [phone, debugCode];
}

/// Xato xabari.
class AuthFailure extends AuthState {
  final String message;
  const AuthFailure(this.message);
  @override
  List<Object?> get props => [message];
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final AuthRepository   repository;
  final AuthTokenService tokenService;

  StreamSubscription<void>? _forceLogoutSub;

  AuthBloc({
    required this.repository,
    required this.tokenService,
    AuthState? initialState,
  }) : super(initialState ?? AuthInitial()) {
    on<AppStartedEvent>  (_onAppStarted);
    on<SendOtpEvent>     (_onSendOtp);
    on<VerifyOtpEvent>   (_onVerifyOtp);
    on<LogoutEvent>      (_onLogout);
    on<_ForceLogoutEvent>(_onForceLogout);

    // Refresh token muddati tugaganda majburiy tizimdan chiqarish
    _forceLogoutSub = tokenService.onForceLogout.listen(
      (_) => add(const _ForceLogoutEvent()),
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  /// App ishga tushganda SecureStorage'ni tekshiradi.
  /// Tokenlar mavjud bo'lsa — to'g'ridan-to'g'ri home'ga o'tkazadi.
  Future<void> _onAppStarted(
    AppStartedEvent event,
    Emitter<AuthState> emit,
  ) async {
    final hasTokens = await tokenService.hasTokens();
    if (hasTokens) {
      final admin = await tokenService.isAdmin();
      emit(AuthAuthenticated(isAdmin: admin));
    } else {
      emit(AuthUnauthenticated());
    }
  }

  Future<void> _onSendOtp(
    SendOtpEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      final debugCode = await repository.sendOtp(event.phone);
      emit(AuthOtpSent(event.phone, debugCode: debugCode));
    } catch (e) {
      emit(AuthFailure(_toUserMessage(e)));
    }
  }

  Future<void> _onVerifyOtp(
    VerifyOtpEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      final isAdmin = await repository.verifyOtp(event.phone, event.otp);
      emit(AuthAuthenticated(isAdmin: isAdmin));
    } catch (e) {
      emit(AuthFailure(_toUserMessage(e)));
    }
  }

  Future<void> _onLogout(
    LogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    await tokenService.clearTokens();
    emit(AuthUnauthenticated());
  }

  Future<void> _onForceLogout(
    _ForceLogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    // Tokenlar AuthTokenService tomonidan allaqachon o'chirilgan
    emit(AuthUnauthenticated());
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  String _toUserMessage(Object error) =>
      error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '').trim();

  @override
  Future<void> close() {
    _forceLogoutSub?.cancel();
    return super.close();
  }
}
