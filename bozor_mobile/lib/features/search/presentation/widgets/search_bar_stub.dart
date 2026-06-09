import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Search bar stub — tappable "soxta" search input.
///
/// Home va Catalog AppBar'ida ishlatiladi. Bosilganda `/search` sahifaga
/// o'tadi. SearchPage'ning TextField'i bilan **Hero animatsiya** orqali
/// silliq o'tish (Amazon, Wildberries, Yandex Market kabi).
///
/// Hero `tag: 'search-bar'` — Home/Catalog va SearchPage o'rtasida AYNI
/// kontainer morphic transitsiya bilan o'tadi → premium UX.
class SearchBarStub extends StatelessWidget {
  /// Hero tag — SearchPage'dagi TextField bilan AYNI bo'lishi kerak.
  static const String heroTag = 'bozor-search-bar';

  /// Placeholder matn — saytdagi hint matni bilan bir xil.
  final String hintText;

  const SearchBarStub({
    super.key,
    this.hintText = 'Mahsulot, brend yoki kategoriya...',
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Hero — Material'da o'ralgan bo'lishi shart (text underline yo'q)
    return Hero(
      tag: heroTag,
      // flightShuttleBuilder: silliq morph (default bo'lsa cropp ko'rinadi)
      flightShuttleBuilder:
          (flightContext, animation, direction, fromContext, toContext) {
        return Material(
          color: Colors.transparent,
          child: _buildContainer(theme, hintText),
        );
      },
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.push('/search'),
          child: _buildContainer(theme, hintText),
        ),
      ),
    );
  }

  static Widget _buildContainer(ThemeData theme, String hintText) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: theme.colorScheme.outlineVariant,
          width: 1,
        ),
      ),
      child: Row(
        children: [
          const SizedBox(width: 14),
          Icon(
            Icons.search_rounded,
            size: 20,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              hintText,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 14),
        ],
      ),
    );
  }
}
