import 'package:shared_preferences/shared_preferences.dart';
import 'models/product_submission.dart';

/// (#12) Internet uzilganda yuborilmagan mahsulot create/update so'rovlari
/// navbati. SharedPreferences'da JSON ro'yxat ko'rinishida saqlanadi.
///
/// Bu — yagona manba: forma yuborishda tarmoq xatosi bo'lsa shu yerga
/// qo'shiladi, internet tiklanganda esa AdminBloc navbatni bo'shatadi.
class OfflineProductQueue {
  static const _key = 'admin_offline_product_queue';

  Future<List<ProductSubmission>> all() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? const [];
    final out = <ProductSubmission>[];
    for (final s in raw) {
      try {
        out.add(ProductSubmission.decode(s));
      } catch (_) {
        // buzuq yozuvni e'tiborsiz qoldiramiz
      }
    }
    return out;
  }

  Future<void> enqueue(ProductSubmission sub) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? <String>[];
    raw.add(sub.encode());
    await prefs.setStringList(_key, raw);
  }

  Future<void> remove(String localId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? <String>[];
    raw.removeWhere((s) {
      try {
        return ProductSubmission.decode(s).localId == localId;
      } catch (_) {
        return true; // buzuq yozuvni ham tozalaymiz
      }
    });
    await prefs.setStringList(_key, raw);
  }

  Future<int> count() async => (await all()).length;
}
