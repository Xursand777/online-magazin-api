import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/admin_settings_bloc.dart';
import '../widgets/admin_drawer.dart';

class AdminSettingsPage extends StatefulWidget {
  const AdminSettingsPage({super.key});

  @override
  State<AdminSettingsPage> createState() => _AdminSettingsPageState();
}

class _AdminSettingsPageState extends State<AdminSettingsPage> {
  final _rateController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();

  final _formKeyRate = GlobalKey<FormState>();
  final _formKeyShop = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    // Sahifa har safar ochilganda API dan oxirgi ma'lumotlarni so'raymiz
    context.read<AdminSettingsBloc>().add(LoadAdminSettings());
  }

  @override
  void dispose() {
    _rateController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _onSaveRate() {
    if (_formKeyRate.currentState!.validate()) {
      final rate = double.tryParse(_rateController.text.replaceAll(',', '.')) ?? 0;
      context.read<AdminSettingsBloc>().add(UpdateExchangeRate(rate));
    }
  }

  void _onSaveShopInfo() {
    if (_formKeyShop.currentState!.validate()) {
      context.read<AdminSettingsBloc>().add(UpdateShopInfo(
        shopName: _nameController.text.trim(),
        shopPhone: _phoneController.text.trim(),
        shopAddress: _addressController.text.trim(),
      ));
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
          'Sozlamalar',
          style: theme.textTheme.titleLarge?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: BlocConsumer<AdminSettingsBloc, AdminSettingsState>(
        listener: (context, state) {
          if (state.error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.error!), backgroundColor: Colors.red),
            );
          }
          if (state.successMessage != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.successMessage!), backgroundColor: const Color(0xFF0A7C55)),
            );
          }
          if (!state.isLoading && !state.isSaving) {
            // Serverdan oxirgi ma'lumotlar kelganida UI ni to'ldiramiz.
            // Boshqa qiymat bo'lsa (ya'ni server eski deb qaytarsa yoki yangilansa)
            // Majburiy tarzda update qilamizki, UI eski bo'lib qolib ketmasin.
            if (state.usdRate > 0 && _rateController.text != state.usdRate.toStringAsFixed(0)) {
              _rateController.text = state.usdRate.toStringAsFixed(0);
            }
            if (state.shopName.isNotEmpty && _nameController.text != state.shopName) {
              _nameController.text = state.shopName;
            }
            if (state.shopPhone.isNotEmpty && _phoneController.text != state.shopPhone) {
              _phoneController.text = state.shopPhone;
            }
            if (state.shopAddress.isNotEmpty && _addressController.text != state.shopAddress) {
              _addressController.text = state.shopAddress;
            }
          }
        },
        builder: (context, state) {
          if (state.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildRateCard(context, state),
                const SizedBox(height: 24),
                if (state.shopInfoUnavailable) ...[
                  _buildDeployNotice(context),
                  const SizedBox(height: 16),
                ],
                _buildShopCard(context, state),
                const SizedBox(height: 40),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildRateCard(BuildContext context, AdminSettingsState state) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      color: theme.colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKeyRate,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0A7C55).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.currency_exchange_rounded, color: Color(0xFF0A7C55)),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    "Dollar Kursi",
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _rateController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: "1 USD necha so'm?",
                  prefixIcon: const Icon(Icons.attach_money_rounded),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF0A7C55), width: 2),
                  ),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return 'Kursni kiriting';
                  if (double.tryParse(val.replaceAll(',', '.')) == null) return "Faqat son kiriting";
                  return null;
                },
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: state.isSaving ? null : _onSaveRate,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A7C55),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: state.isSaving
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text("Kursni Saqlash", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildShopCard(BuildContext context, AdminSettingsState state) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5)),
      ),
      color: theme.colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKeyShop,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0A7C55).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.store_rounded, color: Color(0xFF0A7C55)),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      "Do'kon Ma'lumotlari (Chek uchun)",
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _nameController,
                decoration: InputDecoration(
                  labelText: "Do'kon Nomi",
                  prefixIcon: const Icon(Icons.storefront_rounded),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF0A7C55), width: 2),
                  ),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return 'Do\'kon nomini kiriting';
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: "Aloqa uchun telefon",
                  prefixIcon: const Icon(Icons.phone_rounded),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF0A7C55), width: 2),
                  ),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return 'Telefon raqamni kiriting';
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _addressController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: "Do'kon Manzili",
                  prefixIcon: const Icon(Icons.location_on_rounded),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF0A7C55), width: 2),
                  ),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return 'Manzilni kiriting';
                  return null;
                },
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: (state.isSaving || state.shopInfoUnavailable) ? null : _onSaveShopInfo,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A7C55),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: state.isSaving
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text("Ma'lumotlarni Saqlash", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Server'da endpoint mavjud bo'lmaganda ko'rinadigan ogohlantirish.
  Widget _buildDeployNotice(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade300),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, color: Colors.orange.shade700, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Backend yangilanishi kerak",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.orange.shade900,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Do'kon ma'lumotlari funksiyasi serverga hali yuklanmagan (deploy qilinmagan). "
                  "Backend kodini Render'ga qayta deploy qiling.",
                  style: TextStyle(color: Colors.orange.shade800, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
