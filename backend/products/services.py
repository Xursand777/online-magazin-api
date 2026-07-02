import re
from decimal import Decimal

from django.db.models import Q

from .models import Product


TOKEN_RE = re.compile(r"[0-9a-zA-Zа-яА-ЯёЁ]+")

SIMILAR_STOPWORDS = {
    "va",
    "yoki",
    "uchun",
    "bilan",
    "the",
    "and",
    "for",
    "of",
    "in",
    "with",
    "yangi",
    "mahsulot",
    "mahsulotlar",
    "original",
    "orginal",
    "service",
    "frame",
}

# Model "suffiks" so'zlari — deyarli hamma joyda uchraydi ("Pro", "Max", "HD"…).
# Variant o'xshashligida BULAR YAKKA O'ZI mos kelsa — bu o'xshashlik EMAS
# ("Televizor ... Pro" ≠ "iPhone 16 Pro Max"). Faqat MODEL RAQAMI ("16") yoki
# umumiy bo'lmagan so'z bilan birga bo'lsagina hisobga olinadi.
GENERIC_MODEL_WORDS = {
    "pro", "max", "plus", "ultra", "mini", "lite", "se", "air", "note", "edge",
    "neo", "hd", "fhd", "uhd", "2k", "4k", "5g", "4g", "lte", "gb", "tb", "mm",
    "inch", "w",
}

GENERIC_PRODUCT_WORDS = {
    "telefon",
    "telefonlar",
    "smartfon",
    "smartphone",
    "quloqchin",
    "naushnik",
    "televizor",
    "tv",
    "noutbuk",
    "planshet",
    "batareya",
    "displey",
    "steklo",
    "oyna",
    "case",
}

BRAND_ALIAS_GROUPS = (
    {"iphone", "apple"},
    {"xiaomi", "redmi", "poco", "mi"},
    {"samsung", "galaxy"},
    {"marshall"},
    {"logitech"},
    {"lg"},
    {"artel"},
    {"sony"},
    {"huawei", "honor"},
    {"realme"},
    {"oppo"},
    {"vivo"},
    {"lenovo"},
    {"asus"},
    {"hp"},
    {"acer"},
)


def tokenize_product_text(*parts):
    tokens = []
    for part in parts:
        if part is None:
            continue
        tokens.extend(TOKEN_RE.findall(str(part).lower()))
    return [token for token in tokens if len(token) > 1 and token not in SIMILAR_STOPWORDS]


def category_tokens(category):
    if not category:
        return set()
    return set(tokenize_product_text(str(category), category.name, category.slug))


def product_tokens(product):
    variant_parts = []
    if hasattr(product, "_prefetched_objects_cache") and "variants" in product._prefetched_objects_cache:
        variants = product.variants.all()
        for variant in variants:
            variant_parts.extend([variant.color, variant.model, variant.size, variant.sku])

    return set(
        tokenize_product_text(
            product.name,
            product.slug,
            product.description,
            product.category.name if product.category else None,
            *variant_parts,
        )
    )


def detect_brand_tokens(tokens, ordered_tokens):
    detected = set()
    token_set = set(tokens)
    for aliases in BRAND_ALIAS_GROUPS:
        if token_set & aliases:
            detected.update(aliases)

    if detected:
        return detected

    for token in ordered_tokens:
        if token not in GENERIC_PRODUCT_WORDS and not token.isdigit():
            return {token}
    return set()


def effective_price(product):
    price = product.discount_price if product.discount_price else product.price
    return Decimal(price or 0)


def price_similarity_score(source_price, candidate_price):
    if source_price <= 0 or candidate_price <= 0:
        return 0

    distance = abs(candidate_price - source_price) / source_price
    if distance <= Decimal("0.12"):
        return 28
    if distance <= Decimal("0.25"):
        return 20
    if distance <= Decimal("0.45"):
        return 12
    if distance <= Decimal("0.70"):
        return 6
    return 0


def category_similarity_score(source, candidate):
    if not source.category_id or not candidate.category_id:
        return 0

    if source.category_id == candidate.category_id:
        return 75

    source_parent_id = source.category.parent_id if source.category else None
    candidate_parent_id = candidate.category.parent_id if candidate.category else None
    if source_parent_id and source_parent_id == candidate_parent_id:
        return 42
    if source_parent_id and source_parent_id == candidate.category_id:
        return 34
    if candidate_parent_id and candidate_parent_id == source.category_id:
        return 34
    return 0


def product_similarity_score(
    source, candidate, source_brand_tokens, source_model_tokens, source_price,
    variant_tokens=None,
):
    candidate_tokens = product_tokens(candidate)  # candidate variant model/size/color ham kiradi
    candidate_brand_tokens = detect_brand_tokens(candidate_tokens, tokenize_product_text(candidate.name, candidate.slug))

    category_score = category_similarity_score(source, candidate)

    # Brend — TENGLIK BUZUVCHI (booster), YAKKA O'ZI "o'xshash" qilmaydi.
    # Aks holda bitta brendning butun kataliogi (masalan iPhone himoya shishasiga
    # MacBook) "o'xshash" bo'lib chiqardi. Shuning uchun vazni kichik va u
    # o'zicha malakaga (qualification) o'tkazmaydi.
    brand_overlap = source_brand_tokens & (candidate_tokens | candidate_brand_tokens)
    brand_score = (30 + min(len(brand_overlap), 3) * 6) if brand_overlap else 0

    # Model tokenlari (brend/kategoriya/generic'siz farqlovchi so'zlar) mos kelishi.
    model_overlap = source_model_tokens & candidate_tokens
    model_score = min(60, len(model_overlap) * 16) if model_overlap else 0

    # Joriy TANLANGAN VARIANT modeliga mos kelish — eng kuchli signal.
    # LEKIN faqat "pro"/"max"/"hd" kabi umumiy suffiks mos kelsa hisoblanmaydi:
    # eng kamida MODEL RAQAMI ("16") yoki umumiy bo'lmagan so'z mos kelishi shart
    # (aks holda "...Pro..." nomli har qanday tovar chiqib qolardi).
    variant_score = 0
    if variant_tokens:
        v_overlap = variant_tokens & candidate_tokens
        anchor = {t for t in v_overlap if t.isdigit() or t not in GENERIC_MODEL_WORDS}
        if anchor:
            variant_score = 55 + min(len(v_overlap), 4) * 18

    # ── MALAKA (qualification) — HAQIQIY o'xshashlik bormi? ──────────────────
    # Kategoriya, model YOKI variant mosligi — shulardan biri BO'LISHI SHART.
    # Brend YAKKA o'zi yetarli EMAS (booster). Generic bonuslar (ommabop/yangi)
    # aloqasiz mahsulotni O'XSHASH qila olmaydi. Aks holda butunlay boshqa
    # mahsulotlar chiqib qolardi.
    if not (category_score > 0 or model_score > 0 or variant_score > 0):
        return 0

    total = category_score + brand_score + model_score + variant_score
    total += price_similarity_score(source_price, effective_price(candidate))
    if candidate.is_popular:
        total += 8
    if candidate.is_new:
        total += 5
    if candidate.is_discount:
        total += 5
    if candidate.stock > 0:
        total += 4

    return total


def build_similar_products(source_product, variant=None, limit=24):
    """
    O'xshash mahsulotlar — kategoriya + brend + model + NARX + (tanlangan bo'lsa)
    VARIANT modeliga ko'ra. FAQAT haqiqatan o'xshash mahsulotlar (relevance > 0)
    qaytadi — butunlay boshqa mahsulotlar HECH QACHON qo'shilmaydi.

    `variant` berilsa (mahsulot sahifasida variant tanlangan), o'sha variant
    modeliga (masalan "16 Pro Max") mos mahsulotlar yuqoriga chiqadi va qidiruv
    nomzodlariga variant modeli bilan mos tovarlar ham qo'shiladi.
    """
    ordered_source_tokens = tokenize_product_text(
        source_product.name,
        source_product.slug,
        source_product.description,
    )
    source_token_set = product_tokens(source_product)
    source_brand_tokens = detect_brand_tokens(source_token_set, ordered_source_tokens)
    source_category_tokens = category_tokens(source_product.category)
    source_model_tokens = {
        token
        for token in source_token_set - source_brand_tokens - source_category_tokens
        if token not in GENERIC_PRODUCT_WORDS and len(token) >= 2
    }

    # ── Tanlangan variant tokenlari (model/o'lcham/sifat) ────────────────────
    variant_tokens = set()
    if variant is not None:
        variant_tokens = {
            token
            for token in tokenize_product_text(variant.model, variant.size, variant.quality)
            if token not in GENERIC_PRODUCT_WORDS and len(token) >= 2
        }

    candidate_filter = Q()
    has_candidate_filter = False

    if source_product.category_id:
        category_q = Q(category_id=source_product.category_id) | Q(category__parent_id=source_product.category_id)
        if source_product.category and source_product.category.parent_id:
            category_q |= Q(category__parent_id=source_product.category.parent_id)
        candidate_filter |= category_q
        has_candidate_filter = True

    # Qidiruv tokenlari — brend + model + VARIANT modelining FARQLOVCHI tokenlari
    # (raqam yoki umumiy bo'lmagan so'z; "pro"/"max" yakka o'zi qidirmaydi —
    # aks holda "...Pro..." nomli har qanday tovar nomzod bo'lib, keraksiz
    # skanlashni oshirardi). Variant modeli mos mahsulotlar boshqa kategoriyada
    # bo'lsa ham nomzod bo'ladi.
    distinctive_variant_tokens = {
        t for t in variant_tokens
        if (t.isdigit() or t not in GENERIC_MODEL_WORDS) and len(t) >= 2
    }
    search_tokens = list(
        source_brand_tokens
        | {t for t in source_model_tokens if len(t) >= 3}
        | distinctive_variant_tokens
    )[:16]
    for token in search_tokens:
        candidate_filter |= (
            Q(name__icontains=token)
            | Q(slug__icontains=token)
            | Q(description__icontains=token)
            | Q(category__name__icontains=token)
            | Q(variants__model__icontains=token)
            | Q(variants__size__icontains=token)
        )
        has_candidate_filter = True

    # Kategoriya ham, token ham yo'q — o'xshatib bo'lmaydi (bo'sh natija honest).
    if not has_candidate_filter:
        return []

    # Nomzodlar (ommaboplik bo'yicha cheklangan — katta kategoriyada ham tez).
    queryset = (
        Product.objects.filter(is_active=True)
        .exclude(pk=source_product.pk)
        .filter(candidate_filter)
        .select_related("category", "category__parent")
        .prefetch_related("images", "variants", "variants__images")
        .distinct()
        .order_by("-is_popular", "-is_new", "-updated_at")[:400]
    )

    source_price = effective_price(source_product)
    scored_products = []

    for candidate in queryset:
        score = product_similarity_score(
            source_product,
            candidate,
            source_brand_tokens,
            source_model_tokens,
            source_price,
            variant_tokens=variant_tokens,
        )
        # score == 0 → relevance yo'q (o'xshash EMAS) → tashlab yuboriladi.
        # Padding YO'Q: boshqa (aloqasiz) mahsulotlar bilan to'ldirilmaydi.
        if score > 0:
            scored_products.append((score, candidate))

    scored_products.sort(
        key=lambda item: (
            -item[0],
            -int(item[1].is_popular),
            -int(item[1].is_new),
            item[1].name.lower(),
        )
    )
    return [product for _, product in scored_products[:limit]]
