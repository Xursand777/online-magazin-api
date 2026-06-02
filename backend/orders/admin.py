from django.contrib import admin, messages
from django.utils import timezone

from .models import (
    Order, OrderDispute, OrderDisputeImage, OrderHistory, OrderItem, Payment,
)
from .services import pay_credit_order


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
    list_display = (
        'id', 'user', 'receiver_name', 'receiver_phone',
        'status', 'payment_method', 'total_price',
        'is_credit', 'credit_due_date', 'credit_paid', 'credit_is_overdue_display',
        'created_at',
    )
    list_filter = ('status', 'payment_method', 'is_credit', 'credit_paid')
    search_fields = ('id', 'receiver_name', 'receiver_phone')
    readonly_fields = (
        'created_at', 'updated_at', 'cancelled_at',
        'credit_paid_at', 'credit_is_overdue_display',
    )
    inlines = [OrderItemInline, PaymentInline, OrderHistoryInline]
    actions = ['mark_credit_paid']

    @admin.display(description="Muddati o'tganmi?", boolean=True)
    def credit_is_overdue_display(self, obj):
        if not obj.is_credit or obj.credit_paid:
            return False
        if obj.status in Order.CANCELLATION_STATUSES:
            return False
        return obj.credit_due_date is not None and obj.credit_due_date < timezone.now().date()

    @admin.action(description="Tanlangan muddatli to'lov buyurtmalarni to'langan deb belgilash")
    def mark_credit_paid(self, request, queryset):
        success = 0
        for order in queryset:
            if order.is_credit and not order.credit_paid:
                try:
                    pay_credit_order(order=order, actor=request.user)
                    success += 1
                except Exception:
                    pass
        self.message_user(
            request,
            f"{success} ta muddatli to'lov buyurtmasi to'langan deb belgilandi.",
            messages.SUCCESS,
        )


# ── Phase 2.6 — Order dispute admin ─────────────────────────────────────────
class OrderDisputeImageInline(admin.TabularInline):
    model = OrderDisputeImage
    extra = 0
    readonly_fields = ('image', 'uploaded_at')
    can_delete = False


@admin.register(OrderDispute)
class OrderDisputeAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'order', 'status', 'created_at',
        'resolved_at', 'resolved_by',
    )
    list_filter   = ('status',)
    search_fields = ('id', 'order__id', 'reason')
    readonly_fields = ('created_at', 'resolved_at', 'resolved_by')
    inlines = [OrderDisputeImageInline]
