/// AdminUsersRepository — saytdagi /admin/users endpointlari uchun network qatlam.
library;

import 'package:dio/dio.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/admin_user_model.dart';

class AdminUsersRepository {
  final ApiClient apiClient;

  AdminUsersRepository({required this.apiClient});

  /// Foydalanuvchilar ro'yxati sahifalab.
  ///
  /// Parametrlar:
  ///   page         — 1'dan boshlanadi
  ///   query        — qidiruv (telefon/ism)
  ///   isActive     — null=hammasi, true/false
  ///   creditBanned — null=hammasi, true/false
  Future<AdminUserPage> getUsersPage({
    required int page,
    String query = '',
    bool? isActive,
    bool? creditBanned,
  }) async {
    final params = <String, dynamic>{'page': page};
    if (query.trim().isNotEmpty) params['q'] = query.trim();
    if (isActive != null) params['is_active'] = isActive ? 'true' : 'false';
    if (creditBanned != null) {
      params['credit_ban'] = creditBanned ? 'true' : 'false';
    }

    final response = await apiClient.dio.get<Map<String, dynamic>>(
      ApiConstants.adminUsers,
      queryParameters: params,
    );
    return AdminUserPage.fromJson(response.data!);
  }

  /// Bitta foydalanuvchining batafsil ma'lumotlari + oxirgi 10 buyurtmasi.
  Future<AdminUserDetail> getUserDetail(int userId) async {
    final response = await apiClient.dio.get<Map<String, dynamic>>(
      ApiConstants.adminUserDetail(userId),
    );
    return AdminUserDetail.fromJson(response.data!);
  }

  /// Aktivlik holatini almashtirish (faollashtirish/o'chirish).
  /// Backend toggle qiladi va yangi holatni qaytaradi.
  Future<bool> toggleActive(int userId) async {
    final response = await apiClient.dio.post<Map<String, dynamic>>(
      ApiConstants.adminUserToggleActive(userId),
    );
    return response.data?['is_active'] as bool? ?? true;
  }

  /// Kredit ban'ni olib tashlash (1 ta imkoniyat).
  Future<void> liftCreditBan(int userId, String reason) async {
    await apiClient.dio.post<Map<String, dynamic>>(
      ApiConstants.adminUserLiftCreditBan(userId),
      data: {'reason': reason},
    );
  }

  /// Foydalanuvchiga ko'rsatish uchun xato matnini ajratadi.
  String parseError(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final detail = data['detail'] ?? data['error'];
        if (detail is String && detail.isNotEmpty) return detail;
        for (final entry in data.entries) {
          final v = entry.value;
          if (v is List && v.isNotEmpty) return v.first.toString();
          if (v is String && v.isNotEmpty) return v;
        }
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError) {
        return "Internet aloqasi yo'q. Qayta urinib ko'ring.";
      }
      if (e.response?.statusCode == 403) {
        return "Sizga bu amalga ruxsat yo'q.";
      }
      if (e.response?.statusCode == 404) {
        return 'Foydalanuvchi topilmadi.';
      }
    }
    return e.toString().replaceFirst('Exception: ', '');
  }
}
