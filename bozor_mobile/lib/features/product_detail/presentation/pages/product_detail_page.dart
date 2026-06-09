import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/widgets/cart_action_button.dart';
import '../../../../core/widgets/product_card.dart';
import '../bloc/product_detail_bloc.dart';

/// Mahsulot batafsil sahifa — variant tanlash bilan (sayt bilan bir xil).
///
/// Foydalanuvchi rang/sifat/xotira bo'yicha variant tanlay oladi. Tanlangan
/// variantning narxi, rasmi, stocki avtomatik yangilanadi. Savatga qo'shilganda
/// aynan tanlangan variant qo'shiladi.
class ProductDetailPage extends StatelessWidget {
  /// Home sahifadagi kartadan keladi — variant_id va boshqa ma'lumotlar bor.
  final ProductModel product;

  const ProductDetailPage({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<ProductDetailBloc>()
        ..add(LoadProductDetail(
          productId: product.id,
          preselectedVariantId: product.variantId,
        )),
      child: _ProductDetailView(initialProduct: product),
    );
  }
}

class _ProductDetailView extends StatelessWidget {
  final ProductModel initialProduct;

  const _ProductDetailView({required this.initialProduct});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(initialProduct.name, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(icon: const Icon(Icons.favorite_border), onPressed: () {}),
          IconButton(icon: const Icon(Icons.share), onPressed: () {}),
        ],
      ),
      body: BlocBuilder<ProductDetailBloc, ProductDetailState>(
        builder: (context, state) {
          if (state is ProductDetailLoading || state is ProductDetailInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is ProductDetailError) {
            return _buildError(context, state.message);
          }
          if (state is ProductDetailLoaded) {
            return _buildContent(context, state, theme);
          }
          return const SizedBox.shrink();
        },
      ),
      bottomSheet: BlocBuilder<ProductDetailBloc, ProductDetailState>(
        builder: (context, state) {
          if (state is ProductDetailLoaded) {
            return _buildBottomBar(context, state, theme);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  // ── Asosiy kontent ──────────────────────────────────────────────────────

  Widget _buildContent(BuildContext context, ProductDetailLoaded state, ThemeData theme) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeroImage(state),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildBadgesRow(state, theme),
                const SizedBox(height: 12),
                // To'liq nom — variantning to'liq nomi bilan (sayt bilan bir xil)
                Text(
                  state.displayTitle,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                _buildPrice(state, theme),
                const SizedBox(height: 8),
                _buildStockBadge(state, theme),
                const SizedBox(height: 24),

                if (state.colorOptions.isNotEmpty) ...[
                  _buildColorPicker(context, state, theme),
                  const SizedBox(height: 20),
                ],
                if (state.qualityOptions.isNotEmpty) ...[
                  _buildQualityPicker(context, state, theme),
                  const SizedBox(height: 20),
                ],
                if (state.sizeOptions.isNotEmpty) ...[
                  _buildSizePicker(context, state, theme),
                  const SizedBox(height: 20),
                ],

                if (state.product.description.isNotEmpty) ...[
                  const Divider(),
                  const SizedBox(height: 16),
                  Text('Tavsif',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text(state.product.description,
                      style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 24),
                ],

                if (state.similarProducts.isNotEmpty) ...[
                  const Divider(),
                  const SizedBox(height: 16),
                  Text("O'xshash mahsulotlar",
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  _buildSimilarProducts(state.similarProducts),
                ],

                const SizedBox(height: 90), // bottomSheet uchun joy
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroImage(ProductDetailLoaded state) {
    final url = state.currentImage;
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        color: Colors.grey.withValues(alpha: 0.05),
        child: url != null && url.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.contain,
                placeholder: (_, __) =>
                    const Center(child: CircularProgressIndicator()),
                errorWidget: (_, __, ___) =>
                    const Center(child: Icon(Icons.image_not_supported, size: 64)),
              )
            : const Center(child: Icon(Icons.image_not_supported, size: 64)),
      ),
    );
  }

  Widget _buildBadgesRow(ProductDetailLoaded state, ThemeData theme) {
    final price = state.currentPrice;
    final discount = state.currentDiscountPrice;
    int? discountPercent;
    if (discount != null && price > 0 && discount < price) {
      discountPercent = (((price - discount) / price) * 100).round();
    }
    return Row(
      children: [
        if (discountPercent != null && discountPercent > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: theme.colorScheme.error,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('-$discountPercent%',
                style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onError,
                    fontWeight: FontWeight.bold)),
          ),
        if (state.product.isNew) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: theme.colorScheme.primary,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('Yangi',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onPrimary,
                  fontWeight: FontWeight.bold,
                )),
          ),
        ],
      ],
    );
  }

  Widget _buildPrice(ProductDetailLoaded state, ThemeData theme) {
    final fmt = NumberFormat('#,###', 'uz_UZ');
    String f(num v) => '${fmt.format(v).replaceAll(',', ' ')} so\'m';

    final price = state.currentPrice;
    final discount = state.currentDiscountPrice;

    if (discount != null && discount < price) {
      return Wrap(
        crossAxisAlignment: WrapCrossAlignment.end,
        spacing: 12,
        children: [
          Text(f(discount),
              style: theme.textTheme.headlineMedium?.copyWith(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.bold,
              )),
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              f(price),
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.outline,
                decoration: TextDecoration.lineThrough,
              ),
            ),
          ),
        ],
      );
    }
    return Text(f(price),
        style: theme.textTheme.headlineMedium?.copyWith(
          color: theme.colorScheme.primary,
          fontWeight: FontWeight.bold,
        ));
  }

  Widget _buildStockBadge(ProductDetailLoaded state, ThemeData theme) {
    final stock = state.currentStock;
    if (stock <= 0) {
      return Row(children: [
        Icon(Icons.error_outline, size: 16, color: theme.colorScheme.error),
        const SizedBox(width: 6),
        Text('Sotuvda yo\'q',
            style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.error)),
      ]);
    }
    if (stock <= 5) {
      return Row(children: [
        Icon(Icons.warning_amber, size: 16, color: Colors.orange.shade700),
        const SizedBox(width: 6),
        Text('Faqat $stock ta qoldi',
            style: theme.textTheme.labelMedium?.copyWith(color: Colors.orange.shade800)),
      ]);
    }
    return Row(children: [
      Icon(Icons.check_circle_outline, size: 16, color: Colors.green.shade700),
      const SizedBox(width: 6),
      Text('Sotuvda mavjud',
          style: theme.textTheme.labelMedium?.copyWith(color: Colors.green.shade700)),
    ]);
  }

  Widget _buildColorPicker(
      BuildContext context, ProductDetailLoaded state, ThemeData theme) {
    final selected = state.selectedVariant?.color;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text("Rang", style: theme.textTheme.titleSmall),
          if (selected != null) ...[
            const SizedBox(width: 6),
            Text(": $selected",
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
          ],
        ]),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: state.colorOptions.map((v) {
            final active = v.color == selected;
            final disabled = v.stock <= 0;
            final hex = v.colorHex ?? _colorToHex(v.color);
            final color = _parseHex(hex) ?? theme.colorScheme.surfaceContainer;

            return InkWell(
              onTap: disabled
                  ? null
                  : () => context
                      .read<ProductDetailBloc>()
                      .add(SelectByColor(v.color ?? '')),
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: active ? theme.colorScheme.primary : theme.colorScheme.outline,
                    width: active ? 3 : 1.5,
                  ),
                  boxShadow: active
                      ? [
                          BoxShadow(
                            color: theme.colorScheme.primary.withValues(alpha: 0.3),
                            blurRadius: 8,
                            spreadRadius: 1,
                          ),
                        ]
                      : null,
                ),
                child: Container(
                  margin: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color,
                    border: Border.all(color: Colors.black12),
                  ),
                  child: disabled
                      ? const Icon(Icons.do_not_disturb,
                          size: 18, color: Colors.white70)
                      : null,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildQualityPicker(
      BuildContext context, ProductDetailLoaded state, ThemeData theme) {
    final selected = state.selectedVariant?.quality;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Sifat", style: theme.textTheme.titleSmall),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: state.qualityOptions.map((v) {
            final label = v.quality ?? '';
            final active = label == selected;
            final disabled = v.stock <= 0;
            return _pillButton(
              theme: theme,
              label: label,
              active: active,
              disabled: disabled,
              onTap: () =>
                  context.read<ProductDetailBloc>().add(SelectByQuality(label)),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildSizePicker(
      BuildContext context, ProductDetailLoaded state, ThemeData theme) {
    final selected = state.selectedVariant?.size ?? state.selectedVariant?.model;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Xotira / O'lcham", style: theme.textTheme.titleSmall),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: state.sizeOptions.map((v) {
            final label = v.size ?? v.model ?? '';
            final active = label == selected;
            final disabled = v.stock <= 0;
            return _pillButton(
              theme: theme,
              label: label,
              active: active,
              disabled: disabled,
              onTap: () =>
                  context.read<ProductDetailBloc>().add(SelectBySize(label)),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _pillButton({
    required ThemeData theme,
    required String label,
    required bool active,
    required bool disabled,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: active
              ? theme.colorScheme.primaryContainer
              : theme.colorScheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? theme.colorScheme.primary : theme.colorScheme.outlineVariant,
            width: active ? 2 : 1,
          ),
        ),
        child: Text(label,
            style: theme.textTheme.labelLarge?.copyWith(
              color: disabled
                  ? theme.colorScheme.onSurface.withValues(alpha: 0.4)
                  : active
                      ? theme.colorScheme.primary
                      : theme.colorScheme.onSurface,
              fontWeight: active ? FontWeight.bold : FontWeight.w500,
              decoration: disabled ? TextDecoration.lineThrough : null,
            )),
      ),
    );
  }

  /// O'xshash mahsulotlar listi — sayt va home grid bilan bir xil o'lcham.
  ///
  /// Home GridView'da `mainAxisExtent: 320` (kvadrat rasmlar + matn maydon).
  /// Bu yerda ham bir xil 320×170 o'lcham — barcha kartochkalar **uniform**.
  /// Avval 280×160 edi → 14px overflow (button kesilar edi). Tuzatildi.
  Widget _buildSimilarProducts(List<ProductModel> products) {
    return SizedBox(
      height: 320, // ✅ Home grid bilan bir xil; overflow yo'q
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: products.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => SizedBox(
          width: 170, // ✅ Bir oz kengroq — matn yaxshiroq sig'adi
          child: ProductCard(product: products[i]),
        ),
      ),
    );
  }

  Widget _buildBottomBar(
      BuildContext context, ProductDetailLoaded state, ThemeData theme) {
    final variant = state.selectedVariant;
    // Tanlangan variant ma'lumoti bilan ProductModel yasaymiz — bu obyekt
    // CartActionButton orqali butun ilova bo'ylab BIR XIL cart key bilan
    // sinxron ishlaydi (productId + variantId).
    final cartProduct = ProductModel(
      id: state.product.id,
      name: state.displayTitle,
      description: state.product.description,
      price: state.currentDiscountPrice ?? state.currentPrice,
      oldPrice: state.currentDiscountPrice != null ? state.currentPrice : null,
      imageUrl: state.currentImage ?? '',
      isNew: state.product.isNew,
      cardId: variant != null
          ? '${state.product.id}-${variant.id}'
          : state.product.id.toString(),
      variantId: variant?.id,
      stock: state.currentStock,
    );

    final outOfStock = state.currentStock <= 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            // ─── CartActionButton (variant-aware, "Savatga" ↔ "-1+" stepper) ──
            // Home, ProductDetail, Cart hammasi shu CartBloc state'ga qaraydi.
            // Soni qaerda o'zgarsa, hamma joyda darhol sinxron ko'rinadi.
            Expanded(
              child: CartActionButton(
                product: cartProduct,
                large: true, // 48px height — bottom bar uchun
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: outOfStock
                      ? null
                      : () {
                          context.push('/checkout', extra: {
                            'isQuickBuy': true,
                            'product': cartProduct,
                          });
                        },
                  icon: const Icon(Icons.flash_on, size: 20),
                  label: const Text("Tezkor xarid"),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError(BuildContext context, String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 56, color: Colors.red),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {
                context.read<ProductDetailBloc>().add(
                      LoadProductDetail(productId: initialProduct.id),
                    );
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Color helperlar ───────────────────────────────────────────────────

  static Color? _parseHex(String? hex) {
    if (hex == null || hex.isEmpty) return null;
    var clean = hex.trim();
    if (clean.startsWith('#')) clean = clean.substring(1);
    if (clean.length == 6) clean = 'FF$clean';
    final v = int.tryParse(clean, radix: 16);
    return v == null ? null : Color(v);
  }

  static String? _colorToHex(String? name) {
    if (name == null) return null;
    return _colorMap[name.toLowerCase().trim()];
  }

  static const Map<String, String> _colorMap = {
    'qora': '#111827',
    'black': '#111827',
    'oq': '#f8fafc',
    'white': '#f8fafc',
    'kulrang': '#8b8f98',
    'gray': '#8b8f98',
    'grey': '#8b8f98',
    'graphite': '#3a3a3a',
    "ko'k": '#2563eb',
    'kok': '#2563eb',
    'blue': '#2563eb',
    'yashil': '#16a34a',
    'green': '#16a34a',
    'olive': '#93d2ab',
    'qizil': '#dc2626',
    'red': '#dc2626',
    'sariq': '#facc15',
    'yellow': '#facc15',
    'orange': '#f97316',
    'pushti': '#ec4899',
    'pink': '#ec4899',
    'binafsha': '#8b5cf6',
    'purple': '#8b5cf6',
    'titanium': '#a8a29e',
    'desert': '#c9a274',
    'midnight black': '#0a0a23',
  };
}
