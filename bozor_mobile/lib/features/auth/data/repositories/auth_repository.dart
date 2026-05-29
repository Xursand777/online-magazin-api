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
        return 'Server javob bermadi. Biroz kutib qayta urinib ko\'ring.';
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
