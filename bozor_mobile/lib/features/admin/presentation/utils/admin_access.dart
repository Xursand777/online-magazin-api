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
  static const Map<String, List<String>> _routeRoles = {
    '/admin':            ['admin'],                       // dashboard
    '/admin/reports':    ['admin'],                       // reports
    '/admin/pos':        ['admin', 'seller'],             // pos
    '/admin/orders':     ['admin', 'seller', 'courier'],  // orders
    '/admin/nasiya':     ['admin'],                       // nasiya
    '/admin/kassa':      ['admin'],                       // kassa
    '/admin/stock':      ['admin', 'seller'],             // stock
    '/admin/products':   ['admin'],                       // products
    '/admin/categories': ['admin'],                       // categories
    '/admin/banners':    ['admin'],                       // banners
    '/admin/users':      ['admin'],                       // users
    '/admin/staff':      <String>[],                      // faqat super
    '/admin/masters':    <String>[],                      // faqat super
    '/admin/settings':   ['admin'],                       // sozlamalar
  };

  /// Birinchi mos keladigan tabni tanlash uchun tartib (saytdagi _ALL_TABS tartibi).
  /// seller → pos, courier → orders, admin/super → dashboard.
  static const List<String> _order = [
    '/admin',
    '/admin/reports',
    '/admin/pos',
    '/admin/orders',
    '/admin/nasiya',
    '/admin/kassa',
    '/admin/stock',
    '/admin/products',
    '/admin/categories',
    '/admin/banners',
    '/admin/users',
    '/admin/staff',
    '/admin/masters',
    '/admin/settings',
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
