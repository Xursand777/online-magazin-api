import 'dart:convert';

/// Phase 1.5 — keshlangan API javobi.
///
/// HAR YOZUVDA:
///   • data       — server javobi (raw JSON dynamic)
///   • cachedAt   — qachon olingan
///   • schemaVer  — kesh formati versiyasi (kelajakda migration)
///
/// VERSIYALASH:
///   Kelajakda yozish formatini o'zgartirsangiz, schemaVer'ni oshiring.
///   Eski versiyali yozuvlar avtomat null qaytaradi (yangi fetch).
class CacheEntry {
  /// Joriy schema versiya. Format o'zgarsa — oshirilsin.
  static const int currentSchemaVersion = 1;

  final dynamic data;
  final DateTime cachedAt;
  final int schemaVer;

  CacheEntry({
    required this.data,
    required this.cachedAt,
    this.schemaVer = currentSchemaVersion,
  });

  /// Qancha vaqt o'tdi (DateTime.now() bilan farq).
  Duration get age => DateTime.now().difference(cachedAt);

  /// Yozuv joriy versiyaga moslashganmi.
  bool get isCurrentVersion => schemaVer == currentSchemaVersion;

  /// Berilgan muddatdan eski bo'lsa true.
  bool isStaleAfter(Duration threshold) => age > threshold;

  /// JSON ko'rinishida saqlanadi (Hive String box).
  Map<String, dynamic> toJson() => {
        'schemaVer': schemaVer,
        'cachedAt': cachedAt.toIso8601String(),
        'data': data,
      };

  String toJsonString() => jsonEncode(toJson());

  /// Hive'dan o'qiganda chaqiriladi. Format buzilgan bo'lsa — null.
  static CacheEntry? tryParse(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final ver = map['schemaVer'] as int? ?? 0;
      // Eski versiyali yozuvlarni qabul qilmaymiz — yangi fetch yaxshiroq
      if (ver != currentSchemaVersion) return null;

      final cachedAtStr = map['cachedAt'] as String?;
      if (cachedAtStr == null) return null;
      final cachedAt = DateTime.tryParse(cachedAtStr);
      if (cachedAt == null) return null;

      // Vaqt kelajakda bo'lsa (qurilma soati buzilgan) — invalid
      if (cachedAt.isAfter(DateTime.now().add(const Duration(hours: 1)))) {
        return null;
      }

      return CacheEntry(
        data: map['data'],
        cachedAt: cachedAt,
        schemaVer: ver,
      );
    } catch (_) {
      return null;
    }
  }
}

/// Qulay age formatlash — UI banner uchun.
///
/// MISOLLAR:
///   30 sekund   → "hozir"
///   5 daqiqa    → "5 daqiqa oldin"
///   2 soat      → "2 soat oldin"
///   1 kun       → "kecha"
///   3 kun       → "3 kun oldin"
String formatCacheAge(Duration age) {
  if (age.inSeconds < 60) return 'hozir';
  if (age.inMinutes < 60) return '${age.inMinutes} daqiqa oldin';
  if (age.inHours < 24) return '${age.inHours} soat oldin';
  if (age.inDays == 1) return 'kecha';
  if (age.inDays < 7) return '${age.inDays} kun oldin';
  return '${age.inDays ~/ 7} hafta oldin';
}
