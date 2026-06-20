// admin_bulk_import_sheet.dart — #N3: CSV/Excel orqali ommaviy mahsulot import.
// Backend AdminBulkImportView (/api/admin/bulk-import/) bilan ishlaydi.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:file_picker/file_picker.dart';

import '../../../../core/di/injection_container.dart';
import '../../data/models/admin_product_model.dart';
import '../../data/repositories/admin_repository.dart';
import '../bloc/admin_bloc.dart';

const _kGreen = Color(0xFF0A7C55);

// Backend qabul qiladigan ustunlar + namuna (web shabloni bilan bir xil).
const String _templateCsv =
    'name,price_usd,price,category_id,stock,description,is_active,is_new,is_popular,discount_price_usd,discount_price,cost_price\n'
    'iPhone 16 Pro,1099,,,50,Apple smartfon,true,true,true,,,950\n'
    'Smartfon Samsung A56,,12000000,,30,,true,true,false,,11500000,9800000\n';

class AdminBulkImportSheet extends StatefulWidget {
  const AdminBulkImportSheet({super.key});

  @override
  State<AdminBulkImportSheet> createState() => _AdminBulkImportSheetState();
}

class _AdminBulkImportSheetState extends State<AdminBulkImportSheet> {
  final AdminRepository _repo = sl<AdminRepository>();

  String? _filePath;
  String? _fileName;
  int _fileSize = 0;

  bool _translate = true;
  int? _defaultCategoryId;

  bool _isLoading = false;
  String? _error;
  BulkImportResultData? _result;

  String _fmtSize(int bytes) => bytes < 1024 * 1024
      ? '${(bytes / 1024).toStringAsFixed(0)} KB'
      : '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';

  Future<void> _pickFile() async {
    try {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['csv', 'xlsx', 'xls'],
        withData: false,
      );
      final f = picked?.files.singleOrNull;
      if (f == null || f.path == null) return;
      if (f.size > 10 * 1024 * 1024) {
        setState(() => _error = 'Fayl hajmi 10 MB dan oshmasligi kerak.');
        return;
      }
      setState(() {
        _filePath = f.path;
        _fileName = f.name;
        _fileSize = f.size;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = 'Faylni tanlab bo\'lmadi: $e');
    }
  }

  Future<void> _import() async {
    if (_filePath == null || _fileName == null || _isLoading) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final res = await _repo.bulkImportProducts(
        filePath: _filePath!,
        fileName: _fileName!,
        translate: _translate,
        defaultCategoryId: _defaultCategoryId,
      );
      if (!mounted) return;
      setState(() {
        _result = res;
        _isLoading = false;
      });
      if (res.createdCount > 0) {
        // Ro'yxatni yangilaymiz (yangi mahsulotlar ko'rinsin).
        context.read<AdminBloc>().add(LoadAdminData());
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final categories = context.watch<AdminBloc>().state.categories;
    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      maxChildSize: 0.96,
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
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
                child: Row(
                  children: [
                    const Icon(Icons.upload_file_rounded, color: _kGreen),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Excel / CSV import',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w800),
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
                child: ListView(
                  controller: controller,
                  padding: EdgeInsets.fromLTRB(
                      16, 16, 16, MediaQuery.of(context).padding.bottom + 16),
                  children: _result != null
                      ? [_buildResult(theme)]
                      : _buildForm(theme, categories),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildForm(ThemeData theme, List<AdminCategoryModel> categories) {
    return [
      // 1) Namuna
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.description_outlined, size: 18, color: _kGreen),
                const SizedBox(width: 6),
                Text('1. Namuna ustunlar',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              "Majburiy: name + (price_usd yoki price). Qolganlari ixtiyoriy: "
              "category_id, stock, description, is_active, is_new, is_popular, "
              "discount_price(_usd), cost_price.",
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () async {
                await Clipboard.setData(const ClipboardData(text: _templateCsv));
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Namuna nusxalandi — Sheets/Excel\'ga joylang'),
                    duration: Duration(seconds: 2),
                  ),
                );
              },
              icon: const Icon(Icons.copy_rounded, size: 16),
              label: const Text('Namunani nusxalash'),
              style: OutlinedButton.styleFrom(
                foregroundColor: _kGreen,
                side: const BorderSide(color: _kGreen),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),

      // 2) Fayl tanlash
      Text('2. Faylni tanlang',
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      InkWell(
        onTap: _isLoading ? null : _pickFile,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _filePath != null
                  ? _kGreen
                  : theme.colorScheme.outlineVariant,
              width: 1.4,
            ),
          ),
          child: Column(
            children: [
              Icon(_filePath != null ? Icons.task_alt_rounded : Icons.upload_rounded,
                  size: 32,
                  color: _filePath != null ? _kGreen : theme.colorScheme.onSurfaceVariant),
              const SizedBox(height: 8),
              Text(
                _fileName ?? 'Fayl tanlash (.csv, .xlsx, .xls)',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              if (_filePath != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(_fmtSize(_fileSize),
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                ),
            ],
          ),
        ),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              const Icon(Icons.error_outline, size: 16, color: Color(0xFFDC2626)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(_error!,
                    style: const TextStyle(
                        color: Color(0xFFDC2626), fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
      const SizedBox(height: 16),

      // 3) Sozlamalar
      Text('3. Sozlamalar',
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      const SizedBox(height: 4),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _translate,
        activeThumbColor: _kGreen,
        onChanged: (v) => setState(() => _translate = v),
        title: const Text('Avtomatik tarjima (Ru/En)'),
        subtitle: const Text(
          "Ko'p qatorli faylда tarjima sekin — katta import uchun o'chiring, "
          "keyin alohida tarjima qiling.",
        ),
      ),
      DropdownButtonFormField<int?>(
        initialValue: _defaultCategoryId,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Standart kategoriya (ixtiyoriy)',
          border: OutlineInputBorder(),
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
        items: [
          const DropdownMenuItem<int?>(value: null, child: Text('— Yo\'q —')),
          ...categories.map((c) => DropdownMenuItem<int?>(
                value: c.id,
                child: Text(c.name, overflow: TextOverflow.ellipsis),
              )),
        ],
        onChanged: (v) => setState(() => _defaultCategoryId = v),
      ),
      const SizedBox(height: 20),

      // Import tugmasi
      SizedBox(
        width: double.infinity,
        height: 52,
        child: ElevatedButton.icon(
          onPressed: (_filePath == null || _isLoading) ? null : _import,
          style: ElevatedButton.styleFrom(
            backgroundColor: _kGreen,
            disabledBackgroundColor:
                theme.colorScheme.onSurface.withValues(alpha: 0.12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          icon: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      color: Colors.white, strokeWidth: 2),
                )
              : const Icon(Icons.upload_rounded, color: Colors.white),
          label: Text(
            _isLoading ? 'Import qilinmoqda... (kuting)' : 'Import qilish',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    ];
  }

  Widget _buildResult(ThemeData theme) {
    final r = _result!;
    final ok = r.createdCount > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: (ok ? _kGreen : const Color(0xFFDC2626)).withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
                  size: 48, color: ok ? _kGreen : const Color(0xFFDC2626)),
              const SizedBox(height: 6),
              Text(ok ? 'Import yakunlandi!' : 'Import amalga oshmadi',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            _statBox(theme, 'Yaratildi', r.createdCount, _kGreen),
            const SizedBox(width: 10),
            _statBox(theme, "O'tkazildi", r.skippedCount, const Color(0xFFF59E0B)),
            const SizedBox(width: 10),
            _statBox(theme, 'Xatolar', r.errorCount, const Color(0xFFDC2626)),
          ],
        ),
        if (r.warnings.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text('Ogohlantirishlar',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          ...r.warnings.take(50).map((w) => Text('• $w',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: const Color(0xFFB45309)))),
        ],
        if (r.errors.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text('Xatolar (${r.errors.length})',
              style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700, color: const Color(0xFFDC2626))),
          const SizedBox(height: 6),
          ...r.errors.take(50).map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text('Qator #${e.row}: ${e.message}',
                    style: theme.textTheme.bodySmall),
              )),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() {
                  _result = null;
                  _filePath = null;
                  _fileName = null;
                  _error = null;
                }),
                child: const Text('Yana import'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(backgroundColor: _kGreen),
                child: const Text('Yopish',
                    style: TextStyle(color: Colors.white)),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _statBox(ThemeData theme, String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text('$value',
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w900, color: color)),
            Text(label,
                style: theme.textTheme.labelSmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
