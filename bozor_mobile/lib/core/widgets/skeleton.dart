import 'package:flutter/material.dart';
import 'product_grid_config.dart';

/// Asosiy shimmer effekti — gradient'ni o'ng tomonga harakatlantiradi.
///
/// Hech qanday tashqi paket kerak emas — AnimatedBuilder + LinearGradient.
/// shimmer paketidan farqi: kichik, kontrolli, bizning theme'imizga moslangan.
class Shimmer extends StatefulWidget {
  final Widget child;
  final Duration duration;

  const Shimmer({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 1500),
  });

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseColor = isDark ? Colors.grey[800]! : Colors.grey[300]!;
    final highlightColor = isDark ? Colors.grey[700]! : Colors.grey[100]!;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            return LinearGradient(
              colors: [baseColor, highlightColor, baseColor],
              stops: const [0.0, 0.5, 1.0],
              begin: Alignment(-1.0 + _controller.value * 2, 0.0),
              end: Alignment(0.0 + _controller.value * 2, 0.0),
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

/// Skeleton placeholder konteyner — to'rtburchak (border-radius bilan).
/// Asosan Shimmer ichida ishlatiladi.
class SkeletonBox extends StatelessWidget {
  final double? width;
  final double? height;
  final double borderRadius;

  const SkeletonBox({
    super.key,
    this.width,
    this.height,
    this.borderRadius = 8,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: isDark ? Colors.grey[800] : Colors.grey[300],
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

/// Mahsulot kartochka uchun skeleton — rasm + nom + narx joylari.
/// Real ProductCard bilan o'lcham va layout bo'yicha mos kelishi shart.
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          // Rasm joyi (kvadrat)
          AspectRatio(
            aspectRatio: 1,
            child: SkeletonBox(borderRadius: 8),
          ),
          SizedBox(height: 12),
          // Mahsulot nomi (2 qator)
          SkeletonBox(height: 14, width: double.infinity),
          SizedBox(height: 6),
          SkeletonBox(height: 14, width: 100),
          SizedBox(height: 12),
          // Narx
          SkeletonBox(height: 18, width: 80),
        ],
      ),
    );
  }
}

/// Asosiy sahifa uchun to'liq skeleton:
///   • Banner placeholder (160px balandlik)
///   • Kategoriyalar gorizontal qator
///   • 2 ta mahsulot bo'limi (har birida 4 ta skeleton kartochka)
class HomePageSkeleton extends StatelessWidget {
  const HomePageSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        children: const [
          // Banner placeholder
          SkeletonBox(height: 160, borderRadius: 16),
          SizedBox(height: 24),

          // Kategoriyalar bo'limi sarlavhasi
          SkeletonBox(height: 20, width: 120),
          SizedBox(height: 12),
          // Kategoriyalar (gorizontal scroll)
          _CategoryRowSkeleton(),
          SizedBox(height: 24),

          // 1-bo'lim: "Tavsiya etilgan"
          SkeletonBox(height: 20, width: 140),
          SizedBox(height: 12),
          _ProductGridSkeleton(itemCount: 4),
          SizedBox(height: 24),

          // 2-bo'lim: "Mashhur"
          SkeletonBox(height: 20, width: 110),
          SizedBox(height: 12),
          _ProductGridSkeleton(itemCount: 4),
        ],
      ),
    );
  }
}

class _CategoryRowSkeleton extends StatelessWidget {
  const _CategoryRowSkeleton();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 80,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: 5,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, __) => Column(
          children: const [
            SkeletonBox(width: 56, height: 56, borderRadius: 28),
            SizedBox(height: 8),
            SkeletonBox(width: 50, height: 10),
          ],
        ),
      ),
    );
  }
}

class _ProductGridSkeleton extends StatelessWidget {
  final int itemCount;
  const _ProductGridSkeleton({required this.itemCount});

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      // Bir xil grid delegate — ProductCard bilan kelishilgan
      // childAspectRatio (0.62) va maxCrossAxisExtent (220).
      gridDelegate: productGridDelegate,
      itemCount: itemCount,
      itemBuilder: (_, __) => const ProductCardSkeleton(),
    );
  }
}
