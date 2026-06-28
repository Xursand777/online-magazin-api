import re
from django.db import models
from django.core.exceptions import ValidationError
from django.utils.text import slugify
from decimal import Decimal

from .image_optimize import apply_webp

class GlobalSetting(models.Model):
    """
    Tizim bo'yicha sozlamalar jadvali (kalit → qiymat).

    Kesh arxitekturasi:
      Har bir yozuv 5 daqiqa Redis/LocMemCache'da saqlanadi.

      Muammo — keshsiz:
        Product.save() ichida get_usd_rate() chaqiriladi.
        10 000 mahsulotni importda = 10 000 ta SELECT faqat kurs uchun.

      Yechim — kesh + invalidatsiya:
        Birinchi o'qish: SELECT → cache.set(key, value, 300)
        Keyingi 4:59 = cache.get() → DB so'rovi yo'q.
        save() chaqirilganda: cache.delete() → keyingi o'qish yangi qiymat oladi.

      Chegarasi: QuerySet.update() save() ni chetlab o'tadi — bunday holda
        cache 5 daqiqadan so'ng avtomatik yangilanadi.
    """
    key         = models.CharField(max_length=100, unique=True)
    value       = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    updated_at  = models.DateTimeField(auto_now=True)

    # ── Kesh sozlamalari ───────────────────────────────────────────────────────
    _CACHE_PREFIX = 'bozor:gs:'
    _CACHE_TTL    = 5 * 60   # 5 daqiqa — bulk import + real-time o'zgarish muvozanati

    def __str__(self):
        return f"{self.key}: {self.value}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Sozlama o'zgarganda darhol keshni tozalaymiz.
        # Keyingi get_usd_rate() / get_master_discount_percent() chaqiruvi
        # yangi qiymatni DB'dan oladi va qayta keshga yozadi.
        from django.core.cache import cache
        cache.delete(f'{self._CACHE_PREFIX}{self.key}')

    @classmethod
    def get_usd_rate(cls) -> Decimal:
        """
        USD kurs (so'mda). Keshlanadi — 5 daqiqa.

        Kesh issiq: 0 DB so'rov.
        Kesh sovuq (birinchi chaqiruv yoki admin o'zgartirdi):
          get_or_create → agar yo'q bo'lsa '12800' default bilan yaratadi.
        """
        from django.core.cache import cache

        cache_key = f'{cls._CACHE_PREFIX}usd_rate'
        cached = cache.get(cache_key)
        if cached is not None:
            try:
                return Decimal(str(cached))
            except Exception:
                pass   # buzilgan kesh → DB'dan qayta olamiz

        setting, _ = cls.objects.get_or_create(
            key='usd_rate',
            defaults={'value': '12000', 'description': "1 USD kurs (so'mda)"},
        )
        try:
            rate = Decimal(setting.value)
        except Exception:
            rate = Decimal('12000')

        cache.set(cache_key, str(rate), timeout=cls._CACHE_TTL)
        return rate

    @classmethod
    def get_master_discount_percent(cls) -> Decimal:
        """
        Ustalar uchun chegirma foizi (0–90). Default: 5%. Keshlanadi — 5 daqiqa.
        """
        from django.core.cache import cache

        cache_key = f'{cls._CACHE_PREFIX}master_discount_percent'
        cached = cache.get(cache_key)
        if cached is not None:
            try:
                pct = Decimal(str(cached))
                # Diapazon tekshiruvi kesh qiymatiga ham qo'llanadi
                if pct < 0:  return Decimal('0')
                if pct > 90: return Decimal('90')
                return pct
            except Exception:
                pass   # buzilgan kesh → DB'dan qayta olamiz

        setting, _ = cls.objects.get_or_create(
            key='master_discount_percent',
            defaults={'value': '5', 'description': "Ustalar uchun chegirma foizi (%)"},
        )
        try:
            pct = Decimal(setting.value)
        except Exception:
            pct = Decimal('5')

        if pct < 0:  pct = Decimal('0')
        if pct > 90: pct = Decimal('90')

        cache.set(cache_key, str(pct), timeout=cls._CACHE_TTL)
        return pct

    # ── Do'kon ma'lumotlari (chek/receipt'da ko'rinadi) ──────────────────────
    # Avval localStorage'da edi -> har brauzer/qurilmada alohida saqlanardi
    # va admin cache tozalasa nullashardi. Endi server'da, 5 daqiqa Redis
    # cache bilan, faqat super_admin tahrir qila oladi.
    SHOP_INFO_KEYS = ('shop_name', 'shop_phone', 'shop_address')
    SHOP_INFO_DEFAULTS = {
        'shop_name': '700Mobile.uz',
        'shop_phone': '+998 71 000-00-00',
        'shop_address': 'Toshkent sh.',
    }
    SHOP_INFO_MAX_LEN = 200

    @classmethod
    def get_shop_info(cls) -> dict:
        """Chek'da ko'rinadigan do'kon ma'lumotlari. Cache: 5 daqiqa."""
        from django.core.cache import cache

        out = {}
        miss_keys = []
        for k in cls.SHOP_INFO_KEYS:
            cached = cache.get(f'{cls._CACHE_PREFIX}{k}')
            if cached is not None:
                out[k] = cached
            else:
                miss_keys.append(k)

        if not miss_keys:
            return out

        # DB'dan miss bo'lganlarni o'qib, cache'ga yozamiz
        existing = {
            obj.key: obj.value
            for obj in cls.objects.filter(key__in=miss_keys)
        }
        for k in miss_keys:
            val = existing.get(k, cls.SHOP_INFO_DEFAULTS[k])
            out[k] = val
            cache.set(f'{cls._CACHE_PREFIX}{k}', val, timeout=cls._CACHE_TTL)

        return out

    @classmethod
    def set_shop_info(cls, *, name=None, phone=None, address=None) -> dict:
        """
        Super admin'dan keladigan yangilanish. Faqat None bo'lmagan
        field'lar yangilanadi (partial update). Har save() cache.delete()
        ni chaqiradi (model save() override'idan), shuning uchun
        keyingi get_shop_info() yangi qiymatlarni qaytaradi.
        """
        updates = {'shop_name': name, 'shop_phone': phone, 'shop_address': address}
        for k, v in updates.items():
            if v is None:
                continue
            v = (v or '').strip()
            if len(v) > cls.SHOP_INFO_MAX_LEN:
                v = v[:cls.SHOP_INFO_MAX_LEN]
            obj, created = cls.objects.get_or_create(
                key=k,
                defaults={'value': v, 'description': "Do'kon (chek'da ko'rinadi)"},
            )
            if not created and obj.value != v:
                obj.value = v
                obj.save(update_fields=['value', 'updated_at'])
            elif created:
                pass  # already saved via get_or_create
        return cls.get_shop_info()


# ─── Smart Translation Engine ─────────────────────────────────────────────────
#
# How major e-commerce platforms handle multilingual product data:
#
#   Amazon / AliExpress / Ozon use translation glossaries + protected-term
#   substitution so that brand names, model codes, and technical specs are
#   NEVER sent to the translation engine.  "iPhone" stays "iPhone" in every
#   language; only the descriptive native-language words are translated.
#
# Our implementation uses three layers of protection:
#
#   Layer 1 – BRAND REGISTRY  : a frozen set of known brand names and
#             English model-suffix words (Pro, Max, Note, Ultra …) that are
#             matched as whole words (case-insensitive).
#
#   Layer 2 – SPEC PATTERNS   : regex for alphanumeric model codes
#             (RS90F65D1FWT), storage sizes (128 GB), power ratings (165 W),
#             resolutions (4K), etc.
#
#   Layer 3 – "FULLY PROTECTED" GATE  : after masking all protected spans,
#             if no alphabetic character remains the entire string is a brand
#             / model label — we return '' and let the serialiser fall back to
#             the original value.  No translation artefacts, ever.
#
# For strings that DO contain translatable words (e.g. "Smartfon Apple iPhone
# 16 128 GB Qora") we use a **segment-based** strategy: the protected spans
# are extracted, the non-protected gaps are sent to Google Translate in a
# single batch, and the result is stitched back together.  The translator
# never sees "Apple", "iPhone", "Note", "Pro", "128 GB" — it cannot corrupt
# them.

# ── Brand / model-suffix registry ─────────────────────────────────────────────
_BRANDS: frozenset = frozenset({
    # Apple
    'apple', 'iphone', 'ipad', 'ipod', 'airpods', 'imac', 'macbook',
    # Samsung
    'samsung', 'galaxy', 'qled', 'neo',
    # Xiaomi / POCO
    'xiaomi', 'redmi', 'poco', 'miui',
    # Huawei / Honor
    'huawei', 'honor',
    # Consumer electronics
    'lg', 'sony', 'panasonic', 'philips', 'bosch', 'siemens', 'beko',
    'electrolux', 'artel', 'haier', 'hisense', 'vestel', 'gorenje',
    # Audio
    'marshall', 'logitech', 'beats', 'jbl', 'bose', 'sennheiser',
    # Audio model lines — "Major", "Minor" etc. are Marshall product lines,
    # not English words to be translated
    'major', 'minor',
    # Computing
    'dell', 'hp', 'lenovo', 'asus', 'acer', 'toshiba', 'msi', 'razer',
    # Chips
    'intel', 'amd', 'nvidia', 'qualcomm', 'snapdragon',
    # Mobile
    'realme', 'oppo', 'vivo', 'oneplus', 'motorola', 'nokia', 'google', 'pixel',
    # Cameras
    'nikon', 'canon', 'fujifilm', 'gopro',
    # English model-suffix words (change meaning or become nonsense when translated)
    'pro', 'max', 'ultra', 'plus', 'lite', 'mini', 'note', 'air',
    'edge', 'prime', 'se', 'fe', 'go',
    # Display / connectivity / computing acronyms that must never be transliterated
    'oled', 'amoled', 'ips', 'led', 'usb', 'nfc', '5g', '4g', 'lte',
    'tv', 'ai', 'pc', 'cpu', 'gpu', 'ram', 'ssd', 'hdd', 'hdmi',
    'side-by-side',
    # English color / finish words used in product names (not Uzbek — Uzbek
    # uses "qora", "oq", "ko'k", etc.).  When an admin enters the English
    # word, it is part of the model name and must not be translated.
    'black', 'white', 'blue', 'red', 'green', 'gold', 'silver',
    'gray', 'grey', 'pink', 'purple', 'orange', 'yellow', 'brown',
    'titanium', 'graphite', 'graphit', 'desert', 'midnight',
    'starlight', 'natural', 'storm', 'phantom', 'cosmic',
    'ocean', 'lavender', 'alpine', 'pine',
    # Samsung / Hisense product-line proper nouns (not translated on their sites)
    'vision', 'fusion',
    # Roman numerals used as model generation markers ("Marshall Major V")
    'v', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii',
    # Single-letter product-tier designators: Samsung Galaxy A/S/M/Z/F/X,
    # Xiaomi TV A/S/X, Realme C/V, etc.  In Uzbek, single standalone letters
    # are not used as words, so word-boundary matching is safe here.
    'a', 's', 'x', 'z', 'f',
})

# Alphanumeric model codes and unit-bearing technical specs
# Covers formats like: RS90F65D1FWT  GC-B459SECL  65UT80006LA  128GB  4K  165W
_SPEC_RE = re.compile(
    r'\b('
    # Hyphenated model codes: GC-B459SECL, QE55-QN70F, etc.
    r'[A-Z]{1,6}-[A-Z]{1,6}\d{1,10}[A-Z0-9+\-]*'
    # Plain model codes starting with letters: RS90F65D1FWT, A56, S25, X9d
    r'|[A-Z]{1,6}\d{1,10}[A-Z0-9+\-]*'
    # Plain model codes starting with digits: 65UT80006LA, 4K, 8K
    r'|\d{1,6}[A-Z]{1,6}[A-Z0-9+\-]*'
    # Technical specs with SI units: 128 GB, 5000 mAh, 165 W, 48 MP
    r'|\d+\s*(?:GB|TB|MB|GHz|MHz|mAh|Wh|W|Hz|MP|mm|cm|K)\b'
    r')',
    re.IGNORECASE,
)

# Brand regex built from the registry (longest match first → greedy precedence)
_BRAND_RE = re.compile(
    r'\b(' + '|'.join(re.escape(w) for w in sorted(_BRANDS, key=len, reverse=True)) + r')\b',
    re.IGNORECASE,
)

# Separator used to batch multiple translatable chunks in one API call.
# U+2042 ASTERISM — astronomically unlikely to appear in product text.
_SEP = '\n⁂\n'


def _protected_spans(text: str) -> list:
    """Return sorted, merged (start, end) spans covering every protected term."""
    raw = [(m.start(), m.end()) for m in _BRAND_RE.finditer(text)]
    raw += [(m.start(), m.end()) for m in _SPEC_RE.finditer(text)]
    raw.sort()
    merged = []
    for s, e in raw:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged]


def _is_fully_protected(text: str, spans: list) -> bool:
    """
    True when every non-numeric, non-punctuation character in `text` falls
    inside a protected span — i.e. the string is a pure brand / model label
    and there is literally nothing left to translate.
    """
    prev = 0
    for s, e in spans:
        gap = text[prev:s]
        if re.search(r'[^\W\d_]', gap, re.UNICODE):   # any real letter in gap?
            return False
        prev = e
    return not re.search(r'[^\W\d_]', text[prev:], re.UNICODE)


def _raw_translate(text: str, target_lang: str) -> str:
    """Single Google Translate call.  source='auto' handles mixed-language input."""
    if not text.strip():
        return ''
    try:
        from deep_translator import GoogleTranslator
        result = GoogleTranslator(source='auto', target=target_lang).translate(text)
        return (result or '').strip()
    except Exception:
        return ''


def _translate_text(text: str, target_lang: str) -> str:
    """
    Translate `text` (Uzbek / mixed) to `target_lang` with full brand and
    model-number protection.

    Returns '' when:
      • text is empty / whitespace
      • the entire text is brand names / model codes / specs (nothing to translate)
      • the translation call fails or returns nothing

    An empty return value tells the caller to keep the original field as the
    fallback — the serialiser will serve it to all languages unchanged, which
    is exactly correct for strings like "iPhone 17 Pro Max".

    Algorithm (segment-based, no placeholder artefacts):
      1. Locate all protected spans.
      2. Gate: if no translatable characters remain → return ''.
      3. Collect the non-protected text chunks (the "gaps").
      4. Join gaps with _SEP and translate them in ONE API call.
      5. Split the translated result on _SEP and stitch the pieces back
         together with the original protected spans in their original positions.
      6. Fallback: if _SEP was mangled by the translator, retry using the
         opaque-placeholder approach (⟨N0⟩ Unicode angle-bracket tokens).
    """
    if not text or not text.strip():
        return ''

    spans = _protected_spans(text)

    # ── Gate ──────────────────────────────────────────────────────────────────
    if _is_fully_protected(text, spans):
        return ''          # e.g. "iPhone 17 Pro Max" or "Xiaomi Redmi Note 15"

    # ── No protected terms at all ─────────────────────────────────────────────
    if not spans:
        return _raw_translate(text, target_lang)

    # ── Segment-based translation ─────────────────────────────────────────────
    # Build a segment list.  Crucially, leading/trailing whitespace in every
    # gap is separated out as its own 'protect' node so that stripping the
    # translated content never swallows the spaces around brand names.
    # e.g. "Sovutgich SAMSUNG …"  →  [translate:"Sovutgich"] [protect:" "]
    #                                  [protect:"SAMSUNG"] …
    # Reconstruction then yields "Холодильник SAMSUNG …" (space intact).

    def _push_gap(buf: list, gap: str) -> None:
        stripped = gap.strip()
        if not stripped:
            if gap:
                buf.append({'kind': 'protect', 'text': gap})
            return
        lws = gap[: len(gap) - len(gap.lstrip())]
        rws = gap[len(gap.rstrip()) :]
        if lws:
            buf.append({'kind': 'protect',   'text': lws})
        buf.append({'kind': 'translate', 'text': stripped})
        if rws:
            buf.append({'kind': 'protect',   'text': rws})

    segments: list = []
    prev = 0
    for s, e in spans:
        _push_gap(segments, text[prev:s])
        segments.append({'kind': 'protect', 'text': text[s:e]})
        prev = e
    _push_gap(segments, text[prev:])

    to_translate = [seg['text'] for seg in segments if seg['kind'] == 'translate']
    if not to_translate:
        return ''

    # One API call for all translatable chunks
    batch_out = _raw_translate(_SEP.join(to_translate), target_lang)
    if not batch_out:
        return ''

    translated_chunks = batch_out.split('⁂')

    if len(translated_chunks) != len(to_translate):
        # Separator was consumed/mangled — fall back to placeholder approach
        return _translate_with_placeholders(text, spans, target_lang)

    translated_chunks = [c.strip('\n') for c in translated_chunks]

    result, t_idx = [], 0
    for seg in segments:
        if seg['kind'] == 'protect':
            result.append(seg['text'])
        else:
            result.append(translated_chunks[t_idx])
            t_idx += 1

    return ''.join(result).strip()


def _translate_with_placeholders(text: str, spans: list, target_lang: str) -> str:
    """
    Fallback path used when the batch separator is corrupted by the translator.
    Replaces each protected span with ⟨Ni⟩ (U+27E8/U+27E9 angle brackets —
    mathematical symbols that translation engines universally preserve), then
    restores the originals after translation.
    """
    placeholders: dict = {}
    parts: list = []
    prev = 0
    for i, (s, e) in enumerate(spans):
        parts.append(text[prev:s])
        token = f'⟨N{i}⟩'
        placeholders[token] = text[s:e]
        parts.append(token)
        prev = e
    parts.append(text[prev:])

    translated = _raw_translate(''.join(parts), target_lang)
    if not translated:
        return ''

    for token, original in placeholders.items():
        translated = translated.replace(token, original)

    return translated.strip()


class Category(models.Model):
    name = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255, blank=True, default='')
    name_en = models.CharField(max_length=255, blank=True, default='')
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    image = models.ImageField(upload_to='categories/', null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_popular = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        # #N2 FIX: tarjima sinxron emas — commit'dan keyin fon thread'da
        # (Product.save bilan bir xil mantiq). Batafsil: products/tasks.py.
        needs_translation = bool(self.name and (not self.name_ru or not self.name_en))
        # Yangi yuklangan rasmni WebP'ga optimizatsiya qilamiz (sayt + mobil).
        apply_webp(self.image, max_dimension=800)
        super().save(*args, **kwargs)

        if needs_translation and self.pk:
            from .tasks import schedule_category_translation
            schedule_category_translation(self.pk)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['order', 'name']

    def __str__(self):
        full_path = [self.name]
        k = self.parent
        while k is not None:
            full_path.append(k.name)
            k = k.parent
        return ' -> '.join(full_path[::-1])

class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    name = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255, blank=True, default='')
    name_en = models.CharField(max_length=255, blank=True, default='')
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    description = models.TextField(blank=True, default='')
    description_ru = models.TextField(blank=True, default='')
    description_en = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    cost_price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock = models.PositiveIntegerField(default=0)

    # ── PHASE 4.2 — DO'KON POLKASI (variantsiz mahsulot uchun, faqat admin)
    #
    # Variantli mahsulotlarda har variantning o'z `shelf_location`'i bo'lishi
    # mumkin. Variantsiz mahsulotlarda esa polka shu yerda — Product darajasida.
    # Variant'da polka bo'sh bo'lsa — `ProductVariant.effective_shelf` shu
    # maydondan fallback qiladi (do'konda bir polkada turgan barcha variant
    # uchun bir marta yozish kifoya).
    shelf_location = models.CharField(
        max_length=20, blank=True, default='',
        help_text="Do'kondagi polka manzili (variantsiz mahsulot uchun yoki "
                  "barcha variantlar bir polkada bo'lsa default). "
                  "FAQAT admin paneli, POS va Buyurtmalarda ko'rinadi.",
    )

    is_active = models.BooleanField(default=True)
    is_popular = models.BooleanField(default=False)
    is_new = models.BooleanField(default=True)
    is_discount = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def effective_shelf(self) -> str:
        """O'z polka manzili. Variantsiz mahsulot uchun bevosita shu."""
        return self.shelf_location or ''

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            import uuid
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        if self.discount_price and self.discount_price > 0:
            self.is_discount = True
        else:
            self.is_discount = False
        
        # USD → So'm: FAQAT sotuv narxi va chegirma narxi kursdan hisoblanadi.
        # ─────────────────────────────────────────────────────────────────────
        # TANNARX (cost_price) ataYIN bu yerda hisoblanMAYDI — u SuperAdmin
        # kiritgan haqiqiy so'm xarid qiymati bo'lib qoladi va kursga bog'liq
        # emas. Foydalanuvchi (mijoz) tomonida kurs o'zgarsa, faqat narx va
        # chegirma narx o'zgaradi.
        # Eslatma: Bu faqat individual save() da ishlaydi. Global kurs
        # o'zgarganda AdminExchangeRateView bulk_update qiladi (faqat
        # price + discount_price).
        if self.price_usd:
            rate = GlobalSetting.get_usd_rate()
            self.price = (self.price_usd * rate).quantize(Decimal('1'))
            if self.discount_price_usd:
                self.discount_price = (self.discount_price_usd * rate).quantize(Decimal('1'))

        # ── #N2 FIX: tarjima ENDI SINXRON EMAS ───────────────────────────────
        # Avval bu yerda 4 ta Google Translate HTTP chaqirilardi — admin formani
        # bloklardi (Google sekin/ishlamasa muzlardi). Endi: bo'sh tarjima
        # maydonlari aniqlanadi, commit'dan keyin FON thread'da to'ldiriladi
        # (so'rov darrov qaytadi). Tarjima bo'sh bo'lsa serializer o'zbekchaga
        # fallback qiladi — sayt buzilmaydi. Batafsil: products/tasks.py.
        needs_translation = bool(
            (self.name and (not self.name_ru or not self.name_en))
            or (self.description and (not self.description_ru or not self.description_en))
        )

        super().save(*args, **kwargs)

        if needs_translation and self.pk:
            from .tasks import schedule_product_translation
            schedule_product_translation(self.pk)

    def __str__(self):
        return self.name

    class Meta:
        # ── #17 FIX: Product DB Indexes ───────────────────────────────────────
        #
        # MUAMMO:
        #   Product.objects.filter(is_active=True, is_discount=True) → FULL SCAN
        #   Product.objects.filter(is_active=True, is_new=True)       → FULL SCAN
        #   ProductListView, ProductDiscountListView, MainPageView — barchasi
        #   bitta yoki ikki bool field bo'yicha filter qiladi.
        #
        # YECHIM — Composite boolean indexes:
        #   (is_active, is_discount): ProductDiscountListView, MainPageView
        #   (is_active, is_new):      ProductNewListView, MainPageView
        #   (is_active, is_popular):  ProductPopularListView, MainPageView
        # ─────────────────────────────────────────────────────────────────────
        indexes = [
            # #17 FIX: is_active + is_discount (ProductDiscountListView)
            models.Index(
                fields=['is_active', 'is_discount'],
                name='product_active_discount_idx',
            ),
            # #17 FIX: is_active + is_new (ProductNewListView)
            models.Index(
                fields=['is_active', 'is_new'],
                name='product_active_new_idx',
            ),
            # #17 FIX: is_active + is_popular (ProductPopularListView)
            models.Index(
                fields=['is_active', 'is_popular'],
                name='product_active_popular_idx',
            ),
            # updated_at (ProductListView ORDER BY -updated_at)
            models.Index(fields=['-updated_at'], name='product_updated_at_idx'),
            # created_at (ProductNewListView ORDER BY -created_at)
            models.Index(fields=['-created_at'], name='product_created_at_idx'),
            # category_id + is_active (CategoryProductListView)
            models.Index(
                fields=['category', 'is_active'],
                name='product_category_active_idx',
            ),
        ]


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/gallery/')
    order = models.PositiveIntegerField(default=0)
    is_main = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def save(self, *args, **kwargs):
        apply_webp(self.image, max_dimension=1600)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product.name} Image"

class ProductVariant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    color = models.CharField(max_length=100, null=True, blank=True)
    color_hex = models.CharField(max_length=7, null=True, blank=True)
    image = models.ImageField(upload_to='products/variants/', null=True, blank=True)
    quality = models.CharField(max_length=100, null=True, blank=True)
    model = models.CharField(max_length=100, null=True, blank=True)
    size = models.CharField(max_length=100, null=True, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock = models.PositiveIntegerField(default=0)
    sku = models.CharField(max_length=100, null=True, blank=True)
    barcode = models.CharField(max_length=100, null=True, blank=True)

    # ── PHASE 4.0 — DO'KON POLKASI (faqat ADMIN uchun, foydalanuvchidan yashirin)
    #
    # MAQSAD: admin do'konda mahsulotni qaerdan olishni tez topishi uchun
    # variant uchun jismoniy polka manzili (masalan: "001", "A-3", "Sklad-2/15").
    # POS sotuv vaqtida, Buyurtmalar admin sahifasida ko'rinadi. Sayt va
    # mobil ilovaning oddiy foydalanuvchi qismida ATAYIN ko'rsatilmaydi —
    # public serializer'larda bu maydon `fields` ro'yxatida yo'q. Hatto
    # DevTools'da JSON kuzatuvchi ham bu ma'lumotni topa olmaydi.
    shelf_location = models.CharField(
        max_length=20, blank=True, default='',
        help_text="Do'kondagi jismoniy polka manzili (masalan: '001'). "
                  "FAQAT admin paneli va POS'da ko'rinadi.",
    )

    class Meta:
        ordering = ['position', 'id']

    @property
    def effective_shelf(self) -> str:
        """
        Real polka manzili — variant'niki yoki product'nikiga fallback.

        Mantiq (Phase 4.2):
          • Variant'da polka YOZILGAN bo'lsa — uni qaytaradi (override)
          • Variant'da polka bo'sh bo'lsa — Product.shelf_location'dan oladi
            (admin bir marta product darajasida yozsa, barcha variantlar
            shuni meros oladi — qulay UX)

        Foydalanuvchi (mijoz) tomonida bu hech qachon ko'rinmaydi —
        public `ProductVariantSerializer`'da bu field yo'q.
        """
        own = (self.shelf_location or '').strip()
        if own:
            return own
        # product'siz variant amalda bo'lmaydi (FK NOT NULL), lekin defensive
        if not self.product_id:
            return ''
        # N+1 ehtiyot: agar `self.product` allaqachon yuklangan bo'lsa, qo'shimcha
        # so'rov yo'q. Aks holda Django bitta SELECT qiladi (kichik narx — admin
        # POS bir necha mahsulot ko'rsatadi, prefetch_related'da hal qilinishi mumkin).
        return (self.product.shelf_location or '').strip()

    def save(self, *args, **kwargs):
        # USD → So'm: FAQAT sotuv narxi va chegirma narxi kursga bog'liq.
        # ─────────────────────────────────────────────────────────────────────
        # TANNARX (cost_price) ATAYIN bu yerga kiritilMAYDI: u SuperAdmin
        # kiritgan haqiqiy so'm xarid qiymati bo'lib qolishi shart. Kurs
        # o'zgarsa ham tannarx hech qachon qayta hisoblanmaydi — admin tovarni
        # qancha so'mga olganini aniq bilib turishi uchun. (Product.save() ham
        # aynan shunday ishlaydi.)
        if self.price_usd:
            rate = GlobalSetting.get_usd_rate()
            self.price = (self.price_usd * rate).quantize(Decimal('1'))
            if self.discount_price_usd:
                self.discount_price = (self.discount_price_usd * rate).quantize(Decimal('1'))
        apply_webp(self.image, max_dimension=1600)
        super().save(*args, **kwargs)

    def __str__(self):
        parts = [self.product.name]
        if self.color:
            parts.append(self.color)
        if self.quality:
            parts.append(self.quality)
        if self.size:
            parts.append(self.size)
        return " - ".join(parts)


class ProductVariantImage(models.Model):
    """Variant uchun bir nechta rasm (gallery)."""
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/variant-images/')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def save(self, *args, **kwargs):
        apply_webp(self.image, max_dimension=1600)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Image for {self.variant}"


# ─────────────────────────────────────────────────────────────────────────────
# COMPAT — Telefon Mos Kelish Matritsasi
# ─────────────────────────────────────────────────────────────────────────────

class PhoneBrand(models.Model):
    """Telefon brandi: Apple, Samsung, Xiaomi, Huawei..."""
    name     = models.CharField(max_length=100, unique=True)
    slug     = models.SlugField(max_length=100, unique=True, blank=True)
    logo     = models.ImageField(upload_to='brands/logos/', null=True, blank=True)
    is_popular = models.BooleanField(default=False)
    order    = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Telefon brandi'
        verbose_name_plural = 'Telefon brendlari'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class PhoneSeries(models.Model):
    """
    Telefon seriyasi: iPhone 15, Galaxy S24, Redmi Note 13...
    Bir brand ichida bir nechta seriya bo'lishi mumkin.
    """
    brand = models.ForeignKey(PhoneBrand, on_delete=models.CASCADE, related_name='series')
    name  = models.CharField(max_length=100)
    slug  = models.SlugField(max_length=220, unique=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Telefon seriyasi'
        verbose_name_plural = 'Telefon seriyalari'
        unique_together = ('brand', 'name')

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(f"{self.brand.name}-{self.name}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.brand.name} {self.name}"


class PhoneModel(models.Model):
    """
    Aniq telefon modeli: iPhone 15 Pro, iPhone 15 Pro Max, Galaxy S24 Ultra...
    Moslik matritsasining eng past darajasi.
    """
    series = models.ForeignKey(PhoneSeries, on_delete=models.CASCADE, related_name='models')
    name   = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Variant nomi: 'Pro', 'Pro Max', 'Ultra', 'Plus', yoki bo'sh (standart)"
    )
    slug       = models.SlugField(max_length=300, unique=True, blank=True)
    year       = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Chiqarilgan yil")
    is_popular = models.BooleanField(default=False)
    order      = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Telefon modeli'
        verbose_name_plural = 'Telefon modellari'
        unique_together = ('series', 'name')

    @property
    def full_name(self) -> str:
        parts = [self.series.brand.name, self.series.name]
        if self.name:
            parts.append(self.name)
        return ' '.join(parts)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(f"{self.series.brand.name}-{self.series.name}-{self.name}")
            slug, n = base, 1
            while PhoneModel.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name


class ProductCompatibility(models.Model):
    """
    Mahsulot ↔ Telefon modeli mos kelish bog'lanishi.
    notes: ixtiyoriy izoh ('Faqat eSIM versiyasi', 'A2342 uchun' kabi).
    """
    product     = models.ForeignKey(Product,    on_delete=models.CASCADE, related_name='compatibility')
    phone_model = models.ForeignKey(PhoneModel, on_delete=models.CASCADE, related_name='compatible_products')
    notes       = models.CharField(
        max_length=255, blank=True,
        help_text="Ixtiyoriy izoh: 'Faqat eSIM versiyasi', 'A2342 model uchun'"
    )

    class Meta:
        unique_together = ('product', 'phone_model')
        ordering = [
            'phone_model__series__brand__order',
            'phone_model__series__order',
            'phone_model__order',
            'phone_model__name',
        ]
        verbose_name = 'Moslik'
        verbose_name_plural = 'Moslik matritsasi'

    def __str__(self):
        return f"{self.product.name}  ←→  {self.phone_model.full_name}"


class HomeBanner(models.Model):
    title = models.CharField(max_length=160)
    subtitle = models.CharField(max_length=320, blank=True, default='')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name='home_banners')
    original_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    product_image = models.ImageField(upload_to='banners/products/', null=True, blank=True)
    background_image = models.ImageField(upload_to='banners/backgrounds/', null=True, blank=True)
    background_color = models.CharField(max_length=32, default='#111827')
    accent_color = models.CharField(max_length=32, default='#007a4d')
    button_label = models.CharField(max_length=80, default="Mahsulotni ko'rish")
    button_url = models.CharField(max_length=255, blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', '-updated_at', '-id']

    def clean(self):
        if self.original_price and self.discount_price and self.discount_price >= self.original_price:
            raise ValidationError({
                'discount_price': "Chegirma narxi asl narxdan kichik bo'lishi kerak."
            })
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValidationError({
                'end_date': "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak."
            })

    def save(self, *args, **kwargs):
        # Banner rasmlari keng (full-width) → 1920px gacha, WebP.
        apply_webp(self.product_image, max_dimension=1920)
        apply_webp(self.background_image, max_dimension=1920)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


from django.conf import settings

class Favorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='favorites'
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='favorited_by'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'product')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.phone} - {self.product.name}"

