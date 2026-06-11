import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'app_languages.dart';
import 'app_translations.dart';
import 'language_cubit.dart';

/// `context.tr('home.title')` — har qanday widget ichida til
/// bilan tegishli matnni olish.
///
/// `context.watch<LanguageCubit>()` bilan ishlaydi — til o'zgarsa
/// matn avtomatik yangilanadi (rebuild).
extension AppTranslateExtension on BuildContext {
  /// Joriy tildagi tarjima.
  ///
  /// `params` placeholder ({name}) almashtirishga ishlatiladi:
  ///   context.tr('cart.itemCount', params: {'count': 5})
  ///   → "5 ta mahsulot"
  String tr(String key, {Map<String, Object>? params}) {
    final lang = watch<LanguageCubit>().state;
    return AppTranslations.tr(key, lang, params: params);
  }

  /// Til o'zgarishini KUZATMAYDIGAN versiyasi — onTap, helper'lar
  /// va boshqa rebuild kerakmas joylar uchun (perfomance).
  String trOnce(String key, {Map<String, Object>? params}) {
    final lang = read<LanguageCubit>().state;
    return AppTranslations.tr(key, lang, params: params);
  }

  /// Joriy tilni o'qish (UI uchun: bayroq, dropdown, va h.k.).
  AppLanguage get currentLanguage => watch<LanguageCubit>().state;
}
