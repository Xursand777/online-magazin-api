import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/repositories/auth_repository.dart';
import '../../../../core/auth/auth_token_service.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/storage/local_storage.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../admin/presentation/bloc/admin_bloc.dart';
import '../../../profile/presentation/cubit/favorites_cubit.dart';

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

class RegisterEvent extends AuthEvent {
  final String phone;
  final String password;
  final String confirmPassword;
  final bool termsAccepted;

  const RegisterEvent({
    required this.phone,
    required this.password,
    required this.confirmPassword,
    required this.termsAccepted,
  });

  @override
  List<Object?> get props => [phone, password, confirmPassword, termsAccepted];
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
    on<RegisterEvent>    (_onRegister);
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

      // ⭐ APP RESTART SINKRONIZATSIYA (Cart + Favorites)
      // Foydalanuvchi sayt'da yoki boshqa qurilmada cart yoki sevimlilarga
      // mahsulot qo'shgan bo'lishi mumkin. App ochilganda fresh server
      // ma'lumoti fetch qilamiz — local stale bo'lmasin.
      _syncCartSafely();
      _syncFavoritesSafely();
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

  Future<void> _onRegister(
    RegisterEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      await repository.register(
        phone: event.phone,
        password: event.password,
        confirmPassword: event.confirmPassword,
        termsAccepted: event.termsAccepted,
      );
      // Ro'yxatdan o'tgandan so'ng, OTP kodini so'raymiz (tizimga kirish uchun)
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

      // ⭐ KROSS-PLATFORM SINKRONIZATSIYA (Cart + Favorites)
      //
      // Foydalanuvchi mehmon sifatida cart va sevimliga mahsulot qo'shgan
      // bo'lishi mumkin. Login bo'lgandan keyin ularni server bilan
      // birlashtirish KRITIK — aks holda ma'lumotlar yetim qoladi va sayt'da
      // ko'rinmaydi.
      //
      // 1. Cart sync (mavjud edi):
      //    POST /api/cart/sync-local/ — guest items'ni user_cart'ga merge
      //
      // 2. Favorites sync (YANGI):
      //    POST /api/products/favorites/sync/ — guest favorites'ni
      //    user_favorites'ga merge (idempotent — duplicatesiz)
      //
      // Natija: mobile va sayt 100% sinxron — cart va sevimlilar bir xil.
      _syncCartSafely();
      _syncFavoritesSafely();
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

  /// Favorites sync'ni xavfsiz chaqiradi.
  ///
  /// Cart bilan bir xil pattern: mehmon sifatida sevimliga qo'shilgan
  /// mahsulotlar login bo'lgandan keyin server bilan birlashtiriladi.
  /// Backend `POST /api/products/favorites/sync/` allaqachon idempotent — bir xil
  /// mahsulot 2 marta yuborilsa ham xatosiz ishlaydi.
  ///
  /// Stsenariy:
  ///   • Mehmon ❤️ bosib 5 ta mahsulot saqladi (lokal Hive)
  ///   • Login bo'ldi → bu metod chaqiriladi
  ///   • Server: user_favorites += guest_favorites (deduplicate)
  ///   • Lokal: server fresh ro'yxat bilan yangilanadi
  ///   • Sayt'da kirsa: AYNI sevimlilar ro'yxati
  void _syncFavoritesSafely() {
    try {
      sl<FavoritesCubit>().syncFavoritesWithServer();
    } catch (_) {
      // FavoritesCubit DI'da yo'q — login muvaffaqiyatli bo'ldi
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
