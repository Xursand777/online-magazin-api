import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/cache/cache_entry.dart';
import '../../../../core/models/banner_model.dart';
import '../../../../core/models/category_model.dart';
import '../../../../core/models/product_model.dart';
import '../../data/repositories/home_repository.dart';

// --- Events ---
abstract class HomeEvent extends Equatable {
  const HomeEvent();
  @override
  List<Object?> get props => [];
}

class LoadHomeData extends HomeEvent {
  /// Pull-to-refresh: forceRefresh=true bo'lsa cache'ni chetlab o'tib,
  /// to'g'ridan-to'g'ri tarmoq'ga boradi.
  final bool forceRefresh;
  const LoadHomeData({this.forceRefresh = false});
  @override
  List<Object?> get props => [forceRefresh];
}

// --- States ---
//
// Phase 1.5 — yangi maydonlar:
//   isStale:    keshlangan ma'lumot ko'rsatilmoqda
//   cacheAge:   keshlangan vaqt (UI banner: "2 soat oldin")
//   isRefreshing: fon'da fresh fetch ketmoqda (cached vaqtida)
//
class HomeState extends Equatable {
  final bool isLoading;
  final bool isRefreshing;
  final bool isStale;
  final Duration? cacheAge;
  final List<BannerModel> banners;
  final List<CategoryModel> categories;
  final List<ProductModel> recommended;
  final List<ProductModel> discounted;
  final List<ProductModel> newProducts;
  final List<ProductModel> popularProducts;
  final String? error;

  const HomeState({
    this.isLoading = false,
    this.isRefreshing = false,
    this.isStale = false,
    this.cacheAge,
    this.banners = const [],
    this.categories = const [],
    this.recommended = const [],
    this.discounted = const [],
    this.newProducts = const [],
    this.popularProducts = const [],
    this.error,
  });

  /// Foydalanuvchi ko'radigan cache yoshi: "2 soat oldin"
  String? get cacheAgeDisplay =>
      cacheAge == null ? null : formatCacheAge(cacheAge!);

  /// UI uchun: oflayn banner ko'rsatilsinmi
  bool get shouldShowOfflineIndicator => isStale && !isRefreshing && error != null;

  HomeState copyWith({
    bool? isLoading,
    bool? isRefreshing,
    bool? isStale,
    Duration? cacheAge,
    bool clearCacheAge = false,
    List<BannerModel>? banners,
    List<CategoryModel>? categories,
    List<ProductModel>? recommended,
    List<ProductModel>? discounted,
    List<ProductModel>? newProducts,
    List<ProductModel>? popularProducts,
    String? error,
    bool clearError = false,
  }) {
    return HomeState(
      isLoading: isLoading ?? this.isLoading,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isStale: isStale ?? this.isStale,
      cacheAge: clearCacheAge ? null : (cacheAge ?? this.cacheAge),
      banners: banners ?? this.banners,
      categories: categories ?? this.categories,
      recommended: recommended ?? this.recommended,
      discounted: discounted ?? this.discounted,
      newProducts: newProducts ?? this.newProducts,
      popularProducts: popularProducts ?? this.popularProducts,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props => [
        isLoading,
        isRefreshing,
        isStale,
        cacheAge,
        banners,
        categories,
        recommended,
        discounted,
        newProducts,
        popularProducts,
        error,
      ];
}

// --- Bloc ---
//
// SWR oqimi (Stale-While-Revalidate):
//   1. forceRefresh=false (default) → kesh'dan o'qiymiz
//      a) Cache bor → isStale=true bilan emit (instant UI), isRefreshing=true
//      b) Cache yo'q → isLoading=true emit (skeleton ko'rinadi)
//   2. Tarmoq'dan fresh fetch
//      a) Muvaffaqiyatli → fresh bilan emit, isStale=false, isRefreshing=false
//      b) Xato + cache bor → cached saqlanadi, isStale=true qoladi, error qo'shiladi
//      c) Xato + cache yo'q → error emit
class HomeBloc extends Bloc<HomeEvent, HomeState> {
  final HomeRepository repository;

  HomeBloc({required this.repository}) : super(const HomeState()) {
    on<LoadHomeData>(_onLoadHomeData);
  }

  Future<void> _onLoadHomeData(
    LoadHomeData event,
    Emitter<HomeState> emit,
  ) async {
    // ── 1. Cache'dan darhol emit (force refresh bo'lmasa) ──────────────────
    CachedHomeData? cached;
    if (!event.forceRefresh) {
      cached = repository.getCachedHomePage();
    }

    if (cached != null) {
      // Instant UI: keshlangan ma'lumot bilan boshlanadi
      emit(state.copyWith(
        isLoading: false,
        isRefreshing: true,  // fon'da yangilanadi
        isStale: true,
        cacheAge: cached.age,
        banners: cached.banners,
        categories: cached.categories,
        recommended: cached.recommended,
        discounted: cached.discounted,
        newProducts: cached.newProducts,
        popularProducts: cached.popularProducts,
        clearError: true,
      ));
    } else {
      // Cache yo'q — skeleton ko'rinadi
      emit(state.copyWith(
        isLoading: true,
        isRefreshing: false,
        isStale: false,
        clearError: true,
        clearCacheAge: true,
      ));
    }

    // ── 2. Fresh fetch (tarmoq) ───────────────────────────────────────────
    try {
      final fresh = await repository.fetchHomePageFresh();

      emit(state.copyWith(
        isLoading: false,
        isRefreshing: false,
        isStale: false,
        clearCacheAge: true,
        banners: fresh.banners,
        categories: fresh.categories,
        recommended: fresh.recommended,
        discounted: fresh.discounted,
        newProducts: fresh.newProducts,
        popularProducts: fresh.popularProducts,
        clearError: true,
      ));
    } catch (e) {
      // Tarmoq xato
      if (cached != null) {
        // Cache mavjud — eski ma'lumot bilan davom etamiz + xato indicator
        emit(state.copyWith(
          isLoading: false,
          isRefreshing: false,
          error: 'Yangilanish muvaffaqiyatsiz — keshlangan ma\'lumot',
        ));
      } else {
        // Cache yo'q + tarmoq yo'q — to'liq xato
        emit(state.copyWith(
          isLoading: false,
          isRefreshing: false,
          error: e.toString(),
        ));
      }
    }
  }
}
