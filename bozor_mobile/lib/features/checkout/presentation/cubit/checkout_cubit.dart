import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:dio/dio.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/models/product_model.dart';

abstract class CheckoutState extends Equatable {
  const CheckoutState();
  @override
  List<Object?> get props => [];
}

class CheckoutInitial extends CheckoutState {}
class CheckoutLoading extends CheckoutState {}
class CheckoutSuccess extends CheckoutState {}
class CheckoutError extends CheckoutState {
  final String message;
  const CheckoutError(this.message);
  @override
  List<Object?> get props => [message];
}

class CheckoutCubit extends Cubit<CheckoutState> {
  final ApiClient apiClient;

  CheckoutCubit({required this.apiClient}) : super(CheckoutInitial());

  Future<void> submitQuickBuy({
    required ProductModel product,
    required String name,
    required String phone,
    required String address,
    required String paymentMethod,
    int? creditDays,
  }) async {
    emit(CheckoutLoading());
    try {
      final cleanPhone = phone.replaceAll(RegExp(r'\s+'), '');
      final body = {
        'product_id': product.id,
        'quantity': 1,
        'receiver_name': name.trim(),
        'receiver_phone': cleanPhone,
        'delivery_address': address.trim(),
        'payment_method': paymentMethod == 'installment' ? 'credit' : paymentMethod,
      };
      if (paymentMethod == 'installment' && creditDays != null) {
        body['credit_days'] = creditDays;
      }
      
      await apiClient.dio.post(ApiConstants.ordersQuick, data: body);
      emit(CheckoutSuccess());
    } catch (e) {
      emit(CheckoutError(_getErrorMessage(e)));
    }
  }

  Future<void> submitCartCheckout({
    required String name,
    required String phone,
    required String address,
    required String paymentMethod,
    int? creditDays,
  }) async {
    emit(CheckoutLoading());
    try {
      final cleanPhone = phone.replaceAll(RegExp(r'\s+'), '');
      final body = <String, dynamic>{
        'receiver_name': name.trim(),
        'receiver_phone': cleanPhone,
        'delivery_address': address.trim(),
        'payment_method': paymentMethod == 'installment' ? 'credit' : paymentMethod,
      };
      if (paymentMethod == 'installment' && creditDays != null) {
        body['credit_days'] = creditDays;
      }
      
      await apiClient.dio.post(ApiConstants.ordersFromCart, data: body);
      emit(CheckoutSuccess());
    } catch (e) {
      emit(CheckoutError(_getErrorMessage(e)));
    }
  }

  String _getErrorMessage(dynamic e) {
    try {
      if (e is DioException && e.response != null) {
        final data = e.response?.data;
        if (data is Map) {
          if (data['error'] != null) {
            return data['error'].toString();
          }
          final firstValue = data.values.first;
          if (firstValue is List && firstValue.isNotEmpty) {
            return firstValue.first.toString();
          }
          return firstValue.toString();
        }
      }
    } catch (_) {}
    return "Xatolik yuz berdi. Iltimos qayta urinib ko'ring.";
  }
}
