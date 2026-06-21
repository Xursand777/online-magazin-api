import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';

/// Mahsulot create/update so'rovining serializatsiyalanadigan ko'rinishi.
///
/// (#12 offline navbat) `FormData` to'g'ridan-to'g'ri saqlanmaydi — uning
/// o'rniga xom maydonlar + fayl yo'llari saqlanadi, yuborish vaqtida esa
/// `toFormData()` orqali FormData QAYTA quriladi. Shu sabab internet uzilsa
/// ham so'rov yo'qolmaydi: SharedPreferences'da turadi va tarmoq tiklanganda
/// avtomatik yuboriladi.
class ProductSubmission {
  /// Navbatdagi yagona identifikator (yuborilganda shu bo'yicha o'chiriladi).
  final String localId;
  final bool isUpdate;
  final int? productId; // update uchun
  final String name; // foydalanuvchiga ko'rsatish uchun
  final Map<String, String> fields; // narx/nom/stok va h.k. (toza qiymatlar)
  final String? imagePath; // asosiy mahsulot rasmi
  final String variantsDataJson; // bo'sh bo'lsa variant yo'q
  final Map<int, String> variantSwatchPaths; // index -> swatch fayl yo'li
  final Map<int, List<String>>
  variantGalleryPaths; // index -> galereya yo'llari
  final int createdAtMs;

  ProductSubmission({
    required this.localId,
    required this.isUpdate,
    this.productId,
    required this.name,
    required this.fields,
    this.imagePath,
    required this.variantsDataJson,
    required this.variantSwatchPaths,
    required this.variantGalleryPaths,
    required this.createdAtMs,
  });

  Map<String, dynamic> toJson() => {
    'local_id': localId,
    'is_update': isUpdate,
    'product_id': productId,
    'name': name,
    'fields': fields,
    'image_path': imagePath,
    'variants_data': variantsDataJson,
    'swatch': variantSwatchPaths.map((k, v) => MapEntry(k.toString(), v)),
    'gallery': variantGalleryPaths.map((k, v) => MapEntry(k.toString(), v)),
    'created_at': createdAtMs,
  };

  factory ProductSubmission.fromJson(Map<String, dynamic> j) {
    return ProductSubmission(
      localId: j['local_id'] as String,
      isUpdate: j['is_update'] as bool? ?? false,
      productId: j['product_id'] as int?,
      name: j['name'] as String? ?? '',
      fields: Map<String, String>.from(j['fields'] as Map),
      imagePath: j['image_path'] as String?,
      variantsDataJson: j['variants_data'] as String? ?? '',
      variantSwatchPaths:
          (j['swatch'] as Map?)?.map(
            (k, v) => MapEntry(int.parse(k as String), v as String),
          ) ??
          <int, String>{},
      variantGalleryPaths:
          (j['gallery'] as Map?)?.map(
            (k, v) =>
                MapEntry(int.parse(k as String), List<String>.from(v as List)),
          ) ??
          <int, List<String>>{},
      createdAtMs: j['created_at'] as int? ?? 0,
    );
  }

  /// Dio `FormData` ni qayta quradi. Mavjud bo'lmagan (o'chib ketgan) fayllar
  /// jim o'tkaziladi; galereya kalitlari (`variant_images_i_j`) esa UZLUKSIZ
  /// qayta indekslanadi — backend `j` ni 0 dan boshlab to'xtaguncha o'qiydi,
  /// shu bois bo'shliq qolmasligi shart.
  FormData toFormData() {
    final fd = FormData.fromMap(Map<String, String>.from(fields));

    if (imagePath != null && File(imagePath!).existsSync()) {
      fd.files.add(
        MapEntry(
          'image',
          MultipartFile.fromFileSync(imagePath!, filename: 'product.jpg'),
        ),
      );
    }

    variantSwatchPaths.forEach((i, path) {
      if (File(path).existsSync()) {
        fd.files.add(
          MapEntry(
            'variant_image_$i',
            MultipartFile.fromFileSync(path, filename: 'variant_$i.jpg'),
          ),
        );
      }
    });

    variantGalleryPaths.forEach((i, paths) {
      var j = 0; // faqat mavjud fayllar uchun uzluksiz indeks
      for (final path in paths) {
        if (File(path).existsSync()) {
          fd.files.add(
            MapEntry(
              'variant_images_${i}_$j',
              MultipartFile.fromFileSync(path, filename: 'variant_${i}_$j.jpg'),
            ),
          );
          j++;
        }
      }
    });

    if (variantsDataJson.isNotEmpty) {
      fd.fields.add(MapEntry('variants_data', variantsDataJson));
    }
    return fd;
  }

  String encode() => jsonEncode(toJson());

  static ProductSubmission decode(String s) =>
      ProductSubmission.fromJson(jsonDecode(s) as Map<String, dynamic>);
}
