/// AdminUserDetailPage — bitta foydalanuvchining batafsil ko'rinishi.
///
/// SAYTDAGI bilan IDENTIK:
///   • Asosiy ma'lumotlar (telefon, ism, ro'yxat sanasi, oxirgi kirish)
///   • Statistika (buyurtmalar, jami xarid)
///   • Holat badge'lari (faol, tasdiqlangan, xodim, kredit ban)
///   • Oxirgi 10 buyurtma
///   • Amallar: aktivlik almashtirish, kredit ban olib tashlash
///
/// MOBILE PROFESSIONAL DIZAYN:
///   • Hero avatar
///   • Quick stats cards
///   • Pull-to-refresh
///   • Konfirmatsiya dialog'lari
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/di/injection_container.dart';
import '../../data/models/admin_user_model.dart';
import '../../data/repositories/admin_users_repository.dart';
import '../bloc/admin_users_bloc.dart';

class AdminUserDetailPage extends StatefulWidget {
  final int userId;

  const AdminUserDetailPage({super.key, required this.userId});

  @override
  State<AdminUserDetailPage> createState() => _AdminUserDetailPageState();
}

class _AdminUserDetailPageState extends State<AdminUserDetailPage> {
  late final AdminUsersRepository _repo;
  AdminUserDetail? _user;
  String? _error;
  bool _isLoading = true;
  bool _isWorking = false; // toggle-active yoki lift-ban

  @override
  void initState() {
    super.initState();
    _repo = sl<AdminUsersRepository>();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final detail = await _repo.getUserDetail(widget.userId);
      if (!mounted) return;
      setState(() {
        _user = detail;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _repo.parseError(e);
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleActive() async {
    if (_user == null) return;
    final newState = !_user!.isActive;
    // SAYTDAGI bilan IDENTIK terminologiya:
    //   is_active=true   → "Bloklash" (qizil)
    //   is_active=false  → "Faollashtirish" (yashil)
    // Bu DELETE emas — foydalanuvchi ma'lumotlari va buyurtmalari saqlanadi,
    // faqat tizimga kira olmaydigan holatga o'tkaziladi (is_active=false).
    final ok = await _confirm(
      title: newState
          ? 'Foydalanuvchini faollashtirish?'
          : 'Foydalanuvchini bloklash?',
      message: newState
          ? "Bu foydalanuvchi yana tizimga kira oladi va buyurtma bera oladi.\n\n"
              "Ma'lumotlar saqlangan — hech narsa o'chirilmagan."
          : "Bu foydalanuvchi tizimga kira olmaydi va yangi buyurtma bera olmaydi.\n\n"
              "Eski buyurtmalar va ma'lumotlar saqlanib qoladi. Keyinroq qayta faollashtirish mumkin.",
      confirmLabel: newState ? 'Faollashtirish' : 'Bloklash',
      destructive: !newState,
    );
    if (!ok) return;

    setState(() => _isWorking = true);
    try {
      await _repo.toggleActive(widget.userId);
      // List'ni yangilash kerak — bloc state'iga signal yuboramiz
      if (mounted) {
        try {
          context.read<AdminUsersBloc>().add(const RefreshUsers());
        } catch (_) {
          // Bloc topilmasa (push navigation) — muhim emas
        }
      }
      await _load();
      if (mounted) {
        // Saytdagi toast bilan bir xil: 'Faollashtirildi' yoki 'Bloklandi'
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(newState ? 'Faollashtirildi' : 'Bloklandi'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_repo.parseError(e))),
      );
    } finally {
      if (mounted) setState(() => _isWorking = false);
    }
  }

  Future<void> _liftCreditBan() async {
    if (_user == null) return;
    final reasonCtrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text("Kredit ban'ni olib tashlash"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Mijozga 1 ta qayta imkoniyat beriladi. Bir martalik xato qilsa darhol qaytib ban'ga olinadi.",
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonCtrl,
                decoration: const InputDecoration(
                  labelText: 'Sabab (ixtiyoriy)',
                  hintText: 'Masalan: telefon orqali to\'ladi',
                ),
                maxLines: 2,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, null),
              child: const Text('Bekor qilish'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(ctx, reasonCtrl.text.trim()),
              child: const Text('Ban olib tashlash'),
            ),
          ],
        );
      },
    );
    if (reason == null) return;

    setState(() => _isWorking = true);
    try {
      await _repo.liftCreditBan(widget.userId, reason);
      if (mounted) {
        try {
          context.read<AdminUsersBloc>().add(const RefreshUsers());
        } catch (_) {}
      }
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Kredit ban olib tashlandi"),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_repo.parseError(e))),
      );
    } finally {
      if (mounted) setState(() => _isWorking = false);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
    bool destructive = false,
  }) async {
    final theme = Theme.of(context);
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Bekor qilish'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: destructive
                  ? FilledButton.styleFrom(
                      backgroundColor: theme.colorScheme.error,
                    )
                  : null,
              child: Text(confirmLabel),
            ),
          ],
        );
      },
    );
    return res == true;
  }

  Future<void> _callPhone() async {
    if (_user == null) return;
    final phone = _user!.phone.replaceAll(RegExp(r'\s+'), '');
    final uri = Uri.parse('tel:$phone');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Foydalanuvchi'),
        actions: [
          if (_user != null)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _isLoading ? null : _load,
              tooltip: 'Yangilash',
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildError()
              : _user == null
                  ? const SizedBox.shrink()
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: _buildContent(),
                    ),
    );
  }

  Widget _buildError() {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline,
                size: 64, color: theme.colorScheme.error),
            const SizedBox(height: 12),
            Text(_error!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    final theme = Theme.of(context);
    final u = _user!;
    final money = NumberFormat('#,###', 'uz_UZ');
    final fullDate = DateFormat('dd MMM yyyy, HH:mm');

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Hero avatar + ism
          _HeroHeader(user: u, onCall: _callPhone),
          const SizedBox(height: 16),

          // Holat badge'lari
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _statusChip(theme,
                  icon: u.isActive ? Icons.check_circle : Icons.cancel,
                  label: u.isActive ? 'Faol' : "O'chirilgan",
                  color: u.isActive ? Colors.green : theme.colorScheme.error),
              _statusChip(theme,
                  icon: u.isVerified ? Icons.verified : Icons.help_outline,
                  label: u.isVerified ? 'Tasdiqlangan' : 'Tasdiqlanmagan',
                  color: u.isVerified ? Colors.blue : Colors.orange),
              if (u.isStaff)
                _statusChip(theme,
                    icon: Icons.shield,
                    label: 'Xodim',
                    color: Colors.purple),
              if (u.creditBan)
                _statusChip(theme,
                    icon: Icons.block,
                    label: 'Kredit ban',
                    color: theme.colorScheme.error),
            ],
          ),
          const SizedBox(height: 20),

          // Statistika kartalari
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  icon: Icons.shopping_bag,
                  label: 'Buyurtmalar',
                  value: '${u.orderCount}',
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  icon: Icons.payments,
                  label: 'Jami xarid',
                  value:
                      "${money.format(u.totalSpent.round()).replaceAll(',', ' ')} so'm",
                  color: Colors.green.shade700,
                  isCurrency: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Asosiy ma'lumotlar
          _InfoSection(
            title: "Asosiy ma'lumotlar",
            children: [
              _InfoRow(label: 'ID', value: '#${u.id}'),
              _InfoRow(label: 'Telefon', value: u.phone),
              if (u.firstName.isNotEmpty)
                _InfoRow(label: 'Ism', value: u.firstName),
              if (u.lastName.isNotEmpty)
                _InfoRow(label: 'Familya', value: u.lastName),
              _InfoRow(
                label: "Ro'yxatdan o'tdi",
                value: u.dateJoined != null
                    ? fullDate.format(u.dateJoined!)
                    : '—',
              ),
              _InfoRow(
                label: 'Oxirgi kirish',
                value: u.lastLogin != null
                    ? fullDate.format(u.lastLogin!)
                    : 'Hech qachon',
              ),
              if (u.overdueCreditCount > 0)
                _InfoRow(
                  label: 'Muddat o\'tgan',
                  value: '${u.overdueCreditCount} ta',
                  isWarning: true,
                ),
            ],
          ),
          const SizedBox(height: 16),

          // Oxirgi buyurtmalar
          _InfoSection(
            title: "Oxirgi buyurtmalar (${u.recentOrders.length})",
            children: u.recentOrders.isEmpty
                ? [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: Text(
                          "Buyurtma yo'q",
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.outline,
                          ),
                        ),
                      ),
                    ),
                  ]
                : u.recentOrders
                    .map((o) => _RecentOrderTile(order: o))
                    .toList(),
          ),
          const SizedBox(height: 20),

          // ── Amallar — saytdagi bilan IDENTIK tugmalar ─────────────────────
          // Saytda 2 ta tugma yonma-yon turadi (faqat ban bo'lsa):
          //   1. "Bloklash" (qizil) yoki "Faollashtirish" (yashil)
          //   2. "Ban hisobidan chiqarish" (sariq) — faqat creditBan=true bo'lsa
          // Mobile'da ular vertikal joylashadi (kichik ekran).
          if (u.creditBan) ...[
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _isWorking ? null : _liftCreditBan,
                icon: const Icon(Icons.lock_open),
                // Saytdagi atama: "Ban hisobidan chiqarish"
                label: const Text('Ban hisobidan chiqarish'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.amber.shade700,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
          // Saytdagi tugma:
          //   is_active=true   → "Bloklash" (Icons.block, qizil)
          //   is_active=false  → "Faollashtirish" (Icons.check_circle, yashil)
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _isWorking ? null : _toggleActive,
              icon: Icon(
                u.isActive ? Icons.block : Icons.check_circle,
              ),
              label: Text(
                u.isActive ? 'Bloklash' : 'Faollashtirish',
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor:
                    u.isActive ? theme.colorScheme.error : Colors.green,
                side: BorderSide(
                  color: u.isActive
                      ? theme.colorScheme.error
                      : Colors.green,
                ),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _statusChip(
    ThemeData theme, {
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Hero header ────────────────────────────────────────────────────────────

class _HeroHeader extends StatelessWidget {
  final AdminUserDetail user;
  final VoidCallback onCall;

  const _HeroHeader({required this.user, required this.onCall});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mainColor = user.creditBan
        ? theme.colorScheme.error
        : user.isStaff
            ? Colors.purple
            : theme.colorScheme.primary;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            mainColor.withValues(alpha: 0.15),
            mainColor.withValues(alpha: 0.05),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: mainColor.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: mainColor,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              user.initial,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  user.displayName,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  user.phone,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onCall,
            icon: Icon(Icons.phone, color: mainColor),
            style: IconButton.styleFrom(
              backgroundColor: theme.colorScheme.surface,
              padding: const EdgeInsets.all(12),
            ),
            tooltip: "Qo'ng'iroq",
          ),
        ],
      ),
    );
  }
}

// ── Stat card ──────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final bool isCurrency;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.isCurrency = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 6),
              Text(
                label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: isCurrency ? 14 : 22,
              fontWeight: FontWeight.bold,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ── Info section ───────────────────────────────────────────────────────────

class _InfoSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _InfoSection({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ),
          const Divider(height: 1),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isWarning;

  const _InfoRow({
    required this.label,
    required this.value,
    this.isWarning = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color:
                    isWarning ? theme.colorScheme.error : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Recent order tile ──────────────────────────────────────────────────────

class _RecentOrderTile extends StatelessWidget {
  final AdminUserRecentOrder order;
  const _RecentOrderTile({required this.order});

  static const _statusLabels = {
    'PENDING': 'Yangi',
    'AWAITING_PAYMENT': "To'lov kutilmoqda",
    'CONFIRMED': 'Tasdiqlangan',
    'PACKING': "Yig'ilmoqda",
    'SHIPPING': "Yo'lda",
    'DELIVERED': 'Yetkazildi',
    'RECEIVED': 'Topshirildi',
    'CANCELLED_BY_USER': 'Bekor qildi',
    'CANCELLED_BY_ADMIN': 'Admin bekor qildi',
    'SYSTEM_AUTO_CANCEL': 'Avtomat bekor',
  };

  static const _statusColors = {
    'PENDING': Color(0xFFEAB308),
    'AWAITING_PAYMENT': Color(0xFFEAB308),
    'CONFIRMED': Color(0xFF3B82F6),
    'PACKING': Color(0xFF6366F1),
    'SHIPPING': Color(0xFF8B5CF6),
    'DELIVERED': Color(0xFF22C55E),
    'RECEIVED': Color(0xFF16A34A),
    'CANCELLED_BY_USER': Color(0xFFEF4444),
    'CANCELLED_BY_ADMIN': Color(0xFFEF4444),
    'SYSTEM_AUTO_CANCEL': Color(0xFFEF4444),
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final money = NumberFormat('#,###', 'uz_UZ');
    final dateF = order.createdAt != null
        ? DateFormat('dd.MM.yy HH:mm').format(order.createdAt!)
        : '';
    final color = _statusColors[order.status] ?? theme.colorScheme.outline;

    return InkWell(
      onTap: () => context.push('/admin/orders'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3),
            ),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 36,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Text(
                        '#${order.id}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (order.isCredit)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.amber.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'NASIYA',
                            style: TextStyle(
                              fontSize: 8,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFFB45309),
                            ),
                          ),
                        ),
                      const Spacer(),
                      Text(
                        dateF,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        _statusLabels[order.status] ?? order.status,
                        style: TextStyle(
                          color: color,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        "${money.format(order.totalPrice.round()).replaceAll(',', ' ')} so'm",
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
