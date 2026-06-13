import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/utils/address.dart';
import '../../../../core/widgets/address_picker.dart';
import '../cubit/profile_edit_cubit.dart';

/// Profile tahrirlash sahifasi — ism, familya va yagona manzil.
///
/// Maydonlar:
///   • Telefon raqami — READ-ONLY (login raqami, o'zgartirib bo'lmaydi)
///   • Ism — editable (required)
///   • Familya — editable (required)
///   • Manzil — editable, multi-line (yetkazib berish manzili)
///
/// Tugmalar:
///   • Saqlash — PATCH /api/profile/ → server → state yangilanadi
///   • Bekor qilish — agar o'zgarish bo'lsa AlertDialog tasdiqlash
///
/// Manzil bu yerda saqlangach, checkout vaqtida AUTO-FILL bo'ladi.
class ProfileEditPage extends StatelessWidget {
  const ProfileEditPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => ProfileEditCubit(repository: sl())..loadProfile(),
      child: const _ProfileEditView(),
    );
  }
}

class _ProfileEditView extends StatefulWidget {
  const _ProfileEditView();

  @override
  State<_ProfileEditView> createState() => _ProfileEditViewState();
}

class _ProfileEditViewState extends State<_ProfileEditView> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();

  /// Strukturalangan manzil — AddressPicker'ga uzatiladi va undan keladi.
  /// Cubit'ga deliveryAddress (full string) sifatida saqlanadi.
  StructuredAddress _address = StructuredAddress.empty;

  /// Controller'lar Cubit state bilan FAQAT BIR MARTA sinxronlanadi
  /// (loadProfile keldi). Foydalanuvchi yozayotgan paytda overwrite qilmaymiz.
  bool _initialized = false;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BlocConsumer<ProfileEditCubit, ProfileEditState>(
      listenWhen: (a, b) =>
          a.isLoading != b.isLoading || a.isSaved != b.isSaved,
      listener: (context, state) {
        // Server'dan keldi → controller'larni TO'LDIRAMIZ (faqat bir marta)
        if (!_initialized && state.initialProfile != null) {
          _firstNameController.text = state.firstName;
          _lastNameController.text = state.lastName;
          // Backend bitta string saqlaydi — uni 4 maydonga parse qilamiz
          _address = StructuredAddress.parse(state.deliveryAddress);
          _initialized = true;
        }
        // Saqlanganda — SnackBar va sahifani yopish
        if (state.isSaved) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text("Profil yangilandi"),
              backgroundColor: theme.colorScheme.primary,
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 2),
            ),
          );
          // Foydalanuvchini sahifaga qaytaramiz — profile yangilangan
          Future.delayed(const Duration(milliseconds: 500), () {
            if (context.mounted && Navigator.canPop(context)) {
              context.pop(true); // result=true → profile reload signal
            }
          });
        }
      },
      builder: (context, state) {
        return PopScope(
          canPop: !state.hasUnsavedChanges,
          onPopInvokedWithResult: (didPop, _) {
            if (didPop) return;
            _confirmDiscardChanges(context);
          },
          child: Scaffold(
            backgroundColor: theme.colorScheme.surface,
            appBar: _buildAppBar(context, theme, state),
            body: _buildBody(context, theme, state),
            bottomNavigationBar: _buildBottomBar(context, theme, state),
          ),
        );
      },
    );
  }

  // ── AppBar ──────────────────────────────────────────────────────────────

  PreferredSizeWidget _buildAppBar(
      BuildContext context, ThemeData theme, ProfileEditState state) {
    return AppBar(
      title: Text(
        'Profilni tahrirlash',
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () {
          if (state.hasUnsavedChanges) {
            _confirmDiscardChanges(context);
          } else {
            context.pop(false);
          }
        },
      ),
    );
  }

  // ── Body — form yoki loading/error ─────────────────────────────────────

  Widget _buildBody(
      BuildContext context, ThemeData theme, ProfileEditState state) {
    if (state.isLoading && state.initialProfile == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.errorMessage != null && state.initialProfile == null) {
      return _buildErrorState(context, theme, state);
    }

    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Hero — avatar + greeting ────────────────────────────────────
          Center(
            child: Stack(
              alignment: Alignment.bottomRight,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.primaryContainer
                        .withValues(alpha: 0.5),
                  ),
                  child: Icon(
                    Icons.person_rounded,
                    size: 52,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // ── ASOSIY MA'LUMOTLAR ──────────────────────────────────────────
          _sectionTitle(theme, "ASOSIY MA'LUMOTLAR"),
          const SizedBox(height: 12),

          // Telefon — READ-ONLY (login raqami)
          _ReadOnlyField(
            icon: Icons.phone_rounded,
            label: "Telefon raqami",
            value: state.phone,
            hint: "Login raqamingiz — o'zgartirib bo'lmaydi",
          ),
          const SizedBox(height: 12),

          // Ism — required
          _EditField(
            controller: _firstNameController,
            icon: Icons.person_outline_rounded,
            label: "Ism",
            hint: "Ismingizni kiriting",
            required: true,
            onChanged: (v) =>
                context.read<ProfileEditCubit>().onFirstNameChanged(v),
          ),
          const SizedBox(height: 12),

          // Familya — required
          _EditField(
            controller: _lastNameController,
            icon: Icons.badge_outlined,
            label: "Familya",
            hint: "Familyangizni kiriting",
            required: true,
            onChanged: (v) =>
                context.read<ProfileEditCubit>().onLastNameChanged(v),
          ),

          const SizedBox(height: 28),

          // ── MENING MANZILIM (4 maydonli AddressPicker) ──────────────────
          _sectionTitle(theme, "MENING MANZILIM"),
          const SizedBox(height: 6),
          Text(
            "Bir marta to'ldiring — buyurtmani rasmiylashtirishda avtomatik to'ldiriladi.",
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 14),

          // AddressPicker — saytdagi bilan IDENTIK UX:
          //   • 4 maydon (viloyat, tuman, mahalla, uy)
          //   • Kartadan tanlash (flutter_map xarita)
          //   • Joylashuvni aniqlash (GPS + permission dialog)
          AddressPicker(
            value: _address,
            onChanged: (addr) {
              setState(() => _address = addr);
              // Cubit'ga full string sifatida saqlaymiz — backend muvofiqligi
              context.read<ProfileEditCubit>().onAddressChanged(addr.full);
            },
            language: 'uz',
            showHeading: false, // section title yuqorida
            required: false, // Profile'da manzil ixtiyoriy
          ),

          const SizedBox(height: 16),

          // Xato xabari (agar bor bo'lsa)
          if (state.errorMessage != null)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: theme.colorScheme.error.withValues(alpha: 0.4)),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline_rounded,
                      size: 18, color: theme.colorScheme.error),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      state.errorMessage!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.error,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── Bottom bar — Saqlash tugmasi ────────────────────────────────────────

  Widget _buildBottomBar(
      BuildContext context, ThemeData theme, ProfileEditState state) {
    if (state.isLoading && state.initialProfile == null) {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            onPressed: state.isFormValid && !state.isSaving
                ? () {
                    HapticFeedback.lightImpact();
                    context.read<ProfileEditCubit>().saveProfile();
                  }
                : null,
            style: FilledButton.styleFrom(
              backgroundColor: theme.colorScheme.primary,
              foregroundColor: theme.colorScheme.onPrimary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            icon: state.isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.check_rounded, size: 22),
            label: Text(
              state.isSaving ? "Saqlanmoqda..." : "Saqlash",
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── Error state (loading muvaffaqiyatsiz) ───────────────────────────────

  Widget _buildErrorState(
      BuildContext context, ThemeData theme, ProfileEditState state) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline_rounded,
                size: 56, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(
              state.errorMessage ?? "Profilni yuklab bo'lmadi",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () =>
                  context.read<ProfileEditCubit>().loadProfile(),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text("Qayta urinish"),
            ),
          ],
        ),
      ),
    );
  }

  // ── Tasdiqlash dialog — "Saqlamasdan chiqasizmi?" ───────────────────────

  void _confirmDiscardChanges(BuildContext context) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, size: 32),
        title: const Text("Saqlanmagan o'zgarishlar"),
        content: const Text(
            "Kiritgan ma'lumotlaringiz saqlanmagan. "
            "Saqlamasdan chiqishni xohlaysizmi?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text("Yo'q, qolaman"),
          ),
          FilledButton.tonal(
            onPressed: () {
              Navigator.of(ctx).pop(true);
              // Original sahifa kontext'i bilan pop qilish
              if (mounted) context.pop(false);
            },
            style: FilledButton.styleFrom(
              backgroundColor:
                  Theme.of(ctx).colorScheme.errorContainer,
              foregroundColor:
                  Theme.of(ctx).colorScheme.onErrorContainer,
            ),
            child: const Text("Ha, chiqaman"),
          ),
        ],
      ),
    );
  }

  // ── Section title helper ────────────────────────────────────────────────

  Widget _sectionTitle(ThemeData theme, String title) {
    return Text(
      title,
      style: theme.textTheme.labelSmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.2,
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD WIDGETS
// ═══════════════════════════════════════════════════════════════════════════════

/// Read-only field — telefon raqami uchun (login).
class _ReadOnlyField extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String hint;

  const _ReadOnlyField({
    required this.icon,
    required this.label,
    required this.value,
    required this.hint,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Icon(icon, size: 22, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      label,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 12,
                      color: theme.colorScheme.outline,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  value.isNotEmpty ? value : '—',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (hint.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    hint,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Editable field — ism, familya, manzil uchun.
class _EditField extends StatelessWidget {
  final TextEditingController controller;
  final IconData icon;
  final String label;
  final String hint;
  final bool required;
  final int maxLines;
  final ValueChanged<String> onChanged;

  const _EditField({
    required this.controller,
    required this.icon,
    required this.label,
    required this.hint,
    required this.onChanged,
    this.required = false,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Icon(icon,
                size: 22, color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              maxLines: maxLines,
              textCapitalization: TextCapitalization.sentences,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
              decoration: InputDecoration(
                labelText: required ? "$label *" : label,
                hintText: hint,
                labelStyle: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
                hintStyle: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.outline,
                  height: 1.3,
                ),
                border: InputBorder.none,
                isDense: true,
                floatingLabelBehavior: FloatingLabelBehavior.always,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
