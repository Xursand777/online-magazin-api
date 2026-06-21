import 'package:flutter/material.dart';
import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';
import '../widgets/admin_drawer.dart';
import '../widgets/admin_product_form_sheet.dart';
import '../widgets/admin_bulk_import_sheet.dart';

class AdminProductsPage extends StatefulWidget {
  const AdminProductsPage({super.key});
  @override
  State<AdminProductsPage> createState() => _AdminProductsPageState();
}

class _AdminProductsPageState extends State<AdminProductsPage> {
  final _search = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      context.read<AdminBloc>().add(LoadMoreAdminProducts());
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _search.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: _buildAppBar(theme),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showProductForm(context, null),
        backgroundColor: const Color(0xFF0A7C55),
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(
          'Mahsulot qo\'shish',
          style: theme.textTheme.labelLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: BlocBuilder<AdminBloc, AdminState>(
        builder: (context, state) {
          if (state.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          final products = state.products;
          if (products.isEmpty) {
            return _EmptyState(onAdd: () => _showProductForm(context, null));
          }
          return ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            itemCount: products.length + (state.hasReachedMaxProducts ? 0 : 1),
            itemBuilder: (context, i) {
              if (i == products.length) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16.0),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              return _ProductTile(
                product: products[i],
                onEdit: () => _showProductForm(context, products[i]),
                onClone: () =>
                    _showProductForm(context, products[i], clone: true),
                onDelete: () =>
                    _confirmDelete(context, products[i].id, products[i].name),
              );
            },
          );
        },
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(ThemeData theme) {
    return AppBar(
      backgroundColor: const Color(0xFF063F2B),
      foregroundColor: Colors.white,
      elevation: 0,
      title: Text(
        'Mahsulotlar',
        style: theme.textTheme.titleLarge?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
      actions: [
        // #N3: Excel/CSV ommaviy import
        IconButton(
          tooltip: 'Excel / CSV import',
          icon: const Icon(Icons.upload_file_rounded),
          onPressed: () => _showBulkImport(context),
        ),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(60),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: TextField(
            controller: _search,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Qidirish...',
              hintStyle: const TextStyle(color: Colors.white60),
              prefixIcon: const Icon(Icons.search, color: Colors.white60),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.15),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
            onChanged: (v) {
              if (_debounce?.isActive ?? false) _debounce!.cancel();
              _debounce = Timer(const Duration(milliseconds: 500), () {
                context.read<AdminBloc>().add(SearchAdminProducts(v));
              });
            },
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, int id, String name) {
    // go_router (nested navigator) + showDialog (root navigator) — dialog'ni
    // AYNAN o'z builder context'i (dialogCtx) bilan yopamiz, aks holda
    // Navigator.pop(context) noto'g'ri navigator'ni yopib, qora barier qoladi.
    final bloc = context.read<AdminBloc>();
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text("O'chirishni tasdiqlang"),
        content: Text("'$name' mahsulotini o'chirasizmi?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              bloc.add(DeleteAdminProduct(id));
            },
            child: const Text("O'chirish", style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _showProductForm(
    BuildContext context,
    AdminProductModel? product, {
    bool clone = false,
  }) {
    // #8: forma endi to'liq ekran (Scaffold + bosqichli stepper) — surib yopish
    // tasodifi yo'q, klaviatura oqimi qulay. go_router'ning nested navigator'i
    // bilan to'g'ri ishlashi uchun shu (lokal) navigator'da push qilamiz.
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => BlocProvider.value(
          value: context.read<AdminBloc>(),
          child: AdminProductFormSheet(product: product, clone: clone),
        ),
      ),
    );
  }

  // #N3: Excel/CSV ommaviy import varag'ini ochadi.
  void _showBulkImport(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<AdminBloc>(),
        child: const AdminBulkImportSheet(),
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({
    required this.product,
    required this.onEdit,
    required this.onClone,
    required this.onDelete,
  });
  final AdminProductModel product;
  final VoidCallback onEdit;
  final VoidCallback onClone;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            width: 56,
            height: 56,
            child: product.mainImage != null
                ? CachedNetworkImage(
                    imageUrl: product.mainImage!,
                    fit: BoxFit.cover,
                  )
                : Container(
                    color: theme.colorScheme.surfaceContainer,
                    child: Icon(
                      Icons.image_outlined,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
          ),
        ),
        title: Text(
          product.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 2),
            Text(
              '${fmt.format(product.price).replaceAll(',', ' ')} so\'m',
              style: theme.textTheme.bodySmall?.copyWith(
                color: const Color(0xFF0A7C55),
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _Badge(
                  label: 'Stok: ${product.stock}',
                  color: product.stock > 0 ? Colors.blueGrey : Colors.red,
                ),
                if (product.isDiscount)
                  _Badge(label: 'Chegirma', color: Colors.orange),
                if (!product.isActive)
                  _Badge(label: 'Nofaol', color: Colors.grey),
              ],
            ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 20),
              color: const Color(0xFF2563EB),
              tooltip: 'Tahrirlash',
              onPressed: onEdit,
            ),
            IconButton(
              icon: const Icon(Icons.content_copy_outlined, size: 19),
              color: Colors.grey,
              tooltip: 'Nusxa olish',
              onPressed: onClone,
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 20),
              color: Colors.red,
              tooltip: "O'chirish",
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.inventory_2_outlined,
            size: 64,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text('Mahsulotlar topilmadi', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          ElevatedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: const Text("Qo'shish"),
          ),
        ],
      ),
    );
  }
}

// Form ko'rinishlari admin_product_form_sheet.dart faylida
