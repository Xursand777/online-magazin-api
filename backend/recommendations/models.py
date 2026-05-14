from django.conf import settings
from django.db import models

from products.models import Category, Product, ProductVariant


class RecommendationProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='recommendation_profile',
    )
    guest_session_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    search_terms = models.JSONField(default=list, blank=True)
    keyword_scores = models.JSONField(default=dict, blank=True)
    category_scores = models.JSONField(default=dict, blank=True)
    product_scores = models.JSONField(default=dict, blank=True)
    price_bucket_scores = models.JSONField(default=dict, blank=True)

    last_activity_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.user_id:
            return f"RecommendationProfile(user={self.user_id})"
        return f"RecommendationProfile(guest={self.guest_session_id})"


class RecommendationEvent(models.Model):
    EVENT_CHOICES = [
        ('search', 'Search'),
        ('view', 'View'),
        ('cart', 'Cart'),
        ('order', 'Order'),
    ]

    profile = models.ForeignKey(RecommendationProfile, on_delete=models.CASCADE, related_name='events')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    guest_session_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)

    event_type = models.CharField(max_length=20, choices=EVENT_CHOICES)
    query_text = models.CharField(max_length=255, null=True, blank=True)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    variant = models.ForeignKey(ProductVariant, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)

    weight = models.FloatField(default=1.0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        owner = self.user_id or self.guest_session_id or 'anonymous'
        return f"{self.event_type} event for {owner}"

