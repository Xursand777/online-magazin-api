class BannerModel {
  final int id;
  final String title;
  final String? subtitle;
  final int? productId;
  final String? productName;
  final double? originalPrice;
  final double? discountPrice;

  /// Mahsulot rasmi (API: product_image_url)
  final String? productImageUrl;

  /// Fon rasmi (API: background_image_url) — ixtiyoriy
  final String? backgroundImageUrl;

  /// Fon rangi hex (API: background_color), masalan "#2761dd"
  final String? backgroundColor;

  /// Aksent rangi hex (API: accent_color)
  final String? accentColor;

  /// Tugma matni (API: button_label)
  final String? buttonLabel;

  /// Target URL — mahsulot sahifasiga link (API: target_url)
  final String? targetUrl;

  /// Ko'rsatish tartibi
  final int order;

  const BannerModel({
    required this.id,
    required this.title,
    this.subtitle,
    this.productId,
    this.productName,
    this.originalPrice,
    this.discountPrice,
    this.productImageUrl,
    this.backgroundImageUrl,
    this.backgroundColor,
    this.accentColor,
    this.buttonLabel,
    this.targetUrl,
    this.order = 0,
  });

  factory BannerModel.fromJson(Map<String, dynamic> json) {
    double? _d(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v);
      return null;
    }

    return BannerModel(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      subtitle: json['subtitle'] as String?,
      productId: (json['product'] as num?)?.toInt(),
      productName: json['product_name'] as String?,
      originalPrice: _d(json['original_price']),
      discountPrice: _d(json['discount_price']),
      productImageUrl: json['product_image_url'] as String?,
      backgroundImageUrl: json['background_image_url'] as String?,
      backgroundColor: json['background_color'] as String?,
      accentColor: json['accent_color'] as String?,
      buttonLabel: json['button_label'] as String?,
      targetUrl: json['target_url'] as String?,
      order: (json['order'] as num?)?.toInt() ?? 0,
    );
  }

  /// Phase 1.5 — Offline cache uchun seriyalash.
  /// Field nomlar fromJson bilan mos kelishi shart (round-trip).
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'subtitle': subtitle,
        'product': productId,
        'product_name': productName,
        'original_price': originalPrice,
        'discount_price': discountPrice,
        'product_image_url': productImageUrl,
        'background_image_url': backgroundImageUrl,
        'background_color': backgroundColor,
        'accent_color': accentColor,
        'button_label': buttonLabel,
        'target_url': targetUrl,
        'order': order,
      };

  /// Fon rangi Color ob'ektga aylantiradi (default: brand yashil)
  /// hex formatda: "#RRGGBB" yoki "#AARRGGBB"
  static int _hexToColor(String hex) {
    final clean = hex.replaceAll('#', '');
    if (clean.length == 6) return int.parse('FF$clean', radix: 16);
    if (clean.length == 8) return int.parse(clean, radix: 16);
    return 0xFF063F2B; // brand dark green fallback
  }

  int get backgroundColorInt =>
      backgroundColor != null ? _hexToColor(backgroundColor!) : 0xFF063F2B;

  int get accentColorInt =>
      accentColor != null ? _hexToColor(accentColor!) : 0xFF0A7C55;

  /// Chegirma foizi (0 agar yo'q)
  double get discountPercent {
    if (originalPrice == null || originalPrice == 0) return 0;
    if (discountPrice == null) return 0;
    return ((originalPrice! - discountPrice!) / originalPrice! * 100).roundToDouble();
  }
}
