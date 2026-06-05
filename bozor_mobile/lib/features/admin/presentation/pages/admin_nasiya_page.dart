import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../data/models/admin_order_model.dart';
import '../bloc/admin_nasiya_bloc.dart';
import '../widgets/admin_drawer.dart';

class AdminNasiyaPage extends StatefulWidget {
  const AdminNasiyaPage({super.key});

  @override
  State<AdminNasiyaPage> createState() => _AdminNasiyaPageState();
}

class _AdminNasiyaPageState extends State<AdminNasiyaPage> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      context.read<AdminNasiyaBloc>().add(LoadMoreNasiya());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: const Color(0xFF063F2B),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Nasiya Buyurtmalar',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Yangilash',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              context.read<AdminNasiyaBloc>().add(LoadNasiya());
            },
          ),
        ],
      ),
      body: BlocConsumer<AdminNasiyaBloc, AdminNasiyaState>(
        listener: (context, state) {
          if (state.paySuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('To\'lov muvaffaqiyatli tasdiqlandi!'), backgroundColor: Colors.green),
            );
          }
          if (state.payError != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.payError!), backgroundColor: Colors.red),
            );
          }
        },
        builder: (context, state) {
          if (state.isLoading && state.orders.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.error != null && state.orders.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(state.error!, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => context.read<AdminNasiyaBloc>().add(LoadNasiya()),
                    child: const Text('Qayta urinish'),
                  ),
                ],
              ),
            );
          }

          final filteredOrders = state.orders;

          return Column(
            children: [
              // Filters
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    _FilterChip(
                      label: 'Faol nasiyalar',
                      count: state.activeCount,
                      icon: Icons.schedule,
                      color: const Color(0xFF0A7C55),
                      isSelected: state.filter == 'active',
                      onTap: () => context.read<AdminNasiyaBloc>().add(ChangeNasiyaFilter('active')),
                    ),
                    const SizedBox(width: 8),
                    _FilterChip(
                      label: 'Muddati o\'tgan',
                      count: state.overdueCount,
                      icon: Icons.warning_amber_rounded,
                      color: theme.colorScheme.error,
                      isSelected: state.filter == 'overdue',
                      onTap: () => context.read<AdminNasiyaBloc>().add(ChangeNasiyaFilter('overdue')),
                    ),
                    const SizedBox(width: 8),
                    _FilterChip(
                      label: 'To\'langan',
                      count: state.paidCount,
                      icon: Icons.check_circle_outline,
                      color: const Color(0xFF22C55E),
                      isSelected: state.filter == 'paid',
                      onTap: () => context.read<AdminNasiyaBloc>().add(ChangeNasiyaFilter('paid')),
                    ),
                  ],
                ),
              ),

              // List
              Expanded(
                child: RefreshIndicator(
                  color: const Color(0xFF0A7C55),
                  onRefresh: () async {
                    final bloc = context.read<AdminNasiyaBloc>();
                    bloc.add(LoadNasiya());
                    await bloc.stream.firstWhere((s) => !s.isLoading, orElse: () => bloc.state);
                  },
                  child: filteredOrders.isEmpty
                      ? _EmptyView(filter: state.filter)
                      : ListView.separated(
                          controller: _scrollController,
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.all(16),
                          itemCount: filteredOrders.length + (state.isFetchingMore ? 1 : 0),
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            if (index >= filteredOrders.length) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16.0),
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            }
                            final order = filteredOrders[index];
                            return _NasiyaCard(order: order, isPaying: state.isPaying);
                          },
                        ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ─── Filter Chip ─────────────────────────────────────────────────────────────
class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final IconData icon;
  final Color color;
  final bool isSelected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.count,
    required this.icon,
    required this.color,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? color : theme.colorScheme.surface,
          border: Border.all(color: isSelected ? color : theme.colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(12),
          boxShadow: isSelected
              ? [BoxShadow(color: color.withValues(alpha: 0.2), blurRadius: 8, offset: const Offset(0, 4))]
              : [],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: isSelected ? Colors.white : color),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
                color: isSelected ? Colors.white : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected ? Colors.white.withValues(alpha: 0.2) : theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                  color: isSelected ? Colors.white : theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Bo'sh holat ─────────────────────────────────────────────────────────────
class _EmptyView extends StatelessWidget {
  final String filter;
  const _EmptyView({required this.filter});

  @override
  Widget build(BuildContext context) {
    String msg = "Faol nasiya yo'q";
    if (filter == 'overdue') msg = "Muddati o'tgan nasiya yo'q";
    if (filter == 'paid') msg = "To'langan nasiya yo'q";

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 100),
        Icon(Icons.calendar_month, size: 64, color: Theme.of(context).colorScheme.outlineVariant),
        const SizedBox(height: 16),
        Text(
          msg,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

// ─── Nasiya Card ─────────────────────────────────────────────────────────────
class _NasiyaCard extends StatelessWidget {
  final AdminOrder order;
  final bool isPaying;

  const _NasiyaCard({required this.order, required this.isPaying});

  String _fmt(double v) {
    final f = NumberFormat('#,###', 'uz_UZ');
    return f.format(v).replaceAll(',', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isPaid = order.creditPaid;
    final isOverdue = order.creditIsOverdue;
    
    final dueDate = order.creditDueDate != null ? DateTime.tryParse(order.creditDueDate!) : null;
    int? diffDays;
    if (dueDate != null) {
      final today = DateTime.now();
      // Kun qoldi yoki kun o'tdi hisoblash
      diffDays = (dueDate.millisecondsSinceEpoch - today.millisecondsSinceEpoch) ~/ 86400000;
    }

    final borderColor = isPaid 
        ? const Color(0xFF22C55E) 
        : isOverdue 
            ? theme.colorScheme.error 
            : const Color(0xFF0A7C55);

    return Container(
      decoration: BoxDecoration(
        color: isOverdue && !isPaid ? theme.colorScheme.error.withValues(alpha: 0.05) : theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor.withValues(alpha: 0.3)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '#${order.id}',
                  style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w900, fontSize: 16),
                ),
                _StatusBadge(isPaid: isPaid, isOverdue: isOverdue),
              ],
            ),
          ),
          
          // Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Xaridor
                Row(
                  children: [
                    Icon(Icons.person, size: 20, color: theme.colorScheme.onSurfaceVariant),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(order.receiverName ?? 'Noma\'lum', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                          Text(order.receiverPhone ?? '', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        ],
                      ),
                    ),
                    // Summa
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Jami summa', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                        Text('${_fmt(order.totalPrice)} so\'m', style: theme.textTheme.titleMedium?.copyWith(color: const Color(0xFF0A7C55), fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // Muddat va Qolgan kun
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Kelishilgan muddat', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 2),
                            Text('${order.creditDays ?? '-'} kun', style: const TextStyle(fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('To\'lov sanasi', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 2),
                            Text(
                              dueDate != null ? DateFormat('dd.MM.yyyy').format(dueDate) : '-',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(isPaid ? 'To\'langan' : isOverdue ? 'O\'tgan kun' : 'Qolgan kun', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 2),
                            if (isPaid && order.creditPaidAt != null)
                              Text(DateFormat('dd.MM.yy').format(DateTime.parse(order.creditPaidAt!)), style: const TextStyle(color: Color(0xFF22C55E), fontWeight: FontWeight.bold))
                            else if (!isPaid && diffDays != null)
                              Text(
                                isOverdue ? '${diffDays.abs()} kun' : '$diffDays kun',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  color: isOverdue ? theme.colorScheme.error : diffDays <= 3 ? const Color(0xFFF59E0B) : theme.colorScheme.onSurface,
                                ),
                              )
                            else 
                              const Text('-'),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Harakat (To'lovni tasdiqlash)
                if (!isPaid) ...[
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF0A7C55),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: isPaying ? null : () => _confirmPayment(context, order.id),
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('To\'lovni tasdiqlash', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _confirmPayment(BuildContext context, int orderId) {
    showDialog(
      context: context,
      builder: (_) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.help_outline, color: Color(0xFF0A7C55)),
              SizedBox(width: 8),
              Text('Tasdiqlaysizmi?'),
            ],
          ),
          content: const Text('Ushbu muddatli to\'lov to\'liqligicha to\'langanini tasdiqlaysizmi? Bu amalni orqaga qaytarib bo\'lmaydi.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Bekor qilish', style: TextStyle(color: Colors.grey)),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0A7C55),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () {
                Navigator.pop(context);
                context.read<AdminNasiyaBloc>().add(PayNasiyaOrder(orderId));
              },
              child: const Text('Ha, tasdiqlayman'),
            ),
          ],
        );
      },
    );
  }
}

// ─── Status Badge ────────────────────────────────────────────────────────────
class _StatusBadge extends StatelessWidget {
  final bool isPaid;
  final bool isOverdue;

  const _StatusBadge({required this.isPaid, required this.isOverdue});

  @override
  Widget build(BuildContext context) {
    Color color;
    IconData icon;
    String text;

    if (isPaid) {
      color = const Color(0xFF22C55E);
      icon = Icons.check_circle;
      text = 'To\'langan';
    } else if (isOverdue) {
      color = Theme.of(context).colorScheme.error;
      icon = Icons.warning;
      text = 'Muddati o\'tdi';
    } else {
      color = const Color(0xFFF59E0B);
      icon = Icons.schedule;
      text = 'Kutilmoqda';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }
}
