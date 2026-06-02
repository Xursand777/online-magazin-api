import 'dart:async';

import 'package:flutter/foundation.dart';

/// Server cold-start davomiyligi qaysi bosqichda ekanligi.
///
/// Bosqichlar request boshlangan paytdan boshlab oshib boradi:
///   • idle    — javob keldi yoki kutilayotgan request yo'q
///   • warming — 5 soniyadan ko'p kutilmoqda
///   • slow    — 15 soniyadan ko'p
///   • veryHard — 30 soniyadan ko'p (foydalanuvchi qayta urinish istashi mumkin)
enum ColdStartStatus { idle, warming, slow, veryHard }

/// Bir nechta paralel request davomiyligini kuzatib, eng uzoq kutgan
/// request bo'yicha umumiy holatni qaytaradi.
///
/// ── ARXITEKTURA ────────────────────────────────────────────────────────────
/// ValueNotifier — Flutter native, oddiy va arzon.
/// Bloc emas, chunki bu holat butun ilova bo'yicha umumiy (singleton),
/// va u UI dan kelmaydi — tarmoq qatlamidan keladi.
///
/// ── ISHLAB CHIQISH ────────────────────────────────────────────────────────
/// Har request boshlanganda trackStart() chaqiriladi → unique ID qaytaradi.
/// Request tugaganda trackComplete(id) chaqiriladi.
/// Ichkarida Timer.periodic har 1 soniyada eng uzoq kutilayotgan
/// requestni topib status'ni yangilab turadi.
///
/// Hech bir request kutmasa, timer to'xtaydi (resurs tejaymiz).
class ColdStartTracker extends ValueNotifier<ColdStartStatus> {
  ColdStartTracker() : super(ColdStartStatus.idle);

  // request_id → boshlangan vaqt
  final Map<int, DateTime> _pending = {};
  int _nextId = 0;
  Timer? _ticker;

  // Threshold'lar — UX bilan moslangan
  static const _warmingThresholdSec = 5;
  static const _slowThresholdSec = 15;
  static const _veryHardThresholdSec = 30;

  /// Request boshlanganini bildiradi. Qaytarilgan ID ni eslab qoling —
  /// trackComplete()'da ishlatasiz.
  int trackStart() {
    final id = _nextId++;
    _pending[id] = DateTime.now();
    _ensureTicker();
    return id;
  }

  /// Request tugaganini (muvaffaqiyat yoki xato) bildiradi.
  void trackComplete(int id) {
    _pending.remove(id);
    if (_pending.isEmpty) {
      _ticker?.cancel();
      _ticker = null;
      value = ColdStartStatus.idle;
    }
  }

  /// Ticker'ni faqat kerak bo'lganda yoqamiz (resurs tejash).
  void _ensureTicker() {
    _ticker ??= Timer.periodic(
      const Duration(seconds: 1),
      (_) => _recompute(),
    );
  }

  /// Eng uzoq kutilayotgan request davomiyligi bo'yicha status'ni yangilash.
  void _recompute() {
    if (_pending.isEmpty) {
      value = ColdStartStatus.idle;
      return;
    }

    final now = DateTime.now();
    int longestSec = 0;
    for (final start in _pending.values) {
      final sec = now.difference(start).inSeconds;
      if (sec > longestSec) longestSec = sec;
    }

    final newStatus = _statusFor(longestSec);
    if (newStatus != value) {
      value = newStatus;
    }
  }

  ColdStartStatus _statusFor(int seconds) {
    if (seconds >= _veryHardThresholdSec) return ColdStartStatus.veryHard;
    if (seconds >= _slowThresholdSec) return ColdStartStatus.slow;
    if (seconds >= _warmingThresholdSec) return ColdStartStatus.warming;
    return ColdStartStatus.idle;
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }
}

/// Global singleton — barcha API client'lar va UI shu bitta instance bilan ishlaydi.
///
/// DI qilmadik, chunki:
///   • Bu — toza tarmoq holati, biznes mantig'iga aloqasi yo'q
///   • Test'da mock kerak bo'lsa, instance'ni qayta yaratish mumkin
///   • Soddalik > o'rinli arxitektura
final coldStartTracker = ColdStartTracker();
