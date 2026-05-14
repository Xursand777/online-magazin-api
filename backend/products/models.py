from django.db import models
from django.core.exceptions import ValidationError
from django.utils.text import slugify
from decimal import Decimal

class GlobalSetting(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.key}: {self.value}"

    @classmethod
    def get_usd_rate(cls):
        setting, _ = cls.objects.get_or_create(key='usd_rate', defaults={'value': '12800', 'description': '1 USD kurs (so\'mda)'})
        try:
            return Decimal(setting.value)
        except:
            return Decimal('12800')


class Category(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children')
    image = models.ImageField(upload_to='categories/', null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_popular = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

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
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    description = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    discount_price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    cost_price_usd = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True)
    is_popular = models.BooleanField(default=False)
    is_new = models.BooleanField(default=True)
    is_discount = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
        
        # USD dan So'm ga o'tkazish (agar USD kiritilgan bo'lsa)
        # Eslatma: Bu faqat individual save() chaqirilganda ishlaydi. 
        # Global kurs o'zgarganda bulk update kerak bo'ladi.
        if self.price_usd:
            rate = GlobalSetting.get_usd_rate()
            self.price = (self.price_usd * rate).quantize(Decimal('1'))
            if self.discount_price_usd:
                self.discount_price = (self.discount_price_usd * rate).quantize(Decimal('1'))
        
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/gallery/')
    order = models.PositiveIntegerField(default=0)
    is_main = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

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

    class Meta:
        ordering = ['position', 'id']

    def save(self, *args, **kwargs):
        if self.price_usd:
            rate = GlobalSetting.get_usd_rate()
            self.price = (self.price_usd * rate).quantize(Decimal('1'))
            if self.discount_price_usd:
                self.discount_price = (self.discount_price_usd * rate).quantize(Decimal('1'))
            if self.cost_price_usd:
                self.cost_price = (self.cost_price_usd * rate).quantize(Decimal('1'))
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

    def __str__(self):
        return self.title
