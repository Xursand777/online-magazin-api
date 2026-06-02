import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../network/app_config_service.dart';

/// Phase 1.2 — Mobil ilova versiya nazorati va maintenance gate.
///
/// ── XULQ-ATVOR ─────────────────────────────────────────────────────────────
///   1. Ilova ochilganda /api/app-config/ chaqiriladi
///   2. Server javobiga qarab 3 ta variant:
///      a) maintenance_mode=True  → MaintenanceScreen (yopilmaydi)
///      b) joriy versiya < min     → ForceUpdateScreen (yopilmaydi)
///      c) hammasi OK              → asosiy ilova (child)
///   3. Tarmoq xato bo'lsa — fail open (ilova davom etadi)
///
/// ── NIMA UCHUN FAIL OPEN ──────────────────────────────────────────────────
/// Server uxlab qolgan (Render free cold start) yoki internet sekin bo'lsa,
/// mijozni "yangilang" yoki "kuting" ekraniga qamab qo'yish noinsoflik.
/// Sentry'da xato kuzatiladi — keyin kerak bo'lsa logikani qattiqlatamiz.
///
/// ── BIR MARTA TEKSHIRUV ─────────────────────────────────────────────────
/// Versiya tekshiruvi ilova ochilganda BIR MARTA bajariladi.
/// Server keshlangani uchun (5 daqiqa), bu yengil tekshiruv.
class AppVersionGate extends StatefulWidget {
  final Widget child;

  /// Foydalanuvchining joriy tili — xabar shu tilda ko'rsatiladi.
  /// 'uz', 'ru' yoki 'en'.
  final String language;

  const AppVersionGate({
    super.key,
    required this.child,
    this.language = 'uz',
  });

  @override
  State<AppVersionGate> createState() => _AppVersionGateState();
}

enum _GateStatus { checking, ok, forceUpdate, maintenance }

class _AppVersionGateState extends State<AppVersionGate> {
  _GateStatus _status = _GateStatus.checking;
  String _message = '';
  String _storeUrl = '';

  @override
  void initState() {
    super.initState();
    _checkVersion();
  }

  Future<void> _checkVersion() async {
    final service = AppConfigService();
    final platform = defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
    final config = await service.fetch(platform: platform);

    if (!mounted) return;

    // Tarmoq xato — fail open
    if (config == null) {
      setState(() => _status = _GateStatus.ok);
      return;
    }

    // Maintenance rejimi — eng birinchi tekshirish
    if (config.maintenanceMode) {
      setState(() {
        _status = _GateStatus.maintenance;
        _message = config.maintenanceMessage(widget.language);
      });
      return;
    }

    // Versiya tekshiruv
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      if (isVersionBelow(packageInfo.version, config.minVersion)) {
        if (!mounted) return;
        setState(() {
          _status = _GateStatus.forceUpdate;
          _message = config.forceUpdateMessage(widget.language);
          _storeUrl = config.storeUrl;
        });
        return;
      }
    } catch (_) {
      // package_info olib bo'lmadi — davom etishga ruxsat
    }

    if (!mounted) return;
    setState(() => _status = _GateStatus.ok);
  }

  @override
  Widget build(BuildContext context) {
    switch (_status) {
      case _GateStatus.checking:
        return const _CheckingScreen();
      case _GateStatus.ok:
        return widget.child;
      case _GateStatus.forceUpdate:
        return _ForceUpdateScreen(
          message: _message,
          storeUrl: _storeUrl,
        );
      case _GateStatus.maintenance:
        return _MaintenanceScreen(message: _message);
    }
  }
}

// ─── Tekshirish paytidagi ekran ───────────────────────────────────────────

class _CheckingScreen extends StatelessWidget {
  const _CheckingScreen();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

// ─── Force update ekrani ──────────────────────────────────────────────────

class _ForceUpdateScreen extends StatelessWidget {
  final String message;
  final String storeUrl;

  const _ForceUpdateScreen({required this.message, required this.storeUrl});

  Future<void> _openStore() async {
    if (storeUrl.isEmpty) return;
    final uri = Uri.parse(storeUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Telefon orqaga/uydi tugmasini bossin (Android: minimize)
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) {
          // Force update — yopilmaydi
        },
        child: Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.system_update,
                    size: 96,
                    color: Color(0xFF0A7C55),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Yangilash kerak',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    message.isEmpty
                        ? "Ilovangiz eskirgan. Davom etish uchun yangilang."
                        : message,
                    style: Theme.of(context).textTheme.bodyLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 40),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: storeUrl.isEmpty ? null : _openStore,
                      icon: const Icon(Icons.download),
                      label: const Text('Yangilash'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        backgroundColor: const Color(0xFF0A7C55),
                      ),
                    ),
                  ),
                  if (storeUrl.isEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Yangilash uchun Google Play Store ga o\'ting',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.grey,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 24),
                  TextButton(
                    onPressed: () => SystemNavigator.pop(),
                    child: const Text('Ilovani yopish'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Maintenance ekrani ───────────────────────────────────────────────────

class _MaintenanceScreen extends StatelessWidget {
  final String message;

  const _MaintenanceScreen({required this.message});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) {},
        child: Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.engineering,
                    size: 96,
                    color: Color(0xFFFF9800),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Texnik xizmat',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    message.isEmpty
                        ? "Texnik xizmat ishlari olib borilmoqda. "
                            "Iltimos, biroz kutib turing."
                        : message,
                    style: Theme.of(context).textTheme.bodyLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 40),
                  TextButton.icon(
                    onPressed: () {
                      // Refresh: app gate'ni qayta tekshirish uchun
                      // ilovani qayta ishga tushirish (yengil yo'l)
                      SystemNavigator.pop();
                    },
                    icon: const Icon(Icons.refresh),
                    label: const Text('Qayta urinish'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
