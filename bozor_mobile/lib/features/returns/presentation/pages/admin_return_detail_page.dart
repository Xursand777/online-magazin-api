// Phase 3.6: Admin Qaytarish — Detail page.
// Web ReturnDetailModal'ning mobil ekvivalenti.
// Funksiyalar:
//   - Status timeline (rangli badge)
//   - Items jadval
//   - Photos thumbnail
//   - Inspector izoh + refund metadata (ACCEPTED'da)
//   - Status o'tkazish tugmalari (state machine'ga mos)

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import 'package:dio/dio.dart';
import '../../../../core/di/injection_container.dart';
import '../../data/models/order_return_model.dart';
import '../../data/repositories/returns_repository.dart';

class AdminReturnDetailPage extends StatefulWidget {
  const AdminReturnDetailPage({super.key, required this.returnId});
  final int returnId;

  @override
  State<AdminReturnDetailPage> createState() => _AdminReturnDetailPageState();
}

class _AdminReturnDetailPageState extends State<AdminReturnDetailPage> {
  final ReturnsRepository _repo = sl<ReturnsRepository>();
  OrderReturn? _data;
  bool _loading = true;
  String? _error;

  String _refundMethod = 'cash';
  final TextEditingController _refundAmount = TextEditingController();
  final TextEditingController _refundRef = TextEditingController();
  final TextEditingController _inspectionNotes = TextEditingController();
  final TextEditingController _note = TextEditingController();
  bool _changed = false;
  bool _busy = false;

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
      final r = await _repo.adminDetail(widget.returnId);
      if (mounted) setState(() => _data = r);
    } catch (e) {
      if (mounted) setState(() => _error = _msg(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _msg(Object e) {
    if (e is DioException) {
      final d = e.response?.data;
      if (d is Map && d['error'] != null) return d['error'].toString();
      if (d is Map && d['detail'] != null) return d['detail'].toString();
    }
    return e.toString();
  }

  Future<void> _transition(String newStatus) async {
    if (_busy || _data == null) return;
    final isRefund = newStatus == 'REFUNDED' || newStatus == 'REPLACED';
    final amountStr = _refundAmount.text.trim();
    setState(() => _busy = true);
    try {
      final updated = await _repo.adminTransition(
        widget.returnId,
        newStatus: newStatus,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        inspectionNotes: _inspectionNotes.text.trim().isEmpty
            ? null
            : _inspectionNotes.text.trim(),
        refundMethod: isRefund ? _refundMethod : null,
        refundAmount: isRefund && amountStr.isNotEmpty ? amountStr : null,
        refundReference: isRefund && _refundRef.text.trim().isNotEmpty
            ? _refundRef.text.trim()
            : null,
      );
      setState(() {
        _data = updated;
        _changed = true;
        _note.clear();
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Status: ${ReturnLabels.status[newStatus] ?? newStatus}'),
            backgroundColor: const Color(0xFF0A7C55),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_msg(e)),
            backgroundColor: const Color(0xFFDC2626),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _refundAmount.dispose();
    _refundRef.dispose();
    _inspectionNotes.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (_, __) {
        if (_changed) {
          // Parent sahifaga "yangilash kerak" signali
          Navigator.of(context).pop(true);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF063F2B),
          foregroundColor: Colors.white,
          title: Text(_data?.returnNumber ?? 'Qaytarish',
              style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline_rounded,
                              color: Color(0xFFEF4444), size: 40),
                          const SizedBox(height: 8),
                          Text(_error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Color(0xFFEF4444))),
                          TextButton(
                              onPressed: _load,
                              child: const Text('Qayta urinish')),
                        ],
                      ),
                    ),
                  )
                : _buildBody(context, _data!),
      ),
    );
  }

  Widget _buildBody(BuildContext context, OrderReturn r) {
    final theme = Theme.of(context);
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final statusColor = Color(ReturnLabels.statusBgColor(r.status));
    final nextStates = ReturnLabels.nextStates(r.status);
    final itemsTotal = r.items.fold<double>(
      0,
      (s, i) => s + (double.tryParse(i.lineTotal) ?? 0),
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      children: [
        // Status badge + buyurtma ma'lumotlari
        Container(
          padding: const EdgeInsets.all(14),
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
                      r.returnNumber,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0A7C55),
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      ReturnLabels.status[r.status] ?? r.status,
                      style: TextStyle(
                        color: statusColor,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Buyurtma #${r.orderId}  ·  ${_pretty(r.createdAt)}',
                style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),
        _Section(title: 'Sabab', child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(ReturnLabels.reason[r.reasonCode] ?? r.reasonCode,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            if (r.reasonText.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(r.reasonText, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
            ],
            if (r.customerRequestNote.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                '"${r.customerRequestNote}"',
                style: TextStyle(
                    fontStyle: FontStyle.italic,
                    color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ],
        )),

        _Section(
          title: "Tovarlar (${r.items.length} ta · ${fmt.format(itemsTotal).replaceAll(',', ' ')} so'm)",
          child: Column(
            children: r.items.map((it) {
              final total = double.tryParse(it.lineTotal) ?? 0;
              return Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(it.productName,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 2),
                          Text(
                            '${it.quantity} ta × ${fmt.format(double.tryParse(it.refundUnitPrice) ?? 0).replaceAll(',', ' ')} so\'m',
                            style: TextStyle(
                                color: theme.colorScheme.onSurfaceVariant,
                                fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          "${fmt.format(total).replaceAll(',', ' ')} so'm",
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          it.restock ? '✓ Stokga qaytadi' : '✗ Writeoff',
                          style: TextStyle(
                            color: it.restock
                                ? const Color(0xFF10B981)
                                : const Color(0xFFEF4444),
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),

        if (r.photos.isNotEmpty)
          _Section(
            title: "Rasmlar (${r.photos.length} ta)",
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: r.photos.map((ph) {
                return Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: CachedNetworkImage(
                        imageUrl: ph.image,
                        width: 80,
                        height: 80,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: Container(
                        color: Colors.black54,
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Text(
                          ph.kind == 'claim' ? "Da'vo" : 'Tekshiruv',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),

        // ACCEPTED'da refund metadata
        if (!r.isTerminal && r.status == 'ACCEPTED')
          _Section(
            title: "Pul qaytarish ma'lumotlari",
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _refundMethod,
                  decoration: const InputDecoration(
                    labelText: 'Usul',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  items: ReturnLabels.refundMethod.entries
                      .where((e) => e.key != 'replacement')
                      .map((e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)))
                      .toList(),
                  onChanged: (v) => setState(() => _refundMethod = v ?? 'cash'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _refundAmount,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: "Summa (so'm)",
                    hintText:
                        fmt.format(itemsTotal).replaceAll(',', ' '),
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _refundRef,
                  decoration: const InputDecoration(
                    labelText: 'Tranzaksiya ref (ixtiyoriy)',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_refundMethod == 'cash' && r.kassaBalance != null) ...[
                  const SizedBox(height: 8),
                  _KassaHint(
                    balance: r.kassaBalance!,
                    required: double.tryParse(_refundAmount.text.isEmpty
                            ? itemsTotal.toStringAsFixed(0)
                            : _refundAmount.text) ??
                        0,
                  ),
                ],
              ],
            ),
          ),

        // INSPECTING/PICKED_UP'da tekshirish izohi
        if (!r.isTerminal &&
            (r.status == 'INSPECTING' || r.status == 'PICKED_UP'))
          _Section(
            title: 'Tekshiruv izohi',
            child: TextField(
              controller: _inspectionNotes,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Inspector izohi…',
                border: OutlineInputBorder(),
              ),
            ),
          ),

        if (nextStates.isNotEmpty)
          _Section(
            title: "Statusni o'zgartirish",
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _note,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    hintText: "Izoh (tarixga yoziladi, ixtiyoriy)",
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: nextStates.map((s) {
                    final danger = s == 'REJECTED' || s == 'CANCELLED';
                    final success = s == 'REFUNDED' || s == 'REPLACED';
                    final color = danger
                        ? const Color(0xFFEF4444)
                        : success
                            ? const Color(0xFF10B981)
                            : const Color(0xFF0A7C55);
                    return ElevatedButton(
                      onPressed: _busy ? null : () => _transition(s),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: color,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      child: Text(
                        ReturnLabels.status[s] ?? s,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),

        // Terminal holatda yakuniy refund
        if (r.isTerminal && r.refundMethod.isNotEmpty)
          _Section(
            title: 'Yakuniy refund',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Usul: ${ReturnLabels.refundMethod[r.refundMethod] ?? r.refundMethod}'),
                Text("Summa: ${fmt.format(double.tryParse(r.refundAmount) ?? 0).replaceAll(',', ' ')} so'm"),
                if (r.refundReference != null && r.refundReference!.isNotEmpty)
                  Text('Ref: ${r.refundReference}'),
                if (r.refundProcessedAt != null)
                  Text(_pretty(r.refundProcessedAt!),
                      style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                if (r.replacementOrderId != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: const Color(0xFF10B981).withValues(alpha: 0.40)),
                    ),
                    child: Text(
                      "↪ Almashtirish: yangi Buyurtma #${r.replacementOrderId}",
                      style: const TextStyle(
                          color: Color(0xFF10B981), fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  String _pretty(String iso) {
    try {
      final d = DateTime.parse(iso);
      return DateFormat('dd.MM.yyyy HH:mm').format(d);
    } catch (_) {
      return iso;
    }
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: theme.colorScheme.onSurfaceVariant,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _KassaHint extends StatelessWidget {
  const _KassaHint({required this.balance, required this.required});
  final double balance;
  final double required;

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,###', 'uz_UZ');
    final enough = balance >= required;
    final color = enough ? const Color(0xFF10B981) : const Color(0xFFEF4444);
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.40)),
      ),
      child: Row(
        children: [
          Icon(enough ? Icons.check_circle : Icons.error, color: color, size: 18),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              "Kassa: ${fmt.format(balance).replaceAll(',', ' ')} so'm",
              style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
            ),
          ),
          Text(
            enough ? "Yetarli" : "Yetmaydi",
            style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
