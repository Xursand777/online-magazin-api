/// Joriy til kodining global vakili (ApiClient va boshqa
/// circular-dependency tegmaslik talab qiluvchi joylar uchun).
///
/// MUHIM: LanguageCubit'ning yagona "yozuvchi" emas, lekin asosiy yozuvchi:
/// `LanguageCubit.changeLanguage()` chaqirilganda bu yangilanadi.
/// ApiClient interceptor `Accept-Language` header uchun shu yerdan o'qiydi.
///
/// Bu pattern Flutter'da BLoC + Dio kabi qayta-qayta kuzatiladigan stack'da
/// (Mobile arxitektura) standart yondashuv — circular imports kerakmas.
class LanguageHolder {
  LanguageHolder._();

  /// Joriy ISO til kodi: 'uz' | 'ru' | 'en'.
  /// Default — 'uz' (LanguageCubit load() ishga tushgunga qadar).
  static String currentCode = 'uz';

  /// LanguageCubit emit qilganda chaqiriladi.
  static void update(String code) {
    currentCode = code;
  }
}
