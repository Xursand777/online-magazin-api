import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../data/models/admin_master_model.dart';
import '../bloc/admin_master_bloc.dart';
import '../widgets/admin_drawer.dart';

/// Admin → Ustalar boshqaruvi sahifasi.
/// Saytdagi MastersTab bilan bir xil funksional:
///   • Chegirma foizini boshqarish (GlobalSetting orqali)
///   • Usta qo'shish (telefon raqami bo'yicha)
///   • Faollikka asoslangan chegirma tushuntirishi (4 pog'onali)
///   • Joriy ustalar ro'yxati (ism, telefon, chegirma badge)
///   • Ustadan olib tashlash (tasdiqlash dialog bilan)
class AdminMastersPage extends StatefulWidget {
  const AdminMastersPage({super.key});

  @override
  State<AdminMastersPage> createState() => _AdminMastersPageState();
}

class _AdminMastersPageState extends State<AdminMastersPage> {
  final _phoneController    = TextEditingController();
  final _discountController = TextEditingController();

  // Server'dan kelgan asl qiymat — "dirty" tekshiruvi uchun
  double? _serverDiscountPercent;

  static const Color _masterColor = Color(0xFFD97706); // Amber-700

  @override
  void dispose() {
    _phoneController.dispose();
    _discountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('Ustalar',
            style: theme.textTheme.headlineMedium
                ?.copyWith(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Yangilash',
            onPressed: () =>
                context.read<AdminMasterBloc>().add(const LoadMasters()),
          ),
        ],
      ),
      drawer: const AdminDrawer(),
      body: BlocConsumer<AdminMasterBloc, AdminMasterState>(
        listener: (context, state) {
          // Chegirma foizi inputini sinxronlashtirish
          if (state is MasterLoaded) {
            _syncDiscountInput(state.discountPercent);
          } else if (state is MasterActionSuccess) {
            _syncDiscountInput(state.discountPercent);
          }

          // SnackBar xabarlari
          if (state is MasterActionSuccess) {
            final color = state.action == 'removed'
                ? Colors.orange
                : const Color(0xFF16A34A);
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.detail),
              backgroundColor: color,
              behavior: SnackBarBehavior.floating,
            ));
            if (state.action == 'assigned') {
              _phoneController.clear();
            }
          } else if (state is MasterActionError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(state.message),
              backgroundColor: theme.colorScheme.error,
              behavior: SnackBarBehavior.floating,
            ));
          }
        },
        builder: (context, state) {
          if (state is MasterLoading || state is MasterInitial) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is MasterError) {
            return _buildError(context, theme, state.message);
          }

          final masters = state is MasterLoaded
              ? state.masters
              : state is MasterActionSuccess
                  ? state.masters
                  : state is MasterActionError
                      ? state.masters
                      : <MasterMember>[];

          final discount = state is MasterLoaded
              ? state.discountPercent
              : state is MasterActionSuccess
                  ? state.discountPercent
                  : state is MasterActionError
                      ? state.discountPercent
                      : 5.0;

          return RefreshIndicator(
            onRefresh: () async {
              context.read<AdminMasterBloc>().add(const LoadMasters());
              await context.read<AdminMasterBloc>().stream.firstWhere(
                    (s) => s is! MasterLoading,
                  );
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header
                _buildHeader(theme, discount),
                const SizedBox(height: 20),
                // 1. Chegirma foizi
                _buildDiscountCard(context, theme),
                const SizedBox(height: 16),
                // 2. Usta qo'shish
                _buildAssignCard(context, theme),
                const SizedBox(height: 20),
                // 3. Faollikka asoslangan chegirma tushuntirishi
                _buildActivityExplanation(theme, discount),
                const SizedBox(height: 20),
                // 4. Joriy ustalar
                _buildMastersList(context, theme, masters, discount),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  void _syncDiscountInput(double percent) {
    _serverDiscountPercent = percent;
    final text = percent == percent.roundToDouble()
        ? percent.toInt().toString()
        : percent.toStringAsFixed(1);
    if (_discountController.text != text) {
      _discountController.text = text;
    }
  }

  bool get _isDiscountDirty {
    if (_serverDiscountPercent == null) return false;
    final input = double.tryParse(_discountController.text);
    if (input == null) return false;
    return (input - _serverDiscountPercent!).abs() > 0.001;
  }

  // ── Header ──────────────────────────────────────────────────────────────

  Widget _buildHeader(ThemeData theme, double discount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _masterColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.construction_rounded,
                  color: _masterColor, size: 26),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text('Ustalar boshqaruvi',
                  style: theme.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Ustalar ${discount.toStringAsFixed(discount == discount.roundToDouble() ? 0 : 1)}%'
          ' gacha chegirma oladi (chegirmadagi mahsulotlardan ham). '
          'Foiz ustaning xarid faolligiga qarab dinamik o\'zgaradi.',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  // ── Xatolik holati ──────────────────────────────────────────────────────

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
                  context.read<AdminMasterBloc>().add(const LoadMasters()),
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }

  // ── 1. Chegirma foizi kartochkasi ─────────────────────────────────────

  Widget _buildDiscountCard(BuildContext context, ThemeData theme) {
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
                Icon(Icons.percent_rounded,
                    color: _masterColor, size: 22),
                const SizedBox(width: 10),
                Text('Chegirma foizi',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Bu foiz barcha ustalarga qo\'llaniladi. O\'zgartirilsa, darhol kuchga kiradi.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _discountController,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d{0,2}\.?\d{0,1}')),
                    ],
                    onChanged: (_) => setState(() {}), // dirty tekshiruvi
                    decoration: InputDecoration(
                      suffixText: '%',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  onPressed: _isDiscountDirty
                      ? () {
                          final value =
                              double.tryParse(_discountController.text);
                          if (value == null || value < 0 || value > 90) {
                            ScaffoldMessenger.of(context)
                                .showSnackBar(const SnackBar(
                              content:
                                  Text('Foiz 0 dan 90 gacha bo\'lishi kerak'),
                              behavior: SnackBarBehavior.floating,
                            ));
                            return;
                          }
                          context
                              .read<AdminMasterBloc>()
                              .add(UpdateMasterDiscount(percent: value));
                        }
                      : null,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Saqlash'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── 2. Usta qo'shish kartochkasi ─────────────────────────────────────

  Widget _buildAssignCard(BuildContext context, ThemeData theme) {
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
                Text('Usta qo\'shish',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 14),
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
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => _onAssign(context),
                icon: const Icon(Icons.construction_rounded, size: 20),
                label: const Text('Usta qilish'),
                style: FilledButton.styleFrom(
                  backgroundColor: _masterColor,
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

  void _onAssign(BuildContext context) {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Telefon raqamini kiriting'),
        behavior: SnackBarBehavior.floating,
      ));
      return;
    }

    String normalizedPhone = phone;
    if (!phone.startsWith('+')) {
      if (phone.startsWith('998')) {
        normalizedPhone = '+$phone';
      } else {
        normalizedPhone = '+998$phone';
      }
    }

    context.read<AdminMasterBloc>().add(AssignMaster(phone: normalizedPhone));
  }

  // ── 3. Faollikka asoslangan chegirma tushuntirishi ────────────────────

  Widget _buildActivityExplanation(ThemeData theme, double basePercent) {
    final tiers = MasterDiscountTiers.calculate(basePercent);

    return Card(
      elevation: 0,
      color: _masterColor.withValues(alpha: 0.06),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: _masterColor.withValues(alpha: 0.2)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.trending_up_rounded,
                    color: _masterColor, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Faollikka asoslangan chegirma (4 pog\'onali)',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: _masterColor,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Bazaviy foiz ustaning xarid chastotasiga qarab dinamik moslashadi:',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 14),

            // Tier grid — 2 ustunli
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: tiers.map((tier) {
                return SizedBox(
                  width: (MediaQuery.of(context).size.width - 80) / 2,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: tier.isWelcome
                            ? _masterColor.withValues(alpha: 0.4)
                            : theme.colorScheme.outlineVariant,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tier.percentText,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: tier.percent > 0
                                ? _masterColor
                                : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          tier.label,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        if (tier.isWelcome)
                          Text(
                            'xush kelibsiz',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: _masterColor,
                              fontWeight: FontWeight.w600,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 16),
            // Adolatli tiklanish tushuntirishi
            _buildExplanationItem(
              theme,
              icon: Icons.auto_graph_rounded,
              title: 'Adolatli tiklanish',
              description:
                  'Chegirma harakatsizlik paytida tez tushadi, lekin har xaridda '
                  'faqat +1 daraja ko\'tariladi (bir zumda yuqoriga emas).',
            ),
            const SizedBox(height: 10),
            _buildExplanationItem(
              theme,
              icon: Icons.flight_land_rounded,
              title: 'Yumshoq qo\'nish',
              description:
                  'Avval sodiq usta (3-4 daraja) tanaffusdan keyin 0 ga tushmaydi — '
                  '14 kungacha: yarim daraja, 15-28 kun: chorak daraja.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExplanationItem(
    ThemeData theme, {
    required IconData icon,
    required String title,
    required String description,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: _masterColor.withValues(alpha: 0.7)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: theme.textTheme.labelLarge
                      ?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(description,
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
      ],
    );
  }

  // ── 4. Joriy ustalar ro'yxati ─────────────────────────────────────────

  Widget _buildMastersList(BuildContext context, ThemeData theme,
      List<MasterMember> masters, double discount) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Joriy ustalar',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _masterColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${masters.length} ta usta',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: _masterColor,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (masters.isEmpty)
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
                    Icon(Icons.construction_outlined,
                        size: 48,
                        color: theme.colorScheme.onSurfaceVariant
                            .withValues(alpha: 0.4)),
                    const SizedBox(height: 12),
                    Text(
                      'Hali usta yo\'q.\nYuqoridagi forma orqali qo\'shing.',
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
          ...masters.map((master) => _MasterCard(
                master: master,
                discountPercent: discount,
                onRemove: () =>
                    _confirmRemove(context, theme, master, discount),
              )),
      ],
    );
  }

  void _confirmRemove(BuildContext context, ThemeData theme,
      MasterMember master, double discount) {
    final discountText = discount == discount.roundToDouble()
        ? '${discount.toInt()}%'
        : '${discount.toStringAsFixed(1)}%';

    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        icon: Icon(Icons.warning_amber_rounded,
            size: 48, color: theme.colorScheme.error),
        title: const Text('Ustadan olib tashlash'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Chegirma huquqi bekor qilinadi',
              style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.error,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            // Usta ma'lumotlari
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: _masterColor.withValues(alpha: 0.15),
                    child: const Icon(Icons.construction_rounded,
                        color: _masterColor),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(master.displayName,
                            style: theme.textTheme.bodyLarge
                                ?.copyWith(fontWeight: FontWeight.w600)),
                        Text(master.phone,
                            style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '${master.phone} ni usta ro\'yxatidan olib tashlaysizmi?\n'
              'Keyingi xaridlarida $discountText chegirma qo\'llanilmaydi.',
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
            style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.error),
            child: const Text('Ha, olib tashlash'),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true && context.mounted) {
        context.read<AdminMasterBloc>().add(RemoveMaster(
          masterId: master.id,
          masterPhone: master.phone,
        ));
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE WIDGETS
// ═══════════════════════════════════════════════════════════════════════════════

/// Usta kartochkasi — bitta ro'yxat elementi.
class _MasterCard extends StatelessWidget {
  final MasterMember master;
  final double discountPercent;
  final VoidCallback onRemove;

  const _MasterCard({
    required this.master,
    required this.discountPercent,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const color = _AdminMastersPageState._masterColor;
    final discountText = discountPercent == discountPercent.roundToDouble()
        ? '${discountPercent.toInt()}%'
        : '${discountPercent.toStringAsFixed(1)}%';

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
              child: const Icon(Icons.construction_rounded, color: color),
            ),
            const SizedBox(width: 14),

            // Ism + telefon
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(master.displayName,
                      style: theme.textTheme.bodyLarge
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  if (master.displayName != master.phone)
                    Text(master.phone,
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  // Chegirma badge
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '$discountText chegirma',
                      style: const TextStyle(
                        color: color,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Olib tashlash tugmasi
            IconButton.filled(
              onPressed: onRemove,
              icon: const Icon(Icons.person_off_rounded, size: 20),
              tooltip: 'Olib tashlash',
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
