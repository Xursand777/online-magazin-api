import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';

const List<Map<String, String>> COLOR_PRESETS = [
  {'name': 'Qora', 'hex': '#111827'},
  {'name': 'Oq', 'hex': '#f8fafc'},
  {'name': "Ko'k", 'hex': '#2563eb'},
  {'name': 'Kulrang', 'hex': '#8b8f98'},
  {'name': 'Titan', 'hex': '#a8a29e'},
  {'name': 'Yashil', 'hex': '#16a34a'},
  {'name': 'Oltin', 'hex': '#d4a017'},
  {'name': 'Qizil', 'hex': '#dc2626'},
  {'name': 'Pushti', 'hex': '#ec4899'},
  {'name': 'Moviy', 'hex': '#0ea5e9'},
  {'name': 'Sariq', 'hex': '#eab308'},
  {'name': "To'q sariq", 'hex': '#f59e0b'},
  {'name': 'Binafsha', 'hex': '#8b5cf6'},
  {'name': 'Jigarrang', 'hex': '#92400e'},
  {'name': "Qo'ngir", 'hex': '#78716c'},
  {'name': 'Kumush', 'hex': '#cbd5e1'},
  {'name': 'Bronza', 'hex': '#b45309'},
  {'name': "Qo'ng'ir", 'hex': '#a16207'},
  {'name': 'Lavanda', 'hex': '#c4b5fd'},
  {'name': 'Feruza', 'hex': '#14b8a6'},
  {'name': 'Oltin sariq', 'hex': '#fbbf24'},
  {'name': 'Oq kulrang', 'hex': '#e2e8f0'},
];

const List<String> QUALITY_PRESETS = ['Original', 'Premium', 'OEM', 'Copy A', 'Copy B'];

class AdminProductFormSheet extends StatefulWidget {
  const AdminProductFormSheet({super.key, this.product});
  final AdminProductModel? product;

  @override
  State<AdminProductFormSheet> createState() => _AdminProductFormSheetState();
}

class _VariantData {
  String? groupId;
  int? id;
  String? color;
  String? colorHex;
  String? quality;
  String? model;
  String? size;
  String? barcode;
  String? sku;
  String? price;
  String? priceUsd;
  String? stock;
  File? imageFile;
  String? existingImageUrl;
  bool removeImage = false;

  _VariantData({
    this.groupId,
    this.id,
    this.color,
    this.colorHex,
    this.quality,
    this.model,
    this.size,
    this.barcode,
    this.sku,
    this.price,
    this.priceUsd,
    this.stock,
    this.imageFile,
    this.existingImageUrl,
  });
}

class _AdminProductFormSheetState extends State<AdminProductFormSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _priceUsd = TextEditingController();
  final _discountPrice = TextEditingController();
  final _discountPriceUsd = TextEditingController();
  final _costPrice = TextEditingController();
  final _costPriceUsd = TextEditingController();
  final _stock = TextEditingController();

  int? _selectedCategoryId;
  bool _isActive = true;
  bool _isNew = true;
  bool _isPopular = false;
  File? _pickedImage;
  bool _isLoading = false;

  List<_VariantData> _variants = [];

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    if (p != null) {
      _name.text = p.name;
      _description.text = p.description;
      _price.text = p.price.toStringAsFixed(0);
      _priceUsd.text = p.priceUsd?.toStringAsFixed(2) ?? '';
      _discountPrice.text = p.discountPrice?.toStringAsFixed(0) ?? '';
      _discountPriceUsd.text = p.discountPriceUsd?.toStringAsFixed(2) ?? '';
      _costPrice.text = p.costPrice?.toStringAsFixed(0) ?? '';
      _costPriceUsd.text = p.costPriceUsd?.toStringAsFixed(2) ?? '';
      _stock.text = p.stock.toString();
      _selectedCategoryId = p.categoryId;
      _isActive = p.isActive;
      _isNew = p.isNew;
      _isPopular = p.isPopular;

      // Populate variants
      if (p.variants.isNotEmpty) {
        _variants = p.variants.map((v) {
          final gid = v.color?.isNotEmpty == true ? v.color!.toLowerCase() : 'g_${v.id ?? DateTime.now().microsecondsSinceEpoch}';
          return _VariantData(
            groupId: gid,
            id: v.id,
            color: v.color,
            colorHex: v.colorHex,
            quality: v.quality,
            model: v.model,
            size: v.size,
            barcode: v.barcode,
            sku: v.sku,
            price: v.price?.toStringAsFixed(0),
            priceUsd: v.priceUsd?.toStringAsFixed(2),
            stock: v.stock.toString(),
            existingImageUrl: v.images.isNotEmpty ? v.images.first.url : null,
          );
        }).toList();
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _price.dispose();
    _priceUsd.dispose();
    _discountPrice.dispose();
    _discountPriceUsd.dispose();
    _costPrice.dispose();
    _costPriceUsd.dispose();
    _stock.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) setState(() => _pickedImage = File(picked.path));
  }

  Future<void> _pickVariantImage(int index) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) {
      setState(() {
        _variants[index].imageFile = File(picked.path);
        _variants[index].removeImage = false;
      });
    }
  }

  void _addVariantGroup() {
    setState(() {
      _variants.add(_VariantData(
        groupId: 'g_${DateTime.now().microsecondsSinceEpoch}',
        color: '',
        colorHex: '',
        stock: '0',
      ));
    });
  }

  void _addSubVariant(String groupId) {
    setState(() {
      final base = _variants.firstWhere((v) => v.groupId == groupId, orElse: () => _VariantData());
      _variants.add(_VariantData(
        groupId: groupId,
        color: base.color,
        colorHex: base.colorHex,
        stock: '0',
      ));
    });
  }

  void _removeVariant(_VariantData variant) {
    setState(() {
      _variants.remove(variant);
    });
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    final fields = <String, dynamic>{
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'price': _price.text.trim(),
      'stock': _stock.text.trim(),
      'is_active': _isActive.toString(),
      'is_new': _isNew.toString(),
      'is_popular': _isPopular.toString(),
    };
    if (_selectedCategoryId != null) {
      fields['category'] = _selectedCategoryId.toString();
    }
    if (_priceUsd.text.isNotEmpty) fields['price_usd'] = _priceUsd.text.trim();
    if (_discountPrice.text.isNotEmpty) fields['discount_price'] = _discountPrice.text.trim();
    if (_discountPriceUsd.text.isNotEmpty) fields['discount_price_usd'] = _discountPriceUsd.text.trim();
    if (_costPrice.text.isNotEmpty) fields['cost_price'] = _costPrice.text.trim();
    if (_costPriceUsd.text.isNotEmpty) fields['cost_price_usd'] = _costPriceUsd.text.trim();

    final formParts = fields.entries
        .map((e) => MapEntry(e.key, e.value.toString()))
        .toList();
    final formData = FormData.fromMap(Map.fromEntries(formParts));

    if (_pickedImage != null) {
      formData.files.add(
        MapEntry(
          'image',
          MultipartFile.fromFileSync(_pickedImage!.path, filename: 'product.jpg'),
        ),
      );
    }

    // Process Variants
    if (_variants.isNotEmpty) {
      List<Map<String, dynamic>> variantsJson = [];
      for (int i = 0; i < _variants.length; i++) {
        final v = _variants[i];
        final vMap = <String, dynamic>{
          'stock': int.tryParse(v.stock ?? '0') ?? 0,
        };
        if (v.id != null) vMap['id'] = v.id;
        if (v.color?.isNotEmpty == true) vMap['color'] = v.color;
        if (v.colorHex?.isNotEmpty == true) vMap['color_hex'] = v.colorHex;
        if (v.quality?.isNotEmpty == true) vMap['quality'] = v.quality;
        if (v.model?.isNotEmpty == true) vMap['model'] = v.model;
        if (v.size?.isNotEmpty == true) vMap['size'] = v.size;
        if (v.barcode?.isNotEmpty == true) vMap['barcode'] = v.barcode;
        if (v.sku?.isNotEmpty == true) vMap['sku'] = v.sku;
        if (v.price?.isNotEmpty == true) vMap['price'] = v.price;
        if (v.priceUsd?.isNotEmpty == true) vMap['price_usd'] = v.priceUsd;
        if (v.removeImage) vMap['remove_image'] = true;

        variantsJson.add(vMap);

        // Attach variant images if selected
        if (v.imageFile != null) {
          formData.files.add(
            MapEntry(
              'variant_image_$i',
              MultipartFile.fromFileSync(v.imageFile!.path, filename: 'variant_$i.jpg'),
            ),
          );
        }
      }
      formData.fields.add(MapEntry('variants_data', jsonEncode(variantsJson)));
    }

    final bloc = context.read<AdminBloc>();
    if (widget.product == null) {
      bloc.add(CreateAdminProduct(formData));
    } else {
      bloc.add(UpdateAdminProduct(widget.product!.id, formData));
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<AdminBloc>().state;
    final isEdit = widget.product != null;

    return DraggableScrollableSheet(
      initialChildSize: 0.94,
      maxChildSize: 0.97,
      minChildSize: 0.5,
      builder: (_, controller) {
        return Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
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
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        isEdit ? 'Mahsulotni tahrirlash' : "Yangi mahsulot qo'shish",
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
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
                child: Form(
                  key: _formKey,
                  child: ListView(
                    controller: controller,
                    padding: EdgeInsets.fromLTRB(
                      16,
                      16,
                      16,
                      MediaQuery.of(context).viewInsets.bottom + 100,
                    ),
                    children: [
                      _buildSectionTitle(context, "Asosiy ma'lumotlar"),
                      // Image picker
                      GestureDetector(
                        onTap: _pickImage,
                        child: Container(
                          height: 140,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainer,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _pickedImage != null
                                  ? const Color(0xFF0A7C55)
                                  : theme.colorScheme.outlineVariant,
                              width: 1.5,
                            ),
                          ),
                          child: _pickedImage != null
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(13),
                                  child: Image.file(
                                    _pickedImage!,
                                    fit: BoxFit.cover,
                                    width: double.infinity,
                                  ),
                                )
                              : (widget.product?.mainImage != null
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(13),
                                      child: CachedNetworkImage(
                                        imageUrl: widget.product!.mainImage!,
                                        fit: BoxFit.cover,
                                        width: double.infinity,
                                      ),
                                    )
                                  : Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.add_photo_alternate_outlined,
                                          size: 36,
                                          color: theme.colorScheme.onSurfaceVariant,
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          "Asosiy rasm tanlash",
                                          style: theme.textTheme.bodySmall,
                                        ),
                                      ],
                                    )),
                        ),
                      ),
                      const SizedBox(height: 16),
                      _FormField(
                        label: "Mahsulot nomi *",
                        controller: _name,
                        validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                      ),
                      const SizedBox(height: 12),
                      _CategoryDropdown(
                        categories: state.categories,
                        selectedId: _selectedCategoryId,
                        onChanged: (id) => setState(() => _selectedCategoryId = id),
                      ),
                      const SizedBox(height: 12),
                      _FormField(
                        label: "Tavsif",
                        controller: _description,
                        maxLines: 3,
                      ),
                      const SizedBox(height: 24),

                      _buildSectionTitle(context, 'Narxlar va Qoldiq'),
                      Row(
                        children: [
                          Expanded(
                            child: _FormField(
                              label: "Narx (UZS) *",
                              controller: _price,
                              keyboardType: TextInputType.number,
                              validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _FormField(
                              label: "Narx (USD)",
                              controller: _priceUsd,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _FormField(
                              label: "Chegirma narx (UZS)",
                              controller: _discountPrice,
                              keyboardType: TextInputType.number,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _FormField(
                              label: "Chegirma narx (USD)",
                              controller: _discountPriceUsd,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _FormField(
                              label: "Tannarx (UZS)",
                              controller: _costPrice,
                              keyboardType: TextInputType.number,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _FormField(
                              label: "Tannarx (USD)",
                              controller: _costPriceUsd,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _FormField(
                        label: "Umumiy Stok miqdori *",
                        controller: _stock,
                        keyboardType: TextInputType.number,
                        validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                      ),
                      const SizedBox(height: 24),

                      _buildSectionTitle(context, 'Holat va Belgilar'),
                      _ToggleRow(
                        label: 'Faol (Sotuvda)',
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v),
                      ),
                      _ToggleRow(
                        label: 'Yangi mahsulot',
                        value: _isNew,
                        onChanged: (v) => setState(() => _isNew = v),
                      ),
                      _ToggleRow(
                        label: 'Ommabop',
                        value: _isPopular,
                        onChanged: (v) => setState(() => _isPopular = v),
                      ),
                      const SizedBox(height: 24),

                      _buildSectionTitle(context, 'Variantlar (Modifikatsiyalar)'),
                      if (_variants.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            "Agar mahsulotning turli xil rang yoki xotira (o'lcham) variantlari bo'lsa, ularni shu yerga qo'shing.",
                            style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                          ),
                        ),
                      ..._buildGroupedVariants(context),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _addVariantGroup,
                          icon: const Icon(Icons.add),
                          label: const Text("Yangi rang (guruh) qo'shish"),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  16,
                  8,
                  16,
                  MediaQuery.of(context).padding.bottom + 8,
                ),
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0A7C55),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Text(
                            isEdit ? 'Saqlash' : "Qo'shish",
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSectionTitle(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: const Color(0xFF063F2B),
            ),
      ),
    );
  }

  List<Widget> _buildGroupedVariants(BuildContext context) {
    // Group variants by groupId
    final Map<String, List<_VariantData>> groups = {};
    for (var v in _variants) {
      final key = v.groupId ?? 'default';
      groups.putIfAbsent(key, () => []).add(v);
    }

    return groups.entries.map((e) => _buildColorGroupCard(context, e.key, e.value)).toList();
  }

  Widget _buildColorGroupCard(BuildContext context, String groupId, List<_VariantData> groupVariants) {
    final theme = Theme.of(context);
    final baseVariant = groupVariants.first;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade300),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: Color Picker
            Container(
              color: Colors.grey.shade50,
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        baseVariant.color?.isNotEmpty == true ? "Rang: ${baseVariant.color}" : "Yangi rang",
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, color: Colors.red),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () {
                          setState(() {
                            _variants.removeWhere((v) => v.groupId == groupId);
                          });
                        },
                      )
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 44,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: COLOR_PRESETS.length,
                      itemBuilder: (context, idx) {
                        final preset = COLOR_PRESETS[idx];
                        final isSelected = baseVariant.colorHex?.toLowerCase() == preset['hex'];
                        final colorVal = int.parse(preset['hex']!.replaceFirst('#', '0xFF'));
                        
                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              for (var v in _variants.where((x) => x.groupId == groupId)) {
                                v.color = preset['name'];
                                v.colorHex = preset['hex'];
                              }
                            });
                          },
                          child: Container(
                            margin: const EdgeInsets.only(right: 8),
                            width: 44,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Color(colorVal),
                              border: Border.all(
                                color: isSelected ? theme.colorScheme.primary : Colors.grey.shade300,
                                width: isSelected ? 3 : 1,
                              ),
                              boxShadow: isSelected ? [BoxShadow(color: theme.colorScheme.primary.withOpacity(0.4), blurRadius: 4)] : null,
                            ),
                            child: isSelected ? Icon(Icons.check, color: colorVal > 0xFFDDDDDD ? Colors.black : Colors.white, size: 20) : null,
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          key: ValueKey('name_${groupId}_${baseVariant.color}'),
                          initialValue: baseVariant.color,
                          decoration: _inputDeco('Boshqa rang nomi (ixtiyoriy)'),
                          onChanged: (val) {
                            for (var v in _variants.where((x) => x.groupId == groupId)) v.color = val;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          key: ValueKey('hex_${groupId}_${baseVariant.colorHex}'),
                          initialValue: baseVariant.colorHex,
                          decoration: _inputDeco('Rang kodi (Hex)'),
                          onChanged: (val) {
                            for (var v in _variants.where((x) => x.groupId == groupId)) v.colorHex = val;
                          },
                        ),
                      ),
                    ],
                  )
                ],
              ),
            ),
            
            // Sub-variants list
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: groupVariants.length,
              itemBuilder: (context, idx) {
                return _buildSubVariantCard(context, groupVariants[idx], idx);
              },
            ),
            
            // Add sub-variant button
            InkWell(
              onTap: () => _addSubVariant(groupId),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: Colors.grey.shade200)),
                  color: Colors.grey.shade50,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.add_circle_outline, color: theme.colorScheme.primary, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      "Ushbu rang uchun yana sifat/o'lcham qo'shish",
                      style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _buildSubVariantCard(BuildContext context, _VariantData v, int index) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
        color: Colors.white,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Sifat va O'lcham #${index + 1}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.grey)),
              IconButton(
                onPressed: () => _removeVariant(v),
                icon: const Icon(Icons.close, color: Colors.grey, size: 20),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              // Variant image
              GestureDetector(
                onTap: () {
                  final globalIndex = _variants.indexOf(v);
                  if (globalIndex != -1) _pickVariantImage(globalIndex);
                },
                child: Container(
                  width: 70,
                  height: 70,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: v.imageFile != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(7),
                          child: Image.file(v.imageFile!, fit: BoxFit.cover),
                        )
                      : (v.existingImageUrl != null && !v.removeImage
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(7),
                              child: CachedNetworkImage(
                                imageUrl: v.existingImageUrl!,
                                fit: BoxFit.cover,
                              ),
                            )
                          : const Icon(Icons.add_a_photo_outlined, color: Colors.grey)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Autocomplete<String>(
                            initialValue: TextEditingValue(text: v.quality ?? ''),
                            optionsBuilder: (TextEditingValue textEditingValue) {
                              if (textEditingValue.text.isEmpty) return QUALITY_PRESETS;
                              return QUALITY_PRESETS.where((String option) {
                                return option.toLowerCase().contains(textEditingValue.text.toLowerCase());
                              });
                            },
                            onSelected: (String selection) {
                              setState(() => v.quality = selection);
                            },
                            fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
                              return TextFormField(
                                controller: controller,
                                focusNode: focusNode,
                                decoration: _inputDeco('Sifat (Quality)'),
                                onChanged: (val) => v.quality = val,
                              );
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextFormField(
                            initialValue: v.model,
                            decoration: _inputDeco('Model nomi'),
                            onChanged: (val) => v.model = val,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            initialValue: v.size,
                            decoration: _inputDeco("Xotira/O'lcham"),
                            onChanged: (val) => v.size = val,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextFormField(
                            initialValue: v.sku,
                            decoration: _inputDeco('SKU (kod)'),
                            onChanged: (val) => v.sku = val,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: v.barcode,
                  decoration: _inputDeco('Shtrix kod'),
                  onChanged: (val) => v.barcode = val,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  initialValue: v.stock,
                  keyboardType: TextInputType.number,
                  decoration: _inputDeco('Stok *'),
                  onChanged: (val) => v.stock = val,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: v.price,
                  keyboardType: TextInputType.number,
                  decoration: _inputDeco('Alohida narx (UZS)'),
                  onChanged: (val) => v.price = val,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  initialValue: v.priceUsd,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: _inputDeco('Alohida narx (USD)'),
                  onChanged: (val) => v.priceUsd = val,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  InputDecoration _inputDeco(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(fontSize: 12, color: Colors.grey),
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}

class _FormField extends StatelessWidget {
  const _FormField({
    required this.label,
    required this.controller,
    this.keyboardType,
    this.validator,
    this.maxLines = 1,
  });
  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          validator: validator,
          maxLines: maxLines,
          decoration: InputDecoration(
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerLowest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 12,
            ),
          ),
        ),
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w500,
            ),
          ),
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeThumbColor: const Color(0xFF0A7C55),
          ),
        ],
      ),
    );
  }
}

class _CategoryDropdown extends StatelessWidget {
  const _CategoryDropdown({
    required this.categories,
    required this.selectedId,
    required this.onChanged,
  });
  final List<AdminCategoryModel> categories;
  final int? selectedId;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Kategoriya',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<int>(
          initialValue: selectedId,
          hint: const Text('Tanlang'),
          decoration: InputDecoration(
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerLowest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 12,
            ),
          ),
          isExpanded: true,
          items: categories
              .map(
                (c) => DropdownMenuItem(
                  value: c.id,
                  child: Text(c.name, overflow: TextOverflow.ellipsis),
                ),
              )
              .toList(),
          onChanged: onChanged,
        ),
      ],
    );
  }
}
