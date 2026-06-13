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
  /// Backend error code — `master_required`, `credit_ban`, va boshqalar.
  /// UI ga qarab maxsus xulq-atvor qabul qilish uchun (autoreset, dialog).
  final String? code;
  const CheckoutError(this.message, {this.code});
  @override
  List<Object?> get props => [message, code];

  /// Mehmon usta emas, lekin somehow 'credit' yuborilgan — UI 'cash'ga reset
  /// qilishi kerak va foydalanuvchini xabardor qilishi kerak.
  bool get isMasterRequired => code == 'master_required';
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
    // Phase 3.1 — kuryer navigatsiyasi koordinatasi va eslatma
    double? deliveryLat,
    double? deliveryLng,
    String deliveryNotes = '',
  }) async {
    emit(CheckoutLoading());
    try {
      final cleanPhone = phone.replaceAll(RegExp(r'\s+'), '');
      final normalizedPayment = _normalizePayment(paymentMethod);
      final body = <String, dynamic>{
        'product_id': product.id,
        'quantity': 1,
        'receiver_name': name.trim(),
        'receiver_phone': cleanPhone,
        'delivery_address': address.trim(),
        'payment_method': normalizedPayment,
      };
      if (normalizedPayment == 'credit' && creditDays != null) {
        body['credit_days'] = creditDays;
      }
      // Phase 3.1 — koordinata + eslatma (6 kasrgacha qisqartirilgan)
      if (deliveryLat != null && deliveryLng != null) {
        body['delivery_lat'] = double.parse(deliveryLat.toStringAsFixed(6));
        body['delivery_lng'] = double.parse(deliveryLng.toStringAsFixed(6));
      }
      if (deliveryNotes.trim().isNotEmpty) {
        body['delivery_notes'] = deliveryNotes.trim();
      }

      await apiClient.dio.post(ApiConstants.ordersQuick, data: body);
      emit(CheckoutSuccess());
    } catch (e) {
      emit(_buildError(e));
    }
  }

  Future<void> submitCartCheckout({
    required String name,
    required String phone,
    required String address,
    required String paymentMethod,
    int? creditDays,
    // Phase 3.1
    double? deliveryLat,
    double? deliveryLng,
    String deliveryNotes = '',
  }) async {
    emit(CheckoutLoading());
    try {
      final cleanPhone = phone.replaceAll(RegExp(r'\s+'), '');
      final normalizedPayment = _normalizePayment(paymentMethod);
      final body = <String, dynamic>{
        'receiver_name': name.trim(),
        'receiver_phone': cleanPhone,
        'delivery_address': address.trim(),
        'payment_method': normalizedPayment,
      };
      if (normalizedPayment == 'credit' && creditDays != null) {
        body['credit_days'] = creditDays;
      }
      // Phase 3.1 — koordinata + eslatma
      if (deliveryLat != null && deliveryLng != null) {
        body['delivery_lat'] = double.parse(deliveryLat.toStringAsFixed(6));
        body['delivery_lng'] = double.parse(deliveryLng.toStringAsFixed(6));
      }
      if (deliveryNotes.trim().isNotEmpty) {
        body['delivery_notes'] = deliveryNotes.trim();
      }

      await apiClient.dio.post(ApiConstants.ordersFromCart, data: body);
      emit(CheckoutSuccess());
    } catch (e) {
      emit(_buildError(e));
    }
  }

  /// Payment method normalizatsiyasi — faqat 3 ta backend qiymati qabul qilinadi.
  /// 'installment' → 'credit' (UI/backend nom farqi)
  /// Boshqa har qanday qiymat → 'cash' (xavfsiz default)
  static String _normalizePayment(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
      case 'card':
      case 'credit':
        return paymentMethod;
      case 'installment':
        return 'credit';
      default:
        // Nazariy jihatdan bunga yetib bo'lmaydi, lekin xavfsizroq
        return 'cash';
    }
  }

  /// Xatoni tahlil qilib `CheckoutError` yaratadi, error code ham saqlaydi.
  /// UI bu code'ni o'qib auto-recovery qila oladi (master_required → cash).
  CheckoutError _buildError(dynamic e) {
    String message = "Xatolik yuz berdi. Iltimos qayta urinib ko'ring.";
    String? code;
    try {
      if (e is DioException && e.response != null) {
        final data = e.response?.data;
        if (data is Map) {
          // Error code (master_required, credit_ban, etc.)
          code = data['code']?.toString();
          // Asosiy xato matni
          if (data['error'] != null) {
            message = data['error'].toString();
          } else if (data.isNotEmpty) {
            final firstValue = data.values.first;
            if (firstValue is List && firstValue.isNotEmpty) {
              message = firstValue.first.toString();
            } else {
              message = firstValue.toString();
            }
          }
        }
      }
    } catch (_) {}
    return CheckoutError(message, code: code);
  }
}
