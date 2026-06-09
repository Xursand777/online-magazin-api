import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/product_model.dart';
import '../../features/cart/presentation/bloc/cart_bloc.dart';

/// Variant-aware cart action button.
///
/// Mahsulot savatda BO'LMASA  → "Savatga" tugma
/// Mahsulot savatda BO'LSA    → [-][N][+] stepper
///
/// **Variant-aware lookup**: `(productId, variantId)` juftligi bo'yicha
/// qidiradi. Bir mahsulotning 2 ta varianti bir-biridan mustaqil sanaladi.
/// Avval faqat `productId` bo'yicha qidirar edi — 2 varianti bir-birini
/// almashtirib yuborar edi (bug).
///
/// `large` flag — ProductDetail bottom bar uchun katta o'lcham (48px).
/// Default — 38px (home grid uchun).
class CartActionButton extends StatelessWidget {
  final ProductModel product;
  final bool large;

  const CartActionButton({
    super.key,
    required this.product,
    this.large = false,
  });

  /// Out-of-stock'da disabled bo'ladi.
  bool get _isOutOfStock {
    final s = product.stock;
    if (s == null) return false;
    return s <= 0;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final height = large ? 48.0 : 38.0;

    return BlocBuilder<CartBloc, CartState>(
      // Performance: faqat shu (productId, variantId) miqdori o'zgarganda rebuild
      buildWhen: (prev, curr) =>
          prev.quantityFor(product.id, product.variantId) !=
          curr.quantityFor(product.id, product.variantId),
      builder: (context, state) {
        // ⚡ Variant-aware: (productId, variantId) juftligi bo'yicha qidiramiz
        final quantity = state.quantityFor(product.id, product.variantId);
        final inCart = quantity > 0;

        if (inCart) {
          return _buildStepper(context, theme, height, quantity);
        }
        return _buildAddButton(context, theme, height);
      },
    );
  }

  // ── Stepper: [-][N][+] ───────────────────────────────────────────────────

  Widget _buildStepper(
    BuildContext context,
    ThemeData theme,
    double height,
    int quantity,
  ) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.colorScheme.primary, width: 1.5),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _StepperIconButton(
            icon: quantity > 1
                ? Icons.remove_rounded
                : Icons.delete_outline_rounded,
            color: theme.colorScheme.primary,
            onTap: () {
              HapticFeedback.lightImpact();
              if (quantity > 1) {
                context.read<CartBloc>().add(UpdateQuantity(
                      product.id,
                      quantity - 1,
                      variantId: product.variantId,
                    ));
              } else {
                context.read<CartBloc>().add(RemoveFromCart(
                      product.id,
                      variantId: product.variantId,
                    ));
              }
            },
          ),
          Expanded(
            child: Center(
              child: Text(
                '$quantity',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: theme.colorScheme.primary,
                  fontSize: large ? 18 : 16,
                ),
              ),
            ),
          ),
          _StepperIconButton(
            icon: Icons.add_rounded,
            color: theme.colorScheme.primary,
            onTap: _isOutOfStock
                ? null
                : () {
                    // Stock limit tekshiruvi
                    final maxStock = product.stock;
                    if (maxStock != null && quantity >= maxStock) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text("Omborda $maxStock ta mavjud"),
                        behavior: SnackBarBehavior.floating,
                        duration: const Duration(seconds: 2),
                      ));
                      return;
                    }
                    HapticFeedback.lightImpact();
                    context.read<CartBloc>().add(UpdateQuantity(
                          product.id,
                          quantity + 1,
                          variantId: product.variantId,
                        ));
                  },
          ),
        ],
      ),
    );
  }

  // ── "Savatga" tugmasi ─────────────────────────────────────────────────────

  Widget _buildAddButton(
    BuildContext context,
    ThemeData theme,
    double height,
  ) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _isOutOfStock
            ? null
            : () {
                HapticFeedback.lightImpact();
                context.read<CartBloc>().add(AddToCart(product));
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: const Text("Savatga qo'shildi"),
                  backgroundColor: theme.colorScheme.primary,
                  duration: const Duration(milliseconds: 1200),
                  behavior: SnackBarBehavior.floating,
                ));
              },
        style: ElevatedButton.styleFrom(
          backgroundColor: theme.colorScheme.primary,
          foregroundColor: theme.colorScheme.onPrimary,
          elevation: 0,
          padding: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          disabledBackgroundColor: theme.colorScheme.surfaceContainerHighest,
          disabledForegroundColor: theme.colorScheme.onSurfaceVariant,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _isOutOfStock
                  ? Icons.do_not_disturb_outlined
                  : Icons.shopping_cart_outlined,
              size: large ? 20 : 18,
            ),
            const SizedBox(width: 6),
            Text(
              _isOutOfStock ? "Sotuvda yo'q" : 'Savatga',
              style: TextStyle(
                fontSize: large ? 16 : 14,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Stepper'ning ichki kichik tugmasi — kvadrat tap-area, ikon o'rtada.
class _StepperIconButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;

  const _StepperIconButton({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            icon,
            size: 20,
            color: onTap == null ? color.withValues(alpha: 0.4) : color,
          ),
        ),
      ),
    );
  }
}
