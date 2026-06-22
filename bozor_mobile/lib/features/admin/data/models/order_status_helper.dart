import 'package:flutter/material.dart';

/// Buyurtma holatlari, ranglar va o'tish mantiqini bitta joyda boshqaradi.
/// Sayt (`utils/orderStatus.ts` + `AdminPanel.tsx`) bilan bir xil logika.
class OrderStatusHelper {
  const OrderStatusHelper._();

  // ─── Holat nomlari (Uzbek) ──────────────────────────────────────────────────
  static const Map<String, String> labels = {
    'AWAITING_PAYMENT': "To'lov kutilmoqda (karta)",
    'PENDING': 'Yangi buyurtma',
    'CONFIRMED': 'Tasdiqlandi',
    'PACKING': "Yig'ilmoqda",
    'SHIPPING': "Yo'lda (kuryerda)",
    'DELIVERED': 'Yetkazildi (eshikda)',
    'RECEIVED': 'Xaridorga topshirildi',
    'CANCELLED_BY_USER': 'Foydalanuvchi bekor qildi',
    'CANCELLED_BY_ADMIN': 'Admin bekor qildi',
    'SYSTEM_AUTO_CANCEL': 'Tizim bekor qildi',
    // Phase 3.5 — qaytarish statuslari (Order'da yo'q, lekin OrderSerializer
    // latest_return_status maydonida kelishi mumkin)
    'REFUNDED': "Do'konga qaytarildi — pul qaytarib berildi",
    'REPLACED': "Do'konga qaytarildi — yangi tovarga almashtirildi",
    'REJECTED': 'Qaytarish rad etildi',
  };

  // Qisqa (badge'ga sig'adigan) label — list ko'rinishida.
  static const Map<String, String> shortLabels = {
    'REFUNDED': "Do'konga qaytarildi",
    'REPLACED': 'Almashtirildi',
    'REJECTED': 'Qaytarish rad etildi',
  };

  static String label(String status) => labels[status] ?? status;

  /// Ro'yxat ko'rinishi uchun qisqa label (uzun matn badge'ni buzmasligi uchun).
  static String shortLabel(String status) =>
      shortLabels[status] ?? labels[status] ?? status;

  // ─── Oldinga o'tish (faqat bitta to'g'ri yo'l) ───────────────────────────────
  static const Map<String, String?> _forward = {
    'AWAITING_PAYMENT': 'CONFIRMED',
    'PENDING': 'CONFIRMED',
    'CONFIRMED': 'PACKING',
    'PACKING': 'SHIPPING',
    'SHIPPING': 'DELIVERED',
    'DELIVERED': 'RECEIVED',
    'RECEIVED': null,
    'CANCELLED_BY_USER': null,
    'CANCELLED_BY_ADMIN': null,
    'SYSTEM_AUTO_CANCEL': null,
  };

  static String? nextStatus(String status) => _forward[status];

  // ─── Yakuniy holatlar ────────────────────────────────────────────────────────
  static const Set<String> finalStatuses = {
    'RECEIVED',
    'CANCELLED_BY_USER',
    'CANCELLED_BY_ADMIN',
    'SYSTEM_AUTO_CANCEL',
  };

  static bool isFinal(String status) => finalStatuses.contains(status);

  // ─── Rang sxemasi (badge) ────────────────────────────────────────────────────
  static Color badgeColor(String status) {
    switch (status) {
      case 'AWAITING_PAYMENT':
        return const Color(0xFFEA580C);
      case 'PENDING':
        return const Color(0xFFD97706);
      case 'CONFIRMED':
        return const Color(0xFF2563EB);
      case 'PACKING':
        return const Color(0xFF7C3AED);
      case 'SHIPPING':
        return const Color(0xFF4F46E5);
      case 'DELIVERED':
        return const Color(0xFF0D9488);
      case 'RECEIVED':
        return const Color(0xFF059669);
      case 'CANCELLED_BY_USER':
      case 'CANCELLED_BY_ADMIN':
        return const Color(0xFFDC2626);
      case 'SYSTEM_AUTO_CANCEL':
        return const Color(0xFF6B7280);
      // Phase 3.5 — qaytarish ranglari (web ReturnsTab bilan AYNAN bir xil).
      case 'REFUNDED':
        return const Color(0xFF22C55E); // green — yakuniy SUCCESS
      case 'REPLACED':
        return const Color(0xFF10B981); // emerald
      case 'REJECTED':
        return const Color(0xFFEF4444); // red
      default:
        return const Color(0xFF6B7280);
    }
  }

  // ─── To'lov turi nomi ────────────────────────────────────────────────────────
  static const Map<String, String> paymentMethodLabels = {
    'cash': 'Naqd pul',
    'card': 'Karta (Click/Payme)',
    'credit': "Muddatli to'lov",
  };

  static String paymentMethodLabel(String method) =>
      paymentMethodLabels[method.toLowerCase()] ?? method;
}

/// Pulni bo'sh joy bilan ajratib formatlash: 1 250 000
String formatSom(num value) {
  final n = value.round();
  final digits = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i != 0 && (digits.length - i) % 3 == 0) buf.write(' ');
    buf.write(digits[i]);
  }
  return '${n < 0 ? '-' : ''}$buf';
}
