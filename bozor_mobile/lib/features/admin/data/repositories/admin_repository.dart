import 'package:dio/dio.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/admin_product_model.dart';
import '../models/admin_dashboard_model.dart';
import '../models/admin_order_model.dart';
import '../models/pos_model.dart';

class AdminRepository {
  final ApiClient apiClient;

  AdminRepository({required this.apiClient});

  /// DioException'dan o'qish mumkin bo'lgan xato xabarini ajratadi.
  static String parseError(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final msg = data['error'] ?? data['detail'] ?? data['message'];
        if (msg != null) return msg.toString();
      }
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return "Serverga ulanib bo'lmadi. Internetni tekshiring.";
      }
    }
    return e.toString().replaceFirst('Exception: ', '');
  }

  // ─── Products ────────────────────────────────────────────────────────────────

  Future<List<AdminProductModel>> getProducts() async {
    final response = await apiClient.dio.get(ApiConstants.adminProducts);
    final data = response.data;
    final list = data is List ? data : (data['results'] as List? ?? []);
    return list.map((j) => AdminProductModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<AdminProductModel> createProduct(FormData formData) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminProducts,
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminProductModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminProductModel> updateProduct(int id, FormData formData) async {
    final response = await apiClient.dio.patch(
      '${ApiConstants.adminProducts}$id/',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminProductModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteProduct(int id) async {
    await apiClient.dio.delete('${ApiConstants.adminProducts}$id/');
  }

  // ─── Categories ──────────────────────────────────────────────────────────────

  Future<List<AdminCategoryModel>> getCategories() async {
    final response = await apiClient.dio.get(ApiConstants.adminCategories);
    final data = response.data;
    final list = data is List ? data : (data['results'] as List? ?? []);
    return list.map((j) => AdminCategoryModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<AdminCategoryModel> createCategory(Map<String, dynamic> body) async {
    final response = await apiClient.dio.post(ApiConstants.adminCategories, data: body);
    return AdminCategoryModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminCategoryModel> updateCategory(int id, Map<String, dynamic> body) async {
    final response = await apiClient.dio.patch(
      '${ApiConstants.adminCategories}$id/',
      data: body,
    );
    return AdminCategoryModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteCategory(int id) async {
    await apiClient.dio.delete('${ApiConstants.adminCategories}$id/');
  }

  // ─── Banners ─────────────────────────────────────────────────────────────────

  Future<List<AdminBannerModel>> getBanners() async {
    final response = await apiClient.dio.get(ApiConstants.adminBanners);
    final data = response.data;
    final list = data is List ? data : (data['results'] as List? ?? []);
    return list.map((j) => AdminBannerModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<AdminBannerModel> createBanner(FormData formData) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminBanners,
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminBannerModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminBannerModel> updateBanner(int id, FormData formData) async {
    final response = await apiClient.dio.patch(
      '${ApiConstants.adminBanners}$id/',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminBannerModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteBanner(int id) async {
    await apiClient.dio.delete('${ApiConstants.adminBanners}$id/');
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  Future<DashboardData> getDashboard() async {
    final response = await apiClient.dio.get(ApiConstants.adminDashboard);
    return DashboardData.fromJson(response.data as Map<String, dynamic>);
  }

  // ─── Buyurtmalar ────────────────────────────────────────────────────────────
  Future<AdminOrderPage> getOrders({
    String? q,
    String? status,
    String? dateFrom,
    String? dateTo,
    String? paymentMethod,
    String? isCredit,
    int page = 1,
  }) async {
    final params = <String, dynamic>{'page': page};
    if (q != null && q.isNotEmpty) params['q'] = q;
    if (status != null && status.isNotEmpty) params['status'] = status;
    if (dateFrom != null && dateFrom.isNotEmpty) params['date_from'] = dateFrom;
    if (dateTo != null && dateTo.isNotEmpty) params['date_to'] = dateTo;
    if (paymentMethod != null && paymentMethod.isNotEmpty) {
      params['payment_method'] = paymentMethod;
    }
    if (isCredit != null && isCredit.isNotEmpty) params['is_credit'] = isCredit;

    final response =
        await apiClient.dio.get(ApiConstants.adminOrders, queryParameters: params);
    return AdminOrderPage.fromJson(response.data);
  }

  Future<AdminOrder> updateOrderStatus(
    int id, {
    required String status,
    String note = '',
  }) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminOrderStatus(id),
      data: {'status': status, 'note': note},
    );
    return AdminOrder.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminOrder> payCreditOrder(int id) async {
    final response = await apiClient.dio.post(ApiConstants.adminPayCredit(id));
    return AdminOrder.fromJson(response.data as Map<String, dynamic>);
  }

  // ─── POS (Do'kon) ─────────────────────────────────────────────────────────
  Future<List<PosProduct>> getPosProducts() async {
    final response = await apiClient.dio.get(
      ApiConstants.adminProducts,
      queryParameters: {'limit': 1000, 'page_size': 1000},
    );
    final data = response.data;
    final list = data is List ? data : (data['results'] as List? ?? []);
    return list
        .map((j) => PosProduct.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  /// Telefon raqam bo'yicha mijozni qidiradi. Topilmasa `null` qaytaradi.
  Future<PosCustomer?> searchUser(String phone) async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.adminUserSearch,
        queryParameters: {'phone': phone},
      );
      return PosCustomer.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<AdminOrder> createPosOrder({
    required String phone,
    required String firstName,
    required String lastName,
    required String paymentMethod,
    int? creditDays,
    required List<PosCartItem> items,
  }) async {
    final body = <String, dynamic>{
      'phone': phone,
      'first_name': firstName,
      'last_name': lastName,
      'payment_method': paymentMethod,
      'items': items
          .map((i) => {
                'product_id': i.productId,
                if (i.variantId != null) 'variant_id': i.variantId,
                'quantity': i.quantity,
              })
          .toList(),
    };
    if (paymentMethod == 'credit' && creditDays != null) {
      body['credit_days'] = creditDays;
    }
    final response =
        await apiClient.dio.post(ApiConstants.adminPosOrder, data: body);
    return AdminOrder.fromJson(response.data as Map<String, dynamic>);
  }

  Future<CustomerHistory> getCustomerHistory(String phone) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminCustomerHistory,
      queryParameters: {'phone': phone},
    );
    return CustomerHistory.fromJson(response.data as Map<String, dynamic>);
  }
}
