import random
import re

from django.db.models import Case, IntegerField, Min, Max, Q, Sum, Value, When
from .serializers import absolute_media_url
from django.utils import timezone
from rest_framework import generics, views, status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from users.permissions import IsStaffMember, IsAdminOrAbove, IsSuperAdmin, CanAccessStockReport
from recommendations.services import (
    build_personalized_recommendations,
    recommendation_headers,
    record_product_event,
    record_search_event,
)
from django.shortcuts import get_object_or_404
from .serializers import (
    CategorySerializer, ProductListSerializer, ProductDetailSerializer, ProductSearchSerializer,
    AdminCategorySerializer, AdminHomeBannerSerializer, AdminProductSerializer, HomeBannerSerializer,
    PhoneBrandSerializer,
    CompatibilityWriteSerializer, CompatibilityBulkSeriesSerializer, ProductCompatibilityReadSerializer,
)
from .services import build_similar_products
from recommendations.models import RecommendationEvent
from .models import (
    Category, HomeBanner, Product, GlobalSetting, ProductVariant,
    PhoneBrand, PhoneSeries, PhoneModel, ProductCompatibility,
)
from decimal import Decimal


def build_product_search_filter(query: str) -> Q:
    """
    SQLite va boshqa DB lar uchun Q-filter quradi.
    PostgreSQL uchun ProductSearchView alohida _apply_postgres_fts() ishlatadi.

    Ko'p so'zli so'rov mantig'i — NIMA O'ZGARDI:
      Eski (OR mantiqi):
        "samsung galaxy" → name LIKE '%samsung%' OR name LIKE '%galaxy%'
        Natija: "Samsung Printer" ham chiqadi ("samsung" so'zi bor).

      Yangi (AND mantiqi):
        "samsung galaxy" → to'liq ibora moslik
                          OR (name LIKE '%samsung%' AND name LIKE '%galaxy%')
        Natija: faqat ikkala so'z bir vaqtda bo'lgan mahsulotlar.

    Bitta so'z: avvalgidek — name + description + slug + category icontains.
    Ko'p so'z: barcha tokenlar mahsulot nomida mavjud bo'lishi kerak (AND).
    """
    query = (query or '').strip()
    if not query:
        return Q(pk__in=[])

    # Raqamli so'rov: ID bo'yicha qidirish
    if query.isdigit():
        return Q(id=int(query)) | Q(name__icontains=query)

    # To'liq ibora — har doim qidiriladi (aniq mos kelish)
    phrase_filter = (
        Q(name__icontains=query)
        | Q(slug__icontains=query)
        | Q(category__name__icontains=query)
    )

    # 2+ belgidan iborat tokenlar (qisqa prefikslar kerak emas: "a", "da"…)
    tokens = [t for t in re.split(r'\s+', query) if len(t) >= 2]

    if len(tokens) <= 1:
        # Bitta so'z: tavsifda ham qidirish
        return phrase_filter | Q(description__icontains=query)

    # Ko'p so'z: nomda BARCHA tokenlar bo'lishi kerak (AND)
    # "samsung galaxy s24" → name contains 'samsung' AND 'galaxy' AND 's24'
    name_all_tokens = Q()
    for token in tokens:
        name_all_tokens &= Q(name__icontains=token)

    return phrase_filter | name_all_tokens


def _apply_postgres_fts(qs, query: str):
    """
    PostgreSQL'da SearchVector + SearchRank orqali to'liq matn qidiruvini qo'llaydi.

    Nima uchun 'simple' konfiguratsiya:
      Uzbek/Rus/Ingliz tillarida stemming kerak emas — 'simple' oddiy
      tokenizatsiya va kichik harflarga o'tkazish bilan cheklanadi.
      'english' config ishlatilsa: "phones" → "phone" (kesish) yaxshi ishlaydi,
      lekin "Galaxy" → "galaxi" qilishi mumkin — mahsulot nomlarini buzadi.

    Ikki bosqichli filter:
      1. fts_rank > 0.0  — to'liq matn mosligi (indeksdan foydalanadi)
      2. name icontains  — qisman moslash uchun (avtoto'ldirish: "iPh" → "iPhone")

    Production'da GIN index qo'shish (bir marta, admin yoki migration orqali):
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX CONCURRENTLY idx_products_fts
        ON products_product
        USING gin(
          to_tsvector('simple', name || ' ' || COALESCE(description, ''))
        );
    Shundan so'ng SearchVector so'rovlari O(log n) ga tushadi.
    """
    from django.contrib.postgres.search import SearchVector, SearchQuery, SearchRank

    sv = (
        SearchVector('name',        weight='A', config='simple') +
        SearchVector('description', weight='B', config='simple')
    )
    sq = SearchQuery(query, config='simple')

    return (
        qs
        .annotate(fts_rank=SearchRank(sv, sq))
        .filter(
            Q(fts_rank__gt=0.0) |   # FTS mosligi
            Q(name__icontains=query) # Qisman moslash (prefiksi bilan)
        )
        .distinct()
    )


def active_home_banners():
    now = timezone.now()
    return (
        HomeBanner.objects.filter(is_active=True)
        .filter(Q(start_date__isnull=True) | Q(start_date__lte=now))
        .filter(Q(end_date__isnull=True) | Q(end_date__gte=now))
        .select_related('product')
        .prefetch_related('product__images')
        .order_by('order', '-updated_at', '-id')
    )


class AdminResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

class SectionPagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = 'page_size'
    max_page_size = 100

# ─────────────────────────────────────────────────────────────────────────────
# TEZKOR QIDIRUV CHEGARASI — ProductSearchView (autocomplete / dropdown)
# ─────────────────────────────────────────────────────────────────────────────
# ProductSearchView'da pagination_class=None (dropdown uchun oddiy ro'yxat).
# Cheklovsiz bo'lsa: 1M mahsulotli katalogda "telefon" so'zi 50 000 qatorga
# mos kelishi mumkin — barchasi seriallanadi, response megabaytlarga yetadi.
#
# ProductListView (?q=...) esa standart DRF sahifalashdan foydalanadi →
# u allaqachon cheklangan. Bu qiymat FAQAT tezkor qidiruv uchun.
_MAX_SEARCH_RESULTS = 50

class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.filter(parent=None, is_active=True) # Only top level categories as tree roots
    serializer_class = CategorySerializer
    permission_classes = (AllowAny,)

class ProductListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)

    def get_queryset(self):
        qs = Product.objects.filter(is_active=True).select_related('category').prefetch_related('images').order_by('-updated_at', 'name')
        
        # Filtering
        category_id = self.request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)
            
        search_query = self.request.query_params.get('q')
        if search_query:
            qs = qs.filter(build_product_search_filter(search_query))
            
        discount = self.request.query_params.get('discount')
        if discount == 'true':
            qs = qs.filter(is_discount=True)
            
        new_items = self.request.query_params.get('new')
        if new_items == 'true':
            qs = qs.filter(is_new=True)
            
        popular = self.request.query_params.get('popular')
        if popular == 'true':
            qs = qs.filter(is_popular=True)

        # Moslik filtri: ?compatible_with=iphone-15-pro
        compatible_with = self.request.query_params.get('compatible_with')
        if compatible_with:
            qs = qs.filter(compatibility__phone_model__slug=compatible_with).distinct()

        return qs

class ProductSearchView(generics.ListAPIView):
    serializer_class = ProductSearchSerializer
    permission_classes = (AllowAny,)
    pagination_class = None

    def list(self, request, *args, **kwargs):
        track_requested = str(request.query_params.get('track', 'false')).lower() == 'true'
        guest_session_id = None
        if track_requested:
            guest_session_id = record_search_event(request, request.query_params.get('q'))
        response = super().list(request, *args, **kwargs)
        for header, value in recommendation_headers(guest_session_id).items():
            response[header] = value
        return response

    def get_queryset(self):
        """
        Qidiruv so'rovi: PostgreSQL'da SearchVector+SearchRank (FTS),
        SQLite'da optimallashtirilgan icontains bilan AND-mantig'i.

        Tartiblash ustuvorligi (ikkala DB uchun):
          1. exact_match  — aniq mos kelish (iexact)
          2. starts_match — boshidan boshlanadigan mos kelish (istartswith)
          3. PostgreSQL: fts_rank (SearchRank) — tegishlilik ball
             SQLite:     contains_match (icontains) — oddiy mavjudlik
          4. is_popular, is_new, name — teng ball bo'lganda
        """
        from django.db import connection

        search_query = (self.request.query_params.get('q') or '').strip()
        if not search_query:
            return Product.objects.none()

        # Aniq mos kelish annotatsiyalari — har ikkala DB'da bir xil
        exact_whens = [
            When(name__iexact=search_query,          then=Value(5)),
            When(slug__iexact=search_query,           then=Value(4)),
            When(category__name__iexact=search_query, then=Value(3)),
        ]
        if search_query.isdigit():
            exact_whens.insert(0, When(id=int(search_query), then=Value(6)))

        base_qs = (
            Product.objects.filter(is_active=True)
            .select_related('category')
            .prefetch_related('images')
        )

        # ── PostgreSQL: SearchVector + SearchRank ────────────────────────────
        if connection.vendor == 'postgresql':
            return (
                _apply_postgres_fts(base_qs, search_query)
                .annotate(
                    exact_match=Case(
                        *exact_whens, default=Value(0), output_field=IntegerField(),
                    ),
                    starts_match=Case(
                        When(name__istartswith=search_query,          then=Value(3)),
                        When(category__name__istartswith=search_query, then=Value(2)),
                        default=Value(0), output_field=IntegerField(),
                    ),
                )
                # fts_rank — _apply_postgres_fts() tomonidan qo'shilgan
                .order_by('-exact_match', '-starts_match', '-fts_rank', '-is_popular', '-is_new', 'name')
                .distinct()[:_MAX_SEARCH_RESULTS]
            )

        # ── SQLite / boshqa DB: icontains (AND-mantig'i) ─────────────────────
        return (
            base_qs
            .filter(build_product_search_filter(search_query))
            .annotate(
                exact_match=Case(
                    *exact_whens, default=Value(0), output_field=IntegerField(),
                ),
                starts_match=Case(
                    When(name__istartswith=search_query,          then=Value(3)),
                    When(category__name__istartswith=search_query, then=Value(2)),
                    default=Value(0), output_field=IntegerField(),
                ),
                contains_match=Case(
                    When(name__icontains=search_query,        then=Value(2)),
                    When(description__icontains=search_query, then=Value(1)),
                    When(category__name__icontains=search_query, then=Value(1)),
                    default=Value(0), output_field=IntegerField(),
                ),
            )
            .order_by('-exact_match', '-starts_match', '-contains_match', '-is_popular', '-is_new', 'name')
            .distinct()[:_MAX_SEARCH_RESULTS]
        )

class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.filter(is_active=True).prefetch_related('images', 'variants', 'variants__images')
    serializer_class = ProductDetailSerializer
    permission_classes = (AllowAny,)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        guest_session_id = record_product_event(request, instance, 'view')
        serializer = self.get_serializer(instance)
        return Response(serializer.data, headers=recommendation_headers(guest_session_id))


class RecentlyViewedView(views.APIView):
    """
    GET    /api/recently-viewed/        — joriy foydalanuvchi (yoki mehmon) ko'rgan mahsulotlar.
    DELETE /api/recently-viewed/        — tarixni tozalash.

    Manba: RecommendationEvent(event_type='view'). Har bir mahsulot ko'rilganda
    ProductDetailView avtomatik yozadi. Ma'lumot foydalanuvchiga (auth) yoki
    mehmon sessiyasiga (X-Guest-Session-Id) bog'langan — hech qachon umumiy emas.
    """
    permission_classes = (AllowAny,)

    MAX_ITEMS = 20
    SCAN_LIMIT = 300  # eng so'nggi 300 ta hodisani ko'rib chiqamiz

    def _owner_filter(self, request):
        if request.user.is_authenticated:
            return Q(user=request.user)
        gsid = request.headers.get('X-Guest-Session-Id')
        if gsid:
            return Q(guest_session_id=gsid)
        return None

    def get(self, request):
        owner = self._owner_filter(request)
        if owner is None:
            return Response([])

        exclude_id = request.query_params.get('exclude')

        product_ids = (
            RecommendationEvent.objects
            .filter(owner, event_type='view', product__isnull=False, product__is_active=True)
            .order_by('-created_at')
            .values_list('product_id', flat=True)[:self.SCAN_LIMIT]
        )

        ordered_ids = []
        seen = set()
        for pid in product_ids:
            if exclude_id and str(pid) == str(exclude_id):
                continue
            if pid not in seen:
                seen.add(pid)
                ordered_ids.append(pid)
            if len(ordered_ids) >= self.MAX_ITEMS:
                break

        if not ordered_ids:
            return Response([])

        products = (
            Product.objects
            .filter(id__in=ordered_ids, is_active=True)
            .select_related('category')
            .prefetch_related('images')
        )
        by_id = {p.id: p for p in products}
        ordered = [by_id[pid] for pid in ordered_ids if pid in by_id]

        data = ProductListSerializer(ordered, many=True, context={'request': request}).data
        return Response(data)

    def delete(self, request):
        owner = self._owner_filter(request)
        if owner is not None:
            RecommendationEvent.objects.filter(owner, event_type='view').delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductSimilarListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = None

    def get_queryset(self):
        source_product = generics.get_object_or_404(
            Product.objects.filter(is_active=True)
            .select_related('category', 'category__parent')
            .prefetch_related('variants'),
            pk=self.kwargs.get('pk'),
        )
        return build_similar_products(source_product, limit=10)

class MainPageView(views.APIView):
    permission_classes = (AllowAny,)

    def get(self, request, *args, **kwargs):
        discount_products = Product.objects.filter(is_active=True, is_discount=True).order_by('-updated_at', '-id')[:10]
        new_products = Product.objects.filter(is_active=True, is_new=True).order_by('-created_at', '-id')[:10]
        popular_products = Product.objects.filter(is_active=True, is_popular=True).order_by('-updated_at', '-id')[:10]
        recommendation_payload = build_personalized_recommendations(request, limit=10)
        recommended_products = recommendation_payload['products']

        return Response({
            "banners": HomeBannerSerializer(active_home_banners(), many=True, context={'request': request}).data,
            "discount_products": ProductListSerializer(discount_products, many=True, context={'request': request}).data,
            "new_products": ProductListSerializer(new_products, many=True, context={'request': request}).data,
            "popular_products": ProductListSerializer(popular_products, many=True, context={'request': request}).data,
            "recommended_products": ProductListSerializer(recommended_products, many=True, context={'request': request}).data,
            "recommended_title": recommendation_payload['title'],
            "recommended_description": recommendation_payload['description'],
        })


class HomeBannerListView(generics.ListAPIView):
    serializer_class = HomeBannerSerializer
    permission_classes = (AllowAny,)
    pagination_class = None

    def get_queryset(self):
        return active_home_banners()

class ProductDiscountListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = SectionPagination
    def get_queryset(self):
        return Product.objects.filter(is_active=True, is_discount=True).order_by('-updated_at')

class ProductNewListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = SectionPagination
    def get_queryset(self):
        return Product.objects.filter(is_active=True, is_new=True).order_by('-created_at')

class ProductPopularListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = SectionPagination
    def get_queryset(self):
        return Product.objects.filter(is_active=True, is_popular=True).order_by('-updated_at')

# ── Tasodifiy tavsiyalar: masshtablanadigan cheklangan pool ───────────────────
#
# MUAMMO 1 — order_by('?'):
#   O(n log n) full table scan. 100k mahsulot × 100 parallel so'rov = falaj.
#
# MUAMMO 2 — barcha ID larni yuklash (oldingi tuzatma):
#   1M mahsulot → 8 MB Redis, pool qurish sekin. Katta katalogda o'sadi.
#   Muhimroq: pool TASODIFIY — sifatsiz, kam maʼlum mahsulotlar ham chiqadi.
#
# TO'LIQ YECHIM — Cheklangan, Maqsadli, Masshtablanadigan Pool:
#
#   POOL HAJMI: _RECOMMENDED_POOL_SIZE = 10 000 (katalog hajmidan mustaqil)
#   Xotira: 10 000 × 8 bayt = 80 KB Redis. Doimo shunday.
#
#   POOL TARKIBI (ustuvorlik tartibi):
#     40% (4 000) → is_popular=True  — eng mashhur mahsulotlar, PK indeks
#     30% (3 000) → is_new=True      — yangi kirimlar, PK indeks
#     30% (3 000) → Xilma-xil namuna — TASODIFIY PIVOT texnikasi:
#
#   TASODIFIY PIVOT texnikasi (ORDER BY RANDOM() o'rniga):
#     1. SELECT MIN(id), MAX(id)          — O(log n), B-tree indeks
#     2. pivot = random.randint(min, max) — Python, O(1)
#     3. SELECT id WHERE id >= pivot ORDER BY id LIMIT k  — O(log n + k)
#     3 ta turli pivot → 3 ta oyna → katalog bo'ylab vakillik.
#     ORDER BY RANDOM() dan farq: O(n log n) → O(log n + k).
#
#   DB SO'ROVLARI (pool qurishda, 5 daqiqada bir marta):
#     1. SELECT id WHERE is_popular LIMIT 4000           → PK indeks
#     2. SELECT id WHERE is_new LIMIT 3000               → PK indeks
#     3. SELECT MIN(id), MAX(id)                         → O(log n)
#     4-6. 3× SELECT id WHERE id >= pivot LIMIT 1000     → O(log n + 1000) har biri
#     Jami: 6 ta so'rov, barchasi tez.
#
#   DB SO'ROVLARI (har request'da):
#     Kesh issiq: 0 DB so'rov (faqat Redis read)
#     Kesh sovuq: 6 ta yuqoridagi + 1 ta id__in select (8 element)
#
#   ESLATMA: Nofaol mahsulot pool'da qolishi mumkin (5 daqiqa TTL).
#     filter(is_active=True) ni ikkinchi filtr sifatida qo'llash buni qoplaydi.
# ─────────────────────────────────────────────────────────────────────────────
_RECOMMENDED_POOL_SIZE = 10_000
_RECOMMENDED_POOL_POP  = _RECOMMENDED_POOL_SIZE * 40 // 100   # 4 000 — mashhur
_RECOMMENDED_POOL_NEW  = _RECOMMENDED_POOL_SIZE * 30 // 100   # 3 000 — yangi
_RECOMMENDED_POOL_DIV  = _RECOMMENDED_POOL_SIZE - _RECOMMENDED_POOL_POP - _RECOMMENDED_POOL_NEW  # 3 000
_RECOMMENDED_IDS_CACHE_KEY = 'bozor:recommended_ids'
_RECOMMENDED_IDS_CACHE_TTL = 5 * 60   # 5 daqiqa
_RECOMMENDED_LIMIT = 8


def _build_recommended_pool() -> list:
    """
    Kesh uchun maqsadli ID pool quradi.
    5 daqiqada bir marta ishlatiladi — har request'da emas.

    Diverse (xilma-xil) qism uchun TASODIFIY PIVOT texnikasi:
      Har bir pivot uchun: B-tree'da O(log n) lookup + O(chunk) sequential scan.
      Jami O(log n + k), O(n log n) emas.
    """
    # ── 1. Mashhur mahsulotlar ────────────────────────────────────────────
    pop_ids: list = list(
        Product.objects
        .filter(is_active=True, is_popular=True)
        .order_by('-updated_at')
        .values_list('id', flat=True)[:_RECOMMENDED_POOL_POP]
    )

    # ── 2. Yangi mahsulotlar (mashhurlar bilan kesishmasdan) ──────────────
    pop_set: set = set(pop_ids)
    new_ids: list = list(
        Product.objects
        .filter(is_active=True, is_new=True)
        .exclude(id__in=pop_set)
        .order_by('-created_at')
        .values_list('id', flat=True)[:_RECOMMENDED_POOL_NEW]
    )

    # ── 3. Xilma-xil katalog — tasodifiy pivot oynalari ──────────────────
    excluded: set = pop_set | set(new_ids)
    diverse_base = (
        Product.objects
        .filter(is_active=True)
        .exclude(id__in=excluded)
        .order_by('id')               # PK indeks — deterministik, tez
        .values_list('id', flat=True)
    )

    id_bounds = diverse_base.aggregate(min_id=Min('id'), max_id=Max('id'))
    min_id = id_bounds.get('min_id')
    max_id = id_bounds.get('max_id')

    diverse_ids: list = []
    if min_id is not None and max_id is not None and _RECOMMENDED_POOL_DIV > 0:
        chunk = max(1, _RECOMMENDED_POOL_DIV // 3)   # 3 ta oyna
        seen_d: set = set()

        for _ in range(3):
            pivot = random.randint(min_id, max_id)   # O(1) — Python

            # O(log n) lookup + O(chunk) scan — B-tree PK indeks
            batch: list = list(
                Product.objects
                .filter(is_active=True, id__gte=pivot)
                .exclude(id__in=excluded | seen_d)
                .order_by('id')
                .values_list('id', flat=True)[:chunk]
            )

            # Pivot juda katta bo'lsa (oxirga yaqin), boshidan to'ldirish
            if len(batch) < chunk // 2:
                extra: list = list(
                    Product.objects
                    .filter(is_active=True)
                    .exclude(id__in=excluded | seen_d)
                    .order_by('id')
                    .values_list('id', flat=True)[: chunk - len(batch)]
                )
                batch.extend(extra)

            for pid in batch:
                if pid not in seen_d:
                    seen_d.add(pid)
                    diverse_ids.append(pid)
            if len(diverse_ids) >= _RECOMMENDED_POOL_DIV:
                break

        diverse_ids = diverse_ids[:_RECOMMENDED_POOL_DIV]

    pool: list = pop_ids + new_ids + diverse_ids

    # Failsafe: katalogda popular/new bo'lmasa, eng yangilanganlar
    if not pool:
        pool = list(
            Product.objects.filter(is_active=True)
            .order_by('-updated_at')
            .values_list('id', flat=True)[:_RECOMMENDED_POOL_SIZE]
        )

    random.shuffle(pool)   # Har keshlanishdan keyin turli ketma-ketlik
    return pool


def _get_recommended_pool() -> list:
    """Pool keshdan qaytaradi; sovuq bo'lsa _build_recommended_pool() chaqiriladi."""
    from django.core.cache import cache
    pool = cache.get(_RECOMMENDED_IDS_CACHE_KEY)
    if pool is None:
        pool = _build_recommended_pool()
        cache.set(_RECOMMENDED_IDS_CACHE_KEY, pool, timeout=_RECOMMENDED_IDS_CACHE_TTL)
    return pool


class ProductRecommendedListView(generics.ListAPIView):
    """
    GET /api/products/recommended/
    8 ta tavsiya qilingan mahsulot. Kesh issiq bo'lsa: 1 ta DB so'rov.
    """
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)

    def get_queryset(self):
        pool = _get_recommended_pool()
        if not pool:
            return Product.objects.none()

        # O(k) — Python Floyd algoritmi, DB yuklamasi yo'q
        sample_ids = random.sample(pool, min(_RECOMMENDED_LIMIT, len(pool)))

        # PK indeks — O(k log n), prefetch: N+1 yo'q
        return (
            Product.objects.filter(id__in=sample_ids, is_active=True)
            .select_related('category')
            .prefetch_related('images')
        )

class CategoryProductListView(generics.ListAPIView):
    """
    Kategoriya mahsulotlari ro'yxati.

    #18 FIX: Subkategoriya mahsulotlari ko'rsatilmaydi.

    ESKI MUAMMO:
      filter(category_id=category_id)
      → Faqat TO'G'RIDAN-TO'G'RI mahsulotlarni ko'rsatadi.
      → Agar foydalanuvchi "Smartfonlar" kategoriyasini ochsa va
        mahsulotlar "Apple", "Samsung" (subkategoriyalar)ga ulangan bo'lsa,
        natija: 0 mahsulot.

    YANGI YECHIM — Recursive category descendants:
      1. Berilgan kategoriyadan boshlab BARCHA avlod kategoriyalar yig'iladi
         (cheksiz darajali daraxt — ota → farzand → nevaralar...).
      2. Natija: ota kategoriya va BARCHA avlodlaridagi mahsulotlar.

    Algoritm:
      visited set + BFS (breadth-first) — aylanib ketishdan himoya bor.
      DB so'rovlari: 1 ta dastlabki SELECT + har bir darajada 1 ta SELECT.
      Odatda katalog 3-4 darajali bo'lgani uchun 3-4 ta SELECT.

    PostgreSQL'da yanada optimal yechim: recursive CTE
      WITH RECURSIVE cats AS (
        SELECT id FROM category WHERE id = ?
        UNION ALL
        SELECT c.id FROM category c JOIN cats ON c.parent_id = cats.id
      )
      SELECT * FROM product WHERE category_id IN (SELECT id FROM cats);

    Lekin Django ORM recursive CTE'ni to'g'ridan-to'g'ri qo'llab-quvvatlamaydi
    (django-cte uchinchi tomon paketi talab qiladi). BFS yechimi SQLite va
    PostgreSQL'da to'g'ri ishlaydi va barcha ishlatilish holatlari uchun
    yetarli tezlikda.
    """
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = SectionPagination

    def get_queryset(self):
        category_id = self.kwargs.get('pk')

        # ── #18 FIX: Barcha avlod kategoriyalar yig'ish (BFS) ────────────────
        #
        # BFS (Breadth-First Search) — daraxtni qavat-qavat aylanadi:
        #   Boshlang'ich: {category_id}
        #   1-qavat:  Category.objects.filter(parent_id=category_id).values_list('id')
        #   2-qavat:  Har bir 1-qavatning farzandlari
        #   ...toki yangi avlod topilmaguncha
        #
        # visited: aylanma aloqalardan himoya (masalan, admin tasodifan ota=farzand qo'ysa)
        # ─────────────────────────────────────────────────────────────────────
        all_category_ids = set()
        queue = [category_id]

        while queue:
            current_batch = queue
            # Har bir batchi farzandlarini bitta query'da olamiz
            children_ids = list(
                Category.objects
                .filter(parent_id__in=current_batch, is_active=True)
                .values_list('id', flat=True)
            )
            all_category_ids.update(current_batch)
            # Yangi farzandlar — avval ko'rilmaganlar (aylanma himoya)
            queue = [cid for cid in children_ids if cid not in all_category_ids]

        return (
            Product.objects
            .filter(is_active=True, category_id__in=all_category_ids)
            .select_related('category')
            .prefetch_related('images')
            .order_by('-updated_at', '-id')
        )

_SAFE = ('GET', 'HEAD', 'OPTIONS')


class AdminCategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method in _SAFE:
            return [IsAuthenticated(), IsStaffMember()]
        return [IsAuthenticated(), IsAdminOrAbove()]


class AdminProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category').prefetch_related('images', 'variants', 'variants__images').order_by('-updated_at')
    serializer_class = AdminProductSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_permissions(self):
        if self.request.method in _SAFE:
            return [IsAuthenticated(), IsStaffMember()]
        return [IsAuthenticated(), IsAdminOrAbove()]
    pagination_class = AdminResultsPagination

    def get_queryset(self):
        queryset = (
            Product.objects.select_related('category')
            .prefetch_related('images', 'variants', 'variants__images')
            .order_by('-updated_at', '-id')
        )

        q = (self.request.query_params.get('q') or '').strip()
        if q:
            queryset = queryset.filter(
                Q(name__icontains=q)
                | Q(description__icontains=q)
                | Q(slug__icontains=q)
                | Q(category__name__icontains=q)
                | Q(variants__sku__icontains=q)
                | Q(variants__barcode__icontains=q)
                | Q(variants__color__icontains=q)
                | Q(variants__quality__icontains=q)
                | Q(variants__model__icontains=q)
                | Q(variants__size__icontains=q)
            )

        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        status_filter = self.request.query_params.get('status')
        if status_filter == 'active':
            queryset = queryset.filter(is_active=True)
        elif status_filter == 'inactive':
            queryset = queryset.filter(is_active=False)

        tag_filter = self.request.query_params.get('tag')
        if tag_filter == 'discount':
            queryset = queryset.filter(is_discount=True)
        elif tag_filter == 'new':
            queryset = queryset.filter(is_new=True)
        elif tag_filter == 'popular':
            queryset = queryset.filter(is_popular=True)

        return queryset.distinct()


class AdminBulkImportView(views.APIView):
    """
    CSV/Excel orqali mahsulotlarni bulk import qilish.

    #23 FIX: 10,000+ mahsulot uchun optimallashtirilgan import.

    POST /api/products/admin/bulk-import/
    Content-Type: multipart/form-data

    PARAMETRLAR (form-data):
      file:                   CSV yoki Excel (.xlsx/.xls) fayl [MAJBURIY]
      format:                 'csv' yoki 'excel' (default: 'csv')
      translate:              'true'/'false' — auto tarjima (default: 'true')
      default_category_id:    Kategoriya ko'rsatilmagan mahsulotlar uchun

    CSV USTUNLARI:
      name [MAJBURIY]        — mahsulot nomi
      price_usd              — USD narxi (price_usd yoki price biri majburiy)
      price                  — So'm narxi
      category_id            — Kategoriya ID
      stock                  — Zaxira miqdori (default: 0)
      description            — Tavsif
      is_active              — true/false (default: true)
      is_new                 — true/false (default: true)
      is_popular             — true/false (default: false)
      is_discount            — avtomatik (discount_price bo'lsa)
      discount_price_usd     — Chegirma narxi (USD)
      discount_price         — Chegirma narxi (So'm)
      cost_price             — Tannarx (So'm)

    JAVOB:
      {
        "created_count": 9850,
        "skipped_count": 100,
        "error_count": 50,
        "errors": [{"row": 5, "error": "..."}, ...],
        "warnings": ["..."]
      }

    PERFORMANCE:
      10,000 mahsulot ≈ 30-60 soniya (bulk_create + batch translation)
      Brauzer timeout bo'lishi mumkin — katta importlar uchun Celery task
      orqali async ishlash tavsiya etiladi (kelajak versiyada).
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'error': 'file yuklanmadi.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fayl hajmi tekshiruvi (10MB)
        MAX_SIZE = 10 * 1024 * 1024
        if file_obj.size > MAX_SIZE:
            return Response(
                {'error': f'Fayl hajmi {file_obj.size // 1024 // 1024}MB. Maksimal: 10MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        import_format = (request.data.get('format') or 'csv').lower()
        translate = str(request.data.get('translate', 'true')).lower() != 'false'
        default_category_id = request.data.get('default_category_id') or None
        if default_category_id:
            try:
                default_category_id = int(default_category_id)
            except (ValueError, TypeError):
                default_category_id = None

        from products.bulk_import import import_products_from_csv, import_products_from_excel

        file_bytes = file_obj.read()

        if import_format == 'excel' or file_obj.name.endswith(('.xlsx', '.xls')):
            result = import_products_from_excel(
                file_bytes=file_bytes,
                translate=translate,
                default_category_id=default_category_id,
            )
        else:
            # Encoding aniqlaymiz
            encoding = 'utf-8'
            try:
                file_bytes.decode('utf-8')
            except UnicodeDecodeError:
                encoding = 'utf-8-sig'   # BOM bilan UTF-8
                try:
                    file_bytes.decode('utf-8-sig')
                except UnicodeDecodeError:
                    encoding = 'cp1251'  # Windows-1251 (Cyrillic)

            result = import_products_from_csv(
                file_content=file_bytes,
                encoding=encoding,
                translate=translate,
                default_category_id=default_category_id,
            )

        resp_data = result.to_dict()
        http_status = (
            status.HTTP_201_CREATED
            if result.created_count > 0
            else status.HTTP_400_BAD_REQUEST
        )
        return Response(resp_data, status=http_status)


class AdminHomeBannerViewSet(viewsets.ModelViewSet):
    queryset = HomeBanner.objects.select_related('product').prefetch_related('product__images').order_by('order', '-updated_at', '-id')
    serializer_class = AdminHomeBannerSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = None

    def get_permissions(self):
        if self.request.method in _SAFE:
            return [IsAuthenticated(), IsStaffMember()]
        return [IsAuthenticated(), IsAdminOrAbove()]


class AdminExchangeRateView(views.APIView):
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request):
        rate = GlobalSetting.get_usd_rate()
        return Response({'usd_rate': float(rate)})

    def post(self, request):
        new_rate = request.data.get('usd_rate')
        if not new_rate:
            return Response({'error': 'Rate is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            new_rate_dec = Decimal(str(new_rate))
        except:
            return Response({'error': 'Invalid rate format'}, status=status.HTTP_400_BAD_REQUEST)
            
        setting, _ = GlobalSetting.objects.get_or_create(key='usd_rate')
        setting.value = str(new_rate_dec)
        setting.save()
        
        # Bulk update products
        products = list(Product.objects.filter(price_usd__gt=0))
        for p in products:
            p.price = (p.price_usd * new_rate_dec).quantize(Decimal('1'))
            if p.discount_price_usd:
                p.discount_price = (p.discount_price_usd * new_rate_dec).quantize(Decimal('1'))
        
        if products:
            Product.objects.bulk_update(products, ['price', 'discount_price'])

        # Bulk update variants
        variants = list(ProductVariant.objects.filter(price_usd__isnull=False))
        for v in variants:
            v.price = (v.price_usd * new_rate_dec).quantize(Decimal('1'))
            if v.discount_price_usd:
                v.discount_price = (v.discount_price_usd * new_rate_dec).quantize(Decimal('1'))
            if v.cost_price_usd:
                v.cost_price = (v.cost_price_usd * new_rate_dec).quantize(Decimal('1'))
        
        if variants:
            ProductVariant.objects.bulk_update(variants, ['price', 'discount_price', 'cost_price'])
            
        return Response({
            'message': f'Kurs yangilandi: {new_rate_dec}. {len(products)} ta mahsulot va {len(variants)} ta variant narxi qayta hisoblandi.',
            'usd_rate': float(new_rate_dec)
        })

# ── Do'kon ma'lumotlari (chek/receipt) ──────────────────────────────────────
# GET — chek bosish kerak bo'lgan barcha xodimlar uchun ochiq (admin + seller +
# courier — POS va admin paneldagi printReceipt'lar uchun).
# PATCH — faqat Super Admin. Bu user'ning aniq talabasi: bir martalik o'zgartirish
# keyin barqaror qoladi.
class ShopInfoView(views.APIView):
    """
    GET  /api/products/admin/shop-info/    — Har qanday xodim o'qiy oladi.
    PATCH /api/products/admin/shop-info/   — Faqat Super Admin (is_superuser=True).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsStaffMember()]
        # PATCH va boshqa write metodlar — faqat Super Admin
        return [IsAuthenticated(), IsSuperAdmin()]

    def get(self, request):
        return Response(GlobalSetting.get_shop_info())

    def patch(self, request):
        # DRF serializer validatsiyasi:
        #   - Bo'sh string -> rad etiladi (allow_blank=False)
        #   - max_length=200
        #   - Telefon format check (raqam/+/probel/tire/qavslar, kamida 7 raqam)
        #   - Kamida bitta field shart
        from .serializers import ShopInfoUpdateSerializer
        ser = ShopInfoUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        validated = ser.validated_data

        info = GlobalSetting.set_shop_info(
            name=validated.get('shop_name'),
            phone=validated.get('shop_phone'),
            address=validated.get('shop_address'),
        )
        return Response(info)


class AdminStockReportView(views.APIView):
    """Ombor hisoboti: Kam qolgan tovarlar va variantlar ro'yxati."""
    permission_classes = (IsAuthenticated, CanAccessStockReport)

    def get(self, request):
        min_stock = request.query_params.get('min_stock', 0)
        max_stock = request.query_params.get('max_stock', 10)
        
        try:
            min_stock = int(min_stock)
            max_stock = int(max_stock)
        except (ValueError, TypeError):
            min_stock = 0
            max_stock = 10

        items = []

        # 1. Variantlari bo'lmagan mahsulotlar
        # (Agar mahsulotning variantlari bo'lsa, asosiy mahsulot stogi odatda 0 bo'ladi yoki variantlar yig'indisi)
        products_no_variants = Product.objects.filter(
            variants__isnull=True, 
            stock__gte=min_stock, 
            stock__lte=max_stock
        ).select_related('category').prefetch_related('images')

        for p in products_no_variants:
            main_img = p.images.filter(is_main=True).first() or p.images.first()
            items.append({
                'type': 'product',
                'id': p.id,
                'name': p.name,
                'variant_info': None,
                'category_name': p.category.name if p.category else None,
                'stock': p.stock,
                'sku': p.slug,
                'price': float(p.price),
                'image': absolute_media_url(request, main_img.image, width=400) if main_img else None,
                'status': 'critical' if p.stock < 5 else 'low'
            })

        # 2. Mahsulot variantlari (rang, model, xotira bo'yicha alohida stoglar)
        variants = ProductVariant.objects.filter(
            is_active=True,
            stock__gte=min_stock, 
            stock__lte=max_stock
        ).select_related('product', 'product__category').prefetch_related('product__images')

        for v in variants:
            variant_desc = []
            if v.color: variant_desc.append(v.color)
            if v.quality: variant_desc.append(v.quality)
            if v.model: variant_desc.append(v.model)
            if v.size: variant_desc.append(v.size)
            
            main_img = v.product.images.filter(is_main=True).first() or v.product.images.first()
            
            items.append({
                'type': 'variant',
                'id': v.id,
                'product_id': v.product.id,
                'name': v.product.name,
                'variant_info': " / ".join(variant_desc) if variant_desc else "Standart",
                'category_name': v.product.category.name if v.product.category else None,
                'stock': v.stock,
                'sku': v.sku or f"{v.product.slug}-v{v.id}",
                'price': float(v.discount_price or v.price or v.product.discount_price or v.product.price),
                'image': absolute_media_url(request, v.image, width=400) if v.image else absolute_media_url(request, main_img.image, width=400) if main_img else None,
                'status': 'critical' if v.stock < 5 else 'low'
            })

        # Stog bo'yicha o'sish tartibida saralash
        items.sort(key=lambda x: x['stock'])

        # --- Ombor umumiy statistikasi (filtersiz, barcha mahsulotlar) ---
        all_products_no_var = Product.objects.filter(variants__isnull=True)
        all_variants = ProductVariant.objects.filter(is_active=True)

        total_products = all_products_no_var.count() + all_variants.count()
        total_stock = (
            (all_products_no_var.aggregate(s=Sum('stock'))['s'] or 0)
            + (all_variants.aggregate(s=Sum('stock'))['s'] or 0)
        )

        # Jami qiymat = narx × zaxira (sotish narxi asosida)
        from django.db.models import F, ExpressionWrapper, DecimalField
        val_products = all_products_no_var.annotate(
            val=ExpressionWrapper(F('price') * F('stock'), output_field=DecimalField())
        ).aggregate(s=Sum('val'))['s'] or 0

        val_variants = all_variants.annotate(
            eff_price=Case(
                When(price__isnull=False, then=F('price')),
                default=F('product__price'),
                output_field=DecimalField()
            ),
            val=ExpressionWrapper(F('eff_price') * F('stock'), output_field=DecimalField())
        ).aggregate(s=Sum('val'))['s'] or 0

        total_value = float(val_products) + float(val_variants)

        critical_count = (
            all_products_no_var.filter(stock=0).count()
            + all_variants.filter(stock=0).count()
        )
        low_count = (
            all_products_no_var.filter(stock__gte=1, stock__lte=5).count()
            + all_variants.filter(stock__gte=1, stock__lte=5).count()
        )

        return Response({
            'stats': {
                'total_products': total_products,
                'total_stock': int(total_stock),
                'total_value': total_value,
                'critical_count': critical_count,
                'low_count': low_count,
            },
            'items': items,
        })


# ─────────────────────────────────────────────────────────────────────────────
# COMPAT VIEWS — Telefon Mos Kelish Matritsasi
# ─────────────────────────────────────────────────────────────────────────────

class PhoneBrandListView(generics.ListAPIView):
    """
    GET /api/phones/
    Barcha brendlar + seriyalar + modellari (frontend selector uchun).
    Foydalanuvchi o'z telefonini tanlash uchun ishlatadi.
    """
    serializer_class = PhoneBrandSerializer
    permission_classes = (AllowAny,)

    def get_queryset(self):
        qs = (
            PhoneBrand.objects
            .prefetch_related('series__models')
            .order_by('order', 'name')
        )
        popular_only = self.request.query_params.get('popular')
        if popular_only == 'true':
            qs = qs.filter(is_popular=True)
        return qs


class PhoneModelSearchView(views.APIView):
    """
    GET /api/phones/search/?q=iphone+15
    Model nomini qidirish (autocomplete uchun).
    """
    permission_classes = (AllowAny,)

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response([])
        from .serializers import PhoneModelMiniSerializer
        models = (
            PhoneModel.objects
            .select_related('series__brand')
            .filter(
                Q(series__brand__name__icontains=q)
                | Q(series__name__icontains=q)
                | Q(name__icontains=q)
            )
            .order_by('-is_popular', 'series__brand__order', 'series__order', 'order')[:20]
        )
        return Response(PhoneModelMiniSerializer(models, many=True).data)


class ProductCompatibleModelsView(views.APIView):
    """
    GET /api/products/{pk}/compatible-models/
    Mahsulotga mos keluvchi barcha telefon modellari — brend bo'yicha guruhlanib.
    Frontend mahsulot sahifasida "Mos keladi: ..." qatorini ko'rsatish uchun.
    """
    permission_classes = (AllowAny,)

    def get(self, request, pk):
        product = get_object_or_404(Product, pk=pk, is_active=True)
        compat = (
            product.compatibility
            .select_related('phone_model__series__brand')
            .order_by(
                'phone_model__series__brand__order',
                'phone_model__series__order',
                'phone_model__order',
            )
        )
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
        return Response({
            'product_id': product.id,
            'compatible_count': compat.count(),
            'by_brand': list(brands.values()),
        })


# ── Admin: Moslik boshqaruvi ──────────────────────────────────────────────────

class AdminPhoneBrandListView(generics.ListAPIView):
    """
    GET /api/admin/phones/brands/
    Admin panel uchun: barcha brendlar (moslik qo'shishda dropdown).
    """
    serializer_class = PhoneBrandSerializer
    permission_classes = (IsAdminUser,)
    queryset = (
        PhoneBrand.objects
        .prefetch_related('series__models')
        .order_by('order', 'name')
    )


class AdminCompatibilityView(views.APIView):
    """
    GET    /api/admin/products/{pk}/compatibility/  → mosliklar ro'yxati
    POST   /api/admin/products/{pk}/compatibility/  → model ID'lar qo'shish
    DELETE /api/admin/products/{pk}/compatibility/  → model ID'lar o'chirish
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def get(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        compat = (
            product.compatibility
            .select_related('phone_model__series__brand')
        )
        return Response(ProductCompatibilityReadSerializer(compat, many=True).data)

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        s = CompatibilityWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        model_ids = s.validated_data['phone_model_ids']
        notes     = s.validated_data['notes']

        # Mavjud bo'lmaganlarini topamiz
        existing = set(
            product.compatibility
            .filter(phone_model_id__in=model_ids)
            .values_list('phone_model_id', flat=True)
        )
        new_ids = [mid for mid in model_ids if mid not in existing]

        # Kiritilgan ID'lar haqiqatan mavjudligini tekshiramiz
        valid_models = PhoneModel.objects.filter(id__in=new_ids)
        valid_ids = set(valid_models.values_list('id', flat=True))
        invalid_ids = [mid for mid in new_ids if mid not in valid_ids]
        if invalid_ids:
            return Response(
                {'detail': f"Topilmadi: PhoneModel ID'lar {invalid_ids}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = ProductCompatibility.objects.bulk_create([
            ProductCompatibility(product=product, phone_model_id=mid, notes=notes)
            for mid in new_ids
        ])
        return Response(
            {'added': len(created), 'already_existed': len(existing)},
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        s = CompatibilityWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        deleted, _ = (
            product.compatibility
            .filter(phone_model_id__in=s.validated_data['phone_model_ids'])
            .delete()
        )
        return Response({'deleted': deleted})


class AdminCompatibilityBulkSeriesView(views.APIView):
    """
    POST /api/admin/products/{pk}/compatibility/bulk-series/
    Bir butun seriyani (masalan, "iPhone 15 Series" barcha modellari)
    bir marta bosish bilan mahsulotga qo'shadi.
    Zapchast ko'p modelga mos kelganda vaqtni tejaydi.
    """
    permission_classes = (IsAuthenticated, IsAdminOrAbove)

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        s = CompatibilityBulkSeriesSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        series = get_object_or_404(PhoneSeries, pk=s.validated_data['series_id'])
        notes  = s.validated_data['notes']

        all_model_ids = list(series.models.values_list('id', flat=True))
        if not all_model_ids:
            return Response(
                {'detail': f"'{series}' seriyasida hech qanday model yo'q."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = set(
            product.compatibility
            .filter(phone_model_id__in=all_model_ids)
            .values_list('phone_model_id', flat=True)
        )
        new_ids = [mid for mid in all_model_ids if mid not in existing]

        created = ProductCompatibility.objects.bulk_create([
            ProductCompatibility(product=product, phone_model_id=mid, notes=notes)
            for mid in new_ids
        ])
        return Response({
            'series': str(series),
            'total_models': len(all_model_ids),
            'added': len(created),
            'already_existed': len(existing),
        }, status=status.HTTP_201_CREATED)


# ── Admin ViewSets: PhoneBrand / PhoneSeries / PhoneModel ─────────────────────

from .serializers import (
    AdminPhoneBrandWriteSerializer,
    AdminPhoneSeriesWriteSerializer,
    AdminPhoneModelWriteSerializer,
)


class AdminPhoneBrandViewSet(viewsets.ModelViewSet):
    """CRUD — Telefon brendlari."""
    permission_classes = (IsAuthenticated, IsAdminOrAbove)
    queryset = (
        PhoneBrand.objects
        .prefetch_related('series__models')
        .order_by('order', 'name')
    )

    def get_serializer_class(self):
        if self.action in ('list', 'retrieve'):
            return PhoneBrandSerializer
        return AdminPhoneBrandWriteSerializer


class AdminPhoneSeriesViewSet(viewsets.ModelViewSet):
    """CRUD — Telefon seriyalari."""
    permission_classes = (IsAuthenticated, IsAdminOrAbove)
    serializer_class = AdminPhoneSeriesWriteSerializer
    queryset = (
        PhoneSeries.objects
        .select_related('brand')
        .order_by('brand__order', 'order', 'name')
    )


class AdminPhoneModelViewSet(viewsets.ModelViewSet):
    """CRUD — Aniq telefon modellari."""
    permission_classes = (IsAuthenticated, IsAdminOrAbove)
    serializer_class = AdminPhoneModelWriteSerializer
    queryset = (
        PhoneModel.objects
        .select_related('series__brand')
        .order_by('series__brand__order', 'series__order', 'order', 'name')
    )
