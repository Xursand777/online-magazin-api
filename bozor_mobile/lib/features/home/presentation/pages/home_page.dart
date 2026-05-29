import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/widgets/product_card.dart';
import '../bloc/home_bloc.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/models/product_model.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => sl<HomeBloc>()..add(LoadHomeData()),
      child: const HomeView(),
    );
  }
}

class HomeView extends StatelessWidget {
  const HomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: _buildAppBar(theme),
      body: BlocBuilder<HomeBloc, HomeState>(
        builder: (context, state) {
          if (state.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.error != null) {
            return Center(child: Text('Error: ${state.error}'));
          }

          return RefreshIndicator(
            onRefresh: () async {
              context.read<HomeBloc>().add(LoadHomeData());
            },
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              children: [
                _buildAdvertisementBanner(context, state, theme),
                const SizedBox(height: 24),
                _buildCategoryChips(state, theme),
                const SizedBox(height: 24),
                if (state.recommended.isNotEmpty) ...[
                  _buildSectionHeader(
                    context,
                    'Tavsiya qilamiz',
                    'recommended',
                    theme,
                    state.recommended,
                  ),
                  const SizedBox(height: 16),
                  _buildProductCarousel(state.recommended, theme),
                  const SizedBox(height: 24),
                ],
                if (state.discounted.isNotEmpty) ...[
                  _buildSectionHeader(
                    context,
                    'Chegirmadagi mahsulotlar',
                    'discount',
                    theme,
                    state.discounted,
                  ),
                  const SizedBox(height: 16),
                  _buildProductCarousel(state.discounted, theme),
                  const SizedBox(height: 24),
                ],
                if (state.newProducts.isNotEmpty) ...[
                  _buildSectionHeader(
                    context,
                    'Yangi mahsulotlar',
                    'new',
                    theme,
                    state.newProducts,
                  ),
                  const SizedBox(height: 16),
                  _buildProductCarousel(state.newProducts, theme),
                  const SizedBox(height: 24),
                ],
                if (state.popularProducts.isNotEmpty) ...[
                  _buildSectionHeader(
                    context,
                    'Ommabop mahsulotlar',
                    'popular',
                    theme,
                    state.popularProducts,
                  ),
                  const SizedBox(height: 16),
                  _buildProductCarousel(state.popularProducts, theme),
                  const SizedBox(height: 24),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(ThemeData theme) {
    return AppBar(
      title: Text(
        'Bozor',
        style: theme.textTheme.headlineMedium?.copyWith(
          color: theme.colorScheme.primary,
          fontWeight: FontWeight.w900,
        ),
      ),
      actions: [
        IconButton(icon: const Icon(Icons.grid_view), onPressed: () {}),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(60),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Row(
              children: [
                const SizedBox(width: 12),
                Icon(Icons.search, color: theme.colorScheme.outline),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Qidirish...',
                      border: InputBorder.none,
                      hintStyle: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.outline,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAdvertisementBanner(
    BuildContext context,
    HomeState state,
    ThemeData theme,
  ) {
    final fallbackProducts = [
      ...state.discounted,
      ...state.recommended,
      ...state.newProducts,
      ...state.popularProducts,
    ];

    if (state.banners.isEmpty) {
      if (fallbackProducts.isEmpty) {
        return const SizedBox.shrink();
      }
      final product = fallbackProducts.first;
      return _buildFallbackBanner(context, product, theme);
    }

    return AspectRatio(
      aspectRatio: 21 / 9,
      child: PageView.builder(
        itemCount: state.banners.length,
        itemBuilder: (context, index) {
          final banner = state.banners[index];
          return Container(
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: theme.colorScheme.surfaceContainer,
              image: DecorationImage(
                image: CachedNetworkImageProvider(banner.imageUrl),
                fit: BoxFit.cover,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFallbackBanner(
    BuildContext context,
    ProductModel product,
    ThemeData theme,
  ) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () => context.push('/product', extra: product),
      child: Container(
        constraints: const BoxConstraints(minHeight: 190),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [Color(0xFF063F2B), Color(0xFF0A7C55)],
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.14),
              blurRadius: 24,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              right: -28,
              bottom: -42,
              child: Container(
                width: 174,
                height: 174,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.12),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            'Reklama',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          product.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            height: 1.08,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          _formatMoney(product.price),
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: const Color(0xFFFFD166),
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Mahsulotni ko‘rish',
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 128,
                    height: 128,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryChips(HomeState state, ThemeData theme) {
    if (state.categories.isEmpty) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: state.categories.map((category) {
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ActionChip(
              label: Text(category.name),
              onPressed: () {},
              backgroundColor: theme.colorScheme.surfaceContainer,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
                side: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context,
    String title,
    String sectionKey,
    ThemeData theme,
    List<ProductModel> products,
  ) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        TextButton(
          onPressed: () {
            context.push(
              '/see-all',
              extra: {
                'title': title,
                'sectionKey': sectionKey,
                'products': products,
              },
            );
          },
          child: Text(
            'Barchasini ko‘rish',
            style: theme.textTheme.labelLarge?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProductCarousel(List products, ThemeData theme) {
    if (products.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 296, // slightly taller to accommodate ProductCard correctly and prevent overflow
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none, // To prevent shadow clipping
        itemCount: products.length,
        itemBuilder: (context, index) {
          final product = products[index];
          return Padding(
            padding: const EdgeInsets.only(right: 16),
            child: SizedBox(
              width: 180,
              child: ProductCard(product: product),
            ), // Increased width slightly
          );
        },
      ),
    );
  }

  String _formatMoney(double value) {
    return '${NumberFormat('#,###', 'uz_UZ').format(value).replaceAll(',', ' ')} so‘m';
  }
}
