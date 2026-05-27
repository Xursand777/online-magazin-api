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


def _master_effective_percent(context):
    """
    Joriy foydalanuvchining AMALDAGI usta chegirma foizi (faollikka qarab).
    Bir serializatsiya bo'yicha bir marta hisoblanadi (context'da memoizatsiya) —
    ro'yxatdagi har bir mahsulot uchun qayta-qayta DB so'rovi yubormaydi.
    """
    cached = context.get('_master_pct')
    if cached is not None:
        return cached
    from orders.services import effective_master_percent
    request = context.get('request')
    user = getattr(request, 'user', None) if request else None
    pct = effective_master_percent(user)
    context['_master_pct'] = pct
    return pct


def get_master_price(obj, context):
    """
    Usta uchun narx: faollikka qarab amaldagi foiz amaldagi narxdan chegiriladi.
    Amaldagi narx = is_discount bo'lsa discount_price, aks holda price.
    Faqat is_master=True va FAOL (amaldagi foiz > 0) ustalarga qaytariladi —
    sust usta oddiy narxni ko'radi (master_price = None).
    """
    request = context.get('request')
    if not request:
        return None
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated or not getattr(user, 'is_master', False):
        return None
    pct = _master_effective_percent(context)
    if pct <= 0:
        return None  # sust usta — oddiy narx ko'rsatiladi
    effective = (
        obj.discount_price
        if (getattr(obj, 'is_discount', False) and obj.discount_price)
        else obj.price
    )
    if not effective:
        return None
    master = (effective * (Decimal('100') - pct) / Decimal('100')).quantize(Decimal('1'))
    return str(master)


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

class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ('id', 'image', 'is_main')

class ProductVariantSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = (
            'id',
            'color',
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
            'stock',
            'sku',
        )

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
    class Meta(ProductVariantSerializer.Meta):
        fields = ProductVariantSerializer.Meta.fields + (
            'cost_price',
            'cost_price_usd',
            'barcode',
            'is_active',
            'position',
            'images',
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
    id = serializers.IntegerField(required=False)
    color = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    color_hex = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    remove_image = serializers.BooleanField(required=False, default=False)
    delete_image_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    quality = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    model = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    size = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    price_usd = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    discount_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    discount_price_usd = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price_usd = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    stock = serializers.IntegerField(required=False, min_value=0, default=0)
    sku = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    barcode = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)
    position = serializers.IntegerField(required=False, min_value=0, default=0)

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
            'price', 'price_usd', 'discount_price', 'discount_price_usd', 'cost_price', 'cost_price_usd', 'stock',
            'is_active', 'is_popular', 'is_new', 'is_discount',
            'created_at', 'updated_at', 'main_image', 'image', 'remove_image', 'images', 'variants_data', 'variants'
        )
        read_only_fields = ('slug', 'created_at', 'updated_at', 'is_discount')

    def to_internal_value(self, data):
        data = data.copy()
        for nullable_field in ('category', 'discount_price', 'price_usd', 'discount_price_usd', 'cost_price_usd'):
            if data.get(nullable_field) == '':
                data[nullable_field] = None
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
            'stock': variant_data.get('stock', 0),
            'sku': variant_data.get('sku') or None,
            'barcode': variant_data.get('barcode') or None,
            'is_active': variant_data.get('is_active', True),
            'position': variant_data.get('position', 0),
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
            remove_image = variant.get('remove_image', False)
            delete_image_ids = variant.get('delete_image_ids', [])
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
