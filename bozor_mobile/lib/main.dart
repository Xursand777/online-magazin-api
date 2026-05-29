import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'core/storage/local_storage.dart';
import 'core/di/injection_container.dart' as di;
import 'features/cart/presentation/bloc/cart_bloc.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ── Storage ──────────────────────────────────────────────────────────────
  await Hive.initFlutter();
  await LocalStorage.init();

  // ── DI ───────────────────────────────────────────────────────────────────
  // init() ichida tokenlar tekshiriladi va AuthBloc to'g'ri initial state
  // bilan yaratiladi — runApp() chaqirilgunga qadar auth holati ma'lum.
  await di.init();

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
