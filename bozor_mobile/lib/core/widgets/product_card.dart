import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../models/product_model.dart';
import 'cart_action_button.dart';
import '../../features/profile/presentation/cubit/favorites_cubit.dart';
import '../../features/profile/presentation/cubit/favorites_state.dart';

class ProductCard extends StatelessWidget {
  final ProductModel product;

  const ProductCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: () {
        context.push('/product', extra: product);
      },
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 160, // Rasmlar balandligi doim bir xil bo'lishi kafolatlanadi
              child: Stack(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.transparent, // Orqa fonni oq yoki shaffof qilib rasmni ajralib turadigan qilamiz
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                      image: DecorationImage(
                        image: CachedNetworkImageProvider(product.imageUrl),
                        fit: BoxFit.contain, // Rasmlar kesilib qolmasligi va to'liq ko'rinishi uchun
                      ),
                    ),
                  ),
                  if (product.discountPercent != null)
                    Positioned(
                      top: 8,
                      left: 8, // Moved to left for standard discount position
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
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
                  Positioned(
                    top: 8,
                    right: 8, // Heart icon to the top right
                    child: BlocBuilder<FavoritesCubit, FavoritesState>(
                      builder: (context, state) {
                        final isFavorite = context.read<FavoritesCubit>().isProductFavorite(product.id);
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
                                  .withValues(alpha: 0.8),
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.05),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                )
                              ],
                            ),
                            child: Icon(
                              isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                              size: 18,
                              color: isFavorite ? Colors.red : theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            // ── Matn maydoni — har bir komponent FIXED HEIGHT ────────────────
            // Bu kafolatlaydi: kartochkaning balandligi har doim bir xil bo'ladi
            // (matn 1 yoki 2 satr bo'lishidan qat'i nazar). Avval `Expanded` +
            // `spaceBetween` ishlatilardi, bu bo'sh joyni har xil tarqatib,
            // kartochkalar turli ko'rinishga ega bo'lardi.
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Nom — DOIM 2 satr balandligida (1 satrlik ham 2 satr joy egallaydi)
                    SizedBox(
                      height: 36, // ~13fontSize × 1.2 lineHeight × 2 satr + padding
                      child: Text(
                        product.name,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                          fontSize: 13,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(height: 6),
                    // Eski narx — har doim 14px joy (bo'sh bo'lsa ham)
                    SizedBox(
                      height: 14,
                      child: product.oldPrice != null
                          ? Text(
                              "${NumberFormat('#,###', 'uz_UZ').format(product.oldPrice).replaceAll(',', ' ')} so'm",
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.outline,
                                decoration: TextDecoration.lineThrough,
                                fontSize: 10,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            )
                          : null, // bo'sh, lekin joy band
                    ),
                    // Joriy narx — fixed height
                    SizedBox(
                      height: 22,
                      child: Text(
                        "${NumberFormat('#,###', 'uz_UZ').format(product.price).replaceAll(',', ' ')} so'm",
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: theme.colorScheme.onSurface,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(height: 6),
                    // Cart tugma — joyni o'zi to'ldiradi (Expanded yo'q)
                    CartActionButton(product: product),
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
