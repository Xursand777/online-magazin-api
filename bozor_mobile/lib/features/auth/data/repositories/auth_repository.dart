import 'package:dio/dio.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/auth/auth_token_service.dart';

class AuthRepository {
  final ApiClient        apiClient;
  final AuthTokenService tokenService;

  AuthRepository({required this.apiClient, required this.tokenService});

  /// OTP yuboradi. Debug rejimda `debug_code` qaytaradi (ekranda ko'rinadi).
  Future<String?> sendOtp(String phone) async {
    try {
      final response = await apiClient.dio.post(
        ApiConstants.login,
        data: {'phone': '+998$phone'},
      );
      return _extractDebugCode(response.data);
    } on DioException catch (e) {
      throw Exception(_messageFromError(e,
          fallback: 'OTP yuborib bo\'lmadi. Internet aloqasini tekshiring.'));
    }
  }

  /// OTP kodni tekshiradi, tokenlarni SecureStorage'ga saqlaydi.
  /// Admin bo'lsa `true` qaytaradi.
  Future<bool> verifyOtp(String phone, String otp) async {
    try {
      final response = await apiClient.dio.post(
        ApiConstants.verifyOtp,
        data: {'phone': '+998$phone', 'code': otp},
      );

      final access   = response.data['access']  as String?;
      final refresh  = response.data['refresh'] as String?;
      final user     = response.data['user'];
      final isAdmin  = (user is Map && user['is_admin'] == true);

      if (access == null || refresh == null) {
        throw Exception('Invalid tokens received');
      }

      // Tokenlarni AuthTokenService orqali xavfsiz saqlaymiz
      await tokenService.saveTokens(
        access:  access,
        refresh: refresh,
        isAdmin: isAdmin,
      );

      return isAdmin;
    } on DioException catch (e) {
      throw Exception(_messageFromError(e,
          fallback: 'Tasdiqlashda xatolik. Qaytadan urinib ko\'ring.'));
    }
  }

  /// Ro'yxatdan o'tkazish
  Future<void> register({
    required String phone,
    required String password,
    required String confirmPassword,
    required bool termsAccepted,
  }) async {
    try {
      await apiClient.dio.post(
        ApiConstants.register,
        data: {
          'phone': '+998$phone',
          'password': password,
          'confirm_password': confirmPassword,
          'terms_accepted': termsAccepted,
        },
      );
    } on DioException catch (e) {
      throw Exception(_messageFromError(e,
          fallback: 'Ro\'yxatdan o\'tishda xatolik yuz berdi.'));
    }
  }

  Future<Map<String, dynamic>> getProfile() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.profile);
      return response.data as Map<String, dynamic>;
    } catch (e) {
      return {};
    }
  }

  /// Serverga logout signalini yuboradi — refresh tokenni blacklist'ga qo'shadi.
  ///
  /// ── XAVFSIZLIK KRITIK ─────────────────────────────────────────────────────
  /// Bu metodsiz refresh token serverda yaroqli qoladi (7 kun!). Agar
  /// telefon o'g'irlansa yoki token sizib chiqsa — hujumchi foydalanuvchi
  /// "logout" qilgan bo'lsa ham qayta kira oladi.
  ///
  /// Serverga POST /api/auth/logout/ yuboriladi, body: `{'refresh': 'TOKEN'}`.
  /// Server `token.blacklist()` qiladi → keyingi refresh urinishlari 401.
  ///
  /// Tarmoq xatosi yoki server javob bermasa — silently ignore qilamiz,
  /// chunki lokal tokenlar baribir tozalanadi (clearTokens). User experience
  /// uchun logout har doim "muvaffaqiyatli" bo'lishi kerak.
  Future<void> logoutOnServer() async {
    try {
      final refresh = await tokenService.getRefreshToken();
      if (refresh == null || refresh.isEmpty) return;

      await apiClient.dio.post(
        '/api/auth/logout/',
        data: {'refresh': refresh},
        options: Options(
          // Logout xatolarini interceptor 401-refresh oqimiga aralashtirmasin
          extra: {'_refreshTried': true},
          // Tarmoq sekin bo'lsa kutib o'tirmaymiz — UX muhim
          sendTimeout:    const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );
    } catch (_) {
      // Tarmoq xatosi yoki 401 — muhim emas. Lokal tozalash baribir bo'ladi.
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String? _extractDebugCode(dynamic data) {
    if (data is! Map<String, dynamic>) return null;
    final code = data['debug_code'];
    if (code is String && code.isNotEmpty) return code;
    final message = data['message'];
    if (message is String) {
      return RegExp(r'\b(\d{4,6})\b').firstMatch(message)?.group(1);
    }
    return null;
  }

  String _messageFromError(DioException e, {required String fallback}) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return "Server javob bermadi (60 soniya). Server uyqudan uyg'onmoqda — "
            "iltimos, 30 soniya kutib qayta urinib ko'ring.";
      case DioExceptionType.connectionError:
        return 'Serverga ulanib bo\'lmadi. Internet aloqasini tekshiring.';
      default:
        break;
    }
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      final detail = data['detail'] ?? data['error'];
      if (detail is String && detail.isNotEmpty) return detail;
      final messages = data.entries
          .map((entry) {
            final v = entry.value;
            if (v is List && v.isNotEmpty) return '${entry.key}: ${v.join(', ')}';
            if (v is String && v.isNotEmpty) return '${entry.key}: $v';
            return null;
          })
          .whereType<String>()
          .join('\n');
      if (messages.isNotEmpty) return messages;
    }
    return e.message ?? fallback;
  }
}
