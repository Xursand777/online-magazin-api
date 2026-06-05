import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'dart:io';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';
import '../widgets/admin_drawer.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Admin bannerlar sahifasi
// • Banner ro'yxati: rasm + sarlavha + holat + tartib
// • Yaratish / tahrirlash: barcha sayt maydonlari (rang, tugma, mahsulot)
// • O'chirish: tasdiqlash dialogi
// ─────────────────────────────────────────────────────────────────────────────

class AdminBannersPage extends StatelessWidget {
  const AdminBannersPage({super.key});

  static const _brandDark = Color(0xFF063F2B);
  static const _orange = Color(0xFFD97706);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: _brandDark,
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
        backgroundColor: _orange,
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
                  Text('Bannerlar topilmadi', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Yangi banner qo\'shish uchun + tugmasini bosing',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
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
        title: const Text('O\'chirishni tasdiqlang'),
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
            child: const Text('O\'chirish', style: TextStyle(color: Colors.red)),
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
      useSafeArea: true,
      builder: (_) => BlocProvider.value(
        value: context.read<AdminBloc>(),
        child: _BannerFormSheet(banner: banner),
      ),
    );
  }
}

// ─── Banner tile (ro'yxat elementi) ──────────────────────────────────────────

class _BannerTile extends StatelessWidget {
  const _BannerTile({
    required this.banner,
    required this.onEdit,
    required this.onDelete,
  });
  final AdminBannerModel banner;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  // hex → Color
  static Color _hex(String? hex, Color fallback) {
    if (hex == null) return fallback;
    try {
      final c = hex.replaceAll('#', '');
      if (c.length == 6) return Color(int.parse('FF$c', radix: 16));
      if (c.length == 8) return Color(int.parse(c, radix: 16));
    } catch (_) {}
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = _hex(banner.backgroundColor, const Color(0xFF063F2B));
    final accent = _hex(banner.accentColor, const Color(0xFF0A7C55));
    final hasDiscount =
        banner.originalPrice != null &&
        banner.discountPrice != null &&
        banner.discountPrice! < banner.originalPrice!;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Mini preview (banner ko'rinishi) ──────────────────────────────
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            child: SizedBox(
              height: 120,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Orqa fon (Gradient yoki Rasm)
                  if (banner.backgroundImageUrl != null && banner.backgroundImageUrl!.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: banner.backgroundImageUrl!,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [bg, Color.lerp(bg, accent, 0.6)!],
                          ),
                        ),
                      ),
                      errorWidget: (_, __, ___) => Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [bg, Color.lerp(bg, accent, 0.6)!],
                          ),
                        ),
                      ),
                    )
                  else
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [bg, Color.lerp(bg, accent, 0.6)!],
                        ),
                      ),
                    ),
                  // Dekorativ doira
                  Positioned(
                    right: -20,
                    bottom: -30,
                    child: Container(
                      width: 110,
                      height: 110,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.07),
                      ),
                    ),
                  ),
                  // Mahsulot rasmi (o'ng tomonda)
                  if (banner.imageUrl != null)
                    Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 120,
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [bg, Colors.transparent],
                                  begin: Alignment.centerLeft,
                                  end: Alignment.centerRight,
                                  stops: const [0.0, 0.4],
                                ),
                              ),
                            ),
                          ),
                          CachedNetworkImage(
                            imageUrl: banner.imageUrl!,
                            fit: BoxFit.contain,
                            alignment: Alignment.centerRight,
                            errorWidget: (_, __, ___) =>
                                const SizedBox.shrink(),
                          ),
                        ],
                      ),
                    ),
                  // Matn (chapda)
                  Positioned(
                    left: 14,
                    top: 12,
                    bottom: 12,
                    right: banner.imageUrl != null ? 110 : 14,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (hasDiscount)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            margin: const EdgeInsets.only(bottom: 5),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFD166),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '-${((1 - banner.discountPrice! / banner.originalPrice!) * 100).toInt()}%',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF1A1A1A),
                              ),
                            ),
                          ),
                        Text(
                          banner.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                            height: 1.2,
                          ),
                        ),
                        if (banner.discountPrice != null ||
                            banner.originalPrice != null) ...[
                          const SizedBox(height: 5),
                          Text(
                            _fmtPrice(
                              banner.discountPrice ?? banner.originalPrice!,
                            ),
                            style: const TextStyle(
                              color: Color(0xFFFFD166),
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Meta ma'lumotlar (pastda) ──────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
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
                      if (banner.productName != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          'Mahsulot: ${banner.productName!}',
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
                        runSpacing: 4,
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
                          if (banner.backgroundColor != null)
                            _ColorBadge(hex: banner.backgroundColor!),
                          if (banner.startDate != null)
                            _Badge(
                              label: 'Bosh: ${DateFormat('dd.MM.yy').format(banner.startDate!)}',
                              color: const Color(0xFFD97706),
                            ),
                          if (banner.endDate != null)
                            _Badge(
                              label: 'Tugash: ${DateFormat('dd.MM.yy').format(banner.endDate!)}',
                              color: Colors.red,
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

  String _fmtPrice(double v) =>
      '${NumberFormat('#,###').format(v).replaceAll(',', ' ')} so\'m';
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

class _ColorBadge extends StatelessWidget {
  const _ColorBadge({required this.hex});
  final String hex;

  Color _parse() {
    try {
      final c = hex.replaceAll('#', '');
      if (c.length == 6) return Color(int.parse('FF$c', radix: 16));
    } catch (_) {}
    return Colors.grey;
  }

  @override
  Widget build(BuildContext context) {
    final color = _parse();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            hex,
            style: TextStyle(
              fontSize: 10,
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Banner Form Sheet (yaratish / tahrirlash) ────────────────────────────────

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
  final _bgColor = TextEditingController();
  final _accentColor = TextEditingController();
  final _buttonLabel = TextEditingController();

  bool _isActive = true;
  File? _pickedImage; // Product image
  File? _pickedBackgroundImage; // Background image
  int? _selectedProductId;
  DateTime? _startDate;
  DateTime? _endDate;

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
      _startDate = b.startDate;
      _endDate = b.endDate;
      _bgColor.text = b.backgroundColor ?? '#063F2B';
      _accentColor.text = b.accentColor ?? '#0A7C55';
      _buttonLabel.text = b.buttonLabel ?? 'Mahsulotni ko\'rish';
    } else {
      _order.text = '0';
      _bgColor.text = '#063F2B';
      _accentColor.text = '#0A7C55';
      _buttonLabel.text = 'Mahsulotni ko\'rish';
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _subtitle.dispose();
    _order.dispose();
    _bgColor.dispose();
    _accentColor.dispose();
    _buttonLabel.dispose();
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

  Future<void> _pickBackgroundImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) setState(() => _pickedBackgroundImage = File(picked.path));
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final fields = {
      'title': _title.text.trim(),
      'is_active': _isActive.toString(),
      'order': _order.text.trim().isEmpty ? '0' : _order.text.trim(),
    };
    if (_subtitle.text.trim().isNotEmpty) {
      fields['subtitle'] = _subtitle.text.trim();
    }
    if (_bgColor.text.trim().isNotEmpty) {
      fields['background_color'] = _bgColor.text.trim();
    }
    if (_accentColor.text.trim().isNotEmpty) {
      fields['accent_color'] = _accentColor.text.trim();
    }
    if (_buttonLabel.text.trim().isNotEmpty) {
      fields['button_label'] = _buttonLabel.text.trim();
    }
    if (_selectedProductId != null) {
      fields['product'] = _selectedProductId.toString();
    }

    if (_startDate != null) {
      fields['start_date'] = _startDate!.toIso8601String();
    }
    if (_endDate != null) {
      fields['end_date'] = _endDate!.toIso8601String();
    }

    final formData = FormData.fromMap(fields);
    if (_pickedImage != null) {
      formData.files.add(
        MapEntry(
          'product_image', // Saytda product_image deb olinadi
          MultipartFile.fromFileSync(
            _pickedImage!.path,
            filename: 'banner_product.jpg',
          ),
        ),
      );
    }
    if (_pickedBackgroundImage != null) {
      formData.files.add(
        MapEntry(
          'background_image',
          MultipartFile.fromFileSync(
            _pickedBackgroundImage!.path,
            filename: 'banner_bg.jpg',
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

  /// Hex string'dan Color ob'ekt (noto'g'ri bo'lsa null)
  Color? _parseHex(String hex) {
    try {
      final c = hex.trim().replaceAll('#', '');
      if (c.length == 6) return Color(int.parse('FF$c', radix: 16));
      if (c.length == 8) return Color(int.parse(c, radix: 16));
    } catch (_) {}
    return null;
  }

  List<DropdownMenuItem<int>> _buildProductItems(List<AdminProductModel> products) {
    final items = <DropdownMenuItem<int>>[
      const DropdownMenuItem(value: null, child: Text('-- Mahsulot bog\'lanmagan --')),
    ];
    final addedIds = <int>{};
    for (final p in products) {
      if (!addedIds.contains(p.id)) {
        items.add(DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis)));
        addedIds.add(p.id);
      }
    }
    if (_selectedProductId != null && !addedIds.contains(_selectedProductId)) {
      items.add(DropdownMenuItem(
        value: _selectedProductId, 
        child: Text(widget.banner?.productName ?? 'Mahsulot #$_selectedProductId')
      ));
    }
    return items;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<AdminBloc>().state;
    final isEdit = widget.banner != null;
    final bgColorPreview = _parseHex(_bgColor.text);
    final accentColorPreview = _parseHex(_accentColor.text);

    return DraggableScrollableSheet(
      initialChildSize: 0.94,
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
              // Drag handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        isEdit ? 'Bannerni tahrirlash' : 'Yangi banner',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
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
                      // ── Rasm tanlash ──────────────────────────────────────
                      _FieldLabel('Banner rasmi (Mahsulot) *'),
                      const SizedBox(height: 6),
                      GestureDetector(
                        onTap: _pickImage,
                        child: Container(
                          height: 160,
                          decoration: BoxDecoration(
                            color: bgColorPreview?.withValues(alpha: 0.08) ??
                                theme.colorScheme.surfaceContainer,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _pickedImage != null
                                  ? const Color(0xFFD97706)
                                  : theme.colorScheme.outlineVariant,
                              width: 1.5,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: _pickedImage != null
                              ? Stack(
                                  children: [
                                    Image.file(
                                      _pickedImage!,
                                      fit: BoxFit.cover,
                                      width: double.infinity,
                                    ),
                                    Positioned(
                                      bottom: 8,
                                      right: 8,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 5,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.black54,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: const Text(
                                          'O\'zgartirish',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                )
                              : (widget.banner?.imageUrl != null
                                  ? Stack(
                                      children: [
                                        CachedNetworkImage(
                                          imageUrl: widget.banner!.imageUrl!,
                                          fit: BoxFit.cover,
                                          width: double.infinity,
                                        ),
                                        Positioned(
                                          bottom: 8,
                                          right: 8,
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 10,
                                              vertical: 5,
                                            ),
                                            decoration: BoxDecoration(
                                              color: Colors.black54,
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            child: const Text(
                                              'O\'zgartirish',
                                              style: TextStyle(
                                                color: Colors.white,
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    )
                                  : Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.add_photo_alternate_outlined,
                                          size: 40,
                                          color:
                                              theme.colorScheme.onSurfaceVariant,
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          'Mahsulot rasmini tanlang',
                                          style: theme.textTheme.bodySmall
                                              ?.copyWith(
                                            color: theme
                                                .colorScheme.onSurfaceVariant,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'JPG, PNG, WEBP (max 5 MB)',
                                          style: theme.textTheme.labelSmall
                                              ?.copyWith(
                                            color: theme
                                                .colorScheme.onSurfaceVariant
                                                .withValues(alpha: 0.6),
                                          ),
                                        ),
                                      ],
                                    )),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // ── Sarlavha ──────────────────────────────────────────
                      _FieldLabel('Sarlavha *'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _title,
                        validator: (v) =>
                            v == null || v.isEmpty ? 'Majburiy maydon' : null,
                        decoration: _inputDec(theme, 'Masalan: Yangi kolleksiya'),
                      ),
                      const SizedBox(height: 12),

                      // ── Qo'shimcha matn ───────────────────────────────────
                      _FieldLabel('Qo\'shimcha matn (subtitle)'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _subtitle,
                        decoration: _inputDec(theme, 'Kichik tavsif...'),
                      ),
                      const SizedBox(height: 12),

                      // ── Bog'liq mahsulot ──────────────────────────────────
                      _FieldLabel('Bog\'liq mahsulot'),
                      const SizedBox(height: 6),
                      DropdownButtonFormField<int>(
                        value: _selectedProductId,
                        hint: const Text('Mahsulot tanlang'),
                        decoration: _inputDec(theme, ''),
                        isExpanded: true,
                        items: _buildProductItems(state.products),
                        onChanged: (v) =>
                            setState(() => _selectedProductId = v),
                      ),
                      const SizedBox(height: 12),

                      // ── Orqa fon rasmi ──────────────────────────────────
                      _FieldLabel('Orqa fon rasmi (ixtiyoriy)'),
                      const SizedBox(height: 6),
                      GestureDetector(
                        onTap: _pickBackgroundImage,
                        child: Container(
                          height: 120,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainer,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _pickedBackgroundImage != null
                                  ? const Color(0xFFD97706)
                                  : theme.colorScheme.outlineVariant,
                              width: 1.5,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: _pickedBackgroundImage != null
                              ? Stack(
                                  children: [
                                    Image.file(
                                      _pickedBackgroundImage!,
                                      fit: BoxFit.cover,
                                      width: double.infinity,
                                    ),
                                    Positioned(
                                      bottom: 8,
                                      right: 8,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                        decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(8)),
                                        child: const Text('O\'zgartirish', style: TextStyle(color: Colors.white, fontSize: 11)),
                                      ),
                                    ),
                                  ],
                                )
                              : (widget.banner?.backgroundImageUrl != null
                                  ? Stack(
                                      children: [
                                        CachedNetworkImage(
                                          imageUrl: widget.banner!.backgroundImageUrl!,
                                          fit: BoxFit.cover,
                                          width: double.infinity,
                                        ),
                                        Positioned(
                                          bottom: 8,
                                          right: 8,
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                            decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(8)),
                                            child: const Text('O\'zgartirish', style: TextStyle(color: Colors.white, fontSize: 11)),
                                          ),
                                        ),
                                      ],
                                    )
                                  : Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(Icons.image_outlined, size: 32, color: theme.colorScheme.onSurfaceVariant),
                                        const SizedBox(height: 8),
                                        Text('Orqa fon rasmini tanlang', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                                      ],
                                    )),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // ── Muddat (Sanalar) ──────────────────────────────────
                      _FieldLabel('Banner amal qilish muddati'),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () async {
                                final d = await showDatePicker(
                                  context: context,
                                  initialDate: _startDate ?? DateTime.now(),
                                  firstDate: DateTime(2020),
                                  lastDate: DateTime(2030),
                                );
                                if (d != null) setState(() => _startDate = d);
                              },
                              icon: const Icon(Icons.calendar_today, size: 16),
                              label: Text(_startDate != null ? DateFormat('dd.MM.yyyy').format(_startDate!) : 'Boshlanish'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () async {
                                final d = await showDatePicker(
                                  context: context,
                                  initialDate: _endDate ?? DateTime.now(),
                                  firstDate: DateTime(2020),
                                  lastDate: DateTime(2030),
                                );
                                if (d != null) setState(() => _endDate = d);
                              },
                              icon: const Icon(Icons.event_available, size: 16),
                              label: Text(_endDate != null ? DateFormat('dd.MM.yyyy').format(_endDate!) : 'Tugash'),
                            ),
                          ),
                        ],
                      ),
                      if (_startDate != null || _endDate != null)
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => setState(() { _startDate = null; _endDate = null; }),
                            child: const Text('Muddatni tozalash', style: TextStyle(color: Colors.red, fontSize: 12)),
                          ),
                        ),
                      const SizedBox(height: 12),

                      // ── Tugma matni ───────────────────────────────────────
                      _FieldLabel('Tugma matni (button_label)'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _buttonLabel,
                        decoration: _inputDec(
                          theme,
                          'Masalan: Mahsulotni ko\'rish',
                        ),
                      ),
                      const SizedBox(height: 12),

                      // ── Ranglar ───────────────────────────────────────────
                      _FieldLabel('Ranglar'),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Fon rangi',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                TextFormField(
                                  controller: _bgColor,
                                  onChanged: (_) => setState(() {}),
                                  decoration: _inputDec(theme, '#063F2B').copyWith(
                                    prefixIcon: bgColorPreview != null
                                        ? Padding(
                                            padding: const EdgeInsets.all(12),
                                            child: Container(
                                              width: 20,
                                              height: 20,
                                              decoration: BoxDecoration(
                                                color: bgColorPreview,
                                                borderRadius:
                                                    BorderRadius.circular(4),
                                                border: Border.all(
                                                  color: Colors.grey.shade300,
                                                ),
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Aksent rang',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                TextFormField(
                                  controller: _accentColor,
                                  onChanged: (_) => setState(() {}),
                                  decoration:
                                      _inputDec(theme, '#0A7C55').copyWith(
                                    prefixIcon: accentColorPreview != null
                                        ? Padding(
                                            padding: const EdgeInsets.all(12),
                                            child: Container(
                                              width: 20,
                                              height: 20,
                                              decoration: BoxDecoration(
                                                color: accentColorPreview,
                                                borderRadius:
                                                    BorderRadius.circular(4),
                                                border: Border.all(
                                                  color: Colors.grey.shade300,
                                                ),
                                              ),
                                            ),
                                          )
                                        : null,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      // Rang namunalari
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          '#063F2B', '#0A7C55', '#2761dd', '#7C3AED',
                          '#D97706', '#DC2626', '#0EA5E9', '#1A1A1A',
                        ].map(
                          (hex) => GestureDetector(
                            onTap: () => setState(() => _bgColor.text = hex),
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: _parseHex(hex),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: _bgColor.text == hex
                                      ? Colors.black
                                      : Colors.grey.shade300,
                                  width: _bgColor.text == hex ? 2 : 1,
                                ),
                              ),
                            ),
                          ),
                        ).toList(),
                      ),
                      const SizedBox(height: 12),

                      // ── Tartib raqami va Faol switch ──────────────────────
                      Row(
                        children: [
                          Expanded(
                            flex: 2,
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
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 3,
                            child: Container(
                              margin: const EdgeInsets.only(top: 20),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.surfaceContainerLowest,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: theme.colorScheme.outlineVariant,
                                ),
                              ),
                              child: SwitchListTile.adaptive(
                                dense: true,
                                title: const Text('Faol'),
                                subtitle: Text(
                                  _isActive
                                      ? 'Bosh sahifada ko\'rinadi'
                                      : 'Yashirin',
                                  style: theme.textTheme.labelSmall,
                                ),
                                value: _isActive,
                                onChanged: (v) =>
                                    setState(() => _isActive = v),
                                activeThumbColor: const Color(0xFF0A7C55),
                                activeTrackColor: const Color(
                                  0xFF0A7C55,
                                ).withValues(alpha: 0.35),
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // ── Live preview ──────────────────────────────────────
                      _FieldLabel('Ko\'rinish (preview)'),
                      const SizedBox(height: 8),
                      _buildPreview(theme, bgColorPreview, accentColorPreview),
                    ],
                  ),
                ),
              ),

              // ── Saqlash tugmasi ───────────────────────────────────────────
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
                      isEdit ? 'Saqlash' : 'Banner qo\'shish',
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

  /// Live preview — banner mobilda qanday ko'rinishini ko'rsatadi
  Widget _buildPreview(
    ThemeData theme,
    Color? bgColor,
    Color? accentColor,
  ) {
    final bg = bgColor ?? const Color(0xFF063F2B);
    final accent = accentColor ?? const Color(0xFF0A7C55);

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 130,
        child: Stack(
          children: [
            // Gradient fon
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [bg, Color.lerp(bg, accent, 0.55)!],
                  ),
                ),
              ),
            ),
            // Dekorativ doira
            Positioned(
              right: -20,
              bottom: -30,
              child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.08),
                ),
              ),
            ),
            // Mahsulot rasmi (o'ng tomonda)
            if (_pickedImage != null || widget.banner?.imageUrl != null)
              Positioned(
                right: 12,
                top: 0,
                bottom: 0,
                width: 110,
                child: Center(
                  child: _pickedImage != null
                      ? Image.file(
                          _pickedImage!,
                          fit: BoxFit.contain,
                          alignment: Alignment.center,
                        )
                      : CachedNetworkImage(
                          imageUrl: widget.banner!.imageUrl!,
                          fit: BoxFit.contain,
                          alignment: Alignment.center,
                        ),
                ),
              ),
            // Matn
            Positioned(
              left: 16,
              top: 14,
              bottom: 14,
              right: (_pickedImage != null || widget.banner?.imageUrl != null)
                  ? 115
                  : 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    _title.text.isEmpty ? 'Sarlavha...' : _title.text,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12, // Kichiklashtirildi
                      fontWeight: FontWeight.w900,
                      height: 1.2,
                    ),
                  ),
                  if (_subtitle.text.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      _subtitle.text,
                      maxLines: 4, // 4 qatorgacha ruxsat
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 10, // Kichiklashtirildi
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
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
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0xFF0A7C55), width: 1.5),
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
