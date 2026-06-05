import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/admin_dashboard_model.dart';
import '../../data/models/order_status_helper.dart';
import '../bloc/admin_dashboard_bloc.dart';
import '../widgets/admin_drawer.dart';

/// Dashboard — saytdagi `DashboardTab` bilan bir xil ko'rsatkichlar.
/// Ma'lumotlar `/api/orders/admin/dashboard/` orqali olinadi.
class AdminDashboardPage extends StatelessWidget {
  const AdminDashboardPage({super.key});

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
          'Dashboard',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Yangilash',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () =>
                context.read<AdminDashboardBloc>().add(const RefreshDashboard()),
          ),
        ],
      ),
      body: BlocBuilder<AdminDashboardBloc, AdminDashboardState>(
        builder: (context, state) {
          if (state.status == DashboardStatus.loading && state.data == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.status == DashboardStatus.failure && state.data == null) {
            return _ErrorView(
              message: state.error ?? 'Xatolik yuz berdi',
              onRetry: () =>
                  context.read<AdminDashboardBloc>().add(const LoadDashboard()),
            );
          }
          final data = state.data;
          if (data == null) {
            return const Center(child: CircularProgressIndicator());
          }

          return RefreshIndicator(
            color: _brand,
            onRefresh: () async {
              final bloc = context.read<AdminDashboardBloc>();
              bloc.add(const RefreshDashboard());
              await bloc.stream.firstWhere(
                (s) => s.status != DashboardStatus.loading,
                orElse: () => bloc.state,
              );
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                _KpiGrid(data: data),
                const SizedBox(height: 20),
                _AlertGrid(data: data),
                if (data.weeklyChart.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle('Haftalik savdo'),
                  const SizedBox(height: 12),
                  _WeeklyChart(points: data.weeklyChart),
                ],
                if (data.statusBreakdown.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  _SectionTitle('Buyurtmalar holati'),
                  const SizedBox(height: 12),
                  _StatusBreakdown(breakdown: data.statusBreakdown),
                ],
                if (data.recentOrders.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      const Expanded(child: _SectionTitle('Oxirgi buyurtmalar')),
                      TextButton(
                        onPressed: () => context.go('/admin/orders'),
                        child: const Text('Barchasi'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ...data.recentOrders.map((o) => _RecentOrderTile(order: o)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

// ─── KPI Grid (4 ta asosiy ko'rsatkich) ───────────────────────────────────────
class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.data});
  final DashboardData data;

  @override
  Widget build(BuildContext context) {
    final kpis = [
      _KpiCard(
        icon: Icons.receipt_long_rounded,
        label: 'Bugungi buyurtmalar',
        value: '${data.todayOrders}',
        sub: "${formatSom(data.todayRevenue)} so'm",
        color: const Color(0xFF0A7C55),
      ),
      _KpiCard(
        icon: Icons.payments_rounded,
        label: 'Oylik tushum',
        value: formatSom(data.monthRevenue),
        sub: '${data.monthOrders} ta buyurtma',
        color: const Color(0xFF2563EB),
      ),
      _KpiCard(
        icon: Icons.pending_actions_rounded,
        label: 'Kutilayotgan',
        value: '${data.pendingOrders}',
        sub: '${data.processingOrders} ta jarayonda',
        color: const Color(0xFFD97706),
      ),
      _KpiCard(
        icon: Icons.account_balance_wallet_rounded,
        label: 'Kassa balansi',
        value: formatSom(data.kassaBalance),
        sub: "so'm",
        color: const Color(0xFF7C3AED),
      ),
    ];

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: kpis[0]),
            const SizedBox(width: 12),
            Expanded(child: kpis[1]),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: kpis[2]),
            const SizedBox(width: 12),
            Expanded(child: kpis[3]),
          ],
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final String sub;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w900,
                color: color,
                height: 1,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Alert Grid (ogohlantirishlar) ────────────────────────────────────────────
class _AlertGrid extends StatelessWidget {
  const _AlertGrid({required this.data});
  final DashboardData data;

  @override
  Widget build(BuildContext context) {
    final alerts = <_AlertCard>[
      _AlertCard(
        icon: Icons.warning_amber_rounded,
        label: 'Muddati o\'tgan nasiya',
        value: data.overdueCredits,
        color: const Color(0xFFDC2626),
      ),
      _AlertCard(
        icon: Icons.trending_down_rounded,
        label: 'Kam qolgan tovar',
        value: data.lowStock,
        color: const Color(0xFFD97706),
      ),
      _AlertCard(
        icon: Icons.remove_shopping_cart_rounded,
        label: 'Tugagan tovar',
        value: data.outOfStock,
        color: const Color(0xFF6B7280),
      ),
      _AlertCard(
        icon: Icons.feedback_rounded,
        label: 'Yangi izohlar',
        value: data.feedbackNew,
        color: const Color(0xFF2563EB),
      ),
    ];
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: alerts[0]),
            const SizedBox(width: 10),
            Expanded(child: alerts[1]),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: alerts[2]),
            const SizedBox(width: 10),
            Expanded(child: alerts[3]),
          ],
        ),
      ],
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = value > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: active
            ? color.withValues(alpha: 0.08)
            : theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: active
              ? color.withValues(alpha: 0.3)
              : theme.colorScheme.outlineVariant,
        ),
      ),
      child: Row(
        children: [
          Icon(icon, color: active ? color : theme.colorScheme.onSurfaceVariant,
              size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$value',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: active ? color : theme.colorScheme.onSurface,
                  ),
                ),
                Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.1,
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

// ─── Haftalik chart ────────────────────────────────────────────────────────────
class _WeeklyChart extends StatelessWidget {
  const _WeeklyChart({required this.points});
  final List<WeeklyPoint> points;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxRevenue = points.fold<double>(
      0,
      (m, p) => p.revenue > m ? p.revenue : m,
    );
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
            final ratio = maxRevenue <= 0 ? 0.0 : p.revenue / maxRevenue;
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      p.orders > 0 ? '${p.orders}' : '',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontSize: 9,
                      ),
                    ),
                    const SizedBox(height: 4),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 400),
                      height: 4 + ratio * 96,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [Color(0xFF063F2B), Color(0xFF0A7C55)],
                        ),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _shortDate(p.date),
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

  String _shortDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return DateFormat('dd/MM').format(d);
  }
}

// ─── Status breakdown ──────────────────────────────────────────────────────────
class _StatusBreakdown extends StatelessWidget {
  const _StatusBreakdown({required this.breakdown});
  final Map<String, int> breakdown;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entries = breakdown.entries.where((e) => e.value > 0).toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final total = entries.fold<int>(0, (s, e) => s + e.value);
    if (entries.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        children: entries.map((e) {
          final ratio = total <= 0 ? 0.0 : e.value / total;
          final color = OrderStatusHelper.badgeColor(e.key);
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        OrderStatusHelper.label(e.key),
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      '${e.value}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: color,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: ratio,
                    minHeight: 6,
                    backgroundColor: color.withValues(alpha: 0.12),
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─── Oxirgi buyurtma plitkasi ──────────────────────────────────────────────────
class _RecentOrderTile extends StatelessWidget {
  const _RecentOrderTile({required this.order});
  final RecentOrder order;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = OrderStatusHelper.badgeColor(order.status);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '#${order.id}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        OrderStatusHelper.label(order.status),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: color,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  order.receiverName.isEmpty
                      ? order.receiverPhone
                      : order.receiverName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            "${formatSom(order.totalPrice)} so'm",
            style: theme.textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: const Color(0xFF0A7C55),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Yordamchi widgetlar ───────────────────────────────────────────────────────
class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
          ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded,
                size: 56, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A7C55),
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
