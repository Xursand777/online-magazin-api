import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'core/storage/local_storage.dart';
import 'core/di/injection_container.dart' as di;
import 'core/i18n/app_languages.dart';
import 'core/i18n/language_cubit.dart';
import 'features/home/presentation/bloc/home_bloc.dart';
import 'features/catalog/presentation/bloc/catalog_bloc.dart';
import 'core/network/api_constants.dart';
import 'core/widgets/app_version_gate.dart';
import 'core/widgets/cold_start_banner.dart';
import 'features/cart/presentation/bloc/cart_bloc.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';
import 'features/profile/presentation/cubit/favorites_cubit.dart';

/// Sentry DSN — build vaqtida --dart-define=SENTRY_DSN=... orqali kelinadi.
///
/// Bo'sh bo'lsa Sentry o'chiriladi (debug rejimda yoki DSN sozlanmagan bo'lsa).
/// CI/CD'da:
///   flutter build apk --dart-define=SENTRY_DSN=https://...@sentry.io/...
const String _sentryDsn = String.fromEnvironment('SENTRY_DSN');

/// Render free tier serverini uyg'otish uchun fire-and-forget ping.
///
/// Render ~15 daqiqa harakat bo'lmasa uxlab qoladi va keyingi so'rovga
/// 50+ soniya cold-start kerak bo'ladi. App ochilganda darhol fonda
/// ping yuborib uyg'otamiz — foydalanuvchi login bosgan paytda server
/// allaqachon tayyor bo'ladi.
void _warmUpServer() {
  // Faqat production URL'ni warm-up qilamiz.
  if (!kReleaseMode &&
      const String.fromEnvironment('API_BASE_URL').isEmpty) {
    return;
  }
  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 60),
    receiveTimeout: const Duration(seconds: 60),
  ));
  // Engil endpoint — autentifikatsiya talab qilmaydi.
  dio.get('${ApiConstants.baseUrl}${ApiConstants.main}').catchError(
    (_) => Response(requestOptions: RequestOptions(path: '')),
  );
}

Future<void> _initApp() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── Storage ──────────────────────────────────────────────────────────────
  await Hive.initFlutter();
  await LocalStorage.init();

  // ── DI ───────────────────────────────────────────────────────────────────
  // init() ichida tokenlar tekshiriladi va AuthBloc to'g'ri initial state
  // bilan yaratiladi — runApp() chaqirilgunga qadar auth holati ma'lum.
  await di.init();

  // ── Server warm-up (fonda, kutmaymiz) ────────────────────────────────────
  _warmUpServer();

  runApp(const BozorApp());
}

Future<void> main() async {
  // ── Sentry integratsiyasi ────────────────────────────────────────────────
  //
  // NIMA UCHUN: production ilovada xato sodir bo'lsa, foydalanuvchi shikoyat
  // qilmaguncha bilmaymiz. Sentry crash, exception va loglarni real vaqtda
  // dashboard'ga chiqaradi (stacktrace + qurilma ma'lumotlari bilan).
  //
  // QACHON FAOL:
  //   • Release build (kReleaseMode = true)
  //   • DSN qiymati sozlangan (--dart-define=SENTRY_DSN=...)
  //
  // Aks holda Sentry chetlab o'tiladi — debug rejimda Flutter console
  // xato'lari shundoq ham ko'rinadi.
  if (kReleaseMode && _sentryDsn.isNotEmpty) {
    await SentryFlutter.init(
      (options) {
        options.dsn = _sentryDsn;
        options.environment = 'production';

        // Har 10 ta tranzaksiyadan 1 tasi performance kuzatuvi uchun
        // (free reja event limitini tejaymiz)
        options.tracesSampleRate = 0.1;
        options.profilesSampleRate = 0.0;

        // ── Phase 1.3 — Native Android NDK crash handling ───────────────────
        // Native qatlamdagi crash'lar (NDK, SIGSEGV, OOM kill, 3rd-party native
        // kutubxonalar) — Dart darajasiga yetib bormaydi. Sentry NDK
        // integratsiyasi ushlab Sentry serveriga yuboradi.
        //
        // R8 mapping + native .so symbols — Sentry Gradle plugin tomonidan
        // upload qilinadi (build vaqtida, sentry.properties orqali).
        options.enableNativeCrashHandling = true;
        // Native frame'larni stack trace'da ko'rsatish (R8 mapping bilan)
        options.attachStacktrace = true;

        // ── XAVFSIZLIK ──────────────────────────────────────────────────────
        // PII (Personal Identifiable Information) yuborilmaydi:
        //   • Foydalanuvchi telefon raqami, tokenlari Sentry'ga bormaydi
        //   • IP manzil yuborilmaydi
        options.sendDefaultPii = false;

        // Breadcrumb'larda Authorization header'ni yashirish.
        // Sentry 8.x da SentryRequest.headers — non-nullable Map<String, String>.
        options.beforeSend = (event, hint) {
          final request = event.request;
          if (request == null || request.headers.isEmpty) return event;
          final headers = Map<String, String>.from(request.headers);
          final initialLength = headers.length;
          headers.removeWhere((k, _) =>
              k.toLowerCase() == 'authorization' ||
              k.toLowerCase() == 'cookie' ||
              k.toLowerCase() == 'x-guest-session-id');
          if (headers.length == initialLength) return event;
          return event.copyWith(
            request: request.copyWith(headers: headers),
          );
        };

        // Network breadcrumb'larida bodyni saqlamaymiz (kichik token'lar bo'lishi mumkin)
        options.maxBreadcrumbs = 50;
      },
      appRunner: _initApp,
    );
  } else {
    // Debug rejim yoki DSN yo'q — to'g'ridan-to'g'ri ishga tushiramiz
    await _initApp();
  }
}

class BozorApp extends StatelessWidget {
  const BozorApp({super.key});

  @override
  Widget build(BuildContext context) {
    // ── Phase 1.2 — AppVersionGate ─────────────────────────────────────────
    // Ilova ochilganda /api/app-config/ chaqirilib, joriy versiya min'dan
    // past bo'lsa "Yangilash" ekrani ko'rsatiladi. maintenance_mode=True
    // bo'lsa "Texnik xizmat" ekrani. Aks holda asosiy ilova.
    // ⭐ LanguageCubit'ni eng yuqorida BlocProvider — barcha widget'lar
    //    tildagi o'zgarishlarni `context.tr()` orqali ko'radi.
    //    LanguageHolder ham sinx (ApiClient Accept-Language).
    return BlocProvider<LanguageCubit>(
      create: (_) => di.sl<LanguageCubit>()..load(),
      child: BlocBuilder<LanguageCubit, AppLanguage>(
        builder: (context, lang) {
          return AppVersionGate(
            language: lang.apiCode,
            child: MultiBlocProvider(
            providers: [
              // Singleton BLoC'lar — BlocProvider.value ishlatiladi (yopmaydi)
              BlocProvider<AuthBloc>.value(value: di.sl<AuthBloc>()),
              BlocProvider<CartBloc>.value(value: di.sl<CartBloc>()),
              BlocProvider<FavoritesCubit>.value(value: di.sl<FavoritesCubit>()),
            ],
            child: MaterialApp.router(
        title: 'Bozor Mobile',
        theme:      AppTheme.lightTheme,
        darkTheme:  AppTheme.darkTheme,
        themeMode:  ThemeMode.system,
        // ⭐ FLUTTER NATIVE LOCALE — auto-rebuild trigger
        // Locale o'zgarsa Flutter butun MaterialApp tree'ni qayta render qiladi
        // (Localizations widget orqali). Bu bilan GoRouter route'lari ham
        // qayta build bo'ladi — context.tr() bilan ulanmagan widgetlar ham
        // yangilanadi (chunki ularning ancestor Localizations o'zgaradi).
        locale: lang.locale,
        supportedLocales: AppLanguage.values.map((e) => e.locale).toList(),
        // ⚠ MUHIM: locale ko'rsatilganda flutter_localizations delegate'lari
        // ZARUR. Aks holda "No MaterialLocalizations found" xatosi chiqadi.
        // GlobalMaterialLocalizations — Material widget'lar uchun (dialog, dropdown va h.k.)
        // GlobalWidgetsLocalizations — RTL/LTR yo'nalish
        // GlobalCupertinoLocalizations — iOS-style widget'lar
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        // Agar foydalanuvchi tilini topa olmasa (masalan, uz_UZ Flutter
        // global'da to'liq qo'llab-quvvatlanmasa) — eng yaqin variantni
        // tanlash. Default Flutter algoritmi bo'sh til uchun ham ishlaydi.
        localeResolutionCallback: (deviceLocale, supported) {
          if (deviceLocale == null) return supported.first;
          for (final s in supported) {
            if (s.languageCode == deviceLocale.languageCode) return s;
          }
          return supported.first;
        },
        routerConfig: di.sl<AppRouter>().router,
        debugShowCheckedModeBanner: false,
        // ── Cold-start banner — barcha sahifalar ustida ko'rinadi ─────────
        // Request 5+ soniya kutilsa, ekran tepasida "Server uyg'onmoqda..."
        // banner chiqadi. Status idle bo'lsa banner yashirin.
        builder: (context, child) {
          return MultiBlocListener(
            listeners: [
              // ⭐ TIL O'ZGARGANDA AVTO-REFRESH
              // Til o'zgarsa BARCHA data-fetching BLoC'lar qayta yuklanadi:
              // HomeBloc, CatalogBloc, FavoritesCubit, CartBloc.
              // Backend Accept-Language: <new lang> bilan qayta so'rov yuboradi
              // → mahsulot va kategoriya nomlari avtomat yangilanadi.
              // Bu — Amazon, Wildberries, Yandex Market kabi mashxur ilovalar
              // qiladigan professional pattern.
              BlocListener<LanguageCubit, AppLanguage>(
                bloc: di.sl<LanguageCubit>(),
                listenWhen: (prev, curr) => prev != curr,
                listener: (context, _) {
                  _safeRefresh(() => di.sl<HomeBloc>().add(
                        const LoadHomeData(forceRefresh: true),
                      ));
                  _safeRefresh(() => di.sl<CatalogBloc>().add(LoadCatalogData()));
                  _safeRefresh(() => di.sl<FavoritesCubit>().loadFavorites());
                  _safeRefresh(() => di.sl<CartBloc>().add(LoadCart()));
                },
              ),
              BlocListener<AuthBloc, AuthState>(
                listener: (context, state) {
                  if (state is AuthAuthenticated) {
                    // Foydalanuvchi tizimga kirganda savatchani va sevimlilarni server bilan sinxronlash
                    context.read<CartBloc>().add(const SyncCartWithServer());
                    context.read<FavoritesCubit>().syncFavoritesWithServer();
                  } else if (state is AuthUnauthenticated) {
                    // Tizimdan chiqqanda sevimlilarni tozalash
                    context.read<FavoritesCubit>().clearFavorites();
                  }
                },
              ),
            ],
            child: Stack(
              children: [
                child ?? const SizedBox.shrink(),
                const Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: ColdStartBanner(),
                ),
              ],
            ),
          );
        },
      ),
    ),  // MultiBlocProvider
    );  // AppVersionGate
        }, // BlocBuilder builder
      ), // BlocBuilder
    ); // LanguageCubit BlocProvider
  }
}

/// Til o'zgarganda BLoC refresh helper — try-catch ichida xavfsiz chaqirish.
/// Agar bir BLoC DI'da yo'q bo'lsa, boshqalariga ta'sir qilmaydi.
void _safeRefresh(void Function() action) {
  try {
    action();
  } catch (_) {
    // sukut bilan — boshqa BLoC'lar baribir refresh bo'ladi
  }
}
