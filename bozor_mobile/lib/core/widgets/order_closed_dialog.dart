import 'package:flutter/material.dart';
import '../i18n/language_extension.dart';
import '../network/order_window_service.dart';

/// Buyurtma yopiq vaqtda chiqadigan iliq, chiroyli eslatma dialogi.
/// Web'dagi OrderClosedModal bilan bir xil UX.
Future<void> showOrderClosedDialog(
  BuildContext context,
  OrderWindowStatus window,
) {
  final theme = Theme.of(context);
  final primary = theme.colorScheme.primary;

  return showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    builder: (ctx) => Dialog(
      backgroundColor: theme.colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: primary.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.schedule_rounded, size: 42, color: primary),
            ),
            const SizedBox(height: 16),
            Text(
              ctx.tr('orderWindow.title'),
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              ctx.tr('orderWindow.body', params: {
                'open': window.openTime,
                'close': window.closeTime,
              }),
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              decoration: BoxDecoration(
                color: primary.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.alarm_rounded, size: 18, color: primary),
                  const SizedBox(width: 6),
                  Text(
                    '${window.openTime} – ${window.closeTime}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: primary,
                      fontSize: 15,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 0,
                ),
                child: Text(
                  ctx.tr('orderWindow.gotIt'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
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
