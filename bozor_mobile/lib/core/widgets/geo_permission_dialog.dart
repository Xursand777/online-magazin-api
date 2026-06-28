/// geo_permission_dialog.dart — Geolokatsiya ruxsati muammosi bo'lganda
/// foydalanuvchiga professional yo'l-yo'riq.
///
/// SAYTDAGI GeoPermissionModal BILAN BIR XIL UX:
///   • reason'ga qarab title/subtitle/banner/steps
///   • "Sozlamalarni ochish" tugma (browser'dagi "Qayta urinish" o'rniga
///     mobile'da bevosita app settings'ni ochamiz)
///   • "Manzilni qo'lda kiritish" tugma
///   • Platform-specific yo'l-yo'riq (iOS / Android)
library;

import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import '../utils/geolocation.dart';

/// Dialog qaytaradigan natija — chaqiruvchi reaksiyani aniqlash uchun.
enum GeoDialogResult {
  /// Foydalanuvchi sozlamalarni ochdi (Settings ilovasiga ko'chdi)
  openedSettings,

  /// Foydalanuvchi qo'lda kiritishni tanladi
  manualEntry,

  /// Yopildi (X, backdrop, ESC)
  dismissed,
}

class GeoPermissionDialog extends StatelessWidget {
  final GeoDenyReason reason;

  const GeoPermissionDialog({super.key, required this.reason});

  /// Dialog'ni ko'rsatish va natijani kutish.
  static Future<GeoDialogResult> show(
    BuildContext context, {
    required GeoDenyReason reason,
  }) async {
    final result = await showDialog<GeoDialogResult>(
      context: context,
      barrierDismissible: true,
      builder: (_) => GeoPermissionDialog(reason: reason),
    );
    return result ?? GeoDialogResult.dismissed;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = _resolveContent(reason);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Header (ikonka + title + close) ─────────────────────────
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer
                            .withValues(alpha: 0.6),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        content.icon,
                        size: 26,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            content.title,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            content.subtitle,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () =>
                          Navigator.of(context).pop(GeoDialogResult.dismissed),
                      icon: const Icon(Icons.close_rounded),
                      tooltip: 'Yopish',
                    ),
                  ],
                ),

                // ── Sabab banner ────────────────────────────────────────────
                if (content.banner != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.amber.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: Colors.amber.withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(content.bannerIcon ?? Icons.warning_amber_rounded,
                            color: Colors.amber.shade800, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            content.banner!,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurface,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                // ── Numbered steps ──────────────────────────────────────────
                const SizedBox(height: 16),
                ...List.generate(content.steps.length, (idx) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 24,
                          height: 24,
                          margin: const EdgeInsets.only(top: 2),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              '${idx + 1}',
                              style: TextStyle(
                                color: theme.colorScheme.onPrimary,
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            content.steps[idx],
                            style: theme.textTheme.bodyMedium?.copyWith(
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),

                // ── Action tugmalari ────────────────────────────────────────
                const SizedBox(height: 12),
                if (content.canOpenSettings)
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton.icon(
                      onPressed: () async {
                        // App settings'ni ochish — foydalanuvchi ruxsatni qo'lda beradi
                        if (reason == GeoDenyReason.systemBlock) {
                          await openLocationSettings();
                        } else {
                          await openAppSettings();
                        }
                        if (context.mounted) {
                          Navigator.of(context)
                              .pop(GeoDialogResult.openedSettings);
                        }
                      },
                      icon: const Icon(Icons.settings_rounded),
                      label: Text(content.primaryActionLabel),
                      style: FilledButton.styleFrom(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context)
                        .pop(GeoDialogResult.manualEntry),
                    icon: const Icon(Icons.edit_location_alt_outlined),
                    label: const Text("Manzilni qo'lda kiritish"),
                    style: OutlinedButton.styleFrom(
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
      ),
    );
  }

  _DialogContent _resolveContent(GeoDenyReason r) {
    final isIOS = Platform.isIOS;
    switch (r) {
      case GeoDenyReason.previouslyDenied:
        return _DialogContent(
          icon: Icons.location_off_rounded,
          title: 'Joylashuv avval bloklangan',
          subtitle:
              'Siz bu ilova uchun joylashuvni avval rad etgansiz. Tizim sozlamalaridan ruxsatni o\'zingiz tiklashingiz kerak.',
          banner:
              'Ilova endi sizdan qayta so\'ramaydi — sozlamalarni ochib ruxsat bering.',
          bannerIcon: Icons.info_outline_rounded,
          steps: isIOS
              ? [
                  'Quyidagi "Sozlamalarni ochish" tugmasini bosing',
                  '"Joylashuv" / "Location" qatorini toping',
                  '"Foydalanish payti" / "While Using the App" ni tanlang',
                  '700Mobile ilovasiga qaytib, qayta urinib ko\'ring',
                ]
              : [
                  'Quyidagi "Sozlamalarni ochish" tugmasini bosing',
                  '"Ruxsatlar" / "Permissions" → "Joylashuv" / "Location"',
                  '"Foydalanish payti ruxsat" / "Allow while using app" ni tanlang',
                  '700Mobile ilovasiga qaytib, qayta urinib ko\'ring',
                ],
          primaryActionLabel: 'Sozlamalarni ochish',
          canOpenSettings: true,
        );

      case GeoDenyReason.justDenied:
        return _DialogContent(
          icon: Icons.do_not_disturb_on_outlined,
          title: 'Joylashuv rad etildi',
          subtitle:
              'Tizim dialog\'ida "Rad etish" tanlandi. Joylashuvdan foydalanish uchun qayta urinib ko\'ring.',
          banner:
              'Agar dialog qayta chiqmasa, sozlamalardan ham ruxsat bera olasiz.',
          bannerIcon: Icons.replay_rounded,
          steps: const [
            'Quyidagi "Manzilni qo\'lda kiritish" tugmasini bosib davom etishingiz mumkin',
            'Yoki "Joylashuvni aniqlash" tugmasini qayta bosib, dialog\'da "Ruxsat berish" ni tanlang',
          ],
          primaryActionLabel: 'Sozlamalarni ochish',
          canOpenSettings: true,
        );

      case GeoDenyReason.systemBlock:
        return _DialogContent(
          icon: Icons.gps_off_rounded,
          title: 'Joylashuv xizmati o\'chirilgan',
          subtitle:
              'Telefoningizda Location Services o\'chirilgan. GPS ishlamaguncha joylashuvni aniqlay olmaymiz.',
          banner: isIOS
              ? 'Settings → Privacy & Security → Location Services orqali yoqing.'
              : 'Settings → Location orqali yoqing yoki status barda Location ikonkasini bosing.',
          bannerIcon: Icons.settings_rounded,
          steps: isIOS
              ? const [
                  'Settings ilovasini oching',
                  'Privacy & Security → Location Services',
                  'Yuqoridagi togglni ON ga o\'tkazing',
                  '700Mobile ilovasiga qayting va qayta urinib ko\'ring',
                ]
              : const [
                  'Telefon status barini pastga torting',
                  'Location yoki GPS belgisini topib yoqing',
                  'Yoki Settings → Location → Use location ni ON qiling',
                  '700Mobile ilovasiga qayting va qayta urinib ko\'ring',
                ],
          primaryActionLabel: 'Joylashuv sozlamalari',
          canOpenSettings: true,
        );

      case GeoDenyReason.unsupported:
        return const _DialogContent(
          icon: Icons.error_outline_rounded,
          title: 'GPS signal topilmadi',
          subtitle:
              'Qurilma GPS signalini topa olmadi. Iltimos ochiq joyga chiqib qayta urining yoki manzilni qo\'lda kiriting.',
          banner:
              'Bino ichida yoki yer osti qatlamida GPS signal yetarli emas.',
          bannerIcon: Icons.signal_cellular_off_rounded,
          steps: [
            'Ochiq joyga chiqib qayta urinib ko\'ring',
            'WiFi va Mobile Data yoqilganligini tekshiring (assist uchun)',
            'Qurilma sozlamalarida GPS aniqligi yuqori (High accuracy) bo\'lsin',
            'Yoki manzilni qo\'lda kiritib davom eting',
          ],
          primaryActionLabel: 'Sozlamalarni ochish',
          canOpenSettings: false,
        );
    }
  }
}

class _DialogContent {
  final IconData icon;
  final String title;
  final String subtitle;
  final String? banner;
  final IconData? bannerIcon;
  final List<String> steps;
  final String primaryActionLabel;
  final bool canOpenSettings;

  const _DialogContent({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.banner,
    this.bannerIcon,
    required this.steps,
    required this.primaryActionLabel,
    required this.canOpenSettings,
  });
}
