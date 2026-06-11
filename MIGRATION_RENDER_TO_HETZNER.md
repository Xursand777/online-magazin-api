# 🔄 Render → Hetzner Migratsiya (ma'lumot yo'qotmasdan)

> **Oltin qoida:** Render'ni (ayniqsa PostgreSQL'ni) **eng oxirida**, hammasi
> tekshirilib, bir necha kun barqaror ishlagandan keyin o'chiramiz.
> Bu hujjat tugaguncha **hech narsa o'chirilmaydi**.

## Hozirgi jonli topologiya (tasdiqlangan)

```
  Web (Vercel) ─────────┐
  Mobil (release APK) ──┼──►  Render backend (online-magazin-api.onrender.com)
                        │       └─► PostgreSQL  ←  BARCHA MA'LUMOT shu yerda
                        │
  • Vercel: ma'lumot YO'Q (statik)
  • Mobil: _renderUrl hardcoded (api_constants.dart)
  • Yagona ma'lumot xavfi: Render PostgreSQL
```

## Migratsiya tamoyillari

1. **Yangi (Hetzner) avval jonli** bo'ladi, eski (Render) **parallel** ishlab turadi.
2. Ma'lumot ko'chiriladi va **son-sanog'i solishtirib** tekshiriladi.
3. Backend uchun **doimiy domen** ishlatamiz: `api.bozor.uz`.
   Shundan keyin server qayerga ko'chsa ham, web/mobil **o'zgarmaydi**.
4. Rasmlar (media) — **1-bosqichda Cloudinary'da qoladi** (rasm linklari sinmaydi).
   R2'ga o'tish — alohida, xavfsiz **2-bosqich**.
5. Mobil ilova yangilanmaguncha va eski versiyalar yo'qolmaguncha **Render tirik turadi**.

---

# BOSQICH 1 — Hetzner stack'ni jonli qilish

`DEPLOYMENT_HETZNER.md` bo'yicha 1–5 bo'limlarni bajaring (server, Docker, Cloudflare DNS, Origin cert). **Lekin `backend/.env`'da media uchun avval Cloudinary'ni ishlating** (rasmlar darhol ishlashi uchun):

```dotenv
# Migratsiya davrida — Render'dagi xuddi o'sha Cloudinary kalitlari:
CDN_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=<Render'dagi qiymat>
CLOUDINARY_API_KEY=<Render'dagi qiymat>
CLOUDINARY_API_SECRET=<Render'dagi qiymat>
# (R2 kalitlarini ham qo'shib qo'ying, lekin CDN_PROVIDER hozir cloudinary)
```

> Cloudinary kalitlarini Render Dashboard → service → **Environment** dan oling.

⚠️ **Hozir `docker compose up` QILMANG** — avval ma'lumotni ko'chiramiz (2-bosqich),
aks holda bo'sh baza yaratiladi.

---

# BOSQICH 2 — Ma'lumotlar bazasini ko'chirish (eng kritik)

> Hammasi Hetzner serverida, `/opt/bozor` papkasida bajariladi.

### 2.1 Render'ning TASHQI DB URL'ini oling
Render Dashboard → PostgreSQL service → **"External Database URL"** (Internal emas!).
Format: `postgres://user:pass@xxx.frankfurt-postgres.render.com/dbname`

### 2.2 Faqat DB va Redis'ni ko'taring (web hali emas)
```bash
cd /opt/bozor
docker compose up -d db redis
docker compose ps          # db "healthy" bo'lguncha kuting
```

### 2.3 Render'dan to'liq dump olish (faylга)
`db` konteyneridagi pg_dump (versiya 16 — mos) ishlatamiz, host'ga hech narsa
o'rnatish shart emas:

```bash
# Render tashqi URL'ini o'zgaruvchiga yozing (sslmode=require qo'shilgan):
RENDER_DB_URL='postgres://USER:PASS@HOST.frankfurt-postgres.render.com/DBNAME?sslmode=require'

docker compose exec -T -e RU="$RENDER_DB_URL" db \
  pg_dump "$RENDER_DB_URL" --no-owner --no-privileges --clean --if-exists \
  > render_backup_$(date +%F_%H%M).sql

ls -lh render_backup_*.sql      # ⚠️ Hajmi 0 bo'lmasin! (bir necha MB bo'lishi kerak)
```

### 2.4 Dump'ni Hetzner bazasiga yuklash
```bash
cat render_backup_*.sql | docker compose exec -T db psql -U bozor -d bozor
```
> `--clean --if-exists` tufayli takror ishga tushirsa ham xavfsiz (avval tozalaydi).
> `bozor` — `.env`'dagi `POSTGRES_USER`/`POSTGRES_DB` bilan bir xil bo'lsin.

### 2.5 ✅ TEKSHIRISH — son-sanoq bir xilmi? (eng muhim qadam)
```bash
echo "--- RENDER (eski) ---"
docker compose exec -T db psql "$RENDER_DB_URL" -t -c \
  "SELECT 'orders='||count(*) FROM orders_order;
   SELECT 'users='||count(*) FROM users_user;
   SELECT 'products='||count(*) FROM products_product;"

echo "--- HETZNER (yangi) ---"
docker compose exec -T db psql -U bozor -d bozor -t -c \
  "SELECT 'orders='||count(*) FROM orders_order;
   SELECT 'users='||count(*) FROM users_user;
   SELECT 'products='||count(*) FROM products_product;"
```
**Raqamlar bir xil bo'lsa** → ko'chirish muvaffaqiyatli. Bir xil bo'lmasa — 2.3'dan qayta.

### 2.6 Qolgan servislarni ko'tarish
```bash
docker compose up -d        # web migrate = no-op (schema allaqachon to'liq)
docker compose logs -f web
docker compose exec web python manage.py check_deployment
```

---

# BOSQICH 3 — Backend'ni `api.bozor.uz` orqali tekshirish

1. Cloudflare DNS: `api` (A) → Hetzner IP, 🟧 Proxied (DEPLOYMENT_HETZNER 2-bo'lim).
2. Tekshirish:
```bash
curl https://api.bozor.uz/healthz/
curl "https://api.bozor.uz/healthz/?deep=1"     # checks.db.status == "ok"
```
3. Brauzerda OTP login + mahsulotlar + rasmlar (Cloudinary'dan) ishlayotganini ko'ring.

> Bu paytda **Render hali tirik** — sayt/mobil hali eski serverda, hech narsa o'chmadi.

---

# BOSQICH 4 — Web frontend'ni yangi backend'ga o'tkazish

1. Cloudflare Pages → Project → Settings → **Environment Variables**:
   `VITE_API_URL = https://api.bozor.uz/api`
2. **Redeploy** (yoki yangi push).
3. `bozor.uz` + `www` domenlarini Pages'ga ulang (DEPLOYMENT_HETZNER 6-bo'lim).
4. Tekshirish: `https://bozor.uz` ochiladi, `api.bozor.uz` ga so'rov yuboradi
   (DevTools → Network).

---

# BOSQICH 5 — Mobil ilovani o'tkazish (eng ehtiyotkor qism)

⚠️ Foydalanuvchilar telefonidagi **o'rnatilgan APK hali Render'ga ulangan**.
Render'ni o'chirishdan oldin ularni yangi versiyaga o'tkazish SHART.

### 5.1 Kodda backend URL'ini almashtirish
`bozor_mobile/lib/core/network/api_constants.dart`:
```dart
// ESKI:
static const String _renderUrl = 'https://online-magazin-api.onrender.com';
// YANGI (doimiy domen):
static const String _prodUrl = 'https://api.bozor.uz';
```
(`baseUrl`/`localBaseUrls`'dagi `_renderUrl` larni `_prodUrl` ga moslang.)

> Bu o'zgartirishni sizning ruxsatingiz bilan men qilib beraman — `api.bozor.uz`
> jonli bo'lgach ayting.

### 5.2 Yangi versiya chiqarish
```bash
cd bozor_mobile
# pubspec.yaml'da version'ni oshiring (masalan 1.0.0+5 → 1.1.0+6)
flutter build appbundle --release      # Play Store uchun
# yoki: flutter build apk --release
```

### 5.3 Majburiy yangilanish (force-update)
Sizda `/api/app-config/` (MobileConfig) endpoint bor — **min versiya**ni
yangi versiyaga qo'ying. Eski ilova ochilganda "Yangilang" ekrani chiqadi.

> Min versiyani Render backend'da (eski apps shunga uradi) ham, Hetzner'da ham
> bir xil qiling.

### 5.4 Kuzatish
Eski versiyali faol o'rnatmalar (analytics / app-config so'rovlari) ~0 ga
tushguncha **Render'ni o'chirmaymiz**.

---

# BOSQICH 6 — Soak (kuzatuv) — 3–7 kun

- UptimeRobot: `https://api.bozor.uz/healthz/?deep=1`.
- Sentry'da yangi xatolar yo'qligini kuzating.
- Buyurtmalar, login, SMS, to'lov — hammasi yangi serverda ishlayaptimi?
- Render hali tirik → muammo bo'lsa DNS'ni orqaga qaytarib **rollback** mumkin.

---

# BOSQICH 7 (ixtiyoriy, keyin) — Media: Cloudinary → R2

Server barqaror bo'lgach, rasmlarni R2'ga ko'chiramiz (egress bepul, UZ'da ishonchli).
Bu **alohida, ehtiyotkor jarayon** — DB'dagi rasm yo'llari R2 kalitlariga mos
kelishi kerak. Men buning uchun maxsus script + tekshiruv yozib beraman, so'ng:
```dotenv
CDN_PROVIDER=r2        # .env'da almashtirish
```
va `docker compose up -d web` bilan qayta ishga tushirish.

---

# BOSQICH 8 (ENG OXIRI) — Eski serverni xavfsiz o'chirish

> Faqat 1–6 bosqichlar ✅, soak muvaffaqiyatli va mobil eski versiyalar ~0 bo'lganda.
> To'liq ketma-ketlik: `RUNBOOK.md` / oldingi xabardagi "dekomissiya" bo'limi.

1. **Render'dan yakuniy backup** (B2'ga) + 1Password'da saqlash.
2. **Sirlarni rotatsiya:** SECRET_KEY, Telegram token, Eskiz, Sentry, B2, DB parol.
3. **GitHub:** Vercel va Render GitHub App'larini repo'dan uzish.
4. **Vercel:** loyihani o'chirish (ma'lumot yo'q — xavfsiz).
5. **Render:** avval Web Service → keyin Redis → **PostgreSQL'ni eng oxirida**
   (yakuniy backup tekshirilgach) **Suspend → kuzatish → Delete**.

---

## Tezkor ma'lumotnoma — buyruqlar

```bash
# Migratsiya tekshiruvi
docker compose exec web python manage.py check_deployment
curl "https://api.bozor.uz/healthz/?deep=1"

# DB son-sanoq solishtirish (2.5)
docker compose exec -T db psql -U bozor -d bozor -c "SELECT count(*) FROM orders_order;"

# Rollback (soak davrida muammo bo'lsa)
#   Cloudflare DNS: api → eski holatga (yoki web VITE_API_URL ni orqaga)
#   Render hali tirik bo'lgani uchun darhol qaytadi
```
