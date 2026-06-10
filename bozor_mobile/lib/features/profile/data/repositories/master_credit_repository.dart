import 'package:dio/dio.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/credit_status_model.dart';
import '../models/master_status_model.dart';

/// Usta + Kredit status uchun yagona repository.
///
/// Ikkala endpoint ham QAT'IY AUTH talab qiladi va FAQAT ustalar uchun.
/// UI tomonida AuthBloc.isMaster tekshiriladi — repository BACKEND
/// authoritative tekshirishni kafolatlaydi (is_master=false bo'lsa ham
/// xato chiqarmaymiz, faqat empty model qaytaramiz — UI'da hide).
///
/// Parallel fetch — `Future.wait` orqali ikkala so'rov bir vaqtda yuboriladi.
/// Bu sahifa yuklash vaqtini 2x kamaytiradi (~500ms → ~250ms).
class MasterCreditRepository {
  final ApiClient apiClient;

  MasterCreditRepository({required this.apiClient});

  /// Faqat master status (alohida ishlatish uchun).
  Future<MasterStatusModel> fetchMasterStatus() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.masterStatus);
      final data = response.data as Map<String, dynamic>;
      return MasterStatusModel.fromJson(data);
    } catch (_) {
      return MasterStatusModel.empty;
    }
  }

  /// Faqat credit status.
  Future<CreditStatusModel> fetchCreditStatus() async {
    try {
      final response = await apiClient.dio.get(ApiConstants.creditStatus);
      final data = response.data as Map<String, dynamic>;
      return CreditStatusModel.fromJson(data);
    } catch (_) {
      return CreditStatusModel.empty;
    }
  }

  /// IKKALASINI PARALLEL yuklash — eng tez yondashuv.
  ///
  /// `Future.wait` ikkala so'rovni bir vaqtda yuboradi. Bittasi xato bersa,
  /// boshqasiga ta'sir qilmaydi (har fetch'ning ichki try-catch'i bor).
  ///
  /// Returns: (masterStatus, creditStatus) tuple-pattern record.
  Future<(MasterStatusModel, CreditStatusModel)> fetchBoth() async {
    final results = await Future.wait<dynamic>([
      fetchMasterStatus(),
      fetchCreditStatus(),
    ]);
    return (
      results[0] as MasterStatusModel,
      results[1] as CreditStatusModel,
    );
  }

  /// Foydalanuvchiga xato matnini ko'rsatish uchun helper.
  String parseError(Object e) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.connectionError) {
        return "Internet aloqasi yo'q. Qayta urinib ko'ring.";
      }
      final data = e.response?.data;
      if (data is Map) {
        final detail = data['detail'] ?? data['error'];
        if (detail is String && detail.isNotEmpty) return detail;
      }
    }
    return "Ma'lumotni yuklab bo'lmadi.";
  }
}
