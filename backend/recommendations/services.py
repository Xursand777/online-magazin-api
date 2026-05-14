import re
import uuid
from collections import defaultdict

from django.db.models import Q
from django.utils import timezone

from products.models import Product
from .models import RecommendationEvent, RecommendationProfile


TOKEN_RE = re.compile(r'[\w-]+', re.UNICODE)
STOPWORDS = {
    'va', 'uchun', 'bilan', 'eng', 'yangi', 'ham', 'bor', 'yoki',
    'the', 'for', 'with', 'and', 'pro', 'max',
}
EVENT_WEIGHTS = {
    'search': 2.0,
    'view': 3.0,
    'cart': 5.0,
    'order': 7.0,
}
PRICE_BUCKETS = [
    (0, 500_000, '0-500k'),
    (500_000, 2_000_000, '500k-2m'),
    (2_000_000, 5_000_000, '2m-5m'),
    (5_000_000, 10_000_000, '5m-10m'),
    (10_000_000, 20_000_000, '10m-20m'),
    (20_000_000, None, '20m+'),
]


def tokenize_text(value):
    if not value:
        return []

    seen = set()
    tokens = []
    for token in TOKEN_RE.findall(value.lower()):
        normalized = token.strip('-_')
        if len(normalized) < 2 or normalized in STOPWORDS:
            continue
        if normalized not in seen:
            tokens.append(normalized)
            seen.add(normalized)
    return tokens


def get_effective_price(product):
    if getattr(product, 'is_discount', False) and getattr(product, 'discount_price', None):
        return float(product.discount_price)
    return float(product.price)


def get_price_bucket(price):
    for lower, upper, label in PRICE_BUCKETS:
        if upper is None and price >= lower:
            return label
        if lower <= price < upper:
            return label
    return PRICE_BUCKETS[-1][2]


def trim_weight_map(values, limit):
    ordered = sorted(values.items(), key=lambda item: (-float(item[1]), item[0]))
    return {key: round(float(weight), 4) for key, weight in ordered[:limit]}


def merge_search_terms(primary_terms, secondary_terms):
    merged = {}

    for entry in primary_terms + secondary_terms:
        term = (entry or {}).get('term')
        if not term:
            continue
        existing = merged.get(term, {'term': term, 'weight': 0.0, 'last_seen': entry.get('last_seen')})
        existing['weight'] = round(float(existing.get('weight', 0.0)) + float(entry.get('weight', 0.0)), 4)
        existing['last_seen'] = max(existing.get('last_seen') or '', entry.get('last_seen') or '')
        merged[term] = existing

    return sorted(
        merged.values(),
        key=lambda item: (-float(item.get('weight', 0.0)), item.get('last_seen') or ''),
        reverse=False,
    )[:12]


def ensure_recommendation_profile(request, guest_session_id=None):
    if request.user.is_authenticated:
        profile, _ = RecommendationProfile.objects.get_or_create(user=request.user)
        return profile, None

    guest_session_id = guest_session_id or request.headers.get('X-Guest-Session-Id')
    if not guest_session_id:
        guest_session_id = str(uuid.uuid4())

    profile, _ = RecommendationProfile.objects.get_or_create(guest_session_id=guest_session_id)
    return profile, guest_session_id


def recommendation_headers(guest_session_id):
    if guest_session_id:
        return {'X-Guest-Session-Id': guest_session_id}
    return {}


def _bump_weight_map(values, key, delta):
    if not key:
        return values
    updated = dict(values or {})
    updated[str(key)] = round(float(updated.get(str(key), 0.0)) + float(delta), 4)
    return updated


def _update_search_terms(profile, query, base_weight):
    normalized_query = ' '.join((query or '').lower().split())
    if not normalized_query:
        return

    current_terms = list(profile.search_terms or [])
    merged = merge_search_terms(
        current_terms,
        [{
            'term': normalized_query,
            'weight': round(base_weight, 4),
            'last_seen': timezone.now().isoformat(),
        }],
    )
    profile.search_terms = merged


def _apply_product_signal(profile, product, base_weight, variant=None):
    profile.product_scores = trim_weight_map(
        _bump_weight_map(profile.product_scores, product.id, base_weight * 1.5),
        20,
    )

    if product.category_id:
        profile.category_scores = trim_weight_map(
            _bump_weight_map(profile.category_scores, product.category_id, base_weight * 1.2),
            12,
        )

    keyword_scores = dict(profile.keyword_scores or {})
    token_sources = [product.name, getattr(product.category, 'name', '')]
    if product.description:
        token_sources.append(product.description[:180])
    if variant:
        token_sources.extend([variant.color, variant.model, variant.size, variant.sku])

    for token in tokenize_text(' '.join(filter(None, token_sources))):
        keyword_scores[token] = round(float(keyword_scores.get(token, 0.0)) + (base_weight * 0.9), 4)

    profile.keyword_scores = trim_weight_map(keyword_scores, 30)

    bucket = get_price_bucket(get_effective_price(product))
    profile.price_bucket_scores = trim_weight_map(
        _bump_weight_map(profile.price_bucket_scores, bucket, base_weight * 0.8),
        8,
    )


def record_search_event(request, query, guest_session_id=None):
    normalized_query = ' '.join((query or '').split())
    should_track = normalized_query and len(normalized_query) >= 2
    if not should_track:
        return None

    profile, guest_session_id = ensure_recommendation_profile(request, guest_session_id=guest_session_id)
    base_weight = EVENT_WEIGHTS['search']

    RecommendationEvent.objects.create(
        profile=profile,
        user=request.user if request.user.is_authenticated else None,
        guest_session_id=guest_session_id,
        event_type='search',
        query_text=normalized_query,
        weight=base_weight,
    )

    _update_search_terms(profile, normalized_query, base_weight)

    keyword_scores = dict(profile.keyword_scores or {})
    for token in tokenize_text(normalized_query):
        keyword_scores[token] = round(float(keyword_scores.get(token, 0.0)) + (base_weight * 1.1), 4)
    profile.keyword_scores = trim_weight_map(keyword_scores, 30)
    profile.save(update_fields=['search_terms', 'keyword_scores', 'last_activity_at'])

    return guest_session_id


def record_product_event(request, product, event_type, variant=None, guest_session_id=None):
    if event_type not in EVENT_WEIGHTS:
        return None

    profile, guest_session_id = ensure_recommendation_profile(request, guest_session_id=guest_session_id)
    base_weight = EVENT_WEIGHTS[event_type]

    RecommendationEvent.objects.create(
        profile=profile,
        user=request.user if request.user.is_authenticated else None,
        guest_session_id=guest_session_id,
        event_type=event_type,
        product=product,
        variant=variant,
        category=product.category,
        weight=base_weight,
    )

    _apply_product_signal(profile, product, base_weight, variant=variant)
    profile.save(
        update_fields=[
            'product_scores',
            'category_scores',
            'keyword_scores',
            'price_bucket_scores',
            'last_activity_at',
        ]
    )
    return guest_session_id


def merge_guest_profile_into_user(user, guest_session_id):
    if not guest_session_id:
        return

    guest_profile = RecommendationProfile.objects.filter(guest_session_id=guest_session_id).first()
    if not guest_profile:
        return

    user_profile, _ = RecommendationProfile.objects.get_or_create(user=user)

    user_profile.search_terms = merge_search_terms(user_profile.search_terms or [], guest_profile.search_terms or [])

    for field_name in ('keyword_scores', 'category_scores', 'product_scores', 'price_bucket_scores'):
        merged_values = dict(getattr(user_profile, field_name) or {})
        for key, value in (getattr(guest_profile, field_name) or {}).items():
            merged_values[str(key)] = round(float(merged_values.get(str(key), 0.0)) + float(value), 4)
        setattr(user_profile, field_name, trim_weight_map(merged_values, 30 if field_name == 'keyword_scores' else 20))

    user_profile.save()

    guest_profile.events.update(profile=user_profile, user=user, guest_session_id=None)
    guest_profile.delete()


def build_personalized_recommendations(request, limit=8):
    user_profile = None
    if request.user.is_authenticated:
        user_profile = RecommendationProfile.objects.filter(user=request.user).first()
    else:
        guest_session_id = request.headers.get('X-Guest-Session-Id')
        if guest_session_id:
            user_profile = RecommendationProfile.objects.filter(guest_session_id=guest_session_id).first()

    if not user_profile:
        return {
            'products': list(Product.objects.filter(is_active=True).select_related('category').prefetch_related('images').order_by('-is_popular', '-is_new', '-updated_at')[:limit]),
            'title': 'Siz uchun tavsiya',
            'description': "Ommabop va yangi mahsulotlar to'plami.",
        }

    keyword_scores = dict(user_profile.keyword_scores or {})
    category_scores = {int(key): float(value) for key, value in (user_profile.category_scores or {}).items()}
    product_scores = {int(key): float(value) for key, value in (user_profile.product_scores or {}).items()}
    price_scores = dict(user_profile.price_bucket_scores or {})

    top_keywords = sorted(keyword_scores.items(), key=lambda item: (-float(item[1]), item[0]))[:8]
    top_category_ids = [category_id for category_id, _ in sorted(category_scores.items(), key=lambda item: -item[1])[:6]]
    top_product_ids = [product_id for product_id, _ in sorted(product_scores.items(), key=lambda item: -item[1])[:6]]

    candidate_filter = Q()
    if top_category_ids:
        candidate_filter |= Q(category_id__in=top_category_ids)
    if top_product_ids:
        related_category_ids = list(
            Product.objects.filter(id__in=top_product_ids)
            .exclude(category_id__isnull=True)
            .values_list('category_id', flat=True)
        )
        if related_category_ids:
            candidate_filter |= Q(category_id__in=related_category_ids)
    for keyword, _ in top_keywords[:5]:
        candidate_filter |= (
            Q(name__icontains=keyword)
            | Q(description__icontains=keyword)
            | Q(category__name__icontains=keyword)
            | Q(slug__icontains=keyword)
        )

    if candidate_filter:
        candidates = list(
            Product.objects.filter(is_active=True)
            .select_related('category')
            .prefetch_related('images')
            .filter(candidate_filter)
            .order_by('-is_popular', '-updated_at', 'name')
            .distinct()[:80]
        )
    else:
        candidates = list(
            Product.objects.filter(is_active=True)
            .select_related('category')
            .prefetch_related('images')
            .order_by('-is_popular', '-updated_at', 'name')[:80]
        )

    scored_candidates = []
    for product in candidates:
        score = 0.0
        searchable_text = ' '.join(
            filter(
                None,
                [product.name.lower(), (product.description or '').lower(), getattr(product.category, 'name', '').lower()],
            )
        )

        score += product_scores.get(product.id, 0.0) * 1.8
        score += category_scores.get(product.category_id, 0.0) * 1.6

        for keyword, weight in top_keywords:
            if keyword in searchable_text:
                score += float(weight) * 1.4

        score += price_scores.get(get_price_bucket(get_effective_price(product)), 0.0) * 0.7
        score += 0.4 if product.is_popular else 0.0
        score += 0.2 if product.is_new else 0.0

        if score > 0:
            scored_candidates.append((score, product))

    scored_candidates.sort(key=lambda item: (-item[0], item[1].name.lower()))
    recommended_products = [product for _, product in scored_candidates[:limit]]

    if not recommended_products:
        recommended_products = list(
            Product.objects.filter(is_active=True).select_related('category').prefetch_related('images').order_by('-is_popular', '-updated_at')[:limit]
        )

    top_search_term = (user_profile.search_terms or [{}])[0].get('term') if user_profile.search_terms else None
    top_keywords_for_text = [keyword for keyword, _ in top_keywords[:3]]

    if top_search_term:
        title = "Siz qidirganlarga o'xshash"
        description = f'"{top_search_term}" va oxirgi harakatlaringiz asosida tanlandi.'
    elif top_keywords_for_text:
        title = 'Qiziqishingizga mos tavsiyalar'
        description = ', '.join(top_keywords_for_text) + " bo'yicha tavsiyalar."
    else:
        title = 'Siz uchun tavsiya'
        description = "Qiziqishingizga mos mahsulotlar."

    return {
        'products': recommended_products,
        'title': title,
        'description': description,
    }
