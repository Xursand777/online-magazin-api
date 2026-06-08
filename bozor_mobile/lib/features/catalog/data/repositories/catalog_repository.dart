import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/network/api_response.dart';
import '../../../../core/models/category_model.dart';
import '../../../../core/models/product_model.dart';

class CatalogRepository {
  final ApiClient apiClient;

  CatalogRepository({required this.apiClient});

  Future<List<CategoryModel>> getCategories() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.categories);
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => CategoryModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<List<ProductModel>> getProducts({
    String? query,
    int? categoryId,
    String? sort,
  }) async {
    try {
      final endpoint = query != null && query.isNotEmpty
          ? ApiConstants.searchProducts
          : ApiConstants.products;
      final queryParameters = <String, Object?>{
        if (query != null && query.isNotEmpty) 'q': query,
        // Variant expansion — har variant alohida karta (sayt bilan bir xil)
        'expand_variants': 'true',
      };
      if (categoryId != null) {
        queryParameters['category'] = categoryId;
      }
      if (sort != null) {
        queryParameters['sort'] = sort;
      }
      final response = await apiClient.dio.get(
        endpoint,
        queryParameters: queryParameters,
      );
      return ApiResponse.listFrom(
        response.data,
      ).map((json) => ProductModel.fromJson(json)).toList();
    } catch (e) {
      return [];
    }
  }
}
