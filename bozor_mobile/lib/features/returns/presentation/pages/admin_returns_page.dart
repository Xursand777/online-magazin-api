// Phase 3.6: Mobil admin Qaytarishlar sahifasi (web ReturnsTab.tsx ekvivalenti).
// - KPI panel (4 mini-card)
// - Status filter + faqat-faollar toggle
// - Ro'yxat (chiroyli card'lar)
// - Detail page'ga navigatsiya

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../../admin/presentation/widgets/admin_drawer.dart';
import '../../data/models/order_return_model.dart';
import '../../data/repositories/returns_repository.dart';
import '../cubit/admin_returns_cubit.dart';
import 'admin_return_detail_page.dart';
import 'create_return_page.dart';

class AdminReturnsPage extends StatelessWidget {
  const AdminReturnsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => AdminReturnsCubit(sl<ReturnsRepository>())..load(),
      child: const _AdminReturnsView(),
    );
  }
}

class _AdminReturnsView extends StatelessWidget {
  const _AdminReturnsView();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: const Color(0xFF063F2B),
        foregroundColor: Colors.white,
        title: const Text('Qaytarishlar',
            style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => const CreateReturnPage(initiator: 'admin'),
            ),
          );
          if (created == true && context.mounted) {
            context.read<AdminReturnsCubit>().load();
          }
        },
        backgroundColor: const Color(0xFF0A7C55),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text("Yangi qaytarish",
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      body: BlocBuilder<AdminReturnsCubit, AdminReturnsState>(
        builder: (context, state) {
          return RefreshIndicator(
            onRefresh: () => context.read<AdminReturnsCubit>().load(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
              children: [
                if (state.stats != null) _KpiPanel(stats: state.stats!),
                const SizedBox(height: 12),
                _FilterBar(state: state),
                const SizedBox(height: 12),
                if (state.isLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 32),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (state.error != null)
                  _ErrorBox(message: state.error!)
                else if (state.items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    child: Center(
                      child: Text(
                        'Qaytarishlar topilmadi.',
                        style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ),
                  )
                else
                  ...state.items.map((r) => _ReturnCard(item: r)),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _KpiPanel extends StatelessWidget {
  const _KpiPanel({required this.stats});
  final ReturnsStats stats;

  String _topReason() {
    if (stats.byReason.isEmpty) return '—';
    final top = stats.byReason.first;
    final code = top['reason_code'] as String? ?? '';
    return ReturnLabels.reason[code] ?? code;
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,###', 'uz_UZ');
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _KpiTile(
          width: _w(context, 2),
          label: 'Jami',
          value: '${stats.totalReturns}',
          color: const Color(0xFF0A7C55),
        ),
        _KpiTile(
          width: _w(context, 2),
          label: 'Muvaffaqiyatli',
          value: '${stats.successCount}',
          color: const Color(0xFF10B981),
        ),
        _KpiTile(
          width: _w(context, 2),
          label: 'Qaytarilgan',
          value: "${fmt.format(stats.totalRefundedAmount).replaceAll(',', ' ')} so'm",
          color: const Color(0xFF0284C7),
        ),
        _KpiTile(
          width: _w(context, 2),
          label: 'Top sabab',
          value: _topReason(),
          color: const Color(0xFFD97706),
        ),
      ],
    );
  }

  double _w(BuildContext c, int per) =>
      (MediaQuery.of(c).size.width - 12 * 2 - (per - 1) * 8) / per;
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.width,
    required this.label,
    required this.value,
    required this.color,
  });
  final double width;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: width,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 10, 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: color, width: 4)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurfaceVariant,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.state});
  final AdminReturnsState state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cubit = context.read<AdminReturnsCubit>();
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Text('Status:',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurfaceVariant,
              )),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButton<String>(
              isExpanded: true,
              underline: const SizedBox(),
              value: state.statusFilter.isEmpty ? null : state.statusFilter,
              hint: const Text('Barchasi'),
              items: [
                const DropdownMenuItem(value: '', child: Text('Barchasi')),
                ...ReturnLabels.status.entries.map(
                  (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                ),
              ],
              onChanged: (v) => cubit.setStatusFilter(v ?? ''),
            ),
          ),
          if (state.statusFilter.isEmpty)
            Row(
              children: [
                const SizedBox(width: 6),
                Checkbox(
                  value: state.activeOnly,
                  onChanged: (v) => cubit.setActiveOnly(v ?? true),
                  visualDensity: VisualDensity.compact,
                ),
                const Text('Faollar', style: TextStyle(fontSize: 12)),
              ],
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _ReturnCard extends StatelessWidget {
  const _ReturnCard({required this.item});
  final OrderReturn item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final statusColor = Color(ReturnLabels.statusBgColor(item.status));
    final reason = ReturnLabels.reason[item.reasonCode] ?? item.reasonCode;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          final changed = await Navigator.of(context).push<bool>(
            MaterialPageRoute(
              builder: (_) => AdminReturnDetailPage(returnId: item.id),
            ),
          );
          if (changed == true && context.mounted) {
            context.read<AdminReturnsCubit>().load();
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.returnNumber,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0A7C55),
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      ReturnLabels.status[item.status] ?? item.status,
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text('Buyurtma #${item.orderId}  ·  $reason',
                  style: TextStyle(
                      color: theme.colorScheme.onSurfaceVariant, fontSize: 12)),
              const SizedBox(height: 6),
              Row(
                children: [
                  Text(
                    "${fmt.format(double.tryParse(item.refundAmount) ?? 0).replaceAll(',', ' ')} so'm",
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '· ${item.items.fold<int>(0, (s, i) => s + i.quantity)} ta tovar',
                    style: TextStyle(
                        color: theme.colorScheme.onSurfaceVariant, fontSize: 12),
                  ),
                  const Spacer(),
                  Text(
                    _shortDate(item.createdAt),
                    style: TextStyle(
                        color: theme.colorScheme.onSurfaceVariant, fontSize: 11),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _shortDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return DateFormat('dd.MM.yyyy').format(d);
    } catch (_) {
      return iso;
    }
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          const Icon(Icons.error_outline_rounded,
              color: Color(0xFFEF4444), size: 36),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
          ),
          TextButton(
            onPressed: () => context.read<AdminReturnsCubit>().load(),
            child: const Text('Qayta urinish'),
          ),
        ],
      ),
    );
  }
}
