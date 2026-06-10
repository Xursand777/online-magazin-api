import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../data/models/admin_order_model.dart';
import '../../data/models/order_status_helper.dart';
import '../../data/models/pos_model.dart';
import '../../data/repositories/admin_repository.dart';
import '../bloc/admin_pos_bloc.dart';
import '../widgets/admin_drawer.dart';

/// Do'kon (POS) — saytdagi `AdminPOS.tsx` bilan bir xil mantiq.
/// Mahsulot tanlash + savatcha + checkout (naqd / karta / nasiya).
class AdminPosPage extends StatefulWidget {
  const AdminPosPage({super.key});

  @override
  State<AdminPosPage> createState() => _AdminPosPageState();
}

class _AdminPosPageState extends State<AdminPosPage> {
  static const Color _brandDark = Color(0xFF063F2B);
  static const Color _brand = Color(0xFF0A7C55);
  final _searchCtrl = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      context.read<AdminPosBloc>().add(const LoadMorePosProducts());
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      drawer: const AdminDrawer(),
      appBar: AppBar(
        backgroundColor: _brandDark,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          "Do'kon (POS)",
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Yangilash',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () =>
                context.read<AdminPosBloc>().add(const LoadPosProducts()),
          ),
        ],
      ),
      body: BlocConsumer<AdminPosBloc, AdminPosState>(
        listenWhen: (p, c) =>
            p.warning != c.warning ||
            p.error != c.error ||
            p.completedOrder != c.completedOrder,
        listener: (context, state) {
          if (state.warning != null) {
            _snack(context, state.warning!, const Color(0xFFD97706),
                Icons.warning_amber_rounded);
          }
          if (state.error != null) {
            _snack(context, state.error!, theme.colorScheme.error,
                Icons.error_outline);
          }
          if (state.completedOrder != null) {
            // Ochiq varaqalar (cart / checkout) o'zlarini yopadi (quyidagi
            // _CartSheet / _CheckoutSheet listenerlari). Bu yerda — chek.
            final order = state.completedOrder!;
            context.read<AdminPosBloc>().add(const PosClearMessages());
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted) _showReceipt(context, order);
            });
          }
        },
        builder: (context, state) {
          final isLoading = state.status == PosStatus.loading && state.products.isEmpty;
          final isFailure = state.status == PosStatus.failure && state.products.isEmpty;

          return Column(
            children: [
              _searchBar(context, state),
              Expanded(
                child: isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : isFailure
                        ? _ErrorView(
                            message: state.error ?? 'Xatolik',
                            onRetry: () => context
                                .read<AdminPosBloc>()
                                .add(const LoadPosProducts()),
                          )
                        : _productGrid(context, state),
              ),
            ],
          );
        },
      ),
      floatingActionButton: BlocBuilder<AdminPosBloc, AdminPosState>(
        buildWhen: (p, c) => p.cart != c.cart,
        builder: (context, state) {
          if (state.cart.isEmpty) return const SizedBox.shrink();
          return FloatingActionButton.extended(
            backgroundColor: _brand,
            onPressed: () => _openCart(context),
            icon: Badge(
              label: Text('${state.cartCount}'),
              child: const Icon(Icons.shopping_cart_rounded,
                  color: Colors.white),
            ),
            label: Text(
              "${formatSom(state.totalAmount)} so'm",
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _searchBar(BuildContext context, AdminPosState state) {
    final bloc = context.read<AdminPosBloc>();
    return Container(
      color: _brandDark,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: TextField(
        controller: _searchCtrl,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: 'Mahsulot, SKU, model, rang...',
          hintStyle: const TextStyle(color: Colors.white60),
          prefixIcon: const Icon(Icons.search, color: Colors.white60),
          suffixIcon: state.status == PosStatus.loading
              ? const Padding(
                  padding: EdgeInsets.all(12.0),
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white60),
                    ),
                  ),
                )
              : _searchCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: Colors.white60),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() {});
                        _searchDebounce?.cancel();
                        bloc.add(const PosSearchChanged(''));
                      },
                    )
                  : null,
          filled: true,
          fillColor: Colors.white.withValues(alpha: 0.15),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(vertical: 0),
        ),
        onChanged: (v) {
          setState(() {}); // Instant suffix icon update
          _searchDebounce?.cancel();
          _searchDebounce = Timer(const Duration(milliseconds: 500), () {
            if (mounted) {
              bloc.add(PosSearchChanged(v));
            }
          });
        },
      ),
    );
  }

  Widget _productGrid(BuildContext context, AdminPosState state) {
    final units = state.filteredUnits;
    if (units.isEmpty) {
      final theme = Theme.of(context);
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inventory_2_outlined,
                size: 64, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text('Mahsulot topilmadi', style: theme.textTheme.titleMedium),
          ],
        ),
      );
    }
    return GridView.builder(
      controller: _scrollController,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.92,
      ),
      itemCount: units.length + (state.isFetchingMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i >= units.length) {
          return const Center(child: CircularProgressIndicator());
        }
        final unit = units[i];
        final inCart = state.cart
            .where((c) => c.cartId == unit.cartId)
            .fold<int>(0, (s, c) => s + c.quantity);
        return _ProductUnitCard(
          unit: unit,
          inCart: inCart,
          onTap: unit.stock < 1
              ? null
              : () => context.read<AdminPosBloc>().add(PosAddToCart(unit)),
        );
      },
    );
  }

  void _openCart(BuildContext context) {
    final bloc = context.read<AdminPosBloc>();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BlocProvider.value(
        value: bloc,
        child: const _CartSheet(),
      ),
    );
  }

  void _showReceipt(BuildContext context, AdminOrder order) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: _brand.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_circle_rounded,
                    color: _brand, size: 44),
              ),
              const SizedBox(height: 14),
              Text('Sotuv muvaffaqiyatli!',
                  style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      )),
              const SizedBox(height: 6),
              Text('Buyurtma #${order.id}',
                  style: Theme.of(ctx).textTheme.bodyMedium),
              const SizedBox(height: 4),
              Text(
                "${formatSom(order.totalPrice)} so'm",
                style: Theme.of(ctx).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: _brand,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                OrderStatusHelper.paymentMethodLabel(order.paymentMethod),
                style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                      color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _brand,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Yangi sotuv'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static void _snack(
      BuildContext context, String msg, Color color, IconData icon) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(msg)),
          ]),
          backgroundColor: color,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
  }
}

// ─── Mahsulot birligi kartasi ──────────────────────────────────────────────────
class _ProductUnitCard extends StatelessWidget {
  const _ProductUnitCard({
    required this.unit,
    required this.inCart,
    required this.onTap,
  });
  final PosCartItem unit;
  final int inCart;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final out = unit.stock < 1;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: inCart > 0
                ? const Color(0xFF0A7C55)
                : theme.colorScheme.outlineVariant,
            width: inCart > 0 ? 1.6 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    unit.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      height: 1.15,
                    ),
                  ),
                ),
                if (inCart > 0)
                  Container(
                    margin: const EdgeInsets.only(left: 4),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: const BoxDecoration(
                      color: Color(0xFF0A7C55),
                      shape: BoxShape.rectangle,
                      borderRadius: BorderRadius.all(Radius.circular(8)),
                    ),
                    child: Text('$inCart',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        )),
                  ),
              ],
            ),
            if (unit.variantText.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                unit.variantText,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            const Spacer(),
            Text(
              "${formatSom(unit.price)} so'm",
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w900,
                color: const Color(0xFF0A7C55),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(
                  out ? Icons.cancel : Icons.inventory_2_outlined,
                  size: 13,
                  color: out
                      ? const Color(0xFFDC2626)
                      : theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 4),
                Text(
                  out ? 'Tugagan' : 'Omborda: ${unit.stock}',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: out
                        ? const Color(0xFFDC2626)
                        : theme.colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Savatcha varaqasi (bottom sheet) ──────────────────────────────────────────
class _CartSheet extends StatelessWidget {
  const _CartSheet();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, controller) {
        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: BlocConsumer<AdminPosBloc, AdminPosState>(
            listenWhen: (p, c) => p.completedOrder != c.completedOrder,
            listener: (context, state) {
              // Sotuv yakunlangach savatcha varaqasini yopamiz.
              if (state.completedOrder != null && Navigator.canPop(context)) {
                Navigator.pop(context);
              }
            },
            builder: (context, state) {
              return Column(
                children: [
                  const SizedBox(height: 8),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Savatcha (${state.cartCount})',
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        if (state.cart.isNotEmpty)
                          TextButton.icon(
                            onPressed: () => context
                                .read<AdminPosBloc>()
                                .add(const PosClearCart()),
                            icon: const Icon(Icons.delete_sweep_outlined,
                                size: 18),
                            label: const Text('Tozalash'),
                            style: TextButton.styleFrom(
                                foregroundColor: const Color(0xFFDC2626)),
                          ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  Expanded(
                    child: state.cart.isEmpty
                        ? Center(
                            child: Text('Savatcha bo\'sh',
                                style: theme.textTheme.bodyLarge?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                )),
                          )
                        : ListView.builder(
                            controller: controller,
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                            itemCount: state.cart.length,
                            itemBuilder: (context, i) =>
                                _CartItemRow(item: state.cart[i]),
                          ),
                  ),
                  if (state.cart.isNotEmpty)
                    _CartFooter(state: state),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class _CartItemRow extends StatelessWidget {
  const _CartItemRow({required this.item});
  final PosCartItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bloc = context.read<AdminPosBloc>();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                if (item.variantText.isNotEmpty)
                  Text(item.variantText,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      )),
                const SizedBox(height: 2),
                Text("${formatSom(item.price)} so'm",
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF0A7C55),
                      fontWeight: FontWeight.w700,
                    )),
              ],
            ),
          ),
          // qty stepper
          _QtyButton(
            icon: Icons.remove,
            onTap: () => item.quantity > 1
                ? bloc.add(PosUpdateQty(item.cartId, -1))
                : bloc.add(PosRemoveFromCart(item.cartId)),
          ),
          SizedBox(
            width: 32,
            child: Text('${item.quantity}',
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
          ),
          _QtyButton(
            icon: Icons.add,
            onTap: () => bloc.add(PosUpdateQty(item.cartId, 1)),
          ),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF0A7C55).withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(icon, size: 18, color: const Color(0xFF0A7C55)),
        ),
      ),
    );
  }
}

class _CartFooter extends StatelessWidget {
  const _CartFooter({required this.state});
  final AdminPosState state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, 12, 16, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Jami summa', style: theme.textTheme.bodyMedium),
              Text("${formatSom(state.totalAmount)} so'm",
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: const Color(0xFF0A7C55),
                  )),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: () {
                final bloc = context.read<AdminPosBloc>();
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => BlocProvider.value(
                    value: bloc,
                    child: _CheckoutSheet(total: state.totalAmount),
                  ),
                );
              },
              icon: const Icon(Icons.point_of_sale_rounded, color: Colors.white),
              label: const Text('Sotuvga o\'tish',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  )),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A7C55),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Checkout varaqasi ─────────────────────────────────────────────────────────
class _CheckoutSheet extends StatefulWidget {
  const _CheckoutSheet({required this.total});
  final double total;

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  final _phone = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  String _payment = 'cash';
  int _creditDays = 10;

  Timer? _debounce;
  bool _looking = false;
  PosCustomer? _customer;
  bool _searched = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _phone.dispose();
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  void _onPhoneChanged(String v) {
    _debounce?.cancel();
    setState(() {
      _customer = null;
      _searched = false;
    });
    if (v.length != 9) return;
    _debounce = Timer(const Duration(milliseconds: 500), () => _lookup(v));
  }

  Future<void> _lookup(String nineDigits) async {
    setState(() => _looking = true);
    try {
      final customer =
          await sl<AdminRepository>().searchUser('+998$nineDigits');
      if (!mounted) return;
      setState(() {
        _customer = customer;
        _searched = true;
        if (customer != null) {
          if (_firstName.text.isEmpty) _firstName.text = customer.firstName;
          if (_lastName.text.isEmpty) _lastName.text = customer.lastName;
        }
      });
    } catch (_) {
      if (mounted) setState(() => _searched = true);
    } finally {
      if (mounted) setState(() => _looking = false);
    }
  }

  bool get _creditBanned => _customer?.creditBan ?? false;

  void _submit() {
    final phone = _phone.text.trim();
    if (phone.length != 9) {
      _toast('Telefon raqami 9 ta raqamdan iborat bo\'lishi kerak');
      return;
    }
    if (_payment == 'credit' && _creditBanned) {
      _toast('Bu mijozga nasiya taqiqlangan');
      return;
    }
    context.read<AdminPosBloc>().add(PosCheckout(
          phone: phone,
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          paymentMethod: _payment,
          creditDays: _payment == 'credit' ? _creditDays : null,
        ));
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: const Color(0xFFD97706),
        behavior: SnackBarBehavior.floating,
      ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCheckingOut =
        context.select((AdminPosBloc b) => b.state.isCheckingOut);

    return BlocListener<AdminPosBloc, AdminPosState>(
      listenWhen: (p, c) => p.completedOrder != c.completedOrder,
      listener: (context, state) {
        if (state.completedOrder != null && Navigator.canPop(context)) {
          Navigator.pop(context);
        }
      },
      child: Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        expand: false,
        builder: (_, controller) {
          return Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              children: [
                const SizedBox(height: 8),
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text('Sotuvni rasmiylashtirish',
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            )),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: ListView(
                    controller: controller,
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                    children: [
                      // Phone
                      _label(theme, 'Telefon raqami *'),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(9),
                        ],
                        decoration: InputDecoration(
                          prefixText: '+998 ',
                          hintText: '901234567',
                          suffixIcon: _looking
                              ? const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  ),
                                )
                              : (_customer != null
                                  ? const Icon(Icons.check_circle,
                                      color: Color(0xFF0A7C55))
                                  : null),
                          filled: true,
                          fillColor: theme.colorScheme.surfaceContainerLowest,
                          border: _border(theme),
                          enabledBorder: _border(theme),
                        ),
                        onChanged: _onPhoneChanged,
                      ),
                      if (_searched && _customer == null && !_looking)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            'Yangi mijoz — ismni qo\'lda kiriting',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                      if (_customer != null) _customerBanner(theme),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _label(theme, 'Ism'),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _firstName,
                                  decoration: InputDecoration(
                                    hintText: 'Ism',
                                    filled: true,
                                    fillColor:
                                        theme.colorScheme.surfaceContainerLowest,
                                    border: _border(theme),
                                    enabledBorder: _border(theme),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _label(theme, 'Familiya'),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _lastName,
                                  decoration: InputDecoration(
                                    hintText: 'Familiya',
                                    filled: true,
                                    fillColor:
                                        theme.colorScheme.surfaceContainerLowest,
                                    border: _border(theme),
                                    enabledBorder: _border(theme),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _label(theme, "To'lov turi"),
                      const SizedBox(height: 8),
                      _paymentSelector(theme),
                      if (_payment == 'credit') ...[
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _label(theme, 'Nasiya muddati'),
                            Text('$_creditDays kun',
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFFD97706),
                                )),
                          ],
                        ),
                        Slider(
                          value: _creditDays.toDouble(),
                          min: 5,
                          max: 20,
                          divisions: 15,
                          activeColor: const Color(0xFFD97706),
                          label: '$_creditDays kun',
                          onChanged: (v) =>
                              setState(() => _creditDays = v.round()),
                        ),
                      ],
                    ],
                  ),
                ),
                // Summary + submit
                Container(
                  padding: EdgeInsets.fromLTRB(
                      20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(color: theme.colorScheme.outlineVariant),
                    ),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('To\'lanadigan summa',
                              style: theme.textTheme.bodyMedium),
                          Text("${formatSom(widget.total)} so'm",
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFF0A7C55),
                              )),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: ElevatedButton(
                          onPressed: isCheckingOut ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF0A7C55),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: isCheckingOut
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Text('Sotuvni yakunlash',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                  )),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
      ),
    );
  }

  Widget _customerBanner(ThemeData theme) {
    final c = _customer!;
    final banned = c.creditBan;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: banned
            ? const Color(0xFFDC2626).withValues(alpha: 0.08)
            : const Color(0xFF0A7C55).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: banned
              ? const Color(0xFFDC2626).withValues(alpha: 0.3)
              : const Color(0xFF0A7C55).withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Icon(banned ? Icons.block : Icons.verified_user_outlined,
              size: 18,
              color: banned ? const Color(0xFFDC2626) : const Color(0xFF0A7C55)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.fullName.isEmpty ? 'Mavjud mijoz' : c.fullName,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  banned
                      ? 'Nasiya taqiqlangan (muddati o\'tgan: ${c.overdueCreditCount})'
                      : 'Ro\'yxatdan o\'tgan mijoz',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: banned
                        ? const Color(0xFFDC2626)
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _paymentSelector(ThemeData theme) {
    const methods = [
      ('cash', 'Naqd', Icons.payments_outlined),
      ('card', 'Karta', Icons.credit_card),
      ('credit', 'Nasiya', Icons.schedule),
    ];
    return Row(
      children: methods.map((m) {
        final active = _payment == m.$1;
        final disabled = m.$1 == 'credit' && _creditBanned;
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: GestureDetector(
              onTap: disabled ? null : () => setState(() => _payment = m.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: active
                      ? const Color(0xFF0A7C55)
                      : theme.colorScheme.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: active
                        ? const Color(0xFF0A7C55)
                        : theme.colorScheme.outlineVariant,
                  ),
                ),
                child: Column(
                  children: [
                    Icon(m.$3,
                        size: 20,
                        color: disabled
                            ? theme.disabledColor
                            : active
                                ? Colors.white
                                : theme.colorScheme.onSurfaceVariant),
                    const SizedBox(height: 4),
                    Text(m.$2,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: disabled
                              ? theme.disabledColor
                              : active
                                  ? Colors.white
                                  : theme.colorScheme.onSurface,
                          fontWeight: FontWeight.w700,
                        )),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _label(ThemeData theme, String text) => Text(
        text,
        style:
            theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600),
      );

  OutlineInputBorder _border(ThemeData theme) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
      );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded,
                size: 56, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Qayta urinish'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0A7C55),
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
