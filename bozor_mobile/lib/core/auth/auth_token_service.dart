import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../network/api_constants.dart';

/// Barcha JWT token operatsiyalari uchun markazlashgan xizmat.
///
/// - Tokenlarni saqlash / o'qish / o'chirish (SecureStorage)
/// - Access token muddati tugaganda refresh qilish
/// - Refresh ham muvaffaqiyatsiz bo'lsa force-logout signali yuborish
class AuthTokenService {
  static const _keyAccess   = 'access_token';
  static const _keyRefresh  = 'refresh_token';
  static const _keyIsAdmin  = 'is_admin';

  final FlutterSecureStorage _storage;

  // Force-logout stream: ApiClient yoki TokenService bu stream'ga signal
  // yuborganda AuthBloc foydalanuvchini tizimdan chiqaradi.
  final _forceLogoutCtrl = StreamController<void>.broadcast();
  Stream<void> get onForceLogout => _forceLogoutCtrl.stream;

  // ── Single-flight refresh + session epoch guard ──────────────────────────────
  //
  // _refreshInFlight: bir vaqtning o'zida bir nechta 401 kelganda faqat BITTA
  //   refresh so'rovi yuboriladi. Qolgan chaqiruvchilar shu Future'ni kutadi.
  //   Bu refresh-token ROTATION'da eski tokenni ikki marta ishlatib yuborishning
  //   (double-spend) oldini oladi — aks holda ikkinchi so'rov blacklist'langan
  //   token bilan 401 oladi va xato force-logout'ga olib keladi (Bug 1).
  //
  // _sessionEpoch: har bir login/logout'da oshiriladi. Refresh boshlanganda
  //   epoch "suratga olinadi"; natija qaytganda epoch o'zgargan bo'lsa (ya'ni
  //   logout yoki yangi login bo'lib o'tgan bo'lsa) natija TASHLAB yuboriladi va
  //   storage'ga yozilmaydi. Bu eski sessiyaning tokeni yangi/tozalangan
  //   sessiyani "tiriltirib" yuborishining oldini oladi (Bug 2).
  Future<String?>? _refreshInFlight;
  int _sessionEpoch = 0;

  AuthTokenService({required FlutterSecureStorage storage})
      : _storage = storage;

  // ── Read ───────────────────────────────────────────────────────────────────

  Future<String?> getAccessToken()  => _storage.read(key: _keyAccess);
  Future<String?> getRefreshToken() => _storage.read(key: _keyRefresh);

  Future<bool> hasTokens() async {
    final a = await _storage.read(key: _keyAccess);
    final r = await _storage.read(key: _keyRefresh);
    return a != null && r != null;
  }

  Future<bool> isAdmin() async =>
      await _storage.read(key: _keyIsAdmin) == 'true';

  // ── Write / Delete ─────────────────────────────────────────────────────────

  Future<void> saveTokens({
    required String access,
    required String refresh,
    required bool   isAdmin,
  }) async {
    // Yangi sessiya boshlandi — epoch'ni oshiramiz va davom etayotgan har qanday
    // refresh natijasini bekor qilamiz (boshqa akkauntning tokeni yozilmasin).
    _sessionEpoch++;
    _refreshInFlight = null;
    await Future.wait([
      _storage.write(key: _keyAccess,  value: access),
      _storage.write(key: _keyRefresh, value: refresh),
      _storage.write(key: _keyIsAdmin, value: isAdmin.toString()),
    ]);
  }

  Future<void> clearTokens() async {
    // Sessiya tugadi — epoch'ni oshiramiz va davom etayotgan refresh natijasini
    // bekor qilamiz (logout'dan keyin zombie sessiya tiklanmasin).
    _sessionEpoch++;
    _refreshInFlight = null;
    await Future.wait([
      _storage.delete(key: _keyAccess),
      _storage.delete(key: _keyRefresh),
      _storage.delete(key: _keyIsAdmin),
    ]);
  }

  // ── Token Refresh ──────────────────────────────────────────────────────────

  /// Access token yangilaydi. Bir vaqtning o'zida bir nechta chaqiruv kelsa,
  /// hammasi BITTA refresh so'rovini kutadi (single-flight) — bu refresh-token
  /// rotation'da eski tokenni ikki marta sarflab, xato logout'ga olib kelishning
  /// oldini oladi.
  ///
  /// Muvaffaqiyatli bo'lsa yangi access tokenni qaytaradi.
  /// Refresh token haqiqatan rad etilsa (401/403) force-logout signali yuboradi.
  /// Faqat tarmoq/server xatosi bo'lsa (masalan, Render cold-start) — tokenlarni
  /// SAQLAB qoladi va `null` qaytaradi (sessiya buzilmaydi).
  Future<String?> refreshAccessToken() {
    // Single-flight: allaqachon davom etayotgan refresh bo'lsa, shuni kutamiz.
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;

    final future = _doRefresh();
    _refreshInFlight = future;
    // Tugagach in-flight'ni tozalaymiz (faqat aynan shu future bo'lsa — yangi
    // sessiya allaqachon null qilib qo'ygan bo'lishi mumkin).
    future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    });
    return future;
  }

  Future<String?> _doRefresh() async {
    final startEpoch = _sessionEpoch;

    // ── Refresh token'ni xavfsiz o'qish ──────────────────────────────────────
    // Storage muammosi (PlatformException) bo'lsa — force-logout qilmaymiz,
    // shunchaki null qaytaramiz (sessiya saqlanadi, so'rov muvaffaqiyatsiz bo'ladi).
    String? refreshToken;
    try {
      refreshToken = await getRefreshToken();
    } catch (_) {
      return null;
    }

    if (refreshToken == null) {
      // Token yo'q — agar sessiya hali o'zgarmagan bo'lsa, tizimdan chiqaramiz.
      if (_sessionEpoch == startEpoch) await _triggerForceLogout();
      return null;
    }

    final refreshDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
    ));

    // tokenRejected     — server to'g'ridan-to'g'ri 401/403 qaytardi
    // anyConnectionError — kamida bitta server erishilmadi (tarmoq/timeout xato)
    //
    // Force-logout faqat: tokenRejected=true VA anyConnectionError=false
    //
    // Sababi (debug rejimida ayniqsa muhim):
    //   Lokal server Render tomonidan berilgan tokenni rad etishi mumkin (401).
    //   Biroq Render o'zi uyquda bo'lsa (cold start, 50 sek) va timeout bersa,
    //   "anyConnectionError=true" bo'ladi — sessiya aslida yaroqli, shuning uchun
    //   force-logout qilmaslik kerak. Render uyg'onganda so'rov o'zi muvaffaqiyatli bo'ladi.
    bool tokenRejected      = false;
    bool anyConnectionError = false;

    for (final baseUrl in ApiConstants.localBaseUrls) {
      try {
        final response = await refreshDio.post(
          '$baseUrl${ApiConstants.refresh}',
          data: {'refresh': refreshToken},
          options: Options(headers: {'X-Client-Type': 'mobile'}),
        );

        final newAccess  = response.data['access']  as String?;
        final newRefresh = response.data['refresh'] as String?;

        if (newAccess == null) continue;

        // Sessiya o'zgargan bo'lsa → tashlab yuboramiz (epoch guard — Bug 2 himoyasi).
        if (_sessionEpoch != startEpoch) return null;

        // Yangi tokenlarni saqlash — storage xatosi bo'lsa, in-memory tokenni qaytaramiz.
        try {
          await _storage.write(key: _keyAccess, value: newAccess);
          if (newRefresh != null) {
            await _storage.write(key: _keyRefresh, value: newRefresh);
          }
        } catch (_) {
          // Storage vaqtinchalik muammo — hozirgi sessiyada token ishlaydi
        }
        return newAccess;

      } on DioException catch (e) {
        final code = e.response?.statusCode;
        if (code == 401 || code == 403) {
          tokenRejected = true;       // Server aniq rad etdi
        } else {
          anyConnectionError = true;  // Tarmoq / timeout / server uyquda
        }
        continue;
      }
    }

    if (_sessionEpoch != startEpoch) return null;

    // Force-logout faqat barcha serverlar ANIQ rad etsa va hech birida
    // tarmoq xatosi bo'lmasa. Agar birorta tarmoq xatosi bo'lsa — sessiya saqlanadi.
    if (tokenRejected && !anyConnectionError) {
      await _triggerForceLogout();
    }
    return null;
  }

  Future<void> _triggerForceLogout() async {
    await clearTokens();
    _forceLogoutCtrl.add(null);
  }

  void dispose() => _forceLogoutCtrl.close();
}
