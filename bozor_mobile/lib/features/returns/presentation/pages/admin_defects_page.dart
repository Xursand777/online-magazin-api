// Admin Defektlar sahifasi (mobil) — web DefectsTab.tsx ekvivalenti.
// Sotuvga yaroqsiz (writeoff) buyumlar: KPI kartalar + filter + chiroyli ro'yxat.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../../core/di/injection_container.dart';
import '../../../admin/presentation/widgets/admin_drawer.dart';
import '../../data/models/defect_model.dart';
import '../../data/repositories/returns_repository.dart';
import '../cubit/admin_defects_cubit.dart';

class AdminDefectsPage extends StatelessWidget {
  const AdminDefectsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminDefectsCubit(sl<ReturnsRepository>())..load(),
      child: const _DefectsView(),
    );
  }
}

class _DefectsView extends StatelessWidget {
  const _DefectsView();

  static const List<(String, String)> _filters = [
    ('', 'Hammasi'),
    ('defective', 'Aybli'),
    ('used_damaged', 'Zararlangan'),
    ('used_open', 'Ochilgan'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Defektlar')),
      drawer: const AdminDrawer(),
      body: BlocBuilder<AdminDefectsCubit, AdminDefectsState>(
        builder: (context, state) {
          final cubit = context.read<AdminDefectsCubit>();
          return RefreshIndicator(
            onRefresh: cubit.load,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    const Icon(Icons.dangerous_rounded,
                        color: Color(0xFFEF4444), size: 26),
                    const SizedBox(width: 8),
                    Text('Defektlar',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Sotuvga yaroqsiz (defekt / buzilgan) buyumlar. Stokka '
                  'qaytmagan va saytga qayta chiqmaydi.',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 16),
                _StatsRow(stats: state.stats),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _filters.map((f) {
                    final sel = state.conditionFilter == f.$1;
                    return ChoiceChip(
                      label: Text(f.$2),
                      selected: sel,
                      onSelected: (_) => cubit.setConditionFilter(f.$1),
                      selectedColor: const Color(0xFF0A7C55),
                      labelStyle: TextStyle(
                          color: sel ? Colors.white : null,
                          fontWeight: FontWeight.w600),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                if (state.isLoading)
                  const Padding(
                    padding: EdgeInsets.all(48),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (state.error != null)
                  _ErrorBox(state.error!)
                else if (state.items.isEmpty)
                  const _EmptyBox()
                else
                  ...state.items.map((it) => _DefectCard(item: it)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({this.stats});
  final DefectStats? stats;

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final loss = double.tryParse(stats?.totalLoss ?? '0') ?? 0;
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            icon: Icons.dangerous_rounded,
            value: '${stats?.totalRecords ?? 0}',
            label: 'Defekt yozuvlar',
            color: const Color(0xFFEF4444),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatCard(
            icon: Icons.inventory_2_rounded,
            value: '${stats?.totalItems ?? 0}',
            label: 'Buyumlar (dona)',
            color: const Color(0xFFF59E0B),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatCard(
            icon: Icons.payments_rounded,
            value: "${fmt.format(loss).replaceAll(',', ' ')} so'm",
            label: 'Jami zarar',
            color: const Color(0xFFEF4444),
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });
  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: color.withValues(alpha: 0.15),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(height: 8),
          Text(value,
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          Text(label,
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _DefectCard extends StatelessWidget {
  const _DefectCard({required this.item});
  final DefectItem item;

  Color _badgeColor() {
    switch (item.condition) {
      case 'defective':
        return const Color(0xFFEF4444);
      case 'used_damaged':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF6B7280);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final price = double.tryParse(item.refundUnitPrice) ?? 0;
    final badge = _badgeColor();
    final chips = <(IconData, String)>[
      if (item.model != null && item.model!.isNotEmpty)
        (Icons.memory, item.model!),
      if (item.quality != null && item.quality!.isNotEmpty)
        (Icons.grade, item.quality!),
      if (item.color != null && item.color!.isNotEmpty)
        (Icons.palette, item.color!),
      if (item.size != null && item.size!.isNotEmpty)
        (Icons.straighten, item.size!),
    ];

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Rasm
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 56,
              height: 56,
              child: item.image != null
                  ? Image.network(item.image!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _imgPlaceholder(theme))
                  : _imgPlaceholder(theme),
            ),
          ),
          const SizedBox(width: 12),
          // Ma'lumot
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.productName,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                if (chips.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: chips
                        .map((c) => _Chip(icon: c.$1, text: c.$2))
                        .toList(),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  "${item.returnNumber}  ·  Buyurtma #${item.orderId ?? '—'}",
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Sabab + miqdor + narx
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: badge.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(item.conditionDisplay,
                    style: TextStyle(
                        color: badge,
                        fontWeight: FontWeight.bold,
                        fontSize: 11)),
              ),
              const SizedBox(height: 6),
              Text('${item.quantity} dona',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              Text("${fmt.format(price).replaceAll(',', ' ')} so'm",
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _imgPlaceholder(ThemeData theme) => Container(
        color: theme.colorScheme.surfaceContainerHighest,
        child: Icon(Icons.image_not_supported_outlined,
            color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4)),
      );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 3),
          Text(text,
              style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _EmptyBox extends StatelessWidget {
  const _EmptyBox();
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 56),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: theme.colorScheme.outlineVariant,
            style: BorderStyle.solid),
      ),
      child: Column(
        children: [
          Icon(Icons.check_circle_outline,
              size: 48,
              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4)),
          const SizedBox(height: 12),
          Text("Defekt mahsulotlar yo'q",
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.message);
  final String message;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: theme.colorScheme.error),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}
