import '../../../../core/cache/cache_entry.dart';
import '../../../../core/cache/offline_cache_service.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/network/api_response.dart';
import '../../../../core/models/banner_model.dart';
import '../../../../core/models/category_model.dart';
import '../../../../core/models/product_model.dart';

/// Home sahifa uchun ma'lumot saqlanadigan kutubxona.
///
/// Phase 1.5 — OfflineCacheService bilan kengaytirildi:
///   • getCachedHomePage()  — sinxron, darhol cache'dan qaytaradi
///   • fetchHomePageFresh() — tarmoq'dan oladi + cache'ga saqlaydi
///
/// Bloc ikkala metodni ham chaqiradi (SWR pattern):
///   1. Birinchi cache'dan emit (instant UI)
///   2. Keyin tarmoq'dan fresh — yangilash
class HomeRepository {
  final ApiClient apiClient;
  final OfflineCacheService cache;

  HomeRepository({required this.apiClient, required this.cache});

  // ── Cache'dan o'qish (sinxron — Bloc darhol emit qiladi) ─────────────────

  /// Keshlangan home page payload'ni qaytaradi. Yo'q bo'lsa — null.
  ///
  /// QAYTARADI:
  ///   CachedHomeData? — banners, categories, productlar + cachedAt
  ///
  /// FOYDALANISH:
  ///   final cached = repository.getCachedHomePage();
  ///   if (cached != null) emit(cached.toState(isStale: true));
  CachedHomeData? getCachedHomePage() {
    final entry = cache.read(CacheKeys.homePage);
    if (entry == null) return null;
    try {
      final map = entry.data as Map<String, dynamic>;
      return CachedHomeData(
        banners: (map['banners'] as List<dynamic>? ?? [])
            .map((j) => BannerModel.fromJson(j as Map<String, dynamic>))
            .toList(),
        categories: (map['categories'] as List<dynamic>? ?? [])
            .map((j) => CategoryModel.fromJson(j as Map<String, dynamic>))
            .toList(),
        recommended: (map['recommended'] as List<dynamic>? ?? [])
            .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
            .toList(),
        discounted: (map['discounted'] as List<dynamic>? ?? [])
            .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
            .toList(),
        newProducts: (map['newProducts'] as List<dynamic>? ?? [])
            .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
            .toList(),
        popularProducts: (map['popularProducts'] as List<dynamic>? ?? [])
            .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
            .toList(),
        cachedAt: entry.cachedAt,
      );
    } catch (_) {
      // Kesh format buzilgan — invalidate qilamiz (fire-and-forget)
      cache.invalidate(CacheKeys.homePage);
      return null;
    }
  }

  /// Tarmoq'dan fresh home page payload oladi + cache'ga saqlaydi.
  ///
  /// ═════════════════════════════════════════════════════════════════════════
  /// PROFESSIONAL ARXITEKTURA — sayt bilan to'liq sinxron
  /// ═════════════════════════════════════════════════════════════════════════
  ///
  /// Avval 6 ta alohida API chaqirilar edi (banners, categories, recommended,
  /// discount, new, popular). Bu juda samarasiz edi:
  ///   • 6 ta TCP roundtrip (sekin tarmoqda 2-6 sekund)
  ///   • Recommended uchun `/api/products/` ishlatilar edi — PERSONALIZED EMAS
  ///     (faqat `updated_at` bo'yicha — sayt'ga qaraganda noprofessional)
  ///   • Server-side aggregation imkoniyatlari ishlatilmas edi
  ///
  /// ENDI: `/api/main/` aggregated endpoint — sayt bilan AYNI:
  ///   • 1 ta HTTP so'rov → 1 ta TCP roundtrip
  ///   • Banners + categories + 4 ta tavsiya section bir javobda
  ///   • Recommended → `build_personalized_recommendations()`:
  ///     - Foydalanuvchi profilidan: keyword_scores, category_scores,
  ///       product_scores, price_bucket_scores ishlatadi
  ///     - Profile yo'q (guest) → ommabop + yangi + updated_at
  ///   • Variant expansion, stock filter, interleave — backend tarafda
  ///   • Limit: server-controlled (15 ta per section, 10 ko'rsatish uchun)
  ///
  /// Mahsulotlar ko'payganda ham professional ishlaydi:
  ///   • 1 million mahsulot → server 10-15 ta personalized variant qaytaradi
  ///   • Random Pivot Sampling: O(log n + k) — 1M mahsulot uchun ~100ms
  ///   • Redis kesh: 5 daqiqalik TTL — server resurslarini tejaydi
  ///
  /// Categories `/api/categories/` orqali alohida olinadi (boshqa kerakli joylar
  /// ham ishlatadi — kataloq sahifa va h.k.).
  Future<CachedHomeData> fetchHomePageFresh() async {
    // Asosiy ma'lumotlar /api/main/ dan, kategoriyalar alohida
    final results = await Future.wait([
      _fetchMainPage(),         // banners + 4 ta section bir javobda
      getPopularCategories(),   // kategoriyalar alohida endpoint
    ]);

    final main = results[0] as _MainPagePayload;
    final categories = results[1] as List<CategoryModel>;

    final fresh = CachedHomeData(
      banners:         main.banners,
      categories:      categories,
      recommended:     main.recommended,
      discounted:      main.discounted,
      newProducts:     main.newProducts,
      popularProducts: main.popularProducts,
      cachedAt:        DateTime.now(),
    );

    // Cache'ga saqlash (fire-and-forget — UI ni bloklamasin)
    cache.save(CacheKeys.homePage, fresh.toJson());

    return fresh;
  }

  /// `/api/main/` — sayt'ning asosiy aggregated endpointi.
  ///
  /// Server bizga TAYYOR section'larni qaytaradi:
  ///   • banners              — HomeBanner ro'yxati
  ///   • discount_products    — chegirmadagi (15 ta, stock filter+interleave)
  ///   • new_products         — yangi (15 ta)
  ///   • popular_products     — ommabop (15 ta)
  ///   • recommended_products — PERSONALIZED tavsiya (15 ta)
  ///
  /// Hammasi `?expand_variants=true` rejimida — har variant alohida karta.
  Future<_MainPagePayload> _fetchMainPage() async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.main,
        queryParameters: _expandParams,
      );
      final data = response.data as Map<String, dynamic>;

      List<ProductModel> parseList(String key) {
        final raw = data[key] as List? ?? [];
        return raw
            .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
            .toList();
      }

      List<BannerModel> parseBanners() {
        final raw = data['banners'] as List? ?? [];
        return raw
            .map((j) => BannerModel.fromJson(j as Map<String, dynamic>))
            .toList();
      }

      return _MainPagePayload(
        banners:         parseBanners(),
        recommended:     parseList('recommended_products'),
        discounted:      parseList('discount_products'),
        newProducts:     parseList('new_products'),
        popularProducts: parseList('popular_products'),
      );
    } catch (_) {
      return _MainPagePayload.empty();
    }
  }

  // ── Individual fetcher'lar (avvalgi xulq-atvor) ──────────────────────────

  Future<List<BannerModel>> getBanners() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.banners);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => BannerModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<CategoryModel>> getPopularCategories() async {
    try {
      // Home chiplari — admin "homeda ko'rsatish" (is_popular) flagli kategoriyalar.
      // Sayt bilan AYNAN bir xil endpoint → home kategoriyalari 100% bir xil.
      final response = await apiClient.dio.get(ApiConstants.categoriesHome);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => CategoryModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  // ── Variant-aware product endpointlari ───────────────────────────────────
  // `expand_variants=true` — har variant alohida karta (Amazon/Wildberries uslubi).
  // Backend tugab qolgan mahsulotlarni avtomatik yashiradi va variantlarni
  // round-robin tartibida aralashtiradi (bir mahsulot variantlari ketma-ket emas).
  static const Map<String, dynamic> _expandParams = {
    'expand_variants': 'true',
  };

  /// PROFESSIONAL recommended endpoint — `/api/products/recommended/`.
  ///
  /// Backend Random Pivot Sampling + 5 daqiqalik Redis kesh ishlatadi:
  ///   • Pool hajmi: 10,000 ID (Redis 80 KB — katalog hajmidan mustaqil)
  ///   • Pool tarkibi: 40% popular + 30% new + 30% diverse sample
  ///   • Algoritm: ORDER BY RANDOM() emas (O(n log n) — sekin),
  ///                Random Pivot — O(log n + k) — 1M mahsulot uchun ~100ms
  ///
  /// "Barchasini ko'rish" tugmasi recommended bo'lsa shu chaqiriladi.
  /// Asosiy home sahifa esa /api/main/ orqali aggregated data oladi.
  Future<List<ProductModel>> getRecommendedProducts() async {
    try {
      final response = await apiClient.dio.get(
        '/api/products/recommended/',
        queryParameters: _expandParams,
      );
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getDiscountedProducts() async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.discounts,
        queryParameters: _expandParams,
      );
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getNewProducts() async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.newProducts,
        queryParameters: _expandParams,
      );
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getPopularProducts() async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.popularProducts,
        queryParameters: _expandParams,
      );
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getSectionProducts(String sectionKey) {
    return switch (sectionKey) {
      'discount' => getDiscountedProducts(),
      'new' => getNewProducts(),
      'popular' => getPopularProducts(),
      _ => getRecommendedProducts(),
    };
  }

  /// SAHIFALANGAN bo'lim mahsulotlari — "Barchasini ko'rish" infinite scroll
  /// uchun. Backend `SectionPagination` (40/sahifa) qaytaradi; `next` bo'lsa
  /// yana sahifa bor. Serverga og'irlik tushmaydi — har so'rovda faqat bir
  /// sahifa (40 ta) yuklanadi (Amazon/Wildberries uslubi).
  ///
  /// `recommended` bo'limi backend'da sahifalanmaydi (cheklangan pool) —
  /// bir marta yuklanadi, `hasMore=false`.
  Future<({List<ProductModel> items, bool hasMore})> getSectionProductsPage(
    String sectionKey, {
    required int page,
    int pageSize = 40,
  }) async {
    final String? path = switch (sectionKey) {
      'discount' => ApiConstants.discounts,
      'new' => ApiConstants.newProducts,
      'popular' => ApiConstants.popularProducts,
      _ => null, // recommended — sahifalanmaydi
    };

    if (path == null) {
      // Recommended: bir martalik ro'yxat (sahifasiz).
      final items = page <= 1 ? await getRecommendedProducts() : <ProductModel>[];
      return (items: items, hasMore: false);
    }

    try {
      final response = await apiClient.dio.get(
        path,
        queryParameters: {
          ..._expandParams,
          'page': page,
          'page_size': pageSize,
        },
      );
      final data = response.data;
      final items = ApiResponse.listFrom(data)
          .map((json) => ProductModel.fromJson(json))
          .toList();
      // `next` bo'sh bo'lmasa — yana sahifa bor.
      final hasMore = data is Map<String, dynamic> && data['next'] != null;
      return (items: items, hasMore: hasMore);
    } catch (_) {
      return (items: <ProductModel>[], hasMore: false);
    }
  }
}

/// Internal — `/api/main/` javobini parse qilingan ko'rinishda saqlaydi.
class _MainPagePayload {
  final List<BannerModel> banners;
  final List<ProductModel> recommended;
  final List<ProductModel> discounted;
  final List<ProductModel> newProducts;
  final List<ProductModel> popularProducts;

  const _MainPagePayload({
    required this.banners,
    required this.recommended,
    required this.discounted,
    required this.newProducts,
    required this.popularProducts,
  });

  factory _MainPagePayload.empty() => const _MainPagePayload(
        banners: [],
        recommended: [],
        discounted: [],
        newProducts: [],
        popularProducts: [],
      );
}

/// Home page uchun keshlangan ma'lumot konteyneri.
///
/// Ham cache'ga yozish (toJson), ham cache'dan o'qish uchun.
class CachedHomeData {
  final List<BannerModel> banners;
  final List<CategoryModel> categories;
  final List<ProductModel> recommended;
  final List<ProductModel> discounted;
  final List<ProductModel> newProducts;
  final List<ProductModel> popularProducts;
  final DateTime cachedAt;

  CachedHomeData({
    required this.banners,
    required this.categories,
    required this.recommended,
    required this.discounted,
    required this.newProducts,
    required this.popularProducts,
    required this.cachedAt,
  });

  Duration get age => DateTime.now().difference(cachedAt);
  String get ageDisplay => formatCacheAge(age);

  Map<String, dynamic> toJson() => {
        'banners': banners.map((b) => b.toJson()).toList(),
        'categories': categories.map((c) => c.toJson()).toList(),
        'recommended': recommended.map((p) => p.toJson()).toList(),
        'discounted': discounted.map((p) => p.toJson()).toList(),
        'newProducts': newProducts.map((p) => p.toJson()).toList(),
        'popularProducts': popularProducts.map((p) => p.toJson()).toList(),
      };
}
