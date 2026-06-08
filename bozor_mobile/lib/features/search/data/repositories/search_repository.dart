import 'package:dio/dio.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/network/api_response.dart';

/// Qidiruv repository — backend `/api/search/products/` endpointi bilan ishlaydi.
///
/// Backend (ProductSearchView):
///   • PostgreSQL'da SearchVector + SearchRank (Full-Text Search)
///   • SQLite'da optimallashtirilgan `icontains` + AND mantig'i
///   • Maksimal 50 ta natija (page-less, dropdown uchun)
///   • Tartiblash: relevantlik → discount → updated_at
class SearchRepository {
  final ApiClient apiClient;

  /// Ayni damdagi qidiruv so'rovini bekor qilish uchun token.
  /// Foydalanuvchi tez yozayotganda, eski so'rovlarni bekor qilamiz —
  /// faqat oxirgi so'rov natijasi muhim.
  CancelToken? _activeToken;

  SearchRepository({required this.apiClient});

  /// Mahsulotlarni qidiradi va ProductModel ro'yxati qaytaradi.
  ///
  /// `track=true` — backend foydalanuvchining qidiruv tarixini yozadi
  /// (personalized recommendations uchun).
  ///
  /// Avvalgi tugamagan so'rov bo'lsa, u BEKOR qilinadi — race condition'siz.
  Future<List<ProductModel>> search(String query, {bool track = false}) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return [];

    // Avvalgi so'rovni bekor qilamiz (CancelledException sukut bilan o'tadi)
    _activeToken?.cancel('newer request');
    final token = CancelToken();
    _activeToken = token;

    try {
      final response = await apiClient.dio.get(
        ApiConstants.searchProducts,
        queryParameters: {
          'q': trimmed,
          if (track) 'track': 'true',
        },
        cancelToken: token,
      );
      // Aktiv token boshqa bo'lib qolgan bo'lsa, natijani tashlaymiz
      if (_activeToken != token) return [];
      return ApiResponse.listFrom(response.data)
          .map((j) => ProductModel.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      // Bekor qilingan so'rovlar — silent
      if (CancelToken.isCancel(e)) return [];
      // Boshqa xatolar — bo'sh ro'yxat (UI'da retry/empty)
      return [];
    } catch (_) {
      return [];
    } finally {
      if (_activeToken == token) {
        _activeToken = null;
      }
    }
  }
}
