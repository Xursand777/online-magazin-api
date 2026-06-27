# ─────────────────────────────────────────────────────────────────────────────
#  Bozor backend — production image (Django + Gunicorn / Celery)
#  runtime.txt bilan mos: Python 3.11.9
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11.9-slim-bookworm

# Python xulq-atvori
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=core.settings

# Tizim bog'liqliklari:
#   - curl: Docker healthcheck uchun
#   - postgresql-client-18: Phase 0.3+ — backup_db management command pg_dump
#     CLI orqali consistent dump oladi. Docker image'i db konteynerining
#     Postgres versiyasiga AYNAN MOS bo'lishi shart (docker-compose.yml —
#     postgres:18-alpine). Bookworm default = 15 — eski; biz pgdg apt
#     source orqali 18-ni o'rnatamiz. pg_dump versiyasi serverdan ESKIROQ
#     bo'lsa "server version newer than pg_dump" xato beradi.
#   (psycopg2-binary, Pillow, boto3, cryptography — manylinux wheels, OK)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg lsb-release \
    && install -d -m 0755 /etc/apt/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] \
        http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && apt-get purge -y gnupg lsb-release \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Avval requirements — Docker layer cache'dan unum olish (kod o'zgarsa qayta o'rnatmaydi)
COPY requirements.txt .
RUN pip install -r requirements.txt

# Loyiha kodi
COPY . .

# Root bo'lmagan foydalanuvchi (xavfsizlik — konteyner buzilsa zarar cheklangan)
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/staticfiles /app/logs /app/media \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Default buyruq — gunicorn (docker-compose'da har bir servis o'zini override qiladi)
CMD ["gunicorn", "core.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "100", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
