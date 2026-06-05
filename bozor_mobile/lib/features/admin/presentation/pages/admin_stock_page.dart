import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../bloc/admin_stock_bloc.dart';
import '../../data/models/admin_stock_model.dart';
import '../../../../core/theme/app_colors.dart';
import '../widgets/admin_drawer.dart';

class AdminStockPage extends StatefulWidget {
  const AdminStockPage({super.key});

  @override
  State<AdminStockPage> createState() => _AdminStockPageState();
}

class _AdminStockPageState extends State<AdminStockPage> {
  final _minCtrl = TextEditingController(text: '0');
  final _maxCtrl = TextEditingController(text: '10');
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    context.read<AdminStockBloc>().add(LoadAdminStock());
  }

  @override
  void dispose() {
    _minCtrl.dispose();
    _maxCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  String _fmt(dynamic v) {
    if (v is double) {
      if (v == v.toInt()) return NumberFormat('#,###', 'uz_UZ').format(v.toInt()).replaceAll(',', ' ');
      return NumberFormat('#,###.##', 'uz_UZ').format(v).replaceAll(',', ' ');
    }
    return NumberFormat('#,###', 'uz_UZ').format(v).replaceAll(',', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        title: const Text('Ombor (Zaxira holati)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<AdminStockBloc>().add(LoadAdminStock()),
          ),
        ],
      ),
      body: BlocBuilder<AdminStockBloc, AdminStockState>(
        builder: (context, state) {
          final isLoading = state is AdminStockLoading;
          final isError = state is AdminStockError;
          StockStats? stats;
          List<AdminStockItem> items = [];

          if (state is AdminStockLoaded) {
            stats = state.report.stats;
            items = state.filteredItems;
          }

          return RefreshIndicator(
            onRefresh: () async {
              context.read<AdminStockBloc>().add(LoadAdminStock());
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // ─── KPI Cards ───────────────────────────────────────────────
                        _buildKpiGrid(stats, theme, isLoading),
                        const SizedBox(height: 24),

                        // ─── Filters ─────────────────────────────────────────────────
                        _buildFilters(theme),
                        const SizedBox(height: 24),

                        // ─── Items List Header ─────────────────────────────────────
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Zaxira holati',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface),
                            ),
                            Text(
                              '${items.length} ta',
                              style: TextStyle(fontSize: 14, color: theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // ─── State Handling ──────────────────────────────────────────
                        if (isLoading && items.isEmpty)
                          const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()))
                        else if (isError)
                          Center(
                            child: Padding(
                              padding: const EdgeInsets.all(40),
                              child: Column(
                                children: [
                                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                                  const SizedBox(height: 16),
                                  Text((state as AdminStockError).message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
                                ],
                              ),
                            ),
                          )
                        else if (items.isEmpty)
                          Center(
                            child: Padding(
                              padding: const EdgeInsets.all(40),
                              child: Column(
                                children: [
                                  Icon(Icons.inventory_2_outlined, size: 64, color: theme.colorScheme.outline),
                                  const SizedBox(height: 16),
                                  Text('Ma\'lumot topilmadi', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                                ],
                              ),
                            ),
                          )
                      ],
                    ),
                  ),
                ),
                // ─── Items List (Lazy Loaded) ──────────────────────────────────
                if (!isLoading && !isError && items.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _buildItemCard(items[index], theme, isDark),
                          );
                        },
                        childCount: items.length,
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildKpiGrid(StockStats? stats, ThemeData theme, bool isLoading) {
    final kpis = [
      {
        'label': 'Jami pozitsiyalar',
        'value': stats?.totalProducts ?? 0,
        'unit': 'ta',
        'icon': Icons.inventory_2,
        'color': AppColors.primary,
        'bg': AppColors.primary.withValues(alpha: 0.1),
      },
      {
        'label': 'Jami zaxira',
        'value': _fmt(stats?.totalStock ?? 0),
        'unit': 'dona',
        'icon': Icons.warehouse,
        'color': Colors.blue,
        'bg': Colors.blue.withValues(alpha: 0.1),
      },
      {
        'label': 'Ombor qiymati',
        'value': _fmt(stats?.totalValue ?? 0),
        'unit': "so'm",
        'icon': Icons.paid,
        'color': Colors.green,
        'bg': Colors.green.withValues(alpha: 0.1),
      },
      {
        'label': 'Kritik (0 dona)',
        'value': stats?.criticalCount ?? 0,
        'unit': 'ta',
        'icon': Icons.priority_high,
        'color': Colors.red,
        'bg': Colors.red.withValues(alpha: 0.1),
      },
      {
        'label': 'Kam qolgan (1–5)',
        'value': stats?.lowCount ?? 0,
        'unit': 'ta',
        'icon': Icons.warning_amber,
        'color': Colors.orange,
        'bg': Colors.orange.withValues(alpha: 0.1),
      },
    ];

    Widget buildKpiCard(Map<String, dynamic> kpi, {bool fullWidth = false}) {
      return Container(
        padding: EdgeInsets.symmetric(horizontal: fullWidth ? 16 : 12, vertical: 12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 4, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: kpi['bg'] as Color,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(kpi['icon'] as IconData, color: kpi['color'] as Color, size: fullWidth ? 24 : 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (kpi['label'] as String).toUpperCase(),
                    style: TextStyle(fontSize: fullWidth ? 11 : 9, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurfaceVariant),
                    maxLines: fullWidth ? 1 : 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  if (isLoading)
                    const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  else
                    RichText(
                      text: TextSpan(
                        text: '${kpi['value']} ',
                        style: TextStyle(fontSize: fullWidth ? 18 : 14, fontWeight: FontWeight.bold, color: kpi['color'] as Color),
                        children: [
                          TextSpan(
                            text: kpi['unit'] as String,
                            style: TextStyle(fontSize: fullWidth ? 12 : 10, fontWeight: FontWeight.normal, color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        Row(
          children: [
            Expanded(child: buildKpiCard(kpis[0])),
            const SizedBox(width: 12),
            Expanded(child: buildKpiCard(kpis[1])),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: buildKpiCard(kpis[3])),
            const SizedBox(width: 12),
            Expanded(child: buildKpiCard(kpis[4])),
          ],
        ),
        const SizedBox(height: 12),
        buildKpiCard(kpis[2], fullWidth: true),
      ],
    );
  }

  Widget _buildFilters(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Filtrlar', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: theme.colorScheme.onSurface)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildTextField(
                  label: 'Min. qoldiq',
                  controller: _minCtrl,
                  keyboardType: TextInputType.number,
                  theme: theme,
                  onChanged: (v) {
                    final min = int.tryParse(v);
                    context.read<AdminStockBloc>().add(UpdateStockFilters(minStock: min));
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildTextField(
                  label: 'Max. qoldiq',
                  controller: _maxCtrl,
                  keyboardType: TextInputType.number,
                  theme: theme,
                  onChanged: (v) {
                    final max = int.tryParse(v);
                    context.read<AdminStockBloc>().add(UpdateStockFilters(maxStock: max));
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildTextField(
            label: 'Qidirish (Nomi, SKU)',
            controller: _searchCtrl,
            icon: Icons.search,
            theme: theme,
            onChanged: (v) {
              context.read<AdminStockBloc>().add(UpdateStockFilters(searchQuery: v));
            },
          ),
        ],
      ),
    );
  }

  Widget _buildTextField({
    required String label,
    required TextEditingController controller,
    required ThemeData theme,
    TextInputType? keyboardType,
    IconData? icon,
    required Function(String) onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          style: const TextStyle(fontSize: 14),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            prefixIcon: icon != null ? Icon(icon, size: 20) : null,
            filled: true,
            fillColor: theme.colorScheme.surface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: AppColors.primary),
            ),
          ),
          onChanged: onChanged,
        ),
      ],
    );
  }

  Widget _buildItemCard(AdminStockItem item, ThemeData theme, bool isDark) {
    Color statusBg;
    Color statusText;
    String statusLabel;

    if (item.stock == 0) {
      statusBg = Colors.red.withValues(alpha: 0.15);
      statusText = Colors.red;
      statusLabel = 'Tugagan';
    } else if (item.stock <= 5) {
      statusBg = Colors.orange.withValues(alpha: 0.15);
      statusText = Colors.orange;
      statusLabel = 'Juda kam';
    } else if (item.stock <= 10) {
      statusBg = Colors.amber.withValues(alpha: 0.15);
      statusText = Colors.amber.shade900;
      statusLabel = 'Kam';
    } else {
      statusBg = Colors.green.withValues(alpha: 0.15);
      statusText = Colors.green;
      statusLabel = 'Yetarli';
    }

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 5, offset: const Offset(0, 2)),
        ],
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          // Row 1: Image + Details
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Image
              Container(
                height: 60,
                width: 60,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainer,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
                ),
                child: item.image != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(item.image!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.image_not_supported, color: Colors.grey)),
                      )
                    : const Icon(Icons.inventory_2_outlined, color: Colors.grey),
              ),
              const SizedBox(width: 12),
              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.name,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (item.variantInfo != null && item.variantInfo!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          item.variantInfo!,
                          style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ),
                    const SizedBox(height: 6),
                    Text(
                      '${_fmt(item.price)} so\'m',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.primary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          // Row 2: SKU + Stock Status
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('SKU', style: TextStyle(fontSize: 10, color: theme.colorScheme.onSurfaceVariant)),
                    Text(
                      item.sku.isEmpty ? '-' : item.sku,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Row(
                children: [
                  // Stock Count
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Qoldiq', style: TextStyle(fontSize: 10, color: theme.colorScheme.onSurfaceVariant)),
                      Text('${item.stock} dona', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(width: 12),
                  // Badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusBg,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(statusLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: statusText)),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
