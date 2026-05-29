import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_constants.dart';
import '../auth/auth_token_service.dart';

class ApiClient {
  final Dio                dio;
  final FlutterSecureStorage secureStorage;
  final AuthTokenService   tokenService;

  ApiClient({
    required this.dio,
    required this.secureStorage,
    required this.tokenService,
  }) {
    dio.options.baseUrl        = ApiConstants.baseUrl;
    // Render free tier uxlab qolishi mumkin (50+ soniya) — uzunroq timeout
    dio.options.connectTimeout = const Duration(seconds: 60);
    dio.options.receiveTimeout = const Duration(seconds: 60);

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Barcha so'rovlarga mobile client belgisi
          options.headers['X-Client-Type'] = 'mobile';
          final token = await tokenService.getAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },

        onResponse: (response, handler) {
          // ── Muvaffaqiyatli javob — URL affinity ─────────────────────────
          // Qaysi server muvaffaqiyatli javob bergan bo'lsa, refresh ham
          // o'sha serverga borishini ta'minlaymiz. Bu ROTATE_REFRESH_TOKENS
          // muhitida cross-server token blacklist muammosini hal qiladi.
          final baseUrl = response.requestOptions.baseUrl;
          if (baseUrl.isNotEmpty) {
            tokenService.setSuccessfulBaseUrl(baseUrl);
          }
          return handler.next(response);
        },

        onError: (DioException e, handler) async {
          // ── 1. Local URL → production URL fallback ───────────────────────
          // Faqat tarmoq/ulanish xatosi bo'lsa boshqa URL'larga o'tamiz.
          // Fallback URL 4xx (jumladan 401) qaytarsa, uni 401 oqimi bilan
          // qayta ishlaymiz (eski kodda bu o'tkazib yuborilardi).
          DioException workingError = e;
          try {
            final fallback = await _retryWithUrlFallback(e);
            if (fallback != null) {
              // Fallback muvaffaqiyatli — bu URL'ni affinity sifatida eslaymiz.
              final fallbackBase = fallback.requestOptions.baseUrl;
              if (fallbackBase.isNotEmpty) {
                tokenService.setSuccessfulBaseUrl(fallbackBase);
              }
              return handler.resolve(fallback);
            }
          } on DioException catch (fallbackErr) {
            // Fallback URL HTTP xato qaytardi (badResponse, masalan 401).
            // Buni asosiy xato sifatida olamiz va 401 refresh oqimiga uzatamiz.
            workingError = fallbackErr;
          }

          // ── 2. 401 → token yangilash ──────────────────────────────────────
          if (workingError.response?.statusCode == 401 &&
              workingError.requestOptions.extra['_refreshTried'] != true) {
            final newAccess = await tokenService.refreshAccessToken();
            if (newAccess != null) {
              final opts = workingError.requestOptions.copyWith(
                headers: {
                  ...workingError.requestOptions.headers,
                  'Authorization':  'Bearer $newAccess',
                  'X-Client-Type': 'mobile',
                },
                extra: {
                  ...workingError.requestOptions.extra,
                  '_refreshTried': true,
                },
              );
              try {
                final retried = await dio.fetch(opts);
                return handler.resolve(retried);
              } on DioException catch (retryErr) {
                return handler.next(retryErr);
              }
            }
            // refreshAccessToken ichida forceLogout (kerak bo'lsa) chaqirilgan
            return handler.next(workingError);
          }

          return handler.next(workingError);
        },
      ),
    );
  }

  // ── Local URL fallback ────────────────────────────────────────────────────

  /// Local server ulanmasa, keyingi URL'ga o'tadi.
  /// HTTP xato (badResponse) bo'lsa rethrow — server javob berdi degani.
  Future<Response<dynamic>?> _retryWithUrlFallback(DioException e) async {
    if (!_isConnectionError(e)) return null;
    if (e.requestOptions.extra['_fallbackTried'] == true) return null;

    final attemptedBase = _normalize(e.requestOptions.baseUrl);

    for (final candidate in ApiConstants.localBaseUrls) {
      if (_normalize(candidate) == attemptedBase) continue;

      try {
        return await dio.request<dynamic>(
          _buildUrl(candidate, e.requestOptions.path),
          data:              e.requestOptions.data,
          queryParameters:   e.requestOptions.queryParameters,
          cancelToken:       e.requestOptions.cancelToken,
          onReceiveProgress: e.requestOptions.onReceiveProgress,
          onSendProgress:    e.requestOptions.onSendProgress,
          options: Options(
            method:                    e.requestOptions.method,
            headers: {
              ...Map<String, dynamic>.from(e.requestOptions.headers)
                ..remove('content-length'),
              'X-Client-Type': 'mobile',
            },
            responseType:              e.requestOptions.responseType,
            contentType:               e.requestOptions.contentType,
            followRedirects:           e.requestOptions.followRedirects,
            receiveDataWhenStatusError:e.requestOptions.receiveDataWhenStatusError,
            sendTimeout:               e.requestOptions.sendTimeout,
            receiveTimeout:            e.requestOptions.receiveTimeout,
            extra: {
              ...e.requestOptions.extra,
              '_fallbackTried': true,
            },
          ),
        );
      } on DioException catch (retryErr) {
        if (retryErr.type == DioExceptionType.badResponse) rethrow;
        continue;
      }
    }
    return null;
  }

  bool _isConnectionError(DioException e) =>
      e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout;

  String _normalize(String url) =>
      url.endsWith('/') ? url.substring(0, url.length - 1) : url;

  String _buildUrl(String base, String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final b = _normalize(base);
    final p = path.startsWith('/') ? path : '/$path';
    return '$b$p';
  }
}
