// Phase 3.6: "Yangi qaytarish" sahifasi (admin + mijoz uchun bir xil).
// 2 bosqich:
//   1) Buyurtma ID kiritish (mijoz uchun avtomat berilgan) → eligibility tekshiruv
//   2) Sabab tanlash + izoh + foto → yuborish
//
// Mijoz `initiator='customer'` bilan — backend OrderReturn'da `initiator_role
// = INITIATOR_CUSTOMER` qiladi.

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../../../core/di/injection_container.dart';
import '../../data/models/order_return_model.dart';
import '../../data/repositories/returns_repository.dart';

class CreateReturnPage extends StatefulWidget {
  const CreateReturnPage({
    super.key,
    required this.initiator,
    this.lockedOrderId,
  });

  /// 'admin' yoki 'customer' — qaysi endpoint ishlatilishini belgilaydi.
  final String initiator;

  /// Mijoz "Mening buyurtmalarim"dan kelganda — buyurtma ID berilgan.
  /// Admin esa qo'lda kiritadi (`lockedOrderId == null`).
  final int? lockedOrderId;

  @override
  State<CreateReturnPage> createState() => _CreateReturnPageState();
}

class _CreateReturnPageState extends State<CreateReturnPage> {
  final ReturnsRepository _repo = sl<ReturnsRepository>();
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _orderIdCtrl = TextEditingController();
  final TextEditingController _reasonText = TextEditingController();
  final TextEditingController _customerNote = TextEditingController();

  ReturnEligibility? _eligibility;
  String? _reasonCode;
  bool _busy = false;
  bool _submitted = false;
  String? _error;
  final List<File> _images = [];

  @override
  void initState() {
    super.initState();
    if (widget.lockedOrderId != null) {
      _orderIdCtrl.text = widget.lockedOrderId.toString();
      // Mijoz holatida darhol eligibility tekshiruvi
      WidgetsBinding.instance.addPostFrameCallback((_) => _checkEligibility());
    }
  }

  @override
  void dispose() {
    _orderIdCtrl.dispose();
    _reasonText.dispose();
    _customerNote.dispose();
    super.dispose();
  }

  bool get _isCustomer => widget.initiator == 'customer';

  Future<void> _checkEligibility() async {
    final id = int.tryParse(_orderIdCtrl.text.trim());
    if (id == null) {
      setState(() => _error = "Buyurtma ID — son bo'lishi kerak");
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _eligibility = null;
    });
    try {
      final result = _isCustomer
          ? await _repo.customerCheckEligibility(id)
          : await _repo.adminCheckEligibility(id);
      if (mounted) {
        setState(() {
          _eligibility = result;
          // Default sabab — birinchi mavjud
          if (result.reasons.isNotEmpty && _reasonCode == null) {
            _reasonCode = result.reasons.first.code;
          }
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = _msg(e));
    } finally {
      if (mounted) setState(() => _busy = false);
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

  Future<void> _pickImage() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked != null && mounted) {
      setState(() => _images.add(File(picked.path)));
    }
  }

  Future<void> _submit() async {
    if (_eligibility?.eligible != true || _reasonCode == null) return;
    final id = int.parse(_orderIdCtrl.text.trim());
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final claimImages = <MultipartFile>[];
      for (final f in _images) {
        claimImages.add(await MultipartFile.fromFile(
          f.path,
          filename: f.path.split('/').last,
        ));
      }
      final create = _isCustomer
          ? _repo.customerCreateReturn(id,
              reasonCode: _reasonCode!,
              reasonText: _reasonText.text.trim().isEmpty
                  ? null
                  : _reasonText.text.trim(),
              customerRequestNote: _customerNote.text.trim().isEmpty
                  ? null
                  : _customerNote.text.trim(),
              claimImages: claimImages)
          : _repo.adminCreateReturn(id,
              reasonCode: _reasonCode!,
              reasonText: _reasonText.text.trim().isEmpty
                  ? null
                  : _reasonText.text.trim(),
              customerRequestNote: _customerNote.text.trim().isEmpty
                  ? null
                  : _customerNote.text.trim(),
              claimImages: claimImages);
      final ret = await create;
      if (mounted) {
        setState(() => _submitted = true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isCustomer
                  ? "Qaytarish so'rovingiz qabul qilindi. Admin ko'rib chiqadi."
                  : "Qaytarish yaratildi: ${ret.returnNumber}",
            ),
            backgroundColor: const Color(0xFF0A7C55),
          ),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = _msg(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF063F2B),
        foregroundColor: Colors.white,
        title: const Text('Yangi qaytarish',
            style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Buyurtma ID (admin uchun input; mijoz uchun read-only)
          _Section(
            title: 'Buyurtma',
            child: TextField(
              controller: _orderIdCtrl,
              readOnly: widget.lockedOrderId != null,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: 'Buyurtma ID',
                hintText: 'masalan: 123',
                border: const OutlineInputBorder(),
                isDense: true,
                suffixIcon: widget.lockedOrderId == null
                    ? IconButton(
                        icon: const Icon(Icons.search_rounded),
                        onPressed: _busy ? null : _checkEligibility,
                      )
                    : null,
              ),
              onSubmitted: (_) => _checkEligibility(),
            ),
          ),

          if (_busy && _eligibility == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator()),
            ),

          if (_error != null && _eligibility == null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _ErrorTile(text: _error!),
            ),

          // Eligibility natijasi
          if (_eligibility != null && !_eligibility!.eligible)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _ErrorTile(
                text: _eligibility!.error ?? 'Qaytarish mumkin emas.',
                code: _eligibility!.code,
              ),
            ),

          if (_eligibility?.eligible == true) ...[
            const SizedBox(height: 12),
            _SuccessTile(
              text:
                  "✓ Qaytarish mumkin. Window: ${(_eligibility!.windowLeftSeconds / 3600).floor()} soat qoldi.",
            ),
            _Section(
              title: 'Qaytariladigan tovarlar',
              child: Column(
                children: _eligibility!.items.map((it) {
                  final fmt = NumberFormat('#,###', 'uz_UZ');
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
                          child: Text(it.productName,
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                        ),
                        Text("${it.returnableQty} ta"),
                        const SizedBox(width: 12),
                        Text(
                          "${fmt.format(double.tryParse(it.price) ?? 0).replaceAll(',', ' ')} so'm",
                          style: const TextStyle(color: Color(0xFF0A7C55)),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
            _Section(
              title: 'Sabab',
              child: Column(
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: _reasonCode,
                    decoration: const InputDecoration(
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: _eligibility!.reasons
                        .map((r) => DropdownMenuItem(
                            value: r.code, child: Text(r.label)))
                        .toList(),
                    onChanged: (v) => setState(() => _reasonCode = v),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _reasonText,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: 'Batafsil sabab (ixtiyoriy)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
            if (!_isCustomer)
              _Section(
                title: "Mijoz so'rovi (telefon orqali bo'lsa)",
                child: TextField(
                  controller: _customerNote,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    hintText: "Mijoz nima dedi…",
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            _Section(
              title: "Dalil rasmlari (0–5 ta)",
              child: Column(
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (int i = 0; i < _images.length; i++)
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                _images[i],
                                width: 70,
                                height: 70,
                                fit: BoxFit.cover,
                              ),
                            ),
                            Positioned(
                              right: -6,
                              top: -6,
                              child: GestureDetector(
                                onTap: () => setState(() => _images.removeAt(i)),
                                child: Container(
                                  decoration: const BoxDecoration(
                                    color: Color(0xFFDC2626),
                                    shape: BoxShape.circle,
                                  ),
                                  padding: const EdgeInsets.all(2),
                                  child: const Icon(Icons.close,
                                      size: 14, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                      if (_images.length < 5)
                        GestureDetector(
                          onTap: _pickImage,
                          child: Container(
                            width: 70,
                            height: 70,
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerLowest,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: theme.colorScheme.outlineVariant),
                            ),
                            child: const Icon(Icons.add_photo_alternate_outlined,
                                color: Colors.grey),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],

          if (_error != null && _eligibility?.eligible == true)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _ErrorTile(text: _error!),
            ),
        ],
      ),
      bottomNavigationBar: _submitted
          ? null
          : Padding(
              padding: EdgeInsets.fromLTRB(
                16,
                8,
                16,
                MediaQuery.of(context).padding.bottom + 8,
              ),
              child: SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed:
                      _busy || _eligibility?.eligible != true || _reasonCode == null
                          ? null
                          : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A7C55),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                    disabledBackgroundColor: Colors.grey.shade400,
                  ),
                  child: _busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2),
                        )
                      : Text(
                          _isCustomer
                              ? "So'rov yuborish"
                              : "Qaytarishni yaratish",
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                ),
              ),
            ),
    );
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

class _ErrorTile extends StatelessWidget {
  const _ErrorTile({required this.text, this.code});
  final String text;
  final String? code;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded,
              color: Color(0xFFEF4444), size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(text,
                    style: const TextStyle(
                        color: Color(0xFFEF4444),
                        fontWeight: FontWeight.w700,
                        fontSize: 13)),
                if (code != null && code!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text("code: $code",
                        style: const TextStyle(
                            color: Color(0xFFEF4444),
                            fontSize: 10,
                            fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessTile extends StatelessWidget {
  const _SuccessTile({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF10B981).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: const TextStyle(
                    color: Color(0xFF10B981),
                    fontWeight: FontWeight.w700,
                    fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
