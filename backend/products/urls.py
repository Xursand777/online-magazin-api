from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryListView, ProductListView, ProductDetailView, MainPageView,
    ProductDiscountListView, ProductNewListView, ProductPopularListView, ProductRecommendedListView, CategoryProductListView, ProductSearchView,
    ProductSimilarListView,
    AdminCategoryViewSet, AdminHomeBannerViewSet, AdminProductViewSet, HomeBannerListView,
    AdminExchangeRateView, AdminStockReportView
)

router = DefaultRouter()
router.register(r'admin/categories', AdminCategoryViewSet, basename='admin-category')
router.register(r'admin/products', AdminProductViewSet, basename='admin-product')
router.register(r'admin/banners', AdminHomeBannerViewSet, basename='admin-banner')

urlpatterns = [
    path('admin/exchange-rate/', AdminExchangeRateView.as_view(), name='admin_exchange_rate'),
    path('admin/stock-report/', AdminStockReportView.as_view(), name='admin_stock_report'),
    path('search/products/', ProductSearchView.as_view(), name='product_search'),
    path('categories/', CategoryListView.as_view(), name='category_list'),
    path('categories/<int:pk>/products/', CategoryProductListView.as_view(), name='category_product_list'),
    path('products/', ProductListView.as_view(), name='product_list'),
    path('products/discounts/', ProductDiscountListView.as_view(), name='product_discount_list'),
    path('products/new/', ProductNewListView.as_view(), name='product_new_list'),
    path('products/popular/', ProductPopularListView.as_view(), name='product_popular_list'),
    path('products/recommended/', ProductRecommendedListView.as_view(), name='product_recommended_list'),
    path('products/<int:pk>/similar/', ProductSimilarListView.as_view(), name='product_similar_list'),
    path('banners/', HomeBannerListView.as_view(), name='home_banner_list'),
    path('products/<int:pk>/', ProductDetailView.as_view(), name='product_detail'),
    path('main/', MainPageView.as_view(), name='main_page'),
    path('', include(router.urls)),
]
