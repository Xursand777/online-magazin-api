import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/network/api_response.dart';
import '../../../../core/models/banner_model.dart';
import '../../../../core/models/category_model.dart';
import '../../../../core/models/product_model.dart';

class HomeRepository {
  final ApiClient apiClient;

  HomeRepository({required this.apiClient});

  Future<List<BannerModel>> getBanners() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.banners);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => BannerModel.fromJson(json)).toList();
    } catch (e) {
      // Return empty list on failure or rethrow depending on requirements
      return [];
    }
  }

  Future<List<CategoryModel>> getPopularCategories() async {
    try {
      // Example endpoint, replace if TZ specifically needs something else for home chips
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
