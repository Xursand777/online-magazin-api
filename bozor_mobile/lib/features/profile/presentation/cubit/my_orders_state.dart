import 'package:equatable/equatable.dart';
import '../../data/models/user_order_model.dart';

abstract class MyOrdersState extends Equatable {
  const MyOrdersState();

  @override
  List<Object?> get props => [];
}

class MyOrdersInitial extends MyOrdersState {}

class MyOrdersLoading extends MyOrdersState {}

class MyOrdersLoaded extends MyOrdersState {
  final List<UserOrderModel> allOrders;
  final List<UserOrderModel> activeOrders;
  final List<UserOrderModel> unpaidOrders;

  const MyOrdersLoaded({
    required this.allOrders,
    required this.activeOrders,
    required this.unpaidOrders,
  });

  @override
  List<Object?> get props => [allOrders, activeOrders, unpaidOrders];
}

class MyOrdersError extends MyOrdersState {
  final String message;

  const MyOrdersError(this.message);

  @override
  List<Object?> get props => [message];
}
