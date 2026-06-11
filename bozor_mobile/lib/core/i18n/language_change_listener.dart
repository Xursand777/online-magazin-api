import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../features/cart/presentation/bloc/cart_bloc.dart';
import '../../features/catalog/presentation/bloc/catalog_bloc.dart';
import '../../features/home/presentation/bloc/home_bloc.dart';
import '../../features/profile/presentation/cubit/favorites_cubit.dart';
import '../di/injection_container.dart';
import 'app_languages.dart';
import 'language_cubit.dart';

/// ⭐ GLOBAL LANGUAGE CHANGE LISTENER — Professional auto-refresh pattern.
///
/// Mashxur ilovalar (Amazon, Wildberries, Yandex Market, AliExpress) shu
/// pattern'ni ishlatadi: til o'zgarsa, BARCHA cache invalidate + qayta
/// fetch. Foydalanuvchi qo'lda yangilash kerakmas.
///
/// QANDAY ISHLAYDI:
///   1. main.dart'da MultiBlocListener orqali ulanadi
///   2. LanguageCubit emit qilsa, listenWhen tekshiriladi
///   3. Til haqiqatan o'zgargan bo'lsa (prev != curr):
///      • HomeBloc.add(LoadHomeData(forceRefresh: true))
///      • CatalogBloc.add(LoadCatalogData())
///      • CartBloc qayta yuklanadi (mahsulot nomi yangilanishi uchun)
///      • FavoritesCubit qayta yuklanadi
///   4. Backend yangi Accept-Language header bilan qayta so'rov yuboradi
///      (LanguageHolder.currentCode allaqachon yangilangan)
///   5. Yangi tarjima mahsulot/kategoriya nomlari darrov ko'rinadi
///
/// MUHIM: bu listener IDEMPOTENT — agar bir BLoC mavjud bo'lmasa,
/// try-catch ichida bo'shliq ushlanadi (boshqa BLoC'lar baribir refresh
/// bo'ladi).
class LanguageChangeListener extends StatelessWidget {
  final Widget child;
  const LanguageChangeListener({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return BlocListener<LanguageCubit, AppLanguage>(
      bloc: sl<LanguageCubit>(),
      // listenWhen — faqat haqiqiy til o'zgarishida ishga tushadi.
      // Bir xil til qayta emit qilinsa (idempotent set), listener ishlamaydi.
      listenWhen: (prev, curr) => prev != curr,
      listener: (context, newLanguage) {
        // ✨ AUTO-REFRESH zanjiri — har bir BLoC mustaqil try-catch
        _safeRefresh(() => sl<HomeBloc>().add(
              const LoadHomeData(forceRefresh: true),
            ));
        _safeRefresh(() => sl<CatalogBloc>().add(LoadCatalogData()));
        _safeRefresh(() => sl<FavoritesCubit>().loadFavorites());
        _safeRefresh(() => sl<CartBloc>().add(LoadCart()));
        // Master/Credit cubit — locale-dependent (matnlar lokal, lekin
        // til o'zgarganda foydalanuvchi yangilangan hisni xohlaydi)
        // Bu yerda kerak emas — master_status backend matn qaytarmaydi.
      },
      child: child,
    );
  }

  void _safeRefresh(void Function() action) {
    try {
      action();
    } catch (_) {
      // BLoC DI'da yo'q (test, lazy load) — boshqa BLoC'larga ta'sir qilmasin
    }
  }
}
