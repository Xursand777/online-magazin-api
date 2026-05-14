from django.contrib import admin
from .models import Category, HomeBanner, Product, ProductImage, ProductVariant

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'order', 'is_active')
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name',)

class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1

class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'is_active', 'is_discount', 'is_new', 'is_popular')
    list_filter = ('category', 'is_active', 'is_new', 'is_popular', 'is_discount')
    search_fields = ('name',)
    prepopulated_fields = {'slug': ('name',)}
    inlines = [ProductImageInline, ProductVariantInline]


@admin.register(HomeBanner)
class HomeBannerAdmin(admin.ModelAdmin):
    list_display = ('title', 'product', 'order', 'is_active', 'start_date', 'end_date', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('title', 'subtitle', 'product__name')
    autocomplete_fields = ('product',)
