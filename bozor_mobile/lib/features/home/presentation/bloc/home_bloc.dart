import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
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

class LoadHomeData extends HomeEvent {}

// --- States ---
class HomeState extends Equatable {
  final bool isLoading;
  final List<BannerModel> banners;
  final List<CategoryModel> categories;
  final List<ProductModel> recommended;
  final List<ProductModel> discounted;
  final List<ProductModel> newProducts;
  final List<ProductModel> popularProducts;
  final String? error;

  const HomeState({
    this.isLoading = false,
    this.banners = const [],
    this.categories = const [],
    this.recommended = const [],
    this.discounted = const [],
    this.newProducts = const [],
    this.popularProducts = const [],
    this.error,
  });

  HomeState copyWith({
    bool? isLoading,
    List<BannerModel>? banners,
    List<CategoryModel>? categories,
    List<ProductModel>? recommended,
    List<ProductModel>? discounted,
    List<ProductModel>? newProducts,
    List<ProductModel>? popularProducts,
    String? error,
  }) {
    return HomeState(
      isLoading: isLoading ?? this.isLoading,
      banners: banners ?? this.banners,
      categories: categories ?? this.categories,
      recommended: recommended ?? this.recommended,
      discounted: discounted ?? this.discounted,
      newProducts: newProducts ?? this.newProducts,
      popularProducts: popularProducts ?? this.popularProducts,
      error: error, // overwrite error explicitly
    );
  }

  @override
  List<Object?> get props => [
    isLoading,
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
class HomeBloc extends Bloc<HomeEvent, HomeState> {
  final HomeRepository repository;

  HomeBloc({required this.repository}) : super(const HomeState()) {
    on<LoadHomeData>(_onLoadHomeData);
  }

  Future<void> _onLoadHomeData(
    LoadHomeData event,
    Emitter<HomeState> emit,
  ) async {
    emit(state.copyWith(isLoading: true, error: null));
    try {
      // Run API calls in parallel for better performance
      final results = await Future.wait([
        repository.getBanners(),
        repository.getPopularCategories(),
        repository.getRecommendedProducts(),
        repository.getDiscountedProducts(),
        repository.getNewProducts(),
        repository.getPopularProducts(),
      ]);

      emit(
        state.copyWith(
          isLoading: false,
          banners: results[0] as List<BannerModel>,
          categories: results[1] as List<CategoryModel>,
          recommended: results[2] as List<ProductModel>,
          discounted: results[3] as List<ProductModel>,
          newProducts: results[4] as List<ProductModel>,
          popularProducts: results[5] as List<ProductModel>,
        ),
      );
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}
