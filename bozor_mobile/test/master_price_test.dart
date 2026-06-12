// Master price unit test — ProductModel.fromJson + helpers.
//
// Backend "5% bazaviy, level 4 → 5% effective" formati uchun:
//   price = 10_999_000, master_price = 10_449_050
//   masterDiscountPercent ≈ 5.0%
//   masterSavings = 549_950
//   hasMasterPrice = true
//
// Super admin foizni o'zgartirsa, mobile ilovada yangi GET /api/products/
// keladi va ProductModel yangi master_price ni oladi. Mobile UI darhol
// yangi narxni ko'rsatadi (BlocBuilder rebuild).
import 'package:flutter_test/flutter_test.dart';
import 'package:bozor_mobile/core/models/product_model.dart';

void main() {
  group('ProductModel master price', () {
    test('Oddiy mijoz: master_price=null → hasMasterPrice=false', () {
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '10999000',
        'master_price': null,
        'is_discount': false,
      });
      expect(p.masterPrice, isNull);
      expect(p.hasMasterPrice, isFalse);
      expect(p.masterSavings, 0);
      expect(p.masterDiscountPercent, 0);
    });

    test('Usta mijoz 5% chegirma', () {
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '10999000',
        'master_price': '10449050',
      });
      expect(p.masterPrice, 10449050.0);
      expect(p.hasMasterPrice, isTrue);
      expect(p.masterSavings, 549950.0);
      expect(p.masterDiscountPercent, 5.0);
    });

    test('Usta mijoz 10% chegirma (admin foizni ko\'tardi)', () {
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '10999000',
        'master_price': '9899100',
      });
      expect(p.masterPrice, 9899100.0);
      expect(p.hasMasterPrice, isTrue);
      expect(p.masterSavings, 1099900.0);
      expect(p.masterDiscountPercent, 10.0);
    });

    test('Usta mijoz 3% chegirma (admin foizni pasaytirdi)', () {
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '10999000',
        'master_price': '10669030',
      });
      expect(p.masterPrice, 10669030.0);
      expect(p.hasMasterPrice, isTrue);
      expect(p.masterSavings, 329970.0);
      expect(p.masterDiscountPercent, 3.0);
    });

    test('Proportsional level (3.75% — level 3)', () {
      // Backend bazaviy 5% × 3/4 = 3.75%
      // 10_000_000 × (1 - 0.0375) = 9_625_000
      // Floating-point yaxlitlash sabab 3.7 yoki 3.8 chiqishi mumkin
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '10000000',
        'master_price': '9625000',
      });
      expect(p.masterDiscountPercent, closeTo(3.75, 0.1));
    });

    test('master_price > price → hasMasterPrice=false (sanity)', () {
      // Anomal holat — master narx asl narxdan katta. Ko'rsatmaymiz.
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '1000',
        'master_price': '2000',
      });
      expect(p.hasMasterPrice, isFalse);
    });

    test('master_price = 0 → hasMasterPrice=false', () {
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '1000',
        'master_price': '0',
      });
      expect(p.hasMasterPrice, isFalse);
    });

    test('toJson roundtrip — master_price saqlanadi', () {
      final p = ProductModel.fromJson({
        'id': 1,
        'name': 'Test',
        'price': '1000',
        'master_price': '950',
      });
      final j = p.toJson();
      expect(j['master_price'], 950.0);
      final p2 = ProductModel.fromJson(j);
      expect(p2.masterPrice, 950.0);
    });
  });
}
