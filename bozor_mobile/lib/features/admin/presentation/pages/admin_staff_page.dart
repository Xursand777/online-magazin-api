import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_staff_model.dart';
import '../bloc/admin_staff_bloc.dart';
import '../widgets/admin_drawer.dart';

/// Admin → Xodimlar sahifasi.
/// Saytdagi StaffTab bilan bir xil funksional:
///   • Rol berish / o'zgartirish (telefon + rol tanlash)
///   • Joriy xodimlar ro'yxati (ism, telefon, rol badge)
///   • Xodimni bo'shatish (tasdiqlash dialog bilan)
///   • Rol tushuntirishlari (kartochkalar)
class AdminStaffPage extends StatefulWidget {
  const AdminStaffPage({super.key});

  @override
  State<AdminStaffPage> createState() => _AdminStaffPageState();
}

class _AdminStaffPageState extends State<AdminStaffPage> {
  final _phoneController = TextEditingController();
  String? _selectedRole;

  // Rol → rang (saytdagi ROLE_COLORS bilan mos)
  static const Map<String, Color> _roleColors = {
    'super_admin': Color(0xFFDC2626), // qizil
    'admin':       Color(0xFF0A7C55), // yashil (brand)
    'seller':      Color(0xFF2563EB), // ko'k
    'courier':     Color(0xFF7C3AED), // binafsha
  };

  static Color _colorFor(String? role) => _roleColors[role] ?? Colors.grey;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('Xodimlar',
            style: theme.textTheme.headlineMedium
                ?.copyWith(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Yangilash',
            onPressed: () =>
                context.read<AdminStaffBloc>().add(const LoadStaff()),
          ),
        ],
      ),
      drawer: const AdminDrawer(),
      body: BlocConsumer<AdminStaffBloc, AdminStaffState>(
        listener: (context, state) {
          if (state is StaffActionSuccess) {
            final color = state.action == 'fired' ? Colors.orange : Colors.green;
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.detail),
              backgroundColor: color.shade700,
              behavior: SnackBarBehavior.floating,
            ));
            if (state.action == 'assigned') {
              _phoneController.clear();
              setState(() => _selectedRole = null);
            }
          } else if (state is StaffActionError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: theme.colorScheme.error,
              behavior: SnackBarBehavior.floating,
            ));
          }
        },
        builder: (context, state) {
          if (state is StaffLoading || state is StaffInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is StaffError) {
            return _buildError(context, theme, state.message);
          }

          // StaffLoaded | StaffActionSuccess | StaffActionError — hammasi ro'yxatli
          final staff = state is StaffLoaded
              ? state.staff
              : state is StaffActionSuccess
                  ? state.staff
                  : state is StaffActionError
                      ? state.staff
                      : <StaffMember>[];

          return RefreshIndicator(
            onRefresh: () async {
              context.read<AdminStaffBloc>().add(const LoadStaff());
              // Stream'dan bitta natija kutamiz
              await context.read<AdminStaffBloc>().stream.firstWhere(
                    (s) => s is! StaffLoading,
                  );
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildAssignRoleCard(context, theme),
                const SizedBox(height: 24),
                _buildStaffList(context, theme, staff),
                const SizedBox(height: 24),
                _buildRoleDescriptions(theme),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  // ── Xatolik holati ─────────────────────────────────────────────────────────

  Widget _buildError(BuildContext context, ThemeData theme, String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 56, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () =>
                  context.read<AdminStaffBloc>().add(const LoadStaff()),
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Rol berish formasi ─────────────────────────────────────────────────────

  Widget _buildAssignRoleCard(BuildContext context, ThemeData theme) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.person_add_rounded,
                    color: theme.colorScheme.primary, size: 22),
                const SizedBox(width: 10),
                Text('Rol berish / o\'zgartirish',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 16),

            // Telefon raqam
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
                LengthLimitingTextInputFormatter(13),
              ],
              decoration: InputDecoration(
                labelText: 'Telefon raqami',
                hintText: '+998901234567',
                prefixIcon: const Icon(Icons.phone_rounded),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14),
              ),
            ),
            const SizedBox(height: 12),

            // Rol tanlash
            DropdownButtonFormField<String>(
              initialValue: _selectedRole,
              decoration: InputDecoration(
                labelText: 'Rol',
                prefixIcon: const Icon(Icons.badge_rounded),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14),
              ),
              items: [
                // Tayinlanadigan rollar
                for (final role in StaffRoles.assignableRoles)
                  DropdownMenuItem(
                    value: role,
                    child: Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: _colorFor(role),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(StaffRoles.label(role)),
                      ],
                    ),
                  ),
                // Olib tashlash opsiyasi
                const DropdownMenuItem(
                  value: '',
                  child: Row(
                    children: [
                      Icon(Icons.remove_circle_outline,
                          size: 16, color: Colors.red),
                      SizedBox(width: 10),
                      Text('Rolni olib tashlash',
                          style: TextStyle(color: Colors.red)),
                    ],
                  ),
                ),
              ],
              onChanged: (v) => setState(() => _selectedRole = v),
            ),
            const SizedBox(height: 16),

            // Saqlash tugmasi
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _onAssignRole(context),
                icon: const Icon(Icons.save_rounded, size: 20),
                label: const Text('Saqlash'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onAssignRole(BuildContext context) {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Telefon raqamini kiriting'),
        behavior: SnackBarBehavior.floating,
      ));
      return;
    }
    if (_selectedRole == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Rolni tanlang'),
        behavior: SnackBarBehavior.floating,
      ));
      return;
    }

    // Telefon raqamni normalizatsiya: +998 bilan boshlanmasa — qo'shamiz
    String normalizedPhone = phone;
    if (!phone.startsWith('+')) {
      if (phone.startsWith('998')) {
        normalizedPhone = '+$phone';
      } else {
        normalizedPhone = '+998$phone';
      }
    }

    context.read<AdminStaffBloc>().add(AssignRole(
      phone: normalizedPhone,
      role: _selectedRole!,
    ));
  }

  // ── Xodimlar ro'yxati ─────────────────────────────────────────────────────

  Widget _buildStaffList(
      BuildContext context, ThemeData theme, List<StaffMember> staff) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Joriy xodimlar',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${staff.length} ta',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onPrimaryContainer,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (staff.isEmpty)
          Card(
            elevation: 0,
            color: theme.colorScheme.surfaceContainerLow,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.people_outline_rounded,
                        size: 48,
                        color: theme.colorScheme.onSurfaceVariant
                            .withValues(alpha: 0.4)),
                    const SizedBox(height: 12),
                    Text(
                      'Hali xodim yo\'q.\nYuqoridagi forma orqali rol bering.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          ...staff.map((member) => _StaffCard(
                member: member,
                onFire: () => _confirmFire(context, theme, member),
              )),
      ],
    );
  }

  void _confirmFire(
      BuildContext context, ThemeData theme, StaffMember member) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        icon: Icon(Icons.warning_amber_rounded,
            size: 48, color: theme.colorScheme.error),
        title: const Text('Xodimni bo\'shatish'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Xodim ma'lumotlari
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: _colorFor(member.role).withValues(alpha: 0.15),
                    child: Icon(Icons.person_rounded,
                        color: _colorFor(member.role)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(member.phone,
                            style: theme.textTheme.bodyLarge
                                ?.copyWith(fontWeight: FontWeight.w600)),
                        _RoleBadge(role: member.role),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Bu amalni ortga qaytarib bo\'lmaydi.\n'
              'Barcha aktiv tokenlari darhol bekor qilinadi.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Bekor qilish'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style:
                FilledButton.styleFrom(backgroundColor: theme.colorScheme.error),
            child: const Text('Ha, bo\'shatish'),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true && context.mounted) {
        context.read<AdminStaffBloc>().add(FireStaff(
          staffId: member.id,
          staffPhone: member.phone,
        ));
      }
    });
  }

  // ── Rol tushuntirishlari ───────────────────────────────────────────────────

  Widget _buildRoleDescriptions(ThemeData theme) {
    const roles = [
      ('super_admin', Icons.shield_rounded, false),
      ('admin', Icons.admin_panel_settings_rounded, true),
      ('seller', Icons.point_of_sale_rounded, true),
      ('courier', Icons.delivery_dining_rounded, true),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Rollar haqida',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        ...roles.map((r) {
          final (role, icon, assignable) = r;
          final color = _colorFor(role);
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: assignable
                  ? color.withValues(alpha: 0.06)
                  : theme.colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: assignable
                      ? color.withValues(alpha: 0.2)
                      : theme.colorScheme.outlineVariant),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: color, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(StaffRoles.label(role),
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          if (!assignable) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text('Tayinlab bo\'lmaydi',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                      color:
                                          theme.colorScheme.onSurfaceVariant)),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        StaffRoles.descriptions[role] ?? '',
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE WIDGETS
// ═══════════════════════════════════════════════════════════════════════════════

/// Xodim kartochkasi — bitta ro'yxat elementi.
class _StaffCard extends StatelessWidget {
  final StaffMember member;
  final VoidCallback onFire;

  const _StaffCard({required this.member, required this.onFire});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = _AdminStaffPageState._colorFor(member.role);

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Avatar
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.12),
              child: Icon(Icons.person_rounded, color: color),
            ),
            const SizedBox(width: 14),

            // Ism + telefon + rol badge
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(member.displayName,
                      style: theme.textTheme.bodyLarge
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  if (member.displayName != member.phone)
                    Text(member.phone,
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  _RoleBadge(role: member.role),
                ],
              ),
            ),

            // Bo'shatish tugmasi
            IconButton.filled(
              onPressed: onFire,
              icon: const Icon(Icons.person_off_rounded, size: 20),
              tooltip: 'Bo\'shatish',
              style: IconButton.styleFrom(
                backgroundColor:
                    theme.colorScheme.errorContainer.withValues(alpha: 0.7),
                foregroundColor: theme.colorScheme.error,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Kichik rol badge (rangli fon + matn).
class _RoleBadge extends StatelessWidget {
  final String? role;

  const _RoleBadge({this.role});

  @override
  Widget build(BuildContext context) {
    final color = _AdminStaffPageState._colorFor(role);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        StaffRoles.label(role),
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
