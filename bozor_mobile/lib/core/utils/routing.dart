/// routing.dart — Driving directions (kuryer navigatsiyasi).
///
/// Saytdagi `frontend/src/utils/routing.ts` ekvivalenti.
///
/// OSRM (Open Source Routing Machine) PUBLIC DEMO:
///   • Tekin, API key kerak emas
///   • OpenStreetMap data — Xorazm va Urganch yo'llari mavjud
///   • Endpoint: router.project-osrm.org
///   • Limit: kuniga ~1000 so'rov (bizning hajm uchun yetarli)
///
/// RE-ROUTE STRATEGIYA:
///   Kuryer harakat qilarkan, har bir GPS yangilanishida route'ni qayta
///   chizmaymiz (OSRM'ni spam qilmaymiz). Faqat:
///     • Birinchi marta
///     • 200m+ harakatdan keyin
///     • 30 soniyalik intervaldan keyin
///
/// CACHE:
///   Bir xil koordinata juftligi uchun 30 soniya ichida bir marta so'rov.
library;

import 'dart:convert';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:latlong2/latlong.dart';

const String _osrmEndpoint = 'https://router.project-osrm.org/route/v1/driving';
const Duration _routeCacheTtl = Duration(seconds: 30);
const Duration _routeTimeout = Duration(seconds: 10);
const double _reRouteMinMeters = 200; // 200m harakat = re-route
const Duration _reRouteMinInterval = Duration(seconds: 30);

/// OSRM API'dan kelgan yo'l natijasi.
class RouteResult {
  /// Yo'l geometriyasi — flutter_map uchun LatLng nuqtalar ro'yxati.
  final List<LatLng> geometry;

  /// Yo'l uzunligi metrlarda.
  final double distanceMeters;

  /// Taxminiy yetib borish vaqti soniyalarda.
  final double durationSeconds;

  const RouteResult({
    required this.geometry,
    required this.distanceMeters,
    required this.durationSeconds,
  });
}

/// Cache entry.
class _CacheEntry {
  final RouteResult result;
  final DateTime ts;

  const _CacheEntry(this.result, this.ts);
}

final Map<String, _CacheEntry> _routeCache = {};
final Dio _dio = Dio(BaseOptions(connectTimeout: _routeTimeout, receiveTimeout: _routeTimeout));

String _cacheKey(LatLng from, LatLng to) {
  // 4 kasr xonagacha — taxminan 10m aniqlik
  return '${from.latitude.toStringAsFixed(4)},${from.longitude.toStringAsFixed(4)}|'
      '${to.latitude.toStringAsFixed(4)},${to.longitude.toStringAsFixed(4)}';
}

/// OSRM'dan driving routini olish.
///
/// Returns null on error or no route.
Future<RouteResult?> fetchRoute(LatLng from, LatLng to) async {
  // Cache check
  final key = _cacheKey(from, to);
  final cached = _routeCache[key];
  if (cached != null && DateTime.now().difference(cached.ts) < _routeCacheTtl) {
    return cached.result;
  }

  try {
    // OSRM koordinata tartibi: lng,lat — LatLng'dan teskari
    final url = '$_osrmEndpoint/'
        '${from.longitude},${from.latitude};${to.longitude},${to.latitude}'
        '?overview=full&geometries=geojson&steps=false';

    final response = await _dio.get<String>(
      url,
      options: Options(
        responseType: ResponseType.plain,
        headers: {'User-Agent': 'BozorMobile/1.0'},
      ),
    );

    if (response.statusCode != 200) return null;
    final data = jsonDecode(response.data!) as Map<String, dynamic>;
    if (data['code'] != 'Ok') return null;
    final routes = data['routes'] as List?;
    if (routes == null || routes.isEmpty) return null;

    final route = routes[0] as Map<String, dynamic>;
    final geometry = route['geometry'] as Map<String, dynamic>;
    final coords = geometry['coordinates'] as List;

    // GeoJSON: [lng, lat] — flutter_map uchun LatLng(lat, lng)
    final points = coords
        .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
        .toList();

    final result = RouteResult(
      geometry: points,
      distanceMeters: (route['distance'] as num).toDouble(),
      durationSeconds: (route['duration'] as num).toDouble(),
    );

    _routeCache[key] = _CacheEntry(result, DateTime.now());
    return result;
  } catch (err) {
    // ignore: avoid_print
    print('[routing] fetchRoute xato: $err');
    return null;
  }
}

/// Haversine — ikki nuqta orasidagi to'g'ri masofa metrda.
double haversineDistance(LatLng a, LatLng b) {
  const earthRadiusMeters = 6371000.0;
  double toRad(double deg) => deg * math.pi / 180.0;

  final lat1 = toRad(a.latitude);
  final lat2 = toRad(b.latitude);
  final dLat = toRad(b.latitude - a.latitude);
  final dLng = toRad(b.longitude - a.longitude);

  final sinDLat = math.sin(dLat / 2);
  final sinDLng = math.sin(dLng / 2);
  final c = sinDLat * sinDLat +
      math.cos(lat1) * math.cos(lat2) * sinDLng * sinDLng;
  return earthRadiusMeters * 2 * math.asin(math.sqrt(c));
}

/// Last route fetch ma'lumoti — re-route shartlarini tekshirish uchun.
class RouteFetchSnapshot {
  final LatLng pos;
  final DateTime ts;

  const RouteFetchSnapshot(this.pos, this.ts);
}

/// Re-route qilish shartmi tekshiradi.
///
/// True qaytaradi quyidagi hollardan birida:
///   • Birinchi marta (snapshot=null)
///   • Joriy pozitsiya oldingidan 200m+ uzoq
///   • Oldingi so'rovdan 30s o'tdi
bool shouldRefreshRoute(LatLng current, RouteFetchSnapshot? last) {
  if (last == null) return true;
  if (haversineDistance(last.pos, current) >= _reRouteMinMeters) return true;
  if (DateTime.now().difference(last.ts) >= _reRouteMinInterval) return true;
  return false;
}

/// Masofa formatlash: < 1km bo'lsa metr, >= 1km bo'lsa km.
String formatDistance(double meters) {
  if (meters < 1000) return '${meters.round()} m';
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

/// Vaqt formatlash: soniyani inson o'qiy oladigan formatga.
String formatDuration(double seconds) {
  if (seconds < 60) return '${seconds.round()} s';
  final minutes = (seconds / 60).round();
  if (minutes < 60) return '$minutes daqiqa';
  final hours = (minutes / 60).floor();
  final rem = minutes % 60;
  return rem > 0 ? '$hours soat $rem daqiqa' : '$hours soat';
}

/// To'g'ri chiziq fallback — OSRM ishlamasa.
RouteResult straightLineFallback(LatLng from, LatLng to) {
  return RouteResult(
    geometry: [from, to],
    distanceMeters: haversineDistance(from, to),
    durationSeconds: 0,
  );
}
