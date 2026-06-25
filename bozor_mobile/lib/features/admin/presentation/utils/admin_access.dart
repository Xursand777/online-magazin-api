/// Admin tablariga rolega qarab kirish — saytdagi `TAB_ROLES` / `canSeeTab`
/// mantig'ining 100% ekvivalenti (frontend/src/pages/AdminPanel.tsx).
///
/// Rollar: 'admin' | 'seller' | 'courier' | null (oddiy foydalanuvchi).
/// Super-admin (role'siz is_admin) HAMMA tabni ko'radi.
///
/// Qoida (route → ruxsat etilgan rollar):
///   - ro'yxat bor    → faqat shu rollar (super doim ko'radi)
///   - bo'sh ro'yxat  → FAQAT super-admin (staff/masters/audit)
///   - xaritada yo'q  → barcha xodimlar ko'radi (saytdagi `if (!allowed) return true`)
class AdminAccess {
  AdminAccess._();

  /// Route → ruxsat etilgan xodim rollari.
  /// Saytdagi TAB_ROLES bilan bir xil: bo'sh ro'yxat = faqat super-admin.
  // ⭐ ADMIN roli FAQAT quyidagi tablarni ko'radi (mobilda Moslik tab yo'q):
  //    Mahsulotlar, Kategoriyalar, Buyurtmalar, Kassa, Hisobotlar, Bannerlar.
  // SuperAdmin — BARCHA tablar (canSee birinchi qatorda true).
  // Bo'sh ro'yxat [] = FAQAT super-admin.
  static const Map<String, List<String>> _routeRoles = {
    // ── ADMIN ko'radigan tablar ──
    '/admin/products':   ['admin'],                       // Mahsulotlar
    '/admin/categories': ['admin'],                       // Kategoriyalar
    '/admin/orders':     ['admin', 'seller', 'courier'],  // Buyurtmalar
    '/admin/returns':    ['admin'],                       // Qaytarishlar — Phase 3.6
    '/admin/defects':    ['admin'],                       // Defektlar
    '/admin/kassa':      ['admin'],                       // Kassa
    '/admin/reports':    ['admin'],                       // Hisobotlar
    '/admin/banners':    ['admin'],                       // Bannerlar
    // ── ADMIN ko'rMAYDIGAN (faqat super-admin) ──
    '/admin':            <String>[],                      // Dashboard — faqat super
    '/admin/nasiya':     <String>[],                      // Nasiya — faqat super
    '/admin/users':      <String>[],                      // Foydalanuvchilar — faqat super
    '/admin/staff':      <String>[],                      // Xodimlar — faqat super
    '/admin/masters':    <String>[],                      // Ustalar — faqat super
    '/admin/settings':   <String>[],                      // Sozlamalar — faqat super
    // ── Sotuvchi tablari (admin ko'rMAYDI) ──
    '/admin/pos':        ['seller'],                      // POS — sotuvchi
    '/admin/stock':      ['seller'],                      // Ombor — sotuvchi
  };

  /// Birinchi mos keladigan tabni tanlash uchun tartib (saytdagi _ALL_TABS tartibi).
  /// seller → pos, courier → orders, admin/super → dashboard.
  // Landing tartibi saytdagi _ALL_TABS bilan moslashtirilgan:
  //   super → /admin (dashboard), admin → /admin/orders, sotuvchi → /admin/pos,
  //   kuryer → /admin/orders.
  static const List<String> _order = [
    '/admin',            // dashboard (super)
    '/admin/pos',        // seller
    '/admin/orders',     // admin/seller/courier
    '/admin/users',
    '/admin/products',
    '/admin/categories',
    '/admin/banners',
    '/admin/kassa',
    '/admin/nasiya',
    '/admin/reports',
    '/admin/stock',
    '/admin/settings',
    '/admin/staff',
    '/admin/masters',
  ];

  /// Berilgan route'ni shu role/super ko'ra oladimi?
  /// Saytdagi canSeeTab bilan bir xil.
  static bool canSee(String route, {String? role, required bool isSuper}) {
    if (isSuper) return true;
    if (role == null || role.isEmpty) return false;
    final allowed = _routeRoles[route];
    if (allowed == null) return true;     // xaritada yo'q → ruxsat
    return allowed.contains(role);        // bo'sh ro'yxat → false (faqat super)
  }

  /// Chuqur route'ni (masalan '/admin/orders/123/route') ma'lum bazaviy
  /// route'ga keltiradi — eng uzun mos keladigan kalit bo'yicha.
  static String _resolveBase(String loc) {
    String best = loc;
    int bestLen = -1;
    for (final key in _routeRoles.keys) {
      if ((loc == key || loc.startsWith('$key/')) && key.length > bestLen) {
        best = key;
        bestLen = key.length;
      }
    }
    return best;
  }

  /// Joriy URL (params bilan) shu role uchun ruxsatlimi?
  static bool canSeeLocation(String loc,
          {String? role, required bool isSuper}) =>
      canSee(_resolveBase(loc), role: role, isSuper: isSuper);

  /// Rol uchun birinchi ruxsat etilgan route (login'dan keyin yo'naltirish uchun).
  /// Hech narsa yo'q bo'lsa fallback '/admin/orders' (saytdagi `?? 'orders'`).
  static String firstAllowedRoute({String? role, required bool isSuper}) {
    for (final route in _order) {
      if (canSee(route, role: role, isSuper: isSuper)) return route;
    }
    return '/admin/orders';
  }
}
