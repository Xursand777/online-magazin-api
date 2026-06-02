import 'package:flutter/material.dart';
import '../network/cold_start_tracker.dart';

/// Server cold-start jarayoni davomida ekran tepasida ko'rinadigan banner.
///
/// ── XULQ-ATVOR ─────────────────────────────────────────────────────────────
///   • 0-5s   — yashirin (tez request — banner kerakmas)
///   • 5-15s  — "Server uyg'onmoqda..."  (warming) — sariq fon
///   • 15-30s — "Davom etmoqda..."        (slow)    — to'q sariq
///   • 30s+   — "Tarmoq sekin..."          (veryHard) — qizilrog'
///
/// ── NIMA UCHUN ────────────────────────────────────────────────────────────
/// Render free tier'da cold start 30-60 soniyagacha cho'zilishi mumkin.
/// UptimeRobot warm-up bu muammoni 80% kamaytirgan, lekin:
///   • UptimeRobot o'zi 1-2 daqiqa down bo'lsa
///   • Render restart paytida
///   • Foydalanuvchi telefon airplane mode'dan chiqsa
/// Banner foydalanuvchiga "ilova sinmagan, server uyg'onmoqda" deyadi.
class ColdStartBanner extends StatelessWidget {
  const ColdStartBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ColdStartStatus>(
      valueListenable: coldStartTracker,
      builder: (context, status, _) {
        return AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          // SlideTransition orqali tepadan tushib chiqadi
          transitionBuilder: (child, animation) {
            return SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, -1),
                end: Offset.zero,
              ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOut)),
              child: child,
            );
          },
          child: status == ColdStartStatus.idle
              ? const SizedBox.shrink(key: ValueKey('idle'))
              : _BannerContent(status: status, key: ValueKey(status)),
        );
      },
    );
  }
}

class _BannerContent extends StatelessWidget {
  final ColdStartStatus status;
  const _BannerContent({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = _colorsFor(status, theme);
    final media = MediaQuery.of(context);

    return Material(
      elevation: 4,
      color: colors.background,
      child: Padding(
        padding: EdgeInsets.only(
          top: media.padding.top + 8,
          bottom: 12,
          left: 16,
          right: 16,
        ),
        child: Row(
          children: [
            // Aylanma spinner — kutilayotganligini ko'rsatadi
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation(colors.foreground),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _titleFor(status),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: colors.foreground,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (_subtitleFor(status) != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      _subtitleFor(status)!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.foreground.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _titleFor(ColdStartStatus status) {
    switch (status) {
      case ColdStartStatus.warming:
        return "Server uyg'onmoqda...";
      case ColdStartStatus.slow:
        return "Davom etmoqda...";
      case ColdStartStatus.veryHard:
        return "Tarmoq sekin ishlamoqda";
      case ColdStartStatus.idle:
        return '';
    }
  }

  String? _subtitleFor(ColdStartStatus status) {
    switch (status) {
      case ColdStartStatus.warming:
        return "Birinchi ochilishda 15-30 soniya cho'zilishi mumkin";
      case ColdStartStatus.slow:
        return "Iltimos, biroz kutib turing";
      case ColdStartStatus.veryHard:
        return "Internet ulanishini tekshiring";
      case ColdStartStatus.idle:
        return null;
    }
  }

  _BannerColors _colorsFor(ColdStartStatus status, ThemeData theme) {
    switch (status) {
      case ColdStartStatus.warming:
        return _BannerColors(
          background: const Color(0xFFFFC107), // amber
          foreground: const Color(0xFF1A1A1A),
        );
      case ColdStartStatus.slow:
        return _BannerColors(
          background: const Color(0xFFFF9800), // orange
          foreground: Colors.white,
        );
      case ColdStartStatus.veryHard:
        return _BannerColors(
          background: const Color(0xFFE53935), // red
          foreground: Colors.white,
        );
      case ColdStartStatus.idle:
        return _BannerColors(
          background: theme.colorScheme.surface,
          foreground: theme.colorScheme.onSurface,
        );
    }
  }
}

class _BannerColors {
  final Color background;
  final Color foreground;
  _BannerColors({required this.background, required this.foreground});
}
