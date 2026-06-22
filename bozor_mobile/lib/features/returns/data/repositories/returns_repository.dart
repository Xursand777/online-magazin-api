// Phase 3.6: Qaytarish (Return) tizimi uchun yagona repository.
// Mijoz endpoint'lari (`customer*`) va admin endpoint'lari (`admin*`).
// Tarmoq xato kelganda DioException o'z holicha uloqtirilad — caller
// (Bloc/Cubit) tekshirib snackbar ko'rsatadi.

import 'package:dio/dio.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/order_return_model.dart';

class ReturnsListPage {
  final List<OrderReturn> items;
  final int count;
  final bool hasNext;
  const ReturnsListPage({
    required this.items,
    required this.count,
    required this.hasNext,
  });

  factory ReturnsListPage.fromJson(Map<String, dynamic> j) {
    final results = (j['results'] as List? ?? [])
        .map((e) => OrderReturn.fromJson(e as Map<String, dynamic>))
        .toList();
    return ReturnsListPage(
      items: results,
      count: j['count'] as int? ?? results.length,
      hasNext: j['next'] != null,
    );
  }
}

class ReturnsStats {
  final int totalReturns;
  final int successCount;
  final double totalRefundedAmount;
  final List<Map<String, dynamic>> byStatus;
  final List<Map<String, dynamic>> byReason;
  final List<Map<String, dynamic>> byMethod;

  const ReturnsStats({
    required this.totalReturns,
    required this.successCount,
    required this.totalRefundedAmount,
    required this.byStatus,
    required this.byReason,
    required this.byMethod,
  });

  factory ReturnsStats.fromJson(Map<String, dynamic> j) => ReturnsStats(
        totalReturns: j['total_returns'] as int? ?? 0,
        successCount: j['success_count'] as int? ?? 0,
        totalRefundedAmount:
            (j['total_refunded_amount'] as num?)?.toDouble() ?? 0,
        byStatus: List<Map<String, dynamic>>.from(j['by_status'] as List? ?? []),
        byReason: List<Map<String, dynamic>>.from(j['by_reason'] as List? ?? []),
        byMethod: List<Map<String, dynamic>>.from(j['by_method'] as List? ?? []),
      );
}

class ReturnsRepository {
  final ApiClient apiClient;
  ReturnsRepository(this.apiClient);

  // ── Mijoz uchun ──────────────────────────────────────────────────────────

  /// Mijoz O'Z buyurtmasi uchun eligibility tekshiruvi.
  /// 200 doim — `eligible:false` qaytsa, `error`/`code` da sabab.
  Future<ReturnEligibility> customerCheckEligibility(int orderId) async {
    final r = await apiClient.dio.get(
      ApiConstants.customerReturnEligibility(orderId),
    );
    return ReturnEligibility.fromJson(r.data as Map<String, dynamic>);
  }

  /// Mijoz qaytarish so'rovini yuboradi. Status REQUESTED'da boshlanadi.
  Future<OrderReturn> customerCreateReturn(
    int orderId, {
    required String reasonCode,
    String? reasonText,
    String? customerRequestNote,
    List<MultipartFile> claimImages = const [],
  }) async {
    final fd = FormData.fromMap({
      'reason_code': reasonCode,
      if (reasonText != null) 'reason_text': reasonText,
      if (customerRequestNote != null) 'customer_request_note': customerRequestNote,
    });
    for (final img in claimImages) {
      fd.files.add(MapEntry('claim_images', img));
    }
    final r = await apiClient.dio.post(
      ApiConstants.customerCreateReturn(orderId),
      data: fd,
    );
    return OrderReturn.fromJson(r.data as Map<String, dynamic>);
  }

  /// Mijozning barcha qaytarishlari (eng yangi avval).
  Future<ReturnsListPage> customerMyReturns({int page = 1, int pageSize = 25}) async {
    final r = await apiClient.dio.get(
      ApiConstants.customerMyReturns,
      queryParameters: {'page': page, 'page_size': pageSize},
    );
    return ReturnsListPage.fromJson(r.data as Map<String, dynamic>);
  }

  // ── Admin uchun ──────────────────────────────────────────────────────────

  Future<ReturnEligibility> adminCheckEligibility(int orderId) async {
    final r = await apiClient.dio.get(
      ApiConstants.adminReturnEligibility(orderId),
    );
    return ReturnEligibility.fromJson(r.data as Map<String, dynamic>);
  }

  Future<OrderReturn> adminCreateReturn(
    int orderId, {
    required String reasonCode,
    String? reasonText,
    String? customerRequestNote,
    List<MultipartFile> claimImages = const [],
  }) async {
    final fd = FormData.fromMap({
      'reason_code': reasonCode,
      if (reasonText != null) 'reason_text': reasonText,
      if (customerRequestNote != null) 'customer_request_note': customerRequestNote,
    });
    for (final img in claimImages) {
      fd.files.add(MapEntry('claim_images', img));
    }
    final r = await apiClient.dio.post(
      ApiConstants.adminCreateReturn(orderId),
      data: fd,
    );
    return OrderReturn.fromJson(r.data as Map<String, dynamic>);
  }

  Future<ReturnsListPage> adminList({
    int page = 1,
    int pageSize = 25,
    String? status,
    bool activeOnly = false,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'page_size': pageSize,
    };
    if (status != null && status.isNotEmpty) params['status'] = status;
    if (activeOnly && (status == null || status.isEmpty)) params['active'] = 'true';
    final r = await apiClient.dio.get(
      ApiConstants.adminReturnsList,
      queryParameters: params,
    );
    return ReturnsListPage.fromJson(r.data as Map<String, dynamic>);
  }

  Future<ReturnsStats> adminStats() async {
    final r = await apiClient.dio.get(ApiConstants.adminReturnsStats);
    return ReturnsStats.fromJson(r.data as Map<String, dynamic>);
  }

  Future<OrderReturn> adminDetail(int id) async {
    final r = await apiClient.dio.get(ApiConstants.adminReturnDetail(id));
    return OrderReturn.fromJson(r.data as Map<String, dynamic>);
  }

  Future<OrderReturn> adminTransition(
    int id, {
    required String newStatus,
    String? note,
    String? inspectionNotes,
    String? refundMethod,
    String? refundAmount,
    String? refundReference,
  }) async {
    final body = <String, dynamic>{'new_status': newStatus};
    if (note != null && note.isNotEmpty) body['note'] = note;
    if (inspectionNotes != null && inspectionNotes.isNotEmpty) {
      body['inspection_notes'] = inspectionNotes;
    }
    if (refundMethod != null && refundMethod.isNotEmpty) {
      body['refund_method'] = refundMethod;
    }
    if (refundAmount != null && refundAmount.isNotEmpty) {
      body['refund_amount'] = refundAmount;
    }
    if (refundReference != null && refundReference.isNotEmpty) {
      body['refund_reference'] = refundReference;
    }
    final r = await apiClient.dio.patch(
      ApiConstants.adminReturnTransition(id),
      data: body,
    );
    return OrderReturn.fromJson(r.data as Map<String, dynamic>);
  }
}
