import 'package:flutter/material.dart';

/// Qo'llab-quvvatlanadigan tillar — yagona source of truth.
///
/// Yangi til qo'shilsa, faqat shu yerga + translations/translations_XX.dart
/// faylga qo'shiladi. Boshqa hech qaerga tegmaslik kerak.
enum AppLanguage {
  uz,
  ru,
  en;

  /// Backend Accept-Language header uchun ISO kod.
  String get apiCode => switch (this) {
        AppLanguage.uz => 'uz',
        AppLanguage.ru => 'ru',
        AppLanguage.en => 'en',
      };

  /// Foydalanuvchiga ko'rsatish uchun chiroyli nom.
  String get displayName => switch (this) {
        AppLanguage.uz => "O'zbek tili",
        AppLanguage.ru => 'Русский',
        AppLanguage.en => 'English',
      };

  /// Til kodi bayrog'i (emoji).
  String get flag => switch (this) {
        AppLanguage.uz => '🇺🇿',
        AppLanguage.ru => '🇷🇺',
        AppLanguage.en => '🇬🇧',
      };

  /// Native til nomi (foydalanuvchi o'z tilida ko'radi).
  String get nativeName => switch (this) {
        AppLanguage.uz => "O'zbekcha",
        AppLanguage.ru => 'Русский',
        AppLanguage.en => 'English',
      };

  /// Flutter Locale obyekti (Intl.formatDate, kabilar uchun).
  Locale get locale => switch (this) {
        AppLanguage.uz => const Locale('uz', 'UZ'),
        AppLanguage.ru => const Locale('ru', 'RU'),
        AppLanguage.en => const Locale('en', 'US'),
      };

  /// String kodidan AppLanguage. Noma'lum bo'lsa — uz (default).
  static AppLanguage fromCode(String? code) {
    switch (code) {
      case 'ru':
        return AppLanguage.ru;
      case 'en':
        return AppLanguage.en;
      case 'uz':
      default:
        return AppLanguage.uz;
    }
  }
}
