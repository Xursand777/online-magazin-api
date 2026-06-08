import '../../../../core/models/product_model.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/network/api_response.dart';
import '../models/product_detail_model.dart';

class ProductDetailRepository {
  final ApiClient apiClient;

  ProductDetailRepository({required this.apiClient});

  /// Mahsulot batafsil ma'lumotini variantlari bilan oladi.
  Future<ProductDetailModel> getProductDetail(int id) async {
    final response = await apiClient.dio.get('${ApiConstants.products}$id/');
    return ProductDetailModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// O'xshash mahsulotlar (sayt bilan bir xil — dedup rejimi backend tomonda).
  Future<List<ProductModel>> getSimilarProducts(int id) async {
    try {
      final url = '${ApiConstants.products}$id/similar/';
      final response = await apiClient.dio.get(
        url,
        queryParameters: {'expand_variants': 'true'},
      );
      return ApiResponse.listFrom(response.data)
          .map((j) => ProductModel.fromJson(j))
          .toList();
    } catch (_) {
      return [];
    }
  }
}
