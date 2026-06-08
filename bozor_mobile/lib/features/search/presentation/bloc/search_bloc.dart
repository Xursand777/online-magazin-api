import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/product_model.dart';
import '../../data/repositories/search_repository.dart';
import '../../data/services/recent_searches_service.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract class SearchEvent extends Equatable {
  const SearchEvent();
  @override
  List<Object?> get props => [];
}

/// Foydalanuvchi inputga yozyapti — debounce qilib qidiruv yuboriladi.
class QueryChanged extends SearchEvent {
  final String query;
  const QueryChanged(this.query);
  @override
  List<Object?> get props => [query];
}

/// Inputni tozalaydi va recent searches'ga qaytadi.
class ClearQuery extends SearchEvent {
  const ClearQuery();
}

/// Recent searches ro'yxatini Hive'dan qayta yuklaydi.
class LoadRecentSearches extends SearchEvent {
  const LoadRecentSearches();
}

/// Recent'lar ichidan bittasini o'chirish.
class RemoveRecent extends SearchEvent {
  final String query;
  const RemoveRecent(this.query);
  @override
  List<Object?> get props => [query];
}

/// Hamma recent searches'ni tozalash.
class ClearAllRecent extends SearchEvent {
  const ClearAllRecent();
}

/// Foydalanuvchi natijani tanladi yoki qidiruvni submit qildi —
/// so'rov recent searches'ga saqlanadi.
class CommitSearch extends SearchEvent {
  final String query;
  const CommitSearch(this.query);
  @override
  List<Object?> get props => [query];
}

/// Internal — debounce timer'dan keyin actual qidiruvni boshlash.
class _PerformSearch extends SearchEvent {
  final String query;
  const _PerformSearch(this.query);
  @override
  List<Object?> get props => [query];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

class SearchState extends Equatable {
  /// Hozirgi qidiruv so'rovi (input matn).
  final String query;

  /// Backend'dan kelgan natijalar.
  final List<ProductModel> results;

  /// Yaqinda qidirilgan so'zlar (Hive'dan).
  final List<String> recentSearches;

  /// Qidiruv tarmoqdan kelmoqda (loader ko'rsatish uchun).
  final bool isLoading;

  /// Foydalanuvchi hech bo'lmasa bir marta qidirgan (empty state vs initial).
  final bool hasSearched;

  const SearchState({
    this.query = '',
    this.results = const [],
    this.recentSearches = const [],
    this.isLoading = false,
    this.hasSearched = false,
  });

  /// Inputga bog'liq holatlar:
  bool get isQueryEmpty => query.trim().isEmpty;
  bool get hasResults => results.isNotEmpty;
  bool get isEmpty => !isLoading && hasSearched && results.isEmpty && !isQueryEmpty;

  SearchState copyWith({
    String? query,
    List<ProductModel>? results,
    List<String>? recentSearches,
    bool? isLoading,
    bool? hasSearched,
  }) {
    return SearchState(
      query:          query          ?? this.query,
      results:        results        ?? this.results,
      recentSearches: recentSearches ?? this.recentSearches,
      isLoading:      isLoading      ?? this.isLoading,
      hasSearched:    hasSearched    ?? this.hasSearched,
    );
  }

  @override
  List<Object?> get props =>
      [query, results, recentSearches, isLoading, hasSearched];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════════

/// Search BLoC — professional debouncing + race-condition handling.
///
/// Asosiy fitcherlar:
///   • Debouncing: 300ms — foydalanuvchi yozishni to'xtatgach qidiruv yuboriladi
///     (har bosishda emas — bu network'ni va serverni ortiqcha yuklamaydi).
///   • Stale request bekor qilish: yangi so'rov kelganda, eski natija
///     emitlanmaydi (`query == event.query` tekshiruv).
///   • Repository darajasida ham CancelToken — HTTP layerda ham bekor qiladi.
///
/// Bu Amazon, Wildberries, Google Search kabi katta ilovalardagi yondashuv.
class SearchBloc extends Bloc<SearchEvent, SearchState> {
  final SearchRepository repository;
  final RecentSearchesService recentService;

  Timer? _debounceTimer;

  /// Debounce vaqti — too short → server qiziyub ketadi, too long → UX past.
  /// 300ms — Google va Amazon ham shu qiymatni ishlatadi.
  static const Duration _debounceDuration = Duration(milliseconds: 300);

  SearchBloc({required this.repository, required this.recentService})
      : super(const SearchState()) {
    on<LoadRecentSearches>(_onLoadRecent);
    on<QueryChanged>(_onQueryChanged);
    on<ClearQuery>(_onClearQuery);
    on<RemoveRecent>(_onRemoveRecent);
    on<ClearAllRecent>(_onClearAllRecent);
    on<CommitSearch>(_onCommitSearch);
    on<_PerformSearch>(_onPerformSearch);
  }

  void _onLoadRecent(LoadRecentSearches event, Emitter<SearchState> emit) {
    emit(state.copyWith(recentSearches: recentService.getAll()));
  }

  void _onQueryChanged(QueryChanged event, Emitter<SearchState> emit) {
    final newQuery = event.query;

    // Avval state'ni darhol yangilaymiz — UI input matni doim sinxron
    if (newQuery.trim().isEmpty) {
      _debounceTimer?.cancel();
      emit(state.copyWith(
        query: newQuery,
        results: [],
        isLoading: false,
        hasSearched: false,
      ));
      return;
    }

    // Loader darhol ko'rinsin (foydalanuvchi feedback ko'radi)
    emit(state.copyWith(query: newQuery, isLoading: true));

    // Debounce — oldingi timer'ni bekor qilamiz
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounceDuration, () {
      add(_PerformSearch(newQuery));
    });
  }

  Future<void> _onPerformSearch(
    _PerformSearch event,
    Emitter<SearchState> emit,
  ) async {
    // Stale guard: foydalanuvchi yana boshqa narsa yozgan bo'lsa o'tib yuboramiz
    if (state.query != event.query) return;

    try {
      final results = await repository.search(event.query);
      // Yana stale guard — qidiruv davom etayotganda yangi input bo'lishi mumkin
      if (state.query != event.query) return;
      emit(state.copyWith(
        results: results,
        isLoading: false,
        hasSearched: true,
      ));
    } catch (_) {
      if (state.query != event.query) return;
      emit(state.copyWith(
        results: [],
        isLoading: false,
        hasSearched: true,
      ));
    }
  }

  void _onClearQuery(ClearQuery event, Emitter<SearchState> emit) {
    _debounceTimer?.cancel();
    emit(state.copyWith(
      query: '',
      results: [],
      isLoading: false,
      hasSearched: false,
    ));
  }

  Future<void> _onRemoveRecent(
    RemoveRecent event,
    Emitter<SearchState> emit,
  ) async {
    await recentService.remove(event.query);
    emit(state.copyWith(recentSearches: recentService.getAll()));
  }

  Future<void> _onClearAllRecent(
    ClearAllRecent event,
    Emitter<SearchState> emit,
  ) async {
    await recentService.clear();
    emit(state.copyWith(recentSearches: const []));
  }

  Future<void> _onCommitSearch(
    CommitSearch event,
    Emitter<SearchState> emit,
  ) async {
    await recentService.add(event.query);
    emit(state.copyWith(recentSearches: recentService.getAll()));
  }

  @override
  Future<void> close() {
    _debounceTimer?.cancel();
    return super.close();
  }
}
