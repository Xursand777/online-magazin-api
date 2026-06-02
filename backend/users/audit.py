"""
users/audit.py — Explicit AuditLog yozish uchun helper.

NIMA UCHUN:
    AuditMiddleware avtomat yozuv qiladi (URL/method asosida), lekin ba'zi
    vaziyatlarda RICH context kerak:
      • Rol o'zgartirish — eski va yangi rol kerak
      • Backup super_admin yaratish — telefonni ko'rsatish
      • Disput hal qilish — qaror sababi

    Bunday holatlarda audit() ni view ichidan to'g'ridan-to'g'ri chaqirish
    middleware'dan boyroq ma'lumot beradi.

ISHLATISH:
    from users.audit import audit

    audit(
        action='admin.user.role_change',
        target=user,
        data={'old_role': 'seller', 'new_role': 'admin'},
        request=self.request,
    )

XAVFSIZLIK:
    Audit yozish HECH QACHON dasturni buzmasligi kerak. Barcha xatolar
    yutib olinadi va log'ga yoziladi (request davom etadi).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def audit(
    *,
    action: str,
    target: Optional[Any] = None,
    data: Optional[dict] = None,
    request=None,
    actor=None,
) -> None:
    """
    AuditLog yozuv yaratish.

    PARAMETRLAR:
        action:   amal nomi, masalan 'admin.user.role_change'
        target:   ta'sirlanayotgan model instance (Product, Order, User, ...)
        data:     qo'shimcha kontekst — diff, snapshot, sabab va h.k.
        request:  Django request — actor, IP, user_agent shu yerdan olinadi
        actor:    request bo'lmasa, foydalanuvchini explicit ko'rsatish

    request va actor — biri bo'lishi yetarli. Ikkalasi bo'lsa, request
    tarkibidagi user afzal.
    """
    try:
        from .models import AuditLog

        # Actor aniqlash
        if request is not None:
            req_user = getattr(request, 'user', None)
            if req_user is not None and req_user.is_authenticated:
                actor = req_user

        # IP va user-agent
        ip = None
        user_agent = ''
        if request is not None:
            forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').strip()
            if forwarded:
                ip = forwarded.split(',')[0].strip() or None
            else:
                ip = request.META.get('REMOTE_ADDR') or None
            user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:500]

        # Target ma'lumotlari
        target_type = ''
        target_id = None
        if target is not None:
            target_type = type(target).__name__.lower()[:50]
            target_id = getattr(target, 'pk', None) or getattr(target, 'id', None)

        AuditLog.objects.create(
            actor=actor,
            actor_phone_snapshot=(getattr(actor, 'phone', '') or '')[:15],
            action=action[:100],
            target_type=target_type,
            target_id=target_id,
            data=data or {},
            ip=ip,
            user_agent=user_agent,
        )

    except Exception as exc:
        # Audit ishlash request'ni HECH QACHON to'xtatmasligi shart
        logger.warning('audit() chaqirishda xato: action=%s, error=%s', action, exc)
