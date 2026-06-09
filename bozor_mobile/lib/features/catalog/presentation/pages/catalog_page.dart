import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../../core/di/injection_container.dart';
import '../bloc/catalog_bloc.dart';
import '../../../../core/models/category_model.dart';
import '../../../search/presentation/bloc/search_bloc.dart';
import '../../../search/presentation/widgets/search_input_bar.dart';
import '../../../search/presentation/widgets/search_overlay.dart';

class CatalogPage extends StatelessWidget {
  const CatalogPage({super.key});

  @override
  Widget build(BuildContext context) {
    // 2 ta bloc: CatalogBloc (asosiy) + SearchBloc (qidiruv overlay)
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => sl<CatalogBloc>()..add(LoadCatalogData())),
        BlocProvider(create: (_) => sl<SearchBloc>()..add(const LoadRecentSearches())),
      ],
      child: const CatalogView(),
    );
  }
}

class CatalogView extends StatefulWidget {
  const CatalogView({super.key});

  @override
  State<CatalogView> createState() => _CatalogViewState();
}

class _CatalogViewState extends State<CatalogView> {
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocus = FocusNode();

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: _buildAppBar(theme),
      body: Stack(
        children: [
          _buildMainContent(),
          // Search dropdown overlay — focusNode.hasFocus bo'lganda ko'rinadi
          SearchOverlay(
            focusNode: _searchFocus,
            controller: _searchController,
          ),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(ThemeData theme) {
    return AppBar(
      backgroundColor: theme.scaffoldBackgroundColor,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      titleSpacing: 16,
      // Live search bar — saytdagi kabi inline dropdown (Home bilan bir xil UX)
      title: SearchInputBar(
        controller: _searchController,
        focusNode: _searchFocus,
      ),
    );
  }

  Widget _buildMainContent() {
    return BlocBuilder<CatalogBloc, CatalogState>(
      builder: (context, state) {
        if (state.isLoading && state.categories.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state.error != null && state.categories.isEmpty) {
          return Center(child: Text('Xatolik: ${state.error}'));
        }
        if (state.categories.isEmpty) {
          return const Center(child: Text('Kataloglar topilmadi.'));
        }

        // API dan kelayotgan asosiy ro'yxat ota-kataloglardan iborat
        final parentCategories = state.categories;

        return ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          itemCount: parentCategories.length,
          itemBuilder: (context, index) {
            final catalog = parentCategories[index];
            final childCategories = catalog.children ?? [];
            return _CatalogAccordionItem(
              catalog: catalog,
              childCategories: childCategories,
            );
          },
        );
      },
    );
  }
}

class _CatalogAccordionItem extends StatefulWidget {
  final CategoryModel catalog;
  final List<CategoryModel> childCategories;

  const _CatalogAccordionItem({
    required this.catalog,
    required this.childCategories,
  });

  @override
  State<_CatalogAccordionItem> createState() => _CatalogAccordionItemState();
}

class _CatalogAccordionItemState extends State<_CatalogAccordionItem> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Column(
        children: [
          // Sarlavha qismi
          InkWell(
            onTap: () {
              if (widget.childCategories.isNotEmpty) {
                setState(() {
                  _isExpanded = !_isExpanded;
                });
              } else {
                // Agar ichki kategoriyasi bo'lmasa to'g'ridan to'g'ri o'tish
                context.push('/category/${widget.catalog.id}', extra: widget.catalog.name);
              }
            },
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  // Rasm yoki Ikonka
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: widget.catalog.iconUrl != null && widget.catalog.iconUrl!.isNotEmpty
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: CachedNetworkImage(
                              imageUrl: widget.catalog.iconUrl!,
                              fit: BoxFit.cover,
                              errorWidget: (context, url, error) => const Icon(Icons.category, color: Colors.grey),
                            ),
                          )
                        : const Icon(Icons.category, color: Colors.grey),
                  ),
                  const SizedBox(width: 16),
                  // Nom
                  Expanded(
                    child: Text(
                      widget.catalog.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                  ),
                  // O'ng icon
                  if (widget.childCategories.isNotEmpty)
                    Icon(
                      _isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                      color: theme.colorScheme.onSurfaceVariant,
                    )
                  else
                    Icon(
                      Icons.keyboard_arrow_right,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                ],
              ),
            ),
          ),
          
          // Ochiladigan qism (ichki kategoriyalar)
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity, height: 0),
            secondChild: Column(
              children: widget.childCategories.map((child) {
                return InkWell(
                  onTap: () {
                    context.push('/category/${child.id}', extra: child.name);
                  },
                  child: Padding(
                    padding: const EdgeInsets.only(left: 16, right: 16, top: 12, bottom: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            child.name,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                        Icon(
                          Icons.keyboard_arrow_right,
                          color: theme.colorScheme.onSurfaceVariant,
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
            crossFadeState: _isExpanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 200),
          ),
        ],
      ),
    );
  }
}
