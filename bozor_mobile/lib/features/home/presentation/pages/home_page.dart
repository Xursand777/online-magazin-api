import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/i18n/language_extension.dart';
import '../../../../core/widgets/product_card.dart';
import '../../../../core/widgets/skeleton.dart';
import '../bloc/home_bloc.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/models/banner_model.dart';
import '../../../search/presentation/widgets/search_bar_stub.dart';


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
          final theme = Theme.of(context);
          // Phase 1.5: isLoading faqat birinchi marta (cache yo'q) ko'rinadi.
          // Keshlangan ma'lumot bor bo'lsa — darhol UI, isStale=true banner.
          if (state.isLoading) {
            return const HomePageSkeleton();
          }
          // Cache yo'q va tarmoq xato — to'liq error sahifa
          if (state.error != null && state.banners.isEmpty && state.recommended.isEmpty) {
            return _buildErrorPage(context, state.error!);
          }

          return RefreshIndicator(
            onRefresh: () async {
              // Force refresh — kesh chetlanadi, to'g'ridan-to'g'ri tarmoq
              context.read<HomeBloc>().add(const LoadHomeData(forceRefresh: true));
            },
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              children: [
                // Phase 1.5 — Oflayn banner: keshlangan ma'lumot va tarmoq xato
                if (state.error != null && state.isStale)
                  _buildOfflineBanner(context, state, theme),
                _buildAdvertisementBanner(context, state, theme),
                const SizedBox(height: 24),
                _buildCategoryChips(context, state, theme),
                const SizedBox(height: 24),
                if (state.recommended.isNotEmpty) ...[
                  _buildSectionHeader(context, context.tr('home.recommended'), theme),
                  const SizedBox(height: 16),
                  _buildProductGrid(context, context.tr('home.recommended'), 'recommended', state.recommended, theme),
                  const SizedBox(height: 24),
                ],
                if (state.discounted.isNotEmpty) ...[
                  _buildSectionHeader(context, context.tr('home.discounts'), theme),
                  const SizedBox(height: 16),
                  _buildProductGrid(context, context.tr('home.discounts'), 'discount', state.discounted, theme),
                  const SizedBox(height: 24),
                ],
                if (state.newProducts.isNotEmpty) ...[
                  _buildSectionHeader(context, context.tr('home.new'), theme),
                  const SizedBox(height: 16),
                  _buildProductGrid(context, context.tr('home.new'), 'new', state.newProducts, theme),
                  const SizedBox(height: 24),
                ],
                if (state.popularProducts.isNotEmpty) ...[
                  _buildSectionHeader(context, context.tr('home.popular'), theme),
                  const SizedBox(height: 16),
                  _buildProductGrid(context, context.tr('home.popular'), 'popular', state.popularProducts, theme),
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
          // Tap-to-open search bar — saytdagi kabi alohida search sahifaga
          // o'tadi. Hero animatsiyasi orqali silliq o'tish (Amazon uslubi).
          child: const SearchBarStub(),
        ),
      ),
    );
  }

  Widget _buildAdvertisementBanner(
    BuildContext context,
    HomeState state,
    ThemeData theme,
  ) {
    if (state.banners.isEmpty) {
      // Fallback: bannersiz holda birinchi chegirma mahsulotni ko'rsatamiz
      final fallback = [
        ...state.discounted,
        ...state.recommended,
        ...state.newProducts,
      ];
      if (fallback.isEmpty) return const SizedBox.shrink();
      return _buildFallbackBanner(context, fallback.first, theme);
    }

    return _BannerCarousel(banners: state.banners);
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

  Widget _buildCategoryChips(BuildContext context, HomeState state, ThemeData theme) {
    if (state.categories.isEmpty) return const SizedBox.shrink();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: state.categories.map((category) {
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ActionChip(
              label: Text(category.name),
              // ─── Kategoriya bosilganda mahsulotlar sahifasiga o'tamiz ───
              // Sayt bilan bir xil — categoryId + name CategoryProductsPage'ga
              // uzatiladi va u backend'dan filtrlanan mahsulotlarni oladi.
              onPressed: () {
                context.push('/category/${category.id}', extra: category.name);
              },
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
    ThemeData theme,
  ) {
    return Text(
      title,
      style: theme.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.bold,
        fontSize: 18,
      ),
    );
  }

  Widget _buildProductGrid(
    BuildContext context,
    String title,
    String sectionKey,
    List<ProductModel> products,
    ThemeData theme,
  ) {
    if (products.isEmpty) return const SizedBox.shrink();

    // Faqat 6 tasini ko'rsatamiz
    final displayProducts = products.take(6).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisExtent: 320, // Ixcham va chiroyli balandlik
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
          ),
          itemCount: displayProducts.length,
          itemBuilder: (context, index) {
            return ProductCard(product: displayProducts[index]);
          },
        ),
        const SizedBox(height: 16),
        // Barchasini ko'rish tugmasi
        ElevatedButton(
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
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: theme.colorScheme.primary,
            elevation: 0,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: theme.colorScheme.primary.withOpacity(0.3)),
            ),
          ),
          child: const Text(
            'Barchasini ko\'rish',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  String _formatMoney(double value) {
    return '${NumberFormat('#,###', 'uz_UZ').format(value).replaceAll(',', ' ')} so\'m';
  }

  /// Phase 1.5 — Oflayn ko'rsatkichi.
  ///
  /// Keshlangan ma'lumot bor + tarmoq xato bo'lganda ko'rinadi.
  /// Foydalanuvchiga bildiriladi: ma'lumot eski, lekin foydalanish mumkin.
  Widget _buildOfflineBanner(BuildContext context, HomeState state, ThemeData theme) {
    final ageDisplay = state.cacheAgeDisplay ?? 'allaqachon';
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFC107).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFFFFC107).withValues(alpha: 0.5),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined, size: 18, color: Color(0xFFB28704)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Oflayn — keshlangan ma'lumot",
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: const Color(0xFF7A5F00),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  "Oxirgi yangilanish: $ageDisplay",
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: const Color(0xFF7A5F00).withValues(alpha: 0.8),
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: () {
              context.read<HomeBloc>().add(const LoadHomeData(forceRefresh: true));
            },
            icon: const Icon(Icons.refresh, size: 16),
            label: Text(context.tr('common.retry')),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF7A5F00),
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: const Size(0, 32),
            ),
          ),
        ],
      ),
    );
  }

  /// To'liq xato sahifa — kesh ham yo'q, tarmoq ham yo'q.
  Widget _buildErrorPage(BuildContext context, String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 72, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              context.tr('error.network'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              error,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.grey, fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () {
                context.read<HomeBloc>().add(const LoadHomeData(forceRefresh: true));
              },
              icon: const Icon(Icons.refresh),
              label: Text(context.tr('common.retry')),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Premium Banner Carousel ──────────────────────────────────────────────────
// Backend API'dan kelgan banner ma'lumotlarini ajoyib dizayn bilan ko'rsatadi.
// • Auto-scroll: har 4 soniyada avtomatik siljiydi
// • Backend ranglari: background_color va accent_color ishlatiladi
// • Chegirma badge: chegirma foizini ko'rsatadi
// • Narx: original va chegirma narxini ko'rsatadi
// • Mahsulot rasmi: product_image_url dan olinadi

class _BannerCarousel extends StatefulWidget {
  const _BannerCarousel({required this.banners});
  final List<BannerModel> banners;

  @override
  State<_BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<_BannerCarousel> {
  late final PageController _pageController;
  int _current = 0;

  @override
  void initState() {
    super.initState();
    // 1.0 viewport so side banners don't peek out
    _pageController = PageController(viewportFraction: 1.0);
    if (widget.banners.length > 1) {
      Future.delayed(const Duration(seconds: 4), _autoScroll);
    }
  }

  void _autoScroll() {
    if (!mounted) return;
    _pageController.nextPage(
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeInOutCubic,
    );
    Future.delayed(const Duration(seconds: 4), _autoScroll);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 210,
          child: PageView.builder(
            controller: _pageController,
            itemCount: widget.banners.length > 1 ? null : widget.banners.length, // null for infinite loop
            onPageChanged: (i) {
              setState(() => _current = i % widget.banners.length);
            },
            itemBuilder: (ctx, i) {
              final index = i % widget.banners.length;
              return _BannerCard(banner: widget.banners[index]);
            },
          ),
        ),
        if (widget.banners.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(widget.banners.length, (i) {
              final active = i == _current;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: active ? 22 : 7,
                height: 7,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(4),
                  color: active
                      ? const Color(0xFF0A7C55)
                      : const Color(0xFF0A7C55).withValues(alpha: 0.25),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({required this.banner});
  final BannerModel banner;

  @override
  Widget build(BuildContext context) {
    final bgColor = Color(banner.backgroundColorInt);
    final accentColor = Color(banner.accentColorInt);
    final hasDiscount = banner.discountPercent > 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16), // Kattaroq margin
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () {
            if (banner.productId == null) return;
            final product = ProductModel(
              id: banner.productId!,
              name: banner.productName ?? banner.title,
              description: banner.subtitle ?? '',
              price: banner.discountPrice ?? banner.originalPrice ?? 0.0,
              oldPrice: (banner.discountPrice != null) ? banner.originalPrice : null,
              imageUrl: banner.productImageUrl ?? banner.backgroundImageUrl ?? '',
              rating: 5.0,
              isNew: false,
              discountPercent: hasDiscount ? banner.discountPercent.toInt() : null,
            );
            context.push('/product', extra: product);
          },
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Stack(
              children: [
                // ── Fon ───────────────────────────────────────────────────────────
                if (banner.backgroundImageUrl != null)
                  Positioned.fill(
                    child: CachedNetworkImage(
                      imageUrl: banner.backgroundImageUrl!,
                      fit: BoxFit.cover,
                    ),
                  )
                else
                  Positioned.fill(
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            bgColor,
                            Color.lerp(bgColor, accentColor, 0.55)!,
                          ],
                        ),
                      ),
                    ),
                  ),

                // Dekorativ doira (o'ng pastda)
                Positioned(
                  right: -30,
                  bottom: -40,
                  child: Container(
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                ),
                Positioned(
                  right: 40,
                  top: -20,
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.06),
                    ),
                  ),
                ),

                // ── Mahsulot rasmi ────────────────────────────────────────────────
                if (banner.productImageUrl != null)
                  Positioned(
                    right: 12,
                    top: 0,
                    bottom: 0,
                    width: 140,
                    child: Center(
                      child: CachedNetworkImage(
                        imageUrl: banner.productImageUrl!,
                        fit: BoxFit.contain,
                        alignment: Alignment.center,
                        errorWidget: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  ),

                // ── Matn qismi (chapda) ───────────────────────────────────────────
                Positioned(
                  left: 18,
                  top: 14,
                  bottom: 14,
                  right: banner.productImageUrl != null ? 135 : 16,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Chegirma badge
                      if (hasDiscount)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          margin: const EdgeInsets.only(bottom: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFD166),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '-${banner.discountPercent.toInt()}%',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF1A1A1A),
                            ),
                          ),
                        ),

                      // Sarlavha
                      Text(
                        banner.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14, // Kichiklashtirildi
                          fontWeight: FontWeight.w900,
                          height: 1.15,
                        ),
                      ),

                      // Qo'shimcha matn
                      if (banner.subtitle != null && banner.subtitle!.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          banner.subtitle!,
                          maxLines: 4, // 4 qatorgacha ruxsat
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 11, // Kichiklashtirildi
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],

                      // Narx
                      if (banner.discountPrice != null ||
                          banner.originalPrice != null) ...[
                        const SizedBox(height: 10),
                        if (hasDiscount && banner.originalPrice != null)
                          Text(
                            _fmt(banner.originalPrice!),
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.65),
                              fontSize: 11, // Kichiklashtirildi
                              fontWeight: FontWeight.w600,
                              decoration: TextDecoration.lineThrough,
                              decorationColor: Colors.white54,
                            ),
                          ),
                        Text(
                          _fmt(banner.discountPrice ?? banner.originalPrice!),
                          style: const TextStyle(
                            color: Color(0xFFFFD166),
                            fontSize: 15, // Kichiklashtirildi
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _fmt(double v) {
    return '${NumberFormat('#,###').format(v).replaceAll(',', ' ')} so\'m';
  }
}

// _SearchBarStub olib tashlandi — endi SearchInputBar + SearchOverlay
// ishlatiladi (alohida search sahifasi emas, inline dropdown).
