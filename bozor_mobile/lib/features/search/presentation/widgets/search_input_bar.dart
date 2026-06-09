import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/search_bloc.dart';

/// AppBar ichida ishlatiladigan search input.
///
/// Saytdagi kabi: TextField + tozalash (✕) + qidirish ikonkasi.
/// Dropdown bu yerda EMAS — alohida `SearchOverlay` widget'i tomonidan
/// Scaffold body Stack'ida ko'rsatiladi. Bu ikkisi bitta `FocusNode` va
/// `TextEditingController` orqali bog'lanadi.
class SearchInputBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final String hintText;

  const SearchInputBar({
    super.key,
    required this.controller,
    required this.focusNode,
    this.hintText = 'Mahsulot, brend yoki kategoriya...',
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          const SizedBox(width: 12),
          Icon(Icons.search_rounded,
              color: theme.colorScheme.onSurfaceVariant, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
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
                hintText: hintText,
                border: InputBorder.none,
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          // Tozalash (✕) tugmasi — faqat matn bo'lsa ko'rinadi
          BlocBuilder<SearchBloc, SearchState>(
            buildWhen: (a, b) => a.query.isEmpty != b.query.isEmpty,
            builder: (context, state) {
              if (state.query.isEmpty) return const SizedBox(width: 12);
              return Padding(
                padding: const EdgeInsets.only(right: 4),
                child: IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18),
                  onPressed: () {
                    controller.clear();
                    context.read<SearchBloc>().add(const ClearQuery());
                    focusNode.requestFocus();
                  },
                  color: theme.colorScheme.onSurfaceVariant,
                  visualDensity: VisualDensity.compact,
                  splashRadius: 18,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
