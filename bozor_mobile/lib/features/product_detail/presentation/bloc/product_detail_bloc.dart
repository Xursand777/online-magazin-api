import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/models/product_model.dart';
import '../../data/models/product_detail_model.dart';
import '../../data/repositories/product_detail_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

abstract class ProductDetailEvent extends Equatable {
  const ProductDetailEvent();
  @override
  List<Object?> get props => [];
}

/// Mahsulotni yuklash. `preselectedVariantId` — URL/extra'dan kelgan variant.
class LoadProductDetail extends ProductDetailEvent {
  final int productId;
  final int? preselectedVariantId;
  const LoadProductDetail({required this.productId, this.preselectedVariantId});
  @override
  List<Object?> get props => [productId, preselectedVariantId];
}

/// Variantni ID bo'yicha tanlash (Amazon/Wildberries usuli — single source of truth).
class SelectVariant extends ProductDetailEvent {
  final int variantId;
  const SelectVariant(this.variantId);
  @override
  List<Object?> get props => [variantId];
}

/// Foydalanuvchi rangni bosdi — bir xil rang bilan eng mos variantni topamiz.
class SelectByColor extends ProductDetailEvent {
  final String color;
  const SelectByColor(this.color);
  @override
  List<Object?> get props => [color];
}

/// Foydalanuvchi sifatni bosdi — bir xil sifat bilan eng mos variantni topamiz.
class SelectByQuality extends ProductDetailEvent {
  final String quality;
  const SelectByQuality(this.quality);
  @override
  List<Object?> get props => [quality];
}

/// Foydalanuvchi xotira/o'lcham bosdi — eng mos variantni topamiz.
class SelectBySize extends ProductDetailEvent {
  final String size;
  const SelectBySize(this.size);
  @override
  List<Object?> get props => [size];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATES
// ═══════════════════════════════════════════════════════════════════════════════

abstract class ProductDetailState extends Equatable {
  const ProductDetailState();
  @override
  List<Object?> get props => [];
}

class ProductDetailInitial extends ProductDetailState {
  const ProductDetailInitial();
}

class ProductDetailLoading extends ProductDetailState {
  const ProductDetailLoading();
}

class ProductDetailError extends ProductDetailState {
  final String message;
  const ProductDetailError(this.message);
  @override
  List<Object?> get props => [message];
}

class ProductDetailLoaded extends ProductDetailState {
  final ProductDetailModel product;
  final int? selectedVariantId;
  final List<ProductModel> similarProducts;

  const ProductDetailLoaded({
    required this.product,
    this.selectedVariantId,
    this.similarProducts = const [],
  });

  /// Hozir tanlangan variant (yoki birinchi variant — fallback).
  ProductVariant? get selectedVariant {
    if (product.variants.isEmpty) return null;
    if (selectedVariantId != null) {
      try {
        return product.variants.firstWhere((v) => v.id == selectedVariantId);
      } catch (_) {}
    }
    return product.variants.first;
  }

  /// Mavjud ranglar — har biri uchun bitta vakil variant (uniqueBy color).
  List<ProductVariant> get colorOptions {
    final seen = <String>{};
    final result = <ProductVariant>[];
    for (final v in product.variants) {
      final color = v.color;
      if (color == null || color.isEmpty) continue;
      if (seen.add(color)) result.add(v);
    }
    return result;
  }

  /// Mavjud sifatlar — joriy rang doirasida.
  List<ProductVariant> get qualityOptions {
    final currentColor = selectedVariant?.color;
    final filtered = currentColor != null
        ? product.variants.where((v) => v.color == currentColor)
        : product.variants;
    final seen = <String>{};
    final result = <ProductVariant>[];
    for (final v in filtered) {
      final q = v.quality;
      if (q == null || q.isEmpty) continue;
      if (seen.add(q)) result.add(v);
    }
    return result;
  }

  /// Mavjud o'lchamlar — joriy rang+sifat doirasida.
  List<ProductVariant> get sizeOptions {
    final color = selectedVariant?.color;
    final quality = selectedVariant?.quality;
    var filtered = product.variants;
    if (color != null) {
      filtered = filtered.where((v) => v.color == color).toList();
    }
    if (quality != null && quality.isNotEmpty) {
      filtered = filtered.where((v) => v.quality == quality).toList();
    }
    final seen = <String>{};
    final result = <ProductVariant>[];
    for (final v in filtered) {
      final s = v.size ?? v.model;
      if (s == null || s.isEmpty) continue;
      if (seen.add(s)) result.add(v);
    }
    return result;
  }

  /// Hozirgi narx — variant narxi yoki mahsulot narxi.
  double get currentPrice {
    final v = selectedVariant;
    if (v != null && v.price != null) return v.price!;
    return product.price;
  }

  /// Hozirgi chegirma narxi (yo'q bo'lsa null).
  double? get currentDiscountPrice {
    final v = selectedVariant;
    if (v != null) {
      if (v.discountPrice != null) return v.discountPrice;
      // Variant o'z narxi bor lekin chegirmasiz → null
      if (v.price != null) return null;
    }
    return product.isDiscount ? product.discountPrice : null;
  }

  /// Hozirgi stock — variant stock'i yoki mahsulot stock'i.
  int get currentStock {
    final v = selectedVariant;
    if (v != null) return v.stock;
    return product.stock;
  }

  /// Hozirgi rasm — variant gallery yoki variant thumbnail yoki product main.
  String? get currentImage {
    final v = selectedVariant;
    if (v != null) {
      final vImg = v.displayImage;
      if (vImg != null && vImg.isNotEmpty) return vImg;
    }
    final mainImg = product.images.where((i) => i.isMain).cast<ProductImage?>().firstOrNull
        ?? product.images.cast<ProductImage?>().firstOrNull;
    return mainImg?.url;
  }

  /// To'liq nom — "Smartfon Samsung Galaxy A56 • Vetnam • 128/8 • Olive"
  String get displayTitle {
    final attrs = selectedVariant?.attributesLabel ?? '';
    if (attrs.isEmpty) return product.name;
    return '${product.name} • $attrs';
  }

  @override
  List<Object?> get props => [product.id, selectedVariantId, similarProducts.length];

  ProductDetailLoaded copyWith({
    ProductDetailModel? product,
    int? selectedVariantId,
    List<ProductModel>? similarProducts,
  }) {
    return ProductDetailLoaded(
      product: product ?? this.product,
      selectedVariantId: selectedVariantId ?? this.selectedVariantId,
      similarProducts: similarProducts ?? this.similarProducts,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOC
// ═══════════════════════════════════════════════════════════════════════════════

class ProductDetailBloc extends Bloc<ProductDetailEvent, ProductDetailState> {
  final ProductDetailRepository repository;

  ProductDetailBloc({required this.repository}) : super(const ProductDetailInitial()) {
    on<LoadProductDetail>(_onLoad);
    on<SelectVariant>(_onSelectVariant);
    on<SelectByColor>(_onSelectByColor);
    on<SelectByQuality>(_onSelectByQuality);
    on<SelectBySize>(_onSelectBySize);
  }

  Future<void> _onLoad(LoadProductDetail event, Emitter<ProductDetailState> emit) async {
    emit(const ProductDetailLoading());
    try {
      // Mahsulot va o'xshashlarni parallel yuklaymiz
      final results = await Future.wait([
        repository.getProductDetail(event.productId),
        repository.getSimilarProducts(event.productId),
      ]);
      final product = results[0] as ProductDetailModel;
      final similar = results[1] as List<ProductModel>;

      // URL/extra'dan kelgan variant ID'ni tekshiramiz
      int? initialVariantId;
      if (event.preselectedVariantId != null && product.variants.isNotEmpty) {
        final found = product.variants
            .where((v) => v.id == event.preselectedVariantId)
            .toList();
        if (found.isNotEmpty) {
          initialVariantId = found.first.id;
        }
      }
      // Fallback — birinchi variant
      if (initialVariantId == null && product.variants.isNotEmpty) {
        initialVariantId = product.variants.first.id;
      }

      emit(ProductDetailLoaded(
        product: product,
        selectedVariantId: initialVariantId,
        similarProducts: similar,
      ));
    } catch (e) {
      emit(ProductDetailError(e.toString().replaceFirst('Exception: ', '')));
    }
  }

  void _onSelectVariant(SelectVariant event, Emitter<ProductDetailState> emit) {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    emit(s.copyWith(selectedVariantId: event.variantId));
  }

  /// Rang bosilganda eng mos variantni topadi.
  /// Birinchi navbatda joriy sifat+o'lcham'ni saqlashga harakat qiladi.
  void _onSelectByColor(SelectByColor event, Emitter<ProductDetailState> emit) {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    final next = _findBestVariant(
      s.product.variants,
      color: event.color,
      quality: s.selectedVariant?.quality,
      size: s.selectedVariant?.size ?? s.selectedVariant?.model,
    );
    if (next != null) emit(s.copyWith(selectedVariantId: next.id));
  }

  void _onSelectByQuality(SelectByQuality event, Emitter<ProductDetailState> emit) {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    final next = _findBestVariant(
      s.product.variants,
      color: s.selectedVariant?.color,
      quality: event.quality,
      size: s.selectedVariant?.size ?? s.selectedVariant?.model,
    );
    if (next != null) emit(s.copyWith(selectedVariantId: next.id));
  }

  void _onSelectBySize(SelectBySize event, Emitter<ProductDetailState> emit) {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    final next = _findBestVariant(
      s.product.variants,
      color: s.selectedVariant?.color,
      quality: s.selectedVariant?.quality,
      size: event.size,
    );
    if (next != null) emit(s.copyWith(selectedVariantId: next.id));
  }

  /// Eng mos variantni topadi — barcha 3 atributga mos kelsa shu, aks holda
  /// asta-sekin constraintlarni tushiradi (size → quality → color).
  /// Bu — Amazon/Wildberries'ning "best match" algoritmi.
  ProductVariant? _findBestVariant(
    List<ProductVariant> variants, {
    String? color,
    String? quality,
    String? size,
  }) {
    bool matchColor(ProductVariant v) => color == null || v.color == color;
    bool matchQuality(ProductVariant v) => quality == null || quality.isEmpty || v.quality == quality;
    bool matchSize(ProductVariant v) => size == null || size.isEmpty || (v.size ?? v.model) == size;

    // 1. Barchasi mos kelsa
    final allMatch = variants
        .where((v) => matchColor(v) && matchQuality(v) && matchSize(v))
        .toList();
    if (allMatch.isNotEmpty) return allMatch.first;

    // 2. Size'ni tashlaymiz (color+quality)
    final colorQuality = variants
        .where((v) => matchColor(v) && matchQuality(v))
        .toList();
    if (colorQuality.isNotEmpty) return colorQuality.first;

    // 3. Quality'ni tashlaymiz (color)
    final colorOnly = variants.where(matchColor).toList();
    if (colorOnly.isNotEmpty) return colorOnly.first;

    // 4. Hech narsa mos kelmasa — birinchi
    return variants.isNotEmpty ? variants.first : null;
  }
}
