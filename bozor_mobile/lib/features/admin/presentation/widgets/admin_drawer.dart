import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/injection_container.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../utils/admin_access.dart';

/// Saytdagi admin sidebar'ining mobil ko'rinishi.
/// Har bir admin sahifasida `drawer:` sifatida ishlatiladi.
class AdminDrawer extends StatelessWidget {
  const AdminDrawer({super.key});

  static const Color _brandDark = Color(0xFF063F2B);
  static const Color _brand = Color(0xFF0A7C55);

  static const List<_NavGroup> _groups = [
    _NavGroup('ASOSIY', [
      _NavItem('Dashboard', Icons.dashboard_rounded, '/admin'),
      _NavItem('Hisobotlar', Icons.bar_chart_rounded, '/admin/reports'),
    ]),
    _NavGroup('SAVDO', [
      _NavItem("Do'kon (POS)", Icons.point_of_sale_rounded, '/admin/pos'),
      _NavItem('Buyurtmalar', Icons.local_shipping_rounded, '/admin/orders'),
      // Phase 3.6 — Qaytarishlar
      _NavItem('Qaytarishlar', Icons.assignment_return_rounded, '/admin/returns'),
      _NavItem('Defektlar', Icons.dangerous_rounded, '/admin/defects'),
      _NavItem('Nasiya', Icons.calendar_month_rounded, '/admin/nasiya'),
      _NavItem('Moliya / Kassa', Icons.account_balance_wallet_rounded, '/admin/kassa'),
    ]),
    _NavGroup('OMBOR', [
      _NavItem('Zaxira holati', Icons.warehouse_rounded, '/admin/stock'),
    ]),
    _NavGroup('KATALOG', [
      _NavItem('Mahsulotlar', Icons.inventory_2_rounded, '/admin/products'),
      _NavItem('Kategoriyalar', Icons.category_rounded, '/admin/categories'),
      _NavItem('Bannerlar', Icons.view_carousel_rounded, '/admin/banners'),
    ]),
    _NavGroup('TIZIM', [
      // Phase 3.2 — Foydalanuvchilar (saytdagi Users tab ekvivalenti)
      _NavItem('Foydalanuvchilar', Icons.groups_rounded, '/admin/users'),
      _NavItem('Xodimlar', Icons.manage_accounts_rounded, '/admin/staff'),
      _NavItem('Ustalar', Icons.construction_rounded, '/admin/masters'),
      _NavItem('Sozlamalar', Icons.settings_rounded, '/admin/settings'),
    ]),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final current = GoRouterState.of(context).matchedLocation;

    // ── Rolega qarab navigatsiyani filtrlash (saytdagi canSeeTab bilan bir xil) ──
    final authState = sl<AuthBloc>().state;
    final String? role =
        authState is AuthAuthenticated ? authState.role : null;
    final bool isSuper =
        authState is AuthAuthenticated ? authState.isSuper : false;

    // Faqat shu role ko'ra oladigan itemlarni qoldiramiz; bo'sh guruhlar tushib qoladi.
    final visibleGroups = <_NavGroup>[
      for (final group in _groups)
        if (group.items
            .where((i) =>
                AdminAccess.canSee(i.route, role: role, isSuper: isSuper))
            .isNotEmpty)
          _NavGroup(
            group.title,
            group.items
                .where((i) =>
                    AdminAccess.canSee(i.route, role: role, isSuper: isSuper))
                .toList(),
          ),
    ];

    return Drawer(
      backgroundColor: theme.colorScheme.surface,
      child: SafeArea(
        child: Column(
          children: [
            // ── Logo / brand header ──
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_brandDark, _brand],
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.admin_panel_settings_rounded,
                        color: Colors.white, size: 26),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('700Mobile Admin',
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          )),
                      Text('Boshqaruv paneli',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: Colors.white70)),
                    ],
                  ),
                ],
              ),
            ),

            // ── Navigatsiya ──
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
                children: [
                  for (final group in visibleGroups) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                      child: Text(
                        group.title,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant
                              .withValues(alpha: 0.6),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                        ),
                      ),
                    ),
                    for (final item in group.items)
                      _DrawerTile(
                        item: item,
                        active: current == item.route,
                        brand: _brand,
                        onTap: () {
                          final navigateTo =
                              current != item.route ? item.route : null;
                          Navigator.pop(context); // drawer'ni yopish
                          // Navigatsiyani drawer yopilgandan KEYIN (keyingi frame)
                          // bajaramiz — aks holda pop + go bir vaqtda Navigator'ni
                          // qulflaydi ('!_debugLocked' assertion xatosi).
                          if (navigateTo != null) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              context.go(navigateTo);
                            });
                          }
                        },
                      ),
                  ],
                ],
              ),
            ),

            const Divider(height: 1),

            // ── Footer: faqat "Chiqish" ──
            Padding(
              padding: const EdgeInsets.all(12),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => _confirmLogout(context),
                  icon: const Icon(Icons.logout_rounded, size: 18),
                  label: const Text('Chiqish'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.error,
                    side: BorderSide(
                        color: theme.colorScheme.error.withValues(alpha: 0.4)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    Navigator.pop(context); // drawer
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tizimdan chiqish'),
        content: const Text('Haqiqatan ham tizimdan chiqmoqchimisiz?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Chiqish'),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true) {
        sl<AuthBloc>().add(const LogoutEvent());
      }
    });
  }
}

class _DrawerTile extends StatelessWidget {
  const _DrawerTile({
    required this.item,
    required this.active,
    required this.brand,
    required this.onTap,
  });

  final _NavItem item;
  final bool active;
  final Color brand;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: active ? brand.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(item.icon,
                    size: 21,
                    color: active ? brand : theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: 14),
                Text(
                  item.label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: active ? brand : theme.colorScheme.onSurface,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavGroup {
  final String title;
  final List<_NavItem> items;
  const _NavGroup(this.title, this.items);
}

class _NavItem {
  final String label;
  final IconData icon;
  final String route;
  const _NavItem(this.label, this.icon, this.route);
}
