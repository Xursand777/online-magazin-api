import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/models/product_model.dart';
import '../bloc/search_bloc.dart';
import '../widgets/search_bar_stub.dart';

/// Professional search page — Home/Catalog tap'idan ochiladi.
///
/// UX printsiplari (Amazon, Wildberries, Yandex Market, Google):
///   1. **Hero animatsiya** — search bar stub'idan input'gacha silliq morph
///   2. **Autofocus** — sahifa ochilganda klaviatura darhol chiqadi
///   3. **Live results 10 ta** — debounce 300ms, har keyboard hit'da emas
///   4. **"Barchasini ko'rish" sticky button** — pastda 10+ natija bo'lsa
///   5. **Recent searches** — bo'sh inputda yaqindagi qidiruvlar
///   6. **Highlighted matches** — RichText bilan BOLD primary color
///   7. **Haptic feedback** — natija tanlanganda kichik vibratsiya
///   8. **Smooth dividers** — alpha bilan kontent ajratish
class SearchPage extends StatelessWidget {
  const SearchPage({super.key});

  /// Inline natijalar maksimal soni — 10 ta. Backend 50 gacha qaytaradi,
  /// lekin biz dropdown-tarzdagi listda faqat 10 ko'rsatamiz.
  /// Qolganlarini "Barchasini ko'rish" tugma orqali olinadi (paginated).
  static const int maxInlineResults = 10;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<SearchBloc>()..add(const LoadRecentSearches()),
      child: const _SearchView(),
    );
  }
}

class _SearchView extends StatefulWidget {
  const _SearchView();

  @override
  State<_SearchView> createState() => _SearchViewState();
}

class _SearchViewState extends State<_SearchView> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    // Sahifa ochilganda klaviatura darhol chiqsin (Amazon/Wildberries UX)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: _buildAppBar(context, theme),
      body: BlocBuilder<SearchBloc, SearchState>(
        builder: (context, state) {
          if (state.isQueryEmpty) {
            return _buildRecentSearches(context, state, theme);
          }
          if (state.isLoading && state.results.isEmpty) {
            return _buildLoadingSkeleton(theme);
          }
          if (state.isEmpty) {
            return _buildEmptyState(theme, state.query);
          }
          return _buildResults(context, state, theme);
        },
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AppBar — Hero TextField (Home/Catalog stub'idan morph)
  // ═══════════════════════════════════════════════════════════════════════════

  PreferredSizeWidget _buildAppBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: theme.colorScheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleSpacing: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () => context.pop(),
      ),
      title: Padding(
        padding: const EdgeInsets.only(right: 12),
        // ⭐ Hero — Home/Catalog SearchBarStub bilan AYNI tag → silliq morph
        child: Hero(
          tag: SearchBarStub.heroTag,
          flightShuttleBuilder:
              (flightContext, animation, direction, fromContext, toContext) {
            return Material(
              color: Colors.transparent,
              child: _buildInputContainer(theme, isStub: true),
            );
          },
          child: Material(
            color: Colors.transparent,
            child: _buildInputContainer(theme, isStub: false),
          ),
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Divider(
          height: 1,
          thickness: 1,
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
        ),
      ),
    );
  }

  Widget _buildInputContainer(ThemeData theme, {required bool isStub}) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          const SizedBox(width: 14),
          Icon(Icons.search_rounded,
              size: 20, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          Expanded(
            child: isStub
                ? Text(
                    'Mahsulot, brend yoki kategoriya...',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  )
                : TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    autofocus: true,
                    textInputAction: TextInputAction.search,
                    onChanged: (v) =>
                        context.read<SearchBloc>().add(QueryChanged(v)),
                    onSubmitted: (v) {
                      final q = v.trim();
                      if (q.isEmpty) return;
                      context.read<SearchBloc>().add(CommitSearch(q));
                      // Enter bosilsa → to'liq natijalar sahifasiga o'tamiz
                      _openFullResults(q);
                    },
                    style: theme.textTheme.bodyMedium,
                    decoration: InputDecoration(
                      hintText: 'Mahsulot, brend yoki kategoriya...',
                      border: InputBorder.none,
                      hintStyle: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
          ),
          if (!isStub)
            BlocBuilder<SearchBloc, SearchState>(
              buildWhen: (a, b) => a.query.isEmpty != b.query.isEmpty,
              builder: (context, state) {
                if (state.query.isEmpty) return const SizedBox(width: 12);
                return IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18),
                  onPressed: () {
                    _controller.clear();
                    context.read<SearchBloc>().add(const ClearQuery());
                    _focusNode.requestFocus();
                  },
                  color: theme.colorScheme.onSurfaceVariant,
                  visualDensity: VisualDensity.compact,
                  splashRadius: 18,
                );
              },
            )
          else
            const SizedBox(width: 14),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE: Recent searches
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildRecentSearches(
      BuildContext context, SearchState state, ThemeData theme) {
    if (state.recentSearches.isEmpty) {
      return _buildInitialEmptyState(theme);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 8, 8),
          child: Row(
            children: [
              Icon(Icons.history_rounded,
                  size: 18, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Text(
                'Yaqinda qidirilgan',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: theme.colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: () =>
                    context.read<SearchBloc>().add(const ClearAllRecent()),
                icon: const Icon(Icons.clear_all_rounded, size: 16),
                label: const Text('Tozalash'),
                style: TextButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                  textStyle: theme.textTheme.labelSmall,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: state.recentSearches.length,
            separatorBuilder: (_, __) => Divider(
              height: 1,
              indent: 60,
              endIndent: 16,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
            itemBuilder: (_, i) {
              final query = state.recentSearches[i];
              return ListTile(
                dense: true,
                leading: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.surfaceContainerLow,
                  ),
                  child: Icon(Icons.history_rounded,
                      size: 18, color: theme.colorScheme.onSurfaceVariant),
                ),
                title: Text(query, style: theme.textTheme.bodyMedium),
                trailing: IconButton(
                  icon: const Icon(Icons.close_rounded, size: 16),
                  onPressed: () =>
                      context.read<SearchBloc>().add(RemoveRecent(query)),
                  color: theme.colorScheme.outline,
                  visualDensity: VisualDensity.compact,
                  splashRadius: 16,
                ),
                onTap: () {
                  _controller.text = query;
                  _controller.selection = TextSelection.fromPosition(
                    TextPosition(offset: query.length),
                  );
                  context.read<SearchBloc>().add(QueryChanged(query));
                },
              );
            },
          ),
        ),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE: Initial empty (recent yo'q)
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildInitialEmptyState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
              ),
              child: Icon(
                Icons.search_rounded,
                size: 48,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              "Qidirishni boshlang",
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              "Mahsulot nomi, brend yoki\nkategoriya bo'yicha qidiring",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE: Loading skeleton (shimmer animation)
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildLoadingSkeleton(ThemeData theme) {
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: 5,
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemBuilder: (_, __) => _ShimmerListItem(theme: theme),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE: Empty (natija topilmadi)
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildEmptyState(ThemeData theme, String query) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: theme.colorScheme.errorContainer.withValues(alpha: 0.3),
              ),
              child: Icon(
                Icons.search_off_rounded,
                size: 48,
                color: theme.colorScheme.error,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              "Hech narsa topilmadi",
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              "\"$query\" bo'yicha mahsulot topilmadi.\n"
              "Boshqa so'z bilan qidirib ko'ring.",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE: Results (max 10 + "Barchasini ko'rish")
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildResults(
      BuildContext context, SearchState state, ThemeData theme) {
    final visible =
        state.results.take(SearchPage.maxInlineResults).toList();
    final hasMore = state.results.length > SearchPage.maxInlineResults;

    return Column(
      children: [
        // Header — natija soni
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
          child: Row(
            children: [
              Icon(Icons.check_circle_outline_rounded,
                  size: 16, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Text(
                hasMore
                    ? '${state.results.length}+ ta natija'
                    : '${state.results.length} ta natija',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        // Natijalar listi
        Expanded(
          child: ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: visible.length,
            separatorBuilder: (_, __) => Divider(
              height: 1,
              indent: 88,
              endIndent: 16,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
            itemBuilder: (_, i) => _ResultTile(
              product: visible[i],
              query: state.query,
              onTap: () => _openProduct(visible[i], state.query),
            ),
          ),
        ),
        // "Barchasini ko'rish" sticky button (pastda doim ko'rinadi)
        _BarchasiniKorishButton(
          query: state.query,
          totalCount: state.results.length,
          hasMore: hasMore,
          onTap: () => _openFullResults(state.query),
        ),
      ],
    );
  }

  // ── Navigation handlers ────────────────────────────────────────────────

  void _openProduct(ProductModel product, String query) {
    HapticFeedback.lightImpact();
    context.read<SearchBloc>().add(CommitSearch(query));
    _focusNode.unfocus();
    context.push('/product', extra: product);
  }

  void _openFullResults(String query) {
    if (query.trim().isEmpty) return;
    HapticFeedback.lightImpact();
    context.read<SearchBloc>().add(CommitSearch(query));
    _focusNode.unfocus();
    context.push('/search-results?q=${Uri.encodeQueryComponent(query)}');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// "Barchasini ko'rish" sticky button
// ═══════════════════════════════════════════════════════════════════════════════

class _BarchasiniKorishButton extends StatelessWidget {
  final String query;
  final int totalCount;
  final bool hasMore;
  final VoidCallback onTap;

  const _BarchasiniKorishButton({
    required this.query,
    required this.totalCount,
    required this.hasMore,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.primaryContainer.withValues(alpha: 0.25),
      child: SafeArea(
        top: false,
        child: InkWell(
          onTap: onTap,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: theme.colorScheme.outlineVariant,
                  width: 0.5,
                ),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.grid_view_rounded,
                    size: 18,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Barchasini katalogda ko'rish",
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        hasMore
                            ? '$totalCount+ ta natija, scroll bilan ochiladi'
                            : "Grid ko'rinishida natijalarni ko'ring",
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_rounded,
                  size: 20,
                  color: theme.colorScheme.primary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Result tile — bir natija kartochkasi (rasm + nom highlight + narx)
// ═══════════════════════════════════════════════════════════════════════════════

class _ResultTile extends StatelessWidget {
  final ProductModel product;
  final String query;
  final VoidCallback onTap;

  const _ResultTile({
    required this.product,
    required this.query,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Rasm
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 60,
                height: 60,
                color: theme.colorScheme.surfaceContainerLow,
                child: product.imageUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, __) => const SizedBox.shrink(),
                        errorWidget: (_, __, ___) => Icon(
                          Icons.image_not_supported_outlined,
                          color: theme.colorScheme.outline,
                          size: 24,
                        ),
                      )
                    : Icon(Icons.image_outlined,
                        color: theme.colorScheme.outline, size: 24),
              ),
            ),
            const SizedBox(width: 14),
            // Nom + narx
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    text: _highlightedText(product.name, query, theme),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (product.oldPrice != null) ...[
                        Text(
                          _fmt(product.oldPrice!),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.outline,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        _fmt(product.price),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.north_west_rounded,
                size: 18, color: theme.colorScheme.outline),
          ],
        ),
      ),
    );
  }

  // Qidiruv so'zini matnida BOLD qilib ajratish (Google search style)
  static TextSpan _highlightedText(String text, String query, ThemeData theme) {
    final baseStyle = theme.textTheme.bodyMedium?.copyWith(
      fontWeight: FontWeight.w500,
    );
    final hlStyle = baseStyle?.copyWith(
      fontWeight: FontWeight.w800,
      color: theme.colorScheme.primary,
    );

    final q = query.trim();
    if (q.isEmpty) return TextSpan(text: text, style: baseStyle);

    final spans = <TextSpan>[];
    final lowerText = text.toLowerCase();
    final lowerQ = q.toLowerCase();

    var start = 0;
    while (start < text.length) {
      final idx = lowerText.indexOf(lowerQ, start);
      if (idx == -1) {
        spans.add(TextSpan(text: text.substring(start), style: baseStyle));
        break;
      }
      if (idx > start) {
        spans.add(TextSpan(text: text.substring(start, idx), style: baseStyle));
      }
      spans.add(TextSpan(
        text: text.substring(idx, idx + q.length),
        style: hlStyle,
      ));
      start = idx + q.length;
    }
    return TextSpan(children: spans, style: baseStyle);
  }

  static String _fmt(num v) =>
      '${NumberFormat('#,###', 'uz_UZ').format(v).replaceAll(',', ' ')} so\'m';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shimmer loading item — animated skeleton
// ═══════════════════════════════════════════════════════════════════════════════

class _ShimmerListItem extends StatefulWidget {
  final ThemeData theme;
  const _ShimmerListItem({required this.theme});

  @override
  State<_ShimmerListItem> createState() => _ShimmerListItemState();
}

class _ShimmerListItemState extends State<_ShimmerListItem>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.theme.colorScheme.surfaceContainerLow;
    final highlight = widget.theme.colorScheme.surfaceContainerHighest;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        final color = Color.lerp(base, highlight, (1 - (2 * t - 1).abs()))!;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 14,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      width: double.infinity,
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 14,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      width: 200,
                    ),
                    const SizedBox(height: 12),
                    Container(
                      height: 12,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      width: 100,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
