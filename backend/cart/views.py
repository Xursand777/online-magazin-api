import uuid

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers, status, views
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from products.models import Product, ProductVariant
from recommendations.services import record_product_event

from .models import Cart, CartItem
from .serializers import (
    AddToCartSerializer,
    CartItemSerializer,
    CartSerializer,
    LocalCartSyncSerializer,
)

# ─────────────────────────────────────────────────────────────────────────────
# SAVAT CHEKLOVLARI
# ─────────────────────────────────────────────────────────────────────────────
# Bir savat elementidagi maksimal miqdor. Bundan ortiq buyurtma uchun sotuv
# menejeri bilan muzokaralar olib boriladi.
# Nima uchun kerak:
#   1. Noto'g'ri foydalanuvchi xatosi: "1000 dona qo'shdim, ekan" → oldini oladi.
#   2. Stokni to'liq egallash hujumi: bot aksiyani sotib chiqishga urinadi → cheklash.
#   3. Sahifa ko'rsatishi: savatdagi summa overflow bo'lmasin (Decimal/float limiti).
MAX_CART_ITEM_QUANTITY = 100


def get_or_create_cart(request):
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user)
    else:
        guest_session_id = request.headers.get('X-Guest-Session-Id')
        if not guest_session_id:
            guest_session_id = str(uuid.uuid4())
        cart, _ = Cart.objects.get_or_create(guest_session_id=guest_session_id)
    return cart


@transaction.atomic
def merge_cart(user, guest_session_id: str) -> None:
    """
    Mehmon savat elementlarini foydalanuvchi savatiga birlashtiradi.

    Nima uchun @transaction.atomic:
      Agar loop o'rtasida xatolik yuz bersa (masalan, DB connection),
      qisman birlashtirilgan holat qolmasligi uchun barcha o'zgarishlar
      rollback qilinadi. Savat ma'lumotlari HECH QACHON buzilmaydi.

    Nima uchun select_for_update():
      Bir foydalanuvchi bir vaqtda ikkita tabdan tizimga kirsa (nadir),
      ikkala merge'ning ham bitta mehmon savatni o'qib ikkilantirmasligini
      ta'minlaydi. DB darajasida row lock.

    Miqdor qo'shilish mantig'i:
      Bir xil product+variant allaqachon foydalanuvchi savatida bo'lsa →
      miqdorlar qo'shiladi. Yangi bo'lsa → element ko'chiriladi.
    """
    if not guest_session_id:
        return

    # select_for_update: mehmon savatni lock qilib olamiz
    # Agar bir vaqtda ikki merge talabi kelsa, biri kutadi → takrorlanmaydi
    guest_cart = (
        Cart.objects
        .select_for_update()
        .filter(guest_session_id=guest_session_id)
        .first()
    )
    if not guest_cart:
        return

    user_cart, _ = Cart.objects.get_or_create(user=user)

    for item in guest_cart.items.select_related('product', 'variant').all():
        existing = user_cart.items.filter(
            product=item.product,
            variant=item.variant,
        ).first()

        if existing:
            existing.quantity += item.quantity
            existing.save(update_fields=['quantity'])
        else:
            item.cart = user_cart
            item.save(update_fields=['cart'])

    # Mehmon savati bo'shligi → kaskad o'chirish (qolgan elementlar bilan)
    guest_cart.delete()


def get_available_stock(product, variant=None):
    return variant.stock if variant else product.stock


def validate_cart_quantity(product, quantity, variant=None, existing_quantity=0):
    """
    Savat elementining yakuniy miqdorini tekshiradi.

    `quantity`         — qo'shilayotgan yoki yangi belgilanayotgan miqdor
    `existing_quantity`— savatda allaqachon mavjud miqdor (upsert uchun)

    ADD (upsert): existing_quantity > 0 → yangi jami = existing + quantity
    SET (update): existing_quantity = 0 → yangi jami = quantity

    Ikkita qoida:
      1. Jami ≤ MAX_CART_ITEM_QUANTITY (mutlaq limit)
      2. Jami ≤ available_stock        (ombor cheklovi)
    """
    requested_quantity = existing_quantity + quantity

    # 1. Mutlaq yuqori chegara
    if requested_quantity > MAX_CART_ITEM_QUANTITY:
        raise serializers.ValidationError({
            'error': (
                f"Savatchada bir mahsulotdan ko'pi bilan "
                f"{MAX_CART_ITEM_QUANTITY} dona bo'lishi mumkin."
            )
        })

    # 2. Ombor cheklovi
    available_stock = get_available_stock(product, variant)
    if requested_quantity > available_stock:
        raise serializers.ValidationError({
            'error': f"{product.name} uchun omborda {available_stock} dona mavjud."
        })


def upsert_cart_item(cart, product, quantity, variant=None):
    existing_item = CartItem.objects.filter(cart=cart, product=product, variant=variant).first()
    validate_cart_quantity(
        product,
        quantity,
        variant=variant,
        existing_quantity=existing_item.quantity if existing_item else 0,
    )

    item, created = CartItem.objects.get_or_create(
        cart=cart,
        product=product,
        variant=variant,
        defaults={'quantity': quantity},
    )
    if not created:
        item.quantity += quantity
        item.save(update_fields=['quantity'])
    return item

class CartView(views.APIView):
    permission_classes = (AllowAny,)
    
    def get(self, request, *args, **kwargs):
        cart = get_or_create_cart(request)
        serializer = CartSerializer(cart, context={'request': request})
        headers = {}
        if not request.user.is_authenticated and cart.guest_session_id:
            headers['X-Guest-Session-Id'] = cart.guest_session_id
        return Response(serializer.data, headers=headers)

class AddToCartView(views.APIView):
    permission_classes = (AllowAny,)
    
    def post(self, request, *args, **kwargs):
        serializer = AddToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        cart = get_or_create_cart(request)
        product = get_object_or_404(Product, id=serializer.validated_data['product_id'], is_active=True)
        
        variant_id = serializer.validated_data.get('variant_id')
        variant = None
        if variant_id:
            variant = get_object_or_404(ProductVariant, id=variant_id, product=product)

        quantity = serializer.validated_data.get('quantity', 1)
        
        upsert_cart_item(cart, product, quantity, variant)

        record_product_event(
            request,
            product,
            'cart',
            variant=variant,
            guest_session_id=cart.guest_session_id if not request.user.is_authenticated else None,
        )
            
        headers = {}
        if not request.user.is_authenticated and cart.guest_session_id:
            headers['X-Guest-Session-Id'] = cart.guest_session_id
        return Response(
            CartSerializer(cart, context={'request': request}).data,
            status=status.HTTP_200_OK,
            headers=headers,
        )


class SyncLocalCartView(views.APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        serializer = LocalCartSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cart, _ = Cart.objects.get_or_create(user=request.user)
        synced_count = 0
        skipped_items = []

        for item_data in serializer.validated_data['items']:
            try:
                product = Product.objects.get(id=item_data['product_id'], is_active=True)
            except Product.DoesNotExist:
                skipped_items.append({
                    'product_id': item_data['product_id'],
                    'reason': 'Mahsulot topilmadi yoki aktiv emas.',
                })
                continue

            variant = None
            variant_id = item_data.get('variant_id')
            if variant_id:
                try:
                    variant = ProductVariant.objects.get(id=variant_id, product=product)
                except ProductVariant.DoesNotExist:
                    skipped_items.append({
                        'product_id': product.id,
                        'variant_id': variant_id,
                        'reason': 'Variant topilmadi.',
                    })
                    continue

            quantity = item_data.get('quantity', 1)
            try:
                upsert_cart_item(cart, product, quantity, variant)
                synced_count += 1
            except serializers.ValidationError as exc:
                skipped_items.append({
                    'product_id': product.id,
                    'variant_id': variant_id,
                    'reason': exc.detail.get('error', 'Omborda yetarli mahsulot yo\'q.'),
                })
                continue

            record_product_event(request, product, 'cart', variant=variant)

        payload = {
            'cart': CartSerializer(cart, context={'request': request}).data,
            'synced_count': synced_count,
            'skipped_items': skipped_items,
        }
        return Response(payload, status=status.HTTP_200_OK)

class UpdateCartItemView(generics.UpdateAPIView, generics.DestroyAPIView):
    queryset = CartItem.objects.all()
    serializer_class = CartItemSerializer
    permission_classes = (AllowAny,)

    def get_queryset(self):
        cart = get_or_create_cart(self.request)
        return CartItem.objects.filter(cart=cart)

    def update(self, request, *args, **kwargs):
        item = self.get_object()
        quantity = request.data.get('quantity')
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'quantity': "Miqdor to'g'ri raqam bo'lishi kerak."})
        if quantity < 1:
            raise serializers.ValidationError({'quantity': "Miqdor kamida 1 bo'lishi kerak."})

        validate_cart_quantity(item.product, quantity, variant=item.variant)
        item.quantity = quantity
        item.save(update_fields=['quantity'])

        cart = get_or_create_cart(request)
        return Response(CartSerializer(cart, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        cart = get_or_create_cart(request)
        return Response(CartSerializer(cart, context={'request': request}).data)
