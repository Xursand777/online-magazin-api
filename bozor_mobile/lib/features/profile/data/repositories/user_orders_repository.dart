import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/user_order_model.dart';

class UserOrdersRepository {
  final ApiClient apiClient;

  UserOrdersRepository({required this.apiClient});

  /// Get list of orders for the authenticated user
  Future<UserOrderPage> getUserOrders({int page = 1}) async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.orders,
        queryParameters: {'page': page},
      );
      return UserOrderPage.fromJson(response.data);
    } catch (e) {
      rethrow;
    }
  }

  /// Cancel an order as a customer
  Future<void> cancelOrder(int orderId, String reason) async {
    try {
      await apiClient.dio.post(
        '${ApiConstants.orders}$orderId/cancel/',
        data: {'cancellation_reason': reason},
      );
    } catch (e) {
      rethrow;
    }
  }
}
