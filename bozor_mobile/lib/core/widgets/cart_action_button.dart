import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../models/product_model.dart';
import '../models/cart_item_model.dart';
import '../../features/cart/presentation/bloc/cart_bloc.dart';

class CartActionButton extends StatelessWidget {
  final ProductModel product;

  const CartActionButton({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BlocBuilder<CartBloc, CartState>(
      builder: (context, state) {
        final cartItem = state.items
            .cast<CartItemModel?>()
            .firstWhere((item) => item?.product.id == product.id, orElse: () => null);

        final isInCart = cartItem != null;
        final quantity = cartItem?.quantity ?? 0;

        if (isInCart && quantity > 0) {
          // [-] [1] [+] ko'rinishi
          return Container(
            height: 38,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: theme.colorScheme.primary),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  onPressed: () {
                    if (quantity > 1) {
                      context.read<CartBloc>().add(UpdateQuantity(product.id, quantity - 1));
                    } else {
                      context.read<CartBloc>().add(RemoveFromCart(product.id));
                    }
                  },
                  icon: Icon(Icons.remove, size: 18, color: theme.colorScheme.primary),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                ),
                Text(
                  '$quantity',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
                IconButton(
                  onPressed: () {
                    context.read<CartBloc>().add(UpdateQuantity(product.id, quantity + 1));
                  },
                  icon: Icon(Icons.add, size: 18, color: theme.colorScheme.primary),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                ),
              ],
            ),
          );
        }

        // [Savatga] tugmasi
        return SizedBox(
          height: 38,
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () {
              context.read<CartBloc>().add(AddToCart(product));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: const Text("Savatga qo'shildi"),
                  backgroundColor: theme.colorScheme.primary,
                  duration: const Duration(seconds: 1),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: theme.colorScheme.onPrimary,
              elevation: 0,
              padding: const EdgeInsets.symmetric(horizontal: 0),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.shopping_cart_outlined, size: 18),
                SizedBox(width: 6),
                Text(
                  'Savatga',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
