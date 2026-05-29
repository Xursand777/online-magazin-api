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
import '../../features/product_detail/presentation/pages/product_detail_page.dart';
import '../../features/home/presentation/pages/see_all_products_page.dart';
import '../../features/admin/presentation/pages/admin_shell.dart';
import '../../features/admin/presentation/pages/admin_dashboard_page.dart';
import '../../features/admin/presentation/pages/admin_orders_page.dart';
import '../../features/admin/presentation/pages/admin_pos_page.dart';
import '../../features/admin/presentation/pages/admin_products_page.dart';
import '../../features/admin/presentation/pages/admin_categories_page.dart';
import '../../features/admin/presentation/pages/admin_banners_page.dart';
import '../../features/admin/presentation/bloc/admin_dashboard_bloc.dart';
import '../../features/admin/presentation/bloc/admin_orders_bloc.dart';
import '../../features/admin/presentation/bloc/admin_pos_bloc.dart';
import '../di/injection_container.dart';
import '../../core/models/product_model.dart';
import '../widgets/main_screen.dart';

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

      // ── Auth Guard ────────────────────────────────────────────────────────
      redirect: (context, state) {
        final authState = _authBloc.state;
        final loc       = state.matchedLocation;

        // Hali tekshirilmoqda (app just started) — kutamiz
        if (authState is AuthInitial || authState is AuthLoading) return null;

        final isLoggedIn  = authState is AuthAuthenticated;
        final isAuthRoute = loc == '/auth';

        // Kirмagan → login sahifasiga
        if (!isLoggedIn && !isAuthRoute) return '/auth';

        // Kirgan + login sahifasida → asosiy sahifaga
        if (isLoggedIn && isAuthRoute) {
          if (authState case AuthAuthenticated(:final isAdmin)) {
            return isAdmin ? '/admin' : '/';
          }
        }

        return null; // Redirect kerak emas
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
          ],
        ),

        // ── Detail sahifalar ──────────────────────────────────────────────────
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
