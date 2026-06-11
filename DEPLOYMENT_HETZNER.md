# 🚀 Bozor — Hetzner + Cloudflare + R2 Deployment

> Professional, xavfsiz va arzon production stack. 10 000+ foydalanuvchi va
> 5 000+ mahsulot uchun mo'ljallangan. Server "qolib ketishi" (overload/DDoS)
> Cloudflare qatlami orqali oldi olinadi.

## Arxitektura

```
                      ┌──────────────────────┐
   Foydalanuvchi  →   │      CLOUDFLARE      │   CDN · DDoS · WAF · SSL · cache
                      │   (DNS + himoya)     │   "Always Online" — origin o'chsa
                      └───────┬──────────────┘   ham keshdan beradi
              ┌───────────────┼────────────────────┐
              ▼               ▼                     ▼
   bozor.uz / www      api.bozor.uz          cdn.bozor.uz
   ┌──────────────┐    ┌───────────────────┐  ┌──────────────┐
   │  Cloudflare  │    │  HETZNER VPS      │  │ Cloudflare   │
   │    Pages     │    │  ┌─────────────┐  │  │     R2       │
   │ (Frontend)   │    │  │ Nginx :443  │  │  │ (rasmlar)    │
   └──────────────┘    │  └──────┬──────┘  │  └──────────────┘
                       │   ┌─────▼─────┐   │
                       │   │ Gunicorn  │   │
                       │   │ (Django)  │   │
                       │   ├───────────┤   │
                       │   │ worker    │   │  Celery
                       │   │ beat      │   │
                       │   ├───────────┤   │
                       │   │ Postgres  │   │  Docker volume
                       │   │ Redis     │   │
                       │   └───────────┘   │
                       └───────────────────┘
                                │ kunlik backup
                                ▼
                       ┌──────────────┐
                       │ Backblaze B2 │  (DB backup — allaqachon sozlangan)
                       └──────────────┘
```

**Nega shunday:**
- **Hetzner (Germaniya)** — narx/quvvat bo'yicha eng yaxshi, EU latency O'zbekistonga mos.
- **Cloudflare** oldida — origin'ni overload va DDoS'dan himoya qiladi (asosiy "qolib ketmaslik" yechimi).
- **R2** — egress bepul, UZ'da ishonchli; kod `django-storages` S3 backend'ini ishlatadi.
- **Docker Compose** — takrorlanadigan, versiyalangan, bitta buyruq bilan deploy.

---

## 0. Talablar

- [ ] Domen (masalan `bozor.uz`) — `.uz` yoki `.com`
- [ ] Cloudflare hisob (bepul) — domen unга ulanadi
- [ ] Hetzner Cloud hisob — https://console.hetzner.cloud
- [ ] Mavjud tashqi xizmatlar: Eskiz, Telegram, Sentry, B2 (RUNBOOK.md'dagi)

---

## 1. Hetzner serverini yaratish

1. Hetzner Console → **New Server**
   - **Location:** Falkenstein yoki Nürnberg (Germaniya)
   - **Image:** Ubuntu 24.04
   - **Type:** **CPX21** (3 vCPU / 4GB / ~€8/oy) — boshlash uchun.
     O'sganda **CPX31** (4 vCPU / 8GB) ga bir necha daqiqada resize.
   - **SSH Key:** o'zingizning public key'ingizni yuklang
2. Server yaratilgach IP manzilini oling.

### 1.1 Dastlabki hardening

```bash
ssh root@<SERVER_IP>

# Yangilash + avtomat xavfsizlik yangilanishlari
apt update && apt upgrade -y
apt install -y unattended-upgrades fail2ban ufw curl git
dpkg-reconfigure -plow unattended-upgrades

# Firewall — SSH ochiq, 80/443 keyin (faqat Cloudflare'ga)
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw enable
```

### 1.2 Docker o'rnatish

```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

---

## 2. Cloudflare DNS sozlash

Domeningizni Cloudflare'ga ulang (Add site → nameserver'larni almashtiring), keyin **DNS → Records**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `api` | `<SERVER_IP>` | 🟧 Proxied |
| CNAME | `@` (bozor.uz) | Cloudflare Pages domeni | 🟧 Proxied |
| CNAME | `www` | Cloudflare Pages domeni | 🟧 Proxied |
| CNAME | `cdn` | (R2 custom domen — 3-bo'limda avtomat) | 🟧 Proxied |

> 🟧 **Proxied (to'q sariq bulut) SHART** — shu orqali CDN, DDoS, cache ishlaydi.

### 2.1 SSL/TLS sozlamalari

- **SSL/TLS → Overview → Full (strict)**
- **SSL/TLS → Edge Certificates → Always Use HTTPS: ON**, **HSTS: ON** (max-age 6 oy)

### 2.2 Origin sertifikat (api uchun)

- **SSL/TLS → Origin Server → Create Certificate** → `api.bozor.uz` (yoki `*.bozor.uz`)
- Ikki matnni serverga saqlang:
  - `deploy/nginx/certs/origin.pem` (certificate)
  - `deploy/nginx/certs/origin.key` (private key)

### 2.3 Firewall'ni faqat Cloudflare'ga ochish (origin'ni yashirish)

```bash
# Cloudflare IP diapazonlarini UFW'ga qo'shish (443 + 80 faqat ulardan)
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 443 proto tcp; done
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from $ip to any port 80  proto tcp; done
for ip in $(curl -s https://www.cloudflare.com/ips-v6); do ufw allow from $ip to any port 443 proto tcp; done
ufw reload
```

> Natija: serverga to'g'ridan-to'g'ri (Cloudflare'ni chetlab) hech kim kira olmaydi.
> `nginx/api.conf`'dagi `CF-Connecting-IP` real mijoz IP'sini tiklaydi.

### 2.4 WAF va rate limiting (overload himoyasi)

- **Security → WAF → Managed Rules: ON**
- **Security → Bots → Bot Fight Mode: ON**
- **Security → WAF → Rate limiting rules** — masalan `/api/*` uchun IP bo'yicha 100 req/min.
- **Caching → Cache Rules** — `/static/*` uchun "Cache Everything" (Django admin statiklari CDN'dan).

---

## 3. Cloudflare R2 (mahsulot rasmlari)

1. Cloudflare → **R2 → Create bucket**: `bozor-media`
2. **R2 → Manage API Tokens → Create** (Object Read & Write):
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
   - Account ID (R2 sahifa tepasida) → `R2_ACCOUNT_ID`
3. **Bucket → Settings → Custom Domains → Connect Domain**: `cdn.bozor.uz`
   (Cloudflare DNS'ga avtomat CNAME qo'shadi → `R2_PUBLIC_DOMAIN=cdn.bozor.uz`)
4. Bu qiymatlar `backend/.env`'ga yoziladi (pastda).

---

## 4. Kodni serverga olish va `.env` to'ldirish

```bash
cd /opt
git clone https://github.com/<YOUR_REPO>.git bozor
cd bozor
```

`backend/.env` yarating (`.env.production.example`'dan keng namuna; bu yerda
Docker + R2 uchun to'liq variant):

```dotenv
# ── Django core ──
DJANGO_SECRET_KEY=<python -c "from django.core.management.utils import get_random_secret_key as k; print(k())">
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.bozor.uz,localhost,127.0.0.1
DJANGO_ADMIN_URL=<tasodifiy-slug-masalan-x7k2m9>
OTP_DEBUG=False
SECURE_SSL_REDIRECT=True
ENABLE_API_DOCS=False

# ── CORS (frontend domeni) ──
CORS_ALLOWED_ORIGINS=https://bozor.uz,https://www.bozor.uz

# ── PostgreSQL (Docker servis) ──
POSTGRES_DB=bozor
POSTGRES_USER=bozor
POSTGRES_PASSWORD=<KUCHLI_TASODIFIY_PAROL>
DATABASE_URL=postgres://bozor:<XUDDI_O'SHA_PAROL>@db:5432/bozor

# ── Redis (Docker servis) ──
REDIS_URL=redis://redis:6379/1

# ── CDN: Cloudflare R2 ──
CDN_PROVIDER=r2
R2_ACCOUNT_ID=<cloudflare_account_id>
R2_ACCESS_KEY_ID=<r2_access_key>
R2_SECRET_ACCESS_KEY=<r2_secret>
R2_BUCKET_NAME=bozor-media
R2_PUBLIC_DOMAIN=cdn.bozor.uz

# ── SMS / Telegram / Sentry / Backup (RUNBOOK'dagi qiymatlar) ──
ESKIZ_EMAIL=<...>
ESKIZ_PASSWORD=<...>
ESKIZ_SENDER=4546
TELEGRAM_BOT_TOKEN=<...>
TELEGRAM_ADMIN_CHAT_ID=<...>
SENTRY_DSN=<...>
GIT_COMMIT_SHA=
BACKUP_SUPERUSER_PHONE=+998941126777

# ── DB backup → Backblaze B2 ──
B2_KEY_ID=<...>
B2_APPLICATION_KEY=<...>
B2_BUCKET_BACKUPS=bozor-backups
B2_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
BACKUP_RETENTION_DAYS=30
```

> ⚠️ `DATABASE_URL`'dagi parol `POSTGRES_PASSWORD` bilan **bir xil** bo'lsin.
> Hostlar `db` va `redis` — Docker servis nomlari (Compose ichki tarmoq).

### 4.1 Origin sertifikatlarni joylash

```bash
nano deploy/nginx/certs/origin.pem   # Cloudflare certificate
nano deploy/nginx/certs/origin.key   # Cloudflare private key
chmod 600 deploy/nginx/certs/origin.key
```

### 4.2 `api.conf`'da domenni almashtirish

`deploy/nginx/api.conf`'dagi `api.bozor.uz` (TODO) ni o'z domeningizga moslang.

---

## 5. Ishga tushirish

```bash
cd /opt/bozor
docker compose up -d --build

# Loglarni kuzatish (web migrate + collectstatic ni bajaradi)
docker compose logs -f web
```

### 5.1 Superuser yaratish

```bash
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py create_backup_superuser   # backup admin
```

### 5.2 Deploy sog'lig'ini tekshirish

```bash
docker compose exec web python manage.py check_deployment
```

---

## 6. Frontend → Cloudflare Pages

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → repo'ni tanlang.
2. Build sozlamalari:
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
3. **Environment variables:**
   - `VITE_API_URL = https://api.bozor.uz/api`
4. **Custom domains:** `bozor.uz` + `www.bozor.uz` qo'shing.

> `public/_redirects` (SPA routing) va `public/_headers` (xavfsizlik) avtomat qo'llanadi.

---

## 7. Backup (kunlik DB → B2)

Host'da cron — har kuni 03:00 da konteyner ichida `backup_db`:

```bash
crontab -e
# Quyidagini qo'shing:
0 3 * * * cd /opt/bozor && docker compose exec -T web python manage.py backup_db >> /var/log/bozor-backup.log 2>&1
```

> Eslatma: GitHub Actions backup workflow'i Render'ning tashqi DB URL'iga
> mo'ljallangan edi. Hetzner'da DB ichki (faqat Docker tarmog'ida), shuning
> uchun backup host cron orqali konteyner ichida ishlaydi.

---

## 8. Verifikatsiya (post-deploy)

```bash
# Server tirik?
curl https://api.bozor.uz/healthz/
# Deep (DB + cache)?
curl "https://api.bozor.uz/healthz/?deep=1"
# Telegram alert?
docker compose exec web python manage.py test_telegram
```

Brauzer:
1. `https://bozor.uz` → ochiladimi, rasmlar `cdn.bozor.uz`'dan kelyaptimi?
2. `https://bozor.uz/auth` → OTP login.
3. Mahsulot qo'shib ko'ring → rasm R2'ga yuklanadimi?

### UptimeRobot
- Monitor: `https://api.bozor.uz/healthz/?deep=1` (5 daqiqa interval) → Telegram alert.

---

## 9. Keyingi deploy'lar

```bash
ssh root@<SERVER_IP>
cd /opt/bozor
git pull origin main
docker compose up -d --build      # migrate + collectstatic avtomat (web servis)
docker compose exec web python manage.py check_deployment
```

## 10. Rollback

```bash
cd /opt/bozor
git checkout <ESKI_COMMIT>
docker compose up -d --build
# DB rollback kerak bo'lsa: docker compose exec web python manage.py restore_db --latest --confirm
```

---

## Xizmatlar boshqaruvi (cheat sheet)

```bash
docker compose ps                    # holat
docker compose logs -f web           # Django loglari
docker compose logs -f worker        # Celery loglari
docker compose restart web           # qayta ishga tushirish
docker compose exec web python manage.py shell
docker compose down                  # to'xtatish (volume saqlanadi)
docker compose down -v               # DIQQAT: volume'larni ham o'chiradi (DB yo'qoladi!)
```

---

## 🔒 Maksimal xavfsizlik (ixtiyoriy upgrade)

To'g'ridan-to'g'ri ochiq port umuman bo'lmasligi uchun **Cloudflare Tunnel
(`cloudflared`)** ishlatish mumkin — server hech qanday inbound port ochmaydi,
`cloudflared` tashqariga ulanadi. Bu holda Origin sertifikat va 443 portini
ochish shart emas. Keyingi bosqichda qo'shish mumkin.
```
