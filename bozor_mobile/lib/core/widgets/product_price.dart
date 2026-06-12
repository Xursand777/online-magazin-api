import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../models/product_model.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';

/// ProductPrice — barcha mahsulot kartalari, listing, detail sahifalarida
/// narx ko'rsatish uchun yagona widget.
///
/// XULOS LOGIKASI (sayt bilan bir xil — frontend/src/components/ProductCard.tsx):
///
///   1. Foydalanuvchi USTA bo'lsa VA backend masterPrice yuborgan bo'lsa:
///      ┌────────────────────────────┐
///      │ 1 000 000 so'm (line-through, kichik, kulrang)
///      │ 950 000 so'm   USTA -5%      (primary rang, katta)
///      └────────────────────────────┘
///
///   2. Oddiy chegirma (is_discount=True) holatda:
///      ┌────────────────────────────┐
///      │ 1 000 000 so'm (line-through)
///      │ 900 000 so'm                 (primary rang)
///      └────────────────────────────┘
///
///   3. Chegirmasiz mahsulot:
///      ┌────────────────────────────┐
///      │ 1 000 000 so'm
///      └────────────────────────────┘
///
/// AUTH BLOCKA BOG'LIQ:
///   AuthBloc state'idan isMaster ni o'qiydi (BlocBuilder ichida). Foydalanuvchi
///   login bo'lganida yoki master statusi o'zgarganida widget avtomat
///   yangilanadi.
///
/// SUPER ADMIN FOIZNI O'ZGARTIRSA:
///   • Backend GlobalSetting save'da cache invalidate qiladi
///   • Mobile keyingi GET /api/products/ ga yangi masterPrice oladi
///   • UI darhol yangi narxni ko'rsatadi (BlocBuilder qayta build qiladi)
class ProductPrice extends StatelessWidget {
  final ProductModel product;

  /// Compact (small) varianti — product card uchun.
  /// Large varianti — product detail sahifasi uchun.
  final ProductPriceSize size;

  /// USTA badge ko'rsatish (default true). Kichik joylarda false qilish mumkin.
  final bool showBadge;

  const ProductPrice({
    super.key,
    required this.product,
    this.size = ProductPriceSize.compact,
    this.showBadge = true,
  });

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      buildWhen: (prev, curr) {
        // Faqat isMaster o'zgarganda qayta build (boshqa state'lar ta'sir qilmasin).
        final prevMaster = prev is AuthAuthenticated && prev.isMaster;
        final currMaster = curr is AuthAuthenticated && curr.isMaster;
        return prevMaster != currMaster;
      },
      builder: (context, state) {
        final isMaster = state is AuthAuthenticated && state.isMaster;
        final theme = Theme.of(context);
        final fmt = NumberFormat('#,###', 'uz_UZ');
        String f(num v) => "${fmt.format(v.round()).replaceAll(',', ' ')} so'm";

        // ── 1. USTA narxi ko'rsatish sharti ──────────────────────────────────
        if (isMaster && product.hasMasterPrice) {
          return _MasterPriceWidget(
            originalPrice: product.price,
            masterPrice: product.masterPrice!,
            discountPercent: product.masterDiscountPercent,
            size: size,
            showBadge: showBadge,
            formatter: f,
            theme: theme,
          );
        }

        // ── 2. Oddiy chegirma (eski narx + chegirma) ─────────────────────────
        if (product.oldPrice != null && product.oldPrice! > product.price) {
          return _DiscountPriceWidget(
            oldPrice: product.oldPrice!,
            price: product.price,
            size: size,
            formatter: f,
            theme: theme,
          );
        }

        // ── 3. Chegirmasiz narx ──────────────────────────────────────────────
        return _PlainPriceWidget(
          price: product.price,
          size: size,
          formatter: f,
          theme: theme,
        );
      },
    );
  }
}

enum ProductPriceSize { compact, large }

class _MasterPriceWidget extends StatelessWidget {
  final double originalPrice;
  final double masterPrice;
  final double discountPercent;
  final ProductPriceSize size;
  final bool showBadge;
  final String Function(num) formatter;
  final ThemeData theme;

  const _MasterPriceWidget({
    required this.originalPrice,
    required this.masterPrice,
    required this.discountPercent,
    required this.size,
    required this.showBadge,
    required this.formatter,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    final isLarge = size == ProductPriceSize.large;
    final originalFontSize = isLarge ? 14.0 : 10.0;
    final masterFontSize = isLarge ? 24.0 : 14.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Asl narx — line-through
        Text(
          formatter(originalPrice),
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.outline,
            decoration: TextDecoration.lineThrough,
            fontSize: originalFontSize,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        // Usta narxi + badge
        Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Flexible(
              child: Text(
                formatter(masterPrice),
                style: theme.textTheme.titleSmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w800,
                  fontSize: masterFontSize,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (showBadge) ...[
              const SizedBox(width: 6),
              _UstaBadge(
                discountPercent: discountPercent,
                large: isLarge,
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _DiscountPriceWidget extends StatelessWidget {
  final double oldPrice;
  final double price;
  final ProductPriceSize size;
  final String Function(num) formatter;
  final ThemeData theme;

  const _DiscountPriceWidget({
    required this.oldPrice,
    required this.price,
    required this.size,
    required this.formatter,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    final isLarge = size == ProductPriceSize.large;
    final oldFontSize = isLarge ? 14.0 : 10.0;
    final priceFontSize = isLarge ? 24.0 : 14.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          formatter(oldPrice),
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.outline,
            decoration: TextDecoration.lineThrough,
            fontSize: oldFontSize,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        Text(
          formatter(price),
          style: theme.textTheme.titleSmall?.copyWith(
            color: theme.colorScheme.onSurface,
            fontWeight: FontWeight.w800,
            fontSize: priceFontSize,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

class _PlainPriceWidget extends StatelessWidget {
  final double price;
  final ProductPriceSize size;
  final String Function(num) formatter;
  final ThemeData theme;

  const _PlainPriceWidget({
    required this.price,
    required this.size,
    required this.formatter,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    final isLarge = size == ProductPriceSize.large;
    final priceFontSize = isLarge ? 24.0 : 14.0;

    return Text(
      formatter(price),
      style: theme.textTheme.titleSmall?.copyWith(
        color: theme.colorScheme.onSurface,
        fontWeight: FontWeight.w800,
        fontSize: priceFontSize,
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

/// "USTA -X%" badge.
class _UstaBadge extends StatelessWidget {
  final double discountPercent;
  final bool large;

  const _UstaBadge({required this.discountPercent, this.large = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Foiz 1 kasrli aniqlikda, lekin butun bo'lsa kasr ko'rsatilmaydi
    final pct = discountPercent == discountPercent.roundToDouble()
        ? discountPercent.toInt().toString()
        : discountPercent.toStringAsFixed(1);
    final fontSize = large ? 11.0 : 9.0;
    final padH = large ? 8.0 : 6.0;
    final padV = large ? 4.0 : 2.0;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.primary.withValues(alpha: 0.25),
          width: 0.5,
        ),
      ),
      child: Text(
        'USTA -$pct%',
        style: TextStyle(
          color: theme.colorScheme.primary,
          fontWeight: FontWeight.w800,
          fontSize: fontSize,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
