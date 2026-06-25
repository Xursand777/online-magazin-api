import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/product_model.dart';
import 'cart_action_button.dart';
import 'product_price.dart';
import '../../features/profile/presentation/cubit/favorites_cubit.dart';
import '../../features/profile/presentation/cubit/favorites_state.dart';

/// ProductCard — Mahsulot kartochkasi.
///
/// PROFESSIONAL RESPONSIVE PATTERN (Wildberries, Amazon, Uzum Market):
///
///   ❌ ESKI YONDASHUV — HECH QACHON USHLAMA:
///      SizedBox(height: 160) — image qattiq balandligi
///      SizedBox(height: 36)  — name qattiq balandligi
///      SizedBox(height: 38)  — price qattiq balandligi
///      → Har bir element o'z joyini taqsimlamaydi
///      → Ekran kichik bo'lsa overflow chiqadi (1.00 pixels on the bottom)
///      → mainAxisExtent: 320 qattiq balandlik kerak bo'ladi
///
///   ✅ YANGI YONDASHUV — Flexible layout:
///      AspectRatio(1)  — image kvadrat, card kengligiga moslashadi
///      Expanded        — content area qolgan balandlikni egallaydi
///      spaceBetween    — name yuqorida, price+button pastida
///      Flexible(Text)  — text overflow bo'lmaydi
///      → Card balandligi grid `childAspectRatio` bilan aniqlanadi
///      → Hech qanday qattiq SizedBox(height:) yo'q
///      → Har xil telefonda bir xil ko'rinish, hech qanday overflow
///
/// QO'LLANISHI:
///   GridView yoki SliverGrid'da `productGridDelegate()` bilan ishlatiladi
///   (qarang: core/widgets/product_grid_config.dart).
class ProductCard extends StatelessWidget {
  final ProductModel product;

  const ProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: () => context.push('/product', extra: product),
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: theme.colorScheme.outlineVariant),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── IMAGE — AspectRatio kvadrat ──────────────────────────────────
            // AspectRatio(1) — image card kengligiga moslashadi (160px qattiq
            // EMAS). Kichik ekranda kichkina, kattaroqda kattaroq. Hech qanday
            // overflow bo'lmaydi.
            AspectRatio(
              aspectRatio: 1.0,
              child: _ImageStack(product: product, theme: theme),
            ),

            // ── CONTENT — Expanded qolgan joyni egallaydi ────────────────────
            // mainAxisAlignment.spaceBetween: nom yuqorida, narx+savatga pastda
            // Kompakt padding (10/6/10/6) qo'shimcha 4px joy beradi.
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Nom — yuqorida, maxLines:2 + ellipsis (overflow yo'q)
                    Text(
                      product.name,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.15,
                        fontSize: 13,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),

                    // Narx + tugma — pastida, mainAxisSize.min bilan o'z joyini
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // ProductPrice — usta chegirmasi yoki oddiy narx
                        // (AuthBloc'dan isMaster o'qiydi). NO qattiq height!
                        ProductPrice(
                          product: product,
                          size: ProductPriceSize.compact,
                        ),
                        const SizedBox(height: 4),
                        // Savatga tugmasi — o'z balandligi (~38px)
                        CartActionButton(product: product),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Image stack — rasm + chegirma badge + sevimli tugma.
/// AspectRatio(1) ichida ishlatiladi.
class _ImageStack extends StatelessWidget {
  final ProductModel product;
  final ThemeData theme;

  const _ImageStack({required this.product, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Rasm — center, contain (kesilib qolmaydi)
        ColoredBox(
          color: Colors.white.withValues(alpha: 0.02),
          child: CachedNetworkImage(
            imageUrl: product.imageUrl,
            fit: BoxFit.contain,
            placeholder: (context, url) => ColoredBox(
              color: theme.colorScheme.surfaceContainerLow,
              child: Center(
                child: Icon(
                  Icons.image_outlined,
                  color: theme.colorScheme.outlineVariant,
                  size: 40,
                ),
              ),
            ),
            errorWidget: (context, url, error) => ColoredBox(
              color: theme.colorScheme.surfaceContainerLow,
              child: Center(
                child: Icon(
                  Icons.broken_image_outlined,
                  color: theme.colorScheme.outlineVariant,
                  size: 40,
                ),
              ),
            ),
          ),
        ),

        // Stock=0 → "Tugagan" overlay (sotuvga yaroqsiz; xarid CartActionButton'da
        // bloklangan). Mahsulot katalogda ko'rinadi, lekin sotib bo'lmaydi (Uzum uslubi).
        if (product.stock != null && product.stock == 0)
          Positioned.fill(
            child: Container(
              color: theme.colorScheme.surface.withValues(alpha: 0.45),
              alignment: Alignment.center,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: theme.colorScheme.error,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.do_not_disturb_outlined,
                        color: theme.colorScheme.onError, size: 14),
                    const SizedBox(width: 4),
                    Text('Tugagan',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onError,
                          fontWeight: FontWeight.bold,
                        )),
                  ],
                ),
              ),
            ),
          ),

        // Chegirma badge
        if (product.discountPercent != null)
          Positioned(
            top: 8,
            left: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: theme.colorScheme.error,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '-${product.discountPercent}%',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onError,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),

        // Sevimli tugmasi
        Positioned(
          top: 8,
          right: 8,
          child: BlocBuilder<FavoritesCubit, FavoritesState>(
            builder: (context, state) {
              final isFavorite =
                  context.read<FavoritesCubit>().isProductFavorite(product.id);
              return GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  context.read<FavoritesCubit>().toggleFavorite(product);
                },
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerLowest
                        .withValues(alpha: 0.85),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Icon(
                    isFavorite
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    size: 18,
                    color: isFavorite
                        ? Colors.red
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
