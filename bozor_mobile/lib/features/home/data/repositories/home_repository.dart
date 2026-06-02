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
  /// Bu metod parallel ravishda 6 ta API chaqiradi (banners + categories +
  /// 4 ta mahsulot bo'limi). Birortasi xato bo'lsa, bo'sh ro'yxat qaytaradi
  /// (mavjud xulq-atvor saqlanadi).
  Future<CachedHomeData> fetchHomePageFresh() async {
    // Parallel fetch
    final results = await Future.wait([
      getBanners(),
      getPopularCategories(),
      getRecommendedProducts(),
      getDiscountedProducts(),
      getNewProducts(),
      getPopularProducts(),
    ]);

    final fresh = CachedHomeData(
      banners: results[0] as List<BannerModel>,
      categories: results[1] as List<CategoryModel>,
      recommended: results[2] as List<ProductModel>,
      discounted: results[3] as List<ProductModel>,
      newProducts: results[4] as List<ProductModel>,
      popularProducts: results[5] as List<ProductModel>,
      cachedAt: DateTime.now(),
    );

    // Cache'ga saqlash (fire-and-forget — UI ni bloklamasin)
    cache.save(CacheKeys.homePage, fresh.toJson());

    return fresh;
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
      final response = await apiClient.dio.get(ApiConstants.categories);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => CategoryModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getRecommendedProducts() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.products);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getDiscountedProducts() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.discounts);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getNewProducts() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.newProducts);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getPopularProducts() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.popularProducts);
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
