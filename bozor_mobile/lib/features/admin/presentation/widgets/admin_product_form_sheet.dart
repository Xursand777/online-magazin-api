import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../bloc/admin_bloc.dart';
import '../../data/models/admin_product_model.dart';
import '../../data/models/product_submission.dart';
import '../../data/repositories/admin_repository.dart';
import '../../../../core/di/injection_container.dart';

const Color _genGreen = Color(0xFF0A7C55);

// ─────────────────────────────────────────────────────────────────────────────
//  UZS ↔ USD AVTOMATIK KONVERTATSIYA
//  Saytdagi (frontend/src/pages/AdminPanel.tsx) `stripNumberFormatting` va
//  `formatPriceInput` mantig'ining AYNAN ko'chirmasi. Admin narx kiritganda
//  bir maydon (UZS yoki USD) to'ldirilsa, ikkinchisi dollar kursiga ko'ra
//  avtomatik hisoblanadi.
// ─────────────────────────────────────────────────────────────────────────────

/// Probel/vergulli matnni toza songa keltiradi: "15 000 000" → "15000000",
/// "1 200,50" → "1200.50". (Web: value.replace(/\s+/g,'').replace(/,/g,'.'))
String _stripNum(String value) =>
    value.replaceAll(RegExp(r'\s+'), '').replaceAll(',', '.');

/// Butun UZS qiymatni "15 000 000" ko'rinishida probel bilan ajratadi.
/// (Web: formatPriceInput — minglik ajratuvchi.)
String _formatUzsDigits(String raw) {
  final digits = _stripNum(
    raw,
  ).split('.').first.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return '';
  final trimmed = digits.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  final buf = StringBuffer();
  for (var i = 0; i < trimmed.length; i++) {
    if (i > 0 && (trimmed.length - i) % 3 == 0) buf.write(' ');
    buf.write(trimmed[i]);
  }
  return buf.toString();
}

/// UZS maydonida foydalanuvchi yozayotganda real-time probel formatlash
/// (saytdagi minglik ajratuvchi ko'rinishi). Kursorni oxiriga qo'yadi.
class _ThousandsFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final formatted = _formatUzsDigits(newValue.text);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

/// USD maydonida faqat raqam, nuqta va vergulga ruxsat (1200.50).
final List<TextInputFormatter> _usdFormatters = [
  FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
];

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

const List<String> QUALITY_PRESETS = [
  'Original',
  'Premium',
  'OEM',
  'Copy A',
  'Copy B',
];

class AdminProductFormSheet extends StatefulWidget {
  const AdminProductFormSheet({super.key, this.product, this.clone = false});
  final AdminProductModel? product;

  /// #N(clone): product berilgan, lekin YANGI mahsulot sifatida (id'siz) —
  /// ma'lumotlar manba mahsulotdan to'ldiriladi, saqlashda Create yuboriladi.
  final bool clone;

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
  // Phase 4.0 — do'kondagi polka manzili (faqat admin/POS uchun). Maksimal
  // 20 belgi (backend `CharField(max_length=20)`). Foydalanuvchi tomonida
  // umuman ko'rsatilmaydi — backend public API'da bu maydon yo'q.
  String? shelfLocation;
  String? price;
  String? priceUsd;
  // #N(per-variant cost/discount): web bilan to'liq tenglash — har variant o'z
  // chegirma va tannarxiga ega (hisobotda variant foydasi aniq bo'lishi uchun).
  String? discountPrice;
  String? discountPriceUsd;
  String? costPrice;
  String? costPriceUsd;
  String? stock;
  File? imageFile;
  String? existingImageUrl;
  bool removeImage = false;
  // #11: variant galereyasi (ko'p rasm). Swatch (`imageFile`/`existingImageUrl`)
  // dan ALOHIDA — backendga `variant_images_{i}_{j}` bo'lib yuboriladi.
  List<File> galleryFiles = []; // yangi tanlangan galereya rasmlari
  List<AdminProductImageModel> existingGallery = []; // serverdagi (tahrir)
  Set<int> deleteImageIds = {}; // o'chirilishi kerak bo'lgan galereya id'lari
  // #N(SKU): SKU dasturiy generatsiya qilinganda oshiriladi — SKU maydoni
  // (controllersiz, initialValue) yangi qiymat bilan qayta quriladi.
  int skuGen = 0;

  /// Variant narx maydonlari uchun controllerlar — UZS↔USD avtomatik
  /// konvertatsiya saytdagidek ishlashi uchun (har bir variant alohida).
  late final TextEditingController priceCtrl;
  late final TextEditingController priceUsdCtrl;
  late final TextEditingController discountCtrl;
  late final TextEditingController discountUsdCtrl;
  late final TextEditingController costCtrl;
  late final TextEditingController costUsdCtrl;

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
    this.shelfLocation,
    this.price,
    this.priceUsd,
    this.discountPrice,
    this.discountPriceUsd,
    this.costPrice,
    this.costPriceUsd,
    this.stock,
    this.imageFile,
    this.existingImageUrl,
  }) {
    // Controllerda chiroyli (probelli) ko'rinish, lekin saqlash uchun
    // toza qiymatni saqlaymiz.
    priceCtrl = TextEditingController(text: _formatUzsDigits(price ?? ''));
    priceUsdCtrl = TextEditingController(text: priceUsd ?? '');
    discountCtrl = TextEditingController(
      text: _formatUzsDigits(discountPrice ?? ''),
    );
    discountUsdCtrl = TextEditingController(text: discountPriceUsd ?? '');
    costCtrl = TextEditingController(text: _formatUzsDigits(costPrice ?? ''));
    costUsdCtrl = TextEditingController(text: costPriceUsd ?? '');
    price = _stripNum(price ?? '');
    priceUsd = _stripNum(priceUsd ?? '');
    discountPrice = _stripNum(discountPrice ?? '');
    discountPriceUsd = _stripNum(discountPriceUsd ?? '');
    costPrice = _stripNum(costPrice ?? '');
    costPriceUsd = _stripNum(costPriceUsd ?? '');
  }

  void disposeControllers() {
    priceCtrl.dispose();
    priceUsdCtrl.dispose();
    discountCtrl.dispose();
    discountUsdCtrl.dispose();
    costCtrl.dispose();
    costUsdCtrl.dispose();
  }
}

class _AdminProductFormSheetState extends State<AdminProductFormSheet> {
  // #8: Ko'p bosqichli (stepper) forma. Har bosqich ALOHIDA Form (alohida
  // validatsiya) — "Keyingi" bosilganda faqat shu bosqich tekshiriladi, yakuniy
  // saqlashda esa barcha bosqichlar tekshiriladi. IndexedStack barcha
  // bosqichlarni "tirik" saqlaydi (controller/holat yo'qolmaydi).
  static const List<String> _stepLabels = ['Asosiy', 'Narx', 'Variantlar'];
  final List<GlobalKey<FormState>> _stepKeys = List.generate(
    3,
    (_) => GlobalKey<FormState>(),
  );
  int _step = 0;
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _priceUsd = TextEditingController();
  final _discountPrice = TextEditingController();
  final _discountPriceUsd = TextEditingController();
  final _costPrice = TextEditingController();
  final _costPriceUsd = TextEditingController();
  final _stock = TextEditingController();
  // Phase 4.2 — product darajasidagi polka (variantsiz mahsulot yoki
  // variantli mahsulot uchun default fallback).
  final _shelfLocation = TextEditingController();

  int? _selectedCategoryId;
  bool _isActive = true;
  bool _isNew = true;
  bool _isPopular = false;
  File? _pickedImage;
  bool _isLoading = false;

  /// Joriy dollar kursi (UZS). 0 bo'lsa avtomatik konvertatsiya o'chiq.
  /// Saytdagidek `GET /api/admin/exchange-rate/` dan olinadi.
  final AdminRepository _adminRepo = sl<AdminRepository>();
  double _usdRate = 0;

  List<_VariantData> _variants = [];

  // ── #N6: Qoralama (draft) avtosave ──────────────────────────────────────────
  // Bottom-sheet'ni pastga surib yopish oson — kiritilgan ma'lumot yo'qolmasligi
  // uchun forma avtomat saqlanadi (FAQAT yangi qo'shishda, tahrirда emas).
  // Surib yopilganda darhol saqlanadi (PopScope), yozish asnosida debounce bilan.
  static const String _draftKey = 'admin_product_draft';
  // Tahrirlash = product bor VA klon emas. Create = qolgani (yangi yoki klon).
  // Qoralama (draft) FAQAT toza create'da (klon manbadan to'lgani uchun emas).
  bool get _isEdit => widget.product != null && !widget.clone;
  bool get _isCreate => !_isEdit;
  bool get _isPureCreate => widget.product == null && !widget.clone;
  Map<String, dynamic>?
  _pendingDraft; // ochilganda topilgan saqlanmagan qoralama
  Timer? _draftTimer;
  bool _submitted =
      false; // "Qo'shish" bosilgan — pop'da qoralama qayta yozilmasin

  @override
  void initState() {
    super.initState();
    _loadExchangeRate();
    final p = widget.product;
    if (p != null) {
      _name.text = p.name;
      _description.text = p.description;
      _price.text = _formatUzsDigits(p.price.toStringAsFixed(0));
      _priceUsd.text = p.priceUsd?.toStringAsFixed(2) ?? '';
      _discountPrice.text = p.discountPrice != null
          ? _formatUzsDigits(p.discountPrice!.toStringAsFixed(0))
          : '';
      _discountPriceUsd.text = p.discountPriceUsd?.toStringAsFixed(2) ?? '';
      _costPrice.text = p.costPrice != null
          ? _formatUzsDigits(p.costPrice!.toStringAsFixed(0))
          : '';
      _costPriceUsd.text = p.costPriceUsd?.toStringAsFixed(2) ?? '';
      _stock.text = p.stock.toString();
      // Phase 4.2 — product polkasi (variantsiz mahsulot uchun yoki default)
      _shelfLocation.text = (p.shelfLocation ?? '').trim();
      _selectedCategoryId = p.categoryId;
      _isActive = p.isActive;
      _isNew = p.isNew;
      _isPopular = p.isPopular;

      // Populate variants
      if (p.variants.isNotEmpty) {
        _variants = p.variants.map((v) {
          final gid = v.color?.isNotEmpty == true
              ? v.color!.toLowerCase()
              : 'g_${v.id ?? DateTime.now().microsecondsSinceEpoch}';
          final vd = _VariantData(
            groupId: gid,
            // Klonда: id/sku/barcode/rasm tashlanadi (yangi variant yaratiladi).
            id: widget.clone ? null : v.id,
            color: v.color,
            colorHex: v.colorHex,
            quality: v.quality,
            model: v.model,
            size: v.size,
            barcode: widget.clone ? null : v.barcode,
            sku: widget.clone ? null : v.sku,
            // Phase 4.0 — polka: klon paytida ham saqlanadi (jismoniy joy
            // takrorlanmasligi mumkin, lekin admin keyin o'zgartiradi).
            shelfLocation: widget.clone ? null : v.shelfLocation,
            price: v.price?.toStringAsFixed(0),
            priceUsd: v.priceUsd?.toStringAsFixed(2),
            // Chegirma/tannarx — klonда ham saqlanadi (iqtisod, SKU emas).
            discountPrice: v.discountPrice?.toStringAsFixed(0),
            discountPriceUsd: v.discountPriceUsd?.toStringAsFixed(2),
            costPrice: v.costPrice?.toStringAsFixed(0),
            costPriceUsd: v.costPriceUsd?.toStringAsFixed(2),
            stock: v.stock.toString(),
            // Swatch = `image_url` (galereya birinchi rasmidan ALOHIDA).
            existingImageUrl: widget.clone ? null : v.imageUrl,
          );
          // #11: mavjud galereya rasmlari (id bor — swatch-fallback id=null
          // bo'lgani bundan tashqari). Klonда galereya ham tashlanadi.
          if (!widget.clone) {
            vd.existingGallery = v.images
                .where((img) => img.id != null)
                .toList();
          }
          return vd;
        }).toList();
      }
    }

    // Variantlardan avto-derive: mavjud variantlarning narx/chegirma/tannarx
    // controllerlariga listener ulaymiz va dastlabki recompute ham qilamiz
    // (web useEffect mount'da ishlagani kabi).
    for (final v in _variants) {
      _wireVariantAutoDerive(v);
    }
    if (_variants.isNotEmpty) {
      // Bitta frame keyinroq — initState ichidan to'g'ridan-to'g'ri text yozish
      // controller listenerlarini chaqirishi mumkin, build hali tugamaganligi
      // sababli xavfsiz emas. Microtask'da bajaramiz.
      Future.microtask(() {
        if (mounted) _recomputeProductPrices();
      });
    }

    // #N8: narx/chegirma/tannarx o'zgarsa — "tannarxdan past" ogohlantirishi
    // va Saqlash tugmasi holatini jonli yangilab turamiz (ikkala rejimda ham).
    for (final c in [_price, _discountPrice, _costPrice]) {
      c.addListener(() {
        if (mounted) setState(() {});
      });
    }

    // #N6: yangi qo'shishda — asosiy maydonlar o'zgarsa qoralamani saqlaymiz
    // (debounce) va saqlanmagan qoralamani tekshiramiz. Klonда draft YO'Q.
    if (_isPureCreate) {
      for (final c in [
        _name,
        _description,
        _price,
        _priceUsd,
        _discountPrice,
        _discountPriceUsd,
        _costPrice,
        _costPriceUsd,
        _stock,
      ]) {
        c.addListener(_scheduleSaveDraft);
      }
      _loadDraft();
    }
  }

  @override
  void dispose() {
    _draftTimer?.cancel();
    _name.dispose();
    _description.dispose();
    _price.dispose();
    _priceUsd.dispose();
    _discountPrice.dispose();
    _discountPriceUsd.dispose();
    _costPrice.dispose();
    _costPriceUsd.dispose();
    _stock.dispose();
    _shelfLocation.dispose();
    for (final v in _variants) {
      v.disposeControllers();
    }
    super.dispose();
  }

  /// Dollar kursini yuklaydi (saytdagidek). Xatolik bo'lsa konvertatsiya
  /// jim turadi — admin baribir UZS va USD ni qo'lda kiritishi mumkin.
  Future<void> _loadExchangeRate() async {
    try {
      final rate = await _adminRepo.getExchangeRate();
      if (mounted && rate > 0) setState(() => _usdRate = rate);
    } catch (_) {
      // kurs yuklanmadi — avtomatik to'ldirish o'chiq qoladi
    }
  }

  // ── #N6: Qoralama (draft) — saqlash / yuklash / tiklash ────────────────────
  void _scheduleSaveDraft() {
    if (!_isPureCreate) return;
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 600), _saveDraftNow);
  }

  Map<String, dynamic> _buildDraftMap() => {
    'name': _name.text,
    'description': _description.text,
    'price': _price.text,
    'price_usd': _priceUsd.text,
    'discount_price': _discountPrice.text,
    'discount_price_usd': _discountPriceUsd.text,
    'cost_price': _costPrice.text,
    'cost_price_usd': _costPriceUsd.text,
    'stock': _stock.text,
    // Phase 4.2 — product polkasi qoralama saqlash
    'shelf_location': _shelfLocation.text,
    'category': _selectedCategoryId,
    'is_active': _isActive,
    'is_new': _isNew,
    'is_popular': _isPopular,
    'image_path': _pickedImage?.path,
    'variants': _variants
        .map(
          (v) => {
            'group_id': v.groupId,
            'color': v.color,
            'color_hex': v.colorHex,
            'quality': v.quality,
            'model': v.model,
            'size': v.size,
            'barcode': v.barcode,
            'sku': v.sku,
            'shelf_location': v.shelfLocation,
            'price': v.priceCtrl.text,
            'price_usd': v.priceUsdCtrl.text,
            'discount': v.discountCtrl.text,
            'discount_usd': v.discountUsdCtrl.text,
            'cost': v.costCtrl.text,
            'cost_usd': v.costUsdCtrl.text,
            'stock': v.stock,
            'image_path': v.imageFile?.path,
            // #11: galereya fayl yo'llari (qoralamada ham saqlanadi).
            'gallery_paths': v.galleryFiles.map((f) => f.path).toList(),
          },
        )
        .toList(),
  };

  Future<void> _saveDraftNow() async {
    if (!_isPureCreate || _submitted) return;
    // Bo'sh formani saqlamaymiz (nom ham, variant ham yo'q bo'lsa).
    if (_name.text.trim().isEmpty && _variants.isEmpty) return;
    // MUHIM: controllerlarni `await`'dan OLDIN sinxron o'qiymiz — varaq
    // yopilib dispose bo'lsa ham (PopScope), disposed controllerni o'qimaymiz.
    final encoded = jsonEncode(_buildDraftMap());
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_draftKey, encoded);
    } catch (_) {
      /* storage xatosi — jim o'tamiz */
    }
  }

  Future<void> _clearDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_draftKey);
    } catch (_) {
      /* noop */
    }
  }

  Future<void> _loadDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_draftKey);
      if (raw == null) return;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final hasContent =
          (map['name'] as String?)?.trim().isNotEmpty == true ||
          (map['variants'] as List?)?.isNotEmpty == true;
      if (hasContent && mounted) setState(() => _pendingDraft = map);
    } catch (_) {
      await _clearDraft(); // buzuq qoralama
    }
  }

  void _restoreDraft() {
    final d = _pendingDraft;
    if (d == null) return;
    String s(dynamic v) => (v as String?) ?? '';
    setState(() {
      _name.text = s(d['name']);
      _description.text = s(d['description']);
      _price.text = s(d['price']);
      _priceUsd.text = s(d['price_usd']);
      _discountPrice.text = s(d['discount_price']);
      _discountPriceUsd.text = s(d['discount_price_usd']);
      _costPrice.text = s(d['cost_price']);
      _costPriceUsd.text = s(d['cost_price_usd']);
      _stock.text = s(d['stock']);
      _shelfLocation.text = s(d['shelf_location']);
      _selectedCategoryId = d['category'] as int?;
      _isActive = d['is_active'] as bool? ?? true;
      _isNew = d['is_new'] as bool? ?? true;
      _isPopular = d['is_popular'] as bool? ?? false;
      final ip = d['image_path'] as String?;
      _pickedImage = (ip != null && File(ip).existsSync()) ? File(ip) : null;
      // Variantlarni qayta quramiz (eski controllerlarni tozalab).
      for (final v in _variants) {
        v.disposeControllers();
      }
      _variants = ((d['variants'] as List?) ?? []).map((e) {
        final m = e as Map<String, dynamic>;
        final vd = _VariantData(
          groupId: m['group_id'] as String?,
          color: m['color'] as String?,
          colorHex: m['color_hex'] as String?,
          quality: m['quality'] as String?,
          model: m['model'] as String?,
          size: m['size'] as String?,
          barcode: m['barcode'] as String?,
          sku: m['sku'] as String?,
          shelfLocation: m['shelf_location'] as String?,
          price: m['price'] as String?,
          priceUsd: m['price_usd'] as String?,
          discountPrice: m['discount'] as String?,
          discountPriceUsd: m['discount_usd'] as String?,
          costPrice: m['cost'] as String?,
          costPriceUsd: m['cost_usd'] as String?,
          stock: m['stock'] as String?,
        );
        final vip = m['image_path'] as String?;
        if (vip != null && File(vip).existsSync()) vd.imageFile = File(vip);
        // #11: galereya fayllarini tiklaymiz (mavjud bo'lganlarini).
        final gp = (m['gallery_paths'] as List?)?.cast<String>() ?? const [];
        vd.galleryFiles = gp
            .map((p) => File(p))
            .where((f) => f.existsSync())
            .toList();
        return vd;
      }).toList();
      _pendingDraft = null;
    });
    // Tiklangan variantlarga avto-derive listenerlarini ulaymiz va MIN'ni
    // qayta hisoblaymiz (qoralamada saqlangan asosiy narxni qayta to'ldiradi).
    for (final v in _variants) {
      _wireVariantAutoDerive(v);
    }
    _recomputeProductPrices();
  }

  void _discardDraft() {
    _clearDraft();
    setState(() => _pendingDraft = null);
  }

  /// UZS yozildi → USD ni to'ldiradi. (Web: numericValue / usdRate, 2 xona;
  /// 0 yoki noto'g'ri bo'lsa bo'sh.)
  void _syncUsd(String uzsRaw, TextEditingController usdCtrl) {
    if (_usdRate <= 0) return;
    final n = double.tryParse(_stripNum(uzsRaw)) ?? 0;
    if (n <= 0) {
      usdCtrl.text = '';
      return;
    }
    final s = (n / _usdRate).toStringAsFixed(2);
    usdCtrl.text = (s == '0.00') ? '' : s;
  }

  /// USD yozildi → UZS ni to'ldiradi. (Web: round(numericValue * usdRate),
  /// minglik ajratuvchi bilan.)
  void _syncUzs(String usdRaw, TextEditingController uzsCtrl) {
    if (_usdRate <= 0) return;
    final n = double.tryParse(_stripNum(usdRaw)) ?? 0;
    if (n <= 0) {
      uzsCtrl.text = '';
      return;
    }
    uzsCtrl.text = _formatUzsDigits((n * _usdRate).round().toString());
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      // #N10: backend WebP target'i (1600px) bilan bir xil — telefonning
      // 3000-4000px surati shu yerda 1600px ga kichraytiriladi → yuklash
      // 5-10x tez, sifatda yo'qotish yo'q (backend baribir 1600 ga keltiradi).
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked != null) setState(() => _pickedImage = File(picked.path));
  }

  // ── #11: variant galereyasi (ko'p rasm) ──────────────────────────────────
  // Eslatma: avval mavjud bo'lgan `_pickVariantImage` (sub-variantning alohida
  // "swatch" rasm tanlash dialogi) sayt UI'si bilan moslashtirilganda olib
  // tashlandi — endi barcha rasm tanlash `_pickVariantGallery` orqali bo'ladi,
  // u birinchi rasmni asosiy qilib qo'yish mantig'ini ham o'z ichiga oladi.
  //
  // Saytdagi `handleVariantImagesPick` mantig'i bilan AYNAN bir xil:
  //   • Agar variantda "asosiy" rasm allaqachon bo'lsa (legacy `existingImageUrl`
  //     ko'rinmoqda yoki yangi `imageFile` tanlangan yoki existingGallery'da
  //     element bor) — barcha yangi rasmlar GALEREYAGA qo'shiladi.
  //   • Agar asosiy rasm umuman yo'q bo'lsa — birinchi yangi rasm `imageFile`'ga
  //     (asosiy = swatch) joylashtiriladi, qolganlari galereyaga ketadi. Bu
  //     backend tarafida `variant_image_$i` (asosiy) va `variant_images_${i}_$j`
  //     (galereya) bo'lib alohida saqlanadi.
  Future<void> _pickVariantGallery(int index) async {
    final picker = ImagePicker();
    final picked = await picker.pickMultiImage(
      // #N10: backend WebP target'i (1600px) bilan bir xil — yuklash tez.
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
    if (picked.isEmpty || !mounted) return;

    final files = picked.map((x) => File(x.path)).toList();
    final v = _variants[index];
    final hasLegacyMain =
        (v.existingImageUrl?.isNotEmpty ?? false) && !v.removeImage;
    final hasNewSwatch = v.imageFile != null;
    final hasExistingGalleryMain = v.existingGallery.isNotEmpty;
    final hasMain = hasLegacyMain || hasNewSwatch || hasExistingGalleryMain;

    setState(() {
      if (!hasMain && files.isNotEmpty) {
        // Birinchi yangi rasm — asosiy (swatch), qolganlari galereyaga.
        v.imageFile = files.first;
        v.removeImage = false;
        if (files.length > 1) {
          v.galleryFiles.addAll(files.skip(1));
        }
      } else {
        v.galleryFiles.addAll(files);
      }
    });
    _scheduleSaveDraft();
  }

  void _removeGalleryFile(int index, File f) {
    setState(() => _variants[index].galleryFiles.remove(f));
    _scheduleSaveDraft();
  }

  void _removeExistingGalleryImage(int index, AdminProductImageModel img) {
    setState(() {
      final v = _variants[index];
      if (img.id != null) v.deleteImageIds.add(img.id!);
      v.existingGallery.remove(img);
    });
  }

  // Legacy "swatch" (variant.image — eski asosiy rasm) ni galereyadan o'chirish.
  // Saytdagi `existing-main` X bilan ekvivalent: `removeImage=true` o'rnatiladi
  // va keyingi saqlashda backend `variant.image.delete()` qiladi
  // (_sync_variants ichida). existingImageUrl o'zgartirilmaydi — qoralama
  // tiklash holatida ham mantiq aniq qolsin.
  void _removeLegacySwatch(int index) {
    if (index < 0 || index >= _variants.length) return;
    setState(() {
      _variants[index].removeImage = true;
    });
    _scheduleSaveDraft();
  }

  // Yangi tanlangan, hali yuborilmagan "swatch" fayl (`v.imageFile`) ni
  // tashlash — galereya birinchi yangi rasmni asosiy qiladi (saytdagi
  // `handleVariantImagesPick` mantiqiga mos).
  void _clearVariantSwatchFile(int index) {
    if (index < 0 || index >= _variants.length) return;
    setState(() {
      _variants[index].imageFile = null;
    });
    _scheduleSaveDraft();
  }

  void _addVariantGroup() {
    final v = _VariantData(
      groupId: 'g_${DateTime.now().microsecondsSinceEpoch}',
      color: '',
      colorHex: '',
      stock: '0',
    );
    _wireVariantAutoDerive(v);
    setState(() => _variants.add(v));
    _scheduleSaveDraft();
  }

  void _addSubVariant(String groupId) {
    final base = _variants.firstWhere(
      (v) => v.groupId == groupId,
      orElse: () => _VariantData(),
    );
    // Web kabi — yangi sifat/hajm bazaviy rang narx/tannarxini meros oladi.
    final v = _VariantData(
      groupId: groupId,
      color: base.color,
      colorHex: base.colorHex,
      price: base.price,
      priceUsd: base.priceUsd,
      discountPrice: base.discountPrice,
      discountPriceUsd: base.discountPriceUsd,
      costPrice: base.costPrice,
      costPriceUsd: base.costPriceUsd,
      stock: '0',
    );
    _wireVariantAutoDerive(v);
    setState(() => _variants.add(v));
    _scheduleSaveDraft();
    // Bazaviy narx meros olindi — Mahsulot maydonlarini qayta hisoblaymiz.
    _recomputeProductPrices();
  }

  void _removeVariant(_VariantData variant) {
    setState(() {
      variant.disposeControllers();
      _variants.remove(variant);
    });
    _scheduleSaveDraft();
    // Variant olib tashlandi — qolganlardan MIN'ni qayta hisoblaymiz.
    _recomputeProductPrices();
  }

  // ── SKU avto-generatsiya (web generateVariantSku bilan bir xil mantiq) ──────
  static String _genSku(String productName, _VariantData v) {
    String alnum(String? s, int n) {
      final x = (s ?? '').toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
      return x.substring(0, x.length < n ? x.length : n);
    }

    final initials = productName
        .split(' ')
        .where((w) => w.isNotEmpty)
        .map((w) => w[0])
        .join();
    final prefixClean = initials.toUpperCase().replaceAll(
      RegExp(r'[^A-Z0-9]'),
      '',
    );
    final prefix = prefixClean.substring(
      0,
      prefixClean.length < 4 ? prefixClean.length : 4,
    );

    final quality = alnum(v.quality, 3);
    final model = alnum(v.model, 3);
    final size = alnum(v.size, 4);
    final colorClean = (v.color ?? '').toUpperCase().replaceAll(
      RegExp(r'[AEIOUY\s]'),
      '',
    );
    final color = colorClean.substring(
      0,
      colorClean.length < 3 ? colorClean.length : 3,
    );

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    final rnd = List.generate(
      4,
      (_) => chars[Random().nextInt(chars.length)],
    ).join();

    return [
      prefix,
      quality,
      model,
      size,
      color,
      rnd,
    ].where((s) => s.isNotEmpty).join('-');
  }

  void _regenerateSku(_VariantData v) {
    setState(() {
      v.sku = _genSku(_name.text, v);
      v.skuGen++;
    });
    _scheduleSaveDraft();
  }

  void _generateAllSkus() {
    setState(() {
      for (final v in _variants) {
        v.sku = _genSku(_name.text, v);
        v.skuGen++;
      }
    });
    _scheduleSaveDraft();
  }

  // ── Variant → Mahsulot narxi avto-derivatsiya (web ProductEditor:230 mantiq) ─
  // Variantlar borligida Mahsulot maydonlari (narx/chegirma/tannarx) MIN
  // variant qiymatiga avtomatik to'ldiriladi — admin qo'lda yozish shart emas.
  // Web: variantlardan birortasida narx YO'Q bo'lsa, oldingi qiymat saqlanadi.
  bool _recomputing = false; // re-entry'dan himoya (listener loop'ini bloklash)
  void _recomputeProductPrices() {
    if (!mounted || _recomputing) return;
    if (_variants.isEmpty) return;
    double parse(String s) => double.tryParse(_stripNum(s)) ?? 0;
    final validPrices = _variants
        .map((v) => parse(v.priceCtrl.text))
        .where((p) => p > 0)
        .toList();
    if (validPrices.isEmpty) return;
    final minPrice = validPrices.reduce(min);
    // Chegirma faqat HAQIQIY bo'lganda: kiritilgan (>0) VA o'sha variant
    // narxidan KICHIK. Aks holda bu chegirma emas (kiritilmagan yoki xato) —
    // e'tiborga olinmaydi (web ProductEditor bilan bir xil).
    final validDiscounts = _variants
        .map((v) => (
              price: parse(v.priceCtrl.text),
              disc: parse(v.discountCtrl.text),
            ))
        .where((x) => x.disc > 0 && x.disc < x.price)
        .map((x) => x.disc)
        .toList();
    final minDisc =
        validDiscounts.isEmpty ? double.infinity : validDiscounts.reduce(min);
    final minCost = _variants
        .map((v) => parse(v.costCtrl.text))
        .where((p) => p > 0)
        .fold<double>(double.infinity, (a, b) => a < b ? a : b);
    _recomputing = true;
    try {
      // Narx
      final newPrice = _formatUzsDigits(minPrice.toStringAsFixed(0));
      if (_price.text != newPrice) _price.text = newPrice;
      if (_usdRate > 0) {
        final usd = (minPrice / _usdRate).toStringAsFixed(2);
        final newPriceUsd = usd == '0.00' ? '' : usd;
        if (_priceUsd.text != newPriceUsd) _priceUsd.text = newPriceUsd;
      }
      // Chegirma — faqat HAQIQIY chegirma (narxdan kichik) bo'lsa to'ldiriladi.
      if (minDisc.isFinite && minDisc > 0) {
        final s = _formatUzsDigits(minDisc.toStringAsFixed(0));
        if (_discountPrice.text != s) _discountPrice.text = s;
        if (_usdRate > 0) {
          final usd = (minDisc / _usdRate).toStringAsFixed(2);
          final s2 = usd == '0.00' ? '' : usd;
          if (_discountPriceUsd.text != s2) _discountPriceUsd.text = s2;
        }
      } else {
        // Haqiqiy chegirma yo'q — maydon BO'SH qoladi (avtomatik to'ldirilmaydi).
        if (_discountPrice.text.isNotEmpty) _discountPrice.text = '';
        if (_discountPriceUsd.text.isNotEmpty) _discountPriceUsd.text = '';
      }
      // Tannarx — variantlarning birortasida bor bo'lsa.
      // USD tannarx kursdan MUSTAQIL — avtomatik yangilanmaydi (web qoidasi).
      if (minCost.isFinite && minCost > 0) {
        final s = _formatUzsDigits(minCost.toStringAsFixed(0));
        if (_costPrice.text != s) _costPrice.text = s;
      }
    } finally {
      _recomputing = false;
    }
  }

  /// Variantning narx/chegirma/tannarx controllerlariga avto-derive listenerni
  /// ulaydi. Variant olib tashlanganda disposeControllers() listenerni
  /// avtomatik o'chiradi (disposed controller listener'lari otmaydi).
  void _wireVariantAutoDerive(_VariantData v) {
    v.priceCtrl.addListener(_recomputeProductPrices);
    v.discountCtrl.addListener(_recomputeProductPrices);
    v.costCtrl.addListener(_recomputeProductPrices);
  }

  // ── #N(bulk-gen): Tez variant generator — rang×sifat×model×o'lcham ─────────
  // Vergul bilan ajratilgan ro'yxatlardan barcha kombinatsiyalarni yaratadi
  // (web BulkVariantGenerator bilan bir xil). Mobil variantда tannarx/chegirma
  // yo'q — faqat narx + ombor beriladi.
  Future<void> _showBulkVariantGenerator() async {
    final colorsCtrl = TextEditingController();
    final qualitiesCtrl = TextEditingController();
    final modelsCtrl = TextEditingController();
    final sizesCtrl = TextEditingController();
    final priceCtrl = TextEditingController(text: _price.text);
    final costCtrl = TextEditingController(text: _costPrice.text);
    final stockCtrl = TextEditingController(
      text: _stock.text.isEmpty ? '0' : _stock.text,
    );

    List<String> split(String s) =>
        s.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

    final created = await showModalBottomSheet<List<_VariantData>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            final colors = split(colorsCtrl.text);
            final quals = split(qualitiesCtrl.text);
            final models = split(modelsCtrl.text);
            final sizes = split(sizesCtrl.text);
            final count =
                (colors.isEmpty ? 1 : colors.length) *
                (quals.isEmpty ? 1 : quals.length) *
                (models.isEmpty ? 1 : models.length) *
                (sizes.isEmpty ? 1 : sizes.length);
            Widget field(
              String label,
              TextEditingController c,
              String hint, {
              TextInputType? kb,
            }) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TextField(
                  controller: c,
                  keyboardType: kb,
                  onChanged: (_) => setSheet(() {}),
                  decoration: InputDecoration(
                    labelText: label,
                    hintText: hint,
                    isDense: true,
                    border: const OutlineInputBorder(),
                  ),
                ),
              );
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.auto_fix_high, color: _genGreen),
                        const SizedBox(width: 8),
                        Text(
                          'Tez variant generator',
                          style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: _genGreen.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '$count ta',
                            style: const TextStyle(
                              color: _genGreen,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    field(
                      'Ranglar (vergul bilan)',
                      colorsCtrl,
                      "Qora, Oq, Ko'k",
                    ),
                    field(
                      'Sifatlar (vergul bilan)',
                      qualitiesCtrl,
                      'Original, OEM',
                    ),
                    field('Modellar (vergul bilan)', modelsCtrl, 'Pro, Ultra'),
                    field(
                      "O'lchamlar (vergul bilan)",
                      sizesCtrl,
                      '128GB, 256GB',
                    ),
                    field(
                      'Asosiy narx (so\'m)',
                      priceCtrl,
                      '15 000 000',
                      kb: TextInputType.number,
                    ),
                    field(
                      'Asosiy tannarx (so\'m)',
                      costCtrl,
                      '10 000 000',
                      kb: TextInputType.number,
                    ),
                    field(
                      'Ombor soni',
                      stockCtrl,
                      '10',
                      kb: TextInputType.number,
                    ),
                    const SizedBox(height: 4),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        onPressed: count <= 0
                            ? null
                            : () {
                                final price = _stripNum(priceCtrl.text);
                                final cost = _stripNum(costCtrl.text);
                                final stock = stockCtrl.text.trim().isEmpty
                                    ? '0'
                                    : stockCtrl.text.trim();
                                final cList = colors.isEmpty ? [''] : colors;
                                final qList = quals.isEmpty ? [''] : quals;
                                final mList = models.isEmpty ? [''] : models;
                                final sList = sizes.isEmpty ? [''] : sizes;
                                final out = <_VariantData>[];
                                for (final c in cList) {
                                  final gid = c.isNotEmpty
                                      ? c.toLowerCase()
                                      : 'g_${DateTime.now().microsecondsSinceEpoch}_${out.length}';
                                  for (final q in qList) {
                                    for (final m in mList) {
                                      for (final sz in sList) {
                                        out.add(
                                          _VariantData(
                                            groupId: gid,
                                            color: c,
                                            quality: q,
                                            model: m,
                                            size: sz,
                                            price: price,
                                            costPrice: cost,
                                            stock: stock,
                                          ),
                                        );
                                      }
                                    }
                                  }
                                }
                                Navigator.pop(ctx, out);
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _genGreen,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        icon: const Icon(
                          Icons.auto_fix_high,
                          color: Colors.white,
                        ),
                        label: Text(
                          '$count ta variant yaratish',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
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

    colorsCtrl.dispose();
    qualitiesCtrl.dispose();
    modelsCtrl.dispose();
    sizesCtrl.dispose();
    priceCtrl.dispose();
    costCtrl.dispose();
    stockCtrl.dispose();

    if (created != null && created.isNotEmpty && mounted) {
      for (final v in created) {
        _wireVariantAutoDerive(v);
      }
      setState(() => _variants.addAll(created));
      _scheduleSaveDraft();
      // Yangi generatsiya qilingan variantlar narx bilan keldi —
      // Mahsulot maydonlarini darhol to'ldiramiz.
      _recomputeProductPrices();
    }
  }

  // #N8: tannarxdan past sotuv (POS/web bilan bir xil qoida) — samarali sotuv
  // narxi (chegirma>0 ? chegirma : narx) tannarxdan past bo'lsa true. Tannarx
  // 0/bo'sh bo'lsa pol yo'q. Mobil variantда alohida tannarx yo'q — variant
  // narxi MAHSULOT tannarxiga qarshi tekshiriladi.
  bool _hasBelowCost() {
    double n(String s) => double.tryParse(_stripNum(s)) ?? 0;
    // Variantli holatda — HAR variant O'Z tannarxiga qarshi (web bilan bir xil).
    if (_variants.isNotEmpty) {
      for (final v in _variants) {
        final vCost = n(v.costCtrl.text);
        if (vCost <= 0) continue;
        final vDisc = n(v.discountCtrl.text);
        final vPrice = n(v.priceCtrl.text);
        final vSell = vDisc > 0 ? vDisc : vPrice;
        if (vSell > 0 && vSell < vCost) return true;
      }
      return false;
    }
    // Variatsiz — mahsulot darajasi.
    final cost = n(_costPrice.text);
    if (cost <= 0) return false;
    final disc = n(_discountPrice.text);
    final price = n(_price.text);
    final sell = disc > 0 ? disc : price;
    return sell > 0 && sell < cost;
  }

  // #N4: formani tozalab, yangi mahsulot kiritishga tayyorlaymiz.
  void _resetForm() {
    setState(() {
      _name.clear();
      _description.clear();
      _price.clear();
      _priceUsd.clear();
      _discountPrice.clear();
      _discountPriceUsd.clear();
      _costPrice.clear();
      _costPriceUsd.clear();
      _stock.clear();
      _selectedCategoryId = null;
      _isActive = true;
      _isNew = true;
      _isPopular = false;
      _pickedImage = null;
      for (final v in _variants) {
        v.disposeControllers();
      }
      _variants = [];
      _isLoading = false;
      _submitted = false;
      _pendingDraft = null;
      _step = 0; // #8: yangi mahsulot uchun birinchi bosqichdan boshlaymiz
    });
  }

  // ── #8: bosqich navigatsiyasi ────────────────────────────────────────────
  bool _validateStep(int i) => _stepKeys[i].currentState?.validate() ?? true;

  /// Bosqichga o'tadi. Oldinga o'tishda oraliq bosqichlar validatsiya qilinadi;
  /// birinchi xato bosqichda to'xtaydi. Orqaga erkin o'tiladi.
  void _goToStep(int target) {
    if (target == _step) return;
    if (target > _step) {
      for (int i = _step; i < target; i++) {
        if (!_validateStep(i)) {
          FocusScope.of(context).unfocus();
          setState(() => _step = i);
          return;
        }
      }
    }
    FocusScope.of(context).unfocus();
    setState(() => _step = target);
  }

  void _nextStep() => _goToStep(_step + 1);

  void _prevStep() {
    FocusScope.of(context).unfocus();
    setState(() => _step = (_step - 1).clamp(0, _stepKeys.length - 1));
  }

  void _submit({bool addAnother = false}) {
    // #8: barcha bosqichlarni tekshiramiz; xato bo'lsa o'sha bosqichga sakraymiz.
    for (int i = 0; i < _stepKeys.length; i++) {
      final ok = _stepKeys[i].currentState?.validate() ?? true;
      if (!ok) {
        FocusScope.of(context).unfocus();
        setState(() => _step = i);
        return;
      }
    }
    // #N8: tannarxdan past sotuvni bloklaymiz (tugma ham disabled — bu himoya).
    if (_hasBelowCost()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sotuv narxi tannarxdan past — narxni tuzating.'),
          backgroundColor: Color(0xFFDC2626),
        ),
      );
      return;
    }
    setState(() => _isLoading = true);

    // Saqlashdan oldin barcha narxlarni toza songa keltiramiz (probel/vergul
    // backendga ketmasligi uchun). FormData EMAS — serializatsiyalanadigan
    // ProductSubmission quramiz (#12: tarmoq uzilsa navbatga qo'yiladi va
    // ulanish tiklanganda avtomatik yuboriladi).
    // Backend `Product.price` NOT NULL — bo'sh bo'lsa '0' fallback (web kabi).
    // Variantli mahsulotda avto-derive normalda allaqachon to'ldirgan, lekin
    // hech bir variantda narx yo'q bo'lsa, bu nuqta ishonchli qilib qaytaradi.
    final stripPrice = _stripNum(_price.text);
    final stripStock = _stock.text.trim();
    final fields = <String, String>{
      'name': _name.text.trim(),
      'description': _description.text.trim(),
      'price': stripPrice.isEmpty ? '0' : stripPrice,
      'stock': stripStock.isEmpty ? '0' : stripStock,
      'is_active': _isActive.toString(),
      'is_new': _isNew.toString(),
      'is_popular': _isPopular.toString(),
      // Phase 4.2 — product polkasi (variantsiz mahsulot uchun asosiy,
      // variantli mahsulot uchun default fallback). Backend max 20 belgi
      // cheklov bilan. Bo'sh string bo'lsa ham yuboramiz — eski yozuvni
      // tozalash mumkin bo'lsin.
      'shelf_location': _shelfLocation.text.trim().length > 20
          ? _shelfLocation.text.trim().substring(0, 20)
          : _shelfLocation.text.trim(),
    };
    if (_selectedCategoryId != null) {
      fields['category'] = _selectedCategoryId.toString();
    }
    if (_priceUsd.text.trim().isNotEmpty) {
      fields['price_usd'] = _stripNum(_priceUsd.text);
    }
    if (_discountPrice.text.trim().isNotEmpty) {
      fields['discount_price'] = _stripNum(_discountPrice.text);
    }
    if (_discountPriceUsd.text.trim().isNotEmpty) {
      fields['discount_price_usd'] = _stripNum(_discountPriceUsd.text);
    }
    if (_costPrice.text.trim().isNotEmpty) {
      fields['cost_price'] = _stripNum(_costPrice.text);
    }
    if (_costPriceUsd.text.trim().isNotEmpty) {
      fields['cost_price_usd'] = _stripNum(_costPriceUsd.text);
    }

    final swatchPaths = <int, String>{};
    final galleryPaths = <int, List<String>>{};
    String variantsDataJson = '';

    if (_variants.isNotEmpty) {
      final variantsJson = <Map<String, dynamic>>[];
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
        // Phase 4.0 — polka (max 20 belgi). Bo'sh string ham yuborilishi mumkin,
        // backend `default=''` qabul qiladi. NULL/eski variantlar uchun JSON'da
        // umuman ko'rsatilmaydi — backend defaultga tushadi.
        if (v.shelfLocation?.isNotEmpty == true) {
          vMap['shelf_location'] = v.shelfLocation!.trim();
        } else if (v.id != null) {
          // Edit holatida bo'shatilgan polkani backend'ga jim yuboramiz —
          // shu sababli '' qiymat berib, eski qiymat ham tozalansin.
          vMap['shelf_location'] = '';
        }
        if (v.price?.isNotEmpty == true) vMap['price'] = v.price;
        if (v.priceUsd?.isNotEmpty == true) vMap['price_usd'] = v.priceUsd;
        if (v.discountPrice?.isNotEmpty == true) {
          vMap['discount_price'] = v.discountPrice;
        }
        if (v.discountPriceUsd?.isNotEmpty == true) {
          vMap['discount_price_usd'] = v.discountPriceUsd;
        }
        if (v.costPrice?.isNotEmpty == true) vMap['cost_price'] = v.costPrice;
        if (v.costPriceUsd?.isNotEmpty == true) {
          vMap['cost_price_usd'] = v.costPriceUsd;
        }
        if (v.removeImage) vMap['remove_image'] = true;
        // #11: o'chirilgan galereya rasm id'lari (faqat tahrirda bo'ladi).
        // Faqat haqiqiy musbat butun ID'lar — null/0 backend'da
        // `ListField(IntegerField())` rad etadi va "may not be null" beradi.
        final cleanIds = v.deleteImageIds.where((i) => i > 0).toList();
        if (cleanIds.isNotEmpty) {
          vMap['delete_image_ids'] = cleanIds;
        }

        variantsJson.add(vMap);

        // #11: swatch (asosiy variant rasmi) — `variant_image_$i`.
        if (v.imageFile != null) swatchPaths[i] = v.imageFile!.path;
        // #11: galereya (ko'p rasm) — `variant_images_${i}_${j}`.
        if (v.galleryFiles.isNotEmpty) {
          galleryPaths[i] = v.galleryFiles.map((f) => f.path).toList();
        }
      }
      variantsDataJson = jsonEncode(variantsJson);
    }

    final submission = ProductSubmission(
      localId:
          '${DateTime.now().microsecondsSinceEpoch}_${Random().nextInt(1 << 31)}',
      isUpdate: _isEdit,
      productId: _isEdit ? widget.product!.id : null,
      name: _name.text.trim(),
      fields: fields,
      imagePath: _pickedImage?.path,
      variantsDataJson: variantsDataJson,
      variantSwatchPaths: swatchPaths,
      variantGalleryPaths: galleryPaths,
      createdAtMs: DateTime.now().millisecondsSinceEpoch,
    );

    final bloc = context.read<AdminBloc>();
    if (_isCreate) {
      // #N6: ataylab saqlandi — qoralamani tozalaymiz, pop'da qayta yozilmasin.
      _submitted = true;
      _draftTimer?.cancel();
      _clearDraft();
      bloc.add(CreateAdminProduct(submission));
      if (addAnother) {
        // #N4: yopmaymiz — formani tozalab, navbatdagi mahsulotga tayyorlaymiz.
        _resetForm();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Saqlandi! Endi yangi mahsulot kiriting."),
            duration: Duration(seconds: 2),
          ),
        );
        return;
      }
    } else {
      bloc.add(UpdateAdminProduct(submission));
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = context.watch<AdminBloc>().state;
    final isEdit = _isEdit;

    // #N6: varaq surib yopilganda (yoki orqaga) — qoralamani darhol saqlaymiz.
    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, result) {
        if (_isPureCreate && !_submitted) _saveDraftNow();
      },
      child: Scaffold(
        backgroundColor: theme.colorScheme.surface,
        resizeToAvoidBottomInset: true,
        appBar: AppBar(
          backgroundColor: const Color(0xFF063F2B),
          foregroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Yopish',
            onPressed: () => Navigator.pop(context),
          ),
          title: Text(
            isEdit
                ? 'Mahsulotni tahrirlash'
                : widget.clone
                ? 'Mahsulotdan nusxa'
                : "Yangi mahsulot qo'shish",
            style: theme.textTheme.titleLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        body: Column(
          children: [
            _buildStepHeader(context),
            const Divider(height: 1),
            Expanded(
              child: IndexedStack(
                index: _step,
                sizing: StackFit.expand,
                children: [
                  // ─────────── Bosqich 1: Asosiy ma'lumotlar ───────────
                  ExcludeFocus(
                    excluding: _step != 0,
                    child: Form(
                      key: _stepKeys[0],
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                        children: [
                          // #N6: saqlanmagan qoralama topildi — tiklash/o'chirish
                          if (_pendingDraft != null) _buildDraftBanner(context),
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
                                  : (_isEdit &&
                                            widget.product?.mainImage != null
                                        ? ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              13,
                                            ),
                                            child: CachedNetworkImage(
                                              imageUrl:
                                                  widget.product!.mainImage!,
                                              fit: BoxFit.cover,
                                              width: double.infinity,
                                            ),
                                          )
                                        : Column(
                                            mainAxisAlignment:
                                                MainAxisAlignment.center,
                                            children: [
                                              Icon(
                                                Icons
                                                    .add_photo_alternate_outlined,
                                                size: 36,
                                                color: theme
                                                    .colorScheme
                                                    .onSurfaceVariant,
                                              ),
                                              const SizedBox(height: 6),
                                              Text(
                                                "Asosiy rasm tanlash",
                                                style:
                                                    theme.textTheme.bodySmall,
                                              ),
                                            ],
                                          )),
                            ),
                          ),
                          const SizedBox(height: 16),
                          _FormField(
                            label: "Mahsulot nomi *",
                            controller: _name,
                            textInputAction: TextInputAction.next,
                            validator: (v) => v!.isEmpty ? 'Majburiy' : null,
                          ),
                          const SizedBox(height: 12),
                          _CategoryDropdown(
                            categories: state.categories,
                            selectedId: _selectedCategoryId,
                            onChanged: (id) =>
                                setState(() => _selectedCategoryId = id),
                          ),
                          const SizedBox(height: 12),
                          _FormField(
                            label: "Tavsif",
                            controller: _description,
                            maxLines: 3,
                          ),
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),
                  ),
                  // ─────────── Bosqich 2: Narx va Qoldiq ───────────
                  ExcludeFocus(
                    excluding: _step != 1,
                    child: Form(
                      key: _stepKeys[1],
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                        children: [
                          _ExchangeRateHint(usdRate: _usdRate),
                          // Variantli mahsulot — Mahsulot maydonlari avtomatik
                          // to'ldirilishini aniq tushuntiramiz.
                          if (_variants.isNotEmpty) _VariantPriceAutoHint(),
                          Row(
                            children: [
                              Expanded(
                                child: _FormField(
                                  // Variantli mahsulotda Mahsulot narxi MIN
                                  // variantdan avtomatik to'ldiriladi (web kabi)
                                  // — admin uchun majburiy emas.
                                  label: _variants.isEmpty
                                      ? "Narx (UZS) *"
                                      : "Narx (UZS) — avto",
                                  controller: _price,
                                  keyboardType: TextInputType.number,
                                  textInputAction: TextInputAction.next,
                                  inputFormatters: [_ThousandsFormatter()],
                                  onChanged: (v) => _syncUsd(v, _priceUsd),
                                  validator: (v) =>
                                      (_variants.isEmpty && v!.isEmpty)
                                      ? 'Majburiy'
                                      : null,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _FormField(
                                  label: "Narx (USD)",
                                  controller: _priceUsd,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                        decimal: true,
                                      ),
                                  textInputAction: TextInputAction.next,
                                  inputFormatters: _usdFormatters,
                                  onChanged: (v) => _syncUzs(v, _price),
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
                                  textInputAction: TextInputAction.next,
                                  inputFormatters: [_ThousandsFormatter()],
                                  onChanged: (v) =>
                                      _syncUsd(v, _discountPriceUsd),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _FormField(
                                  label: "Chegirma narx (USD)",
                                  controller: _discountPriceUsd,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                        decimal: true,
                                      ),
                                  textInputAction: TextInputAction.next,
                                  inputFormatters: _usdFormatters,
                                  onChanged: (v) => _syncUzs(v, _discountPrice),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          // ── TANNARX — kursdan MUSTAQIL ──────────────────────────
                          // Avto-konvertatsiya ATAYIN yo'q: SuperAdmin tovarni
                          // qancha so'mga olganini aniq kiritadi va kurs o'zgarsa
                          // ham bu qiymat o'zgarmaydi (backend ham himoyalaydi).
                          Row(
                            children: [
                              Expanded(
                                child: _FormField(
                                  label: "Tannarx (UZS)",
                                  controller: _costPrice,
                                  keyboardType: TextInputType.number,
                                  textInputAction: TextInputAction.next,
                                  inputFormatters: [_ThousandsFormatter()],
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _FormField(
                                  label: "Tannarx (USD)",
                                  controller: _costPriceUsd,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                        decimal: true,
                                      ),
                                  textInputAction: TextInputAction.next,
                                  inputFormatters: _usdFormatters,
                                ),
                              ),
                            ],
                          ),
                          Padding(
                            padding: const EdgeInsets.only(top: 6, bottom: 12),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.lock_outline_rounded,
                                  size: 13,
                                  color: Colors.grey[500],
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(
                                    "Tannarx kursga bog'liq emas — qo'lda kiritiladi",
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey[500],
                                      fontStyle: FontStyle.italic,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          _FormField(
                            // Variantli mahsulotda umumiy stok kerak emas —
                            // har variantning O'Z stogi (Variantlar bosqichida)
                            // backend uchun yetarli.
                            label: _variants.isEmpty
                                ? "Umumiy Stok miqdori *"
                                : "Umumiy Stok (variantlar bo'lsa shart emas)",
                            controller: _stock,
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.next,
                            validator: (v) => (_variants.isEmpty && v!.isEmpty)
                                ? 'Majburiy'
                                : null,
                          ),
                          const SizedBox(height: 16),
                          // ── PHASE 4.2 — Product-level polka maydoni ────────
                          // Variantsiz mahsulot uchun asosiy, variantli mahsulotda
                          // har variant polkasi bo'sh bo'lsa default (backend
                          // `effective_shelf` shu yerdan fallback qiladi).
                          // FAQAT admin paneli va POS'da ko'rinadi.
                          _FormField(
                            label: _variants.isEmpty
                                ? "Polka (do'kondagi joy)"
                                : "Default polka (variantlar bo'sh polkali bo'lsa)",
                            controller: _shelfLocation,
                            keyboardType: TextInputType.text,
                            textInputAction: TextInputAction.done,
                            onChanged: (val) {
                              // Max 20 belgi (backend cheklov)
                              if (val.length > 20) {
                                _shelfLocation.text = val.substring(0, 20);
                                _shelfLocation.selection =
                                    TextSelection.collapsed(offset: 20);
                              }
                              _scheduleSaveDraft();
                            },
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
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),
                  ),
                  // ─────────── Bosqich 3: Variantlar ───────────
                  ExcludeFocus(
                    excluding: _step != 2,
                    child: Form(
                      key: _stepKeys[2],
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                        children: [
                          _buildSectionTitle(
                            context,
                            'Variantlar (Modifikatsiyalar)',
                          ),
                          // Tez generator + barcha SKU generatsiya
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                OutlinedButton.icon(
                                  onPressed: _showBulkVariantGenerator,
                                  icon: const Icon(
                                    Icons.auto_fix_high,
                                    size: 16,
                                  ),
                                  label: const Text('Tez generator'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: _genGreen,
                                    side: const BorderSide(color: _genGreen),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                ),
                                if (_variants.isNotEmpty)
                                  OutlinedButton.icon(
                                    onPressed: _generateAllSkus,
                                    icon: const Icon(
                                      Icons.auto_awesome,
                                      size: 16,
                                    ),
                                    label: const Text('Barcha SKU'),
                                    style: OutlinedButton.styleFrom(
                                      visualDensity: VisualDensity.compact,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          if (_variants.isEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(
                                "Agar mahsulotning turli xil rang yoki xotira (o'lcham) variantlari bo'lsa, ularni shu yerga qo'shing.",
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: Colors.grey[600],
                                ),
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
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 32),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            _buildBottomBar(context, isEdit),
          ],
        ),
      ),
    );
  }

  // ── #8: bosqich sarlavhasi (progress indikator) ──────────────────────────
  Widget _buildStepHeader(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: theme.colorScheme.surface,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      child: Row(
        children: List.generate(_stepLabels.length, (i) {
          final isActive = i == _step;
          final isDone = i < _step;
          final accent = const Color(0xFF0A7C55);
          final circleColor = isActive
              ? accent
              : isDone
              ? accent.withValues(alpha: 0.85)
              : theme.colorScheme.surfaceContainerHighest;
          final fgColor = (isActive || isDone)
              ? Colors.white
              : theme.colorScheme.onSurfaceVariant;
          return Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => _goToStep(i),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: i == 0
                            ? const SizedBox()
                            : Container(
                                height: 2,
                                color: i <= _step
                                    ? accent
                                    : theme.colorScheme.outlineVariant,
                              ),
                      ),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          color: circleColor,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isActive ? accent : Colors.transparent,
                            width: 2,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: isDone
                            ? const Icon(
                                Icons.check,
                                size: 17,
                                color: Colors.white,
                              )
                            : Text(
                                '${i + 1}',
                                style: TextStyle(
                                  color: fgColor,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                      ),
                      Expanded(
                        child: i == _stepLabels.length - 1
                            ? const SizedBox()
                            : Container(
                                height: 2,
                                color: i < _step
                                    ? accent
                                    : theme.colorScheme.outlineVariant,
                              ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _stepLabels[i],
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: isActive
                          ? accent
                          : theme.colorScheme.onSurfaceVariant,
                      fontWeight: isActive ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }

  // ── #8: pastki harakat paneli (Orqaga / Keyingi / Saqlash) ───────────────
  Widget _buildBottomBar(BuildContext context, bool isEdit) {
    final theme = Theme.of(context);
    final isLast = _step == _stepKeys.length - 1;
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        MediaQuery.of(context).padding.bottom + 8,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // #N8: tannarxdan past sotuv ogohlantirishi (Saqlash bloklangan).
          // Qaysi bosqichda bo'lmasin ko'rinadi — admin doim xabardor bo'ladi.
          if (_hasBelowCost())
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFDC2626).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: const Color(0xFFDC2626).withValues(alpha: 0.40),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.error_outline_rounded,
                    size: 18,
                    color: Color(0xFFDC2626),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      "Sotuv narxi tannarxdan past — narxni tuzating, aks holda saqlab bo'lmaydi.",
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: const Color(0xFFDC2626),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
            height: 52,
            child: Row(
              children: [
                if (_step > 0) ...[
                  OutlinedButton.icon(
                    onPressed: _isLoading ? null : _prevStep,
                    icon: const Icon(Icons.arrow_back_rounded, size: 18),
                    label: const Text('Orqaga'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: theme.colorScheme.onSurfaceVariant,
                      side: BorderSide(color: theme.colorScheme.outlineVariant),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(child: _buildPrimaryButton(context, isEdit, isLast)),
              ],
            ),
          ),
          // #N4: oxirgi bosqich + yangi qo'shish — "Saqlab, yana qo'shish"
          if (isLast && !isEdit) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: OutlinedButton.icon(
                onPressed: (_isLoading || _hasBelowCost())
                    ? null
                    : () => _submit(addAnother: true),
                icon: const Icon(Icons.add, size: 18),
                label: const Text(
                  'Saqlab, yana qo\'shish',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF0A7C55),
                  side: const BorderSide(color: Color(0xFF0A7C55)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Asosiy tugma: oxirgi bosqichda emas → "Keyingi"; oxirgida → Qo'shish/Saqlash.
  Widget _buildPrimaryButton(BuildContext context, bool isEdit, bool isLast) {
    final theme = Theme.of(context);
    if (!isLast) {
      return ElevatedButton.icon(
        onPressed: _nextStep,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF0A7C55),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        icon: const Text(
          'Keyingi',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
        label: const Icon(Icons.arrow_forward_rounded, size: 18),
      );
    }
    return ElevatedButton(
      onPressed: (_isLoading || _hasBelowCost()) ? null : () => _submit(),
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF0A7C55),
        disabledBackgroundColor: theme.colorScheme.onSurface.withValues(
          alpha: 0.12,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
    );
  }

  // #N6: saqlanmagan qoralama banneri
  Widget _buildDraftBanner(BuildContext context) {
    final theme = Theme.of(context);
    final name = (_pendingDraft?['name'] as String?)?.trim() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(
        color: const Color(0xFF0A7C55).withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFF0A7C55).withValues(alpha: 0.40),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.history_rounded, color: Color(0xFF0A7C55), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name.isNotEmpty
                  ? 'Saqlanmagan qoralama: "$name". Tiklaysizmi?'
                  : 'Saqlanmagan qoralama topildi. Tiklaysizmi?',
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextButton(
            onPressed: _restoreDraft,
            child: const Text(
              'Tiklash',
              style: TextStyle(
                color: Color(0xFF0A7C55),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          IconButton(
            onPressed: _discardDraft,
            icon: const Icon(Icons.close, size: 18),
            tooltip: "O'chirish",
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
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

    return groups.entries
        .map((e) => _buildColorGroupCard(context, e.key, e.value))
        .toList();
  }

  Widget _buildColorGroupCard(
    BuildContext context,
    String groupId,
    List<_VariantData> groupVariants,
  ) {
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
                        baseVariant.color?.isNotEmpty == true
                            ? "Rang: ${baseVariant.color}"
                            : "Yangi rang",
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.delete_outline,
                          color: Colors.red,
                        ),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () {
                          setState(() {
                            for (final r
                                in _variants
                                    .where((v) => v.groupId == groupId)
                                    .toList()) {
                              r.disposeControllers();
                            }
                            _variants.removeWhere((v) => v.groupId == groupId);
                          });
                        },
                      ),
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
                        final isSelected =
                            baseVariant.colorHex?.toLowerCase() ==
                            preset['hex'];
                        final colorVal = int.parse(
                          preset['hex']!.replaceFirst('#', '0xFF'),
                        );

                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              for (var v in _variants.where(
                                (x) => x.groupId == groupId,
                              )) {
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
                                color: isSelected
                                    ? theme.colorScheme.primary
                                    : Colors.grey.shade300,
                                width: isSelected ? 3 : 1,
                              ),
                              boxShadow: isSelected
                                  ? [
                                      BoxShadow(
                                        color: theme.colorScheme.primary
                                            .withOpacity(0.4),
                                        blurRadius: 4,
                                      ),
                                    ]
                                  : null,
                            ),
                            child: isSelected
                                ? Icon(
                                    Icons.check,
                                    color: colorVal > 0xFFDDDDDD
                                        ? Colors.black
                                        : Colors.white,
                                    size: 20,
                                  )
                                : null,
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
                          decoration: _inputDeco(
                            'Boshqa rang nomi (ixtiyoriy)',
                          ),
                          onChanged: (val) {
                            for (var v in _variants.where(
                              (x) => x.groupId == groupId,
                            ))
                              v.color = val;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          key: ValueKey(
                            'hex_${groupId}_${baseVariant.colorHex}',
                          ),
                          initialValue: baseVariant.colorHex,
                          decoration: _inputDeco('Rang kodi (Hex)'),
                          onChanged: (val) {
                            for (var v in _variants.where(
                              (x) => x.groupId == groupId,
                            ))
                              v.colorHex = val;
                          },
                        ),
                      ),
                    ],
                  ),
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
                    Icon(
                      Icons.add_circle_outline,
                      color: theme.colorScheme.primary,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      "Ushbu rang uchun yana sifat/o'lcham qo'shish",
                      style: TextStyle(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
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
              Text(
                "Sifat va O'lcham #${index + 1}",
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: Colors.grey,
                ),
              ),
              IconButton(
                onPressed: () => _removeVariant(v),
                icon: const Icon(Icons.close, color: Colors.grey, size: 20),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // SAYT BILAN BIR XIL: sub-variantda alohida "swatch" rasm yo'q.
          // Rang/swatch faqat group sarlavhasida (yuqorida COLOR_PRESETS bilan)
          // tanlanadi. Sub-variantning shaxsiy rasmlari faqat pastdagi
          // "Galereya (qo'shimcha rasmlar)" bo'limida boshqariladi.
          // Mavjud (legacy) `existingImageUrl` bo'lsa, u ham galereya
          // birinchi elementi sifatida ko'rinadi (_buildVariantGallery ichida).
          Row(
            children: [
              Expanded(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Autocomplete<String>(
                            initialValue: TextEditingValue(
                              text: v.quality ?? '',
                            ),
                            optionsBuilder:
                                (TextEditingValue textEditingValue) {
                                  if (textEditingValue.text.isEmpty)
                                    return QUALITY_PRESETS;
                                  return QUALITY_PRESETS.where((String option) {
                                    return option.toLowerCase().contains(
                                      textEditingValue.text.toLowerCase(),
                                    );
                                  });
                                },
                            onSelected: (String selection) {
                              setState(() => v.quality = selection);
                            },
                            fieldViewBuilder:
                                (
                                  context,
                                  controller,
                                  focusNode,
                                  onFieldSubmitted,
                                ) {
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
                            textInputAction: TextInputAction.next,
                            onFieldSubmitted: (_) =>
                                FocusScope.of(context).nextFocus(),
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
                            textInputAction: TextInputAction.next,
                            onFieldSubmitted: (_) =>
                                FocusScope.of(context).nextFocus(),
                            decoration: _inputDeco("Xotira/O'lcham"),
                            onChanged: (val) => v.size = val,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextFormField(
                            // SKU dasturiy generatsiya qilinganda maydon yangi
                            // qiymat bilan qayta quriladi (skuGen kalitда).
                            key: ValueKey(
                              'sku-${identityHashCode(v)}-${v.skuGen}',
                            ),
                            initialValue: v.sku,
                            decoration: _inputDeco('SKU (kod)'),
                            onChanged: (val) => v.sku = val,
                          ),
                        ),
                        IconButton(
                          tooltip: 'SKU generatsiya',
                          visualDensity: VisualDensity.compact,
                          icon: const Icon(
                            Icons.auto_awesome,
                            size: 18,
                            color: _genGreen,
                          ),
                          onPressed: () => _regenerateSku(v),
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
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  decoration: _inputDeco('Shtrix kod'),
                  onChanged: (val) => v.barcode = val,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  initialValue: v.stock,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  decoration: _inputDeco('Stok *'),
                  onChanged: (val) => v.stock = val,
                ),
              ),
            ],
          ),
          // Phase 4.0+4.2 — POLKA maydoni. Smart placeholder mantiqi:
          // agar product darajasida polka yozilgan bo'lsa (_shelfLocation),
          // variant inputi unda fallback qiymatni hint sifatida ko'rsatadi:
          // "001 (default)" — admin bo'sh qoldirsa product polkasi ishlatilishi
          // aniq bo'ladi. FAQAT admin/POS ko'radi.
          const SizedBox(height: 8),
          Builder(
            builder: (context) {
              final productShelf = _shelfLocation.text.trim();
              final hintText = productShelf.isNotEmpty
                  ? '$productShelf (default)'
                  : 'Masalan: 001';
              return TextFormField(
                initialValue: v.shelfLocation,
                maxLength: 20,
                textInputAction: TextInputAction.next,
                onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0A7C55),
                ),
                decoration: InputDecoration(
                  hintText: hintText,
                  hintStyle: const TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                    fontWeight: FontWeight.normal,
                  ),
                  labelText: productShelf.isNotEmpty
                      ? "Polka (bo'sh qoldirsa: $productShelf)"
                      : "Polka (do'kondagi joy)",
                  labelStyle: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0A7C55),
                  ),
                  prefixIcon: const Icon(
                    Icons.pin_drop_outlined,
                    color: Color(0xFF0A7C55),
                    size: 20,
                  ),
                  counterText: '',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFF0A7C55)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(
                        color: Color(0xFF0A7C55), width: 1.2),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(
                        color: Color(0xFF0A7C55), width: 2),
                  ),
                  helperText: "Faqat admin/POS'da ko'rinadi",
                  helperStyle: const TextStyle(fontSize: 10, color: Colors.grey),
                ),
                onChanged: (val) => v.shelfLocation = val,
              );
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: v.priceCtrl,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  inputFormatters: [_ThousandsFormatter()],
                  decoration: _inputDeco('Alohida narx (UZS)'),
                  onChanged: (val) {
                    v.price = _stripNum(val);
                    _syncUsd(val, v.priceUsdCtrl);
                    v.priceUsd = _stripNum(v.priceUsdCtrl.text);
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  controller: v.priceUsdCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  inputFormatters: _usdFormatters,
                  decoration: _inputDeco('Alohida narx (USD)'),
                  onChanged: (val) {
                    v.priceUsd = _stripNum(val);
                    _syncUzs(val, v.priceCtrl);
                    v.price = _stripNum(v.priceCtrl.text);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Chegirma (UZS↔USD avtomatik sinxron, narx kabi)
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: v.discountCtrl,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  inputFormatters: [_ThousandsFormatter()],
                  decoration: _inputDeco('Chegirma (UZS)'),
                  onChanged: (val) {
                    v.discountPrice = _stripNum(val);
                    _syncUsd(val, v.discountUsdCtrl);
                    v.discountPriceUsd = _stripNum(v.discountUsdCtrl.text);
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  controller: v.discountUsdCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  inputFormatters: _usdFormatters,
                  decoration: _inputDeco('Chegirma (USD)'),
                  onChanged: (val) {
                    v.discountPriceUsd = _stripNum(val);
                    _syncUzs(val, v.discountCtrl);
                    v.discountPrice = _stripNum(v.discountCtrl.text);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Tannarx (kursdan MUSTAQIL — sinxronlanmaydi, web qoidasi bilan bir xil)
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: v.costCtrl,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => FocusScope.of(context).nextFocus(),
                  inputFormatters: [_ThousandsFormatter()],
                  decoration: _inputDeco('Tannarx (UZS)'),
                  onChanged: (val) => v.costPrice = _stripNum(val),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  controller: v.costUsdCtrl,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.done,
                  inputFormatters: _usdFormatters,
                  decoration: _inputDeco('Tannarx (USD)'),
                  onChanged: (val) => v.costPriceUsd = _stripNum(val),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // #11: variant galereyasi (ko'p rasm)
          _buildVariantGallery(v),
        ],
      ),
    );
  }

  // #11: variant uchun rasmlar galereyasi (saytdek "1-rasm = asosiy" qoidasi).
  //
  // Saytdagi `buildVariantImageList` tartibi bilan AYNAN bir xil bo'lishi uchun:
  //   1) Legacy `existingImageUrl` (eski "swatch" rasm) — agar bor va o'chirilmagan
  //      bo'lsa, BIRINCHI element. X bosilsa `removeImage = true`.
  //   2) Mavjud galereya rasmlari (id != null bo'lganlari) — keyingi tartibda.
  //   3) Yangi tanlangan, hali yuklanmagan "swatch" fayl (`imageFile`) — eski
  //      asosiy rasmni yangilash uchun. Kichik X bosilsa fayl tashlanadi.
  //   4) Yangi tanlangan galereya fayllari.
  //
  // Backend (`_sync_variants`) `variant_image_$i` (swatch) va `variant_images_${i}_$j`
  // (gallery) maydonlarini alohida o'qiydi — shu sababli data model'da legacy/yangi
  // ajratish saqlanadi. UI esa saytdek bitta yagona galereya ko'rinishida.
  Widget _buildVariantGallery(_VariantData v) {
    final globalIndex = _variants.indexOf(v);
    final showLegacyMain =
        (v.existingImageUrl?.isNotEmpty ?? false) && !v.removeImage;

    final thumbs = <Widget>[
      // 1) Legacy "asosiy" (swatch) — saytdagi "existing-main" bilan ekvivalent
      if (showLegacyMain)
        _galleryThumb(
          isMain: true,
          child: CachedNetworkImage(
            imageUrl: v.existingImageUrl!,
            fit: BoxFit.cover,
          ),
          onRemove: () => _removeLegacySwatch(globalIndex),
        ),
      // 2) Mavjud galereya rasmlari (haqiqiy ID bilan)
      for (final img in v.existingGallery)
        _galleryThumb(
          child: CachedNetworkImage(imageUrl: img.url, fit: BoxFit.cover),
          onRemove: () => _removeExistingGalleryImage(globalIndex, img),
        ),
      // 3) Yangi tanlangan "swatch" fayl — saytdagi "new-main" ekvivalenti
      if (v.imageFile != null)
        _galleryThumb(
          isMain: !showLegacyMain && v.existingGallery.isEmpty,
          child: Image.file(v.imageFile!, fit: BoxFit.cover),
          onRemove: () => _clearVariantSwatchFile(globalIndex),
        ),
      // 4) Yangi tanlangan galereya fayllari
      for (final f in v.galleryFiles)
        _galleryThumb(
          child: Image.file(f, fit: BoxFit.cover),
          onRemove: () => _removeGalleryFile(globalIndex, f),
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.collections_outlined, size: 14, color: Colors.grey[600]),
            const SizedBox(width: 4),
            Text(
              "Galereya (qo'shimcha rasmlar)",
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[600],
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ...thumbs,
            GestureDetector(
              onTap: globalIndex == -1
                  ? null
                  : () => _pickVariantGallery(globalIndex),
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: Icon(
                  Icons.add_photo_alternate_outlined,
                  color: Colors.grey[500],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _galleryThumb({
    required Widget child,
    required VoidCallback onRemove,
    bool isMain = false,
  }) {
    // `isMain` — saytdek "ASOSIY" rangli badge ko'rsatadi va yashil halqa qo'yadi.
    // Bu vizual signal foydalanuvchiga: "bu birinchi rasm — saytda asosiy
    // ko'rinish" deb tushuntiradi. Funksional jihatdan tartib backend tomonida
    // (`ProductVariantImage.order`) saqlanadi.
    const borderRadius = 8.0;
    return SizedBox(
      width: 56,
      // Asosiy badge tushib qolmasligi uchun ozgina balandlik (badge -6px)
      height: isMain ? 64 : 56,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(borderRadius),
              border: isMain
                  ? Border.all(color: const Color(0xFF0A7C55), width: 2)
                  : null,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(borderRadius - 1),
              child: SizedBox(width: 56, height: 56, child: child),
            ),
          ),
          Positioned(
            right: -4,
            top: -4,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFDC2626),
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(2),
                child: const Icon(Icons.close, size: 13, color: Colors.white),
              ),
            ),
          ),
          if (isMain)
            Positioned(
              bottom: -6,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 1,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0A7C55),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'ASOSIY',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 8,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
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
    this.onChanged,
    this.inputFormatters,
    this.textInputAction,
  });
  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  // #9: klaviatura oqimi — "Keyingi"/"Tayyor". `next` bo'lsa avtomatik keyingi
  // maydonga fokus o'tkazamiz (qo'lda FocusNode kerak emas).
  final TextInputAction? textInputAction;

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
          onChanged: onChanged,
          inputFormatters: inputFormatters,
          textInputAction: textInputAction,
          onFieldSubmitted: textInputAction == TextInputAction.next
              ? (_) => FocusScope.of(context).nextFocus()
              : null,
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

/// Narxlar bo'limi tepasidagi kichik eslatma: joriy dollar kursi va UZS↔USD
/// avtomatik hisoblanishini bildiradi (saytdagi tajribaga mos).
/// Variantli mahsulot uchun banner: Mahsulot narxi/chegirma/tannarx maydonlari
/// VARIANT MIN qiymatidan avtomatik to'ldirilishini admin tushunsin.
/// Maydonlar buzilmagan (faqat o'qish emas) — admin xohlasa qo'lda yozishi
/// mumkin, lekin keyingi variant o'zgarishida MIN bilan qayta yoziladi.
class _VariantPriceAutoHint extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0A7C55).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFF0A7C55).withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.auto_awesome_rounded,
            size: 18,
            color: Color(0xFF0A7C55),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              "Variantli mahsulot — Mahsulot narxi/chegirma/tannarx variantlarning ENG ARZONIDAN avtomatik to'ldiriladi. Sizdan faqat har variant narxini kiriting.",
              style: TextStyle(
                fontSize: 11.5,
                color: Colors.grey[800],
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExchangeRateHint extends StatelessWidget {
  const _ExchangeRateHint({required this.usdRate});
  final double usdRate;

  @override
  Widget build(BuildContext context) {
    if (usdRate <= 0) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          const Icon(
            Icons.sync_alt_rounded,
            size: 15,
            color: Color(0xFF0A7C55),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              "1\$ = ${_formatUzsDigits(usdRate.toStringAsFixed(0))} so'm — "
              "narx va chegirma narx avtomatik hisoblanadi",
              style: TextStyle(
                fontSize: 11.5,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
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
