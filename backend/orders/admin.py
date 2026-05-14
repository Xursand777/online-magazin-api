from django.contrib import admin

from .models import Order, OrderHistory, OrderItem, Payment

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


class PaymentInline(admin.StackedInline):
    model = Payment
    extra = 0


class OrderHistoryInline(admin.TabularInline):
    model = OrderHistory
    extra = 0
    readonly_fields = ('from_status', 'to_status', 'actor_type', 'actor', 'note', 'created_at')
    can_delete = False

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'receiver_name', 'receiver_phone', 'status', 'total_price', 'created_at')
    list_filter = ('status', 'payment_method')
    search_fields = ('id', 'receiver_name', 'receiver_phone')
    readonly_fields = ('created_at', 'updated_at', 'cancelled_at')
    inlines = [OrderItemInline, PaymentInline, OrderHistoryInline]
