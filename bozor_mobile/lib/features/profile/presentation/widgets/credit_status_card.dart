import 'package:flutter/material.dart';

import '../../../../core/i18n/language_extension.dart';
import '../../data/models/credit_status_model.dart';

/// Muddatli to'lov holati — kart usulida ko'rsatish.
///
/// FAQAT ustalar uchun (muddatli to'lov masters-only).
/// AuthBloc.isMaster gating qo'shimcha — repository fetch'ni boshqaradi.
///
/// 4 ta vizual state (CreditStatusState enum'iga mos):
///   • normal  → yashil "Sizga muddatli to'lov mavjud"
///   • active  → ko'k "Faol kredit — N kun qoldi"
///   • overdue → qizil "MUDDATI O'TGAN! Darhol to'lang"
///   • banned  → quyuq qizil "Muddatli to'lov bloklangan (3 marta overdue)"
class CreditStatusCard extends StatelessWidget {
  final CreditStatusModel status;
  final VoidCallback? onPayTap;

  const CreditStatusCard({
    super.key,
    required this.status,
    this.onPayTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final config = _configFor(context, theme, status);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: config.background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: config.borderColor, width: 1.5),
      ),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header: ikon + sarlavha ────────────────────────────────────
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: config.iconBg,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(
                  config.icon,
                  color: config.iconColor,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('credit.title').toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: config.subtleText,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      config.title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: config.primaryText,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // ── Tavsif matni ──────────────────────────────────────────────
          Text(
            config.description,
            style: theme.textTheme.bodySmall?.copyWith(
              color: config.primaryText.withValues(alpha: 0.85),
              height: 1.4,
            ),
          ),

          // ── Active/Overdue uchun qo'shimcha ma'lumotlar ───────────────
          if (status.state == CreditStatusState.active ||
              status.state == CreditStatusState.overdue) ...[
            const SizedBox(height: 12),
            _detailRow(theme, config, status),
          ],

          // ── Banned holat: overdue count chips ─────────────────────────
          if (status.state == CreditStatusState.banned) ...[
            const SizedBox(height: 12),
            _overdueCountChip(theme, status.overdueCreditCount, config),
          ],

          // ── To'lash tugmasi (faqat active/overdue) ────────────────────
          if (onPayTap != null &&
              (status.state == CreditStatusState.active ||
                  status.state == CreditStatusState.overdue)) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onPayTap,
                style: FilledButton.styleFrom(
                  backgroundColor: config.buttonBg,
                  foregroundColor: config.buttonText,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: const Icon(Icons.payments_rounded, size: 18),
                label: const Text(
                  "Buyurtmani ko'rish",
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── State'ga qarab config qaytarish ─────────────────────────────────────

  _CardConfig _configFor(BuildContext context, ThemeData theme, CreditStatusModel s) {
    switch (s.state) {
      case CreditStatusState.banned:
        return _CardConfig(
          background: const Color(0xFFFEE2E2),
          borderColor: const Color(0xFFEF4444),
          iconBg: const Color(0xFFEF4444),
          iconColor: Colors.white,
          icon: Icons.block_rounded,
          title: context.tr('credit.banned'),
          description: context.tr('credit.bannedDescription'),
          primaryText: const Color(0xFF7F1D1D),
          subtleText: const Color(0xFFB91C1C),
          buttonBg: const Color(0xFF7F1D1D),
          buttonText: Colors.white,
        );

      case CreditStatusState.overdue:
        return _CardConfig(
          background: const Color(0xFFFEE2E2),
          borderColor: const Color(0xFFEF4444),
          iconBg: const Color(0xFFEF4444),
          iconColor: Colors.white,
          icon: Icons.warning_amber_rounded,
          title: context.tr('credit.overdue'),
          description: context.tr('credit.overdueDescription'),
          primaryText: const Color(0xFF7F1D1D),
          subtleText: const Color(0xFFB91C1C),
          buttonBg: const Color(0xFFEF4444),
          buttonText: Colors.white,
        );

      case CreditStatusState.active:
        return _CardConfig(
          background: const Color(0xFFFEF3C7),
          borderColor: const Color(0xFFF59E0B),
          iconBg: const Color(0xFFF59E0B),
          iconColor: Colors.white,
          icon: Icons.access_time_filled_rounded,
          title: context.tr('credit.active'),
          description: context.tr('credit.activeDescription'),
          primaryText: const Color(0xFF78350F),
          subtleText: const Color(0xFFB45309),
          buttonBg: const Color(0xFFF59E0B),
          buttonText: Colors.white,
        );

      case CreditStatusState.normal:
        return _CardConfig(
          background: theme.colorScheme.primaryContainer
              .withValues(alpha: 0.35),
          borderColor: theme.colorScheme.primary.withValues(alpha: 0.3),
          iconBg: theme.colorScheme.primary,
          iconColor: Colors.white,
          icon: Icons.verified_rounded,
          title: context.tr('credit.available'),
          description: context.tr('credit.availableDescription'),
          primaryText: theme.colorScheme.onPrimaryContainer,
          subtleText: theme.colorScheme.primary,
          buttonBg: theme.colorScheme.primary,
          buttonText: theme.colorScheme.onPrimary,
        );
    }
  }

  // ── Detail row: faol/overdue kredit haqida ─────────────────────────────

  Widget _detailRow(
    ThemeData theme,
    _CardConfig config,
    CreditStatusModel s,
  ) {
    final days = s.daysUntilDue;
    final dueDateStr = s.unpaidCreditDueDate != null
        ? _formatDate(s.unpaidCreditDueDate!)
        : "—";

    String daysText;
    if (days == null) {
      daysText = "—";
    } else if (days < 0) {
      daysText = "${days.abs()} kun o'tgan";
    } else if (days == 0) {
      daysText = "Bugun!";
    } else if (days == 1) {
      daysText = "Ertaga";
    } else {
      daysText = "$days kun qoldi";
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: _detailColumn(
              theme,
              "Buyurtma",
              "№${s.unpaidCreditOrderId ?? '—'}",
              config.primaryText,
            ),
          ),
          Container(
            width: 1,
            height: 30,
            color: config.primaryText.withValues(alpha: 0.2),
          ),
          Expanded(
            child: _detailColumn(
              theme,
              "Muddat",
              dueDateStr,
              config.primaryText,
            ),
          ),
          Container(
            width: 1,
            height: 30,
            color: config.primaryText.withValues(alpha: 0.2),
          ),
          Expanded(
            child: _detailColumn(
              theme,
              "Qoldi",
              daysText,
              config.primaryText,
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailColumn(
      ThemeData theme, String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: color.withValues(alpha: 0.7),
            fontWeight: FontWeight.w600,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: color,
            fontWeight: FontWeight.w800,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  // ── Banned holat uchun overdue count ──────────────────────────────────

  Widget _overdueCountChip(
      ThemeData theme, int count, _CardConfig config) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(
            Icons.error_outline_rounded,
            size: 16,
            color: config.iconBg,
          ),
          const SizedBox(width: 8),
          Text(
            "Jami muddati o'tgan: ",
            style: theme.textTheme.labelSmall?.copyWith(
              color: config.primaryText.withValues(alpha: 0.85),
            ),
          ),
          Text(
            "$count marta",
            style: theme.textTheme.labelMedium?.copyWith(
              color: config.primaryText,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime d) {
    return "${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}";
  }
}

class _CardConfig {
  final Color background;
  final Color borderColor;
  final Color iconBg;
  final Color iconColor;
  final IconData icon;
  final String title;
  final String description;
  final Color primaryText;
  final Color subtleText;
  final Color buttonBg;
  final Color buttonText;

  _CardConfig({
    required this.background,
    required this.borderColor,
    required this.iconBg,
    required this.iconColor,
    required this.icon,
    required this.title,
    required this.description,
    required this.primaryText,
    required this.subtleText,
    required this.buttonBg,
    required this.buttonText,
  });
}
