class StockStats {
  final int totalProducts;
  final int totalStock;
  final double totalValue;
  final int criticalCount;
  final int lowCount;

  StockStats({
    required this.totalProducts,
    required this.totalStock,
    required this.totalValue,
    required this.criticalCount,
    required this.lowCount,
  });

  factory StockStats.fromJson(Map<String, dynamic> json) {
    return StockStats(
      totalProducts: _int(json['total_products']),
      totalStock: _int(json['total_stock']),
      totalValue: _double(json['total_value']),
      criticalCount: _int(json['critical_count']),
      lowCount: _int(json['low_count']),
    );
  }
}

class AdminStockItem {
  final String type; // 'product' or 'variant'
  final int id;
  final String name;
  final String? image;
  final String? variantInfo;
  final String sku;
  final double price;
  final int stock;

  AdminStockItem({
    required this.type,
    required this.id,
    required this.name,
    this.image,
    this.variantInfo,
    required this.sku,
    required this.price,
    required this.stock,
  });

  factory AdminStockItem.fromJson(Map<String, dynamic> json) {
    return AdminStockItem(
      type: json['type'] as String? ?? 'product',
      id: _int(json['id']),
      name: json['name'] as String? ?? 'Noma\'lum',
      image: json['image'] as String?,
      variantInfo: json['variant_info'] as String?,
      sku: json['sku'] as String? ?? '',
      price: _double(json['price']),
      stock: _int(json['stock']),
    );
  }
}

class AdminStockReport {
  final StockStats stats;
  final List<AdminStockItem> items;

  AdminStockReport({
    required this.stats,
    required this.items,
  });

  factory AdminStockReport.fromJson(Map<String, dynamic> json) {
    return AdminStockReport(
      stats: json['stats'] != null
          ? StockStats.fromJson(json['stats'] as Map<String, dynamic>)
          : StockStats(
              totalProducts: 0,
              totalStock: 0,
              totalValue: 0,
              criticalCount: 0,
              lowCount: 0,
            ),
      items: ((json['items'] as List?) ?? [])
          .map((e) => AdminStockItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

int _int(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

double _double(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}
