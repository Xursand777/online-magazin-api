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

  /// Profilni yangilash — first_name, last_name, delivery_address +
  /// Phase 3.1 koordinata va eslatma.
  /// Server javobida butun yangi profil keladi → biz qaytaramiz.
  ///
  /// Throw qiladi DioException agar server xato bersa.
  Future<ProfileModel> updateProfile({
    required String firstName,
    required String lastName,
    required String deliveryAddress,
    // Phase 3.1 — koordinata + eslatma (ixtiyoriy)
    double? deliveryLat,
    double? deliveryLng,
    String deliveryNotes = '',
  }) async {
    final data = <String, dynamic>{
      'first_name': firstName.trim(),
      'last_name': lastName.trim(),
      'delivery_address': deliveryAddress.trim(),
      'delivery_notes': deliveryNotes.trim(),
    };
    // Koordinata — 6 kasrgacha qisqartirish (Leaflet'dan 14 kasrli kelishi mumkin)
    if (deliveryLat != null) {
      data['delivery_lat'] =
          double.parse(deliveryLat.toStringAsFixed(6));
    }
    if (deliveryLng != null) {
      data['delivery_lng'] =
          double.parse(deliveryLng.toStringAsFixed(6));
    }
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
