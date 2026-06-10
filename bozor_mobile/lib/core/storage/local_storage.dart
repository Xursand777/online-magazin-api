import 'package:hive_flutter/hive_flutter.dart';

class LocalStorage {
  static const String cartBoxName = 'cartBox';
  static const String settingsBoxName = 'settingsBox';
  static const String searchHistoryBoxName = 'searchHistoryBox';
  static const String favoritesBoxName = 'favoritesBox';
  // Phase 1.5 — Offline cache (API javoblari SWR pattern bilan)
  static const String offlineCacheBoxName = 'offlineCacheBox';

  static Future<void> init() async {
    // Open necessary boxes here
    await Hive.openBox(cartBoxName);
    await Hive.openBox(settingsBoxName);
    await Hive.openBox<String>(searchHistoryBoxName);
    await Hive.openBox(favoritesBoxName);
    await Hive.openBox<String>(offlineCacheBoxName);
  }

  // Cart operations
  static Box get cartBox => Hive.box(cartBoxName);

  // Settings (Theme, etc)
  static Box get settingsBox => Hive.box(settingsBoxName);

  static bool get isDarkMode =>
      settingsBox.get('isDarkMode', defaultValue: false);
  static Future<void> setDarkMode(bool isDark) async =>
      await settingsBox.put('isDarkMode', isDark);

  // Search History
  static Box<String> get searchHistoryBox =>
      Hive.box<String>(searchHistoryBoxName);

  // Phase 1.5 — Offline cache box (OfflineCacheService ishlatadi)
  static Box<String> get offlineCacheBox =>
      Hive.box<String>(offlineCacheBoxName);

  // Favorites
  static Box get favoritesBox => Hive.box(favoritesBoxName);

  /// Logout vaqtida butun foydalanuvchiga oid lokal ma'lumotlarni tozalaydi.
  ///
  /// ── NIMA UCHUN MUHIM ──────────────────────────────────────────────────────
  /// Hive boxlari foydalanuvchi sessiyasiga bog'liq emas — ular butun ilova
  /// o'rnatilishi davomida saqlanadi. Logout dan keyin tozalanmasa:
  ///   • A foydalanuvchi savatga qo'shgan mahsulotlar B foydalanuvchida ko'rinadi
  ///   • Qidiruv tarixi shaxsiy ma'lumot — boshqa foydalanuvchi ko'rmasligi kerak
  ///   • Offline cache profilga oid ma'lumot bo'lishi mumkin (recommended, recently
  ///     viewed — kelajakda kengaytirilsa)
  ///
  /// SAQLANIB QOLADIGAN narsalar (foydalanuvchiga bog'liq emas):
  ///   • settingsBox (theme, til) — bu qurilma sozlamalari, sessiyaga aloqasi yo'q
  static Future<void> clearAllUserData() async {
    await cartBox.clear();
    await searchHistoryBox.clear();
    await favoritesBox.clear();
    // Phase 1.5 — keshlangan API javoblari (banners/categories'gacha)
    // Public narsalar texnik jihatdan PII emas, lekin xavfsizroq tozalash
    await offlineCacheBox.clear();
    // settingsBox tozalanmaydi — bu qurilma darajasidagi konfiguratsiya
  }
}
