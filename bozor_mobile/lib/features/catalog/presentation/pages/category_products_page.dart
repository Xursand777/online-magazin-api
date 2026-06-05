import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/widgets/product_card.dart';
import '../bloc/catalog_bloc.dart';

class CategoryProductsPage extends StatelessWidget {
  final int categoryId;
  final String categoryName;

  const CategoryProductsPage({
    super.key,
    required this.categoryId,
    required this.categoryName,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => sl<CatalogBloc>()..add(FilterByCategory(categoryId)),
      child: _CategoryProductsView(categoryName: categoryName),
    );
  }
}

class _CategoryProductsView extends StatelessWidget {
  final String categoryName;

  const _CategoryProductsView({required this.categoryName});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: theme.scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: theme.colorScheme.onSurface),
        title: Text(
          categoryName,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.onSurface,
          ),
        ),
      ),
      body: BlocBuilder<CatalogBloc, CatalogState>(
        builder: (context, state) {
          if (state.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.error != null) {
            return Center(child: Text('Xatolik: ${state.error}'));
          }
          if (state.products.isEmpty) {
            return const Center(child: Text('Bu kategoriyada mahsulotlar yo\'q.'));
          }

          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisExtent: 320, // Ixcham va chiroyli balandlik
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
    );
  }
}
