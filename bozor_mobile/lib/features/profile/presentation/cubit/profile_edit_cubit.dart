import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/models/profile_model.dart';
import '../../data/repositories/profile_repository.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE — to'liq form holati
// ═══════════════════════════════════════════════════════════════════════════════

class ProfileEditState extends Equatable {
  /// Boshlang'ich (server'dan kelgan) profil — read-only phone + meta uchun.
  final ProfileModel? initialProfile;

  /// Foydalanuvchi joriy yozayotgan ma'lumotlar.
  final String firstName;
  final String lastName;
  final String deliveryAddress;
  // ── Phase 3.1 — Manzil koordinatasi va kuryer eslatmasi ───────────────
  final double? deliveryLat;
  final double? deliveryLng;
  final String deliveryNotes;

  /// Status flag'lari
  final bool isLoading;       // GET /api/profile/ yuklanmoqda
  final bool isSaving;        // PATCH yuborilmoqda
  final bool isSaved;         // Muvaffaqiyatli saqlandi (UX uchun)
  final String? errorMessage; // Xato xabari

  const ProfileEditState({
    this.initialProfile,
    this.firstName = '',
    this.lastName = '',
    this.deliveryAddress = '',
    this.deliveryLat,
    this.deliveryLng,
    this.deliveryNotes = '',
    this.isLoading = false,
    this.isSaving = false,
    this.isSaved = false,
    this.errorMessage,
  });

  /// Login telefon raqami — DOIM read-only.
  /// Boshlang'ich profile'dan keladi, hech qachon o'zgartirilmaydi.
  String get phone => initialProfile?.phone ?? '';

  /// Form to'g'ri to'ldirilganmi (Saqlash tugmasi enabled qilish uchun)?
  /// Validatsiya: ism va familya bo'sh bo'lmasligi kerak.
  bool get isFormValid =>
      firstName.trim().isNotEmpty && lastName.trim().isNotEmpty;

  /// Foydalanuvchi biror narsani o'zgartirdimi?
  /// "Saqlamasdan chiqasizmi?" dialog uchun.
  bool get hasUnsavedChanges {
    final initial = initialProfile;
    if (initial == null) return false;
    return firstName != initial.firstName ||
        lastName != initial.lastName ||
        deliveryAddress != initial.deliveryAddress;
  }

  ProfileEditState copyWith({
    ProfileModel? initialProfile,
    String? firstName,
    String? lastName,
    String? deliveryAddress,
    double? deliveryLat,
    double? deliveryLng,
    String? deliveryNotes,
    bool clearCoords = false,
    bool? isLoading,
    bool? isSaving,
    bool? isSaved,
    String? errorMessage,
    bool clearError = false,
    bool clearSaved = false,
  }) {
    return ProfileEditState(
      initialProfile: initialProfile ?? this.initialProfile,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      deliveryLat: clearCoords ? null : (deliveryLat ?? this.deliveryLat),
      deliveryLng: clearCoords ? null : (deliveryLng ?? this.deliveryLng),
      deliveryNotes: deliveryNotes ?? this.deliveryNotes,
      isLoading: isLoading ?? this.isLoading,
      isSaving: isSaving ?? this.isSaving,
      isSaved: clearSaved ? false : (isSaved ?? this.isSaved),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }

  @override
  List<Object?> get props => [
        initialProfile?.phone,
        firstName,
        lastName,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        deliveryNotes,
        isLoading,
        isSaving,
        isSaved,
        errorMessage,
      ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUBIT
// ═══════════════════════════════════════════════════════════════════════════════

class ProfileEditCubit extends Cubit<ProfileEditState> {
  final ProfileRepository repository;

  ProfileEditCubit({required this.repository})
      : super(const ProfileEditState());

  /// Profilni server'dan yuklash — sahifa ochilganda.
  Future<void> loadProfile() async {
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final profile = await repository.getProfile();
      emit(state.copyWith(
        initialProfile: profile,
        firstName: profile.firstName,
        lastName: profile.lastName,
        deliveryAddress: profile.deliveryAddress,
        // Phase 3.1 — saqlangan koordinata va eslatma
        deliveryLat: profile.deliveryLat,
        deliveryLng: profile.deliveryLng,
        deliveryNotes: profile.deliveryNotes,
        isLoading: false,
      ));
    } catch (e) {
      emit(state.copyWith(
        isLoading: false,
        errorMessage: repository.parseError(e),
      ));
    }
  }

  /// Phase 3.1 — AddressPicker xaritadan koordinata tanlaganda.
  void onCoordinatesChanged(double? lat, double? lng) {
    if (lat == null || lng == null) {
      emit(state.copyWith(clearCoords: true, clearError: true, clearSaved: true));
    } else {
      emit(state.copyWith(
        deliveryLat: lat,
        deliveryLng: lng,
        clearError: true,
        clearSaved: true,
      ));
    }
  }

  /// Phase 3.1 — Kuryer uchun eslatma yozilganda.
  void onNotesChanged(String value) {
    emit(state.copyWith(
      deliveryNotes: value,
      clearError: true,
      clearSaved: true,
    ));
  }

  /// TextField'lar o'zgarganda chaqiriladi — state'ni yangilash.
  void onFirstNameChanged(String value) {
    emit(state.copyWith(
      firstName: value,
      clearError: true,
      clearSaved: true,
    ));
  }

  void onLastNameChanged(String value) {
    emit(state.copyWith(
      lastName: value,
      clearError: true,
      clearSaved: true,
    ));
  }

  void onAddressChanged(String value) {
    emit(state.copyWith(
      deliveryAddress: value,
      clearError: true,
      clearSaved: true,
    ));
  }

  /// PATCH yuborish va natija qaytarish.
  /// Returns true on success — UI navigatsiya qarorini qabul qilish uchun.
  Future<bool> saveProfile() async {
    if (!state.isFormValid) return false;

    emit(state.copyWith(isSaving: true, clearError: true, clearSaved: true));
    try {
      final updated = await repository.updateProfile(
        firstName: state.firstName,
        lastName: state.lastName,
        deliveryAddress: state.deliveryAddress,
        // Phase 3.1 — koordinata + eslatma
        deliveryLat: state.deliveryLat,
        deliveryLng: state.deliveryLng,
        deliveryNotes: state.deliveryNotes,
      );
      emit(state.copyWith(
        initialProfile: updated,
        firstName: updated.firstName,
        lastName: updated.lastName,
        deliveryAddress: updated.deliveryAddress,
        deliveryLat: updated.deliveryLat,
        deliveryLng: updated.deliveryLng,
        deliveryNotes: updated.deliveryNotes,
        isSaving: false,
        isSaved: true,
      ));
      return true;
    } catch (e) {
      emit(state.copyWith(
        isSaving: false,
        errorMessage: repository.parseError(e),
      ));
      return false;
    }
  }
}
