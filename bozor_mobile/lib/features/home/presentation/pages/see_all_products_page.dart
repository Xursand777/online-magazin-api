import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/widgets/product_card.dart';
import '../../../../core/widgets/product_grid_config.dart';
import '../../data/repositories/home_repository.dart';

/// "Barchasini ko'rish" — INFINITE SCROLL bilan (sahifalab yuklash).
///
/// MUAMMO (eski): butun bo'lim bir so'rovda yuklanardi — serverga og'ir,
/// telefon ham ko'p karta bir vaqtda render qilardi.
///
/// YECHIM: dastlab 40 ta, pastga scroll qilgan sari 40 tadan qo'shiladi
/// (Amazon/Wildberries uslubi). Har so'rov faqat bitta sahifa — server yengil.
class SeeAllProductsPage extends StatefulWidget {
  final String title;
  final String sectionKey;
  final List<ProductModel> products;

  const SeeAllProductsPage({
    super.key,
    required this.title,
    required this.sectionKey,
    required this.products,
  });

  @override
  State<SeeAllProductsPage> createState() => _SeeAllProductsPageState();
}

class _SeeAllProductsPageState extends State<SeeAllProductsPage> {
  static const int _pageSize = 40;

  final _scrollController = ScrollController();
  final List<ProductModel> _products = [];
  // Takrorlanmaslik uchun ko'rilgan kartalar kaliti (cardId yoki id).
  final Set<String> _seenKeys = {};

  int _page = 1;
  bool _hasMore = true;
  bool _initialLoading = true;
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    // Home'dan kelgan dastlabki mahsulotlar — bo'sh ekran ko'rinmasligi uchun
    // darhol ko'rsatamiz, so'ng 1-sahifa bilan almashtiramiz.
    for (final p in widget.products) {
      if (_seenKeys.add(_keyOf(p))) _products.add(p);
    }
    _scrollController.addListener(_onScroll);
    _loadFirstPage();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  String _keyOf(ProductModel p) => p.cardId ?? '${p.id}';

  Future<void> _loadFirstPage() async {
    final res = await sl<HomeRepository>().getSectionProductsPage(
      widget.sectionKey,
      page: 1,
      pageSize: _pageSize,
    );
    if (!mounted) return;
    setState(() {
      // 1-sahifa avtoritar — seed'ni almashtiramiz (tartib to'g'ri bo'lishi uchun).
      _products.clear();
      _seenKeys.clear();
      for (final p in res.items) {
        if (_seenKeys.add(_keyOf(p))) _products.add(p);
      }
      _page = 1;
      _hasMore = res.hasMore;
      _initialLoading = false;
    });
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    final res = await sl<HomeRepository>().getSectionProductsPage(
      widget.sectionKey,
      page: _page + 1,
      pageSize: _pageSize,
    );
    if (!mounted) return;
    setState(() {
      for (final p in res.items) {
        if (_seenKeys.add(_keyOf(p))) _products.add(p);
      }
      _page += 1;
      _hasMore = res.hasMore;
      _loadingMore = false;
    });
  }

  void _onScroll() {
    if (!_hasMore || _loadingMore) return;
    final pos = _scrollController.position;
    // Pastga 600px qolganda keyingi sahifani oldindan yuklaymiz (silliq oqim).
    if (pos.pixels >= pos.maxScrollExtent - 600) {
      _loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: AppBar(
        title: Text(
          widget.title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        backgroundColor: theme.colorScheme.surface,
        scrolledUnderElevation: 0,
      ),
      body: _initialLoading && _products.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _products.isEmpty
              ? _buildEmpty(theme)
              : CustomScrollView(
                  controller: _scrollController,
                  slivers: [
                    SliverToBoxAdapter(child: _buildHeader(theme)),
                    SliverPadding(
                      padding: productGridPadding,
                      sliver: SliverGrid.builder(
                        gridDelegate: productGridDelegate,
                        itemCount: _products.length,
                        itemBuilder: (context, index) {
                          return ProductCard(product: _products[index]);
                        },
                      ),
                    ),
                    // Pastki yuklash indikatori / oxiri belgisi.
                    SliverToBoxAdapter(child: _buildFooter(theme)),
                  ],
                ),
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: theme.colorScheme.primaryContainer.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          children: [
            Icon(_sectionIcon(widget.sectionKey),
                color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${_products.length} ta mahsulot${_hasMore ? '+' : ''}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
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

  Widget _buildFooter(ThemeData theme) {
    if (_loadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
        ),
      );
    }
    if (!_hasMore && _products.length > _pageSize) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Text(
            'Hammasi yuklandi (${_products.length} ta)',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      );
    }
    return const SizedBox(height: 16);
  }

  Widget _buildEmpty(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inventory_2_outlined,
              size: 64, color: theme.colorScheme.outline),
          const SizedBox(height: 16),
          Text(
            'Mahsulotlar topilmadi',
            style: theme.textTheme.bodyLarge
                ?.copyWith(color: theme.colorScheme.outline),
          ),
        ],
      ),
    );
  }

  IconData _sectionIcon(String sectionKey) {
    return switch (sectionKey) {
      'discount' => Icons.local_fire_department,
      'new' => Icons.new_releases,
      'popular' => Icons.trending_up,
      _ => Icons.recommend,
    };
  }
}
