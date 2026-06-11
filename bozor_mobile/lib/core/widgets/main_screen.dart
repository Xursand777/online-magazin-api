import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../features/cart/presentation/bloc/cart_bloc.dart';
import '../../features/profile/presentation/cubit/favorites_cubit.dart';
import '../../features/profile/presentation/cubit/favorites_state.dart';
import '../i18n/language_extension.dart';

/// Asosiy ilova tab konteyneri — Material 3 NavigationBar bilan 5 ta tab:
///   1. Home — bosh sahifa
///   2. Catalog — kategoriyalar va katalog
///   3. Favorites — sevimlilar (badge bilan)  ⭐ YANGI
///   4. Cart — savat (badge bilan)
///   5. Profile — foydalanuvchi profili
///
/// Cart va Favorites ikkalasi ham real-vaqt badge ko'rsatadi —
/// Wildberries/Amazon/Yandex Market kabi professional UX.
class MainScreen extends StatelessWidget {
  const MainScreen({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _onTap(BuildContext context, int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => _onTap(context, index),
        backgroundColor: theme.colorScheme.surface,
        indicatorColor: theme.colorScheme.primary.withValues(alpha: 0.1),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: context.tr('nav.home'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.grid_view_outlined),
            selectedIcon: const Icon(Icons.grid_view),
            label: context.tr('nav.catalog'),
          ),
          // ⭐ Favorites tab — sevimlilar soni bilan (badge real-time)
          BlocBuilder<FavoritesCubit, FavoritesState>(
            buildWhen: (prev, curr) {
              final p = prev is FavoritesLoaded ? prev.favorites.length : 0;
              final c = curr is FavoritesLoaded ? curr.favorites.length : 0;
              return p != c;
            },
            builder: (context, state) {
              final count = state is FavoritesLoaded ? state.favorites.length : 0;
              return NavigationDestination(
                icon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count.toString()),
                  child: const Icon(Icons.favorite_border),
                ),
                selectedIcon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count.toString()),
                  child: const Icon(Icons.favorite),
                ),
                label: context.tr('nav.favorites'),
              );
            },
          ),
          // 🛒 Cart tab — savat soni bilan
          BlocBuilder<CartBloc, CartState>(
            buildWhen: (prev, curr) =>
                prev.totalItemCount != curr.totalItemCount,
            builder: (context, state) {
              final count = state.totalItemCount;
              return NavigationDestination(
                icon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count.toString()),
                  child: const Icon(Icons.shopping_cart_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count.toString()),
                  child: const Icon(Icons.shopping_cart),
                ),
                label: context.tr('nav.cart'),
              );
            },
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: context.tr('nav.profile'),
          ),
        ],
      ),
    );
  }
}

