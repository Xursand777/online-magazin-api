import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// "To'lov usullari" — professional modal bottom sheet.
///
/// Foydalanuvchiga mavjud va rejalashtirilgan to'lov usullarini ko'rsatadi:
///   • Naqd pul — hozirda mavjud
///   • Online to'lov (Payme) — tez orada
///   • Muddatli to'lov — faqat ustalar uchun (kelishilgan muddatgacha 100%)
Future<void> showPaymentMethodsSheet(BuildContext context) {
  HapticFeedback.lightImpact();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.5),
    builder: (_) => const _PaymentMethodsContent(),
  );
}

class _PaymentMethodsContent extends StatelessWidget {
  const _PaymentMethodsContent();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const green = Color(0xFF0A7C55);
    const amber = Color(0xFFD97706);
    const purple = Color(0xFF7C3AED);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              Row(
                children: [
                  Icon(Icons.credit_card_rounded, color: green, size: 26),
                  const SizedBox(width: 10),
                  Text(
                    "To'lov usullari",
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                "Hozirda mavjud va tez orada qo'shiladigan to'lov turlari",
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 18),

              // 1) Naqd pul — mavjud
              _PaymentTile(
                icon: Icons.payments_rounded,
                accent: green,
                title: 'Naqd pul',
                subtitle:
                    "Buyurtmani qabul qilishda kuryerga naqd pul to'laysiz.",
                badgeText: 'MAVJUD',
              ),
              const SizedBox(height: 12),

              // 2) Online to'lov (Payme) — tez orada
              _PaymentTile(
                icon: Icons.account_balance_wallet_rounded,
                accent: amber,
                title: 'Online to\'lov — Payme',
                subtitle:
                    "Payme orqali xavfsiz onlayn to'lov imkoniyati tez orada qo'shiladi.",
                badgeText: 'TEZ ORADA',
              ),
              const SizedBox(height: 12),

              // 3) Muddatli to'lov — faqat ustalar
              _PaymentTile(
                icon: Icons.schedule_send_rounded,
                accent: purple,
                title: "Muddatli to'lov",
                subtitle:
                    "Faqat ustalar uchun. Kelishilgan muddatgacha to'lovni 100% to'lash sharti bilan.",
                badgeText: 'USTALAR UCHUN',
              ),
              const SizedBox(height: 22),

              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: FilledButton.styleFrom(
                    backgroundColor: green,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: const Text(
                    'Tushunarli',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
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

class _PaymentTile extends StatelessWidget {
  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final String badgeText;

  const _PaymentTile({
    required this.icon,
    required this.accent,
    required this.title,
    required this.subtitle,
    required this.badgeText,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: accent, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        badgeText,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: accent,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.4,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
