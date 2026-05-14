from django.contrib import admin
from .models import User, UserProfile, Address, StaffProfile, Feedback

class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('phone', 'is_active', 'is_verified', 'is_staff')
    search_fields = ('phone',)
    inlines = (UserProfileInline,)

admin.site.register(Address)
admin.site.register(StaffProfile)
admin.site.register(Feedback)
