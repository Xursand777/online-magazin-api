import 'dart:convert';

import '../../../../core/storage/local_storage.dart';

/// Foydalanuvchining yaqinda qidirgan so'zlarini lokal Hive'da saqlaydi.
///
/// Algoritm (Amazon/Wildberries/Google'dagi kabi):
///   • Maksimal 10 ta so'z saqlanadi (oxirgi qidirilgan eng tepada)
///   • Qayta qidirilsa — yuqoriga ko'tariladi (deduplicate)
///   • Bo'sh yoki probel'li so'rovlar saqlanmaydi
///   • Birorta o'chirilsa — qolganlari tartib o'zgarmaydi
///   • Sessiya bilan bog'liq emas — foydalanuvchidan-foydalanuvchiga saqlanadi
///
/// LocalStorage.searchHistoryBox `Box<String>` — har element bitta string.
/// Bizga LIST kerak, shuning uchun JSON-encoded string sifatida bitta kalit
/// ostida saqlaymiz. Bu yondashuv:
///   • Mavjud LocalStorage skemasini o'zgartirmaymiz
///   • JSON parse tezligi 10 ta string uchun mikrosekundlar (samarali)
///   • Future migratsiya oson — ['a','b','c'] strukturasi standart
class RecentSearchesService {
  /// Hive box'dagi kalit nomi (JSON-encoded ro'yxat saqlanadi).
  static const String _key = 'recent_queries_v1';

  /// Maksimal element soni (UX qulayligi uchun — ko'p bo'lsa scroll qiyin).
  static const int _maxItems = 10;

  /// Barcha yaqinda qidirilgan so'zlarni qaytaradi (eng yangi birinchi).
  List<String> getAll() {
    final raw = LocalStorage.searchHistoryBox.get(_key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.whereType<String>().toList();
      }
    } catch (_) {
      // Buzilgan JSON — invalidate qilamiz
      LocalStorage.searchHistoryBox.delete(_key);
    }
    return const [];
  }

  /// Yangi so'rovni saqlaydi.
  /// Bo'sh yoki faqat probel — saqlanmaydi.
  /// Mavjud bo'lsa — yuqoriga ko'taradi.
  Future<void> add(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;

    final all = List<String>.from(getAll());
    // Case-insensitive duplicate'larni ham olib tashlaymiz
    all.removeWhere((q) => q.toLowerCase() == trimmed.toLowerCase());
    all.insert(0, trimmed);

    if (all.length > _maxItems) {
      all.removeRange(_maxItems, all.length);
    }

    await LocalStorage.searchHistoryBox.put(_key, jsonEncode(all));
  }

  /// Bitta so'rovni o'chiradi.
  Future<void> remove(String query) async {
    final all = List<String>.from(getAll());
    final beforeLen = all.length;
    all.removeWhere((q) => q.toLowerCase() == query.toLowerCase());
    if (all.length != beforeLen) {
      await LocalStorage.searchHistoryBox.put(_key, jsonEncode(all));
    }
  }

  /// Barcha tarixni tozalash.
  Future<void> clear() async {
    await LocalStorage.searchHistoryBox.delete(_key);
  }
}
