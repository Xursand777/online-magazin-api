import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/i18n/language_extension.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_constants.dart';
import '../../../../core/models/product_model.dart';
import '../../../../core/utils/address.dart';
import '../../../../core/widgets/address_picker.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../profile/data/models/profile_model.dart';
import '../cubit/checkout_cubit.dart';

class CheckoutPage extends StatelessWidget {
  final bool isQuickBuy;
  final ProductModel? product;

  const CheckoutPage({
    super.key,
    required this.isQuickBuy,
    this.product,
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => CheckoutCubit(apiClient: sl<ApiClient>()),
      child: CheckoutView(isQuickBuy: isQuickBuy, product: product),
    );
  }
}

class CheckoutView extends StatefulWidget {
  final bool isQuickBuy;
  final ProductModel? product;

  const CheckoutView({super.key, required this.isQuickBuy, this.product});

  @override
  State<CheckoutView> createState() => _CheckoutViewState();
}

class _CheckoutViewState extends State<CheckoutView> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController(text: '+998 ');

  /// Strukturalangan manzil — AddressPicker'dan keladi va Profile'dan auto-fill.
  /// Submit'da `addr.full` backend'ga yuboriladi (saytdagi bilan bir xil).
  StructuredAddress _address = StructuredAddress.empty;

  // ── Phase 3.1 — Manzil koordinatasi va kuryer eslatmasi ──────────────
  // Profile'dan auto-loaded — foydalanuvchi Mening manzilim'da xaritadan
  // tanlasa, har checkout'da qayta tanlash shart emas.
  double? _deliveryLat;
  double? _deliveryLng;
  String _deliveryNotes = '';

  String _paymentMethod = 'cash'; // 'cash', 'card', or 'installment'
  int _creditDays = 10;
  bool _isLoadingDetails = false;
  Map<String, dynamic>? _creditStatus;

  @override
  void initState() {
    super.initState();
    _loadCheckoutDetails();
  }

  Future<void> _loadCheckoutDetails() async {
    final authState = context.read<AuthBloc>().state;
    if (authState is AuthAuthenticated) {
      setState(() {
        _isLoadingDetails = true;
      });
      try {
        // Fetch profile
        final profileResponse = await sl<ApiClient>().dio.get(ApiConstants.profile);
        final profile = ProfileModel.fromJson(profileResponse.data as Map<String, dynamic>);
        
        // Fetch credit status
        final creditResponse = await sl<ApiClient>().dio.get('/api/orders/credit-status/');
        final creditStatus = creditResponse.data as Map<String, dynamic>;

        if (mounted) {
          setState(() {
            _creditStatus = creditStatus;
            
            // Auto-fill form fields
            if (profile.fullName.isNotEmpty) {
              _nameController.text = profile.fullName;
            }
            if (profile.phone.isNotEmpty) {
              _phoneController.text = profile.phone;
            }
            // AUTO-FILL manzil — Profile'da saqlangan bo'lsa, 4 maydonga
            // parse qilib AddressPicker'ga uzatamiz. Foydalanuvchi qayta
            // yozish/tanlashga majbur emas — eski manzil tayyor turadi.
            if (profile.deliveryAddress.isNotEmpty) {
              _address = StructuredAddress.parse(profile.deliveryAddress);
            }
            // Phase 3.1 — Profile koordinata va eslatmasini auto-load.
            // Bu KRITIK fix: Mening manzilim'da xaritadan tanlangan koordinata
            // hozir checkout'da auto-ishlatiladi → Order'da delivery_lat/lng
            // saqlanadi → kuryer xaritasi tugmasi ko'rinadi.
            _deliveryLat = profile.deliveryLat;
            _deliveryLng = profile.deliveryLng;
            _deliveryNotes = profile.deliveryNotes;
            _isLoadingDetails = false;
          });
        }
      } catch (e) {
        if (mounted) {
          setState(() {
            _isLoadingDetails = false;
          });
        }
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      final cleanPhone = _phoneController.text.replaceAll(RegExp(r'\s+'), '');
      final phoneRegex = RegExp(r'^\+998[0-9]{9}$');
      if (!phoneRegex.hasMatch(cleanPhone)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak"),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      // Manzilning to'liqligini tekshirish — strukturalangan bo'lsa, kamida
      // viloyat + tuman + uy/ko'cha bo'lishi shart.
      if (!_address.isValid) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                "Yetkazib berish manzili to'liq emas. Viloyat, tuman/shahar va uy/ko'cha majburiy."),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      // ⚠ DEFENSIVE NORMALIZATION (Phase 3.0)
      // Oddiy foydalanuvchi (usta emas) muddatli to'lov tanlay olmaydi.
      // Lekin state buzilishi (auth race condition, eski cache) sababli
      // _paymentMethod='installment' bo'lib qolishi mumkin. Bu yerda kuch
      // bilan 'cash'ga aylantiramiz — backend hech qachon master_required
      // qaytarmaydi.
      final authState = context.read<AuthBloc>().state;
      final bool isMasterAuth = authState is AuthAuthenticated &&
          (authState.isMaster || authState.canUseCredit);
      if (!isMasterAuth && _paymentMethod == 'installment') {
        setState(() => _paymentMethod = 'cash');
      }

      if (_paymentMethod == 'installment') {
        if (_creditStatus != null) {
          if (_creditStatus!['credit_ban'] == true) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text("Hisobingiz bloklanganligi sababli muddatli to'lovga buyurtma bera olmaysiz"),
                backgroundColor: Colors.red,
              ),
            );
            return;
          }
          if (_creditStatus!['has_unpaid_credit'] == true) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text("Faol to'lanmagan muddatli to'lovingiz borligi sababli buyurtma bera olmaysiz"),
                backgroundColor: Colors.red,
              ),
            );
            return;
          }
        }
      }

      if (widget.isQuickBuy && widget.product != null) {
        context.read<CheckoutCubit>().submitQuickBuy(
              product: widget.product!,
              name: _nameController.text,
              phone: _phoneController.text,
              address: _address.full,
              paymentMethod: _paymentMethod,
              creditDays: _paymentMethod == 'installment' ? _creditDays : null,
              // Phase 3.1 — Profile'dan auto-loaded koordinata va eslatma
              deliveryLat: _deliveryLat,
              deliveryLng: _deliveryLng,
              deliveryNotes: _deliveryNotes,
            );
      } else {
        context.read<CheckoutCubit>().submitCartCheckout(
              name: _nameController.text,
              phone: _phoneController.text,
              address: _address.full,
              paymentMethod: _paymentMethod,
              creditDays: _paymentMethod == 'installment' ? _creditDays : null,
              // Phase 3.1 — Profile'dan auto-loaded koordinata va eslatma
              deliveryLat: _deliveryLat,
              deliveryLng: _deliveryLng,
              deliveryNotes: _deliveryNotes,
            );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = context.watch<AuthBloc>().state;
    bool isMaster = false;
    if (authState is AuthAuthenticated) {
      isMaster = authState.isMaster || authState.canUseCredit;
    }
    
    // Summani hisoblash
    double totalAmount = 0;
    if (widget.isQuickBuy && widget.product != null) {
      totalAmount = widget.product!.price;
    } else {
      totalAmount = context.watch<CartBloc>().state.totalAmount;
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('checkout.title')),
      ),
      body: _isLoadingDetails
          ? const Center(child: CircularProgressIndicator())
          : BlocConsumer<CheckoutCubit, CheckoutState>(
              listener: (context, state) {
                if (state is CheckoutSuccess) {
                  // ── Buyurtmadan keyin savatni HAQIQATGA moslaymiz ──────────
                  // • Tezkor xarid: faqat SOTIB OLINGAN mahsulotni savatdan olib
                  //   tashlaymiz (agar savatda bo'lsa). Boshqa mahsulotlar qoladi —
                  //   foydalanuvchi faqat shu mahsulotni sotib oldi.
                  // • Oddiy checkout: butun savat tozalanadi (backend ham server
                  //   cart'ni bo'shatadi: OrderFromCartView → cart.items.delete()).
                  if (widget.isQuickBuy && widget.product != null) {
                    context.read<CartBloc>().add(
                          RemoveFromCart(
                            widget.product!.id,
                            variantId: widget.product!.variantId,
                          ),
                        );
                  } else {
                    context.read<CartBloc>().add(ClearCart());
                  }

                  showDialog(
                    context: context,
                    barrierDismissible: false,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Muvaffaqiyatli!'),
                      content: const Text("Buyurtmangiz qabul qilindi. Tez orada siz bilan bog'lanamiz."),
                      actions: [
                        TextButton(
                          onPressed: () {
                            Navigator.pop(ctx);
                            context.go('/'); // Bosh sahifaga qaytish
                          },
                          child: const Text('Asosiyga qaytish'),
                        )
                      ],
                    ),
                  );
                } else if (state is CheckoutError) {
                  // ⚠ DEFENSIVE: backend `master_required` kodi qaytarsa,
                  // foydalanuvchi usta emas — to'lov turini Naqd'ga avtomatik
                  // qaytarib chiroyli yo'naltirish xabari ko'rsatamiz.
                  if (state.isMasterRequired) {
                    setState(() => _paymentMethod = 'cash');
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text(
                          "Muddatli to'lov faqat Ustalar uchun. "
                          "Naqd pul tanlandi — qayta urinib ko'ring.",
                        ),
                        backgroundColor: theme.colorScheme.tertiary,
                        behavior: SnackBarBehavior.floating,
                        duration: const Duration(seconds: 4),
                      ),
                    );
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(state.message),
                        backgroundColor: theme.colorScheme.error,
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  }
                }
              },
              builder: (context, state) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Tanlangan mahsulotlar ro'yxati
                        Text('Sotib olinayotgan mahsulotlar', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        if (widget.isQuickBuy && widget.product != null)
                          _CheckoutProductItem(
                            product: widget.product!,
                            quantity: 1,
                          )
                        else
                          ...context.watch<CartBloc>().state.items.map(
                                (item) => _CheckoutProductItem(
                                  product: item.product,
                                  quantity: item.quantity,
                                ),
                              ),
                        const SizedBox(height: 24),

                        // Umumiy summa info
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer.withOpacity(0.4),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: theme.colorScheme.primary.withOpacity(0.2)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                "To'lanishi kerak bo'lgan summa:",
                                style: theme.textTheme.bodyLarge?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                "${NumberFormat('#,###', 'uz_UZ').format(totalAmount).replaceAll(',', ' ')} so'm",
                                style: theme.textTheme.headlineMedium?.copyWith(
                                  color: theme.colorScheme.primary,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 32),

                        // Muddatli to'lov blok ogohlantirishlari
                        if (isMaster && _creditStatus != null) ...[
                          if (_creditStatus!['credit_ban'] == true) ...[
                            Container(
                              margin: const EdgeInsets.only(bottom: 24),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.errorContainer.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: theme.colorScheme.error.withOpacity(0.5)),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.block, color: theme.colorScheme.error, size: 24),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          "Muddatli to'lov bloklangan",
                                          style: theme.textTheme.titleSmall?.copyWith(
                                            color: theme.colorScheme.error,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          "Muddati o'tgan to'lovlar sababli muddatli to'lov xizmati bloklangan. Iltimos, ma'lumot olish uchun qo'llab-quvvatlash xizmatiga murojaat qiling.",
                                          style: theme.textTheme.bodySmall?.copyWith(height: 1.3),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ] else if (_creditStatus!['has_unpaid_credit'] == true) ...[
                            Container(
                              margin: const EdgeInsets.only(bottom: 24),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.amber.withOpacity(0.05),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: Colors.amber.shade700.withOpacity(0.5)),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.warning_amber_rounded, color: Colors.amber.shade800, size: 24),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          "To'lanmagan muddatli to'lov mavjud (#${_creditStatus!['unpaid_credit_order_id']})",
                                          style: theme.textTheme.titleSmall?.copyWith(
                                            color: Colors.amber.shade900,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          "Qaytarish muddati: ${_creditStatus!['unpaid_credit_due_date']}. Uni yopmasdan yangi muddatli to'lov buyurtma qila olmaysiz.",
                                          style: theme.textTheme.bodySmall?.copyWith(height: 1.3),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                        
                        // F.I.Sh
                        Text(context.tr('checkout.receiverName'), style: theme.textTheme.titleSmall),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _nameController,
                          decoration: InputDecoration(
                            hintText: 'Ismingizni kiriting',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          validator: (v) => v == null || v.isEmpty ? 'Ism kiritish majburiy' : null,
                        ),
                        const SizedBox(height: 20),

                        // Telefon raqam — READ-ONLY (login raqami, o'zgartirib bo'lmaydi)
                        Row(
                          children: [
                            Text(context.tr('checkout.receiverPhone'),
                                style: theme.textTheme.titleSmall),
                            const SizedBox(width: 6),
                            Icon(Icons.lock_outline_rounded,
                                size: 14,
                                color: theme.colorScheme.outline),
                          ],
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _phoneController,
                          readOnly: true, // ⚠ Login raqami — o'zgartirib bo'lmaydi
                          keyboardType: TextInputType.phone,
                          style: TextStyle(
                            color: theme.colorScheme.onSurface,
                            fontWeight: FontWeight.w600,
                          ),
                          decoration: InputDecoration(
                            hintText: '+998 90 123 45 67',
                            helperText: 'Login raqamingiz — o\'zgartirib bo\'lmaydi',
                            helperStyle: TextStyle(
                              fontSize: 11,
                              color: theme.colorScheme.outline,
                            ),
                            filled: true,
                            fillColor:
                                theme.colorScheme.surfaceContainerLow,
                            border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12)),
                            suffixIcon: Icon(
                              Icons.lock_outline_rounded,
                              size: 18,
                              color: theme.colorScheme.outline,
                            ),
                          ),
                          validator: (v) => v == null || v.length < 9
                              ? "Telefon raqami yo'q. Profilda o'rnatilgan bo'lishi kerak."
                              : null,
                        ),
                        const SizedBox(height: 20),

                        // ── YETKAZIB BERISH MANZILI ────────────────────────
                        // AddressPicker — Profile sahifasi bilan IDENTIK widget.
                        //   • 4 ta strukturalangan maydon
                        //   • "Kartadan tanlash" — flutter_map xarita
                        //   • "Joylashuvni aniqlash" — GPS + permission dialog
                        //
                        // AUTO-FILL:
                        //   Profile.delivery_address eski saqlangan bo'lsa,
                        //   _loadCheckoutDetails() ichida parse qilinib
                        //   _address ga yoziladi va shu yerda inputlarda
                        //   ko'rinadi. Foydalanuvchi qayta yozish/tanlashga
                        //   majbur emas.
                        Text(
                          context.tr('checkout.deliveryAddress'),
                          style: theme.textTheme.titleSmall,
                        ),
                        const SizedBox(height: 8),
                        AddressPicker(
                          value: _address,
                          onChanged: (addr) {
                            setState(() => _address = addr);
                          },
                          language: 'uz',
                          showHeading: false, // o'z sarlavhasi bor
                          required: true,
                        ),
                        const SizedBox(height: 32),

                        // To'lov turi
                        Text(context.tr('checkout.paymentType'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: _PaymentMethodCard(
                                title: context.tr('checkout.cash'),
                                icon: Icons.money,
                                isSelected: _paymentMethod == 'cash',
                                onTap: () => setState(() => _paymentMethod = 'cash'),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _PaymentMethodCard(
                                title: context.tr('checkout.card'),
                                icon: Icons.credit_card,
                                isSelected: _paymentMethod == 'card',
                                onTap: () => setState(() => _paymentMethod = 'card'),
                              ),
                            ),
                            if (isMaster) ...[
                              const SizedBox(width: 8),
                              Expanded(
                                child: _PaymentMethodCard(
                                  title: context.tr('checkout.credit'),
                                  icon: Icons.calendar_today_rounded,
                                  isSelected: _paymentMethod == 'installment',
                                  onTap: () {
                                    if (_creditStatus != null && 
                                        (_creditStatus!['credit_ban'] == true || _creditStatus!['has_unpaid_credit'] == true)) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text("Sizda muddatli to'lov cheklovi mavjud"),
                                          backgroundColor: Colors.red,
                                        ),
                                      );
                                    } else {
                                      setState(() => _paymentMethod = 'installment');
                                    }
                                  },
                                ),
                              ),
                            ],
                          ],
                        ),

                        // Muddatli to'lov kunlari slider
                        if (isMaster && _paymentMethod == 'installment') ...[
                          const SizedBox(height: 24),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.primary.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: theme.colorScheme.primary.withOpacity(0.2)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      "To'lov muddati:",
                                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
                                    ),
                                    Text(
                                      "$_creditDays kun",
                                      style: theme.textTheme.titleMedium?.copyWith(
                                        color: theme.colorScheme.primary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                                Slider(
                                  value: _creditDays.toDouble(),
                                  min: 5,
                                  max: 20,
                                  divisions: 15,
                                  label: "$_creditDays kun",
                                  onChanged: (value) {
                                    setState(() {
                                      _creditDays = value.toInt();
                                    });
                                  },
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  "Muddatli to'lov 5 kundan 20 kungacha beriladi. Belgilangan muddatdan kechiksa, muddatli to'lov xizmati bloklanadi.",
                                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 48),

                        // Submit button
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: ElevatedButton(
                            onPressed: state is CheckoutLoading ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: theme.colorScheme.primary,
                              foregroundColor: theme.colorScheme.onPrimary,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            ),
                            child: state is CheckoutLoading
                                ? const CircularProgressIndicator(color: Colors.white)
                                : Text(
                                    context.tr('checkout.confirmOrder'),
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _PaymentMethodCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  const _PaymentMethodCard({
    required this.title,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isSelected ? theme.colorScheme.primary : theme.colorScheme.outlineVariant;
    
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color, width: isSelected ? 2 : 1),
          color: isSelected ? theme.colorScheme.primary.withOpacity(0.05) : Colors.transparent,
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(
              title,
              style: TextStyle(
                color: isSelected ? theme.colorScheme.onSurface : theme.colorScheme.outline,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckoutProductItem extends StatelessWidget {
  final ProductModel product;
  final int quantity;

  const _CheckoutProductItem({
    required this.product,
    required this.quantity,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.outlineVariant.withOpacity(0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Rasm
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: CachedNetworkImage(
              imageUrl: product.imageUrl,
              width: 60,
              height: 60,
              fit: BoxFit.cover,
              placeholder: (context, url) => Container(
                color: theme.colorScheme.surfaceContainerHighest,
                child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              errorWidget: (context, url, error) => Container(
                color: theme.colorScheme.surfaceContainerHighest,
                child: const Icon(Icons.error_outline),
              ),
            ),
          ),
          const SizedBox(width: 12),
          
          // Ma'lumotlar
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.name,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  "${NumberFormat('#,###', 'uz_UZ').format(product.price).replaceAll(',', ' ')} so'm  x  $quantity",
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
