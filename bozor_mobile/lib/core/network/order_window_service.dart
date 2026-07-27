import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'api_constants.dart';

/// Buyurtma qabul qilish vaqt oynasi holati (SERVER vaqti — Asia/Tashkent).
class OrderWindowStatus {
  final bool isOpen;
  final String openTime; // "09:00"
  final String closeTime; // "19:00"

  const OrderWindowStatus({
    required this.isOpen,
    required this.openTime,
    required this.closeTime,
  });

  /// Ma'lumot yuklanmaguncha yoki tarmoq xato bo'lsa — "ochiq" (fail-open).
  /// Haqiqiy xavfsizlik baribir backend'da (buyurtma yaratish rad etiladi).
  static const fallbackOpen =
      OrderWindowStatus(isOpen: true, openTime: '09:00', closeTime: '19:00');

  factory OrderWindowStatus.fromJson(Map<String, dynamic> j) => OrderWindowStatus(
        isOpen: j['is_open'] == true,
        openTime: j['open_time']?.toString() ?? '09:00',
        closeTime: j['close_time']?.toString() ?? '19:00',
      );
}

/// Buyurtma vaqt oynasi holatini serverdan olib, reaktiv ravishda ulashadigan
/// singleton servis.
///
/// DIZAYN (AppConfigService bilan bir xil):
///   • Mustaqil Dio — auth interceptor'larga bog'liq emas.
///   • App start'da bir marta yuklab, har daqiqa yangilaydi (19:00 ga yetganda
///     tugmalar avtomat yopiladi).
///   • Tarmoq xatosida mavjud qiymat saqlanadi (fail-open).
class OrderWindowService {
  OrderWindowService._();
  static final OrderWindowService instance = OrderWindowService._();

  final ValueNotifier<OrderWindowStatus> status =
      ValueNotifier<OrderWindowStatus>(OrderWindowStatus.fallbackOpen);

  Timer? _timer;

  Future<void> refresh() async {
    try {
      final dio = Dio(BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
      ));
      final res = await dio.get(ApiConstants.orderWindow);
      if (res.data is Map<String, dynamic>) {
        status.value =
            OrderWindowStatus.fromJson(res.data as Map<String, dynamic>);
      }
    } catch (_) {
      // fail-open — mavjud qiymatni saqlaymiz
    }
  }

  /// App start'da chaqiriladi: darhol yuklab, keyin har daqiqa yangilaydi.
  void start() {
    refresh();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => refresh());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
