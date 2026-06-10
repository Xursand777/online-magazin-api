import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/auth/presentation/pages/auth_page.dart';
import '../../features/home/presentation/pages/home_page.dart';
import '../../features/catalog/presentation/pages/catalog_page.dart';
import '../../features/cart/presentation/pages/cart_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';
import '../../features/catalog/presentation/pages/category_products_page.dart';
import '../../features/product_detail/presentation/pages/product_detail_page.dart';
import '../../features/home/presentation/pages/see_all_products_page.dart';
import '../../features/checkout/presentation/pages/checkout_page.dart';
import '../../features/search/presentation/pages/search_page.dart';
import '../../features/search/presentation/pages/search_results_page.dart';
import '../../features/admin/presentation/pages/admin_shell.dart';
import '../../features/admin/presentation/pages/admin_dashboard_page.dart';
import '../../features/admin/presentation/pages/admin_orders_page.dart';
import '../../features/admin/presentation/pages/admin_pos_page.dart';
import '../../features/admin/presentation/pages/admin_products_page.dart';
import '../../features/admin/presentation/pages/admin_categories_page.dart';
import '../../features/admin/presentation/pages/admin_banners_page.dart';
import '../../features/admin/presentation/pages/admin_kassa_page.dart';
import '../../features/admin/presentation/pages/admin_nasiya_page.dart';
import '../../features/admin/presentation/pages/admin_report_page.dart';
import '../../features/admin/presentation/pages/admin_settings_page.dart';
import '../../features/admin/presentation/pages/admin_masters_page.dart';
import '../../features/admin/presentation/pages/admin_staff_page.dart';
import '../../features/admin/presentation/pages/admin_stock_page.dart';
import '../../features/admin/presentation/bloc/admin_dashboard_bloc.dart';
import '../../features/admin/presentation/bloc/admin_orders_bloc.dart';
import '../../features/admin/presentation/bloc/admin_pos_bloc.dart';
import '../../features/admin/presentation/bloc/admin_kassa_bloc.dart';
import '../../features/admin/presentation/bloc/admin_nasiya_bloc.dart';
import '../../features/admin/presentation/bloc/admin_report_bloc.dart';
import '../../features/admin/presentation/bloc/admin_settings_bloc.dart';
import '../../features/admin/presentation/bloc/admin_master_bloc.dart';
import '../../features/admin/presentation/bloc/admin_staff_bloc.dart';
import '../../features/admin/presentation/bloc/admin_stock_bloc.dart';
import '../di/injection_container.dart';
import '../../core/models/product_model.dart';
import '../widgets/main_screen.dart';
import '../../features/profile/presentation/pages/my_orders_page.dart';
import '../../features/profile/presentation/pages/favorites_page.dart';
import '../../features/profile/presentation/pages/profile_edit_page.dart';
import '../../features/profile/presentation/cubit/my_orders_cubit.dart';

// ── Auth Notifier ──────────────────────────────────────────────────────────
// AuthBloc state o'zgarganda GoRouter'ga xabar beradi — redirect qayta tekshiriladi.

class _AuthChangeNotifier extends ChangeNotifier {
  _AuthChangeNotifier(Stream<AuthState> stream) {
    notifyListeners();
    _sub = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

// ── AppRouter ──────────────────────────────────────────────────────────────

class AppRouter {
  final AuthBloc _authBloc;
  late final _AuthChangeNotifier _notifier;
  late final GoRouter router;

  AppRouter({required AuthBloc authBloc}) : _authBloc = authBloc {
    _notifier = _AuthChangeNotifier(_authBloc.stream);

    router = GoRouter(
      navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'root'),
      initialLocation: '/',

      // GoRouter bu ChangeNotifier'ni kuzatadi.
      // AuthBloc state o'zgargan har safar redirect qayta ishga tushadi.
      refreshListenable: _notifier,

      // ── Auth Guard (Amazon/Wildberries uslubi — guest browsing) ──────────
      //
      // YANGI YONDASHUV: mobile sayt'dagi kabi ishlaydi:
      //   • Guest — Home, Catalog, Product, Cart, Search hammasini KO'RADI
      //   • Login faqat aniq joylarda so'raladi:
      //     - Profile tab → guest UI ko'rinadi (login CTA bilan)
      //     - Cart "Rasmiylashtirish" → login modal
      //     - Quick Buy → login modal
      //     - Admin sahifalar → /auth ga redirect
      //
      // Bosqichlar:
      //   1. AuthInitial | AuthLoading → kutamiz
      //   2. Login bo'lgan foydalanuvchi:
      //        a. Admin: hamisha /admin (boshqa sahifaga ruxsat yo'q)
      //        b. Oddiy:
      //           - /auth da bo'lsa: ?redirect=/xxx ga yoki home'ga
      //           - /admin da bo'lsa: home'ga (admin emas)
      //   3. Mehmon:
      //        - /admin da bo'lsa: /auth ga (admin yo'q)
      //        - Boshqa hamma narsa OCHIQ
      redirect: (context, state) {
        final authState = _authBloc.state;
        final loc       = state.matchedLocation;

        // 1. Hali tekshirilmoqda — kutamiz
        if (authState is AuthInitial || authState is AuthLoading) return null;

        final isLoggedIn   = authState is AuthAuthenticated;
        final isAuthRoute  = loc == '/auth';
        final isAdminRoute = loc.startsWith('/admin');

        if (isLoggedIn) {
          final isAdmin = authState.isAdmin;

          if (isAdmin) {
            // 2a. Admin — hamisha admin panelga
            if (isAuthRoute) return '/admin';
            if (!isAdminRoute) return '/admin';
          } else {
            // 2b. Oddiy foydalanuvchi — doim Home (/) sahifasiga
            if (isAuthRoute) return '/';
            // Oddiy foydalanuvchi /admin sahifalariga kirolmaydi
            if (isAdminRoute) return '/';
          }
        } else {
          // 3. MEHMON — faqat admin sahifa bloklanadi
          if (isAdminRoute) return '/auth';
          // Boshqa hammasi (Home, Catalog, Cart, Profile, Product, Search) — OCHIQ
        }

        return null;
      },

      routes: [
        // ── Auth ─────────────────────────────────────────────────────────────
        GoRoute(
          path: '/auth',
          builder: (context, _) => const AuthPage(),
        ),

        // ── Admin panel (sidebar/drawer navigatsiya) ────────────────────────────
        // ShellRoute AdminBloc'ni (CRUD katalog) butun admin daraxtiga ta'minlaydi.
        // Har bir sahifa o'z Scaffold'iga ega bo'lib, AdminDrawer orqali navigatsiya.
        ShellRoute(
          builder: (context, state, child) => AdminShell(child: child),
          routes: [
            GoRoute(
              path: '/admin',
              builder: (context, _) => BlocProvider(
                create: (_) =>
                    sl<AdminDashboardBloc>()..add(const LoadDashboard()),
                child: const AdminDashboardPage(),
              ),
            ),
            GoRoute(
              path: '/admin/settings',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminSettingsBloc>()..add(LoadAdminSettings()),
                child: const AdminSettingsPage(),
              ),
            ),
            GoRoute(
              path: '/admin/pos',
              builder: (context, _) => BlocProvider(
                create: (_) =>
                    sl<AdminPosBloc>()..add(const LoadPosProducts()),
                child: const AdminPosPage(),
              ),
            ),
            GoRoute(
              path: '/admin/orders',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminOrdersBloc>()..add(const LoadOrders()),
                child: const AdminOrdersPage(),
              ),
            ),
            GoRoute(
              path: '/admin/products',
              builder: (context, _) => const AdminProductsPage(),
            ),
            GoRoute(
              path: '/admin/categories',
              builder: (context, _) => const AdminCategoriesPage(),
            ),
            GoRoute(
              path: '/admin/banners',
              builder: (context, _) => const AdminBannersPage(),
            ),
            GoRoute(
              path: '/admin/kassa',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminKassaBloc>()..add(LoadKassaData()),
                child: const AdminKassaPage(),
              ),
            ),
            GoRoute(
              path: '/admin/nasiya',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminNasiyaBloc>()..add(LoadNasiya()),
                child: const AdminNasiyaPage(),
              ),
            ),
            GoRoute(
              path: '/admin/reports',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminReportBloc>()..add(LoadReportData()),
                child: const AdminReportPage(),
              ),
            ),
            GoRoute(
              path: '/admin/masters',
              builder: (context, _) => BlocProvider(
                create: (_) =>
                    sl<AdminMasterBloc>()..add(const LoadMasters()),
                child: const AdminMastersPage(),
              ),
            ),
            GoRoute(
              path: '/admin/staff',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminStaffBloc>()..add(const LoadStaff()),
                child: const AdminStaffPage(),
              ),
            ),
            GoRoute(
              path: '/admin/stock',
              builder: (context, _) => BlocProvider(
                create: (_) => sl<AdminStockBloc>()..add(LoadAdminStock()),
                child: const AdminStockPage(),
              ),
            ),
          ],
        ),

        // ── Qidiruv sahifalari ───────────────────────────────────────────────
        // /search — full-page (eski fallback, hozir ishlatilmaydi).
        // /search-results — "Barchasini ko'rish" tugmasidan keladi, paginated.
        GoRoute(
          path: '/search',
          builder: (_, __) => const SearchPage(),
        ),
        GoRoute(
          path: '/search-results',
          builder: (_, state) {
            final query = state.uri.queryParameters['q'] ?? '';
            return SearchResultsPage(query: query);
          },
        ),

        // ── Detail sahifalar ──────────────────────────────────────────────────
        GoRoute(
          path: '/checkout',
          builder: (_, state) {
            final e = state.extra as Map<String, dynamic>;
            return CheckoutPage(
              isQuickBuy: e['isQuickBuy'] as bool,
              product: e['product'] as ProductModel?,
            );
          },
        ),
        GoRoute(
          path: '/product',
          builder: (_, state) =>
              ProductDetailPage(product: state.extra as ProductModel),
        ),
        GoRoute(
          path: '/see-all',
          builder: (_, state) {
            final e = state.extra as Map<String, dynamic>;
            return SeeAllProductsPage(
              title:      e['title']      as String,
              sectionKey: e['sectionKey'] as String,
              products:   e['products']   as List<ProductModel>,
            );
          },
        ),
        GoRoute(
          path: '/my-orders',
          builder: (context, _) => BlocProvider(
            create: (_) => sl<MyOrdersCubit>()..loadOrders(),
            child: const MyOrdersPage(),
          ),
        ),
        GoRoute(
          path: '/favorites',
          builder: (context, _) => const FavoritesPage(),
        ),
        GoRoute(
          path: '/profile-edit',
          builder: (context, _) => const ProfileEditPage(),
        ),
        GoRoute(
          path: '/category/:id',
          builder: (_, state) {
            final id = int.parse(state.pathParameters['id']!);
            final name = state.extra as String? ?? 'Kategoriya';
            return CategoryProductsPage(categoryId: id, categoryName: name);
          },
        ),

        // ── Asosiy tab navigatsiya ─────────────────────────────────────────────
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => MainScreen(navigationShell: shell),
          branches: [
            StatefulShellBranch(
              navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'homeTab'),
              routes: [GoRoute(path: '/',        builder: (context, _) => const HomePage())],
            ),
            StatefulShellBranch(
              navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'catalogTab'),
              routes: [GoRoute(path: '/catalog', builder: (context, _) => const CatalogPage())],
            ),
            StatefulShellBranch(
              navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'cartTab'),
              routes: [GoRoute(path: '/cart',    builder: (context, _) => const CartPage())],
            ),
            StatefulShellBranch(
              navigatorKey: GlobalKey<NavigatorState>(debugLabel: 'profileTab'),
              routes: [GoRoute(path: '/profile', builder: (context, _) => const ProfilePage())],
            ),
          ],
        ),
      ],
    );
  }
}
