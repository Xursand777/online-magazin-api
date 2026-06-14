/// AdminUsersBloc — saytdagi react-query'ning ekvivalenti, lekin INFINITE
/// SCROLL pattern bilan.
///
/// NIMA UCHUN INFINITE SCROLL (PAGINATION emas)?
/// ──────────────────────────────────────────────────
/// Mobile UX standartlari (Instagram, Telegram, Twitter, WhatsApp):
///   • Foydalanuvchi sahifa raqamini bosish o'rniga shunchaki pastga aylantiradi
///   • "Yana 20 ta yuklash" tugmasi yo'q — tabiiy
///   • Pull-to-refresh boshidan qayta yuklash
///   • Server uchun ham yaxshi: bir vaqtda faqat 20 ta yuklanadi
///
/// SERVER YUKINI MINIMAL TUTISH:
///   • page_size=20 (DRF backend default)
///   • Faqat hasMore=true bo'lganida yangi page so'raladi
///   • Bir vaqtda bitta loadMore so'rovi (isLoadingMore flag)
///   • Search/Filter o'zgarganda page=1'dan boshlanadi (eski sahifalar tashlanadi)
///   • Debounce qidiruv (qidiruv har harfda emas, 400ms kutadi)
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/models/admin_user_model.dart';
import '../../data/repositories/admin_users_repository.dart';

// ─── EVENTS ────────────────────────────────────────────────────────────────

abstract class AdminUsersEvent extends Equatable {
  const AdminUsersEvent();
  @override
  List<Object?> get props => [];
}

/// Birinchi yuklash yoki refresh.
class LoadUsers extends AdminUsersEvent {
  const LoadUsers();
}

/// Pull-to-refresh.
class RefreshUsers extends AdminUsersEvent {
  const RefreshUsers();
}

/// Pastga aylantirib yana 20 ta yuklash.
class LoadMoreUsers extends AdminUsersEvent {
  const LoadMoreUsers();
}

/// Qidiruv matni o'zgardi (debounce bilan).
class SearchUsers extends AdminUsersEvent {
  final String query;
  const SearchUsers(this.query);
  @override
  List<Object?> get props => [query];
}

/// Filter o'zgardi (null=hammasi, true/false=aniq).
class FilterUsers extends AdminUsersEvent {
  final bool? isActive;
  final bool? creditBanned;
  const FilterUsers({this.isActive, this.creditBanned});
  @override
  List<Object?> get props => [isActive, creditBanned];
}

// ─── STATE ─────────────────────────────────────────────────────────────────

enum AdminUsersStatus { initial, loading, loaded, error }

class AdminUsersState extends Equatable {
  final AdminUsersStatus status;
  final List<AdminUser> users;
  final int totalCount;
  final int currentPage;
  final bool hasMore;
  final bool isLoadingMore;
  final bool isRefreshing;
  final String? error;

  // Filter va qidiruv
  final String query;
  final bool? isActiveFilter;
  final bool? creditBannedFilter;

  const AdminUsersState({
    this.status = AdminUsersStatus.initial,
    this.users = const [],
    this.totalCount = 0,
    this.currentPage = 1,
    this.hasMore = true,
    this.isLoadingMore = false,
    this.isRefreshing = false,
    this.error,
    this.query = '',
    this.isActiveFilter,
    this.creditBannedFilter,
  });

  /// Filter biror narsada aktivmi (UI'da badge ko'rsatish uchun).
  bool get hasActiveFilters =>
      isActiveFilter != null || creditBannedFilter != null || query.isNotEmpty;

  AdminUsersState copyWith({
    AdminUsersStatus? status,
    List<AdminUser>? users,
    int? totalCount,
    int? currentPage,
    bool? hasMore,
    bool? isLoadingMore,
    bool? isRefreshing,
    String? error,
    bool clearError = false,
    String? query,
    bool? isActiveFilter,
    bool clearIsActiveFilter = false,
    bool? creditBannedFilter,
    bool clearCreditBannedFilter = false,
  }) {
    return AdminUsersState(
      status: status ?? this.status,
      users: users ?? this.users,
      totalCount: totalCount ?? this.totalCount,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      error: clearError ? null : (error ?? this.error),
      query: query ?? this.query,
      isActiveFilter:
          clearIsActiveFilter ? null : (isActiveFilter ?? this.isActiveFilter),
      creditBannedFilter: clearCreditBannedFilter
          ? null
          : (creditBannedFilter ?? this.creditBannedFilter),
    );
  }

  @override
  List<Object?> get props => [
        status,
        users.length,
        totalCount,
        currentPage,
        hasMore,
        isLoadingMore,
        isRefreshing,
        error,
        query,
        isActiveFilter,
        creditBannedFilter,
      ];
}

// ─── BLOC ──────────────────────────────────────────────────────────────────

class AdminUsersBloc extends Bloc<AdminUsersEvent, AdminUsersState> {
  final AdminUsersRepository repository;

  Timer? _searchDebounce;

  AdminUsersBloc({required this.repository}) : super(const AdminUsersState()) {
    on<LoadUsers>(_onLoad);
    on<RefreshUsers>(_onRefresh);
    on<LoadMoreUsers>(_onLoadMore);
    on<SearchUsers>(_onSearch);
    on<FilterUsers>(_onFilter);
  }

  @override
  Future<void> close() {
    _searchDebounce?.cancel();
    return super.close();
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  Future<void> _onLoad(LoadUsers event, Emitter<AdminUsersState> emit) async {
    emit(state.copyWith(status: AdminUsersStatus.loading, clearError: true));
    try {
      final result = await repository.getUsersPage(
        page: 1,
        query: state.query,
        isActive: state.isActiveFilter,
        creditBanned: state.creditBannedFilter,
      );
      emit(state.copyWith(
        status: AdminUsersStatus.loaded,
        users: result.users,
        totalCount: result.totalCount,
        currentPage: 1,
        hasMore: result.hasNext,
        clearError: true,
      ));
    } catch (e) {
      emit(state.copyWith(
        status: AdminUsersStatus.error,
        error: repository.parseError(e),
      ));
    }
  }

  Future<void> _onRefresh(
    RefreshUsers event,
    Emitter<AdminUsersState> emit,
  ) async {
    emit(state.copyWith(isRefreshing: true, clearError: true));
    try {
      final result = await repository.getUsersPage(
        page: 1,
        query: state.query,
        isActive: state.isActiveFilter,
        creditBanned: state.creditBannedFilter,
      );
      emit(state.copyWith(
        status: AdminUsersStatus.loaded,
        users: result.users,
        totalCount: result.totalCount,
        currentPage: 1,
        hasMore: result.hasNext,
        isRefreshing: false,
        clearError: true,
      ));
    } catch (e) {
      emit(state.copyWith(
        isRefreshing: false,
        error: repository.parseError(e),
      ));
    }
  }

  Future<void> _onLoadMore(
    LoadMoreUsers event,
    Emitter<AdminUsersState> emit,
  ) async {
    // Ortiqcha so'rov yubormaslik — guard
    if (state.isLoadingMore || !state.hasMore) return;
    if (state.status != AdminUsersStatus.loaded) return;

    emit(state.copyWith(isLoadingMore: true));
    try {
      final nextPage = state.currentPage + 1;
      final result = await repository.getUsersPage(
        page: nextPage,
        query: state.query,
        isActive: state.isActiveFilter,
        creditBanned: state.creditBannedFilter,
      );
      emit(state.copyWith(
        users: [...state.users, ...result.users],
        currentPage: nextPage,
        hasMore: result.hasNext,
        isLoadingMore: false,
      ));
    } catch (e) {
      emit(state.copyWith(
        isLoadingMore: false,
        error: repository.parseError(e),
      ));
    }
  }

  void _onSearch(SearchUsers event, Emitter<AdminUsersState> emit) {
    // Qidiruv state'ini darhol yangilab, debounce orqali API'ga so'rov yuboramiz.
    // Bu foydalanuvchi har harfda API spam qilmasligi uchun.
    emit(state.copyWith(query: event.query, clearError: true));
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      add(const LoadUsers());
    });
  }

  void _onFilter(FilterUsers event, Emitter<AdminUsersState> emit) {
    emit(state.copyWith(
      isActiveFilter: event.isActive,
      clearIsActiveFilter: event.isActive == null,
      creditBannedFilter: event.creditBanned,
      clearCreditBannedFilter: event.creditBanned == null,
      clearError: true,
    ));
    add(const LoadUsers());
  }
}
