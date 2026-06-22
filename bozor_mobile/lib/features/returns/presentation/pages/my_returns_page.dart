// Phase 3.6: Mijoz "Mening qaytarishlarim" sahifasi.
// Mijoz faqat o'zining qaytarishlarini ko'radi (read-only — status'larni
// admin o'zgartiradi).

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../data/models/order_return_model.dart';
import '../../data/repositories/returns_repository.dart';

class MyReturnsPage extends StatefulWidget {
  const MyReturnsPage({super.key});

  @override
  State<MyReturnsPage> createState() => _MyReturnsPageState();
}

class _MyReturnsPageState extends State<MyReturnsPage> {
  final ReturnsRepository _repo = sl<ReturnsRepository>();
  List<OrderReturn> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _repo.customerMyReturns();
      if (mounted) setState(() => _items = page.items);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF063F2B),
        foregroundColor: Colors.white,
        title: const Text('Mening qaytarishlarim',
            style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _items.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.assignment_return_outlined,
                                color: theme.colorScheme.onSurfaceVariant,
                                size: 56),
                            const SizedBox(height: 8),
                            Text(
                              'Hozircha qaytarishlaringiz yo\'q',
                              style: TextStyle(
                                  color: theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _items.length,
                        itemBuilder: (context, i) {
                          final r = _items[i];
                          return _CustomerReturnCard(item: r);
                        },
                      ),
      ),
    );
  }
}

class _CustomerReturnCard extends StatelessWidget {
  const _CustomerReturnCard({required this.item});
  final OrderReturn item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final statusColor = Color(ReturnLabels.statusBgColor(item.status));
    final reason = ReturnLabels.reason[item.reasonCode] ?? item.reasonCode;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
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
          Text('Buyurtma #${item.orderId}',
              style: TextStyle(
                  color: theme.colorScheme.onSurfaceVariant, fontSize: 12)),
          const SizedBox(height: 4),
          Text(reason, style: const TextStyle(fontWeight: FontWeight.w600)),
          if (item.reasonText.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(item.reasonText,
                style: TextStyle(
                    fontSize: 12, color: theme.colorScheme.onSurfaceVariant)),
          ],
          const SizedBox(height: 8),
          Divider(color: theme.colorScheme.outlineVariant),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                "${fmt.format(double.tryParse(item.refundAmount) ?? 0).replaceAll(',', ' ')} so'm",
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 14),
              ),
              const SizedBox(width: 6),
              Text(
                '· ${item.items.fold<int>(0, (s, i) => s + i.quantity)} ta tovar',
                style: TextStyle(
                    color: theme.colorScheme.onSurfaceVariant, fontSize: 12),
              ),
              const Spacer(),
              Text(
                _short(item.createdAt),
                style: TextStyle(
                    color: theme.colorScheme.onSurfaceVariant, fontSize: 11),
              ),
            ],
          ),
          // Mijoz uchun yakuniy holat tushuntirishi
          if (item.isTerminal && item.status == 'REFUNDED') ...[
            const SizedBox(height: 6),
            Text(
              "💰 Pul qaytarildi (${ReturnLabels.refundMethod[item.refundMethod] ?? item.refundMethod})",
              style: const TextStyle(
                  color: Color(0xFF10B981),
                  fontWeight: FontWeight.w700,
                  fontSize: 12),
            ),
          ],
          if (item.status == 'REPLACED' && item.replacementOrderId != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                "↪ Almashtirildi — yangi buyurtma #${item.replacementOrderId}",
                style: const TextStyle(
                    color: Color(0xFF10B981),
                    fontWeight: FontWeight.w700,
                    fontSize: 12),
              ),
            ),
          if (item.status == 'REJECTED' && item.rejectionReason != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                "Sabab: ${item.rejectionReason}",
                style: const TextStyle(
                    color: Color(0xFFEF4444), fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  String _short(String iso) {
    try {
      final d = DateTime.parse(iso);
      return DateFormat('dd.MM.yyyy').format(d);
    } catch (_) {
      return iso;
    }
  }
}
