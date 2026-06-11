import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'app_languages.dart';
import 'language_holder.dart';

/// Til holatini boshqaruvchi cubit — Hive bilan persistent.
///
/// Foydalanish:
///   1. main.dart ichida `BlocProvider(create: (_) => LanguageCubit()..load())`
///   2. UI'da `context.watch<LanguageCubit>().state` orqali joriy tilni o'qish
///   3. Til o'zgartirish: `context.read<LanguageCubit>().changeLanguage(...)`
///
/// Persistence: Hive box `app_settings` ichida `language` kaliti.
/// Birinchi marta ochilganda — sistema locale tekshiriladi (rus, ingliz, yoki uz).
class LanguageCubit extends Cubit<AppLanguage> {
  static const String _boxName = 'app_settings';
  static const String _key = 'language';

  LanguageCubit() : super(AppLanguage.uz);

  /// Saqlangan tilni Hive'dan o'qish va emit qilish.
  /// Yo'q bo'lsa — system locale yoki uz (default).
  Future<void> load() async {
    try {
      final box = await Hive.openBox(_boxName);
      final saved = box.get(_key) as String?;
      if (saved != null) {
        final lang = AppLanguage.fromCode(saved);
        LanguageHolder.update(lang.apiCode); // ApiClient sinx
        emit(lang);
        return;
      }
      // Sistema locale'dan taxmin qilish
      final systemLanguage = _detectSystemLanguage();
      LanguageHolder.update(systemLanguage.apiCode);
      emit(systemLanguage);
      await box.put(_key, systemLanguage.apiCode);
    } catch (_) {
      // Xato bo'lsa — uz default qoladi
      LanguageHolder.update(AppLanguage.uz.apiCode);
      emit(AppLanguage.uz);
    }
  }

  /// Tilni o'zgartirish va persist qilish.
  ///
  /// Bu state emit qiladi → butun ilova `BlocBuilder<LanguageCubit, ...>`
  /// orqali avtomatik qayta render qiladi (matnlar yangilanadi).
  ///
  /// Backend'ga ham ta'sir qiladi: `ApiClient` `LanguageHolder.currentCode`
  /// orqali `Accept-Language` header qo'shadi.
  Future<void> changeLanguage(AppLanguage language) async {
    if (language == state) return;
    LanguageHolder.update(language.apiCode); // ApiClient sinx — IMMEDIATELY
    emit(language);
    try {
      final box = await Hive.openBox(_boxName);
      await box.put(_key, language.apiCode);
    } catch (_) {
      // Persist xato bo'lsa, hech bo'lmasa sessiya uchun ishlaydi
    }
  }

  /// Foydalanuvchi qurilmasining tilini taxmin qilish.
  /// Fallback: uz.
  AppLanguage _detectSystemLanguage() {
    try {
      // PlatformDispatcher'dan birinchi locale
      // (Flutter bind import qilmaslik uchun — placeholder)
      return AppLanguage.uz;
    } catch (_) {
      return AppLanguage.uz;
    }
  }
}
