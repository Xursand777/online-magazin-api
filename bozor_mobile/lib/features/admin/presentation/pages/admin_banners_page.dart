import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';
import '../widgets/admin_drawer.dart';

class AdminBannersPage extends StatelessWidget {
  const AdminBannersPage({super.key});

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
          'Bannerlar',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showBannerForm(context, null),
        backgroundColor: const Color(0xFFD97706),
        icon: const Icon(Icons.add, color: Colors.white),
        label: Text(
          'Banner qo\'shish',
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
          if (state.banners.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.view_carousel_outlined,
                    size: 64,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Bannerlar topilmadi',
                    style: theme.textTheme.titleMedium,
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            itemCount: state.banners.length,
            itemBuilder: (context, i) => _BannerTile(
              banner: state.banners[i],
              onEdit: () => _showBannerForm(context, state.banners[i]),
              onDelete: () => _confirmDelete(
                context,
                state.banners[i].id,
                state.banners[i].title,
              ),
            ),
          );
        },
      ),
    );
  }

  void _confirmDelete(BuildContext context, int id, String title) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text("O'chirishni tasdiqlang"),
        content: Text("'$title' bannerni o'chirasizmi?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<AdminBloc>().add(DeleteAdminBanner(id));
            },
            child: const Text("O'chirish", style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  void _showBannerForm(BuildContext context, AdminBannerModel? banner) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<AdminBloc>(),
        child: _BannerFormSheet(banner: banner),
      ),
    );
  }
}

class _BannerTile extends StatelessWidget {
  const _BannerTile({
    required this.banner,
    required this.onEdit,
    required this.onDelete,
  });
  final AdminBannerModel banner;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (banner.imageUrl != null)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              child: CachedNetworkImage(
                imageUrl: banner.imageUrl!,
                width: double.infinity,
                height: 140,
                fit: BoxFit.cover,
              ),
            )
          else
            Container(
              height: 100,
              decoration: BoxDecoration(
                color: const Color(0xFFD97706).withValues(alpha: 0.1),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: const Center(
                child: Icon(
                  Icons.image_outlined,
                  size: 40,
                  color: Color(0xFFD97706),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        banner.title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (banner.subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          banner.subtitle!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      if (banner.productName != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Bog\'liq mahsulot: ${banner.productName!}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _Badge(
                            label: banner.isActive ? 'Faol' : 'Nofaol',
                            color: banner.isActive
                                ? const Color(0xFF0A7C55)
                                : Colors.grey,
                          ),
                          _Badge(
                            label: 'Tartib: ${banner.order}',
                            color: const Color(0xFF2563EB),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Row(
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
              ],
            ),
          ),
        ],
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
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

// ─── Banner Form Sheet ────────────────────────────────────────────────────────

class _BannerFormSheet extends StatefulWidget {
  const _BannerFormSheet({this.banner});
  final AdminBannerModel? banner;

  @override
  State<_BannerFormSheet> createState() => _BannerFormSheetState();
}

class _BannerFormSheetState extends State<_BannerFormSheet> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _subtitle = TextEditingController();
  final _order = TextEditingController();
  bool _isActive = true;
  File? _pickedImage;
  int? _selectedProductId;

  @override
  void initState() {
    super.initState();
    final b = widget.banner;
    if (b != null) {
      _title.text = b.title;
      _subtitle.text = b.subtitle ?? '';
      _order.text = b.order.toString();
      _isActive = b.isActive;
      _selectedProductId = b.productId;
    } else {
      _order.text = '0';
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _subtitle.dispose();
    _order.dispose();
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

    final fields = {
      'title': _title.text.trim(),
      'is_active': _isActive.toString(),
      'order': _order.text.trim().isEmpty ? '0' : _order.text.trim(),
    };
    if (_subtitle.text.isNotEmpty) fields['subtitle'] = _subtitle.text.trim();
    if (_selectedProductId != null) {
      fields['product'] = _selectedProductId.toString();
    }

    final formData = FormData.fromMap(fields);
    if (_pickedImage != null) {
      formData.files.add(
        MapEntry(
          'image',
          MultipartFile.fromFileSync(
            _pickedImage!.path,
            filename: 'banner.jpg',
          ),
        ),
      );
    }

    final bloc = context.read<AdminBloc>();
    if (widget.banner == null) {
      bloc.add(CreateAdminBanner(formData));
    } else {
      bloc.add(UpdateAdminBanner(widget.banner!.id, formData));
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<AdminBloc>().state;
    final isEdit = widget.banner != null;

    return DraggableScrollableSheet(
      initialChildSize: 0.88,
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
                        isEdit ? 'Bannerni tahrirlash' : 'Yangi banner',
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
                          height: 150,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainer,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _pickedImage != null
                                  ? const Color(0xFFD97706)
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
                              : (widget.banner?.imageUrl != null
                                    ? ClipRRect(
                                        borderRadius: BorderRadius.circular(13),
                                        child: CachedNetworkImage(
                                          imageUrl: widget.banner!.imageUrl!,
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
                                            "Banner rasmi tanlash",
                                            style: theme.textTheme.bodySmall,
                                          ),
                                        ],
                                      )),
                        ),
                      ),
                      const SizedBox(height: 16),

                      _FieldLabel('Sarlavha *'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _title,
                        validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                        decoration: _inputDec(
                          theme,
                          'Masalan: Yangi kolleksiya',
                        ),
                      ),
                      const SizedBox(height: 12),

                      _FieldLabel('Qo\'shimcha matn'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _subtitle,
                        decoration: _inputDec(theme, 'Kichik tavsif...'),
                      ),
                      const SizedBox(height: 12),

                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _FieldLabel('Tartib raqami'),
                                const SizedBox(height: 6),
                                TextFormField(
                                  controller: _order,
                                  keyboardType: TextInputType.number,
                                  decoration: _inputDec(theme, '0'),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _FieldLabel('Bog\'liq mahsulot'),
                                const SizedBox(height: 6),
                                DropdownButtonFormField<int>(
                                  initialValue: _selectedProductId,
                                  hint: const Text('Tanlang'),
                                  decoration: _inputDec(theme, ''),
                                  isExpanded: true,
                                  items: [
                                    const DropdownMenuItem(
                                      value: null,
                                      child: Text('-- Yo\'q --'),
                                    ),
                                    ...state.products.map(
                                      (p) => DropdownMenuItem(
                                        value: p.id,
                                        child: Text(
                                          p.name,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ),
                                  ],
                                  onChanged: (v) =>
                                      setState(() => _selectedProductId = v),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      Container(
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerLowest,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: theme.colorScheme.outlineVariant,
                          ),
                        ),
                        child: SwitchListTile.adaptive(
                          title: const Text('Faol'),
                          subtitle: const Text('Bosh sahifada ko\'rinadi'),
                          value: _isActive,
                          onChanged: (v) => setState(() => _isActive = v),
                          activeThumbColor: const Color(0xFF0A7C55),
                          activeTrackColor: const Color(
                            0xFF0A7C55,
                          ).withValues(alpha: 0.4),
                        ),
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
                    onPressed: _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFD97706),
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
        );
      },
    );
  }

  InputDecoration _inputDec(ThemeData theme, String hint) => InputDecoration(
    hintText: hint,
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
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
  );
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(
        context,
      ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600),
    );
  }
}
