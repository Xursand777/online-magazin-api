import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/models/product_model.dart';
import '../bloc/search_bloc.dart';

/// Search dropdown overlay — saytdagi kabi inline.
///
/// Scaffold body Stack'ida ishlatiladi. FocusNode'ga listener qo'shib,
/// faqat search bar fokuslangan vaqtda ko'rinadi. Tap-outside-to-dismiss
/// uchun full-screen GestureDetector ostida joylashgan.
///
/// Algoritmi:
///   • focusNode.hasFocus = true  → overlay ko'rinadi (recent yoki natijalar)
///   • focusNode.hasFocus = false → overlay yashiriladi
///   • Max 10 ta natija (`?q=...` lar /api/search/products/ ga 50 max bilan keladi)
///   • "Barchasini ko'rish" tugma → /search-results sahifaga o'tadi
///                                  (paginated infinite scroll)
class SearchOverlay extends StatefulWidget {
  final FocusNode focusNode;
  final TextEditingController controller;

  /// Maksimal natija soni dropdown ichida — saytdagi kabi 10.
  static const int maxInlineResults = 10;

  /// Dropdown'ning absolyut MAX balandligi (px) — UX uchun cheklov.
  /// 10 ta natija ~480px, lekin keyboard ochilganda kichikroq bo'lishi mumkin.
  static const double absoluteMaxHeight = 480;

  const SearchOverlay({
    super.key,
    required this.focusNode,
    required this.controller,
  });

  @override
  State<SearchOverlay> createState() => _SearchOverlayState();
}

class _SearchOverlayState extends State<SearchOverlay> {
  @override
  void initState() {
    super.initState();
    // Focus listener — overlay ko'rinish-yashirinishini boshqaradi
    widget.focusNode.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    widget.focusNode.removeListener(_onFocusChanged);
    super.dispose();
  }

  void _onFocusChanged() {
    if (!mounted) return;
    setState(() {}); // overlay'ni qayta render qilish
  }

  @override
  Widget build(BuildContext context) {
    final visible = widget.focusNode.hasFocus;
    // AnimatedSwitcher — overlay smoothly ko'rinadi/yashiriladi
    return AnimatedOpacity(
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      child: IgnorePointer(
        ignoring: !visible,
        child: visible ? _buildVisibleContent(context) : const SizedBox.shrink(),
      ),
    );
  }

  Widget _buildVisibleContent(BuildContext context) {
    final theme = Theme.of(context);

    // LayoutBuilder beradi Stack'ning HAQIQIY balandligini —
    // klaviatura ochilganda body kichrayadi va biz aniq bilamiz.
    return LayoutBuilder(
      builder: (context, constraints) {
        // 12px past padding qoldiramiz, ham absolyut max bilan cheklab qo'yamiz
        final available = constraints.maxHeight - 12;
        final maxH = math.min(available, SearchOverlay.absoluteMaxHeight);

        return Stack(
          children: [
            // Tap-outside qatlami — main content tap'larini bloklab unfocus qiladi
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => widget.focusNode.unfocus(),
                child: Container(color: Colors.black.withValues(alpha: 0.18)),
              ),
            ),
            // Dropdown — yuqori chetda
            Positioned(
              top: 0,
              left: 12,
              right: 12,
              child: Material(
                color: theme.colorScheme.surface,
                elevation: 8,
                shadowColor: Colors.black.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(14),
                clipBehavior: Clip.antiAlias,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxH),
                  child: BlocBuilder<SearchBloc, SearchState>(
                    builder: (context, state) =>
                        _buildBody(context, state, theme),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, SearchState state, ThemeData theme) {
    // Bo'sh input — recent searches
    if (state.isQueryEmpty) {
      if (state.recentSearches.isEmpty) {
        return _buildInitialHint(theme);
      }
      return _buildRecentSearches(context, state, theme);
    }
    // Loading (yoki dastlabki natijasiz qidiruv)
    if (state.isLoading && state.results.isEmpty) {
      return _buildLoadingSkeleton(theme);
    }
    // Natija yo'q
    if (state.isEmpty) {
      return _buildEmptyState(theme, state.query);
    }
    // Natijalar bor
    return _buildResults(context, state, theme);
  }

  // ── Initial hint (recent yo'q) ─────────────────────────────────────────

  Widget _buildInitialHint(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lightbulb_outline_rounded,
              size: 20, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              "Mahsulot nomi yoki brendni yozing",
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Recent searches ────────────────────────────────────────────────────

  Widget _buildRecentSearches(
      BuildContext context, SearchState state, ThemeData theme) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 4, 4),
          child: Row(
            children: [
              Icon(Icons.history_rounded,
                  size: 16, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Text("Yaqinda qidirilgan",
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  )),
              const Spacer(),
              TextButton(
                onPressed: () =>
                    context.read<SearchBloc>().add(const ClearAllRecent()),
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  foregroundColor: theme.colorScheme.error,
                ),
                child: const Text("Tozalash", style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ),
        Flexible(
          child: ListView.builder(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            itemCount: state.recentSearches.length,
            itemBuilder: (_, i) {
              final q = state.recentSearches[i];
              return ListTile(
                dense: true,
                leading: Icon(Icons.history_rounded,
                    size: 18, color: theme.colorScheme.onSurfaceVariant),
                title: Text(q, style: theme.textTheme.bodyMedium),
                trailing: IconButton(
                  icon: const Icon(Icons.close_rounded, size: 16),
                  onPressed: () =>
                      context.read<SearchBloc>().add(RemoveRecent(q)),
                  color: theme.colorScheme.outline,
                  visualDensity: VisualDensity.compact,
                ),
                onTap: () {
                  widget.controller.text = q;
                  widget.controller.selection = TextSelection.fromPosition(
                    TextPosition(offset: q.length),
                  );
                  context.read<SearchBloc>().add(QueryChanged(q));
                },
              );
            },
          ),
        ),
      ],
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────────

  Widget _buildLoadingSkeleton(ThemeData theme) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        4,
        (_) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 12,
                      color: theme.colorScheme.surfaceContainerLow,
                      width: double.infinity,
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: 12,
                      color: theme.colorScheme.surfaceContainerLow,
                      width: 120,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Empty (natija yo'q) ────────────────────────────────────────────────

  Widget _buildEmptyState(ThemeData theme, String query) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.search_off_rounded,
              size: 36, color: theme.colorScheme.outline),
          const SizedBox(height: 8),
          Text("Hech narsa topilmadi",
              style: theme.textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            "\"$query\" bo'yicha natija yo'q",
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  // ── Natijalar — max 10 + "Barchasini ko'rish" ──────────────────────────

  Widget _buildResults(
      BuildContext context, SearchState state, ThemeData theme) {
    final visible = state.results.take(SearchOverlay.maxInlineResults).toList();
    final hasMore = state.results.length > SearchOverlay.maxInlineResults;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Natijalar listi — Flexible bilan ConstrainedBox ichida scroll bo'ladi
        Flexible(
          child: ListView.separated(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            itemCount: visible.length,
            separatorBuilder: (_, __) => Divider(
              height: 1,
              indent: 72,
              endIndent: 12,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
            itemBuilder: (_, i) => _ResultTile(
              product: visible[i],
              query: state.query,
              onTap: () => _openProduct(context, visible[i], state.query),
            ),
          ),
        ),
        // "Barchasini ko'rish" tugmasi — sticky bottom
        Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer.withValues(alpha: 0.25),
            border: Border(
              top: BorderSide(
                color: theme.colorScheme.outlineVariant,
                width: 0.5,
              ),
            ),
          ),
          child: InkWell(
            onTap: () => _openFullResults(context, state.query),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.arrow_forward_rounded,
                      size: 18, color: theme.colorScheme.primary),
                  const SizedBox(width: 8),
                  Text(
                    hasMore
                        ? "Barchasini katalogda ko'rish (${state.results.length}+)"
                        : "Barchasini katalogda ko'rish",
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _openProduct(BuildContext context, ProductModel product, String query) {
    HapticFeedback.lightImpact();
    context.read<SearchBloc>().add(CommitSearch(query));
    widget.focusNode.unfocus();
    context.push('/product', extra: product);
  }

  void _openFullResults(BuildContext context, String query) {
    HapticFeedback.lightImpact();
    context.read<SearchBloc>().add(CommitSearch(query));
    widget.focusNode.unfocus();
    context.push('/search-results?q=${Uri.encodeQueryComponent(query)}');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bitta natija tile'i — rasm + nom (highlight) + narx
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            // Rasm
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: 48,
                height: 48,
                color: theme.colorScheme.surfaceContainerLow,
                child: product.imageUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: product.imageUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, __) => const SizedBox.shrink(),
                        errorWidget: (_, __, ___) => Icon(
                          Icons.image_not_supported_outlined,
                          size: 18,
                          color: theme.colorScheme.outline,
                        ),
                      )
                    : Icon(Icons.image_outlined,
                        size: 18, color: theme.colorScheme.outline),
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
                    text: _highlight(product.name, query, theme),
                  ),
                  const SizedBox(height: 2),
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
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static TextSpan _highlight(String text, String query, ThemeData theme) {
    final baseStyle = theme.textTheme.bodyMedium?.copyWith(
      fontWeight: FontWeight.w500,
      fontSize: 13,
    );
    final hlStyle = baseStyle?.copyWith(
      fontWeight: FontWeight.w800,
      color: theme.colorScheme.primary,
    );
    final q = query.trim();
    if (q.isEmpty) return TextSpan(text: text, style: baseStyle);

    final spans = <TextSpan>[];
    final lower = text.toLowerCase();
    final lowerQ = q.toLowerCase();
    var start = 0;
    while (start < text.length) {
      final idx = lower.indexOf(lowerQ, start);
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
