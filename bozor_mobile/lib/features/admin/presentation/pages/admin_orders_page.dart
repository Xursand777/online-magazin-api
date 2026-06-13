import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/admin_order_model.dart';
import '../../data/models/order_status_helper.dart';
import '../bloc/admin_orders_bloc.dart';
import '../widgets/admin_drawer.dart';

/// Buyurtmalar — saytdagi `OrdersTab` bilan bir xil mantiq.
/// Ma'lumotlar `/api/orders/admin/` orqali olinadi (sahifalab, 20 tadan).
class AdminOrdersPage extends StatefulWidget {
  const AdminOrdersPage({super.key});

  @override
  State<AdminOrdersPage> createState() => _AdminOrdersPageState();
}

class _AdminOrdersPageState extends State<AdminOrdersPage> {
  static const Color _brandDark = Color(0xFF063F2B);
  final _searchCtrl = TextEditingController();

  // Tezkor status filtrlari
  static const List<MapEntry<String, String>> _quickStatuses = [
    MapEntry('', 'Barchasi'),
    MapEntry('PENDING', 'Yangi'),
    MapEntry('CONFIRMED', 'Tasdiqlangan'),
    MapEntry('PACKING', "Yig'ilmoqda"),
    MapEntry('SHIPPING', "Yo'lda"),
    MapEntry('DELIVERED', 'Yetkazilgan'),
    MapEntry('RECEIVED', 'Topshirilgan'),
  ];

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

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
          'Buyurtmalar',
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
                context.read<AdminOrdersBloc>().add(const LoadOrders()),
          ),
        ],
      ),
      body: BlocConsumer<AdminOrdersBloc, AdminOrdersState>(
        listenWhen: (p, c) =>
            p.successMessage != c.successMessage || p.error != c.error,
        listener: (context, state) {
          if (state.successMessage != null) {
            _showSnack(context, state.successMessage!, const Color(0xFF0A7C55),
                Icons.check_circle_outline);
          } else if (state.error != null) {
            _showSnack(context, state.error!, theme.colorScheme.error,
                Icons.error_outline);
          }
        },
        builder: (context, state) {
          return Column(
            children: [
              _buildSearchAndFilters(context, state),
              Expanded(child: _buildList(context, state)),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSearchAndFilters(BuildContext context, AdminOrdersState state) {
    final theme = Theme.of(context);
    final bloc = context.read<AdminOrdersBloc>();
    return Container(
      color: _brandDark,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Column(
        children: [
          TextField(
            controller: _searchCtrl,
            textInputAction: TextInputAction.search,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'ID, ism yoki telefon...',
              hintStyle: const TextStyle(color: Colors.white60),
              prefixIcon: const Icon(Icons.search, color: Colors.white60),
              suffixIcon: state.filters.q.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: Colors.white60),
                      onPressed: () {
                        _searchCtrl.clear();
                        bloc.add(ApplyOrderFilters(
                            state.filters.copyWith(q: '')));
                      },
                    )
                  : null,
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.15),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
            onSubmitted: (v) =>
                bloc.add(ApplyOrderFilters(state.filters.copyWith(q: v.trim()))),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _quickStatuses.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final e = _quickStatuses[i];
                final active = state.filters.status == e.key;
                return GestureDetector(
                  onTap: () => bloc.add(
                      ApplyOrderFilters(state.filters.copyWith(status: e.key))),
                  child: Container(
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    decoration: BoxDecoration(
                      color: active
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Text(
                      e.value,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: active ? _brandDark : Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList(BuildContext context, AdminOrdersState state) {
    if (state.status == OrdersStatus.loading && state.orders.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.status == OrdersStatus.failure && state.orders.isEmpty) {
      return _ErrorView(
        message: state.error ?? 'Xatolik',
        onRetry: () => context.read<AdminOrdersBloc>().add(const LoadOrders()),
      );
    }
    if (state.orders.isEmpty) {
      return const _EmptyOrders();
    }

    return RefreshIndicator(
      color: const Color(0xFF0A7C55),
      onRefresh: () async {
        final bloc = context.read<AdminOrdersBloc>();
        bloc.add(const LoadOrders());
        await bloc.stream.firstWhere(
          (s) => s.status != OrdersStatus.loading,
          orElse: () => bloc.state,
        );
      },
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        itemCount: state.orders.length + 1,
        itemBuilder: (context, i) {
          if (i == state.orders.length) {
            return _Pagination(state: state);
          }
          return _OrderCard(order: state.orders[i], isMutating: state.isMutating);
        },
      ),
    );
  }

  static void _showSnack(
      BuildContext context, String msg, Color color, IconData icon) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(msg)),
          ]),
          backgroundColor: color,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
  }
}

// ─── Order card ────────────────────────────────────────────────────────────────
class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.isMutating});
  final AdminOrder order;
  final bool isMutating;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = OrderStatusHelper.badgeColor(order.status);
    final next = OrderStatusHelper.nextStatus(order.status);
    final dateStr = order.createdAt != null
        ? DateFormat('dd/MM/yyyy HH:mm').format(order.createdAt!)
        : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              children: [
                Text('#${order.id}',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(width: 8),
                if (order.isPos)
                  _Chip(label: 'POS', color: const Color(0xFF7C3AED)),
                if (order.isCredit) ...[
                  const SizedBox(width: 6),
                  _Chip(
                    label: order.creditPaid ? 'Nasiya to\'langan' : 'Nasiya',
                    color: order.creditIsOverdue
                        ? const Color(0xFFDC2626)
                        : const Color(0xFFD97706),
                  ),
                ],
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    OrderStatusHelper.label(order.status),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          // Body
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _infoRow(theme, Icons.person_outline, order.receiverName),
                _infoRow(theme, Icons.phone_outlined, order.receiverPhone),
                if (!order.isPos && order.deliveryAddress.isNotEmpty)
                  _infoRow(theme, Icons.location_on_outlined,
                      order.deliveryAddress),
                // ── Phase 3.0 — "Xaritadan borish" tugmasi ─────────────────
                // POS va bekor qilingan buyurtmalardan tashqari HAR DOIM
                // ko'rinadi. Koordinata bo'lmasa ham — sahifa fallback bilan
                // matn manzil + tashqi xaritalar (Yandex/Google/2GIS) ko'rsatadi.
                if (order.canShowRouteButton)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: FilledButton.icon(
                      onPressed: () => context.push(
                        '/admin/orders/${order.id}/route',
                      ),
                      icon: const Icon(Icons.map, size: 18),
                      label: const Text('Xaritadan borish'),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF22C55E),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10,
                        ),
                        minimumSize: const Size(0, 36),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                  ),
                // ── Mijoz kuryer eslatmasi (amber banner) ──────────────────
                if (order.deliveryNotes.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 4, bottom: 4),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.amber.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Colors.amber.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.sticky_note_2,
                          size: 16,
                          color: Color(0xFFB45309),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            order.deliveryNotes,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: const Color(0xFF92400E),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                _infoRow(
                  theme,
                  Icons.payments_outlined,
                  OrderStatusHelper.paymentMethodLabel(order.paymentMethod),
                ),
                if (dateStr.isNotEmpty)
                  _infoRow(theme, Icons.schedule, dateStr),
                if (order.isCredit && order.creditDueDate != null)
                  _infoRow(
                    theme,
                    Icons.event_outlined,
                    'Nasiya muddati: ${order.creditDueDate}',
                    color: order.creditIsOverdue
                        ? const Color(0xFFDC2626)
                        : null,
                  ),
                const SizedBox(height: 8),
                // Items
                ...order.items.map((it) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: const BoxDecoration(
                              color: Color(0xFF0A7C55),
                              shape: BoxShape.circle,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              '${it.productName}'
                              '${it.variantText.isNotEmpty ? ' (${it.variantText})' : ''}'
                              ' × ${it.quantity}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                          Text(
                            formatSom(it.priceSnapshot * it.quantity),
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    )),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Jami',
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    Text(
                      "${formatSom(order.totalPrice)} so'm",
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: const Color(0xFF0A7C55),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Actions
          if (next != null || order.canAdminCancel ||
              (order.isCredit && !order.creditPaid)) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (next != null)
                    _ActionButton(
                      icon: Icons.arrow_forward_rounded,
                      label: OrderStatusHelper.label(next),
                      color: const Color(0xFF0A7C55),
                      filled: true,
                      onTap: isMutating
                          ? null
                          : () => _confirmAdvance(context, order, next),
                    ),
                  if (order.isCredit && !order.creditPaid)
                    _ActionButton(
                      icon: Icons.price_check_rounded,
                      label: "Nasiyani yopish",
                      color: const Color(0xFFD97706),
                      onTap: isMutating
                          ? null
                          : () => _confirmPayCredit(context, order),
                    ),
                  if (order.canAdminCancel)
                    _ActionButton(
                      icon: Icons.cancel_outlined,
                      label: 'Bekor qilish',
                      color: const Color(0xFFDC2626),
                      onTap: isMutating
                          ? null
                          : () => _confirmCancel(context, order),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(ThemeData theme, IconData icon, String text, {Color? color}) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: color ?? theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodySmall?.copyWith(
                color: color ?? theme.colorScheme.onSurfaceVariant,
                fontWeight: color != null ? FontWeight.w700 : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmAdvance(BuildContext context, AdminOrder order, String next) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Holatni o\'zgartirish'),
        content: Text(
            '#${order.id} buyurtma holatini "${OrderStatusHelper.label(next)}" '
            'ga o\'tkazasizmi?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              context
                  .read<AdminOrdersBloc>()
                  .add(UpdateOrderStatus(order.id, next));
            },
            child: const Text('Ha, o\'tkazish'),
          ),
        ],
      ),
    );
  }

  void _confirmPayCredit(BuildContext context, AdminOrder order) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Nasiyani yopish"),
        content: Text(
            '#${order.id} buyurtma uchun muddatli to\'lov qabul qilinsinmi?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<AdminOrdersBloc>().add(PayCreditOrder(order.id));
            },
            child: const Text("To'landi"),
          ),
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context, AdminOrder order) {
    final noteCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Buyurtmani bekor qilish'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('#${order.id} buyurtma bekor qilinadi. Sababni kiriting:'),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'Bekor qilish sababi...',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Orqaga'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            onPressed: () {
              Navigator.pop(ctx);
              context.read<AdminOrdersBloc>().add(
                    UpdateOrderStatus(
                      order.id,
                      'CANCELLED_BY_ADMIN',
                      note: noteCtrl.text.trim(),
                    ),
                  );
            },
            child: const Text('Bekor qilish'),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.filled = false,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: filled ? color : color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: filled ? Colors.white : color),
              const SizedBox(width: 6),
              Text(
                label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: filled ? Colors.white : color,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _Pagination extends StatelessWidget {
  const _Pagination({required this.state});
  final AdminOrdersState state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bloc = context.read<AdminOrdersBloc>();
    final page = state.filters.page;
    final totalPages = state.totalPages;
    if (totalPages <= 1) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: Text('Jami: ${state.count} ta buyurtma',
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              )),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: state.hasPrev
                ? () => bloc.add(ChangeOrderPage(page - 1))
                : null,
            icon: const Icon(Icons.chevron_left_rounded),
          ),
          Text('$page / $totalPages',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          IconButton(
            onPressed: state.hasNext
                ? () => bloc.add(ChangeOrderPage(page + 1))
                : null,
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ],
      ),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  const _EmptyOrders();
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.receipt_long_outlined,
              size: 64, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 16),
          Text('Buyurtmalar topilmadi', style: theme.textTheme.titleMedium),
        ],
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
