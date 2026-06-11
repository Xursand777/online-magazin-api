import 'app_languages.dart';
import 'translations/translations_en.dart';
import 'translations/translations_ru.dart';
import 'translations/translations_uz.dart';

/// Markaziy tarjima registri.
///
/// `tr(key)` chaqirilganda joriy tilning Map'idan qiymat olinadi.
/// Agar kalit topilmasa, fallback tartibi:
///   1. UZ (kanonik manba) — albatta to'ldirilgan
///   2. Kalit nomi (debug uchun ko'rinadigan placeholder)
///
/// Parameterli matnlar: `{name}` placeholder'lar Map<String, dynamic> bilan
/// almashtiriladi.
///
/// Misol:
///   AppTranslations.tr('cart.itemCount', AppLanguage.uz, params: {'count': 5})
///   → "5 ta mahsulot"
class AppTranslations {
  AppTranslations._();

  static const Map<AppLanguage, Map<String, String>> _registry = {
    AppLanguage.uz: translationsUz,
    AppLanguage.ru: translationsRu,
    AppLanguage.en: translationsEn,
  };

  /// Asosiy tarjima funksiyasi.
  ///
  /// - [key]: nuqta bilan ajratilgan kalit (`'cart.title'`)
  /// - [language]: joriy til
  /// - [params]: `{name}` placeholder'larni almashtirish uchun (ixtiyoriy)
  static String tr(
    String key,
    AppLanguage language, {
    Map<String, Object>? params,
  }) {
    // 1. Joriy til
    final primary = _registry[language]?[key];
    if (primary != null) return _interpolate(primary, params);

    // 2. Fallback — UZ
    final fallback = translationsUz[key];
    if (fallback != null) return _interpolate(fallback, params);

    // 3. Debug placeholder — topilmagan kalitni ko'rinarli qiladi
    assert(() {
      // ignore: avoid_print
      print('[i18n] Missing translation key: "$key" for ${language.apiCode}');
      return true;
    }());
    return key;
  }

  /// `{name}` placeholder'larni params bilan almashtirish.
  /// Misol: "{count} ta" + {count: 5} → "5 ta"
  static String _interpolate(String template, Map<String, Object>? params) {
    if (params == null || params.isEmpty) return template;
    var result = template;
    params.forEach((k, v) {
      result = result.replaceAll('{$k}', v.toString());
    });
    return result;
  }

  /// Til kodi to'g'ri ekanligini tekshirish — translation faylida
  /// kalitlar yo'qolib qolmasligi uchun ishlab chiqaruvchi yordamchisi.
  ///
  /// Debug rejimida (initState yoki test'da) chaqirilishi mumkin:
  ///   AppTranslations.assertCompleteness();
  static List<String> findMissingKeys() {
    final referenceKeys = translationsUz.keys.toSet();
    final missing = <String>[];
    for (final lang in [AppLanguage.ru, AppLanguage.en]) {
      final keys = _registry[lang]?.keys.toSet() ?? const <String>{};
      for (final ref in referenceKeys) {
        if (!keys.contains(ref)) {
          missing.add('${lang.apiCode}: $ref');
        }
      }
    }
    return missing;
  }
}
