import 'package:dio/dio.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../models/admin_product_model.dart';
import '../models/admin_dashboard_model.dart';
import '../models/admin_order_model.dart';
import '../models/admin_master_model.dart';
import '../models/admin_staff_model.dart';
import '../models/pos_model.dart';
import '../models/admin_kassa_model.dart';
import '../models/admin_report_model.dart';
import '../models/admin_stock_model.dart';

/// Real-time poll natijasi — yangi buyurtmalarni aniqlash uchun.
class OrdersPollResult {
  final int latestId;
  final int newCount;
  // HAR QANDAY o'zgarish signali (status/kredit/yangi...) — bu o'zgarsa
  // ro'yxat refetch qilinadi. Backend Max(updated_at).
  final String? lastUpdate;
  const OrdersPollResult({
    required this.latestId,
    required this.newCount,
    this.lastUpdate,
  });
}

/// #N3 — CSV/Excel bulk import natijasi (backend AdminBulkImportView javobi).
class BulkImportResultData {
  final int createdCount;
  final int skippedCount;
  final int errorCount;
  final List<({int row, String message})> errors;
  final List<String> warnings;

  const BulkImportResultData({
    required this.createdCount,
    required this.skippedCount,
    required this.errorCount,
    required this.errors,
    required this.warnings,
  });

  factory BulkImportResultData.fromJson(Map<String, dynamic> j) {
    return BulkImportResultData(
      createdCount: (j['created_count'] as num?)?.toInt() ?? 0,
      skippedCount: (j['skipped_count'] as num?)?.toInt() ?? 0,
      errorCount: (j['error_count'] as num?)?.toInt() ?? 0,
      errors: ((j['errors'] as List?) ?? [])
          .map((e) {
            final m = e as Map<String, dynamic>;
            return (
              row: (m['row'] as num?)?.toInt() ?? 0,
              message: (m['error'] as String?) ?? '',
            );
          })
          .toList(),
      warnings: ((j['warnings'] as List?) ?? []).map((e) => e.toString()).toList(),
    );
  }
}

/// Kuryer qabul kodi tasdiqlashda backend qaytargan strukturali xato.
/// `code` — barqaror xato identifikatori (dialog shu bo'yicha xabar tanlaydi);
/// `attemptsLeft` — wrong_code holatida qolgan urinishlar soni.
class CourierConfirmException implements Exception {
  final String message;
  final String? code;
  final int? attemptsLeft;
  const CourierConfirmException({
    required this.message,
    this.code,
    this.attemptsLeft,
  });
  @override
  String toString() => message;
}

class AdminRepository {
  final ApiClient apiClient;

  AdminRepository({required this.apiClient});

  /// DioException'dan o'qish mumkin bo'lgan xato xabarini ajratadi.
  static String parseError(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final msg = data['error'] ?? data['detail'] ?? data['message'];
        if (msg != null) return msg.toString();
      }
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return "Serverga ulanib bo'lmadi. Internetni tekshiring.";
      }
    }
    return e.toString().replaceFirst('Exception: ', '');
  }

  // ─── Products ────────────────────────────────────────────────────────────────

  Future<({List<AdminProductModel> items, bool hasReachedMax})> getProducts({int page = 1, String query = ''}) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminProducts,
      queryParameters: {
        if (page > 1) 'page': page,
        if (query.isNotEmpty) 'q': query,
      },
    );
    final data = response.data;
    if (data is Map) {
      final list = data['results'] as List? ?? [];
      final items = list.map((j) => AdminProductModel.fromJson(j as Map<String, dynamic>)).toList();
      return (items: items, hasReachedMax: data['next'] == null);
    } else {
      final list = data as List? ?? [];
      final items = list.map((j) => AdminProductModel.fromJson(j as Map<String, dynamic>)).toList();
      return (items: items, hasReachedMax: true);
    }
  }

  Future<AdminProductModel> createProduct(FormData formData) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminProducts,
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminProductModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminProductModel> updateProduct(int id, FormData formData) async {
    final response = await apiClient.dio.patch(
      '${ApiConstants.adminProducts}$id/',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminProductModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteProduct(int id) async {
    await apiClient.dio.delete('${ApiConstants.adminProducts}$id/');
  }

  /// #N3 — CSV/Excel orqali ommaviy mahsulot import.
  /// Backend created_count==0 bo'lsa 400 qaytaradi (lekin tanasida natija bor) —
  /// shu sababli 400 ham qabul qilinadi va natija sifatida o'qiladi.
  Future<BulkImportResultData> bulkImportProducts({
    required String filePath,
    required String fileName,
    required bool translate,
    int? defaultCategoryId,
  }) async {
    final isCsv = fileName.toLowerCase().endsWith('.csv');
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: fileName),
      'format': isCsv ? 'csv' : 'excel',
      'translate': translate ? 'true' : 'false',
      if (defaultCategoryId != null)
        'default_category_id': defaultCategoryId.toString(),
    });
    final response = await apiClient.dio.post(
      ApiConstants.adminBulkImport,
      data: formData,
      options: Options(
        contentType: 'multipart/form-data',
        // Katta importlar uzoq davom etishi mumkin — generous timeoutlar.
        sendTimeout: const Duration(minutes: 5),
        receiveTimeout: const Duration(minutes: 5),
        // created_count==0 -> 400; tanasidagi natijani o'qish uchun ruxsat.
        validateStatus: (s) => s != null && (s < 300 || s == 400),
      ),
    );
    final data = response.data;
    if (data is Map<String, dynamic> && data.containsKey('created_count')) {
      return BulkImportResultData.fromJson(data);
    }
    // Kutilmagan javob (masalan {"error": "..."}): xato sifatida ko'taramiz.
    final msg = (data is Map && data['error'] != null)
        ? data['error'].toString()
        : 'Import bajarilmadi.';
    throw Exception(msg);
  }

  // ─── Categories ──────────────────────────────────────────────────────────────

  Future<List<AdminCategoryModel>> getCategories() async {
    final response = await apiClient.dio.get(ApiConstants.adminCategories);
    final data = response.data;
    final list = data is List ? data : (data['results'] as List? ?? []);
    return list.map((j) => AdminCategoryModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<AdminCategoryModel> createCategory(Map<String, dynamic> body) async {
    final response = await apiClient.dio.post(ApiConstants.adminCategories, data: body);
    return AdminCategoryModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminCategoryModel> updateCategory(int id, Map<String, dynamic> body) async {
    final response = await apiClient.dio.patch(
      '${ApiConstants.adminCategories}$id/',
      data: body,
    );
    return AdminCategoryModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteCategory(int id) async {
    await apiClient.dio.delete('${ApiConstants.adminCategories}$id/');
  }

  // ─── Banners ─────────────────────────────────────────────────────────────────

  Future<List<AdminBannerModel>> getBanners() async {
    final response = await apiClient.dio.get(ApiConstants.adminBanners);
    final data = response.data;
    final list = data is List ? data : (data['results'] as List? ?? []);
    return list.map((j) => AdminBannerModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<AdminBannerModel> createBanner(FormData formData) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminBanners,
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminBannerModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<AdminBannerModel> updateBanner(int id, FormData formData) async {
    final response = await apiClient.dio.patch(
      '${ApiConstants.adminBanners}$id/',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return AdminBannerModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteBanner(int id) async {
    await apiClient.dio.delete('${ApiConstants.adminBanners}$id/');
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  Future<DashboardData> getDashboard() async {
    final response = await apiClient.dio.get(ApiConstants.adminDashboard);
    return DashboardData.fromJson(response.data as Map<String, dynamic>);
  }

  // ─── Buyurtmalar ────────────────────────────────────────────────────────────
  Future<AdminOrderPage> getOrders({
    String? q,
    String? status,
    String? dateFrom,
    String? dateTo,
    String? paymentMethod,
    String? isCredit,
    String? nasiyaStatus,
    int page = 1,
  }) async {
    final params = <String, dynamic>{'page': page};
    if (q != null && q.isNotEmpty) params['q'] = q;
    if (status != null && status.isNotEmpty) params['status'] = status;
    if (dateFrom != null && dateFrom.isNotEmpty) params['date_from'] = dateFrom;
    if (dateTo != null && dateTo.isNotEmpty) params['date_to'] = dateTo;
    if (paymentMethod != null && paymentMethod.isNotEmpty) {
      params['payment_method'] = paymentMethod;
    }
    if (isCredit != null && isCredit.isNotEmpty) params['is_credit'] = isCredit;
    if (nasiyaStatus != null && nasiyaStatus.isNotEmpty) {
      params['nasiya_status'] = nasiyaStatus;
    }

    final response =
        await apiClient.dio.get(ApiConstants.adminOrders, queryParameters: params);
    return AdminOrderPage.fromJson(response.data);
  }

  /// Real-time poll — yangi buyurtmalarni aniqlash uchun arzon agregat
  /// (Max(id) + Count). `since` — oxirgi ko'rilgan order id.
  Future<OrdersPollResult> pollOrders(int since) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminOrdersPoll,
      queryParameters: {'since': since},
    );
    final data = (response.data as Map).cast<String, dynamic>();
    return OrdersPollResult(
      latestId: (data['latest_id'] as num?)?.toInt() ?? 0,
      newCount: (data['new_count'] as num?)?.toInt() ?? 0,
      lastUpdate: data['last_update'] as String?,
    );
  }

  Future<AdminOrder> updateOrderStatus(
    int id, {
    required String status,
    String note = '',
  }) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminOrderStatus(id),
      data: {'status': status, 'note': note},
    );
    return AdminOrder.fromJson(response.data as Map<String, dynamic>);
  }

  /// Kuryer qabul kodi bilan yetkazib berishni tasdiqlaydi (DELIVERED → RECEIVED).
  ///
  /// XAVFSIZLIK: bu — RECEIVED'ga o'tishning yagona yo'li. Faqat 6 xonali kod
  /// yuboriladi (rasm/GPS yo'q). Backend 6 qatlamli himoya bilan tekshiradi.
  ///
  /// Xato bo'lsa [CourierConfirmException] tashlaydi — `code` va `attemptsLeft`
  /// bilan, shunda dialog aniq xabar ko'rsata oladi (wrong_code, code_expired,
  /// too_many_attempts, code_used, no_code, wrong_status).
  Future<AdminOrder> courierConfirmDelivery(int id, String receivedCode) async {
    try {
      final response = await apiClient.dio.post(
        ApiConstants.courierConfirm(id),
        data: {'received_code': receivedCode},
      );
      // Backend javobi: { "status": "RECEIVED", "order": {...} }
      final body = response.data as Map<String, dynamic>;
      final orderJson = (body['order'] ?? body) as Map<String, dynamic>;
      return AdminOrder.fromJson(orderJson);
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map<String, dynamic>) {
        throw CourierConfirmException(
          message: (data['error'] ?? "Tasdiqlab bo'lmadi.").toString(),
          code: data['code']?.toString(),
          attemptsLeft: (data['attempts_left'] as num?)?.toInt(),
        );
      }
      throw CourierConfirmException(
        message: "Tasdiqlab bo'lmadi. Internet aloqasini tekshiring.",
      );
    }
  }

  Future<AdminOrder> payCreditOrder(int id) async {
    final response = await apiClient.dio.post(ApiConstants.adminPayCredit(id));
    return AdminOrder.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Map<String, int>> getNasiyaSummary() async {
    final response = await apiClient.dio.get('${ApiConstants.adminOrders}nasiya/summary/');
    final data = response.data as Map<String, dynamic>;
    return {
      'paid_count': data['paid_count'] as int? ?? 0,
      'overdue_count': data['overdue_count'] as int? ?? 0,
      'active_count': data['active_count'] as int? ?? 0,
    };
  }

  // ─── POS (Do'kon) ─────────────────────────────────────────────────────────
  Future<({List<PosProduct> products, bool hasReachedMax})> getPosProducts({int page = 1, String q = ''}) async {
    final params = <String, dynamic>{'page': page, 'page_size': 20};
    if (q.isNotEmpty) params['q'] = q;

    final response = await apiClient.dio.get(
      ApiConstants.adminProducts,
      queryParameters: params,
    );
    final data = response.data;
    if (data is Map<String, dynamic> && data.containsKey('results')) {
      final list = data['results'] as List? ?? [];
      final products = list.map((j) => PosProduct.fromJson(j as Map<String, dynamic>)).toList();
      final hasNext = data['next'] != null;
      return (products: products, hasReachedMax: !hasNext);
    } else {
      final list = data as List? ?? [];
      final products = list.map((j) => PosProduct.fromJson(j as Map<String, dynamic>)).toList();
      return (products: products, hasReachedMax: true);
    }
  }

  /// Telefon raqam bo'yicha mijozni qidiradi. Topilmasa `null` qaytaradi.
  Future<PosCustomer?> searchUser(String phone) async {
    try {
      final response = await apiClient.dio.get(
        ApiConstants.adminUserSearch,
        queryParameters: {'phone': phone},
      );
      return PosCustomer.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<AdminOrder> createPosOrder({
    required String phone,
    required String firstName,
    required String lastName,
    required String paymentMethod,
    int? creditDays,
    required List<PosCartItem> items,
  }) async {
    final body = <String, dynamic>{
      'phone': phone,
      'first_name': firstName,
      'last_name': lastName,
      'payment_method': paymentMethod,
      'items': items
          .map((i) => {
                'product_id': i.productId,
                if (i.variantId != null) 'variant_id': i.variantId,
                'quantity': i.quantity,
                // Kelishuv (sotiladigan) narx — backend price_snapshot sifatida saqlaydi.
                'price': i.soldPrice,
              })
          .toList(),
    };
    if (paymentMethod == 'credit' && creditDays != null) {
      body['credit_days'] = creditDays;
    }
    final response =
        await apiClient.dio.post(ApiConstants.adminPosOrder, data: body);
    return AdminOrder.fromJson(response.data as Map<String, dynamic>);
  }

  Future<CustomerHistory> getCustomerHistory(String phone) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminCustomerHistory,
      queryParameters: {'phone': phone},
    );
    return CustomerHistory.fromJson(response.data as Map<String, dynamic>);
  }

  // ─── Stock Report ────────────────────────────────────────────────────────────

  Future<AdminStockReport> getAdminStockReport({int minStock = 0, int maxStock = 10}) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminStockReport,
      queryParameters: {
        'min_stock': minStock,
        'max_stock': maxStock,
      },
    );
    return AdminStockReport.fromJson(response.data as Map<String, dynamic>);
  }

  // ─── Kassa ───────────────────────────────────────────────────────────────
  Future<AdminKassaModel> getKassaData() async {
    final response = await apiClient.dio.get(ApiConstants.adminKassa);
    return AdminKassaModel.fromJson(response.data as Map<String, dynamic>);
  }

  /// Kassadan pul yechish.
  ///
  /// ⚠ FIELD NAME BUG (tuzatildi): backend `reason` maydonini kutadi
  /// (orders/views.py:1056 `reason = request.data.get('reason')`).
  ///
  /// Avvalgi mobile kod `'note'` yuborardi → backend `reason=None` oldi →
  /// `if not reason: raise "Maqsad/izoh kiritilishi shart"` xatosi (false positive).
  /// Foydalanuvchi izoh kiritgan bo'lsa-da, backend uni ko'ra olmas edi.
  ///
  /// Endi `'reason'` yuboramiz — sayt (Checkout.tsx) bilan izchil
  /// (frontend/src/api/endpoints.ts ham `reason` ishlatadi).
  ///
  /// Bonus: eski APK ishlatuvchilar uchun backend `reason or note` qabul
  /// qiluvchi qatlam ham qo'shildi (alohida commit'da backend o'zgarishi).
  Future<void> withdrawKassa(double amount, String reason) async {
    await apiClient.dio.post(
      ApiConstants.adminWithdrawKassa,
      data: {
        'amount': amount,
        'reason': reason, // ✓ to'g'ri maydon (avval 'note' edi — bug)
      },
    );
  }

  // ─── Hisobotlar (Reports) ──────────────────────────────────────────────────
  Future<ReportData> getReportData({
    String? dateFrom,
    String? dateTo,
    String? period,
  }) async {
    final params = <String, dynamic>{};
    if (dateFrom != null && dateFrom.isNotEmpty) params['date_from'] = dateFrom;
    if (dateTo != null && dateTo.isNotEmpty) params['date_to'] = dateTo;
    if (period != null && period.isNotEmpty) params['period'] = period;

    final response = await apiClient.dio.get(ApiConstants.adminReport, queryParameters: params);
    return ReportData.fromJson(response.data as Map<String, dynamic>);
  }

  Future<({List<ReportOrder> orders, bool hasReachedMax})> getReportOrders({
    String? dateFrom,
    String? dateTo,
    int page = 1,
  }) async {
    final params = <String, dynamic>{
      if (page > 1) 'page': page,
      if (dateFrom != null && dateFrom.isNotEmpty) 'date_from': dateFrom,
      if (dateTo != null && dateTo.isNotEmpty) 'date_to': dateTo,
    };

    final response = await apiClient.dio.get(ApiConstants.adminReportOrders, queryParameters: params);
    final data = response.data;
    if (data is Map) {
      final list = data['results'] as List? ?? [];
      final items = list.map((j) => ReportOrder.fromJson(j as Map<String, dynamic>)).toList();
      return (orders: items, hasReachedMax: data['next'] == null);
    } else {
      final list = data as List? ?? [];
      final items = list.map((j) => ReportOrder.fromJson(j as Map<String, dynamic>)).toList();
      return (orders: items, hasReachedMax: true);
    }
  }

  // ─── Ustalar (Masters) ────────────────────────────────────────────────────

  /// Barcha ustalarni oladi.
  Future<List<MasterMember>> getMasters({String? q}) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminMasters,
      queryParameters: q != null && q.isNotEmpty ? {'q': q} : null,
    );
    final list = response.data as List? ?? [];
    return list
        .map((j) => MasterMember.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  /// Foydalanuvchini usta qiladi.
  Future<Map<String, dynamic>> assignMaster({required String phone}) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminMasterAssign,
      data: {'phone': phone},
    );
    return response.data as Map<String, dynamic>;
  }

  /// Ustadan olib tashlaydi.
  Future<void> removeMaster(int id) async {
    await apiClient.dio.delete(ApiConstants.adminMasterRemove(id));
  }

  /// Usta chegirma foizini oladi.
  Future<MasterDiscount> getMasterDiscount() async {
    final response = await apiClient.dio.get(ApiConstants.adminMasterDiscount);
    return MasterDiscount.fromJson(response.data as Map<String, dynamic>);
  }

  /// Usta chegirma foizini o'zgartiradi.
  Future<void> setMasterDiscount(double percent) async {
    await apiClient.dio.post(
      ApiConstants.adminMasterDiscount,
      data: {'percent': percent},
    );
  }

  // ─── Xodimlar (Staff) ────────────────────────────────────────────────────

  /// Barcha xodimlarni oladi. Ixtiyoriy `q` parametri bilan telefon qidirish.
  Future<List<StaffMember>> getStaff({String? q}) async {
    final response = await apiClient.dio.get(
      ApiConstants.adminStaff,
      queryParameters: q != null && q.isNotEmpty ? {'q': q} : null,
    );
    final list = response.data as List? ?? [];
    return list
        .map((j) => StaffMember.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  /// Foydalanuvchiga rol tayinlaydi yoki o'zgartiradi.
  /// [role] bo'sh string bo'lsa — rolni olib tashlaydi.
  Future<AssignRoleResult> assignRole({
    required String phone,
    required String role,
  }) async {
    final response = await apiClient.dio.post(
      ApiConstants.adminStaffAssignRole,
      data: {'phone': phone, 'role': role},
    );
    return AssignRoleResult.fromJson(response.data as Map<String, dynamic>);
  }

  /// Xodimni ishdan bo'shatadi (rolini olib tashlaydi).
  Future<void> fireStaff(int id) async {
    await apiClient.dio.delete(ApiConstants.adminStaffFire(id));
  }

  // ─── Sozlamalar (Settings) ────────────────────────────────────────────────
  
  Future<double> getExchangeRate() async {
    final response = await apiClient.dio.get(ApiConstants.adminExchangeRate);
    final data = response.data;
    if (data is Map && data.containsKey('usd_rate')) {
      return double.tryParse(data['usd_rate'].toString()) ?? 0.0;
    }
    return 0.0;
  }

  Future<void> updateExchangeRate(double rate) async {
    await apiClient.dio.post(
      ApiConstants.adminExchangeRate,
      data: {'usd_rate': rate},
    );
  }

  Future<Map<String, dynamic>> getShopInfo() async {
    final response = await apiClient.dio.get(ApiConstants.adminShopInfo);
    return response.data as Map<String, dynamic>;
  }

  Future<void> updateShopInfo({String? name, String? phone, String? address}) async {
    final data = <String, dynamic>{};
    if (name != null) data['shop_name'] = name;
    if (phone != null) data['shop_phone'] = phone;
    if (address != null) data['shop_address'] = address;
    
    await apiClient.dio.patch(
      ApiConstants.adminShopInfo,
      data: data,
    );
  }
}
