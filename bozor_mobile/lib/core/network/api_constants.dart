import 'package:flutter/foundation.dart';

class ApiConstants {
  // ─── Production (Render) ─────────────────────────────────────────────────
  // Render Dashboard → Services → sizning service → URL
  static const String _renderUrl = 'https://online-magazin-api.onrender.com';

  // ─── Local development ────────────────────────────────────────────────────
  // adb reverse tcp:8000 tcp:8000 → emulator'da 127.0.0.1 ishlaydi
  static const String _adbReverseBaseUrl = 'http://127.0.0.1:8000';
  // Haqiqiy telefonda: computer'ning WiFi IP manzili
  static const String _defaultLanBaseUrl = 'http://192.168.100.120:8000';

  /// Asosiy base URL:
  ///  - Release (apk/appbundle) → Render production URL
  ///  - Debug (emulator/device) → local URL
  ///  - --dart-define=API_BASE_URL=... → berilgan URL (eng yuqori prioritet)
  static String get baseUrl {
    // 1. --dart-define override (build vaqtida berilsa)
    const envOverride = String.fromEnvironment('API_BASE_URL');
    if (envOverride.isNotEmpty) return envOverride;

    // 2. Release mode → production Render
    if (kReleaseMode) return _renderUrl;

    // 3. Debug mode
    // Foydalanuvchi hozirda vaqtinchalik server (Render) ga ulanganini aytgani uchun,
    // Debug rejimida ham to'g'ridan-to'g'ri internetdagi serverga ulaymiz.
    return _renderUrl;
  }

  static List<String> get localBaseUrls {
    const envOverride = String.fromEnvironment('API_BASE_URL');
    if (envOverride.isNotEmpty) return [envOverride];
    if (kReleaseMode) return [_renderUrl];
    // Debug: avval local, muvaffaqiyatsiz bo'lsa production'ga fallback
    return [_adbReverseBaseUrl, _defaultLanBaseUrl, _renderUrl];
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
  static const String adminCategories = '/api/admin/categories/';
  static const String adminBanners = '/api/admin/banners/';
  static const String adminStockReport = '/api/admin/stock-report/';

  // ─── Admin: Dashboard / Buyurtmalar / POS ─────────────────────────────────────
  static const String adminDashboard = '/api/orders/admin/dashboard/';
  static const String adminOrders = '/api/orders/admin/';
  // Phase 3.0 — Kuryer navigatsiyasi (manzil + koordinata + eslatma)
  static String orderRouteTarget(int orderId) => '/api/orders/$orderId/route-target/';
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
}
