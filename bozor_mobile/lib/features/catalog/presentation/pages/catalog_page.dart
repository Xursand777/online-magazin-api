import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/widgets/product_card.dart';
import '../bloc/catalog_bloc.dart';

class CatalogPage extends StatelessWidget {
  const CatalogPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => sl<CatalogBloc>()..add(LoadCatalogData()),
      child: const CatalogView(),
    );
  }
}

class CatalogView extends StatelessWidget {
  const CatalogView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: _buildSearchBar(context, theme),
      body: Column(
        children: [
          _buildFiltersSection(theme),
          Expanded(
            child: BlocBuilder<CatalogBloc, CatalogState>(
              builder: (context, state) {
                if (state.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (state.error != null) {
                  return Center(child: Text('Error: ${state.error}'));
                }
                if (state.products.isEmpty) {
                  return const Center(child: Text('No products found.'));
                }

                return GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.6,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                  ),
                  itemCount: state.products.length,
                  itemBuilder: (context, index) {
                    return ProductCard(product: state.products[index]);
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          // TODO: Show complex filter bottom sheet
        },
        backgroundColor: theme.colorScheme.onSurface,
        foregroundColor: theme.colorScheme.surface,
        icon: const Icon(Icons.tune),
        label: const Text('Filter'),
      ),
    );
  }

  PreferredSizeWidget _buildSearchBar(BuildContext context, ThemeData theme) {
    return AppBar(
      titleSpacing: 16,
      title: Container(
        height: 48,
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainer,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          children: [
            const SizedBox(width: 12),
            Icon(Icons.search, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                onSubmitted: (value) {
                  context.read<CatalogBloc>().add(SearchProducts(value));
                },
                decoration: InputDecoration(
                  hintText: 'Search catalog...',
                  border: InputBorder.none,
                  hintStyle: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
            IconButton(
              icon: Icon(Icons.mic, color: theme.colorScheme.onSurfaceVariant),
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFiltersSection(ThemeData theme) {
    return BlocBuilder<CatalogBloc, CatalogState>(
      builder: (context, state) {
        return Container(
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: theme.colorScheme.surfaceContainerHighest,
              ),
            ),
          ),
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    _buildCategoryItem(
                      context,
                      theme,
                      name: 'All',
                      icon: Icons.widgets,
                      isSelected: state.selectedCategoryId == null,
                      onTap: () => context.read<CatalogBloc>().add(
                        const FilterByCategory(null),
                      ),
                    ),
                    ...state.categories.map(
                      (category) => _buildCategoryItem(
                        context,
                        theme,
                        name: category.name,
                        icon: Icons.category, // Fallback icon
                        isSelected: state.selectedCategoryId == category.id,
                        onTap: () => context.read<CatalogBloc>().add(
                          FilterByCategory(category.id),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    _buildSortChip(
                      context,
                      theme,
                      'Popular',
                      'popular',
                      state.selectedSort,
                    ),
                    const SizedBox(width: 8),
                    _buildSortChip(
                      context,
                      theme,
                      'New Arrivals',
                      'new',
                      state.selectedSort,
                    ),
                    const SizedBox(width: 8),
                    _buildSortChip(
                      context,
                      theme,
                      'Cheap',
                      'cheap',
                      state.selectedSort,
                    ),
                    const SizedBox(width: 8),
                    _buildSortChip(
                      context,
                      theme,
                      'Expensive',
                      'expensive',
                      state.selectedSort,
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

  Widget _buildCategoryItem(
    BuildContext context,
    ThemeData theme, {
    required String name,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 24),
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.surfaceContainer,
                border: isSelected
                    ? null
                    : Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Icon(
                icon,
                color: isSelected
                    ? theme.colorScheme.onPrimary
                    : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              name,
              style: theme.textTheme.labelSmall?.copyWith(
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSortChip(
    BuildContext context,
    ThemeData theme,
    String label,
    String value,
    String? selectedValue,
  ) {
    final isSelected = value == selectedValue;
    return ActionChip(
      label: Text(label),
      onPressed: () {
        context.read<CatalogBloc>().add(SortProducts(value));
      },
      backgroundColor: isSelected
          ? theme.colorScheme.primary
          : theme.colorScheme.surfaceContainerHighest,
      labelStyle: theme.textTheme.labelSmall?.copyWith(
        color: isSelected
            ? theme.colorScheme.onPrimary
            : theme.colorScheme.onSurface,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(
          color: isSelected
              ? Colors.transparent
              : theme.colorScheme.outlineVariant,
        ),
      ),
    );
  }
}
