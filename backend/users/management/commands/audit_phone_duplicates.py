"""
Phase 1.4 — Telefon raqami duplikat foydalanuvchilarni topish.

ISHLATISH:
    python manage.py audit_phone_duplicates                    # oddiy hisobot
    python manage.py audit_phone_duplicates --details          # buyurtmalar bilan
    python manage.py audit_phone_duplicates --export dups.json # JSON faylga
    python manage.py audit_phone_duplicates --include-superusers

NIMA QILADI:
    Har User.phone'ning OXIRGI 9 RAQAMINI canonical identifier sifatida olib,
    bir xil canonical raqami bo'lgan foydalanuvchilarni duplikat deb topadi.

    Misol — bir xil shaxs uchun 3 ta yozuv:
        ID=1   phone='+998941126777'  (canonical: 941126777)
        ID=45  phone='998941126777'   (canonical: 941126777)
        ID=89  phone='941126777'      (canonical: 941126777)
    → DUPLIKAT GURUHI (bitta inson 3 ta akkaunt)

NIMA QILMAYDI — AVTOMAT MERGE YO'Q:
    Birlashtirish XAVFLI:
      • Har foydalanuvchining buyurtmalari, manzillari, kredit tarixi alohida
      • Master darajasi (usta chegirma pog'onasi) yo'qotilishi mumkin
      • credit_ban yoki overdue_credit_count ko'rsatkichlari ehtiyot bilan
      • role (admin/sotuvchi/kuryer) — to'g'ri akkauntda saqlanishi shart

    Shu sababli komanda FAQAT HISOBOT chiqaradi. Merge qarori va bajarish
    admin tomonidan QO'LDA bajariladi (Django shell orqali).

NATIJALAR HAQIDA:
    • Oddiy: 0 ta duplikat → DB toza
    • 1-5 guruh duplikat — Eskidan qolgan, qo'lda tozalash mumkin
    • 20+ guruh duplikat — Tizimda jiddiy data quality muammosi
"""
import json
import re
from collections import defaultdict

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


def _extract_canonical_digits(phone: str) -> str:
    """
    Telefon raqamining oxirgi 9 raqamini chiqarib oladi.
    O'zbekistondagi mobile raqamlar uchun bu — noyob identifikator.

    Misollar:
      '+998941126777'    → '941126777'
      '998941126777'     → '941126777'
      '941126777'        → '941126777'
      '+998 94 112 67 77' → '941126777'
      '12345'            → '' (bo'sh — 9 raqamdan kam)
    """
    digits = re.sub(r'\D', '', phone or '')
    return digits[-9:] if len(digits) >= 9 else ''


class Command(BaseCommand):
    help = "Telefon raqami duplikat foydalanuvchilarni topish (HISOBOT, merge emas)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--details',
            action='store_true',
            help="Har foydalanuvchining buyurtmalari va aktivligini ham ko'rsatish",
        )
        parser.add_argument(
            '--export',
            type=str,
            default=None,
            help="Natijani JSON faylga eksport qilish (admin qo'lda tahlil uchun)",
        )
        parser.add_argument(
            '--include-superusers',
            action='store_true',
            help="Super_admin akkauntlar ham tekshirilsin (default — yo'q)",
        )

    def handle(self, *args, **options):
        details = options['details']
        export_path = options['export']
        include_super = options['include_superusers']

        self.stdout.write("Foydalanuvchilar tahlil qilinmoqda...\n")

        # ── Barcha foydalanuvchilarni canonical bo'yicha guruhlash ────────────
        groups: dict[str, list] = defaultdict(list)
        qs = User.objects.all().order_by('id')
        if not include_super:
            qs = qs.exclude(is_superuser=True)

        total_scanned = 0
        for user in qs.iterator(chunk_size=500):
            total_scanned += 1
            canonical = _extract_canonical_digits(user.phone)
            if canonical:  # bo'sh yoki noto'g'ri telefon — skip
                groups[canonical].append(user)

        # ── Faqat duplikatlari bor guruhlar ──────────────────────────────────
        duplicates = {k: v for k, v in groups.items() if len(v) > 1}

        # ── Tezkor xulosa ────────────────────────────────────────────────────
        if not duplicates:
            self.stdout.write(self.style.SUCCESS(
                f"\n✅ {total_scanned:,} ta foydalanuvchi tekshirildi — "
                f"duplikat telefon topilmadi.\n"
                f"   DB toza, hech qanday tozalash kerak emas."
            ))
            return

        total_dup_groups = len(duplicates)
        total_dup_users = sum(len(users) for users in duplicates.values())
        excess_users = total_dup_users - total_dup_groups

        self.stdout.write(self.style.WARNING(
            f"\n⚠️  {total_scanned:,} ta foydalanuvchidan {total_dup_users:,} "
            f"tasi {total_dup_groups:,} ta DUPLIKAT GURUHGA tegishli.\n"
            f"   Ortiqcha yozuvlar soni: {excess_users:,} ta\n"
        ))

        # ── Har duplikat guruh uchun hisobot ─────────────────────────────────
        report_data = []

        for canonical, users in sorted(duplicates.items()):
            users_sorted = sorted(users, key=lambda u: u.id)
            # Eng eski (kichik ID) — odatda asl yozuv
            primary = users_sorted[0]

            # Headerga oxirgi 9 raqamni qisqartirilgan formada ko'rsatish
            display_phone = f"...{canonical[-7:]}"  # oxirgi 7 raqam (xavfsizlik)

            self.stdout.write(self.style.NOTICE(
                f"\n📞 Guruh '{display_phone}' — {len(users_sorted)} ta yozuv"
            ))

            group_data = {
                'canonical_last_9': canonical,
                'count': len(users_sorted),
                'recommended_primary_id': primary.id,
                'users': [],
                'warnings': [],
            }

            # Master va credit_ban bor-yo'qligi — ogohlantirish
            has_master = any(u.is_master for u in users_sorted)
            has_credit_ban = any(u.credit_ban for u in users_sorted)
            has_role = any(getattr(u, 'role', None) for u in users_sorted)

            if has_master:
                group_data['warnings'].append(
                    "Master darajasi mavjud — qaysi akkauntda saqlanishi muhim"
                )
            if has_credit_ban:
                group_data['warnings'].append(
                    "credit_ban=True — merge'da to'g'ri akkauntga ko'chirish kerak"
                )
            if has_role:
                group_data['warnings'].append(
                    "Xodim roli mavjud — alohida ehtiyot bilan"
                )

            for u in users_sorted:
                user_info = {
                    'id': u.id,
                    'phone': u.phone,
                    'phone_format_canonical': u.phone.startswith('+998') and len(u.phone) == 13,
                    'date_joined': u.date_joined.isoformat() if u.date_joined else None,
                    'is_active': u.is_active,
                    'is_verified': u.is_verified,
                    'is_superuser': u.is_superuser,
                    'role': u.role,
                    'is_master': u.is_master,
                    'credit_ban': u.credit_ban,
                    'overdue_credit_count': u.overdue_credit_count,
                }

                if details:
                    orders_count = u.orders.count() if hasattr(u, 'orders') else 0
                    active_orders = 0
                    last_order_at = None
                    if hasattr(u, 'orders') and orders_count:
                        active_orders = u.orders.filter(
                            status__in=[
                                'PENDING', 'CONFIRMED', 'PACKING',
                                'SHIPPING', 'DELIVERED', 'AWAITING_PAYMENT',
                            ]
                        ).count()
                        last = u.orders.order_by('-created_at').first()
                        if last:
                            last_order_at = last.created_at.isoformat()

                    user_info['orders_total'] = orders_count
                    user_info['orders_active'] = active_orders
                    user_info['last_order_at'] = last_order_at

                group_data['users'].append(user_info)

                # Konsol chiqishi — kompakt jadval
                mark = '★' if u.id == primary.id else ' '
                role_str = u.role or 'mijoz'
                flags = []
                if u.is_master:
                    flags.append('MASTER')
                if u.credit_ban:
                    flags.append('CREDIT_BAN')
                if not u.is_active:
                    flags.append('INACTIVE')
                if u.is_superuser:
                    flags.append('SUPERUSER')
                flag_str = f" [{', '.join(flags)}]" if flags else ''
                canonical_str = '✓' if user_info['phone_format_canonical'] else '✗'

                self.stdout.write(
                    f"   {mark} ID={u.id:6d} | canonical={canonical_str} | "
                    f"'{u.phone:20s}' | {role_str:10s}{flag_str}"
                )

                if details:
                    orders_str = (
                        f"orders={user_info['orders_total']} "
                        f"(active={user_info['orders_active']})"
                    )
                    last_str = (
                        f", oxirgi: {user_info['last_order_at'][:10]}"
                        if user_info['last_order_at'] else ''
                    )
                    self.stdout.write(f"           {orders_str}{last_str}")

            self.stdout.write(
                f"   ★ Tavsiya: PRIMARY={primary.id} (eng eski yaratilgan)"
            )

            if group_data['warnings']:
                self.stdout.write(self.style.WARNING(
                    f"   ⚠️  " + " | ".join(group_data['warnings'])
                ))

            report_data.append(group_data)

        # ── JSON eksport ─────────────────────────────────────────────────────
        if export_path:
            try:
                with open(export_path, 'w', encoding='utf-8') as f:
                    json.dump(
                        {
                            'summary': {
                                'total_scanned': total_scanned,
                                'duplicate_groups': total_dup_groups,
                                'duplicate_users': total_dup_users,
                                'excess_users': excess_users,
                            },
                            'groups': report_data,
                        },
                        f,
                        ensure_ascii=False,
                        indent=2,
                        default=str,
                    )
                self.stdout.write(self.style.SUCCESS(
                    f"\n📄 JSON eksport: {export_path}"
                ))
            except OSError as exc:
                self.stderr.write(self.style.ERROR(
                    f"JSON eksport xatosi: {exc}"
                ))

        # ── MERGE protsedurasi (qo'lda) ──────────────────────────────────────
        self.stdout.write(self.style.WARNING(
            "\n" + "─" * 70
        ))
        self.stdout.write(self.style.WARNING(
            "AVTOMAT MERGE YO'Q. Birlashtirish XAVFLI — qo'lda hal qilish kerak.\n"
        ))
        self.stdout.write(
            "QO'LDA MERGE PROTSEDURASI:\n"
            "\n"
            "  1. Yuqoridagi tavsiyaga qarab PRIMARY (saqlanadigan) ID tanlang.\n"
            "     Odatda eng eski + canonical format + ko'p buyurtmali.\n"
            "\n"
            "  2. Django shell:\n"
            "     $ python manage.py shell\n"
            "\n"
            "  3. Importlar:\n"
            "     >>> from users.models import User\n"
            "     >>> from users.audit import audit  # Phase 1.1\n"
            "\n"
            "  4. Foydalanuvchilarni tanlash:\n"
            "     >>> keep = User.objects.get(pk=<PRIMARY_ID>)\n"
            "     >>> remove = User.objects.get(pk=<DUPLICATE_ID>)\n"
            "\n"
            "  5. Tegishli yozuvlarni ko'chirish:\n"
            "     >>> remove.orders.update(user=keep)\n"
            "     >>> remove.addresses.update(user=keep)\n"
            "     >>> remove.feedbacks.update(user=keep)\n"
            "\n"
            "  6. master/credit holatini saqlash (agar remove'da MASTER bo'lsa):\n"
            "     >>> if remove.is_master: keep.is_master = True\n"
            "     >>> keep.overdue_credit_count = max(\n"
            "     ...     keep.overdue_credit_count, remove.overdue_credit_count\n"
            "     ... )\n"
            "     >>> keep.credit_ban = keep.credit_ban or remove.credit_ban\n"
            "     >>> keep.save()\n"
            "\n"
            "  7. Audit log yozish (Phase 1.1):\n"
            "     >>> audit(action='admin.user.merge_duplicate',\n"
            "     ...       target=keep,\n"
            "     ...       data={'merged_from_id': remove.id,\n"
            "     ...             'merged_from_phone': remove.phone})\n"
            "\n"
            "  8. Duplikat akkauntni o'chirish:\n"
            "     >>> remove.delete()\n"
            "\n"
            "  9. Phone'ni canonical formatga keltirish (agar to'g'ri bo'lmasa):\n"
            "     >>> from users.utils import normalize_phone_number\n"
            "     >>> keep.phone = normalize_phone_number(keep.phone)\n"
            "     >>> keep.save()\n"
            "\n"
            "ESLATMA: Merge'dan oldin DB backup oling (Phase 0.3 backup_db).\n"
        )
