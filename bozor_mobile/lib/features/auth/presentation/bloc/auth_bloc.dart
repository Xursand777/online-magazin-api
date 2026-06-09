import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/repositories/auth_repository.dart';
import '../../../../core/auth/auth_token_service.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../admin/presentation/bloc/admin_bloc.dart';

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
  final bool isMaster;
  final bool canUseCredit;
  
  const AuthAuthenticated({
    this.isAdmin = false,
    this.isMaster = false,
    this.canUseCredit = false,
  });
  
  @override
  List<Object?> get props => [isAdmin, isMaster, canUseCredit];
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
      bool isMaster = false;
      bool canUseCredit = false;
      try {
        final profile = await repository.getProfile();
        isMaster = profile['is_master'] == true;
        canUseCredit = profile['can_use_credit'] == true;
      } catch (_) {}
      emit(AuthAuthenticated(
          isAdmin: admin, isMaster: isMaster, canUseCredit: canUseCredit));

      // ⭐ APP RESTART CART SYNC
      // Foydalanuvchi sayt'da yoki boshqa qurilmada cart'iga mahsulot
      // qo'shgan bo'lishi mumkin. App ochilganda fresh server cart fetch
      // qilamiz — local stale bo'lmasin.
      _syncCartSafely();
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
      bool isMaster = false;
      bool canUseCredit = false;
      try {
        final profile = await repository.getProfile();
        isMaster = profile['is_master'] == true;
        canUseCredit = profile['can_use_credit'] == true;
      } catch (_) {}
      emit(AuthAuthenticated(
          isAdmin: isAdmin, isMaster: isMaster, canUseCredit: canUseCredit));

      // ⭐ KROSS-PLATFORM CART SINKRONIZATSIYASI
      //
      // Foydalanuvchi mehmon sifatida cart'ga mahsulot qo'shgan bo'lishi mumkin.
      // Login bo'lgandan keyin uni server'dagi USER cart bilan birlashtirish kerak.
      //
      // Aks holda:
      //   • Mobil mehmon → cart guest_session_id ostida saqlanadi
      //   • Login bo'ldi → JWT yuboriladi, server endi USER cart'iga qaraydi (bo'sh)
      //   • Sayt'da kirsa USER cart bo'sh ko'rinadi (mobile items orphaned)
      //
      // SyncCartWithServer:
      //   • Local items bo'lsa: POST /api/cart/sync-local/ — merge qilinadi
      //   • Local bo'sh bo'lsa: GET /api/cart/ — server USER cart fetch
      //
      // Natija: mobile + sayt bir xil cart ko'rsatadi.
      _syncCartSafely();
    } catch (e) {
      emit(AuthFailure(_toUserMessage(e)));
    }
  }

  /// Cart sync'ni xavfsiz chaqiradi — try-catch ichida (DI muammosi yoki
  /// boshqa xato sessiyaga ta'sir qilmasin).
  void _syncCartSafely() {
    try {
      sl<CartBloc>().add(const SyncCartWithServer());
    } catch (_) {
      // CartBloc DI'da yo'q yoki boshqa xato — login muvaffaqiyatli bo'ldi
    }
  }

  Future<void> _onLogout(
    LogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    // 1. Serverga blacklist signali — refresh token endi yaroqsiz.
    //    Tarmoq xato bo'lsa ham keyingi qadamlar bajariladi (silently catches).
    await repository.logoutOnServer();

    // 2. Barcha sessiyaga oid ma'lumotlarni tozalash (universal helper).
    await _purgeAllSessionData();

    emit(AuthUnauthenticated());
  }

  Future<void> _onForceLogout(
    _ForceLogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    // Tokenlar AuthTokenService tomonidan allaqachon o'chirilgan.
    // Lekin singleton bloklar va Hive boxlari hali ham eski sessiya
    // ma'lumotlariga ega — ularni ham tozalash zarur.
    await _purgeAllSessionData(skipTokens: true);

    emit(AuthUnauthenticated());
  }

  /// Sessiyani tozalashning yagona, ishonarli yo'li.
  ///
  /// ── NIMA TOZALANADI ───────────────────────────────────────────────────────
  ///   1. SecureStorage tokenlar (skipTokens=true bo'lmasa)
  ///   2. CartBloc holati va Hive cart
  ///   3. AdminBloc holati (singleton — yangi sessiya o'qib qolishi mumkin)
  ///   4. Hive savatcha + qidiruv tarixi
  ///
  /// ── NIMA UCHUN BU JUDA MUHIM ──────────────────────────────────────────────
  /// CartBloc va AdminBloc DI'da SINGLETON. Logout dan keyin emas, balki
  /// app o'chirilgunga qadar bitta instance ishlatadi. Agar tozalanmasa:
  ///   • A admin logout → B admin login → B admin A ning ma'lumotlarini ko'radi
  ///   • Cart A foydalanuvchi qo'shgan mahsulotlar B foydalanuvchida chiqadi
  Future<void> _purgeAllSessionData({bool skipTokens = false}) async {
    // Tokenlar
    if (!skipTokens) {
      try {
        await tokenService.clearTokens();
      } catch (_) {/* storage muammosi — UI hamon logout state ga o'tishi shart */}
    }

    // Singleton bloklarni resetlash (try-catch — DI ro'yxatidan o'tmagan bo'lsa)
    try {
      sl<CartBloc>().add(const ResetCart());
    } catch (_) {/* CartBloc DI da yo'q bo'lishi mumkin */}

    try {
      if (sl.isRegistered<AdminBloc>()) {
        sl<AdminBloc>().add(const ResetAdminData());
      }
    } catch (_) {/* AdminBloc DI da yo'q bo'lishi mumkin */}

    // Hive boxlarini majburiy tozalash (CartBloc reset ham bunday qiladi,
    // lekin ikkita qatlam — ishonchlilik uchun).
    try {
      await LocalStorage.clearAllUserData();
    } catch (_) {/* Hive xatosi — kritik emas */}
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
