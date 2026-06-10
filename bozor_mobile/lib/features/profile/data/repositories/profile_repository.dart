import 'package:dio/dio.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/profile_model.dart';

/// Profile read + update repository.
///
/// Backend endpoints:
///   • GET   /api/profile/ — joriy foydalanuvchi profilini olish
///   • PATCH /api/profile/ — first_name, last_name, delivery_address yangilash
///
/// PATCH'da phone yuborilmaydi (read-only, login raqami). Backend baribir
/// rad etadi, lekin biz to'g'ridan-to'g'ri yubormaymiz — bandwidth tejaymiz.
class ProfileRepository {
  final ApiClient apiClient;

  ProfileRepository({required this.apiClient});

  /// Joriy foydalanuvchi profili.
  /// Faqat authenticated user uchun ishlaydi (JWT kerak).
  Future<ProfileModel> getProfile() async {
    final response = await apiClient.dio.get(ApiConstants.profile);
    return ProfileModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// Profilni yangilash — first_name, last_name, delivery_address.
  /// Server javobida butun yangi profil keladi → biz qaytaramiz.
  ///
  /// Throw qiladi DioException agar server xato bersa.
  Future<ProfileModel> updateProfile({
    required String firstName,
    required String lastName,
    required String deliveryAddress,
  }) async {
    final data = {
      'first_name': firstName.trim(),
      'last_name': lastName.trim(),
      'delivery_address': deliveryAddress.trim(),
    };
    final response = await apiClient.dio.patch(
      ApiConstants.profile,
      data: data,
    );
    return ProfileModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// Foydalanuvchiga ko'rsatish uchun xato matnini ajratadi.
  String parseError(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        // Backend dan structured error: {"detail": "..."} yoki maydon bo'yicha
        final detail = data['detail'] ?? data['error'];
        if (detail is String && detail.isNotEmpty) return detail;
        // Maydon bo'yicha: {"first_name": ["..."]}
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
    }
    return e.toString().replaceFirst('Exception: ', '');
  }
}
