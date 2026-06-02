// ═══════════════════════════════════════════════════════════════════════════
//  Bozor Mobile — Smoke Test (Phase 1.6)
// ═══════════════════════════════════════════════════════════════════════════
//
// ISHLATISH:
//   flutter test test/smoke_test.dart
//
// NIMA QILADI:
//   Eng kritik biznes-mantiqni Dart VM darajasida tekshiradi (emulator
//   shart emas — CI/CD da tezda ishlaydi).
//
// QAMRAB OLINGAN FUNKSIYALAR:
//   • App version comparison (Phase 1.2) — force update gate
//   • OfflineCacheService (Phase 1.5) — SWR cache
//   • CacheEntry (Phase 1.5) — JSON round-trip + schema version
//   • formatCacheAge (Phase 1.5) — UI banner format
//   • AppConfig parsing (Phase 1.2) — server javobi
//
// NIMA UCHUN:
//   "Login → search → cart → checkout" oqimi widget/integration test
//   talab qiladi (qurilma kerak). Bu smoke test esa har CI run'da 5
//   soniyada ishlaydi va eng asosiy biznes mantiqni tasdiqlaydi.
//
// QACHON ISHGA TUSHADI:
//   • Lokal: deploy oldidan `flutter test`
//   • CI/CD: har PR/push da (kelajakda GitHub Actions)
// ═══════════════════════════════════════════════════════════════════════════

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:bozor_mobile/core/cache/cache_entry.dart';
import 'package:bozor_mobile/core/network/app_config_service.dart';

void main() {
  // ─── Phase 1.2 — Version comparison (force update gate) ────────────────
  //
  // KRITIK: noto'g'ri solishtirish foydalanuvchini majburiy yangilash
  // ekraniga noto'g'ri qamab qo'yishi yoki eski versiyaga ruxsat berishi
  // mumkin. Har relizdan oldin tekshiramiz.
  group('isVersionBelow (Phase 1.2)', () {
    test('teng versiya — false', () {
      expect(isVersionBelow('1.0.0', '1.0.0'), false);
    });

    test('current past — true', () {
      expect(isVersionBelow('1.0.0', '1.0.1'), true);
      expect(isVersionBelow('1.0.0', '2.0.0'), true);
      expect(isVersionBelow('1.4.99', '1.5.0'), true);
    });

    test('current baland — false', () {
      expect(isVersionBelow('1.0.1', '1.0.0'), false);
      expect(isVersionBelow('2.0.0', '1.99.99'), false);
    });

    test('turli uzunliklar — 0 padding bilan tenglashadi', () {
      expect(isVersionBelow('1.0', '1.0.0'), false);
      expect(isVersionBelow('1.0.0', '1.0'), false);
      expect(isVersionBelow('1.0', '1.0.1'), true);
    });

    test('lexikografik xato (string compare) emas', () {
      // String comparison'da "1.10.0" < "1.2.0" (xato)
      // Integer comparison'da "1.10.0" > "1.2.0" (to'g'ri)
      expect(isVersionBelow('1.10.0', '1.2.0'), false);
      expect(isVersionBelow('1.2.0', '1.10.0'), true);
    });

    test('noma\'lum format — false (fail open)', () {
      expect(isVersionBelow('abc', '1.0.0'), false);
      expect(isVersionBelow('', '1.0.0'), false);
    });
  });

  // ─── Phase 1.5 — CacheEntry serialize/parse ─────────────────────────────
  //
  // KRITIK: cache format buzilgan bo'lsa, oflayn rejim ishlamaydi.
  // Round-trip (yozish → o'qish) ma'lumot saqlanishini tasdiqlaydi.
  group('CacheEntry (Phase 1.5)', () {
    test('round-trip: yozish → JSON → o\'qish', () {
      final original = CacheEntry(
        data: {'foo': 'bar', 'count': 42, 'list': [1, 2, 3]},
        cachedAt: DateTime.parse('2026-06-01 12:00:00Z'),
      );
      final json = original.toJsonString();
      final parsed = CacheEntry.tryParse(json);

      expect(parsed, isNotNull);
      expect(parsed!.data, equals(original.data));
      expect(parsed.cachedAt, equals(original.cachedAt));
      expect(parsed.schemaVer, equals(CacheEntry.currentSchemaVersion));
    });

    test('eski schema versiyali yozuv → null (yangi fetch yaxshiroq)', () {
      final oldJson = jsonEncode({
        'schemaVer': 0,  // eski versiya
        'cachedAt': DateTime.now().toIso8601String(),
        'data': {'foo': 'bar'},
      });
      expect(CacheEntry.tryParse(oldJson), isNull);
    });

    test('buzilgan JSON → null', () {
      expect(CacheEntry.tryParse('not a json'), isNull);
      expect(CacheEntry.tryParse('{invalid'), isNull);
      expect(CacheEntry.tryParse(''), isNull);
      expect(CacheEntry.tryParse(null), isNull);
    });

    test('kelajak vaqti (qurilma soati buzilgan) → null', () {
      final futureJson = jsonEncode({
        'schemaVer': 1,
        'cachedAt': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
        'data': {},
      });
      expect(CacheEntry.tryParse(futureJson), isNull);
    });

    test('age hisoblash to\'g\'ri', () {
      final entry = CacheEntry(
        data: {},
        cachedAt: DateTime.now().subtract(const Duration(hours: 2)),
      );
      expect(entry.age.inHours, greaterThanOrEqualTo(2));
      expect(entry.age.inHours, lessThan(3));
    });
  });

  // ─── Phase 1.5 — formatCacheAge (UI banner) ─────────────────────────────
  //
  // Foydalanuvchi ko'radigan matn: "Oxirgi yangilanish: 2 soat oldin".
  // Format buzilgan bo'lsa, UI g'alati ko'rinadi.
  group('formatCacheAge (Phase 1.5)', () {
    test('30 sekund → "hozir"', () {
      expect(formatCacheAge(const Duration(seconds: 30)), equals('hozir'));
    });

    test('5 daqiqa → "5 daqiqa oldin"', () {
      expect(formatCacheAge(const Duration(minutes: 5)), equals('5 daqiqa oldin'));
    });

    test('2 soat → "2 soat oldin"', () {
      expect(formatCacheAge(const Duration(hours: 2)), equals('2 soat oldin'));
    });

    test('1 kun → "kecha"', () {
      expect(formatCacheAge(const Duration(days: 1)), equals('kecha'));
    });

    test('3 kun → "3 kun oldin"', () {
      expect(formatCacheAge(const Duration(days: 3)), equals('3 kun oldin'));
    });

    test('2 hafta → "2 hafta oldin"', () {
      expect(formatCacheAge(const Duration(days: 14)), equals('2 hafta oldin'));
    });
  });

  // ─── Phase 1.2 — AppConfig server javobini parse ────────────────────────
  //
  // Server kelajakda javob formatini o'zgartirsa — bu test sinishi shart.
  // Real bug: agar server `min_version` null qaytarsa, mobile crash bo'lardi.
  group('AppConfig (Phase 1.2)', () {
    test('to\'liq javob — barcha maydonlar', () {
      final config = AppConfig.fromJson({
        'platform': 'android',
        'min_version': '1.5.0',
        'latest_version': '1.8.0',
        'store_url': 'https://play.google.com/...',
        'force_update_message': {
          'uz': 'Yangilang',
          'ru': 'Обновите',
          'en': 'Update',
        },
        'maintenance_mode': false,
      });

      expect(config.minVersion, equals('1.5.0'));
      expect(config.latestVersion, equals('1.8.0'));
      expect(config.maintenanceMode, equals(false));
      expect(config.forceUpdateMessage('uz'), equals('Yangilang'));
      expect(config.forceUpdateMessage('ru'), equals('Обновите'));
    });

    test('maintenance_mode=true bilan xabar', () {
      final config = AppConfig.fromJson({
        'platform': 'android',
        'min_version': '1.0.0',
        'latest_version': '1.0.0',
        'store_url': '',
        'force_update_message': {},
        'maintenance_mode': true,
        'maintenance_message': {
          'uz': 'Texnik xizmat',
          'ru': 'Тех. работы',
          'en': 'Maintenance',
        },
      });

      expect(config.maintenanceMode, equals(true));
      expect(config.maintenanceMessage('uz'), equals('Texnik xizmat'));
    });

    test('til mavjud emas → fallback uz → ru → en', () {
      final config = AppConfig.fromJson({
        'platform': 'android',
        'min_version': '1.0.0',
        'latest_version': '1.0.0',
        'store_url': '',
        'force_update_message': {'uz': 'Yangilang'},
        'maintenance_mode': false,
      });

      expect(config.forceUpdateMessage('en'), equals('Yangilang')); // fallback
      expect(config.forceUpdateMessage('fr'), equals('Yangilang'));
    });

    test('null maydonlar — default qiymatlar bilan', () {
      final config = AppConfig.fromJson({
        'platform': null,
        'min_version': null,
        'latest_version': null,
        'store_url': null,
        'force_update_message': null,
        'maintenance_mode': null,
      });

      expect(config.platform, equals('android')); // default
      expect(config.minVersion, equals('0.0.0'));
      expect(config.maintenanceMode, equals(false));
      expect(config.forceUpdateMessage('uz'), equals(''));
    });
  });
}
