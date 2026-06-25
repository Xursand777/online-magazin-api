import 'package:flutter/foundation.dart';

class ApiConstants {
  // ─── Production (Hetzner + Cloudflare) ───────────────────────────────────
  // Doimiy domen — server qayerga ko'chsa ham bu o'zgarmaydi.
  // Cloudflare (CDN+DDoS+SSL) → Hetzner backend.
  static const String _prodUrl = 'https://api.700mobile.uz';

  // ─── Local development ────────────────────────────────────────────────────
  // adb reverse tcp:8000 tcp:8000 → emulator'da 127.0.0.1 ishlaydi
  static const String _adbReverseBaseUrl = 'http://127.0.0.1:8000';
  // Haqiqiy telefonda: computer'ning WiFi IP manzili
  static const String _defaultLanBaseUrl = 'http://192.168.100.120:8000';

  /// Asosiy base URL:
  ///  - Release (apk/appbundle) → production (api.700mobile.uz)
  ///  - Debug (emulator/device) → production (internetdagi serverga to'g'ridan)
  ///  - --dart-define=API_BASE_URL=... → berilgan URL (eng yuqori prioritet)
  static String get baseUrl {
    // 1. --dart-define override (build vaqtida berilsa)
    const envOverride = String.fromEnvironment('API_BASE_URL');
    if (envOverride.isNotEmpty) return envOverride;

    // 2. Release mode → production
    if (kReleaseMode) return _prodUrl;

    // 3. Debug mode → production (to'g'ridan-to'g'ri internetdagi serverga)
    return _prodUrl;
  }

  static List<String> get localBaseUrls {
    const envOverride = String.fromEnvironment('API_BASE_URL');
    if (envOverride.isNotEmpty) return [envOverride];
    if (kReleaseMode) return [_prodUrl];
    // Debug: avval local, muvaffaqiyatsiz bo'lsa production'ga fallback
    return [_adbReverseBaseUrl, _defaultLanBaseUrl, _prodUrl];
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  static const String login = '/api/auth/login/';
  static const String verifyOtp = '/api/auth/verify-otp/';
  static const String loginPassword = '/api/auth/login-password/';
  static const String register = '/api/auth/register/';
  static const String refresh = '/api/auth/refresh/';

  // ─── Katalog ──────────────────────────────────────────────────────────────
  static const String main = '/api/main/';
  static const String banners = '/api/banners/';
  static const String products = '/api/products/';
  static const String productsSimilar = '/api/products/{id}/similar/';
  static const String searchProducts = '/api/search/products/';
  static const String categories = '/api/categories/';
  // Home chiplari — admin "homeda ko'rsatish" (is_popular) flagli kategoriyalar.
  // Sayt bilan AYNAN bir xil manba (single source).
  static const String categoriesHome = '/api/categories/home/';
  static const String categoryProducts = '/api/categories/{id}/products/';
  static const String discounts = '/api/products/discounts/';
  static const String newProducts = '/api/products/new/';
  static const String popularProducts = '/api/products/popular/';

  // ─── Profil / Savat / Buyurtma ────────────────────────────────────────────
  static const String profile = '/api/profile/';
  static const String favorites = '/api/products/favorites/';
  static const String favoriteToggle = '/api/products/favorites/toggle/';
  static const String favoriteSync = '/api/products/favorites/sync/';
  static const String cart = '/api/cart/';
  static const String cartItems = '/api/cart/items/';
  static const String syncLocalCart = '/api/cart/sync-local/';
  static const String orders = '/api/orders/';

  // ─── Usta status + Muddatli to'lov (FAQAT ustalar uchun) ──────────────────
  static const String masterStatus = '/api/master/status/';
  static const String creditStatus = '/api/orders/credit-status/';
  static const String ordersFromCart = '/api/orders/from-cart/';
  static const String ordersQuick = '/api/orders/quick/';

  // ─── Admin: Katalog ─────────────────────────────────────────────────────────
  static const String adminProducts = '/api/admin/products/';
  static const String adminBulkImport = '/api/admin/bulk-import/'; // #N3 CSV/Excel
  static const String adminCategories = '/api/admin/categories/';
  static const String adminBanners = '/api/admin/banners/';
  static const String adminStockReport = '/api/admin/stock-report/';

  // ─── Admin: Dashboard / Buyurtmalar / POS ─────────────────────────────────────
  static const String adminDashboard = '/api/orders/admin/dashboard/';
  static const String adminOrders = '/api/orders/admin/';
  // Real-time polling — yangi buyurtmalarni aniqlash (Max(id)+Count, arzon)
  static const String adminOrdersPoll = '/api/orders/admin/poll/';
  // Phase 3.0 — Kuryer navigatsiyasi (manzil + koordinata + eslatma)
  static String orderRouteTarget(int orderId) => '/api/orders/$orderId/route-target/';
  // Phase 3.2 — Foydalanuvchilar (admin)
  static const String adminUsers = '/api/admin/users/';
  static String adminUserDetail(int userId) => '/api/admin/users/$userId/';
  static String adminUserToggleActive(int userId) =>
      '/api/admin/users/$userId/toggle-active/';
  static String adminUserLiftCreditBan(int userId) =>
      '/api/admin/users/$userId/lift-credit-ban/';
  static String adminOrderStatus(int id) => '/api/orders/admin/$id/status/';
  static String adminPayCredit(int id) => '/api/orders/admin/$id/pay-credit/';
  static const String adminPosOrder = '/api/orders/admin/pos-order/';
  static const String adminCustomerHistory = '/api/orders/admin/customer-history/';
  static const String adminUserSearch = '/api/admin-search/';
  static const String adminKassa = '/api/orders/admin/kassa/';
  static const String adminWithdrawKassa = '/api/orders/admin/kassa/withdraw/';
  static const String adminReport = '/api/orders/admin/report/';
  static const String adminReportOrders = '/api/orders/admin/report/orders/';
  
  // ─── Admin: Xodimlar (Staff) ─────────────────────────────────────────────────
  static const String adminStaff = '/api/admin/staff/';
  static const String adminStaffAssignRole = '/api/admin/staff/assign-role/';
  static String adminStaffFire(int id) => '/api/admin/staff/$id/fire/';

  // ─── Admin: Ustalar (Masters) ─────────────────────────────────────────────────
  static const String adminMasters = '/api/admin/masters/';
  static const String adminMasterAssign = '/api/admin/masters/assign/';
  static String adminMasterRemove(int id) => '/api/admin/masters/$id/remove/';
  static const String adminMasterDiscount = '/api/admin/masters/discount/';

  // ─── Admin: Sozlamalar (Settings) ───────────────────────────────────────────
  static const String adminExchangeRate = '/api/admin/exchange-rate/';
  static const String adminShopInfo = '/api/admin/shop-info/';

  // ─── Phase 3.6 — Qaytarish (Return / Refund) ─────────────────────────────
  // Mijoz endpoint'lari (faqat o'z buyurtmasiga).
  static String customerReturnEligibility(int orderId) =>
      '/api/orders/$orderId/return-eligibility/';
  static String customerCreateReturn(int orderId) =>
      '/api/orders/$orderId/returns/';
  static const String customerMyReturns = '/api/orders/my/returns/';

  // Admin endpoint'lari (auth: IsAdminOrAbove).
  static String adminReturnEligibility(int orderId) =>
      '/api/orders/admin/$orderId/return-eligibility/';
  static String adminCreateReturn(int orderId) =>
      '/api/orders/admin/$orderId/returns/';
  static const String adminReturnsList = '/api/orders/admin/returns/';
  static const String adminReturnsStats = '/api/orders/admin/returns/stats/';
  // Defektlar (sotuvga yaroqsiz writeoff buyumlar)
  static const String adminDefects = '/api/orders/admin/defects/';
  static const String adminDefectsStats = '/api/orders/admin/defects/stats/';
  static String adminReturnDetail(int id) => '/api/orders/admin/returns/$id/';
  static String adminReturnTransition(int id) =>
      '/api/orders/admin/returns/$id/transition/';
  static String adminReturnPhotos(int id) =>
      '/api/orders/admin/returns/$id/photos/';
}
