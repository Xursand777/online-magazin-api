import 'package:hive/hive.dart';

import '../storage/local_storage.dart';
import 'cache_entry.dart';

/// Phase 1.5 — Offline cache service (Stale-While-Revalidate pattern).
///
/// ── NIMA QILADI ────────────────────────────────────────────────────────────
/// API javoblarini lokal'da (Hive) saqlaydi. Tarmoq xato yoki sekin bo'lsa,
/// keshlangan ma'lumotlar darhol ko'rsatiladi. Foydalanuvchi tajribasi:
///   • Cold start: sahifa 50ms da chiqadi (cache), fonida fresh fetch
///   • Offline:    "Oflayn — 2 soat oldin" indicator + keshlangan ma'lumot
///   • Slow net:  Spinner emas — keshlangan ko'rinadi, oxiriga real keladi
///
/// ── DESIGN QARORLARI ──────────────────────────────────────────────────────
/// 1. STORAGE: Hive String box (JSON serialize/parse)
///    Sabab: Hive native, fast (~1ms read), already in app
///
/// 2. ATOMIC READ (sync) + ASYNC WRITE:
///    `read()` sinxron — Bloc darhol emit qilishi mumkin
///    `save()` async — write blocking emas
///
/// 3. LRU EVICTION (>100 entry'da):
///    Memory'ni cheklash. Eng eski cachedAt o'chiriladi.
///    100 ta — mobile uchun yetarli (asosiy sahifa + 50 product detail + 50 boshqa)
///
/// 4. NO ENCRYPTION:
///    Cache PII saqlamasligi shart (banners, categories, products — public).
///    User-specific data (orders, profile) cache qilinmaydi.
///    Logout'da cache tozalanadi (clearAllUserData orqali).
///
/// 5. NO TTL ENFORCEMENT IN SERVICE:
///    Service har doim eski yozuvni qaytaradi (age bilan).
///    "Tooo stale" qarorini caller (repository) qabul qiladi.
///    Sabab: offline'da 7 kun eski bo'lsa ham — yo'qdan ko'ra yaxshi.
class OfflineCacheService {
  /// Maksimal yozuvlar soni. Limit oshilsa, eng eski LRU bilan o'chiriladi.
  static const int maxEntries = 100;

  /// Hive box (LocalStorage.init() da ochilgan)
  Box<String> get _box => LocalStorage.offlineCacheBox;

  /// Keshlangan yozuvni qaytaradi (sinxron — Bloc darhol emit qila oladi).
  /// Yozuv yo'q yoki format buzilgan bo'lsa — null.
  CacheEntry? read(String key) {
    final raw = _box.get(key);
    return CacheEntry.tryParse(raw);
  }

  /// API javobini keshga saqlaydi (async).
  ///
  /// LRU EVICTION:
  /// Cache 100 dan oshsa, eng eski yozuvni o'chiramiz.
  /// Hivening MAJBURIY blocking call'i emas — chaqiruvchi await qilishi yoki
  /// fire-and-forget qila olishi mumkin.
  Future<void> save(String key, dynamic data) async {
    final entry = CacheEntry(
      data: data,
      cachedAt: DateTime.now(),
    );
    await _box.put(key, entry.toJsonString());
    // Eviction fonda — yozish blocking bo'lmasin
    _evictIfNeeded();
  }

  /// Aniq yozuvni o'chirish (masalan, user pull-to-refresh + force invalidate).
  Future<void> invalidate(String key) async {
    await _box.delete(key);
  }

  /// Berilgan prefiks bilan boshlanadigan barcha yozuvlarni o'chirish.
  /// Misol: `invalidateByPrefix('product:')` — barcha product cache.
  Future<void> invalidateByPrefix(String prefix) async {
    final keysToDelete = _box.keys
        .whereType<String>()
        .where((k) => k.startsWith(prefix))
        .toList();
    await _box.deleteAll(keysToDelete);
  }

  /// Hamma keshni tozalash (logout vaqtida chaqiriladi).
  Future<void> clearAll() async {
    await _box.clear();
  }

  /// Joriy hajmni qaytaradi (debug uchun).
  int get size => _box.length;

  // ─── LRU eviction ─────────────────────────────────────────────────────────
  //
  // Hive native LRU bermaydi. Bizning yondashuv:
  //   1. Limit oshilsa, hamma yozuvlarning cachedAt'ni parse qilamiz
  //   2. Eng eski cachedAt'ni topib o'chiramiz
  //   3. Limit ostiga tushgunga qadar takrorlaymiz
  //
  // PERFORMANCE: 100 ta entry → ~5ms. Production'da qabul qilinarli.
  // Eviction fonda — UI bloklanmaydi.
  Future<void> _evictIfNeeded() async {
    if (_box.length <= maxEntries) return;

    // Barcha yozuvlarning cachedAt'ini olamiz
    final candidates = <_AgedKey>[];
    for (final k in _box.keys) {
      if (k is! String) continue;
      final entry = read(k);
      if (entry == null) {
        // Format buzilgan — darhol o'chiramiz
        await _box.delete(k);
        continue;
      }
      candidates.add(_AgedKey(key: k, cachedAt: entry.cachedAt));
    }

    // Eng eski birinchi
    candidates.sort((a, b) => a.cachedAt.compareTo(b.cachedAt));

    // Limit ostiga tushgunga qadar o'chiramiz
    final toDelete = candidates.length - maxEntries;
    if (toDelete <= 0) return;
    final keysToDelete = candidates.take(toDelete).map((c) => c.key).toList();
    await _box.deleteAll(keysToDelete);
  }
}

class _AgedKey {
  final String key;
  final DateTime cachedAt;
  _AgedKey({required this.key, required this.cachedAt});
}

/// Kesh kalitlar uchun standart prefikslar (namespacing).
///
/// MISOL:
///   CacheKeys.homePage              → 'home_page'
///   CacheKeys.productDetail(42)     → 'product:42'
///   CacheKeys.section('discount')   → 'section:discount'
class CacheKeys {
  static const String homePage = 'home_page';

  static String productDetail(int id) => 'product:$id';
  static String section(String key) => 'section:$key';
  static String category(int id) => 'category:$id';
}
