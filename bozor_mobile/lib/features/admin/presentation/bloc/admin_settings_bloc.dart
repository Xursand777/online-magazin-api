import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/repositories/admin_repository.dart';

abstract class AdminSettingsEvent {}

class LoadAdminSettings extends AdminSettingsEvent {}

class UpdateExchangeRate extends AdminSettingsEvent {
  final double rate;
  UpdateExchangeRate(this.rate);
}

class UpdateShopInfo extends AdminSettingsEvent {
  final String shopName;
  final String shopPhone;
  final String shopAddress;

  UpdateShopInfo({
    required this.shopName,
    required this.shopPhone,
    required this.shopAddress,
  });
}

class AdminSettingsState {
  final bool isLoading;
  final bool isSaving;
  final String? error;
  final String? successMessage;
  
  final double usdRate;
  final String shopName;
  final String shopPhone;
  final String shopAddress;
  
  /// Shop info endpoint serverda mavjud emasligini bildiradi (deploy kerak).
  final bool shopInfoUnavailable;

  AdminSettingsState({
    this.isLoading = false,
    this.isSaving = false,
    this.error,
    this.successMessage,
    this.usdRate = 0.0,
    this.shopName = '',
    this.shopPhone = '',
    this.shopAddress = '',
    this.shopInfoUnavailable = false,
  });

  AdminSettingsState copyWith({
    bool? isLoading,
    bool? isSaving,
    String? error,
    String? successMessage,
    double? usdRate,
    String? shopName,
    String? shopPhone,
    String? shopAddress,
    bool? shopInfoUnavailable,
    bool clearError = false,
    bool clearSuccess = false,
  }) {
    return AdminSettingsState(
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      error: clearError ? null : (error ?? this.error),
      successMessage: clearSuccess ? null : (successMessage ?? this.successMessage),
      usdRate: usdRate ?? this.usdRate,
      shopName: shopName ?? this.shopName,
      shopPhone: shopPhone ?? this.shopPhone,
      shopAddress: shopAddress ?? this.shopAddress,
      shopInfoUnavailable: shopInfoUnavailable ?? this.shopInfoUnavailable,
    );
  }
}

class AdminSettingsBloc extends Bloc<AdminSettingsEvent, AdminSettingsState> {
  final AdminRepository repository;

  AdminSettingsBloc({required this.repository}) : super(AdminSettingsState()) {
    on<LoadAdminSettings>(_onLoadSettings);
    on<UpdateExchangeRate>(_onUpdateExchangeRate);
    on<UpdateShopInfo>(_onUpdateShopInfo);
  }

  /// Har bir so'rovni mustaqil ravishda bajaramiz.
  /// Bitta xato bo'lsa ham ikkinchisi normal ishlaydi.
  /// 404 xatosi = server deploy qilinmagan, foydalanuvchiga tushuntiramiz.
  Future<void> _onLoadSettings(LoadAdminSettings event, Emitter<AdminSettingsState> emit) async {
    emit(state.copyWith(isLoading: true, clearError: true, clearSuccess: true));

    // ── 1. Dollar kursini olish ─────────────────────────────────────────
    double rate = 0.0;
    String? rateError;
    try {
      rate = await repository.getExchangeRate();
    } catch (e) {
      rateError = _friendlyError(e, "Dollar kursi");
    }

    // ── 2. Do'kon ma'lumotlarini olish ──────────────────────────────────
    String shopName = '';
    String shopPhone = '';
    String shopAddress = '';
    bool shopUnavailable = false;
    String? shopError;
    try {
      final shopInfo = await repository.getShopInfo();
      shopName = shopInfo['shop_name'] ?? '';
      shopPhone = shopInfo['shop_phone'] ?? '';
      shopAddress = shopInfo['shop_address'] ?? '';
    } catch (e) {
      if (_is404(e)) {
        shopUnavailable = true;
      } else {
        shopError = _friendlyError(e, "Do'kon ma'lumotlari");
      }
    }

    // ── Natijani birlashtirish ──────────────────────────────────────────
    final errors = [rateError, shopError].whereType<String>().toList();
    emit(state.copyWith(
      isLoading: false,
      usdRate: rate,
      shopName: shopName,
      shopPhone: shopPhone,
      shopAddress: shopAddress,
      shopInfoUnavailable: shopUnavailable,
      error: errors.isEmpty ? null : errors.join('\n'),
      clearError: errors.isEmpty,
    ));
  }

  Future<void> _onUpdateExchangeRate(UpdateExchangeRate event, Emitter<AdminSettingsState> emit) async {
    emit(state.copyWith(isSaving: true, clearError: true, clearSuccess: true));
    try {
      await repository.updateExchangeRate(event.rate);
      emit(state.copyWith(
        isSaving: false,
        usdRate: event.rate,
        successMessage: "Dollar kursi muvaffaqiyatli saqlandi!",
      ));
    } catch (e) {
      emit(state.copyWith(
        isSaving: false,
        error: _friendlyError(e, "Dollar kursi"),
      ));
    }
  }

  Future<void> _onUpdateShopInfo(UpdateShopInfo event, Emitter<AdminSettingsState> emit) async {
    emit(state.copyWith(isSaving: true, clearError: true, clearSuccess: true));
    try {
      await repository.updateShopInfo(
        name: event.shopName,
        phone: event.shopPhone,
        address: event.shopAddress,
      );
      emit(state.copyWith(
        isSaving: false,
        shopName: event.shopName,
        shopPhone: event.shopPhone,
        shopAddress: event.shopAddress,
        successMessage: "Do'kon ma'lumotlari muvaffaqiyatli saqlandi!",
      ));
    } catch (e) {
      emit(state.copyWith(
        isSaving: false,
        error: _friendlyError(e, "Do'kon ma'lumotlari"),
      ));
    }
  }

  // ── Yordamchi funksiyalar ─────────────────────────────────────────────

  /// Server 404 qaytardimi? (endpoint hali deploy qilinmagan)
  bool _is404(Object e) {
    if (e is DioException && e.response?.statusCode == 404) return true;
    return false;
  }

  /// Xatoni foydalanuvchi tushunadigan shaklda qaytaradi.
  String _friendlyError(Object e, String label) {
    if (_is404(e)) {
      return "$label: Bu funksiya hali serverga yuklanmagan. Backend'ni deploy qiling.";
    }
    if (e is DioException && e.response?.statusCode == 403) {
      return "$label: Ruxsat yo'q. Faqat Super Admin o'zgartira oladi.";
    }
    return "$label: ${AdminRepository.parseError(e)}";
  }
}
