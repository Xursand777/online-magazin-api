from django.db import models
from django.conf import settings
from products.models import Product, ProductVariant

class Cart(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name='cart')
    guest_session_id = models.CharField(max_length=255, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        if self.user:
            return f"Cart for {self.user.phone}"
        return f"Guest Cart {self.guest_session_id}"

class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    variant = models.ForeignKey(ProductVariant, on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)

    # We store the price snapshot mostly at checkout, but keeping it here if needed
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        # BARQAROR TARTIB — savat elementlari QO'SHILGAN TARTIBDA (id o'sish)
        # qaytadi. Aks holda PostgreSQL miqdor (+/−) yangilanganda qatorni
        # boshqa joyga ko'chiradi va elementlar o'rni "o'zidan o'zi almashib"
        # qoladi (UpdateCartItemView to'liq savatni qaytaradi → frontend shu
        # tartibda chizadi). `id` monoton (auto-increment) → hech qachon
        # o'zgarmaydi, qo'shilish tartibini aniq saqlaydi.
        ordering = ['id']

    def __str__(self):
        return f"{self.quantity} x {self.product.name} in Cart"
