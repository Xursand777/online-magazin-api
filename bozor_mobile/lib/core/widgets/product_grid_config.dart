/// product_grid_config.dart — Mahsulot grid'i uchun YAGONA konfiguratsiya.
///
/// PROFESSIONAL RESPONSIVE PATTERN:
///
///   ❌ ESKI — SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2):
///        Har telefon ekranida har doim 2 ta ustun
///        Katta planshet/web'da ham 2 ta — bo'sh joy ko'p
///        + mainAxisExtent: 320 qattiq balandlik kerak
///
///   ✅ YANGI — SliverGridDelegateWithMaxCrossAxisExtent:
///        maxCrossAxisExtent: 220 — har card max 220px keng
///        Flutter o'zi hisoblaydi:
///          • 360px ekran → 2 ustun (180px keng card)
///          • 600px ekran → 3 ustun (200px keng card)
///          • 800px ekran → 4 ustun (200px keng card)
///        Hech qanday qattiq balandlik kerak emas — childAspectRatio bilan
///        ProductCard o'zi balandlikni hisoblaydi (AspectRatio + Expanded).
///
/// QO'LLANISHI (5 ta sahifa — bir xil):
///
///   GridView.builder(
///     gridDelegate: productGridDelegate,
///     itemCount: products.length,
///     itemBuilder: (_, i) => ProductCard(product: products[i]),
///   );
///
///   SliverGrid.builder(
///     gridDelegate: productGridDelegate,
///     ...
///   );
library;

import 'package:flutter/material.dart';

/// Grid uchun yagona delegate — barcha mahsulot listinglarda ishlatiladi.
///
///   maxCrossAxisExtent:  Card max kengligi. 220px — Wildberries/Uzum kabi.
///
///   childAspectRatio:    Width/Height nisbat. Aniq matematika:
///
///     360px ekran → 2 ustun → card ~162px keng
///     Image (AspectRatio 1.0) = 162px kvadrat
///     Content kerakli minimum:
///       • Top padding:      8px
///       • Name (2 satr):    ~32px
///       • Price area:       ~38px (line-through + price)
///       • Spacer:           6px
///       • CartButton:       38px
///       • Bottom padding:   8px
///       JAMI:               ~130px
///
///     Card balandlik = 162 + 130 = ~292px
///     Nisbat = 162 / 292 = ~0.555
///
///     0.52 — 5-10% MARGIN bilan xavfsiz qiymat:
///       Card balandlik = 162 / 0.52 = 311px
///       Content area = 311 - 162 = 149px (130 + 19px margin) ✅
///       Hatto USTA narxi + chegirma + badge ham sig'adi
///
///   crossAxisSpacing:    Ustunlar orasidagi bo'shliq
///   mainAxisSpacing:     Qatorlar orasidagi bo'shliq
const SliverGridDelegateWithMaxCrossAxisExtent productGridDelegate =
    SliverGridDelegateWithMaxCrossAxisExtent(
  maxCrossAxisExtent: 220,
  childAspectRatio: 0.52, // ← Content uchun yetarli joy + xavfsiz margin
  crossAxisSpacing: 12,
  mainAxisSpacing: 12,
);

/// Kompakt versiya — search overlay yoki kichik joylar uchun.
const SliverGridDelegateWithMaxCrossAxisExtent productGridDelegateCompact =
    SliverGridDelegateWithMaxCrossAxisExtent(
  maxCrossAxisExtent: 180,
  childAspectRatio: 0.52,
  crossAxisSpacing: 10,
  mainAxisSpacing: 10,
);

/// Grid uchun standart padding — barcha sahifalarda bir xil.
const EdgeInsets productGridPadding = EdgeInsets.all(12);
