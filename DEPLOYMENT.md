# 🚀 Bozor Deployment Guide

> Yangi serverda Bozor'ni production'ga qo'yish bo'yicha to'liq qadamba-qadam qo'llanma.
> Birinchi deploy uchun — boshidan oxirigacha o'qing. Subsequent deploy'lar uchun
> — faqat tegishli bo'limni ochng.

| Versiya | Sana | Phase'lar qamrab oladi |
|---------|------|-----------------------|
| 1.0 | 2026-06-01 | Phase 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.8, 0.9 |

## Mundarija

- **[1. Deploy oldidan checklist](#1-deploy-oldidan-checklist)** — boshlashdan oldin shart
- **[2. Render deploy (hozir, free tier)](#2-render-deploy-current-default)** — step-by-step
- **[3. Hetzner deploy (Phase 7, paid)](#3-hetzner-deploy-phase-7-paid-hosting)** — kelajakda
- **[4. GitHub Secrets](#4-github-secrets)** — backup workflow uchun
- **[5. Tasdiqlash (post-deploy verification)](#5-tasdiqlash-post-deploy-verification)**
- **[6. Keyingi deploy'lar](#6-keyingi-deploylar)** — kod o'zgarganda
- **[7. Rollback](#7-rollback)** — yiqilsa qaytarish
- **[8. Migration: Render → Hetzner](#8-migration-render--hetzner-emergency-yoki-phase-7)**

---

## 1. Deploy oldidan checklist

Hammasini "✅" qila olganingizda boshlang. Bittasi yo'q bo'lsa — to'xtang.

### 1.1 Tashqi xizmatlar tayyor

- [ ] **Render** hisob ochilgan (https://dashboard.render.com)
- [ ] **Backblaze B2** hisob + 2 ta bucket yaratilgan:
  - [ ] `bozor-media-cdn` (public, media uchun) — Phase 0.3'ga zarur emas
  - [ ] `bozor-backups` (PRIVATE, DB backup uchun) — Phase 0.3'ga zarur
- [ ] **Sentry** projects yaratilgan:
  - [ ] Django project → DSN olingan
  - [ ] Flutter project → DSN olingan (mobil uchun)
- [ ] **Telegram bot** sozlangan (Phase 0.5):
  - [ ] @BotFather → token
  - [ ] Bot bilan /start → chat_id
  - [ ] Test: `python manage.py test_telegram` ishladi
- [ ] **UptimeRobot** sozlangan (Phase 0.2):
  - [ ] Monitor: `https://YOUR-APP.onrender.com/healthz/?deep=1`
  - [ ] Telegram alert contact
- [ ] **Eskiz.uz** hisob (https://my.eskiz.uz)
  - [ ] API kabineti email + parol
  - [ ] Balans to'ldirilgan (50,000+ UZS tavsiya)
- [ ] **Cloudinary** hisob (yoki B2 media bucket)
  - [ ] Cloud name + API key/secret

### 1.2 Domen (ixtiyoriy, lekin tavsiya)

- [ ] Domen sotib olingan (yourdomain.com yoki yourdomain.uz)
- [ ] DNS sozlanadi keyinroq (Render'da CNAME ko'rsatadi)

### 1.3 Kalit shaxslar

- [ ] **Birinchi super_admin telefon** raqami aniq
- [ ] **Ikkinchi super_admin (backup)** telefon — Phase 0.7 da +998 94 112 67 77
- [ ] **1Password / Bitwarden** parol menejer tayyor (parol saqlash uchun)

### 1.4 Kod tayyor

- [ ] Kod GitHub'da (private repo)
- [ ] `main` branch'da oxirgi versiya
- [ ] Mahalliy lokal'da `python manage.py check_deployment` o'tdi

---

## 2. Render deploy (current default)

### 2.1 PostgreSQL service yaratish

1. Dashboard → New + → **PostgreSQL**
2. Sozlamalar:
   - **Name:** `bozor-db`
   - **Region:** Frankfurt (EU'ga yaqin, latency past)
   - **PostgreSQL Version:** 16 (bizning backup tool'ga mos)
   - **Plan:** Free (90 kun, keyin yangilash kerak — kalendarda eslatib qo'ying!)
3. Create Database
4. ⏳ ~1 daqiqada tayyor
5. **DATABASE_URL'ni nusxalang:** "Internal Connection URL" qismidan

### 2.2 Redis service yaratish

1. Dashboard → New + → **Redis**
2. Sozlamalar:
   - **Name:** `bozor-redis`
   - **Region:** Frankfurt (DB bilan bir xil!)
   - **Plan:** Free (25 MB — yetarli)
   - **Eviction policy:** allkeys-lru
3. Create Redis Instance
4. ⏳ Tayyor
5. **REDIS_URL nusxalang**

### 2.3 Web service yaratish

1. Dashboard → New + → **Web Service**
2. Connect repository (GitHub) → sizning repo'ni tanlang
3. Sozlamalar:
   - **Name:** `bozor-backend`
   - **Region:** Frankfurt
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:**
     ```
     pip install -r requirements.txt && python manage.py collectstatic --noinput
     ```
   - **Start Command:**
     ```
     gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
     ```
   - **Plan:** Free
   - **Auto-Deploy:** Yes (main branch'ga push qilinganda avto-deploy)

### 2.4 Environment Variables sozlash

Render dashboard → service → **Environment** tab.

`backend/.env.production.example`'dan har bir `<TODO>` ni to'ldiring:

| Variable | Manba |
|----------|-------|
| `DJANGO_SECRET_KEY` | `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | `bozor-backend.onrender.com,yourdomain.com` |
| `DJANGO_ADMIN_URL` | tasodifiy slug: `xufiya-7k2m` |
| `DATABASE_URL` | 2.1 dan nusxalandi |
| `REDIS_URL` | 2.2 dan nusxalandi |
| `CORS_ALLOWED_ORIGINS` | frontend domeni |
| `SECURE_SSL_REDIRECT` | `True` |
| `CDN_PROVIDER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard |
| `B2_KEY_ID` | B2 → App Keys (backup-uchun) |
| `B2_APPLICATION_KEY` | B2 → App Keys (backup-uchun) |
| `B2_BUCKET_BACKUPS` | `bozor-backups` |
| `B2_ENDPOINT_URL` | `https://s3.us-west-004.backblazeb2.com` |
| `ESKIZ_EMAIL` | Eskiz hisobi |
| `ESKIZ_PASSWORD` | Eskiz hisobi |
| `ESKIZ_SENDER` | `4546` (default) |
| `SENTRY_DSN` | Sentry Django project |
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | getUpdates'dan |
| `BACKUP_SUPERUSER_PHONE` | `+998941126777` (default) |

### 2.5 Health Check sozlash

Render dashboard → service → **Settings**:
- **Health Check Path:** `/healthz/`
- (Deep check `/healthz/?deep=1` ham mos, lekin Render uchun shallow tezroq)

### 2.6 Birinchi deploy

1. **Manual Deploy** → **Clear build cache & deploy**
2. ⏳ ~3-5 daqiqa kuting
3. Build log'larini kuzatib turing — xato bo'lsa to'xtaydi

**Birinchi deploy odatda ishlamaydi** — bu normal. Sabablari:
- Env var unutilgan
- Migration ishlatilmagan
- Static files yo'q

Logs'da xato'ni topib tuzating, qaytadan deploy.

### 2.7 Migration ishga tushirish

Build command'da `migrate` yo'q (xavfsizroq — qo'lda boshqarish). Render dashboard → **Shell** tab:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

### 2.8 Birinchi super_admin yaratish

```bash
# Render Shell'da:
python manage.py createsuperuser
# Phone, password kiritish
```

### 2.9 Backup super_admin yaratish

```bash
python manage.py create_backup_superuser
```

**Chiqarilgan parolni 1Password'da SAQLANG** (qayta ko'rsatilmaydi!).

### 2.10 Custom domen (ixtiyoriy)

1. Render service → **Settings** → **Custom Domains** → Add
2. Sizga ko'rsatilgan CNAME yozuvini DNS provayder'da qo'shing
3. Cloudflare → DNS → CNAME: `@` → `bozor-backend.onrender.com`
4. ⏳ DNS tarqalgandan keyin SSL avto sozlanadi (~10 daqiqa)

---

## 3. Hetzner deploy (Phase 7 — paid hosting)

Bu — bayron qilingan loyiha uchun. Hozircha Render free tier'da qoldiringizu **Phase 7** ga tegishli. Faqat o'rinli vaqt kelganda o'qing.

### 3.1 VPS olish

1. https://accounts.hetzner.com → Cloud
2. New Project → **Bozor Production**
3. New Server:
   - **Location:** Falkenstein, Germany (EU'ga yaqin)
   - **Image:** Ubuntu 24.04
   - **Type:** CPX11 (~$5/oy, 2 vCPU, 4 GB RAM)
   - **SSH Key:** yuklang yoki yarating

### 3.2 Server tayyorlash

```bash
ssh root@<HETZNER_IP>

# Yangilash
apt update && apt upgrade -y

# Asosiy paketlar
apt install -y postgresql postgresql-contrib redis-server nginx python3-pip python3-venv certbot python3-certbot-nginx git

# Firewall
ufw allow ssh
ufw allow 80
ufw allow 443
ufw enable
```

### 3.3 PostgreSQL sozlash

```bash
sudo -u postgres psql
CREATE USER bozor_user WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE bozor_db OWNER bozor_user;
\q
```

`DATABASE_URL=postgres://bozor_user:STRONG_PASSWORD_HERE@localhost:5432/bozor_db`

### 3.4 Backend deploy

```bash
cd /opt
git clone https://github.com/<YOUR_REPO>.git bozor
cd bozor/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# .env yaratish
cp .env.production.example .env
nano .env  # qiymatlarni to'ldirish

# Migration
python manage.py migrate
python manage.py collectstatic --noinput

# Test
python manage.py check_deployment
```

### 3.5 Systemd service

```bash
cat > /etc/systemd/system/bozor.service <<EOF
[Unit]
Description=Bozor Django
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/bozor/backend
ExecStart=/opt/bozor/backend/venv/bin/gunicorn core.wsgi:application --bind 127.0.0.1:8000 --workers 4 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable bozor
systemctl start bozor
```

### 3.6 Nginx + SSL

```bash
cat > /etc/nginx/sites-available/bozor <<EOF
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/bozor /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 3.7 Cron — backup va Celery

```bash
# /etc/cron.d/bozor
0 3 * * * www-data cd /opt/bozor/backend && /opt/bozor/backend/venv/bin/python manage.py backup_db
```

(Yoki Celery Beat — settings.py'da BEAT_SCHEDULE allaqachon bor)

---

## 4. GitHub Secrets

Backup workflow (.github/workflows/backup-db.yml) uchun secrets kerak.

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Manba |
|--------|-------|
| `DATABASE_URL` | Render PostgreSQL "External Connection URL" (Internal Actions'dan ishlamaydi!) |
| `B2_KEY_ID` | B2 → App Keys (backup uchun) |
| `B2_APPLICATION_KEY` | B2 → App Keys |
| `B2_BUCKET_BACKUPS` | `bozor-backups` |
| `B2_ENDPOINT_URL` | `https://s3.us-west-004.backblazeb2.com` |
| `B2_REGION` | `us-west-004` |
| `TELEGRAM_BOT_TOKEN` | @BotFather token |
| `TELEGRAM_ADMIN_CHAT_ID` | chat_id |

**Test:** Repo → Actions → "Daily Database Backup" → Run workflow → muvaffaqiyatli bo'lishi shart.

---

## 5. Tasdiqlash (post-deploy verification)

Hamma deploy'dan keyin **shu protsedurani bajaring:**

### 5.1 Avtomat tekshiruv

```bash
# Render Shell yoki SSH'da
python manage.py check_deployment
```

Kutilgan natija:
```
  ✅ Django settings              Environment: PRODUCTION (DEBUG=False)
  ✅ Database connection          Engine: postgresql
  ✅ Redis cache                  Backend: RedisCache
  ✅ Pending migrations           Hamma migration'lar tayyor
  ✅ SECRET_KEY xavfsizlik        Uzunlik: 50 belgi
  ✅ ALLOWED_HOSTS                3 ta domain: yourdomain.com, ...
  ✅ CORS_ALLOWED_ORIGINS         2 ta origin
  ✅ ADMIN URL maxfiy             Maxfiy: 'xufiya-7k2m/'
  ✅ SECURE_SSL_REDIRECT          SECURE_SSL_REDIRECT=True
  ✅ Sentry DSN                   DSN: https://abc@o123.ingest.sentry.io...
  ✅ Telegram bot                 Bot: @bozor_alert_bot, chat: 123456789
  ✅ Backblaze B2 (backup)        Bucket: bozor-backups
  ✅ Eskiz SMS                    Balans: 125,000 UZS
  ✅ Cloudinary CDN               Cloud: bozor-prod
  ✅ Backup super_admin           Mavjud: +998941126777

  ✅ Deploy uchun TAYYOR
```

### 5.2 Qo'lda smoke test

```bash
# Server tirik?
curl https://yourdomain.com/healthz/
# {"status":"healthy",...}

# Deep check (DB, cache)?
curl https://yourdomain.com/healthz/?deep=1
# {"status":"healthy","checks":{...}}

# Asosiy sahifa?
curl -I https://yourdomain.com/api/main/
# 200 OK

# Telegram alert ishlaydi?
python manage.py test_telegram
# Telegram'ga 4 ta xabar

# Backup workflow?
# GitHub → Actions → "Daily Database Backup" → Run workflow
# 5 daqiqada ko'rasiz
```

### 5.3 Manual UI test

1. `https://yourdomain.com/auth` → super_admin telefon → SMS kod → kirish
2. `https://yourdomain.com/admin` (yoki maxfiy URL) → Django admin
3. Mahsulot qo'shib ko'ring
4. Tarjima uz/ru/en ishlayotganini tekshiring

---

## 6. Keyingi deploy'lar

### Render: auto-deploy on push

```bash
git push origin main
# Render avtomat deploy boshlaydi
```

Dashboard → service → **Deploys** tabda kuzatib turing.

### Hetzner: manual

```bash
ssh root@<HETZNER_IP>
cd /opt/bozor
git pull origin main
cd backend
source venv/bin/activate
pip install -r requirements.txt  # yangi paket bo'lsa
python manage.py migrate
python manage.py collectstatic --noinput
systemctl restart bozor
```

### Deploy'dan keyin har safar:

```bash
python manage.py check_deployment
```

---

## 7. Rollback

### Render

Dashboard → service → **Deploys** → eski versiya → **Rollback to this deploy**

⏳ ~30 soniyada eski versiya qaytadi.

### Hetzner

```bash
cd /opt/bozor
git log --oneline -10
git checkout <OLD_COMMIT_HASH>
# Migration rollback:
python manage.py migrate <app_name> <previous_migration>
systemctl restart bozor
```

### DB rollback (eng so'nggi backup'dan)

```bash
python manage.py restore_db --latest --confirm
```

(To'liq protsedura: RUNBOOK.md → E.1)

---

## 8. Migration: Render → Hetzner (Emergency yoki Phase 7)

Render'dan Hetzner'ga ko'chish — paid'ga o'tish va Render account suspend hollarida.

### 8.1 Hetzner serverini tayyorlash

Bo'lim 3 dagidek (3.1 - 3.6 qadamlar).

### 8.2 Ma'lumotlarni ko'chirish

```bash
# 1. Render'da oxirgi backup qo'lda yaratish
# Render Shell:
python manage.py backup_db

# 2. Hetzner'da o'sha backup'ni tiklash
ssh root@<HETZNER_IP>
cd /opt/bozor/backend
source venv/bin/activate

# B2 dan oxirgi backup'ni olib tiklash
python manage.py restore_db --latest --confirm \
    --target-url=postgres://bozor_user:STRONG_PASS@localhost:5432/bozor_db
```

### 8.3 DNS yangilash

1. DNS provayder → A record → Hetzner IP
2. TTL 300 → 5 daqiqada tarqaladi
3. SSL — certbot avtomat
4. Render → service → Suspend (faqat tasdiqlangandan keyin)

### 8.4 Tasdiqlash

```bash
# DNS tarqaldimi?
dig +short yourdomain.com
# Hetzner IP qaytarishi shart

# Sayt ishlayaptimi?
curl https://yourdomain.com/healthz/?deep=1

# Backup ishlayaptimi?
python manage.py check_deployment
```

### 8.5 Render'dan to'liq chiqish (1 hafta keyin)

1 hafta — Hetzner barqaror ishlasin (rollback uchun):

1. Render dashboard → har bir service → **Delete**
2. Hisobni to'lov uchun faollashtirilgan bo'lsa, ulanishni bekor qiling

---

## Versiya tarixi

| Versiya | Sana | O'zgarishlar |
|---------|------|--------------|
| 1.0 | 2026-06-01 | Birinchi versiya. Phase 0.x to'liq qamrab oladi |

**TODO (keyingi versiyada):**
- Phase 1.1 (Audit log) — deploy'dan keyin tekshirish kerakli yangi punktlar
- Phase 2.x (Delivery proof) — yangi env var'lar
- CI/CD avtomatik deploy guardi (`check_deployment` `--strict` bilan)
