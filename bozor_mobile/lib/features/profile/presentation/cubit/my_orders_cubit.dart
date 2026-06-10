import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/repositories/user_orders_repository.dart';
import '../../../admin/data/models/order_status_helper.dart';
import 'my_orders_state.dart';

class MyOrdersCubit extends Cubit<MyOrdersState> {
  final UserOrdersRepository repository;

  MyOrdersCubit({required this.repository}) : super(MyOrdersInitial());

  Future<void> loadOrders() async {
    emit(MyOrdersLoading());
    try {
      final pageData = await repository.getUserOrders();
      final allOrders = pageData.orders;

      // Filter Active Orders
      // Status is active if not in final statuses (RECEIVED, CANCELLED_BY_USER, CANCELLED_BY_ADMIN, SYSTEM_AUTO_CANCEL)
      final activeOrders = allOrders.where((order) {
        return !OrderStatusHelper.isFinal(order.status);
      }).toList();

      // Filter Unpaid Orders
      // 1. Credit (Nasiya) orders that are not paid: isCredit && !creditPaid
      // 2. Card orders awaiting payment: paymentMethod == 'card' && status == 'AWAITING_PAYMENT'
      final unpaidOrders = allOrders.where((order) {
        final isCreditUnpaid = order.isCredit && !order.creditPaid;
        final isCardAwaiting = order.paymentMethod.toLowerCase() == 'card' &&
            order.status.toUpperCase() == 'AWAITING_PAYMENT';
        return isCreditUnpaid || isCardAwaiting;
      }).toList();

      emit(MyOrdersLoaded(
        allOrders: allOrders,
        activeOrders: activeOrders,
        unpaidOrders: unpaidOrders,
      ));
    } catch (e) {
      emit(const MyOrdersError("Buyurtmalarni yuklab bo'lmadi. Iltimos, qayta urinib ko'ring."));
    }
  }

  Future<bool> cancelUserOrder(int orderId, String reason) async {
    try {
      await repository.cancelOrder(orderId, reason);
      await loadOrders();
      return true;
    } catch (e) {
      return false;
    }
  }
}
