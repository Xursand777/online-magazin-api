/// CourierRouteMapPage — Kuryer Real-Time Navigatsiya Xaritasi (mobile).
///
/// Saytdagi `CourierRouteMap.tsx`'ning Flutter ekvivalenti.
///
/// URL/Route: /courier/route/:orderId
///
/// BU SAHIFA NIMA QILADI?
///
///   1. Mijoz buyurtma berishda xaritadan PIN qo'ydi → backend'da
///      Order.delivery_lat, delivery_lng saqlandi.
///
///   2. Kuryer/Admin buyurtma kartochkasidan "Xaritadan borish" tugmasini
///      bosadi → bu sahifa ochiladi.
///
///   3. Sahifa ochilganida:
///      a) Backend'dan GET /api/orders/:id/route-target/ orqali manzil va
///         koordinatani oladi.
///      b) Geolocator orqali kuryerning joriy GPS pozitsiyasini real-time
///         olib turadi (positionStream).
///      c) OSRM API'ga so'rov yuborib, kuryer va manzil orasidagi YO'L'ni
///         (driving route) oladi.
///      d) FlutterMap xaritada chizadi:
///          • 🚗 Kuryer markeri (Material Icon, harakatda)
///          • 📍 Manzil markeri (yashil pin_drop)
///          • ━━━ Yashil polyline yo'l (haqiqiy ko'cha bo'ylab)
///
///   4. Kuryer harakat qilarkan:
///      • Marker xaritada siljiydi
///      • Har 200m+ harakat YOKI 30s'dan keyin — yo'l qaytadan hisoblanadi
///      • Masofa va ETA yangilanadi
///
///   5. Manzilga 50m yaqinlashganda:
///      • "Yetkazib berdim" banner chiqadi
///      • Qo'ng'iroq qilish va boshqa tugmalar
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/network/api_client.dart';
import '../../../../../core/network/api_constants.dart';
import '../../../../../core/utils/routing.dart';
import '../../../../../core/di/injection_container.dart';

/// Backend'dan kelgan route target ma'lumoti.
class _RouteTarget {
  final int orderId;
  final String status;
  final LatLng? destination; // NULL = mijoz koordinata yubormagan
  final String addressText;
  final String notes;
  final String receiverName;
  final String receiverPhone;

  const _RouteTarget({
    required this.orderId,
    required this.status,
    required this.destination,
    required this.addressText,
    required this.notes,
    required this.receiverName,
    required this.receiverPhone,
  });

  factory _RouteTarget.fromJson(Map<String, dynamic> json) {
    LatLng? dest;
    final destMap = json['destination'];
    if (destMap is Map<String, dynamic>) {
      final lat = (destMap['lat'] as num?)?.toDouble();
      final lng = (destMap['lng'] as num?)?.toDouble();
      if (lat != null && lng != null) {
        dest = LatLng(lat, lng);
      }
    }
    return _RouteTarget(
      orderId: json['order_id'] as int,
      status: json['status'] as String? ?? '',
      destination: dest,
      addressText: json['address_text'] as String? ?? '',
      notes: json['notes'] as String? ?? '',
      receiverName: json['receiver_name'] as String? ?? '',
      receiverPhone: json['receiver_phone'] as String? ?? '',
    );
  }
}

class CourierRouteMapPage extends StatefulWidget {
  final int orderId;

  const CourierRouteMapPage({super.key, required this.orderId});

  @override
  State<CourierRouteMapPage> createState() => _CourierRouteMapPageState();
}

class _CourierRouteMapPageState extends State<CourierRouteMapPage> {
  _RouteTarget? _target;
  String? _targetError;

  LatLng? _courierPos;
  RouteResult? _route;
  bool _isLoadingRoute = false;
  bool _arrived = false;
  bool _isMapReady = false; // Xarita to'liq yuklanganini kuzatuvchi flag
  StreamSubscription<Position>? _positionSub;
  RouteFetchSnapshot? _lastRouteFetch;

  // Permission holatlari
  LocationPermission _permission = LocationPermission.unableToDetermine;
  bool _serviceEnabled = true;

  final MapController _mapController = MapController();

  @override
  void initState() {
    super.initState();
    _loadTarget();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _mapController.dispose(); // Oqish (leak) oldini olish
    super.dispose();
  }

  // ── 1. Backend'dan manzil ma'lumotini yuklash ───────────────────────────
  Future<void> _loadTarget() async {
    try {
      final api = sl<ApiClient>();
      final response = await api.dio.get<Map<String, dynamic>>(
        ApiConstants.orderRouteTarget(widget.orderId),
      );
      if (!mounted) return;
      setState(() {
        _target = _RouteTarget.fromJson(response.data!);
      });
      // Manzil olingach, GPS kuzatuvini boshlaymiz
      if (_target?.destination != null) {
        await _startLocationStream();
      }
    } on DioException catch (e) {
      String msg;
      if (e.response?.statusCode == 403) {
        msg = "Sizga bu buyurtmaga kirishga ruxsat yo'q.";
      } else if (e.response?.statusCode == 404) {
        msg = 'Buyurtma topilmadi.';
      } else {
        msg = "Buyurtma ma'lumotini olib bo'lmadi. Internetingizni tekshiring.";
      }
      if (mounted) setState(() => _targetError = msg);
    } catch (_) {
      if (mounted) {
        setState(() => _targetError = 'Kutilmagan xatolik yuz berdi.');
      }
    }
  }

  // ── 2. GPS permission va stream ────────────────────────────────────────
  Future<void> _startLocationStream() async {
    _serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!_serviceEnabled) {
      if (mounted) setState(() {});
      return;
    }

    _permission = await Geolocator.checkPermission();
    if (_permission == LocationPermission.denied) {
      _permission = await Geolocator.requestPermission();
    }
    if (_permission == LocationPermission.denied ||
        _permission == LocationPermission.deniedForever) {
      if (mounted) setState(() {});
      return;
    }

    // Real-time GPS stream
    _positionSub =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 10, // har 10 metr harakatda yangilanadi
          ),
        ).listen(
          (position) {
            if (!mounted) return;
            final newPos = LatLng(position.latitude, position.longitude);
            setState(() => _courierPos = newPos);
            _maybeRefreshRoute(newPos);
            _checkArrival(newPos);
          },
          onError: (err) {
            debugPrint('[CourierRouteMap] GPS xato: $err');
          },
        );
  }

  // ── 3. Yo'lni qayta hisoblash (throttled) ──────────────────────────────
  Future<void> _maybeRefreshRoute(LatLng pos) async {
    if (_target?.destination == null) return;
    if (!shouldRefreshRoute(pos, _lastRouteFetch)) return;

    setState(() => _isLoadingRoute = true);
    final dest = _target!.destination!;
    final newRoute = await fetchRoute(pos, dest);

    if (!mounted) return;
    if (newRoute != null) {
      final isFirst = _lastRouteFetch == null;
      setState(() {
        _route = newRoute;
        _isLoadingRoute = false;
      });
      _lastRouteFetch = RouteFetchSnapshot(pos, DateTime.now());
      if (isFirst) _fitToRoute(newRoute);
    } else {
      // OSRM xato — to'g'ri chiziq fallback
      final fallback = straightLineFallback(pos, dest);
      if (_route == null) {
        setState(() {
          _route = fallback;
          _isLoadingRoute = false;
        });
        _fitToRoute(fallback);
      } else {
        setState(() => _isLoadingRoute = false);
      }
    }
  }

  void _fitToRoute(RouteResult r) {
    if (!_isMapReady || r.geometry.length < 2) return;

    // PostFrameCallback — xarita joriy kadrda (frame) chizilib bo'lganini
    // va ekrandagi haqiqiy o'lchamlari tayyor ekanini kafolatlaydi.
    // Bu Race Condition (NaN zoom) xatosini 100% yo'q qiladi.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      try {
        final bounds = LatLngBounds.fromPoints(r.geometry);
        _mapController.fitCamera(
          CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(60)),
        );
      } catch (e) {
        debugPrint(
          '[CourierRouteMap] fitCamera xato (Race Condition to\'sildi): $e',
        );
      }
    });
  }

  // ── 4. Manzilga yaqinlashish detect ────────────────────────────────────
  void _checkArrival(LatLng pos) {
    if (_arrived || _target?.destination == null) return;
    final dist = haversineDistance(pos, _target!.destination!);
    if (dist < 50) {
      setState(() => _arrived = true);
    }
  }

  Future<void> _callCustomer() async {
    final phone = _target?.receiverPhone.replaceAll(RegExp(r'\s+'), '');
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _centerOnCourier() {
    if (_courierPos == null) return;
    _mapController.move(_courierPos!, 16);
  }

  // ── UI ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Loading state
    if (_target == null && _targetError == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Yuklanmoqda...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // Error state
    if (_targetError != null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.error_outline,
                  size: 64,
                  color: theme.colorScheme.error,
                ),
                const SizedBox(height: 16),
                Text('Xato', style: theme.textTheme.headlineSmall),
                const SizedBox(height: 8),
                Text(
                  _targetError!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.pop(),
                  child: const Text('Orqaga qaytish'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Koordinata yo'q — matn manzil bo'yicha boring
    if (_target!.destination == null) {
      return _NoCoordinatesView(target: _target!, onCall: _callCustomer);
    }

    // GPS service o'chirilgan
    if (!_serviceEnabled) {
      return _GpsServiceDisabledView(
        target: _target!,
        onRetry: () async {
          await Geolocator.openLocationSettings();
        },
      );
    }

    // Permission denied
    if (_permission == LocationPermission.deniedForever ||
        _permission == LocationPermission.denied) {
      return _PermissionDeniedView(
        target: _target!,
        onRetry: () async {
          await Geolocator.openAppSettings();
        },
      );
    }

    // Normal state — to'liq xarita
    return _buildMapView(theme);
  }

  Widget _buildMapView(ThemeData theme) {
    final target = _target!;
    final dest = target.destination!;

    return Scaffold(
      body: Stack(
        children: [
          // ── Xarita ────────────────────────────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: dest,
              initialZoom: 14,
              minZoom: 4,
              maxZoom: 19,
              onMapReady: () {
                _isMapReady = true;
                if (_route != null) {
                  _fitToRoute(_route!);
                }
              },
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
              ),
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: const ['a', 'b', 'c'],
                userAgentPackageName: 'uz.bozor.mobile',
                maxZoom: 19,
              ),
              // Yo'l polyline
              if (_route != null)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: _route!.geometry,
                      color: const Color(0xFF22C55E),
                      strokeWidth: 6,
                      borderColor: Colors.white,
                      borderStrokeWidth: 2,
                    ),
                  ],
                ),
              // Markerlar
              MarkerLayer(
                markers: [
                  // Manzil markeri (qizil pin_drop)
                  Marker(
                    point: dest,
                    width: 50,
                    height: 50,
                    alignment: Alignment.topCenter,
                    child: const Icon(
                      Icons.location_on,
                      color: Color(0xFFDC2626),
                      size: 42,
                      shadows: [
                        Shadow(
                          color: Colors.black26,
                          offset: Offset(0, 2),
                          blurRadius: 4,
                        ),
                      ],
                    ),
                  ),
                  // Kuryer markeri
                  if (_courierPos != null)
                    Marker(
                      point: _courierPos!,
                      width: 50,
                      height: 50,
                      child: Container(
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerLowest,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: theme.colorScheme.primary,
                            width: 3,
                          ),
                          boxShadow: const [
                            BoxShadow(
                              color: Colors.black26,
                              offset: Offset(0, 2),
                              blurRadius: 6,
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.directions_car_filled,
                          color: theme.colorScheme.primary,
                          size: 26,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),

          // ── Yuqori panel ──────────────────────────────────────────────────
          _buildTopPanel(theme, target),

          // ── Pastki Joylashuvga qaytish tugmasi ────────────────────────────
          if (_courierPos != null)
            Positioned(
              right: 16,
              bottom: _arrived ? 140 : 32,
              child: FloatingActionButton(
                heroTag: 'center',
                onPressed: _centerOnCourier,
                backgroundColor: theme.colorScheme.surface,
                foregroundColor: theme.colorScheme.primary,
                child: const Icon(Icons.my_location),
              ),
            ),

          // ── Manzilga yetdi — yashil banner ───────────────────────────────
          if (_arrived)
            Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: _ArrivedBanner(
                phone: target.receiverPhone,
                onCall: _callCustomer,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTopPanel(ThemeData theme, _RouteTarget target) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Container(
          margin: const EdgeInsets.all(8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => context.pop(),
                    style: IconButton.styleFrom(
                      minimumSize: const Size(36, 36),
                      padding: EdgeInsets.zero,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Buyurtma #${target.orderId}',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '${target.receiverName} · ${target.receiverPhone}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.call, color: theme.colorScheme.primary),
                    onPressed: _callCustomer,
                    style: IconButton.styleFrom(
                      backgroundColor: theme.colorScheme.primary.withValues(
                        alpha: 0.12,
                      ),
                      minimumSize: const Size(40, 40),
                      padding: EdgeInsets.zero,
                    ),
                  ),
                ],
              ),
              if (target.notes.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: Colors.amber.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.sticky_note_2,
                        size: 16,
                        color: Color(0xFFB45309),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          target.notes,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: const Color(0xFF92400E),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (_route != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.route,
                        color: theme.colorScheme.primary,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        formatDistance(_route!.distanceMeters),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (_route!.durationSeconds > 0) ...[
                        const SizedBox(width: 12),
                        const Icon(
                          Icons.schedule,
                          size: 16,
                          color: Colors.grey,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          formatDuration(_route!.durationSeconds),
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                      const Spacer(),
                      if (_isLoadingRoute)
                        SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Subcomponents ──────────────────────────────────────────────────────────

class _ArrivedBanner extends StatelessWidget {
  final String phone;
  final VoidCallback onCall;

  const _ArrivedBanner({required this.phone, required this.onCall});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 16,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.where_to_vote, color: Colors.white, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Manzilga yetdingiz!',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                Text(
                  "Mijoz bilan bog'lanib tovarni topshiring",
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onCall,
            icon: const Icon(Icons.call, color: Colors.white),
            label: Text(
              phone,
              style: const TextStyle(color: Colors.white, fontSize: 12),
            ),
            style: TextButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.2),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoCoordinatesView extends StatelessWidget {
  final _RouteTarget target;
  final VoidCallback onCall;

  const _NoCoordinatesView({required this.target, required this.onCall});

  Future<void> _openExternalMap(String urlString) async {
    final uri = Uri.parse(urlString);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final addressEncoded = Uri.encodeComponent(target.addressText);

    return Scaffold(
      appBar: AppBar(title: Text('Buyurtma #${target.orderId}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(child: Icon(Icons.location_off, size: 64, color: Colors.amber.shade700)),
          const SizedBox(height: 12),
          Text(
            "Aniq koordinata yo'q",
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            "Mijoz xaritadan aniq joy tanlamagan. Quyidagi matn manzili "
            "bo'yicha boring yoki tashqi xarita xizmatini ishlatib navigatsiya qiling.",
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),

          // Mijoz ma'lumotlari
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.person, color: theme.colorScheme.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(target.receiverName, style: theme.textTheme.titleSmall),
                            Text(target.receiverPhone, style: theme.textTheme.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.place, color: theme.colorScheme.primary),
                      const SizedBox(width: 8),
                      Expanded(child: Text(target.addressText)),
                    ],
                  ),
                  if (target.notes.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.sticky_note_2, color: Color(0xFFB45309), size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text(target.notes)),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Qo'ng'iroq
          FilledButton.icon(
            onPressed: onCall,
            icon: const Icon(Icons.call),
            label: Text(target.receiverPhone),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),

          // Tashqi xaritalar — matn manzil bo'yicha qidirish
          const SizedBox(height: 24),
          Text(
            "TASHQI NAVIGATSIYA",
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              letterSpacing: 0.5,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          _ExternalMapTile(
            icon: '🗺️',
            color: const Color(0xFFFFCC00),
            title: "Yandex Maps'da ochish",
            subtitle: 'CIS uchun eng aniq xarita',
            onTap: () => _openExternalMap(
              'https://yandex.com/maps/?text=$addressEncoded',
            ),
          ),
          const SizedBox(height: 8),
          _ExternalMapTile(
            icon: '🗺️',
            color: const Color(0xFF4285F4),
            title: "Google Maps'da ochish",
            subtitle: 'Universal xarita',
            onTap: () => _openExternalMap(
              'https://www.google.com/maps/search/?api=1&query=$addressEncoded',
            ),
          ),
          const SizedBox(height: 8),
          _ExternalMapTile(
            icon: '🗺️',
            color: const Color(0xFF22C55E),
            title: "2GIS'da ochish",
            subtitle: "O'zbekiston shaharlari",
            onTap: () => _openExternalMap(
              'https://2gis.uz/search/$addressEncoded',
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ExternalMapTile extends StatelessWidget {
  final String icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ExternalMapTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title,
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                    Text(subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        )),
                  ],
                ),
              ),
              Icon(Icons.open_in_new, color: theme.colorScheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

class _GpsServiceDisabledView extends StatelessWidget {
  final _RouteTarget target;
  final Future<void> Function() onRetry;

  const _GpsServiceDisabledView({required this.target, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Buyurtma #${target.orderId}')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.gps_off, size: 72, color: Colors.orange),
            const SizedBox(height: 16),
            Text(
              "GPS xizmati o'chirilgan",
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              "Telefoningizning sozlamalarida GPS / Joylashuv xizmatini yoqing.",
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async => onRetry(),
              icon: const Icon(Icons.settings),
              label: const Text("Sozlamalarni ochish"),
            ),
          ],
        ),
      ),
    );
  }
}

class _PermissionDeniedView extends StatelessWidget {
  final _RouteTarget target;
  final Future<void> Function() onRetry;

  const _PermissionDeniedView({required this.target, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Buyurtma #${target.orderId}')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.location_disabled,
              size: 72,
              color: Colors.redAccent,
            ),
            const SizedBox(height: 16),
            Text(
              "Joylashuvga ruxsat kerak",
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              "Kuryer navigatsiyasi uchun ilovaga joylashuv ruxsatini bering. "
              "Sozlamalardan 'Ruxsat berish' yoki 'Always allow' tanlang.",
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async => onRetry(),
              icon: const Icon(Icons.settings),
              label: const Text("Ilova sozlamalarini ochish"),
            ),
          ],
        ),
      ),
    );
  }
}
