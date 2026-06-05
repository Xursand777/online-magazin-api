import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../data/models/admin_kassa_model.dart';
import '../bloc/admin_kassa_bloc.dart';
import '../widgets/admin_drawer.dart';

class AdminKassaPage extends StatelessWidget {
  const AdminKassaPage({super.key});

  static const Color _brandDark = Color(0xFF063F2B);
  static const Color _brand = Color(0xFF0A7C55);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: _brandDark,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Moliya va Kassa',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Yangilash',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => context.read<AdminKassaBloc>().add(LoadKassaData()),
          ),
        ],
      ),
      body: BlocConsumer<AdminKassaBloc, AdminKassaState>(
        listener: (context, state) {
          if (state.withdrawSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Muvaffaqiyatli yechildi!'), backgroundColor: Colors.green),
            );
          }
          if (state.withdrawError != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.withdrawError!), backgroundColor: Colors.red),
            );
          }
        },
        builder: (context, state) {
          if (state.isLoading && state.data == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.error != null && state.data == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(state.error!, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => context.read<AdminKassaBloc>().add(LoadKassaData()),
                    child: const Text('Qayta urinish'),
                  ),
                ],
              ),
            );
          }

          final data = state.data;
          if (data == null) {
            return const Center(child: CircularProgressIndicator());
          }

          return RefreshIndicator(
            color: _brand,
            onRefresh: () async {
              final bloc = context.read<AdminKassaBloc>();
              bloc.add(LoadKassaData());
              await bloc.stream.firstWhere((s) => !s.isLoading, orElse: () => bloc.state);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: [
                _KpiGrid(data: data),
                const SizedBox(height: 20),
                _PaymentBreakdown(breakdown: data.paymentBreakdown, totalIncome: data.totalIncome),
                if (data.weeklyChart.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle('Haftalik tushum (oxirgi 7 kun)'),
                  const SizedBox(height: 12),
                  _WeeklyChart(points: data.weeklyChart),
                ],
                const SizedBox(height: 24),
                _SectionTitle('Chiqimlar Tarixi (Ledger)'),
                const SizedBox(height: 12),
                _HistoryList(history: data.history),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showWithdrawSheet(context),
        backgroundColor: Colors.red,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.money_off),
        label: const Text('Pul yechish', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }

  void _showWithdrawSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: context.read<AdminKassaBloc>(),
        child: const _WithdrawSheet(),
      ),
    );
  }
}

// ─── KPI qutilari ────────────────────────────────────────────────────────────
class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.data});
  final AdminKassaModel data;

  String _fmt(double v) {
    final f = NumberFormat('#,###', 'uz_UZ');
    return f.format(v).replaceAll(',', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _KpiCard(
                label: 'BARCHA TUSHUMLAR',
                value: '${_fmt(data.totalIncome)} so\'m',
                icon: Icons.payments,
                color: const Color(0xFF22C55E),
                theme: theme,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _KpiCard(
                label: 'JAMI CHIQIMLAR',
                value: '${_fmt(data.totalExpense)} so\'m',
                icon: Icons.money_off,
                color: theme.colorScheme.error,
                theme: theme,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          decoration: BoxDecoration(
            color: const Color(0xFF0A7C55).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF0A7C55).withValues(alpha: 0.3), width: 2),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF0A7C55),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.account_balance_wallet, color: Colors.white, size: 32),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('KASSADAGI QOLDIQ', style: theme.textTheme.labelSmall?.copyWith(color: const Color(0xFF0A7C55), fontWeight: FontWeight.bold, letterSpacing: 1.1)),
                    const SizedBox(height: 4),
                    Text(
                      '${_fmt(data.balance)} so\'m',
                      style: theme.textTheme.headlineSmall?.copyWith(color: theme.colorScheme.onSurface, fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.theme,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                child: Icon(icon, color: color, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(label, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(value, style: theme.textTheme.titleMedium?.copyWith(color: color, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

// ─── To'lov usullari ulushi ──────────────────────────────────────────────────
class _PaymentBreakdown extends StatelessWidget {
  const _PaymentBreakdown({required this.breakdown, required this.totalIncome});
  final AdminKassaPaymentBreakdown breakdown;
  final double totalIncome;

  String _fmt(double v) {
    final f = NumberFormat('#,###', 'uz_UZ');
    return f.format(v).replaceAll(',', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = [
      {'label': 'Naqd pul', 'icon': Icons.payments, 'val': breakdown.cash, 'color': const Color(0xFF22C55E)},
      {'label': 'Plastik karta', 'icon': Icons.credit_card, 'val': breakdown.card, 'color': const Color(0xFF0A7C55)},
      {'label': 'Nasiya', 'icon': Icons.calendar_month, 'val': breakdown.credit, 'color': const Color(0xFFF59E0B)},
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.pie_chart, color: const Color(0xFF0A7C55), size: 20),
              const SizedBox(width: 8),
              Text('To\'lov usullari bo\'yicha tushum', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 16),
          ...items.map((item) {
            final val = item['val'] as double;
            final pct = totalIncome > 0 ? (val / totalIncome).clamp(0.0, 1.0) : 0.0;
            final pctStr = (pct * 100).round().toString();
            final color = item['color'] as Color;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                        child: Icon(item['icon'] as IconData, color: color, size: 16),
                      ),
                      const SizedBox(width: 8),
                      Text(item['label'] as String, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
                      const Spacer(),
                      Text('${_fmt(val)} so\'m', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold, color: color)),
                      const SizedBox(width: 4),
                      Text('($pctStr%)', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: pct,
                      backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      color: color,
                      minHeight: 6,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ─── Haftalik chart ────────────────────────────────────────────────────────────
class _WeeklyChart extends StatelessWidget {
  const _WeeklyChart({required this.points});
  final List<AdminKassaChartItem> points;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxIncome = points.fold<double>(0, (m, p) => p.income > m ? p.income : m);
    
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: SizedBox(
        height: 160,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: points.map((p) {
            final ratio = maxIncome <= 0 ? 0.0 : p.income / maxIncome;
            final isZero = p.income <= 0;
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (!isZero)
                      Text(
                        '${(p.income / 1000000).toStringAsFixed(1)}M',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: const Color(0xFF0A7C55),
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    const SizedBox(height: 4),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 400),
                      height: 4 + ratio * 96,
                      decoration: BoxDecoration(
                        color: isZero ? theme.colorScheme.outlineVariant.withValues(alpha: 0.4) : const Color(0xFF0A7C55),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _dayShort(p.date),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontSize: 9,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  String _dayShort(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    const days = ['Yak', 'Du', 'Se', 'Ch', 'Pa', 'Sh', 'Ya'];
    return days[d.weekday % 7];
  }
}

// ─── Chiqimlar tarixi ro'yxati ───────────────────────────────────────────────
class _HistoryList extends StatelessWidget {
  const _HistoryList({required this.history});
  final List<AdminKassaHistoryItem> history;

  String _fmt(double v) {
    final f = NumberFormat('#,###', 'uz_UZ');
    return f.format(v).replaceAll(',', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (history.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: const Center(
          child: Column(
            children: [
              Icon(Icons.receipt_long, size: 48, color: Colors.grey),
              SizedBox(height: 8),
              Text('Hozircha hech qanday pul yechilmagan'),
            ],
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: history.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final item = history[i];
          final dt = DateTime.tryParse(item.createdAt);
          final dateStr = dt != null ? DateFormat('dd.MM.yyyy HH:mm').format(dt) : item.createdAt;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.arrow_downward, color: Colors.red, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.reason, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.person, size: 14, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(item.adminName, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                          const SizedBox(width: 12),
                          Icon(Icons.access_time, size: 14, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 4),
                          Text(dateStr, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  '-${_fmt(item.amount)}',
                  style: theme.textTheme.titleMedium?.copyWith(color: Colors.red, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ─── Bo'lim sarlavhasi ───────────────────────────────────────────────────────
class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      title,
      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
    );
  }
}

// ─── Pul yechish formasi (BottomSheet) ─────────────────────────────────────────
class _WithdrawSheet extends StatefulWidget {
  const _WithdrawSheet();

  @override
  State<_WithdrawSheet> createState() => _WithdrawSheetState();
}

class _WithdrawSheetState extends State<_WithdrawSheet> {
  final _amountCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();

  @override
  void dispose() {
    _amountCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final amt = double.tryParse(_amountCtrl.text.replaceAll(' ', '')) ?? 0.0;
    final r = _reasonCtrl.text.trim();
    if (amt <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('To\'g\'ri summa kiriting')));
      return;
    }
    if (r.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Maqsadni kiriting')));
      return;
    }
    context.read<AdminKassaBloc>().add(WithdrawKassaEvent(amount: amt, reason: r));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = context.read<AdminKassaBloc>().state.data;
    
    String _fmt(double v) {
      final f = NumberFormat('#,###', 'uz_UZ');
      return f.format(v).replaceAll(',', ' ');
    }

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        top: 24,
        left: 20,
        right: 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.money_off, color: Colors.red, size: 28),
              const SizedBox(width: 12),
              Text('Pul yechish', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Kassadagi qoldiq:'),
                Text('${_fmt(data?.balance ?? 0)} so\'m', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0A7C55))),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('Yechiladigan summa (so\'m)', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          TextField(
            controller: _amountCtrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              hintText: '100 000',
              filled: true,
              fillColor: theme.colorScheme.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Maqsad / Izoh', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          TextField(
            controller: _reasonCtrl,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Kuryerga to\'lov...',
              filled: true,
              fillColor: theme.colorScheme.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Colors.red,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _submit,
              child: const Text('Tasdiqlash', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }
}
