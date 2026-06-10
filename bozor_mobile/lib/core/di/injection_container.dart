import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import '../auth/auth_token_service.dart';
import '../cache/offline_cache_service.dart';
import '../network/api_client.dart';
import '../router/app_router.dart';
import '../../features/auth/data/repositories/auth_repository.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/home/data/repositories/home_repository.dart';
import '../../features/home/presentation/bloc/home_bloc.dart';
import '../../features/catalog/data/repositories/catalog_repository.dart';
import '../../features/catalog/presentation/bloc/catalog_bloc.dart';
import '../../features/cart/data/repositories/cart_repository.dart';
import '../../features/cart/presentation/bloc/cart_bloc.dart';
import '../../features/product_detail/data/repositories/product_detail_repository.dart';
import '../../features/product_detail/presentation/bloc/product_detail_bloc.dart';
import '../../features/search/data/repositories/search_repository.dart';
import '../../features/search/data/services/recent_searches_service.dart';
import '../../features/search/presentation/bloc/search_bloc.dart';
import '../../features/admin/data/repositories/admin_repository.dart';
import '../../features/admin/presentation/bloc/admin_bloc.dart';
import '../../features/admin/presentation/bloc/admin_dashboard_bloc.dart';
import '../../features/admin/presentation/bloc/admin_orders_bloc.dart';
import '../../features/admin/presentation/bloc/admin_pos_bloc.dart';
import '../../features/admin/presentation/bloc/admin_kassa_bloc.dart';
import '../../features/admin/presentation/bloc/admin_nasiya_bloc.dart';
import '../../features/admin/presentation/bloc/admin_report_bloc.dart';
import '../../features/admin/presentation/bloc/admin_settings_bloc.dart';
import '../../features/admin/presentation/bloc/admin_master_bloc.dart';
import '../../features/admin/presentation/bloc/admin_staff_bloc.dart';
import '../../features/admin/presentation/bloc/admin_stock_bloc.dart';
import '../../features/profile/data/repositories/user_orders_repository.dart';
import '../../features/profile/data/repositories/favorites_repository.dart';
import '../../features/profile/data/repositories/profile_repository.dart';
import '../../features/profile/data/repositories/master_credit_repository.dart';
import '../../features/profile/presentation/cubit/my_orders_cubit.dart';
import '../../features/profile/presentation/cubit/favorites_cubit.dart';
import '../../features/profile/presentation/cubit/master_credit_cubit.dart';

final sl = GetIt.instance;

Future<void> init() async {
  sl.registerLazySingleton<FlutterSecureStorage>(
    () => const FlutterSecureStorage(
      aOptions: AndroidOptions(
        encryptedSharedPreferences: true,
      ),
    ),
  );

  // ── Core: AuthTokenService ────────────────────────────────────────────────
  // Barcha token operatsiyalari (saqlash / o'qish / refresh / logout) shu yerda
  sl.registerLazySingleton<AuthTokenService>(
    () => AuthTokenService(storage: sl()),
  );

  // ── Core: Network ─────────────────────────────────────────────────────────
  sl.registerLazySingleton<Dio>(() => Dio());
  sl.registerLazySingleton<ApiClient>(
    () => ApiClient(dio: sl(), secureStorage: sl(), tokenService: sl()),
  );

  // ── Phase 1.5 — Offline cache service (Hive box LocalStorage.init() da ochilgan) ──
  sl.registerLazySingleton<OfflineCacheService>(() => OfflineCacheService());

  // ── Repositories ──────────────────────────────────────────────────────────
  sl.registerLazySingleton<AuthRepository>(
    () => AuthRepository(apiClient: sl(), tokenService: sl()),
  );
  sl.registerLazySingleton<HomeRepository>(
    () => HomeRepository(apiClient: sl(), cache: sl()),
  );
  sl.registerLazySingleton<CatalogRepository>(
    () => CatalogRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<CartRepository>(
    () => CartRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<ProductDetailRepository>(
    () => ProductDetailRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<SearchRepository>(
    () => SearchRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<RecentSearchesService>(
    () => RecentSearchesService(),
  );
  sl.registerLazySingleton<AdminRepository>(
    () => AdminRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<UserOrdersRepository>(
    () => UserOrdersRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<FavoritesRepository>(
    () => FavoritesRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<ProfileRepository>(
    () => ProfileRepository(apiClient: sl()),
  );
  sl.registerLazySingleton<MasterCreditRepository>(
    () => MasterCreditRepository(apiClient: sl()),
  );

  // ── Auth: startup state detection ─────────────────────────────────────────
  // AuthBloc app ishga tushishdan OLDIN to'g'ri state bilan yaratiladi.
  // Bu flash-of-login-page muammosini bartaraf etadi.
  final tokenService = sl<AuthTokenService>();
  final hasTokens    = await tokenService.hasTokens();
  final isAdmin      = hasTokens ? await tokenService.isAdmin() : false;
  final initialState = hasTokens
      ? AuthAuthenticated(isAdmin: isAdmin)
      : AuthUnauthenticated();

  // AuthBloc — SINGLETON (bir nusxa butun ilova davomida)
  sl.registerLazySingleton<AuthBloc>(
    () => AuthBloc(
      repository:   sl(),
      tokenService: sl(),
      initialState: initialState,
    ),
  );

  // AppRouter — AuthBloc'ga bog'liq, shuning uchun keyin ro'yxatdan o'tkaziladi
  sl.registerLazySingleton<AppRouter>(
    () => AppRouter(authBloc: sl()),
  );

  // ── Blocs ─────────────────────────────────────────────────────────────────
  // AuthBloc — singleton (yuqorida), AppRouter — singleton (yuqorida)
  // Qolgan BLoC'lar factory (har sahifa uchun yangi instance)
  sl.registerFactory<HomeBloc>(    () => HomeBloc(repository:    sl()));
  sl.registerFactory<CatalogBloc>( () => CatalogBloc(repository: sl()));
  sl.registerFactory<ProductDetailBloc>(
    () => ProductDetailBloc(repository: sl()),
  );
  sl.registerFactory<SearchBloc>(
    () => SearchBloc(repository: sl(), recentService: sl()),
  );

  // AdminBloc — SINGLETON: katalog (mahsulot/kategoriya/banner) sahifalari
  // navigatsiya orasida bitta holatni baham ko'radi.
  sl.registerLazySingleton<AdminBloc>(() => AdminBloc(repository: sl()));

  // Dashboard / Buyurtmalar / POS — har sahifa uchun yangi instance (factory)
  sl.registerFactory<AdminDashboardBloc>(() => AdminDashboardBloc(repository: sl()));
  sl.registerFactory<AdminOrdersBloc>(   () => AdminOrdersBloc(repository:    sl()));
  sl.registerFactory<AdminPosBloc>(      () => AdminPosBloc(repository:       sl()));
  sl.registerFactory<AdminKassaBloc>(    () => AdminKassaBloc(repository:     sl()));
  sl.registerFactory<AdminNasiyaBloc>(   () => AdminNasiyaBloc(repository:    sl()));
  sl.registerFactory<AdminReportBloc>(   () => AdminReportBloc(repository:    sl()));
  sl.registerFactory<AdminMasterBloc>(   () => AdminMasterBloc(repository:    sl()));
  sl.registerFactory<AdminStaffBloc>(    () => AdminStaffBloc(repository:     sl()));
  sl.registerFactory<AdminStockBloc>(    () => AdminStockBloc(repository:     sl()));
  sl.registerFactory<AdminSettingsBloc>( () => AdminSettingsBloc(repository:  sl()));
  sl.registerFactory<MyOrdersCubit>(     () => MyOrdersCubit(repository:      sl()));
  sl.registerLazySingleton<FavoritesCubit>(
    () => FavoritesCubit(repository: sl())..loadFavorites(),
  );
  // Usta + Kredit cubit — Profile sahifa BlocProvider ichida ham ishlatish
  // mumkin, lekin singleton qilamiz: AuthBloc state'i o'zgarganda invalidatsiya
  // qilish va boshqa joydan ham (masalan, checkout) chaqirish uchun.
  sl.registerLazySingleton<MasterCreditCubit>(
    () => MasterCreditCubit(repository: sl()),
  );

  // CartBloc — singleton (savatcha butun ilova bo'yicha bir xil)
  sl.registerLazySingleton<CartBloc>(
    () => CartBloc(repository: sl())..add(LoadCart()),
  );
}
