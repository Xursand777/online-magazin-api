import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint, kDebugMode;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../network/api_constants.dart';

// Diagnostic logging — faqat debug rejimida ko'rsatiladi.
// Production'da nol qiymatga aylanadi, performance ga ta'sir qilmaydi.
void _authLog(String message) {
  if (kDebugMode) debugPrint('[AUTH] $message');
}

/// Storage operatsiyalarini ketma-ket bajarish uchun oddiy lock.
/// Logout va refresh-writeback yonma-yon ishlaganda race condition'lar
/// (token rezurreksiya, qisman yozilish) oldini oladi.
class _SerialLock {
  Future<void> _last = Future.value();

  Future<T> run<T>(Future<T> Function() body) async {
    final completer = Completer<void>();
    final prev = _last;
    _last = completer.future;
    try {
      await prev;
      return await body();
    } finally {
      completer.complete();
    }
  }
}

/// Barcha JWT token operatsiyalari uchun markazlashgan xizmat.
///
/// 🔑 Kalit printsiplar:
///   1. **Single-flight refresh** — parallel 401'lar bitta refresh kutadi.
///   2. **Session epoch guard** — login/logout'dan keyin eski refresh natijasi tashlanadi.
///   3. **Serial storage lock** — saveTokens / clearTokens / refresh-writeback hech qachon
///      yonma-yon ishlamaydi. Bu race condition (logout vaqtida token rezurreksiya)
///      muammosini to'liq bartaraf qiladi.
///   4. **Successful-URL affinity** — muvaffaqiyatli URL eslanadi va keyingi refresh'lar
///      avval o'sha serverga boradi (rotate token + cross-server blacklist muammosi hal).
///   5. **All-or-nothing writeback** — access va refresh tokenlar birgalikda yoziladi.
///      Birortasi muvaffaqiyatsiz bo'lsa, ikkinchisi ham o'chiriladi (yarim holat yo'q).
///   6. **Graceful degradation** — tarmoq xatosi bo'lsa sessiya SAQLANADI; faqat
///      server ANIQ 401/403 bersa va hech qanday ulanish xatosi bo'lmasa logout chaqiriladi.
class AuthTokenService {
  static const _keyAccess  = 'access_token';
  static const _keyRefresh = 'refresh_token';
  static const _keyIsAdmin = 'is_admin';
  // Xodim roli: 'admin' | 'seller' | 'courier' | null (oddiy foydalanuvchi).
  // isSuper: super-admin (is_admin == true && role bo'sh).
  // Bular drawer/tablarni rolega qarab filtrlash uchun saqlanadi (offline baseline).
  static const _keyRole    = 'staff_role';
  static const _keySuper   = 'is_super';

  final FlutterSecureStorage _storage;

  // Force-logout stream: ApiClient yoki TokenService bu stream'ga signal
  // yuborganda AuthBloc foydalanuvchini tizimdan chiqaradi.
  final _forceLogoutCtrl = StreamController<void>.broadcast();
  Stream<void> get onForceLogout => _forceLogoutCtrl.stream;

  // ── Single-flight refresh + session epoch guard ──────────────────────────
  //
  // _refreshInFlight: bir vaqtning o'zida bir nechta 401 kelganda faqat BITTA
  //   refresh so'rovi yuboriladi. Qolgan chaqiruvchilar shu Future'ni kutadi.
  //   Bu refresh-token ROTATION'da eski tokenni ikki marta ishlatib yuborishning
  //   (double-spend) oldini oladi — aks holda ikkinchi so'rov blacklist'langan
  //   token bilan 401 oladi va xato force-logout'ga olib keladi.
  //
  // _sessionEpoch: har bir login/logout'da oshiriladi. Refresh boshlanganda
  //   epoch "suratga olinadi"; natija qaytganda epoch o'zgargan bo'lsa (ya'ni
  //   logout yoki yangi login bo'lib o'tgan bo'lsa) natija TASHLAB yuboriladi va
  //   storage'ga yozilmaydi. Bu eski sessiyaning tokeni yangi/tozalangan
  //   sessiyani "tiriltirib" yuborishining oldini oladi.
  Future<String?>? _refreshInFlight;
  int _sessionEpoch = 0;

  // Barcha storage yozish/o'chirishlarni ketma-ket qiladi (race condition'larni oldini olish).
  final _storageLock = _SerialLock();

  // ── Successful URL affinity ─────────────────────────────────────────────
  //
  // Agar biron URL muvaffaqiyatli refresh qilsa, keyingi urinishlarda AVVAL
  // o'sha URL sinab ko'riladi. Bu ROTATE_REFRESH_TOKENS=True muhitida muhim:
  //   - Birinchi URL muvaffaqiyatli bo'lsa, eski token blacklist'ga tushadi.
  //   - Agar keyingi refresh boshqa URL'dan ketsa, o'sha server eski (blacklisted)
  //     tokenni ko'radi va 401 qaytaradi → noto'g'ri force-logout!
  //   - Affinity bu muammoni hal qiladi: doim bitta serverga yopishib qoladi.
  String? _lastSuccessfulBaseUrl;

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

  /// Xodim roli ('admin' | 'seller' | 'courier') yoki null.
  Future<String?> getRole() async {
    final r = await _storage.read(key: _keyRole);
    return (r == null || r.isEmpty) ? null : r;
  }

  /// Super-admin (role'siz is_admin) — barcha tablar.
  Future<bool> isSuper() async =>
      await _storage.read(key: _keySuper) == 'true';

  // ── Write / Delete ─────────────────────────────────────────────────────────

  Future<void> saveTokens({
    required String access,
    required String refresh,
    required bool   isAdmin,
  }) async {
    // Lock ichida — refresh-writeback bir vaqtda ishlamaydi.
    await _storageLock.run(() async {
      _sessionEpoch++;
      _refreshInFlight = null;
      await Future.wait([
        _storage.write(key: _keyAccess,  value: access),
        _storage.write(key: _keyRefresh, value: refresh),
        _storage.write(key: _keyIsAdmin, value: isAdmin.toString()),
      ]);
    });
  }

  /// Xodim roli + super flag'ni saqlaydi (tokenlardan alohida, login/profile'dan).
  /// role == null/'' bo'lsa kalit o'chiriladi (oddiy foydalanuvchi).
  Future<void> saveRoleInfo({String? role, required bool isSuper}) async {
    await _storageLock.run(() async {
      if (role == null || role.isEmpty) {
        await _storage.delete(key: _keyRole);
      } else {
        await _storage.write(key: _keyRole, value: role);
      }
      await _storage.write(key: _keySuper, value: isSuper.toString());
    });
  }

  Future<void> clearTokens() async {
    // Lock ichida — refresh-writeback bir vaqtda ishlamaydi.
    // Bu logout vaqtida token rezurreksiya (zombie session) muammosini oldini oladi.
    await _storageLock.run(() async {
      _sessionEpoch++;
      _refreshInFlight = null;
      _lastSuccessfulBaseUrl = null;
      // Future.wait ichida birortasi xato bersa boshqalari ham bekor bo'ladi —
      // har birini alohida try ichida qilamiz, mustahkamlik uchun.
      Future<void> safeDelete(String key) async {
        try { await _storage.delete(key: key); } catch (_) {}
      }
      await Future.wait([
        safeDelete(_keyAccess),
        safeDelete(_keyRefresh),
        safeDelete(_keyIsAdmin),
        safeDelete(_keyRole),
        safeDelete(_keySuper),
      ]);
    });
  }

  /// Muvaffaqiyatli API ulanishdan so'ng tashqaridan chaqiriladigan yordamchi.
  /// ApiClient birinchi muvaffaqiyatli so'rovdan keyin chaqiradi —
  /// shunda refresh ham xuddi shu serverga boradi.
  void setSuccessfulBaseUrl(String url) {
    _lastSuccessfulBaseUrl = url;
  }

  // ── Token Refresh ──────────────────────────────────────────────────────────

  /// Access token yangilaydi. Bir vaqtning o'zida bir nechta chaqiruv kelsa,
  /// hammasi BITTA refresh so'rovini kutadi (single-flight).
  ///
  /// Muvaffaqiyatli bo'lsa yangi access tokenni qaytaradi.
  /// Refresh token haqiqatan rad etilsa (401/403) force-logout signali yuboradi.
  /// Faqat tarmoq/server xatosi bo'lsa — tokenlarni SAQLAB qoladi va `null`
  /// qaytaradi (sessiya buzilmaydi).
  Future<String?> refreshAccessToken() {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;

    final future = _doRefresh();
    _refreshInFlight = future;
    future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    });
    return future;
  }

  Future<String?> _doRefresh() async {
    final startEpoch = _sessionEpoch;

    // ── Refresh token'ni xavfsiz o'qish ──────────────────────────────────────
    String? refreshToken;
    try {
      refreshToken = await getRefreshToken();
    } catch (_) {
      return null;
    }

    if (refreshToken == null) {
      _authLog('refresh: token storage da yo\'q (epoch=$startEpoch) — force-logout');
      if (_sessionEpoch == startEpoch) await _triggerForceLogout();
      return null;
    }

    _authLog('refresh boshlandi: epoch=$startEpoch, urls=${ApiConstants.localBaseUrls.length}');

    final refreshDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
    ));

    // ── URL tartibini tuzish ─────────────────────────────────────────────────
    // Agar avval muvaffaqiyatli bo'lgan URL bo'lsa, uni birinchi qilib qo'yamiz.
    // Bu ROTATE_REFRESH_TOKENS muhitida muhim — token birinchi serverda blacklist
    // bo'lsa, boshqa serverda ishlamaydi. Shuning uchun doim bitta serverga
    // yopishib qolish kerak.
    final urls = _buildOrderedUrls();

    bool tokenRejected      = false;
    bool anyConnectionError = false;

    for (final baseUrl in urls) {
      try {
        final response = await refreshDio.post(
          '$baseUrl${ApiConstants.refresh}',
          data: {'refresh': refreshToken},
          options: Options(headers: {'X-Client-Type': 'mobile'}),
        );

        final newAccess  = response.data['access']  as String?;
        final newRefresh = response.data['refresh'] as String?;

        if (newAccess == null) continue;

        // Sessiya o'zgargan bo'lsa → tashlab yuboramiz (epoch guard).
        if (_sessionEpoch != startEpoch) return null;

        // Muvaffaqiyatli URL'ni eslab qolamiz.
        _lastSuccessfulBaseUrl = baseUrl;

        // ── KRITIK: All-or-nothing writeback lock ichida ──────────────────
        // Lock saveTokens/clearTokens bilan poyga bo'lmasligini ta'minlaydi.
        // Epoch lock ichida QAYTA tekshiriladi — kutib turishda logout sodir
        // bo'lgan bo'lsa, hech narsa yozmaymiz.
        // Birortasi xato bersa, har ikkalasini ham o'chiramiz (yarim holat yo'q).
        final wrote = await _storageLock.run<bool>(() async {
          if (_sessionEpoch != startEpoch) return false;
          try {
            await _storage.write(key: _keyAccess, value: newAccess);
            if (newRefresh != null) {
              await _storage.write(key: _keyRefresh, value: newRefresh);
            }
            return true;
          } catch (_) {
            // Yarim holatdan tozalash
            try { await _storage.delete(key: _keyAccess); } catch (_) {}
            try { await _storage.delete(key: _keyRefresh); } catch (_) {}
            return false;
          }
        });

        if (!wrote) return null;
        return newAccess;

      } on DioException catch (e) {
        final code = e.response?.statusCode;
        if (code == 401 || code == 403) {
          tokenRejected = true;
          _authLog('refresh: $baseUrl → REJECTED (HTTP $code)');
        } else {
          anyConnectionError = true;
          _authLog('refresh: $baseUrl → connection error (${e.type})');
        }
        continue;
      }
    }

    if (_sessionEpoch != startEpoch) {
      _authLog('refresh: epoch o\'zgardi — tashlandi');
      return null;
    }

    // Force-logout faqat:
    //   1. Kamida bitta server token'ni ANIQ rad etdi (401/403).
    //   2. HECH BIRIDA tarmoq/ulanish xatosi bo'lmadi.
    if (tokenRejected && !anyConnectionError) {
      _authLog('refresh: barcha serverlar rad etdi (anyConnectionError=false) → FORCE-LOGOUT');
      await _triggerForceLogout();
    } else {
      _authLog('refresh: muvaffaqiyatsiz, lekin force-logout YO\'Q '
          '(tokenRejected=$tokenRejected, anyConnectionError=$anyConnectionError)');
    }
    return null;
  }

  /// URL ro'yxatini tartiblaydi: avval _lastSuccessfulBaseUrl (agar bor bo'lsa),
  /// keyin qolganlar. Takrorlanish bo'lmaydi.
  List<String> _buildOrderedUrls() {
    final all = List<String>.from(ApiConstants.localBaseUrls);
    final preferred = _lastSuccessfulBaseUrl;
    if (preferred != null && all.contains(preferred)) {
      all.remove(preferred);
      all.insert(0, preferred);
    }
    return all;
  }

  Future<void> _triggerForceLogout() async {
    _authLog('⚠️ FORCE-LOGOUT chaqirildi');
    await clearTokens();
    _forceLogoutCtrl.add(null);
  }

  void dispose() => _forceLogoutCtrl.close();
}
