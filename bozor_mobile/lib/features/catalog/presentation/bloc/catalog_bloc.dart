import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/category_model.dart';
import '../../../../core/models/product_model.dart';
import '../../data/repositories/catalog_repository.dart';

// --- Events ---
abstract class CatalogEvent extends Equatable {
  const CatalogEvent();
  @override
  List<Object?> get props => [];
}

class LoadCatalogData extends CatalogEvent {}

class SearchProducts extends CatalogEvent {
  final String query;
  const SearchProducts(this.query);
  @override
  List<Object?> get props => [query];
}

class FilterByCategory extends CatalogEvent {
  final int? categoryId;
  const FilterByCategory(this.categoryId);
  @override
  List<Object?> get props => [categoryId];
}

class SortProducts extends CatalogEvent {
  final String sortOption;
  const SortProducts(this.sortOption);
  @override
  List<Object?> get props => [sortOption];
}

// --- States ---
class CatalogState extends Equatable {
  final bool isLoading;
  final List<CategoryModel> categories;
  final List<ProductModel> products;
  final String? searchQuery;
  final int? selectedCategoryId;
  final String? selectedSort;
  final String? error;

  const CatalogState({
    this.isLoading = false,
    this.categories = const [],
    this.products = const [],
    this.searchQuery,
    this.selectedCategoryId,
    this.selectedSort,
    this.error,
  });

  CatalogState copyWith({
    bool? isLoading,
    List<CategoryModel>? categories,
    List<ProductModel>? products,
    String? searchQuery,
    int? selectedCategoryId,
    String? selectedSort,
    String? error,
    bool clearSearch = false,
    bool clearCategory = false,
    bool clearSort = false,
  }) {
    return CatalogState(
      isLoading: isLoading ?? this.isLoading,
      categories: categories ?? this.categories,
      products: products ?? this.products,
      searchQuery: clearSearch ? null : (searchQuery ?? this.searchQuery),
      selectedCategoryId: clearCategory
          ? null
          : (selectedCategoryId ?? this.selectedCategoryId),
      selectedSort: clearSort ? null : (selectedSort ?? this.selectedSort),
      error: error,
    );
  }

  @override
  List<Object?> get props => [
    isLoading,
    categories,
    products,
    searchQuery,
    selectedCategoryId,
    selectedSort,
    error,
  ];
}

// --- Bloc ---
class CatalogBloc extends Bloc<CatalogEvent, CatalogState> {
  final CatalogRepository repository;

  CatalogBloc({required this.repository}) : super(const CatalogState()) {
    on<LoadCatalogData>(_onLoadCatalogData);
    on<SearchProducts>(_onSearchProducts);
    on<FilterByCategory>(_onFilterByCategory);
    on<SortProducts>(_onSortProducts);
  }

  Future<void> _onLoadCatalogData(
    LoadCatalogData event,
    Emitter<CatalogState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      final results = await Future.wait([
        repository.getCategories(),
        repository.getProducts(
          query: state.searchQuery,
          categoryId: state.selectedCategoryId,
          sort: state.selectedSort,
        ),
      ]);
      emit(
        state.copyWith(
          isLoading: false,
          categories: results[0] as List<CategoryModel>,
          products: results[1] as List<ProductModel>,
        ),
      );
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onSearchProducts(
    SearchProducts event,
    Emitter<CatalogState> emit,
  ) async {
    emit(
      state.copyWith(isLoading: true, searchQuery: event.query, error: null),
    );
    try {
      final products = await repository.getProducts(
        query: event.query,
        categoryId: state.selectedCategoryId,
        sort: state.selectedSort,
      );
      emit(state.copyWith(isLoading: false, products: products));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onFilterByCategory(
    FilterByCategory event,
    Emitter<CatalogState> emit,
  ) async {
    emit(
      state.copyWith(
        isLoading: true,
        selectedCategoryId: event.categoryId,
        clearCategory: event.categoryId == null,
        error: null,
      ),
    );
    try {
      final products = await repository.getProducts(
        query: state.searchQuery,
        categoryId: event.categoryId,
        sort: state.selectedSort,
      );
      emit(state.copyWith(isLoading: false, products: products));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> _onSortProducts(
    SortProducts event,
    Emitter<CatalogState> emit,
  ) async {
    emit(
      state.copyWith(
        isLoading: true,
        selectedSort: event.sortOption,
        error: null,
      ),
    );
    try {
      final products = await repository.getProducts(
        query: state.searchQuery,
        categoryId: state.selectedCategoryId,
        sort: event.sortOption,
      );
      emit(state.copyWith(isLoading: false, products: products));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}
