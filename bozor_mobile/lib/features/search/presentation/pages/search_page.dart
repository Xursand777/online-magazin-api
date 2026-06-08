import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/models/product_model.dart';
import '../bloc/search_bloc.dart';

/// Professional qidiruv sahifasi — Amazon, Wildberries, Google'dagi kabi.
///
/// Asosiy UX printsiplari:
///   1. **Autofocus** — sahifa ochilganda klaviatura darhol chiqadi
///   2. **Live suggestions** — har 300ms debounce bilan natijalar yangilanadi
///   3. **Recent searches** — bo'sh inputda yaqinda qidirilganlar
///   4. **Highlighted matches** — natija nomida qidirilgan so'z BOLD ko'rsatiladi
///   5. **Loading state** — skeleton/spinner foydalanuvchiga feedback beradi
///   6. **Empty state** — chiroyli "topilmadi" xabari
///   7. **Tap result** → ProductDetail (recent'ga saqlaydi)
///   8. **Keyboard submit** → recent'ga saqlaydi, sahifada qoladi
class SearchPage extends StatelessWidget {
  const SearchPage({super.key});

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
    // Sahifa ochilganda klaviatura darhol chiqsin (UX qulayligi)
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
            return _buildLoadingState(theme);
          }
          if (state.isEmpty) {
            return _buildEmptyState(theme, state.query);
          }
          return _buildResults(context, state, theme);
        },
      ),
    );
  }

  // ── AppBar — qidiruv input bilan ────────────────────────────────────────

  PreferredSizeWidget _buildAppBar(BuildContext context, ThemeData theme) {
    return AppBar(
      backgroundColor: theme.colorScheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      titleSpacing: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () => context.pop(),
      ),
      title: BlocBuilder<SearchBloc, SearchState>(
        buildWhen: (a, b) => a.query != b.query,
        builder: (context, state) {
          return Container(
            height: 42,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Row(
              children: [
                const SizedBox(width: 12),
                Icon(Icons.search_rounded,
                    size: 20, color: theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    autofocus: true,
                    textInputAction: TextInputAction.search,
                    onChanged: (v) =>
                        context.read<SearchBloc>().add(QueryChanged(v)),
                    onSubmitted: (v) {
                      final q = v.trim();
                      if (q.isNotEmpty) {
                        context.read<SearchBloc>().add(CommitSearch(q));
                      }
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
                if (state.query.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 20),
                    onPressed: () {
                      _controller.clear();
                      context.read<SearchBloc>().add(const ClearQuery());
                      _focusNode.requestFocus();
                    },
                    color: theme.colorScheme.onSurfaceVariant,
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  // ── Yaqinda qidirilganlar ───────────────────────────────────────────────

  Widget _buildRecentSearches(
      BuildContext context, SearchState state, ThemeData theme) {
    if (state.recentSearches.isEmpty) {
      return _buildInitialEmptyState(theme);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
          child: Row(
            children: [
              Icon(Icons.history_rounded,
                  size: 18, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Text(
                'Yaqinda qidirilgan',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
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
              indent: 56,
              endIndent: 16,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
            itemBuilder: (_, i) {
              final query = state.recentSearches[i];
              return ListTile(
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
                  icon: const Icon(Icons.close_rounded, size: 18),
                  onPressed: () =>
                      context.read<SearchBloc>().add(RemoveRecent(query)),
                  color: theme.colorScheme.outline,
                  visualDensity: VisualDensity.compact,
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

  // ── Initial empty (recent searches yo'q) ────────────────────────────────

  Widget _buildInitialEmptyState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_rounded,
                size: 64, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(
              "Qidirishni boshlang",
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              "Mahsulot nomi, brend yoki kategoriya bo'yicha qidiring",
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

  // ── Loading state — skeleton ────────────────────────────────────────────

  Widget _buildLoadingState(ThemeData theme) {
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: 5,
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemBuilder: (_, __) => _ShimmerListItem(theme: theme),
    );
  }

  // ── Empty state — natija yo'q ───────────────────────────────────────────

  Widget _buildEmptyState(ThemeData theme, String query) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off_rounded,
                size: 64, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(
              "Hech narsa topilmadi",
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              "\"$query\" bo'yicha mahsulot topilmadi.\n"
              "Boshqa so'z bilan qidirib ko'ring.",
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

  // ── Natijalar ───────────────────────────────────────────────────────────

  Widget _buildResults(
      BuildContext context, SearchState state, ThemeData theme) {
    return Column(
      children: [
        // Header — natija soni
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(
            '${state.results.length} ta natija topildi',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Expanded(
          child: ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: state.results.length,
            separatorBuilder: (_, __) => Divider(
              height: 1,
              indent: 88,
              endIndent: 16,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
            itemBuilder: (_, i) => _ResultTile(
              product: state.results[i],
              query: state.query,
              onTap: () => _openProduct(context, state.results[i], state.query),
            ),
          ),
        ),
      ],
    );
  }

  void _openProduct(BuildContext context, ProductModel product, String query) {
    // Recent searches'ga saqlaymiz
    context.read<SearchBloc>().add(CommitSearch(query));
    // Mahsulot batafsil sahifaga o'tamiz
    context.push('/product', extra: product);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Result tile — har bir natija kartochkasi
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
      onTap: () {
        HapticFeedback.lightImpact(); // tactile feedback (mashxur ilovalar uslubi)
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Rasm
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
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
                            size: 24),
                      )
                    : Icon(Icons.image_outlined,
                        color: theme.colorScheme.outline, size: 24),
              ),
            ),
            const SizedBox(width: 12),
            // Matn
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    text: _highlightedText(product.name, query, theme),
                  ),
                  const SizedBox(height: 4),
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
                        const SizedBox(width: 6),
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

  // Qidiruv so'zini matnida BOLD qilib ajratish (Google/Amazon usuli)
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
// Shimmer loading item — skeleton uchun
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
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(height: 14, color: color, width: double.infinity),
                    const SizedBox(height: 8),
                    Container(height: 14, color: color, width: 200),
                    const SizedBox(height: 12),
                    Container(height: 12, color: color, width: 100),
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
