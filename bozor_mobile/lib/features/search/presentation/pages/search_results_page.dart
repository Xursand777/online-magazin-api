import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/widgets/product_card.dart';
import '../../../../core/widgets/product_grid_config.dart';
import '../bloc/paginated_search_bloc.dart';

/// "Barchasini ko'rish" sahifasi — infinite scroll bilan to'liq natijalar.
///
/// Foydalanuvchi search dropdown'da "Barchasini katalogda ko'rish" tugmasini
/// bossa shu sahifa ochiladi. Mahsulotlar ko'p bo'lsa, pastga scroll qilgan
/// sari avtomatik yuklab oladi (Amazon/Wildberries/Yandex Market uslubi).
///
/// Backend: `/api/products/?q=...&page=N&expand_variants=true`
///   • Har sahifa 40 ta mahsulot (DRF pagination)
///   • Bir vaqtda 40 ta — server qotib qolmaydi
///   • Indexed query — millionlab mahsulot uchun ham tez
class SearchResultsPage extends StatelessWidget {
  final String query;

  const SearchResultsPage({super.key, required this.query});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) =>
          PaginatedSearchBloc(apiClient: sl())..add(StartSearch(query)),
      child: _SearchResultsView(query: query),
    );
  }
}

class _SearchResultsView extends StatefulWidget {
  final String query;
  const _SearchResultsView({required this.query});

  @override
  State<_SearchResultsView> createState() => _SearchResultsViewState();
}

class _SearchResultsViewState extends State<_SearchResultsView> {
  final ScrollController _scrollController = ScrollController();

  /// Pre-load threshold — chetiga 400px qolganda keyingi sahifani so'raymiz.
  /// Bu foydalanuvchi tushuncha bilan "yuklanmoqda" ko'rmasdan davom etishi
  /// uchun. Mashxur ilovalar 200-500px oralig'ini ishlatadi.
  static const double _preloadOffset = 400;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final remaining = _scrollController.position.maxScrollExtent -
        _scrollController.position.pixels;
    if (remaining < _preloadOffset) {
      context.read<PaginatedSearchBloc>().add(const LoadNextPage());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '"${widget.query}"',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: BlocBuilder<PaginatedSearchBloc, PaginatedSearchState>(
        builder: (context, state) {
          if (state.isLoading && state.products.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.error != null && state.products.isEmpty) {
            return _buildErrorState(context, state.error!);
          }
          if (state.products.isEmpty) {
            return _buildEmptyState(theme);
          }
          return _buildProductGrid(context, state, theme);
        },
      ),
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off_rounded,
                size: 64, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text("Hech narsa topilmadi",
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              "\"${widget.query}\" bo'yicha mahsulot topilmadi.\n"
              "Boshqacha qidirib ko'ring.",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────

  Widget _buildErrorState(BuildContext context, String message) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline_rounded,
                size: 56, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () =>
                  context.read<PaginatedSearchBloc>().add(const Retry()),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Product grid + infinite scroll ─────────────────────────────────────

  Widget _buildProductGrid(
      BuildContext context, PaginatedSearchState state, ThemeData theme) {
    return CustomScrollView(
      controller: _scrollController,
      slivers: [
        // Header — natija soni
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          sliver: SliverToBoxAdapter(
            child: Text(
              state.hasMore
                  ? "${state.products.length}+ ta natija"
                  : "${state.products.length} ta natija",
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
        // Grid — bir xil responsive delegate (home/favorites/category bilan)
        SliverPadding(
          padding: productGridPadding,
          sliver: SliverGrid(
            gridDelegate: productGridDelegate,
            delegate: SliverChildBuilderDelegate(
              (context, i) => ProductCard(product: state.products[i]),
              childCount: state.products.length,
            ),
          ),
        ),
        // Footer — loader / "boshqa natija yo'q" / Retry
        SliverPadding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          sliver: SliverToBoxAdapter(
            child: _buildFooter(context, state, theme),
          ),
        ),
      ],
    );
  }

  Widget _buildFooter(
      BuildContext context, PaginatedSearchState state, ThemeData theme) {
    // Loader keyingi sahifa yuklanmoqda
    if (state.isLoadingMore) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
        ),
      );
    }
    // Pagination xatosi — Retry tugmasi
    if (state.error != null) {
      return Center(
        child: TextButton.icon(
          onPressed: () =>
              context.read<PaginatedSearchBloc>().add(const Retry()),
          icon: const Icon(Icons.refresh_rounded, size: 18),
          label: const Text("Qayta urinish"),
        ),
      );
    }
    // Hammasi ko'rsatildi
    if (!state.hasMore && state.products.isNotEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Text(
            "Hammasi ko'rsatildi",
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}
