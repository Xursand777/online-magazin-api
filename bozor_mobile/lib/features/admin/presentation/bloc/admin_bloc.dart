import 'dart:async';
import 'dart:io';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../data/models/admin_product_model.dart';
import '../../data/models/product_submission.dart';
import '../../data/offline_product_queue.dart';
import '../../data/repositories/admin_repository.dart';

// ─── Events ──────────────────────────────────────────────────────────────────

abstract class AdminEvent extends Equatable {
  const AdminEvent();
  @override
  List<Object?> get props => [];
}

class LoadAdminData extends AdminEvent {}

class LoadMoreAdminProducts extends AdminEvent {}

class SearchAdminProducts extends AdminEvent {
  final String query;
  const SearchAdminProducts(this.query);
  @override
  List<Object?> get props => [query];
}

/// Logout vaqtida bloc holatini boshlang'ich ko'rinishga qaytaradi.
/// Bu BLoC singleton — eski admin ma'lumotlari yangi sessiyada chiqib qolmasligi kerak.
class ResetAdminData extends AdminEvent {
  const ResetAdminData();
  @override
  List<Object?> get props => [];
}

class DeleteAdminProduct extends AdminEvent {
  final int id;
  const DeleteAdminProduct(this.id);
  @override
  List<Object?> get props => [id];
}

class CreateAdminProduct extends AdminEvent {
  // #12: FormData o'rniga serializatsiyalanadigan submission — tarmoq uzilsa
  // navbatga (offline queue) qo'yib bo'lishi uchun.
  final ProductSubmission submission;
  const CreateAdminProduct(this.submission);
  @override
  List<Object?> get props => [submission.localId];
}

class UpdateAdminProduct extends AdminEvent {
  final ProductSubmission submission;
  const UpdateAdminProduct(this.submission);
  @override
  List<Object?> get props => [submission.localId];
}

/// #12: offline navbatni bo'shatishga urinish (internet tiklanganda / panel
/// ochilganda / qo'lda "Hozir yuborish" bosilganda).
class SyncOfflineQueue extends AdminEvent {
  const SyncOfflineQueue();
}

class DeleteAdminCategory extends AdminEvent {
  final int id;
  const DeleteAdminCategory(this.id);
  @override
  List<Object?> get props => [id];
}

class CreateAdminCategory extends AdminEvent {
  final dynamic body;
  const CreateAdminCategory(this.body);
  @override
  List<Object?> get props => [body];
}

class UpdateAdminCategory extends AdminEvent {
  final int id;
  final dynamic body;
  const UpdateAdminCategory(this.id, this.body);
  @override
  List<Object?> get props => [id, body];
}

class DeleteAdminBanner extends AdminEvent {
  final int id;
  const DeleteAdminBanner(this.id);
  @override
  List<Object?> get props => [id];
}

class CreateAdminBanner extends AdminEvent {
  final FormData formData;
  const CreateAdminBanner(this.formData);
  @override
  List<Object?> get props => [formData];
}

class UpdateAdminBanner extends AdminEvent {
  final int id;
  final FormData formData;
  const UpdateAdminBanner(this.id, this.formData);
  @override
  List<Object?> get props => [id, formData];
}

// ─── State ───────────────────────────────────────────────────────────────────

class AdminState extends Equatable {
  final List<AdminProductModel> products;
  final bool hasReachedMaxProducts;
  final int productsPage;
  final String productsQuery;
  final List<AdminCategoryModel> categories;
  final List<AdminBannerModel> banners;
  final bool isLoading;
  final bool isActionLoading;
  final bool isFetchingMore;
  final String? error;
  final String? successMessage;
  // #12: internetni kutayotgan (yuborilmagan) mahsulotlar soni.
  final int pendingSyncCount;

  const AdminState({
    this.products = const [],
    this.hasReachedMaxProducts = false,
    this.productsPage = 1,
    this.productsQuery = '',
    this.categories = const [],
    this.banners = const [],
    this.isLoading = false,
    this.isActionLoading = false,
    this.isFetchingMore = false,
    this.error,
    this.successMessage,
    this.pendingSyncCount = 0,
  });

  AdminState copyWith({
    List<AdminProductModel>? products,
    bool? hasReachedMaxProducts,
    int? productsPage,
    String? productsQuery,
    List<AdminCategoryModel>? categories,
    List<AdminBannerModel>? banners,
    bool? isLoading,
    bool? isActionLoading,
    bool? isFetchingMore,
    String? error,
    String? successMessage,
    int? pendingSyncCount,
    bool clearError = false,
    bool clearSuccess = false,
  }) {
    return AdminState(
      products: products ?? this.products,
      hasReachedMaxProducts:
          hasReachedMaxProducts ?? this.hasReachedMaxProducts,
      productsPage: productsPage ?? this.productsPage,
      productsQuery: productsQuery ?? this.productsQuery,
      categories: categories ?? this.categories,
      banners: banners ?? this.banners,
      isLoading: isLoading ?? this.isLoading,
      isActionLoading: isActionLoading ?? this.isActionLoading,
      isFetchingMore: isFetchingMore ?? this.isFetchingMore,
      error: clearError ? null : (error ?? this.error),
      successMessage: clearSuccess
          ? null
          : (successMessage ?? this.successMessage),
      pendingSyncCount: pendingSyncCount ?? this.pendingSyncCount,
    );
  }

  @override
  List<Object?> get props => [
    products,
    hasReachedMaxProducts,
    productsPage,
    productsQuery,
    categories,
    banners,
    isLoading,
    isActionLoading,
    isFetchingMore,
    error,
    successMessage,
    pendingSyncCount,
  ];
}

// ─── BLoC ────────────────────────────────────────────────────────────────────

class AdminBloc extends Bloc<AdminEvent, AdminState> {
  final AdminRepository repository;

  // #12: offline navbat + tarmoq holatini kuzatuvchi.
  final OfflineProductQueue _offlineQueue = OfflineProductQueue();
  StreamSubscription<List<ConnectivityResult>>? _connSub;
  bool _isSyncing = false; // bir vaqtning o'zida bitta bo'shatish

  AdminBloc({required this.repository}) : super(const AdminState()) {
    on<LoadAdminData>(_onLoad);
    on<ResetAdminData>(_onReset);
    on<DeleteAdminProduct>(_onDeleteProduct);
    on<CreateAdminProduct>(_onCreateProduct);
    on<UpdateAdminProduct>(_onUpdateProduct);
    on<SyncOfflineQueue>(_onSyncOfflineQueue);
    on<DeleteAdminCategory>(_onDeleteCategory);
    on<CreateAdminCategory>(_onCreateCategory);
    on<UpdateAdminCategory>(_onUpdateCategory);
    on<DeleteAdminBanner>(_onDeleteBanner);
    on<CreateAdminBanner>(_onCreateBanner);
    on<UpdateAdminBanner>(_onUpdateBanner);
    on<SearchAdminProducts>(_onSearchAdminProducts);
    on<LoadMoreAdminProducts>(_onLoadMoreAdminProducts);

    // #12: internet tiklanganda navbatni avtomatik bo'shatamiz.
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) add(const SyncOfflineQueue());
    });
  }

  @override
  Future<void> close() {
    _connSub?.cancel();
    return super.close();
  }

  void _onReset(ResetAdminData event, Emitter<AdminState> emit) {
    emit(const AdminState());
  }

  Future<void> _onLoad(LoadAdminData event, Emitter<AdminState> emit) async {
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final productsResult = await repository.getProducts(
        page: 1,
        query: state.productsQuery,
      );
      final categories = await repository.getCategories();
      final banners = await repository.getBanners();
      emit(
        state.copyWith(
          products: productsResult.items,
          hasReachedMaxProducts: productsResult.hasReachedMax,
          productsPage: 1,
          categories: categories,
          banners: banners,
          isLoading: false,
          pendingSyncCount: await _offlineQueue.count(),
        ),
      );
      // #12: panel ochilganda navbatda turgan mahsulotlarni yuborishga urinamiz.
      add(const SyncOfflineQueue());
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onSearchAdminProducts(
    SearchAdminProducts event,
    Emitter<AdminState> emit,
  ) async {
    emit(
      state.copyWith(
        isLoading: true,
        productsQuery: event.query,
        clearError: true,
      ),
    );
    try {
      final productsResult = await repository.getProducts(
        page: 1,
        query: event.query,
      );
      emit(
        state.copyWith(
          products: productsResult.items,
          hasReachedMaxProducts: productsResult.hasReachedMax,
          productsPage: 1,
          isLoading: false,
        ),
      );
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onLoadMoreAdminProducts(
    LoadMoreAdminProducts event,
    Emitter<AdminState> emit,
  ) async {
    if (state.hasReachedMaxProducts || state.isFetchingMore) return;

    emit(state.copyWith(isFetchingMore: true));
    try {
      final nextPage = state.productsPage + 1;
      final productsResult = await repository.getProducts(
        page: nextPage,
        query: state.productsQuery,
      );
      emit(
        state.copyWith(
          products: [...state.products, ...productsResult.items],
          hasReachedMaxProducts: productsResult.hasReachedMax,
          productsPage: nextPage,
          isFetchingMore: false,
        ),
      );
    } catch (e) {
      emit(state.copyWith(isFetchingMore: false));
    }
  }

  Future<void> _onDeleteProduct(
    DeleteAdminProduct event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      await repository.deleteProduct(event.id);
      final updated = state.products.where((p) => p.id != event.id).toList();
      emit(
        state.copyWith(
          products: updated,
          isActionLoading: false,
          successMessage: "Mahsulot o'chirildi",
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: e.toString()));
    }
  }

  Future<void> _onCreateProduct(
    CreateAdminProduct event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      final product = await repository.createProduct(
        event.submission.toFormData(),
      );
      emit(
        state.copyWith(
          products: [product, ...state.products],
          isActionLoading: false,
          successMessage: 'Mahsulot qo\'shildi',
        ),
      );
    } on DioException catch (e) {
      // #12: tarmoq uzilgan bo'lsa — yo'qotmaymiz, navbatga qo'yamiz.
      if (_isNetworkError(e)) {
        await _offlineQueue.enqueue(event.submission);
        emit(
          state.copyWith(
            isActionLoading: false,
            pendingSyncCount: await _offlineQueue.count(),
            successMessage:
                "Internet yo'q — mahsulot navbatga qo'yildi, ulanish tiklanganda yuboriladi.",
          ),
        );
      } else {
        emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
      }
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
    }
  }

  Future<void> _onUpdateProduct(
    UpdateAdminProduct event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    final id = event.submission.productId;
    try {
      final updated = await repository.updateProduct(
        id!,
        event.submission.toFormData(),
      );
      final list = state.products.map((p) => p.id == id ? updated : p).toList();
      emit(
        state.copyWith(
          products: list,
          isActionLoading: false,
          successMessage: 'Mahsulot yangilandi',
        ),
      );
    } on DioException catch (e) {
      if (_isNetworkError(e)) {
        await _offlineQueue.enqueue(event.submission);
        emit(
          state.copyWith(
            isActionLoading: false,
            pendingSyncCount: await _offlineQueue.count(),
            successMessage:
                "Internet yo'q — o'zgarish navbatga qo'yildi, ulanish tiklanganda yuboriladi.",
          ),
        );
      } else {
        emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
      }
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
    }
  }

  // #12: navbatdagi (offline) mahsulotlarni ketma-ket yuborishga urinadi.
  Future<void> _onSyncOfflineQueue(
    SyncOfflineQueue event,
    Emitter<AdminState> emit,
  ) async {
    if (_isSyncing) return;
    _isSyncing = true;
    try {
      final pending = await _offlineQueue.all();
      if (pending.isEmpty) {
        if (state.pendingSyncCount != 0) {
          emit(state.copyWith(pendingSyncCount: 0));
        }
        return;
      }
      var products = state.products;
      var sent = 0;
      for (final sub in pending) {
        try {
          if (sub.isUpdate && sub.productId != null) {
            final updated = await repository.updateProduct(
              sub.productId!,
              sub.toFormData(),
            );
            products = products
                .map((p) => p.id == sub.productId ? updated : p)
                .toList();
          } else {
            final created = await repository.createProduct(sub.toFormData());
            products = [created, ...products];
          }
          await _offlineQueue.remove(sub.localId);
          sent++;
        } on DioException catch (e) {
          if (_isNetworkError(e)) {
            break; // hali ham offline — qolganini keyinroq yuboramiz
          }
          // server rad etdi (masalan validatsiya) — qayta urinish foydasiz,
          // navbatni bloklamasligi uchun olib tashlaymiz.
          await _offlineQueue.remove(sub.localId);
        } catch (_) {
          await _offlineQueue.remove(sub.localId);
        }
      }
      emit(
        state.copyWith(
          products: products,
          pendingSyncCount: await _offlineQueue.count(),
          successMessage: sent > 0
              ? "$sent ta navbatdagi mahsulot yuborildi."
              : null,
        ),
      );
    } finally {
      _isSyncing = false;
    }
  }

  bool _isNetworkError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      case DioExceptionType.unknown:
        return e.error is SocketException;
      default:
        return false;
    }
  }

  Future<void> _onDeleteCategory(
    DeleteAdminCategory event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      await repository.deleteCategory(event.id);
      final updated = state.categories.where((c) => c.id != event.id).toList();
      emit(
        state.copyWith(
          categories: updated,
          isActionLoading: false,
          successMessage: "Kategoriya o'chirildi",
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: e.toString()));
    }
  }

  Future<void> _onCreateCategory(
    CreateAdminCategory event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      final cat = await repository.createCategory(event.body);
      emit(
        state.copyWith(
          categories: [cat, ...state.categories],
          isActionLoading: false,
          successMessage: 'Kategoriya qo\'shildi',
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
    }
  }

  Future<void> _onUpdateCategory(
    UpdateAdminCategory event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      final updated = await repository.updateCategory(event.id, event.body);
      final list = state.categories
          .map((c) => c.id == event.id ? updated : c)
          .toList();
      emit(
        state.copyWith(
          categories: list,
          isActionLoading: false,
          successMessage: 'Kategoriya yangilandi',
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
    }
  }

  Future<void> _onDeleteBanner(
    DeleteAdminBanner event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      await repository.deleteBanner(event.id);
      final updated = state.banners.where((b) => b.id != event.id).toList();
      emit(
        state.copyWith(
          banners: updated,
          isActionLoading: false,
          successMessage: "Banner o'chirildi",
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: e.toString()));
    }
  }

  Future<void> _onCreateBanner(
    CreateAdminBanner event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      final banner = await repository.createBanner(event.formData);
      emit(
        state.copyWith(
          banners: [...state.banners, banner],
          isActionLoading: false,
          successMessage: 'Banner qo\'shildi',
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
    }
  }

  Future<void> _onUpdateBanner(
    UpdateAdminBanner event,
    Emitter<AdminState> emit,
  ) async {
    emit(state.copyWith(isActionLoading: true, clearError: true));
    try {
      final updated = await repository.updateBanner(event.id, event.formData);
      final list = state.banners
          .map((b) => b.id == event.id ? updated : b)
          .toList();
      emit(
        state.copyWith(
          banners: list,
          isActionLoading: false,
          successMessage: 'Banner yangilandi',
        ),
      );
    } catch (e) {
      emit(state.copyWith(isActionLoading: false, error: _parseError(e)));
    }
  }

  String _parseError(Object e) {
    return e.toString().replaceFirst('Exception: ', '');
  }
}
