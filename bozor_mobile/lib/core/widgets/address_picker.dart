/// address_picker.dart — Yetkazib berish manzilini tanlash uchun YAGONA widget.
///
/// SAYTDAGI AddressPicker.tsx BILAN BIR XIL XULQ:
///   • 4 ta input maydon (viloyat, tuman/shahar, mahalla, dom/uy)
///   • "Kartadan tanlash" tugma → MapPickerScreen
///   • "Joylashuvni aniqlash" tugma → GPS + permission dialog
///   • Reverse geocoding (Nominatim)
///   • Auto-fill: parent yangi value bersa, inputlar yangilanadi
///   • Foydalanuvchi yozayotgan paytda overwrite qilmaymiz (controller-based)
///
/// QAYERDA ISHLATILADI:
///   • ProfileEditPage — saqlangan default manzil
///   • CheckoutPage — buyurtma manzili (profile'dan auto-fill)
///
/// CONTROLLED COMPONENT:
///   Parent state'i — single source of truth. AddressPicker'da o'zgartirishlar
///   onChange orqali parent'ga uzatiladi (saytdagi React patternga o'xshash).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import '../utils/address.dart';
import '../utils/geolocation.dart';
import 'geo_permission_dialog.dart';
import 'map_picker_screen.dart';

class AddressPicker extends StatefulWidget {
  /// Joriy manzil — strukturalangan obyekt yoki bo'sh.
  final StructuredAddress value;

  /// Manzil o'zgarganda chaqiriladi (har inputda, kartada, GPS'da).
  final ValueChanged<StructuredAddress> onChanged;

  /// Til kodi reverse geocode uchun ('uz', 'ru', 'en').
  final String language;

  /// Sarlavhani ko'rsatish (Profile uchun true, Checkout uchun false).
  final bool showHeading;

  /// Maydonlar majburiy ekanligini ko'rsatish (yulduzcha + validator hint).
  final bool required;

  /// Aksent rangi — saytdagi #22c55e bilan bir xil.
  final Color? accentColor;

  const AddressPicker({
    super.key,
    required this.value,
    required this.onChanged,
    this.language = 'uz',
    this.showHeading = true,
    this.required = true,
    this.accentColor,
  });

  @override
  State<AddressPicker> createState() => _AddressPickerState();
}

class _AddressPickerState extends State<AddressPicker> {
  late TextEditingController _viloyatCtrl;
  late TextEditingController _tumanCtrl;
  late TextEditingController _mahallaCtrl;
  late TextEditingController _domCtrl;

  bool _isLocating = false;

  @override
  void initState() {
    super.initState();
    _viloyatCtrl = TextEditingController(text: widget.value.viloyat);
    _tumanCtrl = TextEditingController(text: widget.value.tumanShahar);
    _mahallaCtrl = TextEditingController(text: widget.value.mahalla);
    _domCtrl = TextEditingController(text: widget.value.domUy);

    _viloyatCtrl.addListener(_emitChange);
    _tumanCtrl.addListener(_emitChange);
    _mahallaCtrl.addListener(_emitChange);
    _domCtrl.addListener(_emitChange);
  }

  @override
  void didUpdateWidget(covariant AddressPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    // ── Parent value o'zgardimi (auto-fill)? ───────────────────────────────
    // KRITIK: Profile saqlangan manzilni Checkout'da auto-fill uchun.
    // Faqat HAQIQATAN farq qilsa yangilaymiz — foydalanuvchi yozayotgan
    // paytda overwrite qilmaymiz.
    if (widget.value.full != oldWidget.value.full &&
        widget.value.full != _currentStructured().full) {
      _setFromExternal(widget.value);
    }
  }

  @override
  void dispose() {
    _viloyatCtrl.dispose();
    _tumanCtrl.dispose();
    _mahallaCtrl.dispose();
    _domCtrl.dispose();
    super.dispose();
  }

  StructuredAddress _currentStructured() => StructuredAddress(
        viloyat: _viloyatCtrl.text,
        tumanShahar: _tumanCtrl.text,
        mahalla: _mahallaCtrl.text,
        domUy: _domCtrl.text,
      );

  void _setFromExternal(StructuredAddress addr) {
    // Listener cheksiz tsiklini oldini olish — addListener bekor qilamiz
    _viloyatCtrl.removeListener(_emitChange);
    _tumanCtrl.removeListener(_emitChange);
    _mahallaCtrl.removeListener(_emitChange);
    _domCtrl.removeListener(_emitChange);

    _viloyatCtrl.text = addr.viloyat;
    _tumanCtrl.text = addr.tumanShahar;
    _mahallaCtrl.text = addr.mahalla;
    _domCtrl.text = addr.domUy;

    _viloyatCtrl.addListener(_emitChange);
    _tumanCtrl.addListener(_emitChange);
    _mahallaCtrl.addListener(_emitChange);
    _domCtrl.addListener(_emitChange);
  }

  void _emitChange() {
    widget.onChanged(_currentStructured());
  }

  /// "Kartadan tanlash" — MapPickerScreen ochish.
  Future<void> _openMapPicker() async {
    HapticFeedback.lightImpact();
    final picked = await Navigator.of(context).push<StructuredAddress>(
      MaterialPageRoute(
        builder: (_) => MapPickerScreen(language: widget.language),
        fullscreenDialog: true,
      ),
    );
    if (picked != null && mounted) {
      _setFromExternal(picked);
      _emitChange();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Manzil kartadan tanlandi'),
            duration: Duration(seconds: 2),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  /// "Joylashuvni aniqlash" — GPS + 5 qatlamli tashxis.
  Future<void> _detectLocation() async {
    HapticFeedback.lightImpact();
    setState(() => _isLocating = true);
    try {
      final result = await getCurrentLocation(
        accuracy: LocationAccuracy.high,
        timeout: const Duration(seconds: 15),
      );

      if (!mounted) return;

      switch (result) {
        case GeoSuccess(:final latitude, :final longitude):
          final nominatim = await reverseGeocode(
            latitude,
            longitude,
            lang: widget.language,
          );
          if (!mounted) return;
          if (nominatim != null) {
            final addr = addressFromNominatim(nominatim);
            _setFromExternal(addr);
            _emitChange();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Joylashuv aniqlandi'),
                duration: Duration(seconds: 2),
                behavior: SnackBarBehavior.floating,
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                    'Manzilni topib bo\'lmadi. Qo\'lda kiriting yoki kartadan tanlang.'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }

        case GeoFailure(:final reason):
          await GeoPermissionDialog.show(context, reason: reason);
      }
    } finally {
      if (mounted) setState(() => _isLocating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = widget.accentColor ?? const Color(0xFF22C55E);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Sarlavha (showHeading=true) ──────────────────────────────────────
        if (widget.showHeading) ...[
          Row(
            children: [
              Icon(Icons.location_on_outlined,
                  size: 22, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Yetkazib berish manzili',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Manzilni xarita orqali tanlang yoki joylashuvni aniqlatib avtomat to\'ldiring',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 14),
        ],

        // ── Tugmalar qatori ────────────────────────────────────────────────
        Row(
          children: [
            Expanded(
              child: _ActionButton(
                icon: Icons.map_outlined,
                label: 'Kartadan tanlash',
                onTap: _openMapPicker,
                accent: accent,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _ActionButton(
                icon: Icons.my_location_rounded,
                label: _isLocating ? 'Aniqlanmoqda...' : 'Joylashuvni aniqlash',
                onTap: _isLocating ? null : _detectLocation,
                accent: accent,
                loading: _isLocating,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // ── 4 ta input maydon ──────────────────────────────────────────────
        _AddressField(
          controller: _viloyatCtrl,
          label: 'Viloyat',
          hint: 'Masalan: Xorazm viloyati',
          icon: Icons.public_rounded,
          required: widget.required,
          accent: accent,
        ),
        const SizedBox(height: 10),
        _AddressField(
          controller: _tumanCtrl,
          label: 'Tuman / Shahar',
          hint: 'Masalan: Urganch shahri',
          icon: Icons.location_city_outlined,
          required: widget.required,
          accent: accent,
        ),
        const SizedBox(height: 10),
        _AddressField(
          controller: _mahallaCtrl,
          label: 'Mahalla',
          hint: 'Masalan: Al-Xorazmiy mahallasi',
          icon: Icons.holiday_village_outlined,
          required: false, // mahalla ixtiyoriy
          accent: accent,
        ),
        const SizedBox(height: 10),
        _AddressField(
          controller: _domCtrl,
          label: 'Uy / Ko\'cha / Xonadon',
          hint: 'Masalan: A. Temur 12, 5-xonadon',
          icon: Icons.home_outlined,
          required: widget.required,
          accent: accent,
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color accent;
  final bool loading;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.accent,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final disabled = onTap == null;
    final color = disabled ? theme.colorScheme.onSurfaceVariant : accent;
    return Material(
      color: accent.withValues(alpha: disabled ? 0.06 : 0.12),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: accent.withValues(alpha: disabled ? 0.12 : 0.30),
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (loading)
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: color,
                  ),
                )
              else
                Icon(icon, size: 20, color: color),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddressField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final bool required;
  final Color accent;

  const _AddressField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    required this.required,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TextFormField(
      controller: controller,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(
        labelText: required ? '$label *' : label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 20),
        labelStyle: theme.textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
        ),
        hintStyle: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.outline,
        ),
        floatingLabelBehavior: FloatingLabelBehavior.always,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: accent, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
      validator: required
          ? (v) => (v == null || v.trim().isEmpty)
              ? '$label majburiy'
              : null
          : null,
    );
  }
}
