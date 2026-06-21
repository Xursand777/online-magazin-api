import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';
import '../widgets/admin_drawer.dart';

class AdminCategoriesPage extends StatefulWidget {
  const AdminCategoriesPage({super.key});
  @override
  State<AdminCategoriesPage> createState() => _AdminCategoriesPageState();
}

class _AdminCategoriesPageState extends State<AdminCategoriesPage> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: const Color(0xFF063F2B),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Kategoriyalar',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCategoryForm(context, null),
        backgroundColor: const Color(0xFF2563EB),
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(
          'Kategoriya qo\'shish',
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
          if (state.categories.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.category_outlined,
                    size: 64,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Kategoriyalar topilmadi',
                    style: theme.textTheme.titleMedium,
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            itemCount: state.categories.length,
            itemBuilder: (context, i) {
              final cat = state.categories[i];
              final parent = cat.parentId != null
                  ? state.categories
                        .where((c) => c.id == cat.parentId)
                        .firstOrNull
                  : null;
              return _CategoryTile(
                category: cat,
                parentName: parent?.name,
                onEdit: () => _showCategoryForm(context, cat),
                onDelete: () => _confirmDelete(context, cat.id, cat.name),
              );
            },
          );
        },
      ),
    );
  }

  void _confirmDelete(BuildContext context, int id, String name) {
    // go_router nested navigator + root-dialog: AYNAN dialogCtx bilan yopamiz.
    final bloc = context.read<AdminBloc>();
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text("O'chirishni tasdiqlang"),
        content: Text("'$name' kategoriyasini o'chirasizmi?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              bloc.add(DeleteAdminCategory(id));
            },
            child: const Text("O'chirish", style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _showCategoryForm(BuildContext context, AdminCategoryModel? category) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<AdminBloc>(),
        child: _CategoryFormSheet(category: category),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.category,
    required this.parentName,
    required this.onEdit,
    required this.onDelete,
  });
  final AdminCategoryModel category;
  final String? parentName;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          clipBehavior: Clip.hardEdge,
          child: (category.imageUrl != null && category.imageUrl!.isNotEmpty)
              ? CachedNetworkImage(
                  imageUrl: category.imageUrl!,
                  fit: BoxFit.cover,
                  placeholder: (context, url) =>
                      const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  errorWidget: (context, url, error) => const Icon(
                    Icons.category_rounded,
                    color: Colors.grey,
                  ),
                )
              : const Icon(
                  Icons.category_rounded,
                  color: Colors.grey,
                  size: 24,
                ),
        ),
        title: Text(
          category.name,
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (parentName != null) ...[
              const SizedBox(height: 2),
              Row(
                children: [
                  Icon(
                    Icons.subdirectory_arrow_right,
                    size: 14,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 2),
                  Text(
                    parentName!,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _Badge(
                  label: category.isActive ? 'Faol' : 'Nofaol',
                  color: category.isActive
                      ? const Color(0xFF0A7C55)
                      : Colors.grey,
                ),
                if (category.isPopular)
                  _Badge(label: 'Ommabop', color: const Color(0xFFD97706)),
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ─── Category Form Sheet ──────────────────────────────────────────────────────

class _CategoryFormSheet extends StatefulWidget {
  const _CategoryFormSheet({this.category});
  final AdminCategoryModel? category;

  @override
  State<_CategoryFormSheet> createState() => _CategoryFormSheetState();
}

class _CategoryFormSheetState extends State<_CategoryFormSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  int? _parentId;
  bool _isActive = true;
  bool _isPopular = false;
  File? _imageFile;
  String? _existingImageUrl;

  @override
  void initState() {
    super.initState();
    final c = widget.category;
    if (c != null) {
      _name.text = c.name;
      _parentId = c.parentId;
      _isActive = c.isActive;
      _isPopular = c.isPopular;
      _existingImageUrl = c.imageUrl;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    // #N10: backend kategoriya WebP target'i (800px) bilan bir xil — kichik
    // thumbnail uchun yuklash juda tez, ortiqcha piksel yuborilmaydi.
    final pickedFile = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      maxHeight: 800,
      imageQuality: 80,
    );
    if (pickedFile != null) {
      setState(() {
        _imageFile = File(pickedFile.path);
        _existingImageUrl = null;
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'is_active': _isActive,
      'is_popular': _isPopular,
    };
    if (_parentId != null) body['parent'] = _parentId;

    dynamic finalData = body;

    if (_imageFile != null) {
      final formData = FormData.fromMap(body);
      formData.files.add(MapEntry(
        'image',
        await MultipartFile.fromFile(_imageFile!.path, filename: _imageFile!.path.split('/').last),
      ));
      finalData = formData;
    }

    final bloc = context.read<AdminBloc>();
    if (widget.category == null) {
      bloc.add(CreateAdminCategory(finalData));
    } else {
      bloc.add(UpdateAdminCategory(widget.category!.id, finalData));
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<AdminBloc>().state;
    final isEdit = widget.category != null;
    final parentCategories = state.categories
        .where((c) => c.parentId == null && c.id != widget.category?.id)
        .toList();

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
                      isEdit ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya',
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
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Kategoriya rasmi',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    GestureDetector(
                      onTap: _pickImage,
                      child: Container(
                        width: double.infinity,
                        height: 120,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerLowest,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: theme.colorScheme.outlineVariant),
                        ),
                        child: _imageFile != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.file(_imageFile!, fit: BoxFit.cover),
                              )
                            : (_existingImageUrl != null && _existingImageUrl!.isNotEmpty)
                                ? ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: CachedNetworkImage(
                                      imageUrl: _existingImageUrl!,
                                      fit: BoxFit.cover,
                                    ),
                                  )
                                : Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.add_photo_alternate_outlined,
                                          size: 32, color: theme.colorScheme.primary),
                                      const SizedBox(height: 8),
                                      Text(
                                        'Rasm yuklash',
                                        style: theme.textTheme.labelMedium?.copyWith(
                                          color: theme.colorScheme.primary,
                                        ),
                                      ),
                                    ],
                                  ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Kategoriya nomi *',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _name,
                      validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                      decoration: InputDecoration(
                        hintText: 'Masalan: Telefonlar',
                        filled: true,
                        fillColor: theme.colorScheme.surfaceContainerLowest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Yuqori kategoriya (ixtiyoriy)',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int>(
                      initialValue: _parentId,
                      hint: const Text('Asosiy kategoriya (ildiz)'),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: theme.colorScheme.surfaceContainerLowest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 12,
                        ),
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: null,
                          child: Text('-- Ildiz kategoriya --'),
                        ),
                        ...parentCategories.map(
                          (c) => DropdownMenuItem(
                            value: c.id,
                            child: Text(c.name),
                          ),
                        ),
                      ],
                      onChanged: (v) => setState(() => _parentId = v),
                    ),
                    const SizedBox(height: 12),
                    _SettingsToggleTile(
                      title: 'Faol',
                      subtitle: 'Kategoriya ko\'rinib turadi',
                      value: _isActive,
                      activeColor: const Color(0xFF0A7C55),
                      onChanged: (v) => setState(() => _isActive = v),
                    ),
                    const SizedBox(height: 8),
                    _SettingsToggleTile(
                      title: 'Ommabop',
                      subtitle: 'Bosh sahifada tavsiya sifatida chiqadi',
                      value: _isPopular,
                      activeColor: const Color(0xFFD97706),
                      onChanged: (v) => setState(() => _isPopular = v),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                8,
                20,
                MediaQuery.of(context).padding.bottom + 16,
              ),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
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
      ),
    );
  }
}

class _SettingsToggleTile extends StatelessWidget {
  const _SettingsToggleTile({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.activeColor,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final Color activeColor;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: SwitchListTile.adaptive(
        title: Text(
          title,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        value: value,
        onChanged: onChanged,
        contentPadding: EdgeInsets.zero,
        activeThumbColor: activeColor,
        activeTrackColor: activeColor.withValues(alpha: 0.4),
      ),
    );
  }
}
