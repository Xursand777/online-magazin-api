from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryListView, ProductListView, ProductDetailView, MainPageView,
    ProductDiscountListView, ProductNewListView, ProductPopularListView,
    ProductRecommendedListView, CategoryProductListView, ProductSearchView,
    ProductSimilarListView, RecentlyViewedView,
    AdminCategoryViewSet, AdminHomeBannerViewSet, AdminProductViewSet,
    HomeBannerListView, AdminExchangeRateView, AdminStockReportView,
    AdminBulkImportView,
    # Compat — public
    PhoneBrandListView, PhoneModelSearchView, ProductCompatibleModelsView,
    # Compat — admin
    AdminCompatibilityView, AdminCompatibilityBulkSeriesView,
    AdminPhoneBrandViewSet, AdminPhoneSeriesViewSet, AdminPhoneModelViewSet,
)

router = DefaultRouter()
router.register(r'admin/categories',    AdminCategoryViewSet,      basename='admin-category')
router.register(r'admin/products',      AdminProductViewSet,       basename='admin-product')
router.register(r'admin/banners',       AdminHomeBannerViewSet,    basename='admin-banner')
router.register(r'admin/phones/brands', AdminPhoneBrandViewSet,    basename='admin-phone-brand')
router.register(r'admin/phones/series', AdminPhoneSeriesViewSet,   basename='admin-phone-series')
router.register(r'admin/phones/models', AdminPhoneModelViewSet,    basename='admin-phone-model')

urlpatterns = [
    # ── Katalog ──────────────────────────────────────────────────────────────
    path('admin/exchange-rate/', AdminExchangeRateView.as_view(), name='admin_exchange_rate'),
    path('admin/stock-report/',  AdminStockReportView.as_view(),  name='admin_stock_report'),

    # #23 FIX: Bulk CSV/Excel import (10,000+ mahsulot)
    # POST /api/products/admin/bulk-import/
    # Body: multipart/form-data: file=<csv/xlsx>, format=csv|excel, translate=true|false
    path('admin/bulk-import/', AdminBulkImportView.as_view(), name='admin_bulk_import'),

    path('search/products/', ProductSearchView.as_view(),     name='product_search'),
    path('categories/',      CategoryListView.as_view(),      name='category_list'),
    path('categories/<int:pk>/products/', CategoryProductListView.as_view(), name='category_product_list'),

    path('products/',              ProductListView.as_view(),         name='product_list'),
    path('products/discounts/',    ProductDiscountListView.as_view(), name='product_discount_list'),
    path('products/new/',          ProductNewListView.as_view(),      name='product_new_list'),
    path('products/popular/',      ProductPopularListView.as_view(),  name='product_popular_list'),
    path('products/recommended/',  ProductRecommendedListView.as_view(), name='product_recommended_list'),
    path('products/<int:pk>/',     ProductDetailView.as_view(),       name='product_detail'),
    path('products/<int:pk>/similar/', ProductSimilarListView.as_view(), name='product_similar_list'),

    path('recently-viewed/', RecentlyViewedView.as_view(), name='recently_viewed'),

    path('banners/', HomeBannerListView.as_view(), name='home_banner_list'),
    path('main/',    MainPageView.as_view(),        name='main_page'),

    # ── Moslik Matritsasi (public) ────────────────────────────────────────────
    # GET  /api/phones/              → barcha brendlar + seriyalar + modellar
    # GET  /api/phones/search/?q=... → model qidirish (autocomplete)
    # GET  /api/products/{pk}/compatible-models/ → mahsulotga mos telefonlar
    # GET  /api/products/?compatible_with={slug} → mos mahsulotlar filtri
    path('phones/',          PhoneBrandListView.as_view(),       name='phone_brand_list'),
    path('phones/search/',   PhoneModelSearchView.as_view(),     name='phone_model_search'),
    path('products/<int:pk>/compatible-models/',
         ProductCompatibleModelsView.as_view(), name='product_compatible_models'),

    # ── Moslik Matritsasi (admin) ─────────────────────────────────────────────
    # GET/POST/DELETE /api/admin/products/{pk}/compatibility/
    # POST            /api/admin/products/{pk}/compatibility/bulk-series/
    # Brendlar CRUD   → router: admin/phones/brands/ (AdminPhoneBrandViewSet)
    path('admin/products/<int:pk>/compatibility/',
         AdminCompatibilityView.as_view(), name='admin_product_compatibility'),
    path('admin/products/<int:pk>/compatibility/bulk-series/',
         AdminCompatibilityBulkSeriesView.as_view(), name='admin_product_compat_bulk_series'),

    path('', include(router.urls)),
]
