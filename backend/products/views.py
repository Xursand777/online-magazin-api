import re

from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from rest_framework import generics, views, status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser
from recommendations.services import (
    build_personalized_recommendations,
    recommendation_headers,
    record_product_event,
    record_search_event,
)
from .serializers import (
    CategorySerializer, ProductListSerializer, ProductDetailSerializer, ProductSearchSerializer,
    AdminCategorySerializer, AdminHomeBannerSerializer, AdminProductSerializer, HomeBannerSerializer
)
from .services import build_similar_products
from .models import Category, HomeBanner, Product, GlobalSetting, ProductVariant
from decimal import Decimal


def build_product_search_filter(query):
    query = (query or '').strip()
    if not query:
        return Q(pk__in=[])

    tokens = [token for token in re.split(r'\s+', query) if token]
    search_filter = (
        Q(name__icontains=query)
        | Q(description__icontains=query)
        | Q(category__name__icontains=query)
        | Q(slug__icontains=query)
    )

    if query.isdigit():
        search_filter |= Q(id=int(query))

    for token in tokens:
        search_filter |= (
            Q(name__icontains=token)
            | Q(description__icontains=token)
            | Q(category__name__icontains=token)
            | Q(slug__icontains=token)
        )

    return search_filter


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
        search_query = (self.request.query_params.get('q') or '').strip()
        if not search_query:
            return Product.objects.none()

        exact_whens = [
            When(name__iexact=search_query, then=Value(5)),
            When(slug__iexact=search_query, then=Value(4)),
            When(category__name__iexact=search_query, then=Value(3)),
        ]
        if search_query.isdigit():
            exact_whens.insert(0, When(id=int(search_query), then=Value(6)))

        return (
            Product.objects.filter(is_active=True)
            .select_related('category')
            .prefetch_related('images')
            .filter(build_product_search_filter(search_query))
            .annotate(
                exact_match=Case(*exact_whens, default=Value(0), output_field=IntegerField()),
                starts_match=Case(
                    When(name__istartswith=search_query, then=Value(3)),
                    When(category__name__istartswith=search_query, then=Value(2)),
                    default=Value(0),
                    output_field=IntegerField(),
                ),
                contains_match=Case(
                    When(name__icontains=search_query, then=Value(2)),
                    When(description__icontains=search_query, then=Value(1)),
                    When(category__name__icontains=search_query, then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField(),
                ),
            )
            .order_by('-exact_match', '-starts_match', '-contains_match', '-is_popular', '-is_new', 'name')
            .distinct()
        )

class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.filter(is_active=True)
    serializer_class = ProductDetailSerializer
    permission_classes = (AllowAny,)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        guest_session_id = record_product_event(request, instance, 'view')
        serializer = self.get_serializer(instance)
        return Response(serializer.data, headers=recommendation_headers(guest_session_id))


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
        discount_products = Product.objects.filter(is_active=True, is_discount=True).order_by('-updated_at', '-id')
        new_products = Product.objects.filter(is_active=True, is_new=True).order_by('-created_at', '-id')
        popular_products = Product.objects.filter(is_active=True, is_popular=True).order_by('-updated_at', '-id')
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
    pagination_class = None
    def get_queryset(self):
        return Product.objects.filter(is_active=True, is_discount=True).order_by('-updated_at')

class ProductNewListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = None
    def get_queryset(self):
        return Product.objects.filter(is_active=True, is_new=True).order_by('-created_at')

class ProductPopularListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    pagination_class = None
    def get_queryset(self):
        return Product.objects.filter(is_active=True, is_popular=True).order_by('-updated_at')

class ProductRecommendedListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    def get_queryset(self):
        # In a real scenario, this would use a recommendation engine. For now, random.
        return Product.objects.filter(is_active=True).order_by('?')

class CategoryProductListView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    def get_queryset(self):
        category_id = self.kwargs.get('pk')
        return Product.objects.filter(is_active=True, category_id=category_id)

class AdminCategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer
    permission_classes = (IsAdminUser,)
    pagination_class = None

class AdminProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category').prefetch_related('images', 'variants').order_by('-updated_at')
    serializer_class = AdminProductSerializer
    permission_classes = (IsAdminUser,)
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = AdminResultsPagination

    def get_queryset(self):
        queryset = (
            Product.objects.select_related('category')
            .prefetch_related('images', 'variants')
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


class AdminHomeBannerViewSet(viewsets.ModelViewSet):
    queryset = HomeBanner.objects.select_related('product').prefetch_related('product__images').order_by('order', '-updated_at', '-id')
    serializer_class = AdminHomeBannerSerializer
    permission_classes = (IsAdminUser,)
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = None

class AdminExchangeRateView(views.APIView):
    permission_classes = (IsAdminUser,)

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

class AdminStockReportView(views.APIView):
    """Ombor hisoboti: Kam qolgan tovarlar va variantlar ro'yxati."""
    permission_classes = (IsAdminUser,)

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
                'image': request.build_absolute_uri(main_img.image.url) if main_img else None,
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
                'image': request.build_absolute_uri(v.image.url) if v.image else (request.build_absolute_uri(main_img.image.url) if main_img else None),
                'status': 'critical' if v.stock < 5 else 'low'
            })

        # Stog bo'yicha o'sish tartibida saralash
        items.sort(key=lambda x: x['stock'])

        return Response(items)
