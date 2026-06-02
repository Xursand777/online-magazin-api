import 'package:dio/dio.dart';
import 'api_constants.dart';

/// Server'dan kelgan mobil ilova sozlamasi (Phase 1.2).
class AppConfig {
  final String platform;
  final String minVersion;
  final String latestVersion;
  final String storeUrl;
  final Map<String, String> forceUpdateMessages;
  final bool maintenanceMode;
  final Map<String, String>? maintenanceMessages;

  const AppConfig({
    required this.platform,
    required this.minVersion,
    required this.latestVersion,
    required this.storeUrl,
    required this.forceUpdateMessages,
    required this.maintenanceMode,
    this.maintenanceMessages,
  });

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    Map<String, String> toStringMap(dynamic v) {
      if (v is Map) {
        return v.map((k, val) => MapEntry(k.toString(), val?.toString() ?? ''));
      }
      return {};
    }

    return AppConfig(
      platform: json['platform']?.toString() ?? 'android',
      minVersion: json['min_version']?.toString() ?? '0.0.0',
      latestVersion: json['latest_version']?.toString() ?? '0.0.0',
      storeUrl: json['store_url']?.toString() ?? '',
      forceUpdateMessages: toStringMap(json['force_update_message']),
      maintenanceMode: json['maintenance_mode'] == true,
      maintenanceMessages: json['maintenance_message'] != null
          ? toStringMap(json['maintenance_message'])
          : null,
    );
  }

  /// Berilgan tilda xabarni qaytaradi.
  /// Til mavjud bo'lmasa, uz → ru → en tartibida fallback.
  String _messageFor(Map<String, String>? messages, String preferredLang) {
    if (messages == null || messages.isEmpty) return '';
    return messages[preferredLang] ??
        messages['uz'] ??
        messages['ru'] ??
        messages['en'] ??
        messages.values.first;
  }

  String forceUpdateMessage(String lang) =>
      _messageFor(forceUpdateMessages, lang);

  String maintenanceMessage(String lang) =>
      _messageFor(maintenanceMessages, lang);
}

/// Server'dan AppConfig olish servisi.
///
/// DIZAYN:
///   • Mustaqil Dio instance — ApiClient interceptor'lariga bog'liq emas
///     (login ekranida ham ishlashi kerak — auth token yo'q paytda)
///   • 8 soniyalik timeout — server uxlab qolgan bo'lsa, ilova ishlay
///     boshlasin (fail open)
///   • Tarmoq xatoligida null qaytaradi — UI bunga moslashishi kerak
class AppConfigService {
  AppConfigService();

  Future<AppConfig?> fetch({String platform = 'android'}) async {
    try {
      final dio = Dio(BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
      ));

      final response = await dio.get(
        '/api/app-config/',
        queryParameters: {'platform': platform},
        options: Options(
          headers: {'X-Client-Type': 'mobile'},
        ),
      );

      if (response.data is Map<String, dynamic>) {
        return AppConfig.fromJson(response.data as Map<String, dynamic>);
      }
      return null;
    } catch (_) {
      // Tarmoq xato yoki server javob bermadi —
      // ilovaga davom etishga ruxsat (fail open).
      // Force update juda kam holat, server xato bo'lganda mijozni
      // qoldirib ketish noinsoflik.
      return null;
    }
  }
}

/// Versiyalarni solishtirish: a < b bo'lsa true.
///
/// MISOLLAR:
///   isVersionBelow('1.0.0', '1.0.0') → false
///   isVersionBelow('1.0.0', '1.0.1') → true
///   isVersionBelow('1.4.99', '1.5.0') → true
///   isVersionBelow('2.0.0', '1.99.99') → false
///   isVersionBelow('1.0', '1.0.0') → false (turli uzunliklar 0 bilan tenglashadi)
bool isVersionBelow(String current, String minimum) {
  try {
    final currentParts = current.split('.').map(int.parse).toList();
    final minParts = minimum.split('.').map(int.parse).toList();

    // Padding 0 lar bilan tenglashtirish (1.0 → 1.0.0)
    while (currentParts.length < minParts.length) {
      currentParts.add(0);
    }
    while (minParts.length < currentParts.length) {
      minParts.add(0);
    }

    for (var i = 0; i < currentParts.length; i++) {
      if (currentParts[i] < minParts[i]) return true;
      if (currentParts[i] > minParts[i]) return false;
    }
    return false; // teng
  } catch (_) {
    // Versiya formati noma'lum — current'ni etarli deb hisoblaymiz
    return false;
  }
}
