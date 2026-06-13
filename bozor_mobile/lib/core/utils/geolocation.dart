/// geolocation.dart — Saytdagi utils/geolocation.ts'ning Flutter ekvivalenti.
///
/// 5 QATLAMLI TASHXIS (Yandex/Uber/Google Maps pattern):
///
///   LAYER 1: Service mavjud (telefon GPS yoqilgan)
///   LAYER 2: Permission state (denied yoki granted?)
///   LAYER 3: Permission dialog (kerak bo'lsa)
///   LAYER 4: getCurrentPosition()
///   LAYER 5: Error analysis
///
/// SAYTDAGI 'denyReason' ENUM bilan BIR XIL:
///   previously_denied → permanently denied (saytdagi 'denied')
///   just_denied       → endi rad etildi
///   insecure_context  → mobile'da YO'Q (HTTPS shart emas)
///   system_block      → service o'chirilgan
///   unsupported       → qurilma GPS sensori yo'q
library;

import 'package:geolocator/geolocator.dart';

/// Foydalanuvchiga ko'rsatish uchun aniq sabab.
enum GeoDenyReason {
  /// Permission permanently denied. Brauzer/iOS/Android eslab qolgan.
  /// Foydalanuvchi tizim sozlamalariga borib ruxsat berishi kerak.
  previouslyDenied,

  /// Hozirgina dialog'da Deny bosildi. Qayta urinish mumkin.
  justDenied,

  /// Service o'chirilgan (Location Services).
  /// Foydalanuvchi tizim sozlamalarini ochishi kerak.
  systemBlock,

  /// Qurilma GPS sensori yo'q yoki maxsus rejimda.
  unsupported,
}

/// Geolocation natijasi — koordinatalar yoki xato sababi.
sealed class GeoResult {
  const GeoResult();
}

class GeoSuccess extends GeoResult {
  final double latitude;
  final double longitude;
  final double accuracy;
  const GeoSuccess({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
  });
}

class GeoFailure extends GeoResult {
  final GeoDenyReason reason;
  final String? message;
  const GeoFailure(this.reason, [this.message]);
}

/// Joriy joylashuvni olish — to'liq tashxis bilan.
///
/// XATO YO'Q — har doim GeoResult qaytaradi (success yoki failure).
///
/// Misol:
///   final result = await getCurrentLocation();
///   switch (result) {
///     case GeoSuccess(:final latitude, :final longitude):
///       // koordinata bor
///     case GeoFailure(:final reason):
///       // dialog ko'rsatish
///   }
Future<GeoResult> getCurrentLocation({
  LocationAccuracy accuracy = LocationAccuracy.high,
  Duration timeout = const Duration(seconds: 15),
}) async {
  // ── LAYER 1: SERVICE ENABLED ─────────────────────────────────────────────
  // Telefon GPS service o'chirilganmi? (Settings → Location → OFF)
  final serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    return const GeoFailure(GeoDenyReason.systemBlock,
        'Telefon joylashuv xizmati o\'chirilgan');
  }

  // ── LAYER 2: PERMISSION HOLATINI O'QISH ─────────────────────────────────
  LocationPermission permission = await Geolocator.checkPermission();

  // ── LAYER 3: KERAK BO'LSA — DIALOG ───────────────────────────────────────
  if (permission == LocationPermission.denied) {
    // 'denied' Android'da: dialog ko'rsatish mumkin
    // iOS'da: ham dialog chiqaradi (notDetermined holati)
    permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      // Foydalanuvchi dialog'da rad etdi
      return const GeoFailure(GeoDenyReason.justDenied);
    }
  }

  if (permission == LocationPermission.deniedForever) {
    // Android: "Don't ask again" tanlangan. iOS: Settings'da Block.
    // Dialog endi ko'rsatilmaydi — foydalanuvchi Settings'ni o'zi ochishi shart.
    return const GeoFailure(GeoDenyReason.previouslyDenied);
  }

  // permission == whileInUse yoki always — davom etamiz

  // ── LAYER 4: KOORDINATANI OLISH ─────────────────────────────────────────
  try {
    final position = await Geolocator.getCurrentPosition(
      locationSettings: LocationSettings(
        accuracy: accuracy,
        timeLimit: timeout,
      ),
    );
    return GeoSuccess(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
    );
  } on LocationServiceDisabledException {
    return const GeoFailure(GeoDenyReason.systemBlock);
  } on PermissionDeniedException {
    return const GeoFailure(GeoDenyReason.justDenied);
  } on TimeoutException {
    return const GeoFailure(GeoDenyReason.unsupported,
        'GPS signal topilmadi (vaqt o\'tdi)');
  } catch (e) {
    return GeoFailure(GeoDenyReason.unsupported, e.toString());
  }
}

/// Tizim sozlamalarini ochish — foydalanuvchi permission'ni qo'lda berishi uchun.
///
/// Android: app permission settings'iga olib boradi
/// iOS: app-specific settings'iga olib boradi
Future<void> openAppSettings() async {
  await Geolocator.openAppSettings();
}

/// Location Services sozlamasini ochish (system-wide, app emas).
///
/// Android: Settings → Location toggle
/// iOS: Settings → Privacy → Location Services
Future<void> openLocationSettings() async {
  await Geolocator.openLocationSettings();
}

/// Permission state'ini tashxis qilish — UI'da indikator ko'rsatish uchun.
/// dialog chaqirmaydi.
Future<LocationPermission> checkPermissionState() {
  return Geolocator.checkPermission();
}

/// Service yoqilganmi?
Future<bool> checkServiceEnabled() {
  return Geolocator.isLocationServiceEnabled();
}

// Sealed result for switch exhaustiveness fix
class TimeoutException implements Exception {
  final String message;
  const TimeoutException([this.message = 'timeout']);
}
