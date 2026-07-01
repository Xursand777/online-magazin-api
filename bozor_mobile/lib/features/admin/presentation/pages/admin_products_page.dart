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
          final Widget content = products.isEmpty
              ? _EmptyState(onAdd: () => _showProductForm(context, null))
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount:
                      products.length + (state.hasReachedMaxProducts ? 0 : 1),
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
                      onEditVariant: (variantId) => _showProductForm(
                        context,
                        products[i],
                        initialVariantId: variantId,
                      ),
                      onClone: () =>
                          _showProductForm(context, products[i], clone: true),
                      onDelete: () => _confirmDelete(
                        context,
                        products[i].id,
                        products[i].name,
                      ),
                    );
                  },
                );
          // #12: internetni kutayotgan (offline navbatdagi) mahsulotlar banneri.
          return Column(
            children: [
              if (state.pendingSyncCount > 0)
                _PendingSyncBanner(count: state.pendingSyncCount),
              Expanded(child: content),
            ],
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
    int? initialVariantId,
  }) {
    // #8: forma endi to'liq ekran (Scaffold + bosqichli stepper) — surib yopish
    // tasodifi yo'q, klaviatura oqimi qulay. go_router'ning nested navigator'i
    // bilan to'g'ri ishlashi uchun shu (lokal) navigator'da push qilamiz.
    //
    // Phase 4.2 — `initialVariantId` berilgan bo'lsa, forma Variantlar
    // bosqichida ochiladi va o'sha variantga avtomat scroll bo'ladi.
    Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => BlocProvider.value(
          value: context.read<AdminBloc>(),
          child: AdminProductFormSheet(
            product: product,
            clone: clone,
            initialVariantId: initialVariantId,
          ),
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

// #12: offline navbatdagi mahsulotlar haqida ogohlantirish + qo'lda yuborish.
class _PendingSyncBanner extends StatelessWidget {
  const _PendingSyncBanner({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFFF7E6),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
        child: Row(
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              size: 20,
              color: Color(0xFFD97706),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                "$count ta mahsulot internetni kutmoqda — ulanish tiklanganda avtomatik yuboriladi.",
                style: const TextStyle(
                  fontSize: 12.5,
                  color: Color(0xFF92400E),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            TextButton(
              onPressed: () =>
                  context.read<AdminBloc>().add(const SyncOfflineQueue()),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFD97706),
                visualDensity: VisualDensity.compact,
              ),
              child: const Text(
                'Hozir yuborish',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Mobil Mahsulot kartochkasi — Phase 4.2 (saytdek variant-level qatorlar) ─
//
// Variantli mahsulot: GROUP header (umumiy nom + "5 variant" badge + product
// actions) + har variant alohida pastki qator (to'liq nom, narx, stok, polka).
// Variantsiz mahsulot: BITTA yagona qator (polka badge bilan).
//
// Variant qatorida edit tugmasi -> product editor ochiladi va o'sha variantga
// avtomat scroll bo'ladi (window.__bozorScrollVariantId saytdagi ekvivalenti).
class _ProductTile extends StatelessWidget {
  const _ProductTile({
    required this.product,
    required this.onEdit,
    required this.onEditVariant,
    required this.onClone,
    required this.onDelete,
  });
  final AdminProductModel product;
  final VoidCallback onEdit;
  final void Function(int variantId) onEditVariant;
  final VoidCallback onClone;
  final VoidCallback onDelete;

  static const _brand = Color(0xFF0A7C55);

  // Variantning to'liq nomi (mahsulot bilan birga, saytdagi `buildVariantFullName`
  // ga teng). Bo'sh atributlar avtomat o'tkazib yuboriladi.
  String _fullVariantName(AdminProductVariantModel v) {
    final parts = <String>[
      product.name,
      v.quality ?? '',
      v.model ?? '',
      v.size ?? '',
      v.color ?? '',
    ].map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    return parts.join(' • ');
  }

  // Variantning amaldagi polka qiymati — variant own -> effective -> product.
  // Backend `effective_shelf` field qaytaradi, lekin eski API javoblari yoki
  // mobil cache uchun defensive 3-pog'onali fallback.
  String _variantShelf(AdminProductVariantModel v) {
    final own = (v.shelfLocation ?? '').trim();
    if (own.isNotEmpty) return own;
    final eff = (v.effectiveShelf ?? '').trim();
    if (eff.isNotEmpty) return eff;
    return (product.shelfLocation ?? '').trim();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final variants = product.variants;
    final hasVariants = variants.isNotEmpty;
    final productShelf = (product.shelfLocation ?? '').trim();
    final totalStock = hasVariants
        ? variants.fold<int>(0, (s, v) => s + v.stock)
        : product.stock;

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ─── PRODUCT HEADER ───────────────────────────────────────────────
          InkWell(
            onTap: onEdit,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
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
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Nom + "N variant" badge
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                product.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            if (hasVariants)
                              Container(
                                margin: const EdgeInsets.only(left: 6),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 7, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _brand.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  '${variants.length} variant',
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: _brand,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        // Kimdan kelgan (yetkazib beruvchi) — faqat admin. Bo'sh
                        // bo'lsa ko'rinmaydi. Foydalanuvchiga umuman ko'rinmaydi.
                        if ((product.supplier ?? '').trim().isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              Icon(Icons.local_shipping_outlined,
                                  size: 12, color: theme.colorScheme.secondary),
                              const SizedBox(width: 3),
                              Expanded(
                                child: Text(
                                  'Kimdan: ${product.supplier!.trim()}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.secondary,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 4),
                        // Narx + jami stok (yoki variantsiz narx)
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            Text(
                              hasVariants
                                  ? '${fmt.format(product.price).replaceAll(',', ' ')} so\'m (min)'
                                  : '${fmt.format(product.price).replaceAll(',', ' ')} so\'m',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: _brand,
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                            // Optom (ulgurji) narx — faqat admin (mijozga ko'rinmaydi).
                            if (product.optomPrice != null &&
                                product.optomPrice! > 0)
                              Text(
                                "Optom: ${fmt.format(product.optomPrice).replaceAll(',', ' ')} so'm",
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.secondary,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            _Badge(
                              label: hasVariants
                                  ? 'Jami: $totalStock'
                                  : 'Stok: $totalStock',
                              color: totalStock > 0 ? Colors.blueGrey : Colors.red,
                            ),
                            if (!hasVariants && productShelf.isNotEmpty)
                              _ShelfBadge(label: productShelf),
                            if (hasVariants && productShelf.isNotEmpty)
                              _ShelfBadge(
                                label: '$productShelf (default)',
                                muted: true,
                              ),
                            if (product.isDiscount)
                              _Badge(label: 'Chegirma', color: Colors.orange),
                            if (!product.isActive)
                              _Badge(label: 'Nofaol', color: Colors.grey),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Action ustuni — vertikal kompakt
                  Column(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 20),
                        color: const Color(0xFF2563EB),
                        tooltip: 'Tahrirlash',
                        visualDensity: VisualDensity.compact,
                        constraints: const BoxConstraints(
                          minWidth: 32,
                          minHeight: 32,
                        ),
                        padding: EdgeInsets.zero,
                        onPressed: onEdit,
                      ),
                      IconButton(
                        icon: const Icon(Icons.content_copy_outlined, size: 18),
                        color: Colors.grey,
                        tooltip: 'Nusxa olish',
                        visualDensity: VisualDensity.compact,
                        constraints: const BoxConstraints(
                          minWidth: 32,
                          minHeight: 32,
                        ),
                        padding: EdgeInsets.zero,
                        onPressed: onClone,
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        color: Colors.red,
                        tooltip: "O'chirish",
                        visualDensity: VisualDensity.compact,
                        constraints: const BoxConstraints(
                          minWidth: 32,
                          minHeight: 32,
                        ),
                        padding: EdgeInsets.zero,
                        onPressed: onDelete,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // ─── VARIANT ROWS (faqat variantli mahsulot uchun) ────────────────
          if (hasVariants) ...[
            Container(
              height: 1,
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
            for (final v in variants)
              _VariantRow(
                variant: v,
                fullName: _fullVariantName(v),
                shelf: _variantShelf(v),
                productMainImage: product.mainImage,
                onEdit: () {
                  if (v.id != null) onEditVariant(v.id!);
                },
              ),
          ],
        ],
      ),
    );
  }
}

// ── Variant qatori (group ostida) — saytdagi ProductRowGroup variant tr ekvivalenti
class _VariantRow extends StatelessWidget {
  const _VariantRow({
    required this.variant,
    required this.fullName,
    required this.shelf,
    required this.productMainImage,
    required this.onEdit,
  });

  final AdminProductVariantModel variant;
  final String fullName;
  final String shelf;
  final String? productMainImage;
  final VoidCallback onEdit;

  static const _brand = Color(0xFF0A7C55);

  String? _variantImage() {
    // Variant rasm: birinchi gallery rasmi -> swatch -> product main image
    if (variant.images.isNotEmpty) {
      final first = variant.images.first;
      if (first.url.isNotEmpty) return first.url;
    }
    if ((variant.imageUrl ?? '').isNotEmpty) return variant.imageUrl;
    return productMainImage;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final img = _variantImage();
    final price = variant.price ?? 0;
    final stock = variant.stock;
    final hasOwnShelf = (variant.shelfLocation ?? '').trim().isNotEmpty;

    return InkWell(
      onTap: onEdit,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: _brand.withValues(alpha: 0.4), width: 3),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Variant rasm — sub-row visual marker bilan
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 40,
                height: 40,
                child: img != null
                    ? CachedNetworkImage(imageUrl: img, fit: BoxFit.cover)
                    : Container(
                        color: theme.colorScheme.surfaceContainer,
                        child: Icon(
                          Icons.image_outlined,
                          size: 18,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fullName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      Text(
                        '${fmt.format(price).replaceAll(',', ' ')} so\'m',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: _brand,
                        ),
                      ),
                      _Badge(
                        label: '$stock dona',
                        color: stock > 0 ? Colors.blueGrey : Colors.red,
                      ),
                      if (shelf.isNotEmpty)
                        _ShelfBadge(
                          label: shelf,
                          // Variant own shelf bo'lmasa "(default)" ko'rsatamiz
                          muted: !hasOwnShelf,
                        ),
                      if ((variant.sku ?? '').isNotEmpty)
                        Text(
                          variant.sku!,
                          style: TextStyle(
                            fontSize: 10,
                            color: theme.colorScheme.onSurfaceVariant
                                .withValues(alpha: 0.7),
                            fontFamily: 'monospace',
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            // Variant edit tugma — forma o'sha variantga scroll bo'ladi
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 18),
              color: const Color(0xFF2563EB),
              tooltip: 'Bu variantni tahrirlash',
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              padding: EdgeInsets.zero,
              onPressed: onEdit,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Polka badge — saytdagi <ShelfBadge> ekvivalenti ─────────────────────────
class _ShelfBadge extends StatelessWidget {
  const _ShelfBadge({required this.label, this.muted = false});
  final String label;
  // `muted=true` — product default polkasi (variant override emas).
  // Yoki product darajasidagi "default" badge — biroz pasaytirilgan tone.
  final bool muted;

  static const _brand = Color(0xFF0A7C55);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: _brand.withValues(alpha: muted ? 0.08 : 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: _brand.withValues(alpha: muted ? 0.18 : 0.32),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.pin_drop_outlined,
            size: 12,
            color: _brand.withValues(alpha: muted ? 0.7 : 1.0),
          ),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: _brand.withValues(alpha: muted ? 0.75 : 1.0),
              letterSpacing: 0.2,
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
