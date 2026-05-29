import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';
import '../widgets/admin_drawer.dart';

class AdminProductsPage extends StatefulWidget {
  const AdminProductsPage({super.key});
  @override
  State<AdminProductsPage> createState() => _AdminProductsPageState();
}

class _AdminProductsPageState extends State<AdminProductsPage> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
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
          final products = state.products
              .where((p) => p.name.toLowerCase().contains(_query.toLowerCase()))
              .toList();
          if (products.isEmpty) {
            return _EmptyState(onAdd: () => _showProductForm(context, null));
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            itemCount: products.length,
            itemBuilder: (context, i) => _ProductTile(
              product: products[i],
              onEdit: () => _showProductForm(context, products[i]),
              onDelete: () =>
                  _confirmDelete(context, products[i].id, products[i].name),
            ),
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
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, int id, String name) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("O'chirishni tasdiqlang"),
        content: Text("'$name' mahsulotini o'chirasizmi?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<AdminBloc>().add(DeleteAdminProduct(id));
            },
            child: const Text("O'chirish", style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _showProductForm(BuildContext context, AdminProductModel? product) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<AdminBloc>(),
        child: _ProductFormSheet(product: product),
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({
    required this.product,
    required this.onEdit,
    required this.onDelete,
  });
  final AdminProductModel product;
  final VoidCallback onEdit;
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
              onPressed: onEdit,
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 20),
              color: Colors.red,
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

// ─── Product Form Sheet ───────────────────────────────────────────────────────

class _ProductFormSheet extends StatefulWidget {
  const _ProductFormSheet({this.product});
  final AdminProductModel? product;

  @override
  State<_ProductFormSheet> createState() => _ProductFormSheetState();
}

class _ProductFormSheetState extends State<_ProductFormSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _price = TextEditingController();
  final _discountPrice = TextEditingController();
  final _stock = TextEditingController();
  final _description = TextEditingController();
  int? _selectedCategoryId;
  bool _isActive = true;
  bool _isNew = true;
  bool _isPopular = false;
  File? _pickedImage;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    if (p != null) {
      _name.text = p.name;
      _price.text = p.price.toStringAsFixed(0);
      _discountPrice.text = p.discountPrice?.toStringAsFixed(0) ?? '';
      _stock.text = p.stock.toString();
      _description.text = p.description;
      _selectedCategoryId = p.categoryId;
      _isActive = p.isActive;
      _isNew = p.isNew;
      _isPopular = p.isPopular;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _discountPrice.dispose();
    _stock.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) setState(() => _pickedImage = File(picked.path));
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    final fields = <String, dynamic>{
      'name': _name.text.trim(),
      'price': _price.text.trim(),
      'stock': _stock.text.trim(),
      'description': _description.text.trim(),
      'is_active': _isActive.toString(),
      'is_new': _isNew.toString(),
      'is_popular': _isPopular.toString(),
    };
    if (_selectedCategoryId != null) {
      fields['category'] = _selectedCategoryId.toString();
    }
    if (_discountPrice.text.isNotEmpty) {
      fields['discount_price'] = _discountPrice.text.trim();
    }

    final formParts = fields.entries
        .map((e) => MapEntry(e.key, e.value.toString()))
        .toList();
    final formData = FormData.fromMap(Map.fromEntries(formParts));

    if (_pickedImage != null) {
      formData.files.add(
        MapEntry(
          'image',
          MultipartFile.fromFileSync(
            _pickedImage!.path,
            filename: 'product.jpg',
          ),
        ),
      );
    }

    final bloc = context.read<AdminBloc>();
    if (widget.product == null) {
      bloc.add(CreateAdminProduct(formData));
    } else {
      bloc.add(UpdateAdminProduct(widget.product!.id, formData));
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<AdminBloc>().state;
    final isEdit = widget.product != null;

    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      maxChildSize: 0.97,
      minChildSize: 0.5,
      builder: (_, controller) {
        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        isEdit ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: controller,
                    padding: EdgeInsets.fromLTRB(
                      20,
                      16,
                      20,
                      MediaQuery.of(context).viewInsets.bottom + 100,
                    ),
                    children: [
                      // Image picker
                      GestureDetector(
                        onTap: _pickImage,
                        child: Container(
                          height: 140,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainer,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _pickedImage != null
                                  ? const Color(0xFF0A7C55)
                                  : theme.colorScheme.outlineVariant,
                              width: 1.5,
                            ),
                          ),
                          child: _pickedImage != null
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(13),
                                  child: Image.file(
                                    _pickedImage!,
                                    fit: BoxFit.cover,
                                    width: double.infinity,
                                  ),
                                )
                              : (widget.product?.mainImage != null
                                    ? ClipRRect(
                                        borderRadius: BorderRadius.circular(13),
                                        child: CachedNetworkImage(
                                          imageUrl: widget.product!.mainImage!,
                                          fit: BoxFit.cover,
                                          width: double.infinity,
                                        ),
                                      )
                                    : Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            Icons.add_photo_alternate_outlined,
                                            size: 36,
                                            color: theme
                                                .colorScheme
                                                .onSurfaceVariant,
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            "Rasm tanlash",
                                            style: theme.textTheme.bodySmall,
                                          ),
                                        ],
                                      )),
                        ),
                      ),
                      const SizedBox(height: 16),
                      _FormField(
                        label: "Mahsulot nomi *",
                        controller: _name,
                        validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _FormField(
                              label: "Narx (so'm) *",
                              controller: _price,
                              keyboardType: TextInputType.number,
                              validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _FormField(
                              label: "Chegirma narx",
                              controller: _discountPrice,
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _FormField(
                              label: "Stok miqdori *",
                              controller: _stock,
                              keyboardType: TextInputType.number,
                              validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _CategoryDropdown(
                              categories: state.categories,
                              selectedId: _selectedCategoryId,
                              onChanged: (id) =>
                                  setState(() => _selectedCategoryId = id),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _FormField(
                        label: "Tavsif",
                        controller: _description,
                        maxLines: 3,
                      ),
                      const SizedBox(height: 14),
                      // Toggles
                      _ToggleRow(
                        label: 'Faol',
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v),
                      ),
                      _ToggleRow(
                        label: 'Yangi',
                        value: _isNew,
                        onChanged: (v) => setState(() => _isNew = v),
                      ),
                      _ToggleRow(
                        label: 'Ommabop',
                        value: _isPopular,
                        onChanged: (v) => setState(() => _isPopular = v),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  16,
                  8,
                  16,
                  MediaQuery.of(context).padding.bottom + 8,
                ),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0A7C55),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Text(
                            isEdit ? 'Saqlash' : "Qo'shish",
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _FormField extends StatelessWidget {
  const _FormField({
    required this.label,
    required this.controller,
    this.keyboardType,
    this.validator,
    this.maxLines = 1,
  });
  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          validator: validator,
          maxLines: maxLines,
          decoration: InputDecoration(
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerLowest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 12,
            ),
          ),
        ),
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w500,
            ),
          ),
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeThumbColor: const Color(0xFF0A7C55),
          ),
        ],
      ),
    );
  }
}

class _CategoryDropdown extends StatelessWidget {
  const _CategoryDropdown({
    required this.categories,
    required this.selectedId,
    required this.onChanged,
  });
  final List<AdminCategoryModel> categories;
  final int? selectedId;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Kategoriya',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<int>(
          initialValue: selectedId,
          hint: const Text('Tanlang'),
          decoration: InputDecoration(
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerLowest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 12,
            ),
          ),
          isExpanded: true,
          items: categories
              .map(
                (c) => DropdownMenuItem(
                  value: c.id,
                  child: Text(c.name, overflow: TextOverflow.ellipsis),
                ),
              )
              .toList(),
          onChanged: onChanged,
        ),
      ],
    );
  }
}
