"""
Phase 1.8 — Migration xavfsizligini tekshirish.

ISHLATISH:
    python manage.py audit_migrations              # barcha migrations
    python manage.py audit_migrations --strict     # CI'da: error bo'lsa exit 1
    python manage.py audit_migrations --since HEAD~5  # so'nggi 5 commit
    python manage.py audit_migrations --files <path1> <path2>  # aniq fayllar
    python manage.py audit_migrations --app users  # faqat 'users' migrations

NIMA QILADI:
    Migration fayllarini AST orqali tahlil qilib, xavfli operatsiyalarni
    topadi:
      • RemoveField    — DATA LOSS (field DROP)
      • DeleteModel    — TOTAL DATA LOSS (jadval DROP)
      • RenameField    — eski/yangi nom kodi talab qiladi
      • RenameModel    — FK lar yangilanishi shart
      • RunSQL         — har qanday narsa qilishi mumkin
      • RunPython      — data migration, qo'lda tekshirish
      • AlterField     — tur o'zgarishi yoki null=False qo'shilishi

    Plus RunSQL ichida "DROP TABLE", "TRUNCATE", "DELETE FROM" — kritik xato.

QAERDA ISHLATILADI:
    1. Lokal: commit qilishdan oldin qo'lda
    2. Git pre-commit hook: .git-hooks/pre-commit (avtomat)
    3. CI/CD: GitHub Actions (--strict)

NIMA UCHUN:
    Bug fixning oltin qoidasi: "DB schema o'zgarishi orqaga qaytish qiyin".
    Bir RemoveField'ni production'da ishga tushirgandan keyin — column
    yo'q. Backup'dan tiklash ham ehtimol vaqt yo'qotish va sotuv yo'qoladi.
"""
from __future__ import annotations

import ast
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from django.core.management.base import BaseCommand


# ── Xavf darajalari ──────────────────────────────────────────────────────────

SEVERITY_ERROR = 'ERROR'      # Kritik — commit qilmang
SEVERITY_WARNING = 'WARN'     # Diqqat kerak — qo'lda tekshiring
SEVERITY_INFO = 'INFO'        # Ma'lumot — odatda OK, lekin bilib qo'ying


# Django migration operatsiyalari → (severity, izoh)
DANGEROUS_OPS: dict[str, tuple[str, str]] = {
    'RemoveField':       (SEVERITY_ERROR,   "Field DROP — bu fayldagi field SHU MIGRATIONDAN KEYIN MAVJUD BO'LMAYDI"),
    'DeleteModel':       (SEVERITY_ERROR,   "Jadval DROP — barcha yozuvlar yo'qoladi, TO'LIQ DATA LOSS"),
    'RemoveIndex':       (SEVERITY_WARNING, "Index DROP — query performance ta'sirlanishi mumkin"),
    'RemoveConstraint':  (SEVERITY_WARNING, "Constraint DROP — ma'lumot integratsiya ta'minoti zaiflashadi"),
    'RenameField':       (SEVERITY_WARNING, "Field rename — eski va yangi nom kod talab qiladi (2 deploy step)"),
    'RenameModel':       (SEVERITY_WARNING, "Jadval rename — FK ham yangilanishi shart"),
    'RunSQL':            (SEVERITY_WARNING, "Raw SQL — quyidagi SQL keywords'ga e'tibor bering"),
    'RunPython':         (SEVERITY_WARNING, "Python data migration — backup oling, qo'lda tekshiring"),
    'AlterField':        (SEVERITY_INFO,    "Field type/constraint o'zgardi — null=False qo'shilsa fail mumkin"),
}

# RunSQL ichida shu so'zlar bo'lsa — ERROR ga ko'tariladi
DANGEROUS_SQL_KEYWORDS = [
    'DROP TABLE',
    'DROP COLUMN',
    'TRUNCATE',
    'DELETE FROM',  # ehtimol full table — qo'lda tekshiring
]


@dataclass
class Issue:
    file_path: str
    line: int
    operation: str
    severity: str
    note: str

    def __str__(self):
        return f"{self.file_path}:{self.line:<4} [{self.severity:<5}] {self.operation} — {self.note}"


class Command(BaseCommand):
    help = "Migration fayllarini xavfsizlik nuqtai nazaridan tekshiradi"

    def add_arguments(self, parser):
        parser.add_argument(
            '--strict',
            action='store_true',
            help="Bittasi ham ERROR bo'lsa exit 1 (CI/CD uchun)",
        )
        parser.add_argument(
            '--app',
            type=str,
            default=None,
            help='Faqat shu app migrations (masalan: users)',
        )
        parser.add_argument(
            '--since',
            type=str,
            default=None,
            help="Git ref'dan keyingi qo'shilgan/o'zgargan migrations (masalan: HEAD~5)",
        )
        parser.add_argument(
            '--files',
            nargs='+',
            default=None,
            help="Aniq fayl yo'llar (pre-commit hook'dan)",
        )

    def handle(self, *args, **options):
        files = self._collect_files(options)

        if not files:
            self.stdout.write(self.style.SUCCESS(
                "Migration fayllari topilmadi (tekshirish kerakmas)."
            ))
            return

        self.stdout.write(f"\n🔍 {len(files)} ta migration fayli tekshirilmoqda...\n")

        all_issues: list[Issue] = []
        for path in files:
            issues = self._scan_migration(path)
            all_issues.extend(issues)

        self._report(all_issues, total_files=len(files))

        # Exit code
        has_error = any(i.severity == SEVERITY_ERROR for i in all_issues)
        if options['strict'] and has_error:
            sys.exit(1)

    # ── Fayl ro'yxati to'plash ──────────────────────────────────────────────

    def _collect_files(self, options) -> list[Path]:
        # 1. Explicit fayllar
        if options['files']:
            return [Path(f) for f in options['files'] if Path(f).exists()]

        # 2. Git diff
        if options['since']:
            return self._git_changed_migrations(options['since'])

        # 3. Hamma migration'lar (faqat berilgan app'da bo'lsa)
        return self._all_migration_files(options['app'])

    @staticmethod
    def _git_changed_migrations(ref: str) -> list[Path]:
        """git diff <ref> HEAD — qo'shilgan migrations."""
        try:
            output = subprocess.check_output(
                ['git', 'diff', '--name-only', '--diff-filter=A', ref, 'HEAD'],
                cwd=Path.cwd().parent if (Path.cwd() / 'manage.py').exists() else None,
                stderr=subprocess.DEVNULL,
            ).decode()
            files = []
            for line in output.splitlines():
                if '/migrations/' in line and line.endswith('.py'):
                    p = Path(line)
                    if p.exists():
                        files.append(p)
            return files
        except subprocess.CalledProcessError:
            return []

    @staticmethod
    def _all_migration_files(app: Optional[str]) -> list[Path]:
        base = Path.cwd()  # backend/
        result = []
        if app:
            mig_dir = base / app / 'migrations'
            if mig_dir.exists():
                for f in mig_dir.glob('*.py'):
                    if f.name != '__init__.py':
                        result.append(f)
        else:
            for mig_dir in base.glob('*/migrations'):
                for f in mig_dir.glob('*.py'):
                    if f.name != '__init__.py':
                        result.append(f)
        return sorted(result)

    # ── Migration tahlili (AST) ─────────────────────────────────────────────

    def _scan_migration(self, path: Path) -> list[Issue]:
        """Bitta fayl ichidagi xavfli operatsiyalarni topadi."""
        issues: list[Issue] = []
        try:
            content = path.read_text(encoding='utf-8')
            tree = ast.parse(content)
        except (OSError, SyntaxError) as exc:
            issues.append(Issue(
                file_path=str(path),
                line=0,
                operation='PARSE_ERROR',
                severity=SEVERITY_WARNING,
                note=f"Faylni parse qilib bo'lmadi: {exc}",
            ))
            return issues

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue

            op_name = self._extract_op_name(node)
            if not op_name or op_name not in DANGEROUS_OPS:
                continue

            severity, note = DANGEROUS_OPS[op_name]

            # RunSQL — SQL string'ni ham tekshirish
            extra_severity = None
            extra_note = ''
            if op_name == 'RunSQL':
                sql_issues = self._scan_sql_args(node)
                if sql_issues:
                    extra_severity = SEVERITY_ERROR
                    extra_note = f" (SQL: {', '.join(sql_issues)})"

            final_severity = extra_severity or severity
            issues.append(Issue(
                file_path=str(path.relative_to(Path.cwd()) if path.is_absolute() else path),
                line=node.lineno,
                operation=op_name,
                severity=final_severity,
                note=note + extra_note,
            ))

        return issues

    @staticmethod
    def _extract_op_name(node: ast.Call) -> Optional[str]:
        """migrations.RemoveField(...) → 'RemoveField'."""
        func = node.func
        if isinstance(func, ast.Attribute):
            # migrations.RemoveField yoki obj.RemoveField
            if isinstance(func.value, ast.Name) and func.value.id == 'migrations':
                return func.attr
            return None
        return None

    @staticmethod
    def _scan_sql_args(node: ast.Call) -> list[str]:
        """RunSQL argumentlaridan xavfli SQL keyword'larni topish."""
        found = []
        for arg in node.args:
            sql_str = None
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                sql_str = arg.value
            elif isinstance(arg, ast.List):
                # RunSQL(['SQL1', 'SQL2'])
                for item in arg.elts:
                    if isinstance(item, ast.Constant) and isinstance(item.value, str):
                        sql_str = (sql_str or '') + '\n' + item.value

            if not sql_str:
                continue

            upper = sql_str.upper()
            for kw in DANGEROUS_SQL_KEYWORDS:
                if kw in upper:
                    found.append(kw)
        return found

    # ── Hisobot ──────────────────────────────────────────────────────────────

    def _report(self, issues: list[Issue], total_files: int) -> None:
        if not issues:
            self.stdout.write(self.style.SUCCESS(
                f"✅ {total_files} ta migration tekshirildi — xavfli operatsiya yo'q."
            ))
            return

        # Severity bo'yicha hisoblash
        errors = [i for i in issues if i.severity == SEVERITY_ERROR]
        warnings = [i for i in issues if i.severity == SEVERITY_WARNING]
        infos = [i for i in issues if i.severity == SEVERITY_INFO]

        # Detallar
        by_file: dict[str, list[Issue]] = {}
        for issue in issues:
            by_file.setdefault(issue.file_path, []).append(issue)

        for file_path, file_issues in sorted(by_file.items()):
            self.stdout.write(self.style.NOTICE(f"\n📄 {file_path}"))
            for issue in file_issues:
                style = (
                    self.style.ERROR if issue.severity == SEVERITY_ERROR
                    else self.style.WARNING if issue.severity == SEVERITY_WARNING
                    else self.style.NOTICE
                )
                emoji = (
                    '❌' if issue.severity == SEVERITY_ERROR
                    else '⚠️ ' if issue.severity == SEVERITY_WARNING
                    else 'ℹ️ '
                )
                self.stdout.write(style(
                    f"   {emoji} L{issue.line:<4} {issue.operation:<18} {issue.note}"
                ))

        # Xulosa
        self.stdout.write('')
        self.stdout.write('─' * 60)
        self.stdout.write(self.style.ERROR(   f"  ❌ ERROR:   {len(errors)} ta"))
        self.stdout.write(self.style.WARNING( f"  ⚠️  WARNING: {len(warnings)} ta"))
        self.stdout.write(self.style.NOTICE(  f"  ℹ️  INFO:    {len(infos)} ta"))
        self.stdout.write('─' * 60)

        # Tavsiya
        if errors:
            self.stdout.write(self.style.ERROR(
                "\n🚨 XAVFLI MIGRATION — Commit qilishdan OLDIN:\n"
                "   1. python manage.py backup_db  (Phase 0.3)\n"
                "   2. Stage/Staging'da sinab ko'ring\n"
                "   3. Production'da kuzatish (Sentry, alerts)\n"
                "   4. Rollback rejasi yozing (RUNBOOK.md E.1)\n"
                "\n"
                "   --strict bayrog'i bilan: commit BLOKLANADI.\n"
                "   Rasman davom etish: git commit --no-verify\n"
            ))
        elif warnings:
            self.stdout.write(self.style.WARNING(
                "\n⚠️  Diqqat kerak — qo'lda tekshiring. Backup tavsiya etiladi."
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                "\n✅ Faqat INFO darajadagi o'zgarishlar — odatda xavfsiz."
            ))
