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


def product_similarity_score(source, candidate, source_brand_tokens, source_model_tokens, source_price):
    candidate_tokens = product_tokens(candidate)
    candidate_brand_tokens = detect_brand_tokens(candidate_tokens, tokenize_product_text(candidate.name, candidate.slug))

    score = category_similarity_score(source, candidate)

    brand_overlap = source_brand_tokens & (candidate_tokens | candidate_brand_tokens)
    if brand_overlap:
        score += 95 + min(len(brand_overlap), 3) * 12

    model_overlap = source_model_tokens & candidate_tokens
    if model_overlap:
        score += min(72, len(model_overlap) * 16)

    score += price_similarity_score(source_price, effective_price(candidate))

    if candidate.is_popular:
        score += 8
    if candidate.is_new:
        score += 5
    if candidate.is_discount:
        score += 5
    if candidate.stock > 0:
        score += 4

    return score


def build_similar_products(source_product, limit=10):
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

    candidate_filter = Q()
    has_candidate_filter = False

    if source_product.category_id:
        category_q = Q(category_id=source_product.category_id) | Q(category__parent_id=source_product.category_id)
        if source_product.category and source_product.category.parent_id:
            category_q |= Q(category__parent_id=source_product.category.parent_id)
        candidate_filter |= category_q
        has_candidate_filter = True

    search_tokens = list(source_brand_tokens | {token for token in source_model_tokens if len(token) >= 3})[:12]
    for token in search_tokens:
        candidate_filter |= (
            Q(name__icontains=token)
            | Q(slug__icontains=token)
            | Q(description__icontains=token)
            | Q(category__name__icontains=token)
        )
        has_candidate_filter = True

    queryset = (
        Product.objects.filter(is_active=True, stock__gt=0)
        .exclude(pk=source_product.pk)
        .select_related("category", "category__parent")
        .prefetch_related("images", "variants")
    )
    if has_candidate_filter:
        queryset = queryset.filter(candidate_filter).distinct()

    source_price = effective_price(source_product)
    scored_products = []
    seen_ids = set()

    for candidate in queryset:
        score = product_similarity_score(
            source_product,
            candidate,
            source_brand_tokens,
            source_model_tokens,
            source_price,
        )
        if score > 0:
            scored_products.append((score, candidate))
            seen_ids.add(candidate.id)

    if len(scored_products) < limit:
        fallback_queryset = (
            Product.objects.filter(is_active=True, stock__gt=0)
            .exclude(pk=source_product.pk)
            .exclude(pk__in=seen_ids)
            .select_related("category", "category__parent")
            .prefetch_related("images", "variants")
            .order_by("-is_popular", "-is_new", "-updated_at")[: limit * 3]
        )
        for candidate in fallback_queryset:
            score = product_similarity_score(
                source_product,
                candidate,
                source_brand_tokens,
                source_model_tokens,
                source_price,
            )
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
