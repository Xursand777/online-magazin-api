import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
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
  }) async {
    emit(CheckoutLoading());
    try {
      final body = {
        'first_name': name,
        'phone': phone,
        'address': address,
        'payment_method': paymentMethod,
        'items': [
          {
            'product_id': product.id,
            'quantity': 1,
          }
        ]
      };
      
      // Quick order endpoint or fallback to admin POS like logic
      // Assuming ApiConstants.ordersQuick accepts this.
      await apiClient.dio.post(ApiConstants.ordersQuick, data: body);
      emit(CheckoutSuccess());
    } catch (e) {
      emit(CheckoutError("Xatolik yuz berdi. Iltimos qayta urinib ko'ring."));
    }
  }

  Future<void> submitCartCheckout({
    required String name,
    required String phone,
    required String address,
    required String paymentMethod,
  }) async {
    emit(CheckoutLoading());
    try {
      final body = {
        'first_name': name,
        'phone': phone,
        'address': address,
        'payment_method': paymentMethod,
      };
      
      await apiClient.dio.post(ApiConstants.ordersFromCart, data: body);
      emit(CheckoutSuccess());
    } catch (e) {
      emit(CheckoutError("Xatolik yuz berdi. Iltimos qayta urinib ko'ring."));
    }
  }
}
