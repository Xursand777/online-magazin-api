import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/widgets/product_card.dart';
import '../../../../core/widgets/product_grid_config.dart';
import '../bloc/catalog_bloc.dart';

/// Kategoriya mahsulotlari sahifasi.
///
/// ⭐ ARXITEKTURA ESLATMASI:
/// Bu sahifa singleton CatalogBloc'dan ALOHIDA, o'ziga tegishli yangi
/// CatalogBloc instance yaratadi va uni o'zi dispose qiladi.
/// Sababi:
///   • Singleton CatalogBloc — barcha kategoriyalar ro'yxatini saqlaydi.
///   • Bu sahifa faqat bitta kategoriya mahsulotlarini ko'rsatishi kerak.
///   • Singleton'ga FilterByCategory yuborsak, CatalogPage'dagi kategoriyalar
///     ro'yxati o'chiriladi (state overwrite bo'ladi).
///   • StatefulWidget dispose'da BLoC yopiladi — memory leak yo'q.
class CategoryProductsPage extends StatefulWidget {
  final int categoryId;
  final String categoryName;

  const CategoryProductsPage({
    super.key,
    required this.categoryId,
    required this.categoryName,
  });

  @override
  State<CategoryProductsPage> createState() => _CategoryProductsPageState();
}

class _CategoryProductsPageState extends State<CategoryProductsPage> {
  // O'ziga tegishli local instance — singleton EMAS.
  // DI'da registerFactory bo'lgani uchun sl<CatalogBloc>() har safar YANGI instance qaytaradi.
  // Shuning uchun bu yerda factory pattern xavfsiz: singleton buzilmaydi.
  late final CatalogBloc _localBloc;

  @override
  void initState() {
    super.initState();
    // DI'dagi factory orqali yangi instance
    _localBloc = CatalogBloc(repository: sl());
    _localBloc.add(FilterByCategory(widget.categoryId));
  }

  @override
  void dispose() {
    // Faqat lokal instance yopiladi — singleton ta'sir qilmaydi
    _localBloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _localBloc,
      child: _CategoryProductsView(categoryName: widget.categoryName),
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
            padding: productGridPadding,
            gridDelegate: productGridDelegate,
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
