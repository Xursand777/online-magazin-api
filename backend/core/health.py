"""
core/health.py — External monitoring uchun health check endpoint.

ISHLATILISH:
  • UptimeRobot      — server o'lganda 5 daqiqada Telegram alert
  • Render Health    — deploy paytida ready holatini bilish
  • Manual debug     — admin tomonidan tekshirish

DIZAYN — 2 ta rejim:

  GET /healthz/
    SHALLOW: faqat Django jarayoni javob bera olyaptimi.
    ~5ms. DB ga tegmaydi. Render deploy uchun mos (tezroq deploy).

  GET /healthz/?deep=1
    DEEP: DB ulanish + Cache yozish/o'qish testi.
    ~50ms (kesh issiq) yoki ~100ms (kesh sovuq).
    UptimeRobot uchun mos — haqiqiy bog'liqlik fail bo'lsa topadi.

CACHE STRATEGIYASI:
  Deep natija 30 soniya cache'da saqlanadi. Sabab: UptimeRobot 5 daqiqa
  intervalda ping qiladi, lekin Render Health 30 soniya, va ehtimol qo'lda
  ham tekshiriladi. Cache bo'lmasa har ping DB ni o'rtacha 12 marta/soatda
  ko'radi. Cache bilan: o'rtacha 2 marta/soatda.

OVERALL STATUS:
  healthy   — hammasi ok (200 OK)
  degraded  — Cache fail, lekin LocMemCache fallback ishlayapti (200 OK)
  unhealthy — DB fail yoki kritik komponent (503 Service Unavailable)

NEGA 503:
  UptimeRobot, Render, va boshqalar 2xx-ni "ok", 5xx-ni "down" deb biladi.
  503 = "ishlamayapti, biroz vaqtdan keyin qayta urinib ko'ring".

TELEGRAM ALERT:
  Critical fail bo'lsa, qo'shimcha Telegram xabar yuborilad ((dedup bilan).
  UptimeRobot ham yuboradi — bu ikkinchi zaxira: UptimeRobot o'zi
  yiqilsa, biz baribir bilamiz.

XAVFSIZLIK:
  Endpoint public. Sizib chiqadigan ma'lumot:
    - DB engine nomi (postgresql/sqlite)
    - Cache backend nomi
  Bu ma'lumotlar attacker uchun katta foyda bermaydi (hujum yuzasini
  kengaytirmaydi). Stack version, secret key, file path SIZIB CHIQMAYDI.
"""
from __future__ import annotations

import logging
import os
import time

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views import View

logger = logging.getLogger(__name__)


# Deep check natijasini keshlash kaliti va muddati
_HEALTH_CACHE_KEY = 'bozor:health:state'
_HEALTH_CACHE_TTL = 30

# Probe (test) yozuvi uchun unique cache key
_HEALTH_PROBE_KEY = 'bozor:health:probe'

# Jarayon ishga tushgan vaqt — uptime hisoblash uchun
_PROCESS_START_TIME = time.time()


# ── Yordamchi funksiyalar ────────────────────────────────────────────────────


def _short_version() -> str:
    """
    Git commit SHA ning birinchi 7 belgisi.
    CI/CD pipeline'da o'rnatiladi: GIT_COMMIT_SHA=$(git rev-parse HEAD)
    Yo'q bo'lsa 'dev' qaytaradi.
    """
    sha = os.getenv('GIT_COMMIT_SHA', '').strip()
    return sha[:7] if sha else 'dev'


def _environment() -> str:
    """'production' yoki 'development' — DEBUG flag bo'yicha."""
    return 'production' if not settings.DEBUG else 'development'


def _maybe_alert(failed_check_names: list[str], checks_detail: dict) -> None:
    """
    Health check muvaffaqiyatsiz bo'lsa Telegram'ga xabar yuborish.

    Dedup notifications.py'da avtomat: 5 daqiqada bir xil xabar 1 marta.
    Telegram xato bo'lsa silently log'ga yozadi — health check'ni buzmaydi.

    Sabab: UptimeRobot ham alert yuboradi, lekin u o'zi yiqilsa, biz
    baribir Telegram'dan bilamiz. Bu — zaxira yo'l.
    """
    if not failed_check_names:
        return

    try:
        # Import bu yerda chunki notifications.py settings yuklangandan keyin
        from core.notifications import alert_critical

        lines = [
            "Health check FAIL — server bog'liqliklari ishlamayapti.",
            "",
            f"Xato qismlar: `{', '.join(failed_check_names)}`",
            f"Environment: `{_environment()}`",
            f"Version: `{_short_version()}`",
            "",
            "Tafsilot:",
        ]
        for name, info in checks_detail.items():
            status = info.get('status', '?')
            line = f"  • {name}: {status}"
            error = info.get('error')
            if error:
                # Telegram Markdown'da backtik ichidagi matn xavfsiz
                line += f" — `{error[:100]}`"
            lines.append(line)

        alert_critical("\n".join(lines))

    except Exception as exc:
        # Telegram chaqiruv health check ishlashiga ta'sir qilmasin
        logger.warning('Telegram alert yuborishda xato: %s', exc)


# ── View ──────────────────────────────────────────────────────────────────────


class HealthCheckView(View):
    """
    GET /healthz/         → shallow (200, process tirik)
    GET /healthz/?deep=1  → deep (200 healthy / 200 degraded / 503 unhealthy)

    Public endpoint — autentifikatsiya talab qilinmaydi.
    """

    def get(self, request, *args, **kwargs):
        request_start = time.time()
        is_deep = request.GET.get('deep', '0') == '1'

        if is_deep:
            return self._deep_check(request_start)
        return self._shallow_check(request_start)

    # ── Shallow check ────────────────────────────────────────────────────────

    def _shallow_check(self, request_start: float) -> JsonResponse:
        """Faqat Django jarayoni javob bera olishini tasdiqlaydi."""
        return JsonResponse({
            'status': 'healthy',
            'mode': 'shallow',
            'environment': _environment(),
            'version': _short_version(),
            'uptime_seconds': int(time.time() - _PROCESS_START_TIME),
            'response_time_ms': int((time.time() - request_start) * 1000),
            'timestamp': int(time.time()),
        })

    # ── Deep check ───────────────────────────────────────────────────────────

    def _deep_check(self, request_start: float) -> JsonResponse:
        """DB + Cache tekshiruvi (30 soniya kesh bilan)."""
        # 1. Avval cache'dan qaytarib ko'rish
        cached = self._read_cache()
        if cached is not None:
            return self._respond_cached(cached, request_start)

        # 2. Tekshiruvlarni bajarish
        checks = {
            'db': self._check_db(),
            'cache': self._check_cache(),
        }

        # 3. Umumiy holat hisoblash
        overall = self._compute_overall(checks)

        # 4. Javob qurish
        result = {
            'status': overall,
            'mode': 'deep',
            'environment': _environment(),
            'version': _short_version(),
            'uptime_seconds': int(time.time() - _PROCESS_START_TIME),
            'checks': checks,
            'cached': False,
            'response_time_ms': int((time.time() - request_start) * 1000),
            'timestamp': int(time.time()),
        }

        # 5. Cache'ga saqlash (agar cache ishlasa)
        self._write_cache(result)

        # 6. Kritik fail bo'lsa Telegram alert
        if overall == 'unhealthy':
            failed = [name for name, info in checks.items() if info['status'] != 'ok']
            _maybe_alert(failed, checks)

        return JsonResponse(result, status=503 if overall == 'unhealthy' else 200)

    # ── Cache wrapper'lar (xato yutib oladi) ─────────────────────────────────

    def _read_cache(self) -> dict | None:
        try:
            return cache.get(_HEALTH_CACHE_KEY)
        except Exception as exc:
            logger.debug('Health cache.get xato: %s', exc)
            return None

    def _write_cache(self, result: dict) -> None:
        try:
            cache.set(_HEALTH_CACHE_KEY, result, timeout=_HEALTH_CACHE_TTL)
        except Exception as exc:
            logger.debug('Health cache.set xato: %s', exc)

    def _respond_cached(self, cached: dict, request_start: float) -> JsonResponse:
        # Cache'dagi dict'ni mutatsiya qilmaslik uchun nusxa olamiz
        data = dict(cached)
        data['cached'] = True
        data['response_time_ms'] = int((time.time() - request_start) * 1000)
        status_code = 503 if data.get('status') == 'unhealthy' else 200
        return JsonResponse(data, status=status_code)

    # ── Individual tekshiruvlar ──────────────────────────────────────────────

    def _check_db(self) -> dict:
        """
        DB connection SELECT 1 — eng yengil test.
        DB engine nomini qaytaradi (postgresql/sqlite/mysql/oracle).
        """
        start = time.time()
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
                cursor.fetchone()
            return {
                'status': 'ok',
                'engine': connection.vendor,
                'duration_ms': int((time.time() - start) * 1000),
            }
        except Exception as exc:
            return {
                'status': 'fail',
                'engine': getattr(connection, 'vendor', 'unknown'),
                'error': str(exc)[:200],
                'duration_ms': int((time.time() - start) * 1000),
            }

    def _check_cache(self) -> dict:
        """
        Cache backend yozish va o'qish testi.
        Unique probe yozadi va qayta o'qiydi — read-write consistency tekshiradi.
        """
        start = time.time()
        backend_name = type(cache).__name__
        try:
            probe_value = f'probe-{time.time()}'
            cache.set(_HEALTH_PROBE_KEY, probe_value, timeout=10)
            retrieved = cache.get(_HEALTH_PROBE_KEY)
            consistent = (retrieved == probe_value)
            return {
                'status': 'ok' if consistent else 'fail',
                'backend': backend_name,
                'duration_ms': int((time.time() - start) * 1000),
                **({'error': 'probe mismatch — cache read/write inconsistency'}
                   if not consistent else {}),
            }
        except Exception as exc:
            return {
                'status': 'fail',
                'backend': backend_name,
                'error': str(exc)[:200],
                'duration_ms': int((time.time() - start) * 1000),
            }

    # ── Holat hisoblash ──────────────────────────────────────────────────────

    @staticmethod
    def _compute_overall(checks: dict) -> str:
        """
        DB (kritik):     fail = unhealthy (503)
        Cache (degraded): fail = degraded (200, lekin status ko'rsatiladi)

        Sabab: Cache yiqilsa, LocMemCache fallback ishlaydi (degraded
        rejimda multi-worker'lar uchun sinxron emas, lekin server ishlayveradi).
        DB yiqilsa, hech narsa ishlamaydi.
        """
        critical = ['db']
        degraded_only = ['cache']

        if any(checks[name]['status'] != 'ok' for name in critical):
            return 'unhealthy'
        if any(checks[name]['status'] != 'ok' for name in degraded_only):
            return 'degraded'
        return 'healthy'
