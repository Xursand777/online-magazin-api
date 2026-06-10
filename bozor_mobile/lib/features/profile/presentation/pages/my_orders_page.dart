import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../admin/data/models/order_status_helper.dart';
import '../cubit/my_orders_cubit.dart';
import '../cubit/my_orders_state.dart';
import '../../data/models/user_order_model.dart';

class MyOrdersPage extends StatelessWidget {
  const MyOrdersPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BlocBuilder<MyOrdersCubit, MyOrdersState>(
      builder: (context, state) {
        int activeCount = 0;
        int unpaidCount = 0;
        int allCount = 0;

        if (state is MyOrdersLoaded) {
          activeCount = state.activeOrders.length;
          unpaidCount = state.unpaidOrders.length;
          allCount = state.allOrders.length;
        }

        return DefaultTabController(
          length: 3,
          child: Scaffold(
            backgroundColor: theme.colorScheme.surfaceContainerLowest,
            appBar: AppBar(
              title: Text(
                'Mening buyurtmalarim',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              centerTitle: false,
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(48),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TabBar(
                    isScrollable: true,
                    tabAlignment: TabAlignment.start,
                    indicatorColor: const Color(0xFF0A7C55),
                    labelColor: const Color(0xFF0A7C55),
                    unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
                    labelStyle: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                    unselectedLabelStyle: theme.textTheme.labelLarge,
                    tabs: [
                      Tab(text: 'Faollar ($activeCount)'),
                      Tab(text: 'To\'lov qilinmagan ($unpaidCount)'),
                      Tab(text: 'Barchasi ($allCount)'),
                    ],
                  ),
                ),
              ),
            ),
            body: BlocConsumer<MyOrdersCubit, MyOrdersState>(
              listener: (context, state) {
                if (state is MyOrdersError) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(state.message),
                      backgroundColor: theme.colorScheme.error,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
              builder: (context, state) {
                if (state is MyOrdersLoading) {
                  return const _LoadingSkeletonList();
                }

                if (state is MyOrdersError && state is! MyOrdersLoaded) {
                  return _ErrorPlaceholder(
                    message: state.message,
                    onRetry: () => context.read<MyOrdersCubit>().loadOrders(),
                  );
                }

                if (state is MyOrdersLoaded) {
                  return TabBarView(
                    children: [
                      _OrdersList(
                        orders: state.activeOrders,
                        emptyMessage: 'Sizda faol buyurtma mavjud emas!',
                      ),
                      _OrdersList(
                        orders: state.unpaidOrders,
                        emptyMessage: 'Sizda to\'lov qilinmagan buyurtma mavjud emas!',
                      ),
                      _OrdersList(
                        orders: state.allOrders,
                        emptyMessage: 'Sizda buyurtmalar mavjud emas!',
                      ),
                    ],
                  );
                }

                return const SizedBox.shrink();
              },
            ),
          ),
        );
      },
    );
  }
}

// ─── Orders List View ────────────────────────────────────────────────────────
class _OrdersList extends StatelessWidget {
  final List<UserOrderModel> orders;
  final String emptyMessage;

  const _OrdersList({
    required this.orders,
    required this.emptyMessage,
  });

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return _EmptyStatePlaceholder(message: emptyMessage);
    }

    return RefreshIndicator(
      color: const Color(0xFF0A7C55),
      onRefresh: () => context.read<MyOrdersCubit>().loadOrders(),
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        itemCount: orders.length,
        itemBuilder: (context, index) {
          return _OrderCard(order: orders[index]);
        },
      ),
    );
  }
}

// ─── Order Card Item ────────────────────────────────────────────────────────
class _OrderCard extends StatelessWidget {
  final UserOrderModel order;

  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = OrderStatusHelper.badgeColor(order.status);
    final dateStr = order.createdAt != null
        ? DateFormat('dd.MM.yyyy HH:mm').format(order.createdAt!)
        : '';

    // Payment details and status labels
    String? cardPaymentStatusLabel;
    if (order.paymentMethod.toLowerCase() == 'card' && order.payment != null) {
      final statusUpper = order.payment!.status.toUpperCase();
      if (statusUpper == 'PAID') {
        cardPaymentStatusLabel = 'To\'langan';
      } else if (statusUpper == 'PENDING') {
        cardPaymentStatusLabel = 'To\'lov kutilmoqda';
      } else if (statusUpper == 'FAILED') {
        cardPaymentStatusLabel = 'To\'lashda xatolik';
      } else if (statusUpper == 'REFUNDED') {
        cardPaymentStatusLabel = 'Qaytarilgan';
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Card Header (Order ID + Date + Status Badge)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Buyurtma #${order.id}',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (dateStr.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          dateStr,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Status Badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        OrderStatusHelper.label(order.status),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: statusColor,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    // Credit status / Awaiting Card Payment Badges
                    if (order.isCredit) ...[
                      const SizedBox(height: 6),
                      _badgeWidget(
                        label: order.creditPaid
                            ? 'Nasiya to\'langan'
                            : order.creditIsOverdue
                                ? 'Muddati o\'tgan'
                                : 'Nasiya',
                        color: order.creditPaid
                            ? const Color(0xFF059669)
                            : order.creditIsOverdue
                                ? const Color(0xFFDC2626)
                                : const Color(0xFFD97706),
                      ),
                    ],
                    if (cardPaymentStatusLabel != null) ...[
                      const SizedBox(height: 6),
                      _badgeWidget(
                        label: cardPaymentStatusLabel,
                        color: order.payment!.status.toUpperCase() == 'PAID'
                            ? const Color(0xFF059669)
                            : order.payment!.status.toUpperCase() == 'PENDING'
                                ? const Color(0xFFEA580C)
                                : const Color(0xFFDC2626),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // 2. Card Body (Recipients, Address, Payment Methods)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _infoRow(
                  theme,
                  Icons.person_outline_rounded,
                  'Qabul qiluvchi',
                  order.receiverName,
                ),
                _infoRow(
                  theme,
                  Icons.phone_outlined,
                  'Telefon raqami',
                  order.receiverPhone,
                ),
                _infoRow(
                  theme,
                  Icons.location_on_outlined,
                  'Manzil',
                  order.deliveryAddress,
                ),
                _infoRow(
                  theme,
                  Icons.payments_outlined,
                  'To\'lov turi',
                  OrderStatusHelper.paymentMethodLabel(order.paymentMethod),
                ),
                if (order.isCredit && order.creditDueDate != null)
                  _infoRow(
                    theme,
                    Icons.event_note_outlined,
                    'To\'lash muddati',
                    order.creditDueDate!,
                    color: order.creditIsOverdue ? const Color(0xFFDC2626) : null,
                  ),
                if (order.cancellationReason != null &&
                    order.cancellationReason!.trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: theme.colorScheme.error.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Bekor qilish sababi:',
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: theme.colorScheme.error,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          order.cancellationReason!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onErrorContainer,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const Divider(height: 1),

          // 3. Products List View (with main thumbnails & details)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Mahsulotlar',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: order.items.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 12),
                  itemBuilder: (context, idx) {
                    final item = order.items[idx];
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Product image preview
                        Container(
                          width: 50,
                          height: 50,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            color: theme.colorScheme.surfaceContainerLow,
                            border: Border.all(color: theme.colorScheme.outlineVariant),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: item.mainImage != null
                                ? CachedNetworkImage(
                                    imageUrl: item.mainImage!,
                                    fit: BoxFit.contain,
                                    placeholder: (context, url) => const Center(
                                      child: SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      ),
                                    ),
                                    errorWidget: (context, url, error) => Icon(
                                      Icons.image_outlined,
                                      color: theme.colorScheme.outline,
                                      size: 20,
                                    ),
                                  )
                                : Icon(
                                    Icons.image_outlined,
                                    color: theme.colorScheme.outline,
                                    size: 20,
                                  ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        // Product Name, variation text, qty multiplier
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.productName,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              if (item.variantText.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  item.variantText,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 4),
                              Text(
                                '${item.quantity} ta × ${formatSom(item.priceSnapshot)} so\'m',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Item total
                        Text(
                          '${formatSom(item.priceSnapshot * item.quantity)} so\'m',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // 4. Summary & Actions
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Jami summa',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${formatSom(order.totalPrice)} so\'m',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: const Color(0xFF0A7C55),
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
                if (order.canCancel)
                  ElevatedButton.icon(
                    onPressed: () => _handleCancel(context, order),
                    icon: const Icon(Icons.cancel_outlined, size: 16),
                    label: const Text('Bekor qilish'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.colorScheme.errorContainer,
                      foregroundColor: theme.colorScheme.onErrorContainer,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _badgeWidget({required String label, required Color color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _infoRow(
    ThemeData theme,
    IconData icon,
    String title,
    String value, {
    Color? color,
  }) {
    if (value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 16,
            color: color ?? theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: color ?? theme.colorScheme.onSurface,
                ),
                children: [
                  TextSpan(
                    text: '$title: ',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(text: value),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleCancel(BuildContext context, UserOrderModel order) {
    final noteCtrl = TextEditingController();
    final cubit = context.read<MyOrdersCubit>();
    final theme = Theme.of(context);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Buyurtmani bekor qilish'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '#${order.id} buyurtmani bekor qilmoqchimisiz? Buning sababini quyida kiriting:',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 3,
              autofocus: true,
              style: theme.textTheme.bodyMedium,
              decoration: InputDecoration(
                hintText: 'Bekor qilish sababi (masalan: boshqa mahsulot tanladim, xato buyurtma)...',
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.outline,
                ),
                border: const OutlineInputBorder(),
                focusedBorder: const OutlineInputBorder(
                  borderSide: BorderSide(color: Color(0xFF0A7C55)),
                ),
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
            style: TextButton.styleFrom(
              foregroundColor: theme.colorScheme.error,
            ),
            onPressed: () async {
              final reason = noteCtrl.text.trim();
              if (reason.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Iltimos, bekor qilish sababini kiriting.'),
                    backgroundColor: Colors.amber,
                    behavior: SnackBarBehavior.floating,
                  ),
                );
                return;
              }
              Navigator.pop(ctx);
              HapticFeedback.mediumImpact();
              final success = await cubit.cancelUserOrder(order.id, reason);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      success
                          ? 'Buyurtma muvaffaqiyatli bekor qilindi.'
                          : 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.',
                    ),
                    backgroundColor: success ? const Color(0xFF0A7C55) : theme.colorScheme.error,
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              }
            },
            child: const Text('Bekor qilish'),
          ),
        ],
      ),
    );
  }
}

// ─── Skeleton Loading Placeholder ───────────────────────────────────────────
class _LoadingSkeletonList extends StatelessWidget {
  const _LoadingSkeletonList();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 3,
      itemBuilder: (context, index) {
        return Container(
          height: 180,
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.grey[200],
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey[300]!),
          ),
          child: const Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Color(0xFF0A7C55),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ─── Error Placeholder ──────────────────────────────────────────────────────
class _ErrorPlaceholder extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorPlaceholder({
    required this.message,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.wifi_off_rounded,
              size: 54,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A7C55),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Empty State Placeholder ────────────────────────────────────────────────
class _EmptyStatePlaceholder extends StatelessWidget {
  final String message;

  const _EmptyStatePlaceholder({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF0A7C55).withValues(alpha: 0.1),
              ),
              child: const Icon(
                Icons.receipt_long_outlined,
                size: 48,
                color: Color(0xFF0A7C55),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Buyurtmalar topilmadi',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: 200,
              height: 48,
              child: OutlinedButton(
                onPressed: () {
                  HapticFeedback.lightImpact();
                  context.go('/');
                },
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF0A7C55)),
                  foregroundColor: const Color(0xFF0A7C55),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Xarid qilish',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
