import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';

/// Profile sahifa — auth state'ga qarab 2 xil UI:
///   • AuthAuthenticated → foydalanuvchi ma'lumotlari, buyurtmalar, sozlamalar
///   • AuthUnauthenticated → mehmon UI (Amazon/Wildberries uslubi):
///       - Avatar placeholder
///       - "Tizimga kirish" CTA tugmasi
///       - Lock ikonkali bo'limlar — bosilsa login modali ochiladi
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      buildWhen: (prev, curr) =>
          (prev is AuthAuthenticated) != (curr is AuthAuthenticated),
      builder: (context, state) {
        if (state is AuthAuthenticated) {
          return const _AuthenticatedProfile();
        }
        return const _GuestProfile();
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEHMON PROFILI — chiroyli login CTA bilan
// ═══════════════════════════════════════════════════════════════════════════════

class _GuestProfile extends StatelessWidget {
  const _GuestProfile();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Profil',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
        children: [
          // ── Hero block — Avatar + greeting ──────────────────────────────
          Center(
            child: Column(
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.primaryContainer
                        .withValues(alpha: 0.4),
                  ),
                  child: Icon(
                    Icons.person_outline_rounded,
                    size: 52,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  "Salom, mehmon!",
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  "Buyurtmalaringizni boshqarish va sevimli\n"
                  "mahsulotlarni saqlash uchun tizimga kiring",
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),

          // ── Login CTA — asosiy tugma ────────────────────────────────────
          SizedBox(
            width: double.infinity,
            height: 54,
            child: FilledButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                context.push('/auth?redirect=/profile');
              },
              style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: theme.colorScheme.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: const Icon(Icons.login_rounded, size: 22),
              label: const Text(
                "Tizimga kirish",
                style:
                    TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Center(
            child: Text(
              "Telefon raqamingiz orqali bir necha soniyada",
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
          ),

          const SizedBox(height: 32),

          // ── Bo'limlar — lock ikonkasi bilan ─────────────────────────────
          Text(
            "BO'LIMLAR",
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          _LockedTile(
            icon: Icons.receipt_long_outlined,
            title: "Buyurtmalarim",
            subtitle: "Buyurtma tarixi va holati",
          ),
          _LockedTile(
            icon: Icons.favorite_outline,
            title: "Sevimlilar",
            subtitle: "Saqlangan mahsulotlar",
          ),
          _LockedTile(
            icon: Icons.location_on_outlined,
            title: "Mening manzillarim",
            subtitle: "Yetkazib berish manzillari",
          ),
          _LockedTile(
            icon: Icons.credit_card_outlined,
            title: "To'lov usullari",
            subtitle: "Kartalar va to'lov",
          ),
          const SizedBox(height: 16),
          Text(
            "BOSHQA",
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          _UnlockedTile(
            icon: Icons.help_outline_rounded,
            title: "Yordam markazi",
            onTap: () {},
          ),
          _UnlockedTile(
            icon: Icons.info_outline_rounded,
            title: "Ilova haqida",
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

/// Lock'langan bo'lim tile — bosilsa login sheet ochiladi.
class _LockedTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _LockedTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          HapticFeedback.lightImpact();
          context.push('/auth?redirect=/profile');
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: theme.colorScheme.surfaceContainerLow,
                ),
                child: Icon(icon,
                    size: 22, color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        )),
                  ],
                ),
              ),
              Icon(
                Icons.lock_outline_rounded,
                size: 18,
                color: theme.colorScheme.outline,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Login talab qilmaydigan bo'lim tile.
class _UnlockedTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _UnlockedTile({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: ListTile(
        leading: Icon(icon, color: theme.colorScheme.onSurfaceVariant),
        title: Text(title, style: theme.textTheme.titleSmall),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVTORIZATSIYALANGAN PROFIL — eskidan kelgan UI (refactored to StatefulWidget)
// ═══════════════════════════════════════════════════════════════════════════════

class _AuthenticatedProfile extends StatefulWidget {
  const _AuthenticatedProfile();

  @override
  State<_AuthenticatedProfile> createState() => _AuthenticatedProfileState();
}

class _AuthenticatedProfileState extends State<_AuthenticatedProfile> {
  String? _phone;
  String? _fullName;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await sl<ApiClient>().dio.get(ApiConstants.profile);
      final data = response.data as Map<String, dynamic>;
      final phone = data['phone'] as String?;
      final firstName = (data['first_name'] as String?)?.trim() ?? '';
      final lastName = (data['last_name'] as String?)?.trim() ?? '';
      final fullName =
          [firstName, lastName].where((s) => s.isNotEmpty).join(' ');
      if (!mounted) return;
      setState(() {
        _phone = phone;
        _fullName = fullName.isEmpty ? null : fullName;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Profil ma\'lumotlarini yuklab bo\'lmadi';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Profil',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadProfile,
            icon: const Icon(Icons.refresh),
            tooltip: 'Yangilash',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadProfile,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const SizedBox(height: 16),
            Center(
              child: CircleAvatar(
                radius: 48,
                backgroundColor: theme.colorScheme.primaryContainer,
                child: Icon(
                  Icons.person,
                  size: 48,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_fullName != null)
              Center(
                child: Text(
                  _fullName!,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            const SizedBox(height: 4),
            Center(
              child: _loading
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      _error ?? (_phone ?? '—'),
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: _error != null
                            ? theme.colorScheme.error
                            : theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
            ),
            const SizedBox(height: 32),
            _menuTile(
              theme,
              icon: Icons.receipt_long,
              title: 'Mening buyurtmalarim',
              onTap: () {},
            ),
            _menuTile(
              theme,
              icon: Icons.location_on_outlined,
              title: 'Mening manzillarim',
              onTap: () {},
            ),
            _menuTile(
              theme,
              icon: Icons.credit_card,
              title: 'To\'lov usullari',
              onTap: () {},
            ),
            _menuTile(
              theme,
              icon: Icons.settings_outlined,
              title: 'Sozlamalar',
              onTap: () {},
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: () => _logout(context),
              icon: const Icon(Icons.logout),
              label: const Text('Tizimdan chiqish'),
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.errorContainer,
                foregroundColor: theme.colorScheme.onErrorContainer,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _menuTile(
    ThemeData theme, {
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, color: theme.colorScheme.onSurfaceVariant),
      title: Text(title, style: theme.textTheme.bodyLarge),
      trailing: Icon(Icons.chevron_right, color: theme.colorScheme.outline),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }

  void _logout(BuildContext context) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tizimdan chiqish'),
        content: const Text('Haqiqatan ham tizimdan chiqmoqchimisiz?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Chiqish'),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true && context.mounted) {
        sl<AuthBloc>().add(const LogoutEvent());
      }
    });
  }
}
