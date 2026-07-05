import json
import os
import re
from decimal import Decimal
from typing import Optional

from django.utils.text import slugify
from rest_framework import serializers
from .models import (
    Category, HomeBanner, Product, ProductImage, ProductVariant, ProductVariantImage,
    PhoneBrand, PhoneSeries, PhoneModel, ProductCompatibility,
)

_CDN = os.getenv('CDN_PROVIDER', 'local')


HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def get_lang(context):
    request = context.get('request')
    if request:
        lang = request.GET.get('lang') or request.headers.get('Accept-Language', 'uz')[:2]
        if lang in ('ru', 'en', 'uz'):
            return lang
    return 'uz'


def localized(obj, field, lang):
    if lang == 'uz':
        return getattr(obj, field, '') or ''
    translated = getattr(obj, f'{field}_{lang}', '') or ''
    return translated or getattr(obj, field, '') or ''


def _master_ctx(context):
    """
    Joriy foydalanuvchining usta-narx konteksti (active, level, markup).
    Bir serializatsiya bo'yicha BIR marta hisoblanadi (context'da memoizatsiya) —
    ro'yxatdagi har bir mahsulot uchun qayta-qayta DB so'rovi (daraja) yubormaydi.
    """
    cached = context.get('_master_ctx')
    if cached is not None:
        return cached
    from orders.services import master_pricing_context
    request = context.get('request')
    user = getattr(request, 'user', None) if request else None
    ctx = master_pricing_context(user)
    context['_master_ctx'] = ctx
    return ctx


def get_master_price(obj, context):
    """
    Usta uchun narx — OPTOM asosida (optom + ustama%, faollikka ko'ra gradient).
    Avtoritar hisoblash `orders.services.master_line_price`'da; bu yer faqat shuni
    chaqiradi (narx HECH QACHON mijoz tomonida hisoblanmaydi). Optom yo'q yoki
    imtiyoz yo'q (sust usta / daraja 0) bo'lsa None → oddiy narx ko'rsatiladi.
    """
    ctx = _master_ctx(context)
    if not ctx[0]:
        return None
    from orders.services import master_line_price
    master = master_line_price(obj, None, ctx)
    return str(master) if master is not None else None


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    is_catalog = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'image', 'parent', 'is_catalog', 'children', 'is_popular')

    def get_is_catalog(self, obj):
        return obj.parent is None

    def get_name(self, obj):
        return localized(obj, 'name', get_lang(self.context))

    def get_children(self, obj):
        qs = obj.children.filter(is_active=True)
        if qs.exists():
            return CategorySerializer(qs, many=True, context=self.context).data
        return []


class HomeCategorySerializer(serializers.ModelSerializer):
    """
    Home sahifa kategoriya chiplari uchun YENGIL serializer (children'siz).
    Til-aware nom + rasm (absolyut URL — request kontekstdan). Web va mobil
    IKKALASI shu serializer orqali keladigan ma'lumotni ishlatadi → 100% bir xil.
    """
    name = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'image', 'is_popular')

    def get_name(self, obj):
        return localized(obj, 'name', get_lang(self.context))


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ('id', 'image', 'is_main')

class ProductVariantSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    # Usta narxi — HAR VARIANT uchun alohida (optom variant'niki bo'lishi
    # mumkin). Avtoritar hisoblash backendda; non-master uchun null.
    master_price = serializers.SerializerMethodField()
    # Rang nomining TILGA MOSLANGAN ko'rinishi (uz "Qora" → ru "Чёрный" → en
    # "Black"). `color` KANONIK (o'zbekcha) qoladi — variant tanlash/hex mantig'i
    # tilga bog'liq bo'lmasligi uchun; UI faqat KO'RSATISHDA color_label ishlatadi.
    color_label = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = (
            'id',
            'color',
            'color_label',
            'color_hex',
            'image_url',
            'images',
            'quality',
            'model',
            'size',
            'price',
            'price_usd',
            'discount_price',
            'discount_price_usd',
            'master_price',
            'stock',
            'sku',
        )

    def get_master_price(self, obj):
        """Variantning usta narxi (optom+ustama, gradient) yoki None."""
        ctx = _master_ctx(self.context)
        if not ctx[0] or not obj.product_id:
            return None
        from orders.services import master_line_price
        master = master_line_price(obj.product, obj, ctx)
        return str(master) if master is not None else None

    def get_color_label(self, obj):
        """Rang nomi — joriy tilga moslangan (ko'rsatish uchun)."""
        from .color_i18n import localize_color
        return localize_color(obj.color, get_lang(self.context))

    def get_image_url(self, obj):
        request = self.context.get('request')
        return absolute_media_url(request, obj.image)

    def get_images(self, obj):
        request = self.context.get('request')
        variant_images = list(obj.images.all())
        if variant_images:
            return [{'id': vi.id, 'url': absolute_media_url(request, vi.image)} for vi in variant_images]
        if obj.image:
            return [{'id': None, 'url': absolute_media_url(request, obj.image)}]
        return []


class AdminProductVariantSerializer(ProductVariantSerializer):
    """
    Admin uchun kengaytirilgan variant ko'rinishi — `shelf_location`
    (do'kondagi polka manzili) shu yerda ATAYIN qo'shilgan, public
    `ProductVariantSerializer` (catalog/home/product detail uchun
    ishlatiladi) esa bu maydonni qaytarmaydi → foydalanuvchi tomon
    polka raqami tarmoq darajasida ko'rinmaydi.

    Phase 4.2 — `effective_shelf`: variant'da polka bo'sh bo'lsa
    parent product'dan fallback (model'dagi @property dan oladi).
    Bu frontend uchun "qaysi polka chiqarish kerakligi" mantig'ini
    backend tomonida bir joyda hal qiladi (DRY printsipi).
    """
    effective_shelf = serializers.CharField(read_only=True)
    effective_supplier = serializers.CharField(read_only=True)

    class Meta(ProductVariantSerializer.Meta):
        fields = ProductVariantSerializer.Meta.fields + (
            'cost_price',
            'cost_price_usd',
            'optom_price',       # admin/POS — ulgurji narx (mijozga ko'rinmaydi)
            'optom_price_usd',
            'barcode',
            'is_active',
            'position',
            'images',
            'shelf_location',   # Phase 4.0 — variant'ning o'z yozuvi
            'effective_shelf',  # Phase 4.2 — fallback bilan amaldagi qiymat
            'supplier',          # Kimdan kelgan — variant'ning o'z yozuvi
            'effective_supplier',  # fallback bilan amaldagi qiymat
        )

class ProductListSerializer(serializers.ModelSerializer):
    main_image = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    master_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ('id', 'name', 'slug', 'price', 'discount_price', 'master_price',
                  'stock', 'is_discount', 'is_new', 'is_popular', 'main_image')

    def get_name(self, obj):
        return localized(obj, 'name', get_lang(self.context))

    def get_master_price(self, obj):
        return get_master_price(obj, self.context)

    def get_main_image(self, obj):
        img = obj.images.filter(is_main=True).first() or obj.images.first()
        return absolute_media_url(self.context.get('request'), img.image, width=800) if img else None

# ═══════════════════════════════════════════════════════════════════════════════
# VARIANT-EXPANDED CARDS — Amazon/Wildberries uslubi
#
# Muammo: variantli mahsulot uchun bitta karta ko'rsatilsa, foydalanuvchi
# "Savatga qo'shish" tugmasini bossa qaysi variant qo'shilayotganini bilmaydi.
#
# Yechim: har bir variant alohida karta sifatida ko'rsatiladi. Karta nomi
# variant atributlari bilan to'ldiriladi:
#   "Smartfon Samsung Galaxy A56 • Vetnam • 128/8 • Olive"
#
# Variantsiz mahsulotlar bitta karta sifatida qoladi.
#
# Bosh sahifa va listing endpointlari `?expand_variants=true` parametri bilan
# ushbu rejimga o'tishadi. Default — eski xulq (orqaga moslik uchun, mobil
# ilova yangilanguncha).
# ═══════════════════════════════════════════════════════════════════════════════


def _build_variant_card_name(product_name: str, variant, lang: str = 'uz') -> str:
    """
    Variant kartasi uchun to'liq nom yaratadi.

    Tartib (foydalanuvchi o'qish mantig'i — sifat → xotira → rang):
      product.name • model • quality • size • color

    None / bo'sh atributlar tushib qoladi.

    Misol:
      product_name = "Smartfon Samsung Galaxy A56"
      variant.quality = "Vetnam"       (sifat — qayerda ishlab chiqarilgan)
      variant.size    = "128/8"        (xotira — storage/RAM)
      variant.color   = "Olive"        (rang)
      → "Smartfon Samsung Galaxy A56 • Vetnam • 128/8 • Olive"

    Eslatma: model odatda null — agar bor bo'lsa, brand-suffix sifatida
    (masalan "Pro") quality dan oldin keladi.
    """
    from .color_i18n import localize_color
    parts = [product_name]
    # Yangi tartib: model → quality → size → color
    # (foydalanuvchi tabiiy o'qish — sifat, keyin xotira, keyin rang)
    for attr in ('model', 'quality', 'size', 'color'):
        value = getattr(variant, attr, None)
        if value and str(value).strip():
            text = str(value).strip()
            # Rang — TILGA moslanadi (ro'yxat kartalarida ham tarjima ko'rinsin).
            if attr == 'color':
                text = localize_color(text, lang)
            parts.append(text)
    return ' • '.join(parts)


def _variant_card_image(request, product, variant):
    """
    Variant kartasi uchun rasm — **color-grouped fallback** (Wildberries usuli).

    Mantiq (4 darajali):
      1. Variantning o'z gallery rasmi (ProductVariantImage)
      2. Variantning o'z thumbnail rasmi (variant.image)
      3. **Bir xil RANGdagi boshqa variantdan** rasm
         (admin har variantga rasm yuklamaganda — bir rang uchun bitta rasm yetadi)
      4. Mahsulotning asosiy rasmi (eng oxirgi fallback)

    Bu nima uchun muhim:
      Variant tablitsa odatda 5-20 satr (color × size × quality kombinatsiyalari).
      Admin har biri uchun alohida rasm yuklash o'rniga, faqat HAR RANG uchun
      bitta rasm yuklaydi. Frontend kartasida foydalanuvchi to'g'ri rangni
      ko'rishi uchun, "bir xil rang" qoidasi bilan rasmni topamiz.

    Misol holat:
      v9 = Kulrang + 128/8: rasm BOR
      v10 = Kulrang + 256/12: rasm YO'Q → v9'dan oladi (ikkalasi ham Kulrang)
      v11 = Kulrang + 512/12: rasm YO'Q → v9'dan oladi (ikkalasi ham Kulrang)

      Avval (color-grouped yo'q): v10 va v11 olive product image ko'rsatardi (xato)
      Endi (color-grouped bor):   v10 va v11 to'g'ri Kulrang rasm ko'rsatadi ✓
    """
    if variant is not None:
        # 1. Variantning o'z gallery rasmi
        first_gallery = variant.images.first()
        if first_gallery and first_gallery.image:
            return absolute_media_url(request, first_gallery.image, width=800)
        # 2. Variantning o'z thumbnail rasmi
        if variant.image:
            return absolute_media_url(request, variant.image, width=800)
        # 3. Color-grouped fallback — bir xil rangdagi boshqa variantdan
        if variant.color:
            target_color = variant.color.strip().lower()
            for other in product.variants.all():
                if other.id == variant.id or not other.is_active:
                    continue
                other_color = (other.color or '').strip().lower()
                if other_color != target_color:
                    continue
                # Bir xil rangdagi variant — uning rasmini olamiz
                other_gallery = other.images.first()
                if other_gallery and other_gallery.image:
                    return absolute_media_url(request, other_gallery.image, width=800)
                if other.image:
                    return absolute_media_url(request, other.image, width=800)
    # 4. Mahsulotning asosiy rasmi (oxirgi fallback)
    img = product_main_image(product)
    return absolute_media_url(request, img.image, width=800) if img else None


def _variant_card_price(product, variant):
    """Variant narxi mavjud bo'lsa, undan foydalanadi; aks holda mahsulot narxi."""
    if variant is not None and variant.price is not None:
        return variant.price
    return product.price


def _variant_card_discount_price(product, variant):
    """
    Chegirma narxi:
    - Variant o'z discount_price ga ega → undan foydalanadi
    - Variant price o'rnatilgan, lekin discount yo'q → null (variant chegirmasiz)
    - Variant narxlari NULL → mahsulot discount_price (agar is_discount=True)
    """
    if variant is not None:
        if variant.discount_price is not None:
            return variant.discount_price
        if variant.price is not None:
            return None  # variant o'z narxi bor, lekin chegirma yo'q
    return product.discount_price if product.is_discount else None


def _variant_card_stock(product, variant):
    """Variant o'z stock'iga ega, aks holda mahsulot stock'i."""
    if variant is not None:
        return variant.stock
    return product.stock


def _variant_card_is_discount(product, variant) -> bool:
    """Bu karta chegirmadami? Variant darajasida hisoblanadi."""
    price = _variant_card_price(product, variant)
    discount = _variant_card_discount_price(product, variant)
    if price is None or discount is None:
        return False
    try:
        return Decimal(str(discount)) < Decimal(str(price))
    except (ValueError, TypeError):
        return False


def expand_products_to_cards(products, request, *, in_stock_only: bool = False) -> list[dict]:
    """
    Mahsulotlar ro'yxatini variantlarga ajratilgan kartalar ro'yxatiga aylantiradi.

    Har bir mahsulot uchun:
      - variantlari bor bo'lsa  → har bir active variant uchun alohida karta
      - variantsiz bo'lsa       → mahsulotning o'zi bitta karta

    Args:
        in_stock_only: True bo'lsa, stock <= 0 variantlar/mahsulotlar o'tib yuboriladi.
                       Amazon/Wildberries/Ozon'da home sahifada doim True — sotuvda
                       yo'q mahsulotlar ko'rinmaydi.

    Kartalar ProductCardSerializer uchun dict format'ida qaytariladi.
    """
    lang = get_lang({'request': request})
    cards: list[dict] = []
    for product in products:
        product_name = localized(product, 'name', lang)
        active_variants = [v for v in product.variants.all() if v.is_active]
        # Variantsiz mahsulot — bitta karta (variant=None)
        if not active_variants:
            if in_stock_only and (product.stock or 0) <= 0:
                continue
            cards.append(_build_card_dict(product, None, product_name, request))
            continue
        # Variantli mahsulot — har biri uchun alohida karta
        for variant in active_variants:
            if in_stock_only and (variant.stock or 0) <= 0:
                continue
            cards.append(_build_card_dict(product, variant, product_name, request))
    return cards


def _search_card_score(card_name: str, phrase: str, product) -> int:
    """
    Karta relevantlik bali (mashhur saytlar tartibi kabi):
      • aniq mos (nom == so'rov)      → +100
      • nom so'rov bilan boshlanadi   → +50
      • so'rov nom ichida (substring) → +30
      • ommabop / yangi bonuslari     → tenglik buzuvchi kichik ballar
    """
    n = card_name.lower()
    score = 0
    if n == phrase:
        score += 100
    elif n.startswith(phrase):
        score += 50
    elif phrase in n:
        score += 30
    if getattr(product, 'is_popular', False):
        score += 8
    if getattr(product, 'is_new', False):
        score += 4
    return score


def search_expand_products_to_cards(products, request, query: str, *, limit: int = 50) -> list[dict]:
    """
    VARIANT-AWARE QIDIRUV — mashhur saytlardagidek "aqilli" qidiruv.

    Har bir VARIANT uchun to'liq qidiruv matni quriladi:
        mahsulot nomi + variant(sifat, model, o'lcham, rang, SKU, barcode) + kategoriya
    So'rov SO'ZLARI (tokenlar) shu matnga AND-mantig'i bilan tekshiriladi —
    har bir so'z matnning istalgan joyida bo'lishi kifoya (tartibi muhim emas).

    Natija — FAQAT MOS KELGAN variantlar alohida karta sifatida (mos kelmagan
    variantlar chiqmaydi). Masalan "16 pro max" → har mahsulotning aynan
    "16 Pro Max" varianti (boshqa variantlari emas).

    Relevantlik bo'yicha tartiblanadi (aniq mos > boshidan > ichida > ommabop).
    """
    phrase = (query or '').strip().lower()
    tokens = [t for t in re.split(r'\s+', phrase) if t]
    if not tokens:
        return []

    lang = get_lang({'request': request})
    scored: list[tuple[int, str, dict]] = []

    for product in products:
        pname = localized(product, 'name', lang)
        cat_name = product.category.name if product.category_id else ''
        base_text = f"{pname} {cat_name}".lower()

        active_variants = [v for v in product.variants.all() if v.is_active]

        if not active_variants:
            # Variantsiz mahsulot — bitta karta (matn: nom + kategoriya)
            if all(tok in base_text for tok in tokens):
                card = _build_card_dict(product, None, pname, request)
                scored.append((_search_card_score(pname, phrase, product), pname, card))
            continue

        # Variantli mahsulot — HAR variant o'z to'liq matni bilan alohida tekshiriladi
        for v in active_variants:
            variant_bits = ' '.join(
                str(x) for x in (v.quality, v.model, v.size, v.color, v.sku, v.barcode) if x
            )
            full_text = f"{base_text} {variant_bits}".lower()
            if all(tok in full_text for tok in tokens):
                card = _build_card_dict(product, v, pname, request)
                scored.append(
                    (_search_card_score(card['name'], phrase, product), card['name'], card)
                )

    # Ball (kamayish) → nom (alifbo) bo'yicha barqaror tartib
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [card for _, _, card in scored[:limit]]


def interleave_cards_by_product(cards: list[dict]) -> list[dict]:
    """
    Bir mahsulot variantlarini KO'P JOYDAN BIR-BIRIDAN UZOQ tarqatish.

    ═══════════════════════════════════════════════════════════════════════════
    NIMA UCHUN bu kerak: ESKI ALGORITM (round-robin i=0,1,2,...) MUAMMOSI
    ═══════════════════════════════════════════════════════════════════════════

    Eski round-robin algoritmi bir variantli mahsulotlar tugagach, ko'p
    variantli mahsulotning qolgan variantlarini OXIRIDA piling qilib qo'yardi:

        A=5 variant, B-K=1 variant (jami 15 karta):
          i=0: A1, B, C, D, E, F, G, H, I, J, K   (11 ta)
          i=1: A2  ← faqat A'da 2-variant bor
          i=2: A3
          i=3: A4
          i=4: A5
          Natija: [A1, B...K, A2, A3, A4, A5]
                            ^^^^^^^^^^^^^^^^
                            4 ta A KETMA-KET — UX nuqson!

    ═══════════════════════════════════════════════════════════════════════════
    YANGI ALGORITM — Deficit-based balanced scheduling
    ═══════════════════════════════════════════════════════════════════════════

    Bu Linux CFS (Completely Fair Scheduler), network packet scheduling
    (Deficit Round Robin), va Bresenham line algorithm'da ishlatiladigan
    professional load balancing texnikasi.

    Har slot uchun:
      expected[i] = (slot+1) * weight[i] / total
      deficit[i]  = expected[i] - consumed[i]
      → Eng KATTA deficit'li mahsulotni navbatga olamiz

    Bu kafolatlaydi: har mahsulot variantlari `total/weight[i]` ga teng
    qadam bilan tarqaladi → mathematically optimal spacing.

    Misol (A=5, B-K=1, total=15):
      Yangi natija: [A1, B, C, A2, D, E, F, A3, G, H, A4, I, J, A5, K]
      A pozitsiyalari: 0, 3, 7, 10, 13 — har 3-qadam ✓

    Mathematical xulosa: a-variant N marta, total T → consecutive maksimum
      = ceil(N / max(T-N+1, 1))
    Yangi algoritm bu chegaraga erishadi (ESKI algoritm — yo'q).

    O(n²) — har slot uchun n queue tekshiriladi. Tipik home: 15 karta,
    10 mahsulot → 150 hisob. Mikrosekundlar.

    Stable: bitta mahsulot ichida variant tartibi saqlanadi (position, id).
    Kirish tartibi — birinchi paydo bo'lish tartibi (deterministik).
    """
    if len(cards) <= 1:
        return list(cards)

    from collections import OrderedDict
    groups: "OrderedDict[int, list]" = OrderedDict()
    for card in cards:
        groups.setdefault(card['id'], []).append(card)

    # Faqat bitta mahsulot bo'lsa interleave ma'no kasb etmaydi
    if len(groups) == 1:
        return list(cards)

    total = len(cards)
    queues = [list(v) for v in groups.values()]
    n = len(queues)
    weights = [len(q) for q in queues]
    consumed = [0] * n

    result: list[dict] = []
    for slot in range(total):
        # Eng katta deficit'li queue'ni topamiz (variantlari tugamagan ichida)
        best_idx = -1
        best_deficit = float('-inf')
        for i in range(n):
            if consumed[i] >= weights[i]:
                continue
            expected = (slot + 1) * weights[i] / total
            deficit = expected - consumed[i]
            if deficit > best_deficit:
                best_deficit = deficit
                best_idx = i

        if best_idx < 0:
            break  # Hamma queue tugadi (bu yerga yetib kelmasligi kerak)

        result.append(queues[best_idx][consumed[best_idx]])
        consumed[best_idx] += 1

    return result


def deduplicate_cards_by_product(cards: list[dict]) -> list[dict]:
    """
    Bir mahsulot uchun **faqat bitta karta** qoldiradi (birinchisi).

    Bu — "Yaqinda ko'rilgan" va "O'xshash mahsulotlar" sections uchun.
    Amazon, Wildberries, eBay shu yondashuvni ishlatadi:
      - "Recently Viewed" → har bir ko'rilgan mahsulot uchun 1 ta karta
      - "Similar Products" → har bir o'xshash mahsulot uchun 1 ta karta

    Nima uchun bu kerak:
      Variantli mahsulot (masalan, Samsung A56 — 5 variant) home discount
      yoki listing sahifasida 5 ta karta sifatida chiqishi MA'QUL (diversity).
      Lekin "Yaqinda ko'rilgan" sectionda — foydalanuvchi mahsulotni 1 marta
      ko'rgan, 5 ta karta ko'rinishi xato. Bir mahsulot — bir karta.

    Foydalanuvchi kartochkani bossa:
      ProductDetail ochiladi va u yerda boshqa variantlarni tanlay oladi.
      Karta ustida ko'rinadigan variant — eng past position'li (default).

    Algoritm O(n): bir martalik o'tib chiqish, set bilan duplicate aniqlash.
    """
    seen: set = set()
    result: list[dict] = []
    for card in cards:
        pid = card['id']
        if pid in seen:
            continue
        seen.add(pid)
        result.append(card)
    return result


def in_stock_product_filter():
    """
    Q object: mahsulot **sotuvda mavjud** ekanligini tekshiradi.

    Mantiq:
      - Variantsiz mahsulot:  product.stock > 0
      - Variantli mahsulot:   kamida BITTA active variantda stock > 0

    Bu Amazon "currently in stock", Wildberries "naличие" yondashuvi.
    Home sahifada va listing'da ishlatiladi — tugab qolgan mahsulot ko'rinmaydi.

    Foydalanish:
      Product.objects.filter(is_active=True).filter(in_stock_product_filter()).distinct()
    """
    from django.db.models import Q
    return (
        Q(stock__gt=0)
        | Q(variants__is_active=True, variants__stock__gt=0)
    )


def _build_card_dict(product, variant, product_name: str, request) -> dict:
    """Bitta karta dict'ini yasaydi (ProductCardSerializer uchun)."""
    from .color_i18n import localize_color
    lang = get_lang({'request': request})
    card_id = f"{product.id}-{variant.id}" if variant else str(product.id)
    name = _build_variant_card_name(product_name, variant, lang) if variant else product_name
    return {
        'card_id':        card_id,
        'id':             product.id,         # product_id (navigatsiya uchun)
        'variant_id':     variant.id if variant else None,
        'name':           name,
        'slug':           product.slug,
        'category_name':  product.category.name if product.category_id else None,
        'price':          _variant_card_price(product, variant),
        'discount_price': _variant_card_discount_price(product, variant),
        'stock':          _variant_card_stock(product, variant),
        'is_discount':    _variant_card_is_discount(product, variant),
        'is_new':         product.is_new,
        'is_popular':     product.is_popular,
        'main_image':     _variant_card_image(request, product, variant),
        '_product_obj':   product,  # master_price hisoblash uchun (serializer tashlaydi)
        '_variant_obj':   variant,
        'variant': None if variant is None else {
            'color':       variant.color,
            'color_label': localize_color(variant.color, lang),
            'color_hex':   variant.color_hex,
            'quality':     variant.quality,
            'model':       variant.model,
            'size':        variant.size,
        },
    }


class ProductCardSerializer(serializers.Serializer):
    """
    Variant kartasi serializeri.

    Dict input qabul qiladi (expand_products_to_cards natijasi).
    Mahsulot + variant ma'lumotlarini birlashtirib bitta karta sifatida qaytaradi.
    """
    card_id        = serializers.CharField()
    id             = serializers.IntegerField()
    variant_id     = serializers.IntegerField(allow_null=True)
    name           = serializers.CharField()
    slug           = serializers.CharField(allow_null=True, required=False)
    category_name  = serializers.CharField(allow_null=True, required=False)
    price          = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    discount_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    stock          = serializers.IntegerField(allow_null=True)
    is_discount    = serializers.BooleanField()
    is_new         = serializers.BooleanField()
    is_popular     = serializers.BooleanField()
    main_image     = serializers.CharField(allow_null=True)
    variant        = serializers.DictField(allow_null=True, required=False)
    master_price   = serializers.SerializerMethodField()

    def get_master_price(self, obj):
        """
        Usta narxi — OPTOM asosida (optom + ustama%, faollikka ko'ra gradient).
        Variant/mahsulot obyektlari kartada (`_product_obj`/`_variant_obj`)
        saqlangan — avtoritar narx aynan ulardan `master_line_price` orqali
        hisoblanadi (optom variant'niki yoki product fallback). Optom yo'q yoki
        imtiyoz yo'q bo'lsa None → oddiy narx.
        """
        ctx = _master_ctx(self.context)
        if not ctx[0]:
            return None
        product = obj.get('_product_obj')
        if product is None:
            return None
        variant = obj.get('_variant_obj')
        from orders.services import master_line_price
        master = master_line_price(product, variant, ctx)
        return str(master) if master is not None else None

    def to_representation(self, instance):
        # Privat field'larni (_product_obj, _variant_obj) javobga chiqarmaymiz
        data = super().to_representation(instance)
        return data


class ProductSearchSerializer(serializers.ModelSerializer):
    main_image = serializers.SerializerMethodField()
    category_name = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    master_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id',
            'name',
            'category_name',
            'price',
            'discount_price',
            'master_price',
            'is_discount',
            'main_image',
        )

    def get_name(self, obj):
        return localized(obj, 'name', get_lang(self.context))

    def get_master_price(self, obj):
        return get_master_price(obj, self.context)

    def get_main_image(self, obj):
        img = obj.images.filter(is_main=True).first() or obj.images.first()
        return absolute_media_url(self.context.get('request'), img.image, width=800) if img else None

    def get_category_name(self, obj):
        if not obj.category:
            return None
        return localized(obj.category, 'name', get_lang(self.context))

class ProductDetailSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    category = CategorySerializer(read_only=True)
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    compatible_models = serializers.SerializerMethodField()
    master_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'slug', 'description',
            'price', 'discount_price', 'master_price', 'stock',
            'is_discount', 'is_new', 'is_popular',
            'category', 'images', 'variants',
            'compatible_models',
        )

    def get_name(self, obj):
        return localized(obj, 'name', get_lang(self.context))

    def get_description(self, obj):
        return localized(obj, 'description', get_lang(self.context))

    def get_master_price(self, obj):
        return get_master_price(obj, self.context)

    def get_compatible_models(self, obj):
        compat = (
            obj.compatibility
            .select_related('phone_model__series__brand')
            .all()
        )
        if not compat.exists():
            return []
        brands: dict = {}
        for c in compat:
            m = c.phone_model
            key = m.series.brand.slug
            if key not in brands:
                brands[key] = {
                    'brand': m.series.brand.name,
                    'brand_slug': key,
                    'models': [],
                }
            brands[key]['models'].append({
                'id': m.id,
                'slug': m.slug,
                'full_name': m.full_name,
                'notes': c.notes,
            })
        return list(brands.values())


def _cloudinary_transform(url: str, width: Optional[int] = None) -> str:
    """
    Cloudinary URL'ga f_auto (WebP/AVIF), q_auto:good va ixtiyoriy kenglik qo'shadi.
    Misol:  .../upload/f_auto,q_auto:good,w_800,c_limit/products/img.jpg
    """
    if '/upload/' not in url:
        return url
    base, path = url.split('/upload/', 1)
    # Agar transformatsiya allaqachon qo'shilgan bo'lsa, qayta qo'shmaymiz
    if path.startswith('f_auto'):
        return url
    parts = ['f_auto', 'q_auto:good']
    if width:
        parts.append(f'w_{width},c_limit')
    return f'{base}/upload/{",".join(parts)}/{path}'


def absolute_media_url(request, file_field, *, width: Optional[int] = None):
    """
    Media faylning to'liq URL'ini qaytaradi.

    - Local disk  → request.build_absolute_uri() orqali to'ldiradi
    - Cloudinary  → CDN URL + f_auto/q_auto transformatsiya
    - Boshqa CDN  → URL'ni o'zgartirmasdan qaytaradi
    """
    if not file_field:
        return None
    url = file_field.url
    if url.startswith(('http://', 'https://')):
        if _CDN == 'cloudinary' and 'cloudinary.com' in url:
            return _cloudinary_transform(url, width=width)
        return url
    return request.build_absolute_uri(url) if request else url


def product_main_image(product):
    if not product:
        return None
    return product.images.filter(is_main=True).first() or product.images.first()


class HomeBannerSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    product_image_url = serializers.SerializerMethodField()
    background_image_url = serializers.SerializerMethodField()
    target_url = serializers.SerializerMethodField()

    class Meta:
        model = HomeBanner
        fields = (
            'id',
            'title',
            'subtitle',
            'product',
            'product_name',
            'original_price',
            'discount_price',
            'product_image_url',
            'background_image_url',
            'background_color',
            'accent_color',
            'button_label',
            'target_url',
            'order',
        )

    def get_product_name(self, obj):
        return obj.product.name if obj.product_id else None

    def get_product_image_url(self, obj):
        request = self.context.get('request')
        if obj.product_image:
            return absolute_media_url(request, obj.product_image)
        image = product_main_image(obj.product)
        return absolute_media_url(request, image.image) if image else None

    def get_background_image_url(self, obj):
        return absolute_media_url(self.context.get('request'), obj.background_image)

    def get_target_url(self, obj):
        if obj.product_id:
            return f"/products/{obj.product_id}"
        return obj.button_url or '/catalog'

class AdminCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()
    parent_name = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'slug', 'parent', 'parent_name', 'image', 'order', 'is_active', 'is_popular', 'product_count')
        read_only_fields = ('slug',)

    def get_product_count(self, obj):
        return obj.products.filter(is_active=True).count()

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent else None


class AdminHomeBannerSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    product_name = serializers.SerializerMethodField()
    product_image_url = serializers.SerializerMethodField()
    background_image_url = serializers.SerializerMethodField()
    product_image = serializers.ImageField(write_only=True, required=False)
    background_image = serializers.ImageField(write_only=True, required=False)
    remove_product_image = serializers.BooleanField(write_only=True, required=False, default=False)
    remove_background_image = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = HomeBanner
        fields = (
            'id',
            'title',
            'subtitle',
            'product',
            'product_name',
            'original_price',
            'discount_price',
            'product_image',
            'product_image_url',
            'background_image',
            'background_image_url',
            'background_color',
            'accent_color',
            'button_label',
            'button_url',
            'order',
            'is_active',
            'start_date',
            'end_date',
            'remove_product_image',
            'remove_background_image',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    def to_internal_value(self, data):
        data = data.copy()
        for nullable_field in ('product', 'original_price', 'discount_price', 'start_date', 'end_date'):
            if data.get(nullable_field) == '':
                data[nullable_field] = None
        return super().to_internal_value(data)

    def get_product_name(self, obj):
        return obj.product.name if obj.product_id else None

    def get_product_image_url(self, obj):
        request = self.context.get('request')
        if obj.product_image:
            return absolute_media_url(request, obj.product_image)
        image = product_main_image(obj.product)
        return absolute_media_url(request, image.image) if image else None

    def get_background_image_url(self, obj):
        return absolute_media_url(self.context.get('request'), obj.background_image)

    def validate(self, attrs):
        original_price = attrs.get('original_price', self.instance.original_price if self.instance else None)
        discount_price = attrs.get('discount_price', self.instance.discount_price if self.instance else None)
        start_date = attrs.get('start_date', self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)
        background_color = attrs.get('background_color', self.instance.background_color if self.instance else '#111827')
        accent_color = attrs.get('accent_color', self.instance.accent_color if self.instance else '#007a4d')

        if original_price is not None and discount_price is not None and discount_price >= original_price:
            raise serializers.ValidationError({
                'discount_price': "Chegirma narxi asl narxdan kichik bo'lishi kerak."
            })
        if start_date and end_date and end_date <= start_date:
            raise serializers.ValidationError({
                'end_date': "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak."
            })
        if background_color and not HEX_COLOR_RE.match(background_color):
            raise serializers.ValidationError({
                'background_color': "Rang #RRGGBB formatida bo'lishi kerak."
            })
        if accent_color and not HEX_COLOR_RE.match(accent_color):
            raise serializers.ValidationError({
                'accent_color': "Rang #RRGGBB formatida bo'lishi kerak."
            })
        return attrs

    def create(self, validated_data):
        validated_data.pop('remove_product_image', False)
        validated_data.pop('remove_background_image', False)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        remove_product_image = validated_data.pop('remove_product_image', False)
        remove_background_image = validated_data.pop('remove_background_image', False)

        if remove_product_image:
            instance.product_image.delete(save=False)
            validated_data['product_image'] = None
        if remove_background_image:
            instance.background_image.delete(save=False)
            validated_data['background_image'] = None
        return super().update(instance, validated_data)

class AdminProductVariantInputSerializer(serializers.Serializer):
    """
    Frontend (web + mobil) yuborgan variant ma'lumotlari uchun input serializer.

    Bu yer DEFENSIVE — null/empty/noma'lum tipdagi qiymatlarni mehribon kutib oladi:
      • bool maydonlar default'ga tushadi (None → False/True)
      • integer maydonlar default'ga tushadi (None → 0)
      • `delete_image_ids` ichida null/0 elementlar avtomat tashlanadi
    Maqsad: brauzerda `JSON.stringify(NaN) → "null"` kabi kichik xato butun
    saqlashni "This field may not be null" bilan to'xtatib qo'ymasin.
    """
    id = serializers.IntegerField(required=False, allow_null=True)
    color = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    color_hex = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    remove_image = serializers.BooleanField(required=False, default=False, allow_null=True)
    delete_image_ids = serializers.ListField(
        child=serializers.IntegerField(allow_null=True),
        required=False,
        default=list,
        allow_null=True,
    )
    quality = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    model = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    size = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    # USD maydonlari 6 o'nlik — frontend so'm→USD aylanishini yo'qotishsiz
    # yuboradi (5.833333). 2 o'nlik bo'lsa DRF uni 5.83 ga yaxlitlab, narxni
    # yana buzar edi. Model ham 6 o'nlikda.
    price_usd = serializers.DecimalField(max_digits=12, decimal_places=6, required=False, allow_null=True)
    discount_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    discount_price_usd = serializers.DecimalField(max_digits=12, decimal_places=6, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price_usd = serializers.DecimalField(max_digits=12, decimal_places=6, required=False, allow_null=True)
    # Optom (ulgurji) narx — USD asosida (kursga bog'liq), faqat admin/POS.
    optom_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    optom_price_usd = serializers.DecimalField(max_digits=12, decimal_places=6, required=False, allow_null=True)
    stock = serializers.IntegerField(required=False, min_value=0, default=0, allow_null=True)
    sku = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    barcode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True, allow_null=True)
    position = serializers.IntegerField(required=False, min_value=0, default=0, allow_null=True)
    # Phase 4.0 — do'kondagi polka manzili (faqat admin/POS uchun).
    # max 20 belgi — qisqa kodlar uchun yetarli (001, A-3, Sklad-2/Polka-15).
    shelf_location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=20,
    )
    # Kimdan kelgan (yetkazib beruvchi) — faqat admin/POS.
    supplier = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=100,
    )

    def to_internal_value(self, data):
        # Frontend ba'zan bo'sh string yoki noto'g'ri tipdagi raqamlarni yuborishi
        # mumkin (JSON.stringify(NaN)='null' kabi). Bu yerda biz mayda
        # nomuvofiqliklarni saqlash YO'L QO'YMAYDI deb tashlash o'rniga jim
        # tuzatib o'tamiz — model darajasidagi default'lar himoya qiladi.
        if isinstance(data, dict):
            data = data.copy()
            for int_field in ('stock', 'position'):
                if data.get(int_field) in (None, '', 'null'):
                    data.pop(int_field, None)
            for bool_field in ('remove_image', 'is_active'):
                if data.get(bool_field) is None:
                    data.pop(bool_field, None)
            ids = data.get('delete_image_ids')
            if isinstance(ids, list):
                data['delete_image_ids'] = [i for i in ids if isinstance(i, int) and i > 0]
            elif ids in (None, '', 'null'):
                data['delete_image_ids'] = []
        return super().to_internal_value(data)

class AdminProductSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False, allow_null=True)
    discount_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    main_image = serializers.SerializerMethodField()
    image = serializers.ImageField(write_only=True, required=False)
    remove_image = serializers.BooleanField(write_only=True, required=False, default=False)
    category_name = serializers.SerializerMethodField()
    variants_data = serializers.CharField(write_only=True, required=False, allow_blank=True) # JSON string for variants
    images = ProductImageSerializer(many=True, read_only=True)
    variants = AdminProductVariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'slug', 'description', 'category', 'category_name',
            'price', 'price_usd', 'discount_price', 'discount_price_usd', 'cost_price', 'cost_price_usd',
            'optom_price', 'optom_price_usd', 'stock',
            'is_active', 'is_popular', 'is_new', 'is_discount',
            # Phase 4.2 — product darajasidagi polka (variantsiz mahsulot
            # uchun yoki barcha variantlar uchun default fallback).
            'shelf_location',
            'supplier',  # Kimdan kelgan (yetkazib beruvchi) — admin/POS
            'created_at', 'updated_at', 'main_image', 'image', 'remove_image', 'images', 'variants_data', 'variants'
        )
        read_only_fields = ('slug', 'created_at', 'updated_at', 'is_discount')

    def to_internal_value(self, data):
        # Frontend (FormData) ba'zan bo'sh string yuboradi (`discount_price=""`).
        # DRF default holatida bunga "A valid number is required" deydi —
        # foydalanuvchi uchun chalkash. Bo'sh stringlar ("") va "null" satrlarni
        # `allow_null=True` maydonlar uchun None'ga aylantiramiz.
        # MUHIM: bu yerga FAQAT model'da `null=True` bo'lgan maydonlar qo'shiladi
        # (aks holda DRF "This field may not be null" beradi). `cost_price` esa
        # `default=0.00` bilan NOT NULL — uni RO'YXATGA qo'shma!
        data = data.copy()
        nullable_fields = (
            'category', 'price_usd', 'discount_price',
            'discount_price_usd', 'cost_price_usd',
            'optom_price', 'optom_price_usd',
        )
        for nullable_field in nullable_fields:
            if data.get(nullable_field) in ('', 'null'):
                data[nullable_field] = None
        # cost_price NOT NULL → bo'sh string kelsa 0'ga aylantiramiz (frontend
        # `|| '0'` qiladi, lekin defensive qatlam — eski mobil ilovalar uchun).
        if data.get('cost_price') in ('', 'null', None):
            data['cost_price'] = '0'
        return super().to_internal_value(data)

    def get_main_image(self, obj):
        img = obj.images.filter(is_main=True).first() or obj.images.first()
        return absolute_media_url(self.context.get('request'), img.image, width=800) if img else None

    def get_category_name(self, obj):
        return obj.category.name if obj.category_id else None

    def validate(self, attrs):
        price = attrs.get('price', self.instance.price if self.instance else None)
        discount_price = attrs.get('discount_price', self.instance.discount_price if self.instance else None)

        if price is not None and discount_price is not None and discount_price >= price:
            raise serializers.ValidationError({
                'discount_price': "Chegirma narxi asosiy narxdan kichik bo'lishi kerak."
            })
        return attrs

    def _generate_unique_slug(self, name, instance_pk=None):
        base_slug = slugify(name) or 'product'
        slug = base_slug
        counter = 1
        while Product.objects.filter(slug=slug).exclude(pk=instance_pk).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    def _parse_variants_data(self, raw_value):
        if raw_value is serializers.empty:
            return serializers.empty
        if raw_value in (None, ''):
            return []

        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise serializers.ValidationError({
                'variants_data': "Variantlar JSON formatida yuborilishi kerak."
            }) from exc

        if not isinstance(parsed, list):
            raise serializers.ValidationError({
                'variants_data': "Variantlar ro'yxat ko'rinishida yuborilishi kerak."
            })

        serializer = AdminProductVariantInputSerializer(data=parsed, many=True)
        try:
            serializer.is_valid(raise_exception=True)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'variants_data': exc.detail}) from exc
        return serializer.validated_data

    def _normalize_variant_payload(self, variant_data):
        color_hex = variant_data.get('color_hex') or None
        if color_hex and not HEX_COLOR_RE.match(color_hex):
            raise serializers.ValidationError({
                'variants_data': "Variant rang kodi #RRGGBB formatida bo'lishi kerak."
            })

        price = variant_data.get('price')
        discount_price = variant_data.get('discount_price')
        if price is not None and discount_price is not None and discount_price >= price:
            raise serializers.ValidationError({
                'variants_data': "Variant chegirma narxi asosiy variant narxidan kichik bo'lishi kerak."
            })

        # Default'lar — `to_internal_value` allaqachon None'larni tozalagan,
        # lekin DRF Serializer `default=` qiymati keyin keladi. Bu yerda yana
        # bir bor qatlam: agar variantda qiymat hech qanday bo'lmasa, model
        # darajasidagi default ishlatilsin.
        stock_raw = variant_data.get('stock')
        position_raw = variant_data.get('position')
        is_active_raw = variant_data.get('is_active')
        normalized = {
            'color': variant_data.get('color') or None,
            'color_hex': color_hex,
            'quality': variant_data.get('quality') or None,
            'model': variant_data.get('model') or None,
            'size': variant_data.get('size') or None,
            'price': price,
            'price_usd': variant_data.get('price_usd'),
            'discount_price': discount_price,
            'discount_price_usd': variant_data.get('discount_price_usd'),
            'cost_price': variant_data.get('cost_price'),
            'cost_price_usd': variant_data.get('cost_price_usd'),
            'optom_price': variant_data.get('optom_price'),
            'optom_price_usd': variant_data.get('optom_price_usd'),
            'stock': stock_raw if isinstance(stock_raw, int) and stock_raw >= 0 else 0,
            'sku': variant_data.get('sku') or None,
            'barcode': variant_data.get('barcode') or None,
            'is_active': True if is_active_raw is None else bool(is_active_raw),
            'position': position_raw if isinstance(position_raw, int) and position_raw >= 0 else 0,
            # Phase 4.0 — polka. None/bo'sh string → '' (model'da default='').
            # CharField(blank=True), null=False bo'lgani uchun '' bo'lib qoladi.
            'shelf_location': (variant_data.get('shelf_location') or '').strip()[:20],
            # Kimdan kelgan — bo'sh bo'lsa '' (model default). Max 100.
            'supplier': (variant_data.get('supplier') or '').strip()[:100],
        }
        has_content = any(
            value not in (None, '', Decimal('0.00'), 0, True)
            for value in normalized.values()
        )
        return normalized, has_content

    def _sync_variants(self, product, variants_data):
        existing_variants = {variant.id: variant for variant in product.variants.prefetch_related('images').all()}
        keep_variant_ids = []
        files = self.context.get('request').FILES if self.context.get('request') else {}
        seen_skus = set()

        for index, variant in enumerate(variants_data):
            variant_id = variant.get('id')
            payload, has_content = self._normalize_variant_payload(variant)
            image_file = files.get(f'variant_image_{index}')
            remove_image = bool(variant.get('remove_image', False))
            # delete_image_ids: faqat haqiqiy musbat butun ID — None/0/dublikatlar
            # tashlanadi. Bu null-id legacy fallback'ga bog'liq xatolardan himoya.
            delete_image_ids = sorted({
                int(i) for i in (variant.get('delete_image_ids') or [])
                if isinstance(i, int) and i > 0
            })
            if not has_content:
                continue

            sku = payload.get('sku')
            if sku:
                if sku in seen_skus:
                    raise serializers.ValidationError({
                        'variants_data': f"Bir mahsulot ichida SKU takrorlanmasligi kerak: {sku}"
                    })
                seen_skus.add(sku)

            if variant_id is not None:
                current_variant = existing_variants.get(variant_id)
                if current_variant is None:
                    raise serializers.ValidationError({
                        'variants_data': f"Variant #{variant_id} ushbu mahsulotga tegishli emas."
                    })
                for field, value in payload.items():
                    setattr(current_variant, field, value)
                if remove_image:
                    current_variant.image.delete(save=False)
                    current_variant.image = None
                if image_file:
                    current_variant.image = image_file
                current_variant.save()

                if delete_image_ids:
                    current_variant.images.filter(id__in=delete_image_ids).delete()

                j = 0
                base_order = current_variant.images.count()
                while True:
                    gallery_file = files.get(f'variant_images_{index}_{j}')
                    if gallery_file is None:
                        break
                    ProductVariantImage.objects.create(variant=current_variant, image=gallery_file, order=base_order + j)
                    j += 1

                keep_variant_ids.append(current_variant.id)
            else:
                if image_file:
                    payload['image'] = image_file
                new_variant = ProductVariant.objects.create(product=product, **payload)

                j = 0
                while True:
                    gallery_file = files.get(f'variant_images_{index}_{j}')
                    if gallery_file is None:
                        break
                    ProductVariantImage.objects.create(variant=new_variant, image=gallery_file, order=j)
                    j += 1

                keep_variant_ids.append(new_variant.id)

        product.variants.exclude(id__in=keep_variant_ids).delete()

    def create(self, validated_data):
        image = validated_data.pop('image', None)
        validated_data.pop('remove_image', False)
        variants_data = self._parse_variants_data(validated_data.pop('variants_data', serializers.empty))
        product = super().create(validated_data)
        
        if image:
            ProductImage.objects.create(product=product, image=image, is_main=True, order=0)

        if variants_data is not serializers.empty:
            self._sync_variants(product, variants_data)
        return product

    def update(self, instance, validated_data):
        image = validated_data.pop('image', None)
        remove_image = validated_data.pop('remove_image', False)
        variants_data = self._parse_variants_data(validated_data.pop('variants_data', serializers.empty))

        if 'name' in validated_data and validated_data['name'] != instance.name:
            validated_data['slug'] = self._generate_unique_slug(validated_data['name'], instance.pk)

        product = super().update(instance, validated_data)
        
        if remove_image:
            instance.images.all().delete()

        if image:
            instance.images.all().delete()
            ProductImage.objects.create(product=product, image=image, is_main=True, order=0)

        if variants_data is not serializers.empty:
            self._sync_variants(product, variants_data)
        return product


# ─────────────────────────────────────────────────────────────────────────────
# COMPAT SERIALIZERS — Telefon Mos Kelish Matritsasi
# ─────────────────────────────────────────────────────────────────────────────

class PhoneModelMiniSerializer(serializers.ModelSerializer):
    """Kichik ko'rinish: faqat identifikatsiya uchun (dropdown, badge)."""
    full_name  = serializers.CharField(read_only=True)
    brand_name = serializers.CharField(source='series.brand.name', read_only=True)
    series_name = serializers.CharField(source='series.name', read_only=True)

    class Meta:
        model = PhoneModel
        fields = ('id', 'slug', 'full_name', 'brand_name', 'series_name', 'year', 'is_popular')


class PhoneSeriesSerializer(serializers.ModelSerializer):
    models = PhoneModelMiniSerializer(many=True, read_only=True)

    class Meta:
        model = PhoneSeries
        fields = ('id', 'name', 'slug', 'order', 'models')


class PhoneBrandSerializer(serializers.ModelSerializer):
    series   = PhoneSeriesSerializer(many=True, read_only=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = PhoneBrand
        fields = ('id', 'name', 'slug', 'logo_url', 'is_popular', 'order', 'series')

    def get_logo_url(self, obj):
        return absolute_media_url(self.context.get('request'), obj.logo)


class CompatibilityWriteSerializer(serializers.Serializer):
    """Admin uchun: mahsulotga moslik qo'shish/o'chirish."""
    phone_model_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        min_length=1,
        help_text="Qo'shiladigan PhoneModel ID'lar ro'yxati",
    )
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class CompatibilityBulkSeriesSerializer(serializers.Serializer):
    """Admin uchun: butun bir seriyani bir vaqtda qo'shish."""
    series_id = serializers.IntegerField(min_value=1)
    notes     = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class ProductCompatibilityReadSerializer(serializers.ModelSerializer):
    """Bitta moslik yozuvi (admin ro'yxati uchun)."""
    phone_model = PhoneModelMiniSerializer(read_only=True)

    class Meta:
        model = ProductCompatibility
        fields = ('id', 'phone_model', 'notes')


class AdminPhoneBrandWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhoneBrand
        fields = ('id', 'name', 'is_popular', 'order')


class AdminPhoneSeriesWriteSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source='brand.name', read_only=True)

    class Meta:
        model = PhoneSeries
        fields = ('id', 'brand', 'brand_name', 'name', 'order')


class AdminPhoneModelWriteSerializer(serializers.ModelSerializer):
    full_name   = serializers.CharField(read_only=True)
    series_name = serializers.SerializerMethodField()
    name        = serializers.CharField(allow_blank=True, default='')

    class Meta:
        model = PhoneModel
        fields = ('id', 'series', 'series_name', 'name', 'full_name', 'year', 'is_popular', 'order')

    def get_series_name(self, obj):
        return str(obj.series)


# ── Do'kon ma'lumotlari (chek/receipt) — Phase 2.7 davom ─────────────────────
class ShopInfoUpdateSerializer(serializers.Serializer):
    """
    PATCH /api/admin/shop-info/ uchun input validatsiyasi.

    Qoidalar:
      • Hech bo'lmaganda 1 ta maydon yuborilishi shart (bo'sh PATCH ma'nosiz).
      • Yuborilgan har bir maydon trimmed bo'lmasligi shart (bo'sh string
        rad etiladi — aks holda chek telefonsiz chiqib qoladi).
      • max_length=200 — DB schema va GlobalSetting.SHOP_INFO_MAX_LEN bilan mos.
      • Telefon uchun yumshoq format: faqat raqam/+/probel/tire — agar boshqa
        belgi bo'lsa rad etiladi (suiiste'mol himoyasi).
    """

    shop_name    = serializers.CharField(required=False, max_length=200, allow_blank=False, trim_whitespace=True)
    shop_phone   = serializers.CharField(required=False, max_length=200, allow_blank=False, trim_whitespace=True)
    shop_address = serializers.CharField(required=False, max_length=200, allow_blank=False, trim_whitespace=True)

    # Telefon — raqam/+/probel/tire/qavslar. Misol: "+998 71 123-45-67",
    # "+998 (71) 123 45 67". Boshqa belgi -> validatsiya xatosi.
    _PHONE_RE = __import__('re').compile(r'^[\d\s\+\-\(\)]+$')

    def validate_shop_phone(self, value):
        if not self._PHONE_RE.fullmatch(value):
            raise serializers.ValidationError(
                "Telefon faqat raqam, '+', '-', probel va qavslardan iborat bo'lishi mumkin."
            )
        # Kamida 7 ta raqam bo'lishi shart (qisqartmali telefon ham 7+)
        digits = sum(1 for c in value if c.isdigit())
        if digits < 7:
            raise serializers.ValidationError(
                "Telefon kamida 7 ta raqamdan iborat bo'lishi shart."
            )
        return value

    def validate(self, attrs):
        if not any(k in attrs for k in ('shop_name', 'shop_phone', 'shop_address')):
            raise serializers.ValidationError(
                "Hech bo'lmaganda bitta maydon yuborilishi shart."
            )
        return attrs
