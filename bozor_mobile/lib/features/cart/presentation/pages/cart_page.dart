import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/i18n/language_extension.dart';
import '../../../../core/widgets/login_required_sheet.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../bloc/cart_bloc.dart';

class CartPage extends StatelessWidget {
  const CartPage({super.key});

  /// Tozalash tasdiqlash dialogi — foydalanuvchi tasodifan bosib qo'ymasligi
  /// uchun. Tasdiqlanganda ClearCart event yuboriladi — bu server'dagi har bir
  /// item'ni DELETE qiladi + lokal tozalanadi (ghost items resurrection yo'q).
  void _confirmClearCart(BuildContext context) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.delete_sweep_rounded, size: 32),
        title: const Text("Savatni tozalashni tasdiqlang"),
        content: const Text("Savatdagi barcha mahsulotlar o'chiriladi. "
            "Bu amalni qaytarib bo'lmaydi."),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text("Bekor qilish"),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.errorContainer,
              foregroundColor: Theme.of(ctx).colorScheme.onErrorContainer,
            ),
            child: const Text("Ha, tozalash"),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true && context.mounted) {
        context.read<CartBloc>().add(ClearCart());
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Savat tozalandi"),
            behavior: SnackBarBehavior.floating,
            duration: Duration(seconds: 2),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          context.tr('cart.title'),
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          BlocBuilder<CartBloc, CartState>(
            buildWhen: (a, b) => a.items.isEmpty != b.items.isEmpty,
            builder: (context, state) {
              if (state.items.isEmpty) return const SizedBox.shrink();
              return IconButton(
                icon: const Icon(Icons.delete_sweep_outlined),
                tooltip: "Savatni tozalash",
                onPressed: () => _confirmClearCart(context),
              );
            },
          ),
        ],
      ),
      body: BlocBuilder<CartBloc, CartState>(
        builder: (context, state) {
          if (state.items.isEmpty) {
            return const Center(child: Text('Savatingiz bo\'sh'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: state.items.length,
            separatorBuilder: (context, index) => const SizedBox(height: 16),
            itemBuilder: (context, index) {
              final item = state.items[index];
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: CachedNetworkImage(
                        imageUrl: item.product.imageUrl,
                        width: 80,
                        height: 80,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.product.name,
                            style: theme.textTheme.titleMedium,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 8),
                          // Usta narxi mavjud bo'lsa — primary rangda usta narxi
                          // + oddiy narx tagiga chizilgan (line-through) + USTA
                          // belgisi. Aks holda oddiy narx (homedagi kabi).
                          if (item.product.hasMasterPrice) ...[
                            Row(
                              children: [
                                Text(
                                  '${NumberFormat('#,###', 'uz_UZ').format(item.product.masterPrice).replaceAll(',', ' ')} so\'m',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    color: theme.colorScheme.primary,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.primary
                                        .withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    'USTA',
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: theme.colorScheme.primary,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 9,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              '${NumberFormat('#,###', 'uz_UZ').format(item.product.price).replaceAll(',', ' ')} so\'m',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.outline,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          ] else
                            Text(
                              '${NumberFormat('#,###', 'uz_UZ').format(item.product.price).replaceAll(',', ' ')} so\'m',
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: theme.colorScheme.primary,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                        ],
                      ),
                    ),
                    Column(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.add_circle_outline),
                          tooltip: "Ko'paytirish",
                          // Variant-aware: variant_id ham yuboriladi — boshqa
                          // variantni emas, AYNAN shu line item'ni o'zgartiradi.
                          // Stock check: stock'dan oshmaslik kerak (server ham
                          // tekshiradi, lekin frontend feedback yaxshi UX).
                          onPressed: () {
                            final stock = item.product.stock;
                            if (stock != null && item.quantity >= stock) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text("Omborda $stock ta mavjud"),
                                  behavior: SnackBarBehavior.floating,
                                  duration: const Duration(seconds: 2),
                                ),
                              );
                              return;
                            }
                            context.read<CartBloc>().add(
                              UpdateQuantity(
                                item.product.id,
                                item.quantity + 1,
                                variantId: item.product.variantId,
                              ),
                            );
                          },
                        ),
                        Text(
                          '${item.quantity}',
                          style: theme.textTheme.titleMedium,
                        ),
                        IconButton(
                          icon: Icon(
                            item.quantity > 1
                                ? Icons.remove_circle_outline
                                : Icons.delete_outline,
                          ),
                          tooltip: item.quantity > 1
                              ? "Kamaytirish"
                              : "O'chirish",
                          onPressed: () {
                            if (item.quantity > 1) {
                              context.read<CartBloc>().add(
                                UpdateQuantity(
                                  item.product.id,
                                  item.quantity - 1,
                                  variantId: item.product.variantId,
                                ),
                              );
                            } else {
                              // qty=1 → delete bossa to'liq o'chiradi
                              context.read<CartBloc>().add(
                                RemoveFromCart(
                                  item.product.id,
                                  variantId: item.product.variantId,
                                ),
                              );
                            }
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
      bottomNavigationBar: BlocBuilder<CartBloc, CartState>(
        builder: (context, state) {
          if (state.items.isEmpty) return const SizedBox.shrink();
          return Container(
            padding: const EdgeInsets.all(24),
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
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Jami:', style: theme.textTheme.bodyMedium),
                      Text(
                        '${NumberFormat('#,###', 'uz_UZ').format(state.totalAmount).replaceAll(',', ' ')} so\'m',
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ],
                  ),
                  ElevatedButton(
                    // Auth check — Amazon/Wildberries uslubi:
                    // Mehmon foydalanuvchi bo'lsa, chiroyli login modal ko'rsatamiz.
                    // Login bo'lgan foydalanuvchi to'g'ridan-to'g'ri checkout'ga.
                    onPressed: () {
                      final isLoggedIn = context.read<AuthBloc>().state
                          is AuthAuthenticated;
                      if (!isLoggedIn) {
                        showLoginRequiredSheet(
                          context,
                          title: "Buyurtma rasmiylashtirish",
                          subtitle:
                              "Savatingizdagi mahsulotlarni xarid qilish "
                              "uchun tizimga kiring",
                          redirectTo: '/cart',
                        );
                        return;
                      }
                      context.push('/checkout', extra: {
                        'isQuickBuy': false,
                      });
                    },
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 32,
                        vertical: 16,
                      ),
                    ),
                    child: Text(context.tr('cart.checkout')),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
