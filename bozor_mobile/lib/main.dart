import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'core/storage/local_storage.dart';
import 'core/di/injection_container.dart' as di;
import 'core/network/api_constants.dart';
import 'features/cart/presentation/bloc/cart_bloc.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';

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

Future<void> main() async {
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

class BozorApp extends StatelessWidget {
  const BozorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        // Singleton BLoC'lar — BlocProvider.value ishlatiladi (yopmaydi)
        BlocProvider<AuthBloc>.value(value: di.sl<AuthBloc>()),
        BlocProvider<CartBloc>.value(value: di.sl<CartBloc>()),
      ],
      child: MaterialApp.router(
        title: 'Bozor Mobile',
        theme:      AppTheme.lightTheme,
        darkTheme:  AppTheme.darkTheme,
        themeMode:  ThemeMode.system,
        routerConfig: di.sl<AppRouter>().router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}
