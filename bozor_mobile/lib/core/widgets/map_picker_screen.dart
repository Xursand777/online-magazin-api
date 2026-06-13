/// map_picker_screen.dart — To'liq ekran xarita orqali manzil tanlash.
///
/// SAYTDAGI Leaflet xarita BILAN BIR XIL XULQ:
///   • OpenStreetMap tile'lari (bepul, brand cheklov yo'q)
///   • Tap qilib pin qo'yish
///   • Tanlangan koordinatani reverse-geocode qilish
///   • "Tasdiqlash" tugma → StructuredAddress qaytarish
///   • Map ochilganida joriy joylashuvga avtomat o'tish (ruxsat bor bo'lsa)
///
/// CHAQIRUVCHI:
///   final addr = await Navigator.push&lt;StructuredAddress&gt;(
///     context,
///     MaterialPageRoute(builder: (_) =&gt; const MapPickerScreen()),
///   );
///   if (addr != null) {
///     // foydalanuvchi tasdiqladi — manzilni ishlatamiz
///   }
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../utils/address.dart';
import '../utils/geolocation.dart';

/// Urganch markazi — kuryer va mahalliy biznes uchun default.
const _urganchCenter = LatLng(41.5499, 60.6333);

class MapPickerScreen extends StatefulWidget {
  /// Boshlang'ich joylashuv (avval saqlangan manzil koordinatasi yoki null).
  final LatLng? initialLocation;

  /// Til kodi reverse geocode uchun ('uz', 'ru', 'en').
  final String language;

  const MapPickerScreen({
    super.key,
    this.initialLocation,
    this.language = 'uz',
  });

  @override
  State<MapPickerScreen> createState() => _MapPickerScreenState();
}

class _MapPickerScreenState extends State<MapPickerScreen> {
  late final MapController _mapController;
  LatLng? _pickedLocation;
  StructuredAddress? _pickedAddress;
  bool _isGeocoding = false;
  bool _isFetchingCurrent = false;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();

    if (widget.initialLocation != null) {
      // Avval saqlangan koordinata bor — uni pin qilamiz
      _pickedLocation = widget.initialLocation;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _reverseGeocodeAt(widget.initialLocation!);
      });
    } else {
      // Mavjud bo'lmasa — joriy joylashuvni olishga harakat qilamiz (silent)
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _tryUseCurrentLocation();
      });
    }
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  /// Map ochilganida joriy joylashuvni avtomat olamiz — agar ruxsat
  /// granted bo'lsa. Denied bo'lsa, default Urganch markazida qoladi
  /// (foydalanuvchi qo'lda tap qiladi).
  Future<void> _tryUseCurrentLocation() async {
    setState(() => _isFetchingCurrent = true);
    try {
      final result = await getCurrentLocation();
      if (!mounted) return;
      if (result is GeoSuccess) {
        final coord = LatLng(result.latitude, result.longitude);
        _mapController.move(coord, 15);
        setState(() => _pickedLocation = coord);
        await _reverseGeocodeAt(coord);
      }
    } finally {
      if (mounted) setState(() => _isFetchingCurrent = false);
    }
  }

  Future<void> _reverseGeocodeAt(LatLng coord) async {
    setState(() => _isGeocoding = true);
    try {
      final nominatim = await reverseGeocode(
        coord.latitude,
        coord.longitude,
        lang: widget.language,
      );
      if (!mounted) return;
      if (nominatim != null) {
        setState(() => _pickedAddress = addressFromNominatim(nominatim));
      } else {
        setState(() => _pickedAddress = null);
      }
    } finally {
      if (mounted) setState(() => _isGeocoding = false);
    }
  }

  void _onMapTap(TapPosition tapPos, LatLng coord) {
    setState(() => _pickedLocation = coord);
    _reverseGeocodeAt(coord);
  }

  void _confirm() {
    if (_pickedAddress != null) {
      Navigator.of(context).pop(_pickedAddress);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final center = _pickedLocation ?? widget.initialLocation ?? _urganchCenter;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kartadan manzil tanlash'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            tooltip: 'Joriy joylashuvga o\'tish',
            icon: _isFetchingCurrent
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  )
                : const Icon(Icons.my_location_rounded),
            onPressed: _isFetchingCurrent ? null : _tryUseCurrentLocation,
          ),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: center,
              initialZoom: 13,
              onTap: _onMapTap,
              minZoom: 4,
              maxZoom: 18,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
              ),
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: const ['a', 'b', 'c'],
                userAgentPackageName: 'uz.bozor.mobile',
                maxZoom: 19,
              ),
              if (_pickedLocation != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _pickedLocation!,
                      width: 48,
                      height: 48,
                      alignment: Alignment.topCenter,
                      child: const Icon(
                        Icons.location_on,
                        color: Color(0xFF22C55E),
                        size: 48,
                        shadows: [
                          Shadow(
                            color: Colors.black26,
                            blurRadius: 6,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
            ],
          ),

          // Yuqori info banner (ko'rsatma)
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: Material(
              elevation: 4,
              borderRadius: BorderRadius.circular(12),
              color: theme.colorScheme.surface.withValues(alpha: 0.95),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    Icon(Icons.touch_app_rounded,
                        size: 18, color: theme.colorScheme.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _pickedLocation == null
                            ? 'Manzilni belgilash uchun xarita ustiga bosing'
                            : 'Boshqa joyga belgi qo\'yish uchun xaritaga qayta bosing',
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),

      // Pastdan tanlangan manzil oldindan ko'rinishi + Tasdiqlash tugmasi
      bottomSheet: _pickedLocation == null ? null : _buildPickedSheet(theme),
    );
  }

  Widget _buildPickedSheet(ThemeData theme) {
    return Material(
      elevation: 8,
      color: theme.colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Tanlangan manzil oldindan ko'rinishi
              if (_isGeocoding)
                Row(
                  children: [
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Manzil aniqlanmoqda...',
                      style: theme.textTheme.bodyMedium,
                    ),
                  ],
                )
              else if (_pickedAddress != null && _pickedAddress!.full.isNotEmpty)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.place_rounded,
                        size: 22, color: theme.colorScheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Tanlangan manzil',
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _pickedAddress!.full,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    Icon(Icons.error_outline_rounded,
                        size: 20, color: theme.colorScheme.error),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Manzil topilmadi. Boshqa joyga belgi qo\'ying.',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),

              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton.icon(
                  onPressed: (_isGeocoding ||
                          _pickedAddress == null ||
                          _pickedAddress!.full.isEmpty)
                      ? null
                      : _confirm,
                  icon: const Icon(Icons.check_rounded),
                  label: const Text(
                    'Shu manzilni tanlash',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
