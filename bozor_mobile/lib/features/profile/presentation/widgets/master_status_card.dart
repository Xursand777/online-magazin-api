import 'package:flutter/material.dart';

import '../../../../core/i18n/language_extension.dart';
import '../../data/models/master_status_model.dart';

/// Usta statusi — premium gradient hero card.
///
/// Faqat `MasterStatusModel.isMaster == true` bo'lganda ko'rsatiladi.
///
/// Ko'rsatiladigan ma'lumotlar:
///   • Effective % (eng katta — markazda)
///   • Daraja (level/max_level) — bar bilan
///   • Bazaviy % (kichikroq, izoh)
///   • Oxirgi xariddan o'tgan kunlar (badge)
///
/// Status holatlari:
///   • effective_percent == base_percent  → "TO'LIQ CHEGIRMA" (yashil)
///   • effective_percent < base_percent   → "KAMAYTIRILGAN" (sariq)
///   • effective_percent == 0 (long inactive) → "FAOLSIZ" (kulrang)
class MasterStatusCard extends StatelessWidget {
  final MasterStatusModel status;

  const MasterStatusCard({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Status holati
    final isFull = status.isAtFullDiscount;
    final isInactive = status.isInactiveLong;
    final hasNeverPurchased = status.hasNeverPurchased;

    // Gradient ranglar — premium feel uchun
    final gradientColors = isInactive
        ? [
            theme.colorScheme.surfaceContainerHigh,
            theme.colorScheme.surfaceContainerHighest,
          ]
        : [
            theme.colorScheme.primary,
            theme.colorScheme.primary.withValues(alpha: 0.8),
          ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: gradientColors,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.primary.withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header: Crown + "USTA" badge + status pill ────────────────
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.workspace_premium_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('master.title').toUpperCase(),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      "${context.tr('master.level')} ${status.level}/${status.maxLevel}",
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                _statusPill(context, theme, isFull, isInactive, hasNeverPurchased),
              ],
            ),
            const SizedBox(height: 16),

            // ── Daraja progress bar ────────────────────────────────────────
            // Eslatma: "imtiyoz kuchi %" va "optom + ustama%" matnlari ATAYIN
            // olib tashlandi — ichki narx mantig'i mijozga oshkor qilinmaydi.
            // Faqat faollik pog'onasi va sarlavha qoladi.
            _levelProgressBar(theme, status.level, status.maxLevel),
            const SizedBox(height: 12),

            // ── Pastki info: oxirgi xarid + daraja oshirish maslahati ─────
            _bottomInfoRow(context, theme, status, hasNeverPurchased, isInactive),
          ],
        ),
      ),
    );
  }

  // ── Status pill (yuqori o'ng) ─────────────────────────────────────────

  Widget _statusPill(
    BuildContext context,
    ThemeData theme,
    bool isFull,
    bool isInactive,
    bool hasNeverPurchased,
  ) {
    String text;
    Color bg;
    IconData icon;

    if (hasNeverPurchased) {
      text = context.tr('master.statusNew');
      bg = Colors.blue.withValues(alpha: 0.85);
      icon = Icons.fiber_new_rounded;
    } else if (isInactive) {
      text = context.tr('master.statusInactive');
      bg = Colors.orange.withValues(alpha: 0.85);
      icon = Icons.bedtime_rounded;
    } else if (isFull) {
      text = context.tr('master.statusFull');
      bg = Colors.green.withValues(alpha: 0.9);
      icon = Icons.check_circle_rounded;
    } else {
      text = context.tr('master.statusReduced');
      bg = Colors.amber.withValues(alpha: 0.85);
      icon = Icons.trending_down_rounded;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            text,
            style: theme.textTheme.labelSmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }

  // ── Daraja progress bar (level / max_level) ───────────────────────────

  Widget _levelProgressBar(ThemeData theme, int level, int maxLevel) {
    final safeMax = maxLevel <= 0 ? 1 : maxLevel;
    return Row(
      children: List.generate(safeMax, (i) {
        final filled = i < level;
        return Expanded(
          child: Container(
            margin: EdgeInsets.only(right: i < safeMax - 1 ? 6 : 0),
            height: 6,
            decoration: BoxDecoration(
              color: filled
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
        );
      }),
    );
  }

  // ── Pastki info qator ─────────────────────────────────────────────────

  Widget _bottomInfoRow(
    BuildContext context,
    ThemeData theme,
    MasterStatusModel s,
    bool hasNeverPurchased,
    bool isInactive,
  ) {
    String text;
    IconData icon;

    if (hasNeverPurchased) {
      text = context.tr('master.firstPurchaseHint');
      icon = Icons.shopping_bag_outlined;
    } else if (s.daysSinceLastPurchase != null) {
      final days = s.daysSinceLastPurchase!;
      if (days == 0) {
        text = context.tr('master.todayPurchase');
      } else if (days < 30) {
        text = context.tr('master.daysAgo', params: {'days': days});
      } else {
        text = context.tr('master.longInactive', params: {'days': days});
      }
      icon = isInactive
          ? Icons.access_time_filled_rounded
          : Icons.history_rounded;
    } else {
      text = context.tr('master.firstPurchaseHint');
      icon = Icons.history_rounded;
    }

    return Row(
      children: [
        Icon(
          icon,
          size: 14,
          color: Colors.white.withValues(alpha: 0.85),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white.withValues(alpha: 0.9),
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}
