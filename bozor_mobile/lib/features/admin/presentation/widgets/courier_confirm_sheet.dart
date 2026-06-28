import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/di/injection_container.dart';
import '../../data/repositories/admin_repository.dart';

/// Kuryer DELIVERED → RECEIVED tasdiqlash oynasi (mobil).
///
/// NIMA UCHUN:
///   "Xaridorga topshirildi" (RECEIVED) holatiga o'tish faqat mijoz telefoniga
///   SMS bilan kelgan 6 xonali QABUL KODI orqali bo'ladi. Oddiy status update
///   endpoint'i bu o'tishni backend'da rad etadi (courier_confirm_required).
///   Yagona to'g'ri yo'l — /courier-confirm/ kod bilan. Rasm/GPS yo'q.
///
/// XATO BOSHQARUVI — backend `code` bo'yicha aniq xabar:
///   wrong_status, no_code, wrong_code (+attempts_left), too_many_attempts,
///   code_used, code_expired. Faqat wrong_code — qayta urinish mumkin.
///
/// Muvaffaqiyat → `true` qaytaradi (chaqiruvchi ro'yxatni yangilaydi).
class CourierConfirmSheet extends StatefulWidget {
  final int orderId;
  const CourierConfirmSheet({super.key, required this.orderId});

  @override
  State<CourierConfirmSheet> createState() => _CourierConfirmSheetState();
}

class _CourierConfirmSheetState extends State<CourierConfirmSheet> {
  static const int _codeLength = 6;

  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  bool _submitting = false;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    // Oyna ochilishi bilan klaviatura chiqsin
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  String get _code => _controller.text;
  bool get _isReady => _code.length == _codeLength;

  /// Backend xato kodi → foydalanuvchi uchun aniq xabar.
  String _formatError(CourierConfirmException e) {
    final left = e.attemptsLeft;
    switch (e.code) {
      case 'wrong_code':
        return left != null
            ? "Kod noto'g'ri. Qolgan urinishlar: $left/5"
            : "Kod noto'g'ri. Qayta kiriting.";
      case 'too_many_attempts':
        return "5 ta noto'g'ri urinish. Buyurtma 1 soatga bloklandi — admin bilan bog'laning.";
      case 'code_expired':
        return "Qabul kodi muddati o'tdi (24 soat). Yangi kod uchun admin bilan bog'laning.";
      case 'code_used':
        return "Bu kod allaqachon ishlatilgan. Buyurtma yopiq.";
      case 'no_code':
        return "Buyurtma uchun qabul kodi yaratilmagan. Admin bilan bog'laning.";
      case 'wrong_status':
        return "Buyurtma DELIVERED holatida emas. Ro'yxatni yangilang.";
      default:
        return e.message;
    }
  }

  Future<void> _submit() async {
    if (!_isReady || _submitting) return;
    setState(() {
      _submitting = true;
      _errorMsg = null;
    });
    try {
      await sl<AdminRepository>().courierConfirmDelivery(widget.orderId, _code);
      if (!mounted) return;
      Navigator.of(context).pop(true); // muvaffaqiyat
    } on CourierConfirmException catch (e) {
      if (!mounted) return;
      final msg = _formatError(e);
      // Faqat wrong_code — qayta urinish mumkin. Boshqa xatolarda oyna yopiladi.
      final recoverable = e.code == 'wrong_code' || e.code == null;
      if (recoverable) {
        setState(() {
          _submitting = false;
          _errorMsg = msg;
          _controller.clear();
        });
        _focusNode.requestFocus();
      } else {
        Navigator.of(context).pop(false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: const Color(0xFFDC2626)),
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errorMsg = "Tasdiqlab bo'lmadi. Internet aloqasini tekshiring.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.lock_outline_rounded, size: 20, color: Color(0xFF0A7C55)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Xaridorga topshirish',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '#${widget.orderId} — mijozdan olgan 6 xonali qabul kodini kiriting.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          // 6 xonali kod maydoni — bitta TextField, katta interval bilan
          TextField(
            controller: _controller,
            focusNode: _focusNode,
            enabled: !_submitting,
            autofocus: true,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            maxLength: _codeLength,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w900,
              letterSpacing: 12,
            ),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(_codeLength),
            ],
            decoration: InputDecoration(
              counterText: '',
              hintText: '••••••',
              hintStyle: const TextStyle(letterSpacing: 12, color: Color(0xFFBBBBBB)),
              errorText: _errorMsg,
              border: const OutlineInputBorder(),
              focusedBorder: const OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFF0A7C55), width: 2),
              ),
            ),
            onChanged: (_) {
              if (_errorMsg != null) setState(() => _errorMsg = null);
            },
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 4),
          Text(
            'Kod mijoz telefoniga SMS orqali yuborilgan.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
          child: const Text('Bekor qilish'),
        ),
        FilledButton(
          onPressed: (_isReady && !_submitting) ? _submit : null,
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0A7C55)),
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text('Tasdiqlash'),
        ),
      ],
    );
  }
}
