import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../data/models/admin_report_model.dart';
import '../bloc/admin_report_bloc.dart';
import '../widgets/admin_drawer.dart';

class AdminReportPage extends StatefulWidget {
  const AdminReportPage({super.key});

  @override
  State<AdminReportPage> createState() => _AdminReportPageState();
}

class _AdminReportPageState extends State<AdminReportPage> {
  final _searchController = TextEditingController();
  final _ordersScrollController = ScrollController();
  final String _today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final String _monthStart = DateFormat('yyyy-MM-dd').format(DateTime(DateTime.now().year, DateTime.now().month, 1));
  final String _yearStart = DateFormat('yyyy-MM-dd').format(DateTime(DateTime.now().year, 1, 1));

  @override
  void initState() {
    super.initState();
    _ordersScrollController.addListener(_onOrdersScroll);
  }

  void _onOrdersScroll() {
    if (_ordersScrollController.position.pixels >= _ordersScrollController.position.maxScrollExtent - 200) {
      context.read<AdminReportBloc>().add(LoadMoreReportOrders());
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _ordersScrollController.dispose();
    super.dispose();
  }

  void _setQuickPeriod(String preset) {
    final bloc = context.read<AdminReportBloc>();
    if (preset == 'today') {
      bloc.add(ChangeReportPeriod(dateFrom: _today, dateTo: _today, period: 'daily'));
    } else if (preset == 'month') {
      bloc.add(ChangeReportPeriod(dateFrom: _monthStart, dateTo: _today, period: 'daily'));
    } else if (preset == 'year') {
      bloc.add(ChangeReportPeriod(dateFrom: _yearStart, dateTo: _today, period: 'monthly'));
    } else {
      bloc.add(ChangeReportPeriod(dateFrom: null, dateTo: null, period: 'monthly'));
    }
  }

  Future<void> _selectDate(BuildContext context, bool isFrom) async {
    final bloc = context.read<AdminReportBloc>();
    final initialStr = isFrom ? bloc.state.dateFrom : bloc.state.dateTo;
    final initialDate = initialStr != null ? DateTime.tryParse(initialStr) ?? DateTime.now() : DateTime.now();

    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xFF0A7C55),
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      final formatted = DateFormat('yyyy-MM-dd').format(picked);
      if (isFrom) {
        bloc.add(ChangeReportPeriod(dateFrom: formatted, dateTo: bloc.state.dateTo, period: bloc.state.period));
      } else {
        bloc.add(ChangeReportPeriod(dateFrom: bloc.state.dateFrom, dateTo: formatted, period: bloc.state.period));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: const Color(0xFF063F2B),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Hisobotlar',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Yangilash',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              context.read<AdminReportBloc>().add(LoadReportData());
            },
          ),
        ],
      ),
      body: BlocConsumer<AdminReportBloc, AdminReportState>(
        listener: (context, state) {},
        builder: (context, state) {
          if (state.isLoading && state.data == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.error != null && state.data == null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(state.error!, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => context.read<AdminReportBloc>().add(LoadReportData()),
                    child: const Text('Qayta urinish'),
                  ),
                ],
              ),
            );
          }

          final data = state.data;
          final summary = data?.summary ?? ReportSummary(
            totalRevenue: 0, totalDiscount: 0, totalCost: 0, avgOrderValue: 0,
            totalOrders: 0, deliveredOrders: 0, cancelledOrders: 0, pendingOrders: 0, netProfit: 0,
          );

          // Filtrlar
          List<ReportProduct> filteredProducts = data?.products ?? [];
          if (state.search.trim().isNotEmpty) {
            final q = state.search.toLowerCase();
            filteredProducts = filteredProducts.where((p) => 
              p.name.toLowerCase().contains(q) ||
              (p.quality?.toLowerCase().contains(q) ?? false) ||
              (p.model?.toLowerCase().contains(q) ?? false) ||
              (p.sku?.toLowerCase().contains(q) ?? false) ||
              (p.color?.toLowerCase().contains(q) ?? false)
            ).toList();
          }

          return RefreshIndicator(
            color: const Color(0xFF0A7C55),
            onRefresh: () async {
              final bloc = context.read<AdminReportBloc>();
              bloc.add(LoadReportData());
              await bloc.stream.firstWhere((s) => !s.isLoading, orElse: () => bloc.state);
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 1. Sanalar va Filtrlash (Qidiruv)
                  _buildFilters(context, state),
                  const SizedBox(height: 20),

                  // 2. KPI Cards
                  _buildKPICards(context, summary),
                  const SizedBox(height: 16),

                  // Phase 3.5 — Qaytarish bloki (faqat returns bo'lsa)
                  if (summary.hasReturns) ...[
                    _buildReturnsPanel(context, summary),
                    const SizedBox(height: 20),
                  ] else
                    const SizedBox(height: 4),

                  // 3. Sub Tabs
                  _buildSubTabs(context, state),
                  const SizedBox(height: 16),

                  // 4. Content (Jadvallar)
                  _buildContent(context, state, filteredProducts, state.orders),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFilters(BuildContext context, AdminReportState state) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Tezkor filtrlash chiplari
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                const Text('Tezkor: ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(width: 8),
                _QuickChip(label: 'Bugun', isActive: state.dateFrom == _today && state.dateTo == _today, onTap: () => _setQuickPeriod('today')),
                const SizedBox(width: 8),
                _QuickChip(label: 'Bu oy', isActive: state.dateFrom == _monthStart && state.dateTo == _today, onTap: () => _setQuickPeriod('month')),
                const SizedBox(width: 8),
                _QuickChip(label: 'Bu yil', isActive: state.dateFrom == _yearStart && state.dateTo == _today, onTap: () => _setQuickPeriod('year')),
                const SizedBox(width: 8),
                _QuickChip(label: 'Barchasi', isActive: state.dateFrom == null, onTap: () => _setQuickPeriod('all')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Sanalar
          Row(
            children: [
              Expanded(
                child: _DateSelector(
                  label: 'Dan',
                  date: state.dateFrom,
                  onTap: () => _selectDate(context, true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DateSelector(
                  label: 'Gacha',
                  date: state.dateTo,
                  onTap: () => _selectDate(context, false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Davr va Qidiruv
          Row(
            children: [
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Davr', style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold, color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 4),
                    Container(
                      height: 44,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerLowest,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: theme.colorScheme.outlineVariant),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: state.period,
                          isExpanded: true,
                          icon: const Icon(Icons.keyboard_arrow_down, size: 20),
                          items: const [
                            DropdownMenuItem(value: 'daily', child: Text('Kunlik', style: TextStyle(fontSize: 13))),
                            DropdownMenuItem(value: 'monthly', child: Text('Oylik', style: TextStyle(fontSize: 13))),
                            DropdownMenuItem(value: 'yearly', child: Text('Yillik', style: TextStyle(fontSize: 13))),
                          ],
                          onChanged: (v) {
                            if (v != null) {
                              context.read<AdminReportBloc>().add(ChangeReportPeriod(dateFrom: state.dateFrom, dateTo: state.dateTo, period: v));
                            }
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Qidiruv', style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold, color: theme.colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 4),
                    SizedBox(
                      height: 44,
                      child: TextField(
                        controller: _searchController,
                        onChanged: (v) => context.read<AdminReportBloc>().add(ChangeReportSearch(v)),
                        decoration: InputDecoration(
                          hintText: 'Tovar, sifat...',
                          hintStyle: const TextStyle(fontSize: 13),
                          prefixIcon: const Icon(Icons.search, size: 18),
                          contentPadding: EdgeInsets.zero,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: theme.colorScheme.outlineVariant)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: theme.colorScheme.outlineVariant)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF0A7C55))),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Phase 3.5 — Qaytarishlar va sof tushum paneli (web ReportsTab bilan teng).
  // Industry naqsh (Amazon/Shopify/Wildberries):
  //   Gross (yalpi) → Returns → Net (sof) → Return Rate %
  Widget _buildReturnsPanel(BuildContext context, ReportSummary summary) {
    final theme = Theme.of(context);
    String fmt(double v) =>
        NumberFormat('#,###', 'uz_UZ').format(v).replaceAll(',', ' ');

    // Return rate adaptiv rang (web bilan bir xil)
    final rrColor = summary.returnRate < 3
        ? const Color(0xFF10B981) // emerald — sog'lom
        : summary.returnRate < 10
            ? const Color(0xFFD97706) // amber — o'rtacha
            : const Color(0xFFEF4444); // rose — muammoli

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.assignment_return_rounded,
                  color: Color(0xFFEF4444), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Qaytarishlar va sof tushum',
                  style: TextStyle(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // 5 KPI: Pul qaytarildi / Almashtirildi / Stokga qaytdi / Sof tushum / Return rate
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _returnsKpiCard(
                context,
                label: 'Pul qaytarildi',
                value: "${fmt(summary.returnsAmount)} so'm",
                sub: '${summary.returnsCount} ta',
                color: const Color(0xFFEF4444), // rose
                icon: Icons.currency_exchange_rounded,
              ),
              _returnsKpiCard(
                context,
                label: 'Almashtirildi',
                value: '${summary.replacementCount} ta',
                sub: "${fmt(summary.replacementAmount)} so'm qiymat",
                color: const Color(0xFFD97706), // amber
                icon: Icons.swap_horiz_rounded,
              ),
              _returnsKpiCard(
                context,
                label: 'Stokga qaytdi',
                value: "${fmt(summary.recoveredCost)} so'm",
                sub: 'restock=true tannarx',
                color: const Color(0xFF0284C7), // sky
                icon: Icons.inventory_2_rounded,
              ),
              _returnsKpiCard(
                context,
                label: 'Sof tushum',
                value: "${fmt(summary.netRevenue)} so'm",
                sub: 'Yalpi − qaytarilgan',
                color: const Color(0xFF10B981), // emerald
                icon: Icons.savings_rounded,
              ),
              _returnsKpiCard(
                context,
                label: 'Qaytarish darajasi',
                value: '${summary.returnRate.toStringAsFixed(2)}%',
                sub: summary.returnRate < 3
                    ? "Sog'lom"
                    : summary.returnRate < 10
                        ? "O'rtacha"
                        : 'Yuqori — tekshiring',
                color: rrColor,
                icon: Icons.percent_rounded,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Yalpi vs Sof foyda taqqoslash
          Row(
            children: [
              Expanded(
                child: _profitCard(
                  context,
                  label: 'Yalpi foyda (gross)',
                  value: "${fmt(summary.netProfit)} so'm",
                  sub: 'Qaytarishsiz',
                  color: const Color(0xFF0A7C55),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _profitCard(
                  context,
                  label: 'Sof foyda (after)',
                  value: "${fmt(summary.netProfitAfterReturns)} so'm",
                  sub: 'Tannarx recovery hisobi',
                  color: const Color(0xFF10B981),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _returnsKpiCard(
    BuildContext context, {
    required String label,
    required String value,
    required String sub,
    required Color color,
    required IconData icon,
  }) {
    final theme = Theme.of(context);
    final cardWidth =
        (MediaQuery.of(context).size.width - 14 * 2 - 8 * 2) / 2 - 0.5;
    return SizedBox(
      width: cardWidth,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(10),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label.toUpperCase(),
                    style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      color: theme.colorScheme.onSurfaceVariant,
                      letterSpacing: 0.4,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: theme.colorScheme.onSurface,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    sub,
                    style: TextStyle(
                      fontSize: 9.5,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _profitCard(
    BuildContext context, {
    required String label,
    required String value,
    required String sub,
    required Color color,
  }) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      foregroundDecoration: BoxDecoration(
        border: Border(left: BorderSide(color: color, width: 4)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: theme.colorScheme.onSurfaceVariant,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: theme.colorScheme.onSurface,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            sub,
            style: TextStyle(
              fontSize: 10,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildKPICards(BuildContext context, ReportSummary summary) {
    String fmt(double v) {
      final f = NumberFormat('#,###', 'uz_UZ');
      return f.format(v).replaceAll(',', ' ');
    }
    
    final cards = [
      {'lbl': 'Jami Tushum', 'val': '${fmt(summary.totalRevenue)} so\'m', 'icon': Icons.payments, 'color': const Color(0xFF0A7C55)},
      {'lbl': 'Sof Foyda', 'val': '${fmt(summary.netProfit)} so\'m', 'icon': Icons.trending_up, 'color': const Color(0xFF3B82F6)},
      {'lbl': 'Jami Buyurtmalar', 'val': '${summary.totalOrders}', 'icon': Icons.receipt_long, 'color': const Color(0xFF8B5CF6)},
      {'lbl': 'Yetkazildi', 'val': '${summary.deliveredOrders}', 'icon': Icons.local_shipping, 'color': const Color(0xFF22C55E)},
      {'lbl': 'Bekor Qilindi', 'val': '${summary.cancelledOrders}', 'icon': Icons.cancel, 'color': const Color(0xFFEF4444)},
      {'lbl': 'Kutilmoqda', 'val': '${summary.pendingOrders}', 'icon': Icons.hourglass_top, 'color': const Color(0xFFF59E0B)},
      {'lbl': 'O\'rtacha Buyurtma', 'val': '${fmt(summary.avgOrderValue)} so\'m', 'icon': Icons.analytics, 'color': const Color(0xFF0A7C55)},
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 2.1,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: cards.length,
      itemBuilder: (context, index) {
        final c = cards[index];
        final color = c['color'] as Color;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.5)),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(c['icon'] as IconData, color: color, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c['lbl'] as String, style: const TextStyle(fontSize: 10, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(c['val'] as String, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSubTabs(BuildContext context, AdminReportState state) {
    return Row(
      children: [
        _TabButton(
          title: 'Umumiy',
          icon: Icons.bar_chart,
          isActive: state.subTab == 'general',
          onTap: () => context.read<AdminReportBloc>().add(ChangeReportSubTab('general')),
        ),
        const SizedBox(width: 8),
        _TabButton(
          title: 'Savdo',
          icon: Icons.receipt_long,
          isActive: state.subTab == 'sales',
          onTap: () => context.read<AdminReportBloc>().add(ChangeReportSubTab('sales')),
        ),
      ],
    );
  }

  Widget _buildContent(BuildContext context, AdminReportState state, List<ReportProduct> products, List<ReportOrder> orders) {
    final theme = Theme.of(context);
    String fmt(double v) {
      final f = NumberFormat('#,###', 'uz_UZ');
      return f.format(v).replaceAll(',', ' ');
    }

    if (state.isLoading) {
      return const Padding(
        padding: EdgeInsets.all(32.0),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (state.subTab == 'general') {
      if (products.isEmpty) {
        return const _EmptyView(msg: "Ma'lumot topilmadi");
      }
      
      int totalQty = products.fold(0, (sum, p) => sum + p.quantitySold);
      double totalRev = products.fold(0, (sum, p) => sum + p.totalRevenue);
      // Phase 3.5 — net (qaytarishni hisobga olib) jami
      int totalReturned = products.fold(0, (sum, p) => sum + p.quantityReturned);
      int totalNetQty = products.fold(0, (sum, p) => sum + p.netQuantitySold);
      double totalNetRev = products.fold(0, (sum, p) => sum + p.netRevenue);
      double totalNetProfit =
          products.fold(0, (sum, p) => sum + p.netProfitAfterReturns);
      final bool anyReturns = totalReturned > 0;

      return Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SingleChildScrollView(
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5)),
                dataRowMinHeight: 40,
                dataRowMaxHeight: 50,
                columnSpacing: 16,
                horizontalMargin: 16,
                columns: const [
                  DataColumn(label: Text('#', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('Tovar Nomi', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('Sifat', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('Model', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('Xotira', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('Rang', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('SKU', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  DataColumn(label: Text('Narxi', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                  DataColumn(label: Text('Chegirma', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                  DataColumn(label: Text('Sotilgan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                  DataColumn(label: Text('Kirim', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                  DataColumn(label: Text('Sotildi', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                  // Phase 3.5 — Qaytarish ustunlari (web ReportsTab bilan teng)
                  DataColumn(label: Text('Qaytdi', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFFEF4444))), numeric: true),
                  DataColumn(label: Text('Sof', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF10B981))), numeric: true),
                  DataColumn(label: Text('Tushum', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                  DataColumn(label: Text('Foyda', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)), numeric: true),
                ],
                rows: [
                  ...products.map((p) {
                    // ── Sotuv narx turiga ko'ra ajratish (foydalanuvchi so'rovi) ──
                    // OPTOM narxda sotilgan qator ORANGE fon bilan ajralib turadi;
                    // chegirma → och amber, usta → yashil. + nom yonida belgi.
                    final pt = p.priceType;
                    final Color? rowColor = pt == 'optom'
                        ? const Color(0xFFF59E0B).withValues(alpha: 0.16)
                        : pt == 'discount'
                            ? const Color(0xFFF59E0B).withValues(alpha: 0.06)
                            : pt == 'master'
                                ? const Color(0xFF0A7C55).withValues(alpha: 0.06)
                                : null;
                    final String? badgeLabel = pt == 'optom'
                        ? 'OPTOM'
                        : pt == 'discount'
                            ? 'CHEGIRMA'
                            : pt == 'master'
                                ? 'USTA'
                                : null;
                    final Color badgeColor = pt == 'master'
                        ? const Color(0xFF0A7C55)
                        : const Color(0xFFB45309);
                    return DataRow(
                      color: rowColor != null
                          ? WidgetStateProperty.all(rowColor)
                          : null,
                      cells: [
                        DataCell(Text('${p.rank}', style: const TextStyle(fontSize: 12))),
                        DataCell(Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(p.name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            if (badgeLabel != null) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: badgeColor.withValues(alpha: 0.18),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(badgeLabel,
                                    style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: badgeColor)),
                              ),
                            ],
                          ],
                        )),
                        DataCell(Text(p.quality ?? '-', style: const TextStyle(fontSize: 12))),
                        DataCell(Text(p.model ?? '-', style: const TextStyle(fontSize: 12))),
                        DataCell(Text(p.size ?? '-', style: const TextStyle(fontSize: 12))),
                        DataCell(Text(p.color ?? '-', style: const TextStyle(fontSize: 12))),
                        DataCell(Text(p.sku ?? '-', style: const TextStyle(fontSize: 12, color: Colors.grey, fontFamily: 'monospace'))),
                        DataCell(Text(fmt(p.price), style: const TextStyle(fontSize: 12))),
                        DataCell(Text(p.discountPrice != null ? fmt(p.discountPrice!) : '-', style: const TextStyle(fontSize: 12, color: Colors.orange))),
                        DataCell(
                          (p.discountAmount > 0 && pt != 'optom')
                              ? Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(fmt(p.soldPrice),
                                        style: const TextStyle(fontSize: 12, color: Color(0xFF0A7C55), fontWeight: FontWeight.bold)),
                                    Text('−${fmt(p.discountAmount)}',
                                        style: const TextStyle(fontSize: 9, color: Color(0xFFB45309))),
                                  ],
                                )
                              : Text(fmt(p.soldPrice), style: const TextStyle(fontSize: 12, color: Color(0xFF0A7C55), fontWeight: FontWeight.bold)),
                        ),
                        DataCell(Text(fmt(p.costPrice), style: const TextStyle(fontSize: 12, color: Color(0xFFA43A3A), fontWeight: FontWeight.bold))),
                        DataCell(
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0A7C55).withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text('${p.quantitySold}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF0A7C55))),
                          ),
                        ),
                        // Phase 3.5 — Qaytdi (qizil badge + foiz)
                        DataCell(
                          p.quantityReturned > 0
                              ? Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEF4444).withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text('${p.quantityReturned}',
                                          style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                              color: Color(0xFFEF4444))),
                                      Text('${p.returnRate.toStringAsFixed(1)}%',
                                          style: const TextStyle(
                                              fontSize: 9,
                                              color: Color(0xFFEF4444))),
                                    ],
                                  ),
                                )
                              : Text('—',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.outline)),
                        ),
                        // Phase 3.5 — Sof (yashil badge)
                        DataCell(
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text('${p.netQuantitySold}',
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF10B981))),
                          ),
                        ),
                        // Tushum — qaytarish bo'lsa "−refunded" izoh
                        DataCell(
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(fmt(p.totalRevenue),
                                  style: const TextStyle(
                                      fontSize: 12, fontWeight: FontWeight.bold)),
                              if (p.totalRefunded > 0)
                                Text('−${fmt(p.totalRefunded)}',
                                    style: const TextStyle(
                                        fontSize: 9, color: Color(0xFFEF4444))),
                            ],
                          ),
                        ),
                        // Foyda — sof foyda (after returns)
                        DataCell(
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(fmt(p.netProfitAfterReturns),
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: p.netProfitAfterReturns >= 0
                                          ? const Color(0xFF22C55E)
                                          : const Color(0xFFEF4444),
                                      fontWeight: FontWeight.bold)),
                              if (p.hasReturns)
                                Text('gross: ${fmt(p.netProfit)}',
                                    style: TextStyle(
                                        fontSize: 9,
                                        color: theme
                                            .colorScheme.onSurfaceVariant)),
                            ],
                          ),
                        ),
                      ],
                    );
                  }),
                  DataRow(
                    color: WidgetStateProperty.all(theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5)),
                    cells: [
                      const DataCell(Text('')),
                      const DataCell(Text('JAMI:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13))),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      const DataCell(Text('')),
                      DataCell(Text('$totalQty',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: Color(0xFF0A7C55)))),
                      // Phase 3.5: Qaytdi (jami)
                      DataCell(Text(anyReturns ? '$totalReturned' : '—',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: Color(0xFFEF4444)))),
                      // Phase 3.5: Sof miqdor
                      DataCell(Text('$totalNetQty',
                          style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: Color(0xFF10B981)))),
                      // Tushum — anyReturns bo'lsa Yalpi / Sof
                      DataCell(
                        anyReturns
                            ? Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(fmt(totalRev),
                                      style: TextStyle(
                                          fontSize: 10,
                                          color: theme.colorScheme
                                              .onSurfaceVariant)),
                                  Text('Sof: ${fmt(totalNetRev)}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                          color: Color(0xFF10B981))),
                                ],
                              )
                            : Text(fmt(totalRev),
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 14)),
                      ),
                      // Foyda — sof
                      DataCell(Text(fmt(totalNetProfit),
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                              color: totalNetProfit >= 0
                                  ? const Color(0xFF22C55E)
                                  : const Color(0xFFEF4444)))),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    } else {
      if (orders.isEmpty) {
        return const _EmptyView(msg: "Cheklar topilmadi");
      }
      
      const double tableWidth = 1000.0;
      
      return Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SingleChildScrollView(
              controller: _ordersScrollController,
              child: SizedBox(
                width: tableWidth,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Container(
                      color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: const Row(
                        children: [
                          SizedBox(width: 50, child: Text('No', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                          Expanded(child: Text('Tovar nomi', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                          SizedBox(width: 80, child: Text('Soni', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                          SizedBox(width: 120, child: Text('Narxi', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                          SizedBox(width: 120, child: Text('Sotilgan narxi', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                          SizedBox(width: 100, child: Text('Chegirma %', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                          SizedBox(width: 140, child: Text('Chegirma summasi', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                        ],
                      ),
                    ),
                    // Body
                    ...orders.asMap().entries.expand((entry) {
                      final orderIndex = entry.key;
                      final o = entry.value;
                      final dateStr = DateTime.tryParse(o.createdAt) != null
                          ? DateFormat('dd.MM.yyyy HH:mm').format(DateTime.parse(o.createdAt).toLocal())
                          : o.createdAt;
                      // Phase 3.5 — chek bo'yicha qaytarish ranglari (web ekvivalenti)
                      final retStatus = o.returnStatus;
                      final isFull = retStatus == 'full';
                      final isPartial = retStatus == 'partial';
                      final headerColor = isFull
                          ? const Color(0xFFEF4444) // rose — to'liq qaytarib olingan
                          : isPartial
                              ? const Color(0xFFD97706) // amber — qisman
                              : const Color(0xFF0A7C55); // green — standart
                      return [
                        // Order Header
                        Container(
                          color: headerColor.withValues(alpha: 0.15),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          child: Row(
                            children: [
                              SizedBox(width: 50, child: Text('${orderIndex + 1}', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.bold, color: headerColor))),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    RichText(
                                      text: TextSpan(
                                        style: TextStyle(color: theme.colorScheme.onSurface, fontSize: 13),
                                        children: [
                                          TextSpan(text: 'Chek №${o.id} ($dateStr)   ', style: TextStyle(fontWeight: FontWeight.bold, color: headerColor)),
                                          const TextSpan(text: 'Xaridor: ', style: TextStyle(color: Colors.grey)),
                                          TextSpan(text: '${o.receiverName} ${o.receiverPhone.isNotEmpty ? "(${o.receiverPhone})" : ""}'),
                                        ],
                                      ),
                                    ),
                                    if (o.isReturned)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Row(
                                          children: [
                                            Icon(Icons.assignment_return_rounded,
                                                size: 14, color: headerColor),
                                            const SizedBox(width: 4),
                                            Text(
                                              isFull
                                                  ? "To'liq qaytarildi"
                                                  : "Qisman qaytarildi (${o.returnedQty} ta)",
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w800,
                                                color: headerColor,
                                              ),
                                            ),
                                            if (o.latestReturnNumber != null) ...[
                                              const SizedBox(width: 8),
                                              Text(
                                                '· ${o.latestReturnNumber}',
                                                style: TextStyle(
                                                  fontSize: 10,
                                                  color: headerColor,
                                                  fontFamily: 'monospace',
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        ...o.items.asMap().entries.map((itemEntry) {
                          final itemIndex = itemEntry.key;
                          final item = itemEntry.value;
                          // Phase 3.5 — qaytarish holatiga qarab vizual stil
                          final fullRet = item.isFullyReturned;
                          final partialRet = item.isPartiallyReturned;
                          final dim = fullRet
                              ? TextStyle(
                                  decoration: TextDecoration.lineThrough,
                                  color: theme.colorScheme.outline,
                                )
                              : null;
                          return Container(
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerLowest,
                              border: Border(bottom: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5))),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            child: Row(
                              children: [
                                SizedBox(width: 50, child: Text('${itemIndex + 1}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.grey))),
                                Expanded(
                                  child: Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          item.productName,
                                          style: dim ??
                                              const TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.bold),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      if (item.returnedQty > 0) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: fullRet
                                                ? const Color(0xFFEF4444).withValues(alpha: 0.15)
                                                : const Color(0xFFD97706).withValues(alpha: 0.15),
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: Text(
                                            fullRet
                                                ? 'Qaytarib olingan'
                                                : '${item.returnedQty} ta qaytdi',
                                            style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.w800,
                                              color: fullRet
                                                  ? const Color(0xFFEF4444)
                                                  : const Color(0xFFD97706),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                SizedBox(
                                  width: 80,
                                  child: item.returnedQty > 0
                                      ? Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              '${item.netQuantity}',
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.bold,
                                                  color: Color(0xFF10B981)),
                                            ),
                                            Text(
                                              '(${item.quantity} − ${item.returnedQty})',
                                              textAlign: TextAlign.center,
                                              style: TextStyle(
                                                fontSize: 9,
                                                color: theme.colorScheme.outline,
                                              ),
                                            ),
                                          ],
                                        )
                                      : Text('${item.quantity}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                ),
                                SizedBox(width: 120, child: Text(fmt(item.originalPrice), textAlign: TextAlign.right, style: dim ?? const TextStyle(fontSize: 12))),
                                SizedBox(
                                  width: 120,
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        fmt(item.soldPrice),
                                        textAlign: TextAlign.right,
                                        style: dim ??
                                            const TextStyle(
                                                fontSize: 12,
                                                color: Color(0xFF0A7C55),
                                                fontWeight: FontWeight.bold),
                                      ),
                                      if (partialRet && item.refundedAmount > 0)
                                        Text(
                                          '−${fmt(item.refundedAmount)} qaytdi',
                                          style: const TextStyle(
                                              fontSize: 9, color: Color(0xFFEF4444)),
                                        ),
                                    ],
                                  ),
                                ),
                                SizedBox(width: 100, child: Text(item.discountPercent > 0 ? '${item.discountPercent}%' : '-', textAlign: TextAlign.center, style: dim ?? const TextStyle(fontSize: 12, color: Colors.red))),
                                SizedBox(width: 140, child: Text(item.discountAmount > 0 ? fmt(item.discountAmount) : '-', textAlign: TextAlign.right, style: dim ?? const TextStyle(fontSize: 12, color: Colors.red))),
                              ],
                            ),
                          );
                        }),
                        // Order Subtotal Row (Jami) — Phase 3.5: net qiymatlar
                        Builder(builder: (_) {
                          final totalQty = o.items.fold<int>(0, (sum, item) => sum + item.quantity);
                          final netQty = o.items.fold<int>(0, (sum, item) => sum + item.netQuantity);
                          final grossOrig = o.items.fold<double>(0.0, (sum, item) => sum + (item.originalPrice * item.quantity));
                          final netOrig = o.items.fold<double>(
                              0.0,
                              (sum, item) => sum + (item.originalPrice * item.netQuantity));
                          // Chegirma proportsional: per_unit × net_qty
                          final netDiscount = o.items.fold<double>(0.0, (sum, item) {
                            if (item.quantity == 0) return sum;
                            final perUnit = item.discountAmount / item.quantity;
                            return sum + perUnit * item.netQuantity;
                          });
                          final netOrigPct = netOrig > 0 ? (netDiscount / netOrig * 100) : 0.0;
                          final isFullR = o.returnStatus == 'full';
                          final dimStyle = TextStyle(
                            fontSize: 11,
                            decoration: isFullR ? TextDecoration.lineThrough : null,
                            color: theme.colorScheme.outline,
                          );
                          return Container(
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surfaceContainerHighest,
                              border: Border(bottom: BorderSide(color: theme.colorScheme.outlineVariant, width: 3)),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            child: Row(
                              children: [
                                Expanded(child: Text("Shu chek bo'yicha jami:", textAlign: TextAlign.right, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface.withValues(alpha: 0.8)))),
                                // Soni
                                SizedBox(
                                  width: 80,
                                  child: o.isReturned
                                      ? Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text('$totalQty', textAlign: TextAlign.center, style: dimStyle),
                                            Text('Sof: $netQty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                          ],
                                        )
                                      : Text('$totalQty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF0A7C55))),
                                ),
                                // Narxi (asl)
                                SizedBox(
                                  width: 120,
                                  child: o.isReturned
                                      ? Column(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(fmt(grossOrig), textAlign: TextAlign.right, style: dimStyle),
                                            Text('Sof: ${fmt(netOrig)}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                          ],
                                        )
                                      : Text(fmt(grossOrig), textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                                ),
                                // Sotilgan narxi — 3 qatorli format
                                SizedBox(
                                  width: 120,
                                  child: o.isReturned
                                      ? Column(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(fmt(o.totalPrice), textAlign: TextAlign.right, style: dimStyle),
                                            Text('Sof: ${fmt(o.netTotal)}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                            Text('−${fmt(o.refundedAmount)} qaytdi', textAlign: TextAlign.right, style: const TextStyle(fontSize: 9, color: Color(0xFFEF4444))),
                                          ],
                                        )
                                      : Text(fmt(o.totalPrice), textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF0A7C55))),
                                ),
                                // Chegirma %
                                SizedBox(
                                  width: 100,
                                  child: o.isReturned
                                      ? Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(o.totalDiscount > 0 && grossOrig > 0 ? '${((o.totalDiscount / grossOrig) * 100).toStringAsFixed(1)}%' : '0%', textAlign: TextAlign.center, style: dimStyle),
                                            Text(isFullR ? '0%' : (netOrigPct > 0 ? '${netOrigPct.toStringAsFixed(1)}%' : '0%'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.red)),
                                          ],
                                        )
                                      : Text(o.totalDiscount > 0 && o.totalPrice > 0 ? '${((o.totalDiscount / (o.totalPrice + o.totalDiscount)) * 100).toStringAsFixed(2).replaceAll('.00', '')}%' : '0%', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.red)),
                                ),
                                // Chegirma summasi — Phase 3.5: net
                                SizedBox(
                                  width: 140,
                                  child: o.isReturned
                                      ? Column(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(fmt(o.totalDiscount), textAlign: TextAlign.right, style: dimStyle),
                                            Text(isFullR ? 'Sof: 0' : 'Sof: ${fmt(netDiscount)}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.red)),
                                          ],
                                        )
                                      : Text(o.totalDiscount > 0 ? fmt(o.totalDiscount) : '0', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.red)),
                                ),
                              ],
                            ),
                          );
                        }),
                      ];
                    }),
                    // Grand Total (Umumiy Jami) — Phase 3.5: net qiymatlar
                    Builder(builder: (_) {
                      final grossQty = orders.fold<int>(0, (acc, o) => acc + o.items.fold<int>(0, (s, i) => s + i.quantity));
                      final netQty = orders.fold<int>(0, (acc, o) => acc + o.items.fold<int>(0, (s, i) => s + i.netQuantity));
                      final grossOrig = orders.fold<double>(0.0, (acc, o) => acc + o.items.fold<double>(0.0, (s, i) => s + (i.originalPrice * i.quantity)));
                      final netOrig = orders.fold<double>(0.0, (acc, o) => acc + o.items.fold<double>(0.0, (s, i) => s + (i.originalPrice * i.netQuantity)));
                      final grossSold = orders.fold<double>(0.0, (acc, o) => acc + o.totalPrice);
                      final refunded = orders.fold<double>(0.0, (acc, o) => acc + o.refundedAmount);
                      final netSold = grossSold - refunded;
                      final grossDiscount = orders.fold<double>(0.0, (acc, o) => acc + o.items.fold<double>(0.0, (s, i) => s + i.discountAmount));
                      final netDiscount = orders.fold<double>(0.0, (acc, o) => acc + o.items.fold<double>(0.0, (s, i) {
                            if (i.quantity == 0) return s;
                            return s + (i.discountAmount / i.quantity) * i.netQuantity;
                          }));
                      final hasReturn = refunded > 0 || netQty < grossQty;
                      final dim = TextStyle(fontSize: 11, color: theme.colorScheme.outline);
                      return Container(
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainer,
                          border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant, width: 2)),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        child: Row(
                          children: [
                            Expanded(child: Text("JAMI:", textAlign: TextAlign.right, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface))),
                            SizedBox(
                              width: 80,
                              child: hasReturn
                                  ? Column(mainAxisSize: MainAxisSize.min, children: [
                                      Text('$grossQty', textAlign: TextAlign.center, style: dim),
                                      Text('Sof: $netQty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                    ])
                                  : Text('$grossQty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0A7C55))),
                            ),
                            SizedBox(
                              width: 120,
                              child: hasReturn
                                  ? Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
                                      Text(fmt(grossOrig), textAlign: TextAlign.right, style: dim),
                                      Text('Sof: ${fmt(netOrig)}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                    ])
                                  : Text(fmt(grossOrig), textAlign: TextAlign.right, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                            ),
                            SizedBox(
                              width: 120,
                              child: hasReturn
                                  ? Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
                                      Text('Yalpi: ${fmt(grossSold)}', textAlign: TextAlign.right, style: dim),
                                      Text('Sof: ${fmt(netSold)}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                                      Text('−${fmt(refunded)} qaytdi', textAlign: TextAlign.right, style: const TextStyle(fontSize: 9, color: Color(0xFFEF4444))),
                                    ])
                                  : Text(fmt(grossSold), textAlign: TextAlign.right, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0A7C55))),
                            ),
                            const SizedBox(width: 100),
                            SizedBox(
                              width: 140,
                              child: hasReturn
                                  ? Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
                                      Text(fmt(grossDiscount), textAlign: TextAlign.right, style: dim),
                                      Text('Sof: ${fmt(netDiscount)}', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.red)),
                                    ])
                                  : Text(fmt(grossDiscount), textAlign: TextAlign.right, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.red)),
                            ),
                          ],
                        ),
                      );
                    }),
                    if (state.isFetchingOrders)
                      const Padding(
                        padding: EdgeInsets.all(16.0),
                        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

class _QuickChip extends StatelessWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _QuickChip({required this.label, required this.isActive, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFF0A7C55).withValues(alpha: 0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: isActive ? const Color(0xFF0A7C55) : Theme.of(context).colorScheme.outlineVariant),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
            color: isActive ? const Color(0xFF0A7C55) : Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _DateSelector extends StatelessWidget {
  final String label;
  final String? date;
  final VoidCallback onTap;

  const _DateSelector({required this.label, required this.date, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold, color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 4),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    date ?? 'Tanlang',
                    style: TextStyle(fontSize: 13, color: date != null ? theme.colorScheme.onSurface : theme.colorScheme.onSurfaceVariant),
                  ),
                ),
                Icon(Icons.calendar_month, size: 18, color: theme.colorScheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _TabButton extends StatelessWidget {
  final String title;
  final IconData icon;
  final bool isActive;
  final VoidCallback onTap;

  const _TabButton({required this.title, required this.icon, required this.isActive, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isActive ? Colors.white : theme.colorScheme.onSurface;
    final bg = isActive ? const Color(0xFF0A7C55) : theme.colorScheme.surface;
    final border = isActive ? Colors.transparent : theme.colorScheme.outlineVariant;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 6),
            Text(title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: color)),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  final String msg;
  const _EmptyView({required this.msg});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.inventory_2_outlined, size: 48, color: Theme.of(context).colorScheme.outlineVariant),
            const SizedBox(height: 12),
            Text(msg, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
