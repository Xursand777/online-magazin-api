import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract class PaginatedSearchEvent extends Equatable {
  const PaginatedSearchEvent();
  @override
  List<Object?> get props => [];
}

/// Yangi qidiruv boshlash (1-sahifa).
class StartSearch extends PaginatedSearchEvent {
  final String query;
  const StartSearch(this.query);
  @override
  List<Object?> get props => [query];
}

/// Keyingi sahifani yuklash (infinite scroll).
class LoadNextPage extends PaginatedSearchEvent {
  const LoadNextPage();
}

/// Qaytadan boshlash (qayta urinish).
class Retry extends PaginatedSearchEvent {
  const Retry();
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

class PaginatedSearchState extends Equatable {
  final String query;
  final List<ProductModel> products;
  final int currentPage;
  final bool hasMore;            // Keyingi sahifa bormi
  final bool isLoading;          // Birinchi sahifa yuklanmoqda
  final bool isLoadingMore;      // Keyingi sahifa yuklanmoqda
  final String? error;

  const PaginatedSearchState({
    this.query = '',
    this.products = const [],
    this.currentPage = 0,
    this.hasMore = false,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  PaginatedSearchState copyWith({
    String? query,
    List<ProductModel>? products,
    int? currentPage,
    bool? hasMore,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    bool clearError = false,
  }) {
    return PaginatedSearchState(
      query: query ?? this.query,
      products: products ?? this.products,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props =>
      [query, products, currentPage, hasMore, isLoading, isLoadingMore, error];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC — Paginated search with infinite scroll
// ═══════════════════════════════════════════════════════════════════════════════

/// "Barchasini ko'rish" sahifasi uchun bloc.
///
/// Backend: `/api/products/?q=...&page=N&expand_variants=true`
/// Default page_size = 40 (DRF pagination), katta katalog uchun ham
/// "qotib qolmaydi" — har sahifa O(1) so'rov bo'lib qaytaradi.
///
/// Algoritmi (Amazon/Wildberries/Yandex Market uslubi):
///   1. StartSearch(query) → page=1 yuklash, products=replaced
///   2. Foydalanuvchi scroll qiladi → LoadNextPage → page+1
///   3. response.next == null bo'lsa → hasMore=false → endi yuklamaydi
///   4. Xato bo'lsa → error state, foydalanuvchi Retry bosa oladi
class PaginatedSearchBloc
    extends Bloc<PaginatedSearchEvent, PaginatedSearchState> {
  final ApiClient apiClient;
  CancelToken? _activeToken;

  PaginatedSearchBloc({required this.apiClient})
      : super(const PaginatedSearchState()) {
    on<StartSearch>(_onStartSearch);
    on<LoadNextPage>(_onLoadNextPage);
    on<Retry>(_onRetry);
  }

  Future<void> _onStartSearch(
    StartSearch event,
    Emitter<PaginatedSearchState> emit,
  ) async {
    _activeToken?.cancel('new search');
    emit(PaginatedSearchState(
      query: event.query,
      isLoading: true,
    ));
    await _fetchPage(1, emit);
  }

  Future<void> _onLoadNextPage(
    LoadNextPage event,
    Emitter<PaginatedSearchState> emit,
  ) async {
    // Concurrent guards: bitta vaqtda faqat bitta "load more"
    if (state.isLoading || state.isLoadingMore) return;
    if (!state.hasMore) return;
    if (state.query.trim().isEmpty) return;

    emit(state.copyWith(isLoadingMore: true, clearError: true));
    await _fetchPage(state.currentPage + 1, emit, append: true);
  }

  Future<void> _onRetry(Retry event, Emitter<PaginatedSearchState> emit) async {
    if (state.query.trim().isEmpty) return;
    if (state.products.isEmpty) {
      emit(state.copyWith(isLoading: true, clearError: true));
      await _fetchPage(1, emit);
    } else {
      emit(state.copyWith(isLoadingMore: true, clearError: true));
      await _fetchPage(state.currentPage + 1, emit, append: true);
    }
  }

  Future<void> _fetchPage(
    int page,
    Emitter<PaginatedSearchState> emit, {
    bool append = false,
  }) async {
    _activeToken = CancelToken();
    final localToken = _activeToken!;

    try {
      final response = await apiClient.dio.get(
        ApiConstants.products,
        queryParameters: {
          'q': state.query,
          'page': page,
          'expand_variants': 'true',
        },
        cancelToken: localToken,
      );

      // Stale guard — boshqa qidiruv boshlab qolgan bo'lsa
      if (_activeToken != localToken) return;

      final data = response.data;
      List<dynamic> results;
      bool hasMore;

      if (data is Map && data['results'] is List) {
        results = data['results'] as List;
        hasMore = data['next'] != null;
      } else if (data is List) {
        results = data;
        hasMore = false; // non-paginated response
      } else {
        results = [];
        hasMore = false;
      }

      final newProducts = results
          .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
          .toList();

      final merged = append
          ? <ProductModel>[...state.products, ...newProducts]
          : newProducts;

      emit(state.copyWith(
        products: merged,
        currentPage: page,
        hasMore: hasMore,
        isLoading: false,
        isLoadingMore: false,
        clearError: true,
      ));
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) return;
      emit(state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        error: "Tarmoq xatosi. Qayta urinib ko'ring.",
      ));
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        error: "Xatolik: ${e.toString()}",
      ));
    }
  }

  @override
  Future<void> close() {
    _activeToken?.cancel('bloc closed');
    return super.close();
  }
}
