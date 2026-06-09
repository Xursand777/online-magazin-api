import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

/// Login talab qilinadigan modal bottom sheet — Amazon/Wildberries uslubi.
///
/// Foydalanuvchi mehmon sifatida amal qilmoqchi bo'lganda ko'rsatiladi:
///   • Cart "Rasmiylashtirish" tugmasi
///   • ProductDetail "Tezkor xarid" tugmasi
///   • Boshqa login-only amallar
///
/// Foydalanuvchi tasdiqlasa → /auth sahifasiga o'tadi (optional ?redirect=).
/// Bekor qilsa → modal yopiladi, foydalanuvchi joriy sahifada qoladi.
///
/// FOYDALANISH:
///   await showLoginRequiredSheet(
///     context,
///     title: "Buyurtmani rasmiylashtirish uchun",
///     subtitle: "Tizimga kiring va savatdagi mahsulotlarni xarid qiling",
///     redirectTo: '/cart', // optional — login bo'lgach shu sahifaga qaytadi
///   );
Future<void> showLoginRequiredSheet(
  BuildContext context, {
  required String title,
  required String subtitle,
  String? redirectTo,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.5),
    builder: (sheetCtx) => _LoginRequiredSheetContent(
      title: title,
      subtitle: subtitle,
      redirectTo: redirectTo,
    ),
  );
}

class _LoginRequiredSheetContent extends StatelessWidget {
  final String title;
  final String subtitle;
  final String? redirectTo;

  const _LoginRequiredSheetContent({
    required this.title,
    required this.subtitle,
    this.redirectTo,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 24),
              // Icon — circular container
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: theme.colorScheme.primaryContainer
                      .withValues(alpha: 0.4),
                ),
                child: Icon(
                  Icons.lock_outline_rounded,
                  size: 36,
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(height: 20),
              // Title
              Text(
                title,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              // Subtitle
              Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              // Primary action — Kirish
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton.icon(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    Navigator.of(context).pop();
                    final path = redirectTo != null
                        ? '/auth?redirect=${Uri.encodeQueryComponent(redirectTo!)}'
                        : '/auth';
                    context.push(path);
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    foregroundColor: theme.colorScheme.onPrimary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  icon: const Icon(Icons.login_rounded, size: 20),
                  label: const Text(
                    "Tizimga kirish",
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              // Secondary — Bekor qilish
              SizedBox(
                width: double.infinity,
                height: 48,
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    "Hozir emas",
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              // Friendly hint
              Text(
                "Telefon raqamingiz orqali bir necha soniyada kiring",
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.outline,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
