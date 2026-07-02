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

  /// Hozirgi USTA narxi — tanlangan variantniki, bo'lmasa mahsulot darajasi.
  /// Backend OPTOM asosida har variant uchun alohida hisoblaydi (mijoz tomonida
  /// HECH narsa hisoblanmaydi). Imtiyoz yo'q bo'lsa null.
  double? get currentMasterPrice {
    final v = selectedVariant;
    if (v != null && v.masterPrice != null) return v.masterPrice;
    return product.masterPrice;
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

  /// Hozirgi rasm — **color-grouped fallback** (Wildberries/Amazon usuli).
  ///
  /// Algoritm — sayt va backend bilan bir xil:
  ///   1. Tanlangan variantning O'Z rasmi (gallery yoki thumbnail)
  ///   2. AYNI RANG bo'lgan boshqa variantdan rasm (color-grouped)
  ///      Sabab: foydalanuvchi sifat almashganda variant o'zgaradi, lekin
  ///      ko'p hollarda variant o'z rasmiga ega bo'lmaydi. Bunda BIR XIL
  ///      RANG bo'lgan boshqa variant rasmini ishlatib, foydalanuvchi RANGI
  ///      o'zgarmagandek ko'radi.
  ///   3. Mahsulotning asosiy rasmi (oxirgi fallback)
  String? get currentImage {
    final v = selectedVariant;
    if (v != null) {
      // 1. Variantning o'z rasmi
      final vImg = v.displayImage;
      if (vImg != null && vImg.isNotEmpty) return vImg;

      // 2. AYNI RANG bo'lgan boshqa variantdan rasm
      // Masalan: foydalanuvchi Kulrang-India varianitida turibdi, lekin
      // bu variantda rasm yo'q. Kulrang-Vetnam variantida rasm bor →
      // o'sha kulrang rasmni ko'rsatamiz (foydalanuvchi rangni saqlangan deb biladi).
      final color = v.color;
      if (color != null && color.isNotEmpty) {
        for (final other in product.variants) {
          if (other.id == v.id) continue;
          if (other.color != color) continue;
          final oImg = other.displayImage;
          if (oImg != null && oImg.isNotEmpty) return oImg;
        }
      }
    }

    // 3. Mahsulotning asosiy rasmi
    final mainImg = product.images
            .where((i) => i.isMain)
            .cast<ProductImage?>()
            .firstOrNull ??
        product.images.cast<ProductImage?>().firstOrNull;
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
      // Mahsulot va o'xshashlarni parallel yuklaymiz. O'xshashlar TANLANGAN
      // (preselected) variantga aloqador bo'lsin — masalan qidiruvdan "16 Pro Max"
      // variantiga kirilsa, o'sha modelga mos tovarlar.
      final results = await Future.wait([
        repository.getProductDetail(event.productId),
        repository.getSimilarProducts(
          event.productId,
          variantId: event.preselectedVariantId,
        ),
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

      // Amaldagi variant preselected'dan farq qilsa (fallback → birinchi variant),
      // o'xshashlarni o'sha variantga moslab fon rejimida qayta yuklaymiz.
      if (initialVariantId != null &&
          initialVariantId != event.preselectedVariantId) {
        await _refreshSimilar(event.productId, initialVariantId, emit);
      }
    } catch (e) {
      emit(ProductDetailError(e.toString().replaceFirst('Exception: ', '')));
    }
  }

  /// O'xshash mahsulotlarni tanlangan variantga moslab FON rejimida yangilaydi.
  /// Eski natijalar ko'rinib turadi (miltillash yo'q). Stale-guard: natija
  /// kelganda hali ham O'SHA variant tanlangan bo'lsagina qo'llanadi (tez
  /// almashtirishlarda eski natija chalkashtirmasin).
  Future<void> _refreshSimilar(
    int productId,
    int? variantId,
    Emitter<ProductDetailState> emit,
  ) async {
    final similar =
        await repository.getSimilarProducts(productId, variantId: variantId);
    final s = state;
    if (s is ProductDetailLoaded && s.selectedVariantId == variantId) {
      emit(s.copyWith(similarProducts: similar));
    }
  }

  Future<void> _onSelectVariant(
      SelectVariant event, Emitter<ProductDetailState> emit) async {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    emit(s.copyWith(selectedVariantId: event.variantId));
    await _refreshSimilar(s.product.id, event.variantId, emit);
  }

  /// Rang bosilganda — RANG priority, sifat va o'lcham preference.
  Future<void> _onSelectByColor(
      SelectByColor event, Emitter<ProductDetailState> emit) async {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    final next = _findByPriority(
      variants: s.product.variants,
      priority: _Dim.color,
      priorityValue: event.color,
      preferColor: event.color,
      preferQuality: s.selectedVariant?.quality,
      preferSize: s.selectedVariant?.size ?? s.selectedVariant?.model,
    );
    if (next != null) {
      emit(s.copyWith(selectedVariantId: next.id));
      await _refreshSimilar(s.product.id, next.id, emit);
    }
  }

  /// Sifat bosilganda — SIFAT priority, rang va o'lcham preference.
  Future<void> _onSelectByQuality(
      SelectByQuality event, Emitter<ProductDetailState> emit) async {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    final next = _findByPriority(
      variants: s.product.variants,
      priority: _Dim.quality,
      priorityValue: event.quality,
      preferColor: s.selectedVariant?.color,
      preferQuality: event.quality,
      preferSize: s.selectedVariant?.size ?? s.selectedVariant?.model,
    );
    if (next != null) {
      emit(s.copyWith(selectedVariantId: next.id));
      await _refreshSimilar(s.product.id, next.id, emit);
    }
  }

  /// O'lcham/xotira bosilganda — SIZE priority, rang va sifat preference.
  Future<void> _onSelectBySize(
      SelectBySize event, Emitter<ProductDetailState> emit) async {
    final s = state;
    if (s is! ProductDetailLoaded) return;
    final next = _findByPriority(
      variants: s.product.variants,
      priority: _Dim.size,
      priorityValue: event.size,
      preferColor: s.selectedVariant?.color,
      preferQuality: s.selectedVariant?.quality,
      preferSize: event.size,
    );
    if (next != null) {
      emit(s.copyWith(selectedVariantId: next.id));
      await _refreshSimilar(s.product.id, next.id, emit);
    }
  }

  /// **Priority-based variant matching** (Amazon/Wildberries professional usuli).
  ///
  /// Foydalanuvchi qaysi dimension'ni bosgan bo'lsa — u PRIORITY (majburiy mos
  /// kelishi kerak). Boshqalari — preference (saqlanishga harakat qilinadi,
  /// lekin mos variant topilmasa o'zgaradi).
  ///
  /// MISOL:
  ///   Variantlar: (Olive/Vetnam/128), (Olive/India/256), (Kulrang/USA/512)
  ///   Foydalanuvchi Olive/Vetnam/128 da turibdi.
  ///   "USA" sifatini bosadi.
  ///   PRIORITY: quality=USA — MAJBURIY.
  ///   Olive+USA mavjud emas → boshqa rangda izlaymiz.
  ///   Kulrang+USA → MOS. → Tanlanadi (rang ham avtomatik Kulrangga o'tdi).
  ///
  /// Bu — sayt va katta saytlarning professional yondashuvi.
  ProductVariant? _findByPriority({
    required List<ProductVariant> variants,
    required _Dim priority,
    required String priorityValue,
    String? preferColor,
    String? preferQuality,
    String? preferSize,
  }) {
    if (variants.isEmpty) return null;

    // 1. PRIORITY mos kelgan variantlarni filtr qilamiz (MAJBURIY)
    final candidates = variants.where((v) {
      switch (priority) {
        case _Dim.color:
          return (v.color ?? '') == priorityValue;
        case _Dim.quality:
          return (v.quality ?? '') == priorityValue;
        case _Dim.size:
          return (v.size ?? v.model ?? '') == priorityValue;
      }
    }).toList();

    if (candidates.isEmpty) {
      // Priority mos kelgan variant umuman yo'q — fallback (kamdan-kam holat)
      return variants.first;
    }

    // 2. Candidates orasidan eng yaxshi mos keladiganini "score" bo'yicha tanlaymiz
    //    Score: har dimension bo'yicha mos kelishga ball.
    //    Stock > 0 ham qo'shimcha ball — tugab qolgan variantni tanlamaymiz.
    int score(ProductVariant v) {
      var s = 0;
      if (preferColor != null && v.color == preferColor) s += 100;
      if (preferQuality != null &&
          preferQuality.isNotEmpty &&
          v.quality == preferQuality) s += 10;
      if (preferSize != null &&
          preferSize.isNotEmpty &&
          (v.size ?? v.model) == preferSize) s += 1;
      // Stock — agar mavjud bo'lsa katta bonus (foydalanuvchi sotib ola olishi uchun)
      if (v.stock > 0) s += 1000;
      return s;
    }

    candidates.sort((a, b) => score(b).compareTo(score(a)));
    return candidates.first;
  }
}

/// Variant dimension'lari — priority belgilash uchun.
enum _Dim { color, quality, size }
