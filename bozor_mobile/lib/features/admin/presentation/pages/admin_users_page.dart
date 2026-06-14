/// AdminUsersPage — Foydalanuvchilar ro'yxati.
///
/// SAYTDAGI bilan IDENTIK funksiyalar:
///   • Qidiruv (telefon/ism)
///   • Filter: faol/o'chirilgan, kredit ban
///   • Ro'yxat: avatar, ism, telefon, buyurtmalar soni, jami xarid
///   • Holat badge'lari: faol, tasdiqlangan, xodim, kredit ban
///
/// MOBILE'GA MAKSIMAL MOSLASHTIRILGAN:
///   • Infinite scroll (Instagram/Telegram pattern)
///   • Pull-to-refresh
///   • Tap → batafsil sahifa
///   • Sliver-based layout (smooth scroll)
///   • Filter chip'lari yuqorida (badge'lar)
///   • SafeArea + adaptive padding
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/admin_user_model.dart';
import '../bloc/admin_users_bloc.dart';
import '../widgets/admin_drawer.dart';

class AdminUsersPage extends StatefulWidget {
  const AdminUsersPage({super.key});

  @override
  State<AdminUsersPage> createState() => _AdminUsersPageState();
}

class _AdminUsersPageState extends State<AdminUsersPage> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();
  bool _showSearch = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  /// Infinite scroll mantiq — pastga 300px qolganida keyingi sahifani yuklash.
  /// Bu hozirgi viewport tugashidan oldin loading boshlanadi, foydalanuvchi
  /// hech qanday "joyiga turish" jarayonini ko'rmaydi.
  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 300) {
      context.read<AdminUsersBloc>().add(const LoadMoreUsers());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      drawer: const AdminDrawer(),
      appBar: AppBar(
        title: _showSearch
            ? TextField(
                controller: _searchController,
                autofocus: true,
                style: TextStyle(color: theme.colorScheme.onSurface),
                decoration: InputDecoration(
                  hintText: 'Telefon yoki ism...',
                  border: InputBorder.none,
                  hintStyle:
                      TextStyle(color: theme.colorScheme.onSurfaceVariant),
                ),
                onChanged: (v) =>
                    context.read<AdminUsersBloc>().add(SearchUsers(v)),
              )
            : const Text('Foydalanuvchilar'),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search),
            tooltip: _showSearch ? 'Qidiruvni yopish' : 'Qidirish',
            onPressed: () {
              setState(() {
                _showSearch = !_showSearch;
                if (!_showSearch) {
                  _searchController.clear();
                  context.read<AdminUsersBloc>().add(const SearchUsers(''));
                }
              });
            },
          ),
          BlocBuilder<AdminUsersBloc, AdminUsersState>(
            buildWhen: (p, c) =>
                p.isActiveFilter != c.isActiveFilter ||
                p.creditBannedFilter != c.creditBannedFilter,
            builder: (context, state) {
              final hasFilter =
                  state.isActiveFilter != null || state.creditBannedFilter != null;
              return Stack(
                children: [
                  IconButton(
                    icon: const Icon(Icons.filter_list),
                    tooltip: 'Filter',
                    onPressed: () => _openFilterSheet(context, state),
                  ),
                  if (hasFilter)
                    Positioned(
                      right: 10,
                      top: 10,
                      child: Container(
                        width: 9,
                        height: 9,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary,
                          shape: BoxShape.circle,
                          border: Border.all(
                              color: theme.colorScheme.surface, width: 1.5),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
      body: BlocBuilder<AdminUsersBloc, AdminUsersState>(
        builder: (context, state) {
          if (state.status == AdminUsersStatus.initial ||
              (state.status == AdminUsersStatus.loading &&
                  state.users.isEmpty)) {
            return const _LoadingList();
          }
          if (state.status == AdminUsersStatus.error && state.users.isEmpty) {
            return _ErrorView(
              error: state.error ?? "Noma'lum xato",
              onRetry: () =>
                  context.read<AdminUsersBloc>().add(const LoadUsers()),
            );
          }
          if (state.users.isEmpty) {
            return _EmptyView(hasFilters: state.hasActiveFilters);
          }

          return RefreshIndicator(
            onRefresh: () async {
              context.read<AdminUsersBloc>().add(const RefreshUsers());
              // Yangi state'ni kutamiz
              await context
                  .read<AdminUsersBloc>()
                  .stream
                  .firstWhere((s) => !s.isRefreshing);
            },
            child: CustomScrollView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                // Statistika header
                SliverToBoxAdapter(
                  child: _StatsHeader(
                    totalCount: state.totalCount,
                    loadedCount: state.users.length,
                  ),
                ),
                // Aktiv filter chip'lari
                if (state.hasActiveFilters)
                  SliverToBoxAdapter(
                    child: _ActiveFiltersBar(state: state),
                  ),
                // Ro'yxat
                SliverList.builder(
                  itemCount: state.users.length,
                  itemBuilder: (context, index) {
                    final user = state.users[index];
                    return _UserListTile(user: user);
                  },
                ),
                // Loading more indicator
                SliverToBoxAdapter(
                  child: _LoadMoreFooter(
                    isLoadingMore: state.isLoadingMore,
                    hasMore: state.hasMore,
                    totalCount: state.totalCount,
                    loadedCount: state.users.length,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _openFilterSheet(
      BuildContext context, AdminUsersState state) async {
    final theme = Theme.of(context);
    bool? activeF = state.isActiveFilter;
    bool? banF = state.creditBannedFilter;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) {
        return StatefulBuilder(
          builder: (sheetCtx, setSheet) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  top: 20,
                  bottom: MediaQuery.of(sheetCtx).viewInsets.bottom + 20,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text(
                          'Filter',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: () {
                            setSheet(() {
                              activeF = null;
                              banF = null;
                            });
                          },
                          child: const Text('Tozalash'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Faollik holati',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        _filterChip(
                          theme,
                          label: 'Hammasi',
                          selected: activeF == null,
                          onTap: () => setSheet(() => activeF = null),
                        ),
                        _filterChip(
                          theme,
                          label: 'Faol',
                          selected: activeF == true,
                          onTap: () => setSheet(() => activeF = true),
                        ),
                        _filterChip(
                          theme,
                          label: "O'chirilgan",
                          selected: activeF == false,
                          onTap: () => setSheet(() => activeF = false),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Kredit holati',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      children: [
                        _filterChip(
                          theme,
                          label: 'Hammasi',
                          selected: banF == null,
                          onTap: () => setSheet(() => banF = null),
                        ),
                        _filterChip(
                          theme,
                          label: 'Banlangan',
                          selected: banF == true,
                          onTap: () => setSheet(() => banF = true),
                        ),
                        _filterChip(
                          theme,
                          label: 'Toza',
                          selected: banF == false,
                          onTap: () => setSheet(() => banF = false),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () {
                          context.read<AdminUsersBloc>().add(
                                FilterUsers(
                                  isActive: activeF,
                                  creditBanned: banF,
                                ),
                              );
                          Navigator.pop(sheetCtx);
                        },
                        style: FilledButton.styleFrom(
                          padding:
                              const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: const Text('Filtr qo\'llash'),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _filterChip(
    ThemeData theme, {
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: theme.colorScheme.primary.withValues(alpha: 0.15),
      checkmarkColor: theme.colorScheme.primary,
      labelStyle: TextStyle(
        color: selected
            ? theme.colorScheme.primary
            : theme.colorScheme.onSurface,
        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
      ),
      side: BorderSide(
        color: selected
            ? theme.colorScheme.primary
            : theme.colorScheme.outlineVariant,
      ),
    );
  }
}

// ── Statistika header ──────────────────────────────────────────────────────

class _StatsHeader extends StatelessWidget {
  final int totalCount;
  final int loadedCount;

  const _StatsHeader({required this.totalCount, required this.loadedCount});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.primary.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.colorScheme.primary.withValues(alpha: 0.18),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.groups, color: theme.colorScheme.primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: 'Jami: ',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  TextSpan(
                    text: '$totalCount',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  TextSpan(
                    text: ' ta foydalanuvchi',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Text(
            'Yuklangan: $loadedCount',
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Aktiv filter chip bar ──────────────────────────────────────────────────

class _ActiveFiltersBar extends StatelessWidget {
  final AdminUsersState state;
  const _ActiveFiltersBar({required this.state});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final chips = <Widget>[];

    if (state.query.isNotEmpty) {
      chips.add(_chip(
        theme,
        icon: Icons.search,
        label: '"${state.query}"',
        onRemove: () =>
            context.read<AdminUsersBloc>().add(const SearchUsers('')),
      ));
    }
    if (state.isActiveFilter != null) {
      chips.add(_chip(
        theme,
        icon: Icons.person,
        label: state.isActiveFilter == true ? 'Faol' : "O'chirilgan",
        onRemove: () => context.read<AdminUsersBloc>().add(
              FilterUsers(creditBanned: state.creditBannedFilter),
            ),
      ));
    }
    if (state.creditBannedFilter != null) {
      chips.add(_chip(
        theme,
        icon: Icons.credit_card_off,
        label:
            state.creditBannedFilter == true ? 'Kredit ban' : 'Kredit toza',
        onRemove: () => context.read<AdminUsersBloc>().add(
              FilterUsers(isActive: state.isActiveFilter),
            ),
      ));
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Wrap(spacing: 6, runSpacing: 6, children: chips),
    );
  }

  Widget _chip(
    ThemeData theme, {
    required IconData icon,
    required String label,
    required VoidCallback onRemove,
  }) {
    return Chip(
      avatar: Icon(icon, size: 16, color: theme.colorScheme.primary),
      label: Text(label, style: const TextStyle(fontSize: 12)),
      onDeleted: onRemove,
      deleteIcon: const Icon(Icons.close, size: 16),
      backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
      side: BorderSide(
        color: theme.colorScheme.primary.withValues(alpha: 0.3),
      ),
      visualDensity: VisualDensity.compact,
    );
  }
}

// ── Bitta foydalanuvchi qatori ─────────────────────────────────────────────

class _UserListTile extends StatelessWidget {
  final AdminUser user;
  const _UserListTile({required this.user});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final money = NumberFormat('#,###', 'uz_UZ');
    final dateF =
        user.dateJoined != null ? DateFormat('dd.MM.yyyy').format(user.dateJoined!) : '';

    return InkWell(
      onTap: () => context.push('/admin/users/${user.id}'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
              width: 1,
            ),
          ),
        ),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: user.isStaff
                    ? Colors.purple.withValues(alpha: 0.15)
                    : user.creditBan
                        ? theme.colorScheme.error.withValues(alpha: 0.15)
                        : theme.colorScheme.primary.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text(
                user.initial,
                style: TextStyle(
                  color: user.isStaff
                      ? Colors.purple.shade700
                      : user.creditBan
                          ? theme.colorScheme.error
                          : theme.colorScheme.primary,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 12),
            // Markaziy ma'lumot
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          user.displayName,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (!user.isActive) ...[
                        const SizedBox(width: 4),
                        _badge(
                          theme,
                          label: "O'chirilgan",
                          color: theme.colorScheme.error,
                        ),
                      ],
                      if (user.isStaff) ...[
                        const SizedBox(width: 4),
                        _badge(
                          theme,
                          label: 'Xodim',
                          color: Colors.purple,
                        ),
                      ],
                      if (user.creditBan) ...[
                        const SizedBox(width: 4),
                        _badge(
                          theme,
                          label: 'Ban',
                          color: theme.colorScheme.error,
                          icon: Icons.block,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    user.phone,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.shopping_bag_outlined,
                          size: 13,
                          color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 3),
                      Text(
                        '${user.orderCount}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Icon(Icons.payments_outlined,
                          size: 13,
                          color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 3),
                      Text(
                        "${money.format(user.totalSpent.round()).replaceAll(',', ' ')} so'm",
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const Spacer(),
                      if (dateF.isNotEmpty)
                        Text(
                          dateF,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.outline,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right,
              color: theme.colorScheme.outline,
            ),
          ],
        ),
      ),
    );
  }

  Widget _badge(
    ThemeData theme, {
    required String label,
    required Color color,
    IconData? icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 10, color: color),
            const SizedBox(width: 2),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Yana yuklash footer ────────────────────────────────────────────────────

class _LoadMoreFooter extends StatelessWidget {
  final bool isLoadingMore;
  final bool hasMore;
  final int totalCount;
  final int loadedCount;

  const _LoadMoreFooter({
    required this.isLoadingMore,
    required this.hasMore,
    required this.totalCount,
    required this.loadedCount,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (isLoadingMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Yuklanmoqda...',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      );
    }
    if (!hasMore && loadedCount > 0) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Column(
            children: [
              Icon(Icons.check_circle_outline,
                  size: 32, color: theme.colorScheme.outline),
              const SizedBox(height: 4),
              Text(
                "Hammasi ko'rsatildi ($loadedCount)",
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.outline,
                ),
              ),
            ],
          ),
        ),
      );
    }
    return const SizedBox(height: 20);
  }
}

// ── Loading list (skeleton) ────────────────────────────────────────────────

class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView.builder(
      itemCount: 8,
      itemBuilder: (_, __) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3),
            ),
          ),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor:
                  theme.colorScheme.surfaceContainerHighest,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 120,
                    height: 12,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    width: 90,
                    height: 10,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(4),
                    ),
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

// ── Xato view ──────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
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
            Text(error,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Bo'sh view ─────────────────────────────────────────────────────────────

class _EmptyView extends StatelessWidget {
  final bool hasFilters;
  const _EmptyView({required this.hasFilters});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(Icons.person_off_outlined,
            size: 80, color: theme.colorScheme.outline),
        const SizedBox(height: 12),
        Text(
          hasFilters ? 'Hech narsa topilmadi' : "Foydalanuvchi yo'q",
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          hasFilters
              ? "Filter shartlarini o'zgartirib ko'ring"
              : 'Yangi mijozlar paydo bo\'lganida shu yerda ko\'rinadi',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.outline,
          ),
        ),
      ],
    );
  }
}
