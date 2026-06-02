"""
Phase 1.1 — AuditLog jadvali qo'shilishi.

Admin amallarini kuzatuv uchun. AuditMiddleware va explicit audit()
chaqiruvlari shu jadvalga yozadi.
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_add_is_master'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'actor_phone_snapshot',
                    models.CharField(
                        blank=True,
                        default='',
                        help_text="Actor telefoni (User o'chsa ham saqlanadi)",
                        max_length=15,
                    ),
                ),
                ('action', models.CharField(db_index=True, max_length=100)),
                (
                    'target_type',
                    models.CharField(
                        blank=True, db_index=True, default='', max_length=50,
                    ),
                ),
                (
                    'target_id',
                    models.PositiveIntegerField(blank=True, db_index=True, null=True),
                ),
                ('data', models.JSONField(blank=True, default=dict)),
                ('ip', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    'actor',
                    models.ForeignKey(
                        blank=True,
                        help_text='Amalni bajargan foydalanuvchi',
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name='audit_logs',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'verbose_name': 'Audit log',
                'verbose_name_plural': 'Audit log yozuvlari',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(
                        fields=['actor', '-created_at'], name='auditlog_actor_idx',
                    ),
                    models.Index(
                        fields=['target_type', 'target_id', '-created_at'],
                        name='auditlog_target_idx',
                    ),
                    models.Index(
                        fields=['action', '-created_at'], name='auditlog_action_idx',
                    ),
                ],
            },
        ),
    ]
