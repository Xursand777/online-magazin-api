# 📕 Bozor Runbook

> **Bu — kritik vaziyatda paniklamasdan harakat qilish uchun yo'l xaritasi.**
> Server o'chganida, DB yiqilganida, hujum sodir bo'lganida — birinchi
> o'rin bu hujjat. Ko'p o'qish kerakmas, faqat to'g'ri bo'limni ochib,
> ko'rsatilgan qadamlarni bajarish.

---

| Versiya | Sana | Vaziyat |
|---------|------|---------|
| 1.0 | 2026-06-01 | Tugagan task: 6/56 (Phase 0.1, 0.2, 0.3, 0.4, 0.5, 0.7) |

## Mundarija

- **[A. Tezkor ma'lumotnoma](#a-tezkor-malumotnoma)** — URL'lar, xizmatlar, kontaktlar
- **[B. Kritik vaziyatlar](#b-kritik-vaziyatlar)** — server o'chgan, DB yo'q, hujum
- **[C. Kundalik amallar](#c-kundalik-amallar)** — admin, kurs, hisobot
- **[D. Akkaunt boshqaruvi](#d-akkaunt-boshqaruvi)** — lockout, rotation, token bekor qilish
- **[E. Disaster recovery](#e-disaster-recovery)** — DB tiklash, ko'chirish
- **[F. Maintenance](#f-maintenance)** — log, vacuum, backup tekshirish
- **[G. Escalation](#g-escalation)** — kim bilan bog'lanish
- **[H. Drill — test protseduralari](#h-drill--test-protseduralari)**

---

## A. Tezkor ma'lumotnoma

### A.1 Server URL'lari

| Joy | URL | Qachon |
|-----|-----|--------|
| Production frontend | `https://<TODO_DOMAIN>` | Asosiy sayt |
| Production backend | `https://<RENDER_URL>.onrender.com` | API |
| Admin panel | `https://<TODO_DOMAIN>/admin/` | (DJANGO_ADMIN_URL bilan maxfiy) |
| Swagger | `https://<URL>/api/docs/` | Faqat ENABLE_API_DOCS=True bo'lsa |
| Health (shallow) | `https://<URL>/healthz/` | Render uchun |
| Health (deep) | `https://<URL>/healthz/?deep=1` | UptimeRobot uchun |

### A.2 Tashqi xizmatlar

| Xizmat | URL | Login | Maqsad |
|--------|-----|-------|--------|
| **Render** | https://dashboard.render.com | Email | Hosting |
| **Backblaze B2** | https://secure.backblaze.com | Email | DB backup + media |
| **Sentry** | https://sentry.io | Email | Xato kuzatish |
| **UptimeRobot** | https://uptimerobot.com | Email | Server monitoring |
| **Eskiz.uz** | https://my.eskiz.uz | Email | SMS xizmati |
| **Cloudinary** | https://console.cloudinary.com | Email | Rasm CDN |
| **Telegram BotFather** | t.me/BotFather | Telegram | Bot token boshqarish |
| **GitHub** | https://github.com/<TODO>/<TODO> | Email | Kod va CI/CD |

### A.3 Kalit shaxslar

| Rol | Telefon | Email | Joriy holat |
|-----|---------|-------|-------------|
| Birinchi super_admin | `<TODO_PHONE>` | `<TODO_EMAIL>` | Asosiy boshqaruvchi |
| Ikkinchi super_admin (backup) | **+998 94 112 67 77** | — | Lockout recovery uchun |
| Hosting hisob egasi | `<TODO>` | `<TODO>` | Render to'lov |
| Buxgalter | `<TODO>` | `<TODO>` | Eskiz to'ldirish |

### A.4 Kritik fayllar

| Fayl | Vazifa | Sirlimi? |
|------|--------|----------|
| `backend/.env` | Production sozlamalari | ⚠️ MAXFIY — git'da yo'q |
| `backend/.env.example` | Shablon | ✓ Git'da |
| `backend/core/settings.py` | Django sozlamalari | ✓ Git'da |
| `RUNBOOK.md` | Bu hujjat | ✓ Git'da |
| GitHub Secrets | Backup workflow uchun | ⚠️ GitHub'da, faqat admin ko'radi |
| 1Password vault | Barcha parollar | ⚠️ Faqat egasiga |

### A.5 Eslatma — barcha komandalar bu joydan ishga tushiriladi

```bash
cd "/path/to/Online Magazin API/backend"
source venv/bin/activate
```

Production'da (Render Shell): siz allaqachon to'g'ri papkadasiz, faqat:
```bash
python manage.py <komanda>
```

---

## B. Kritik vaziyatlar

### B.1 Server o'chgan / sayt ishlamayapti

**Belgilar:**
- Mijoz: "Sayt ochilmayapti"
- UptimeRobot: Telegram'da "Monitor is DOWN"
- Brauzer: 502/503 yoki timeout

**Birinchi 60 soniya:**

```bash
# 1. UptimeRobot'da ham, qo'lda ham tekshirish:
curl -i https://<URL>/healthz/
# 200 OK → server tirik, faqat bitta endpoint sinmoqda
# 502/503 → server o'chgan
# Timeout → tarmoq yoki Render o'zi yiqilgan
```

**Tashxis:**

1. **Render status sahifasini tekshiring:** https://status.render.com
   - Render-wide outage bo'lsa — kutamiz (boshqa hech narsa qila olmaymiz)
2. **Render dashboard:** sizning service → Events
   - "Deploy failed" — yangi deploy sinmoqda
   - "Out of memory" — RAM tugadi
   - "Build failed" — kod xato
3. **Sentry oxirgi xatolar:** sentry.io → Issues → so'nggi 1 soat
4. **Render logs:** Dashboard → Logs → real-time stream

**Tuzatish:**

| Sabab | Yechim |
|-------|--------|
| Render outage | Status sahifasida update kutamiz. Telegram orqali mijozlarga xabar |
| Deploy failed | Render → Deploys → eski versiyaga "Rollback" |
| OOM (memory) | Render → Settings → Instance type yangilash (paid kerak) |
| Crashloop | Logs'dan sabab topish (sentry yordamida) |
| DB ulanish yo'q | Pastdagi B.2 ga o'tish |

**Tasdiqlash:**
```bash
curl https://<URL>/healthz/?deep=1
# {"status":"healthy",...} kelishi kerak
```

**Mijozga xabar (Telegram kanal):**
> "Texnik nosozlik tufayli sayt vaqtinchalik ishlamayapti. Biz uni
> tuzatib boryapmiz. ~15 daqiqada qayta sinab ko'ring. Noqulayliklar
> uchun uzr."

### B.2 Ma'lumotlar bazasi yiqilgan

**Belgilar:**
- `/healthz/?deep=1` → `{"status":"unhealthy","checks":{"db":{"status":"fail"}}}`
- Sayt: "500 Server Error"
- Sentry: ko'p `OperationalError` xato

**Tashxis:**

```bash
# Render dashboard'da PostgreSQL service → Status
# - "Available" → DB tirik, ulanish muammosi
# - "Suspended" → to'lov xatosi
# - "Error" → DB ichida muammo
```

**Tuzatish:**

1. **Vaqtinchalik o'chish (ulanish):**
   ```bash
   # Render service → Manual Deploy → Clear build cache & deploy
   # Connection pool resetlanadi
   ```

2. **To'lov xatosi:** Render billing'da kartani tekshirish

3. **Ma'lumot buzilgan / yo'qolgan (eng yomon):**
   - Pastdagi [E.1 DB tiklash](#e1-db-tiklash-b2dan) ga o'tish
   - **DIQQAT:** Restoredan oldin oxirgi backup vaqtini tekshirib oling (B2'da)

**Tasdiqlash:**
```bash
curl https://<URL>/healthz/?deep=1
# checks.db.status == "ok" bo'lishi kerak
```

### B.3 Redis ishlamayapti

**Belgilar:**
- `/healthz/?deep=1` → `{"status":"degraded","checks":{"cache":{"status":"fail"}}}`
- OTP kodlari ishlamayapti
- Login kechikmoqda
- Rate limit har worker'da alohida ishlayapti

**Tashxis:**

Joriy konfiguratsiyada Redis o'chsa, Django avtomatik LocMemCache'ga o'tadi (settings.py'da `_REDIS_URL` shartli). Lekin:
- OTP kodlari workerlar o'rtasida sinxron emas
- Rate limiting yetishmaydi

**Tuzatish:**

```bash
# Render dashboard → Redis service → Status
# - Suspended → to'lov tekshirish
# - Maintenance → tugashini kutamiz
# - Out of memory → eski keylarni o'chirish:
#   redis-cli -u $REDIS_URL FLUSHDB  (DIQQAT: barcha kesh yo'qoladi)
```

**Tasdiqlash:**
```bash
curl https://<URL>/healthz/?deep=1
# checks.cache.status == "ok" bo'lishi kerak
```

### B.4 Eskiz SMS balans 0 ga yetdi

**Belgilar:**
- Telegram'da: "🔴 ESKIZ SMS BALANSI KRITIK PAST!"
- Yangi foydalanuvchilar ro'yxatdan o'tolmayapti
- Mijoz: "OTP kodi kelmayapti"

**Birinchi ish (5 daqiqada):**

1. https://my.eskiz.uz → Login → balans tekshirish
2. To'ldirish (karta orqali, eng tezroq variant)
3. Tasdiqlash:
   ```bash
   python manage.py check_sms_balance --force
   ```

**Vaqtincha yechim (to'ldirilguncha):**

Foydalanuvchilarga password login orqali kirishni eslatish:
- Telegram kanal yoki sayt bannerida
- `/auth?mode=password` sahifasi

**Oldini olish:**
- ESKIZ_BALANCE_WARNING_THRESHOLD ni yuqori qilish (`.env`'da)
- Avtomat to'ldirish (Eskiz dashboard'da bor)

### B.5 Cloudinary limit tugagan

**Belgilar:**
- Yangi mahsulot rasmi yuklanmayapti
- Sentry: `cloudinary.exceptions.QuotaExceededError`
- Cloudinary dashboard: 25 GB to'lgan

**Yechim:**

1. **Vaqtinchalik (1 hafta):** Cloudinary'dan eski mahsulot rasmlarini B2'ga ko'chirish:
   ```bash
   python manage.py upload_media_to_b2 --folder products/gallery
   ```
   Keyin Cloudinary'da o'sha fayllarni o'chirish (qo'lda yoki API).

2. **Doimiy yechim:** Paid Cloudinary rejaga o'tish (~$89/oy) yoki **CDN_PROVIDER**'ni `b2`'ga o'zgartirish:
   ```bash
   # .env'da:
   CDN_PROVIDER=b2
   # va B2_BUCKET_NAME, B2_KEY_ID, va h.k. allaqachon sozlangan
   ```

**Tasdiqlash:** Yangi mahsulot qo'shib, rasm yuklash.

### B.6 Sentry'da kritik xato keladi

**Belgilar:**
- Telegram: "🟠 ERROR — Sentry'da yangi issue"
- yoki to'g'ridan-to'g'ri Sentry email/dashboard

**Birinchi ish:**

1. Sentry → Issues → yangi xato ochish
2. Stacktrace'ni tahlil qilish
3. "User Affected" sonini ko'rish — necha foydalanuvchi ushbu xatoga duch keldi?
4. "First seen" vaqtini ko'rish — qachondan beri?

**Hal qilish:**

- Mahalliy reproduce qilish:
  ```bash
  # Sentry'dan exception turi va parametrlari
  python manage.py shell
  >>> from <module> import <function>
  >>> <function>(<bad_params>)
  ```
- Fix yozish va deploy
- Sentry'da "Resolve in next release" belgisini qo'yish

### B.7 UptimeRobot alert kelmoqda

**Belgilar:**
- Telegram: "Monitor is DOWN: Bozor Production"

**Birinchi 30 soniya:**

```bash
# Tasdiqlash — qo'lda ham tekshirish
curl -i https://<URL>/healthz/?deep=1
```

**Yo'naltirish:**
- 200 OK qaytarsa — UptimeRobot xato bergan (false positive). Ignore.
- 503 — pastdagi [B.1 yoki B.2](#b1-server-ochgan--sayt-ishlamayapti) ga
- Connection timeout — pastdagi B.8

### B.8 Render account "Suspended"

**Belgilar:**
- Sayt umuman ochilmayapti
- Render dashboard'da: "Account Suspended"
- Email Render'dan: "Payment failed" yoki "ToS violation"

**Birinchi ish:**

1. **Email tekshirish** (Render'dan):
   - Billing muammo: to'lov karta ishlamaydi
   - ToS buzilishi: nima qilingan?

2. **Render support'ga yozish:** https://render.com/support

3. **Davom etish uchun:**
   - **Billing muammosi:** yangi karta qo'yish (5 daqiqa)
   - **ToS:** support bilan suhbat (1-3 kun)

**Agar Render qaytarmasa:**

DNS qaytarish — Hetzner yoki boshqa serverga ko'chirish:
- B2 backup'dan DB tiklash
- Yangi serverda env sozlash
- DNS A record yangi IP'ga

Pastdagi [E.3 Yangi serverga ko'chish](#e3-yangi-serverga-kochish) ga qarang.

### B.9 DDoS yoki scraping shubhasi

**Belgilar:**
- UptimeRobot'da: response time keskin oshdi
- Sentry'da: ko'p 429 (rate limit) yoki 500
- Telegram: "🟠 Rate limit alert — 150 ta 429 / minutiga" (Phase 1.7 keyin)

**Birinchi ish:**

1. **Render dashboard → Logs:** kim ko'p kelmoqda?
2. **Sentry → Issues:** xato turlari
3. **CORS source:** g'alati domen'lardan kelyaptimi?

**Tuzatish:**

```bash
# IP qora ro'yxatga qo'shish (kelajak — Phase 1.7 da):
# Hozircha Render firewall'ida (Pro reja kerak)
# Yoki Cloudflare orqali (DNS Cloudflare orqali bo'lsa)
```

**Vaqtinchalik:**
- DRF throttle'ni qattiqroq qilish (`settings.py`'da `DEFAULT_THROTTLE_RATES`)
- Deploy

### B.10 Hujum: super_admin akkaunt buzilgan

**Belgilar:**
- Telegram: "🟡 Backup super_admin PAROLI YANGILANDI" (siz qilmagansiz)
- yoki tushuntirib bo'lmaydigan amallar audit log'da
- yoki tanish bo'lmagan IP'dan admin login

**DARHOL (30 daqiqada):**

```bash
# 1. Barcha super_admin'larning tokenlarini bekor qilish:
python manage.py shell
>>> from users.models import User
>>> from django.utils import timezone
>>> User.objects.filter(is_superuser=True).update(role_invalidated_at=timezone.now())
>>> exit()

# 2. Django SECRET_KEY ni almashtirish (barcha JWT bekor):
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
# Render dashboard → Environment → DJANGO_SECRET_KEY yangilash → Deploy

# 3. Backup super_admin paroli yangilash:
python manage.py create_backup_superuser --rotate-password

# 4. Birinchi super_admin paroli yangilash (Django admin'da):
# .../admin/users/user/ → super_admin tahrirlash → set unusable password
# yoki shell'da:
>>> u = User.objects.get(phone='<YOUR_PHONE>')
>>> u.set_password('YangiQattiqParol123!')
>>> u.save()

# 5. Telegram bot tokenni almashtirish (sizib qolgan bo'lishi mumkin):
# @BotFather → /revoke → yangi token → .env yangilash
```

**Audit:**
- Telegram tarixini ko'rish: yangi token nima paytda almashgan?
- Render Events log: deploy va env o'zgarishlari kim qilgan?
- GitHub Audit log: kim qaysi paytda nima qilgan?

---

## C. Kundalik amallar

### C.1 Yangi mahsulot qo'shish

**Admin paneldan:**
1. AdminPanel → Mahsulotlar → "Yangi qo'shish"
2. Nom, narx (USD bo'lsa USD kursiga ko'paytadi avtomat), kategoriya, stock
3. Rasm yuklash (Cloudinary'ga avtomat)
4. Saqlash → tarjima avtomat (uz → ru, en)

**Bulk import (CSV/Excel):**
1. AdminPanel → Mahsulotlar → "Import"
2. Fayl yuklash (maksimal 10 MB, 10,000 mahsulot)
3. Translate: True (default)
4. Submit → 30-60 soniya ichida tugaydi

### C.2 Yangi admin/sotuvchi/kuryer tayinlash

**Faqat super_admin:**

1. AdminPanel → "Xodimlar" → "Yangi xodim"
2. Telefon raqamini kiritish (mavjud foydalanuvchi bo'lishi shart!)
3. Rol tanlash: admin / seller / courier
4. Saqlash

**Eslatma:** super_admin rolini tayinlab bo'lmaydi (faqat shell orqali, [D.4](#d4-yangi-backup-super_admin)).

### C.3 USD kursini yangilash

```
AdminPanel → Sozlamalar → "USD kurs"
Yangi qiymat: 12700  (yoki joriy bozor narxi)
Saqlash
```

Tasdiqlash: bosh sahifaga o'tib, USD narxi bo'lgan mahsulot narxi qayta hisoblanganini tekshirish.

### C.4 Bugungi hisobotni ko'rish

```
AdminPanel → Hisobotlar → "Bugun"
```

Ko'rsatiladi:
- Bugun buyurtmalar soni
- Jami daromad
- O'rtacha buyurtma summasi
- Eng ko'p sotilgan mahsulotlar

### C.5 Mijozni telefon raqamga ko'ra topish

```
AdminPanel → Mijozlar → "Qidirish" → +998901234567 yoki 901234567
```

Yoki Django shell:
```bash
python manage.py shell
>>> from users.utils import find_user_by_phone
>>> u = find_user_by_phone('+998901234567')
>>> print(u.first_name, u.last_name, u.role, u.credit_ban)
```

### C.6 B2'da backup mavjudligini tekshirish

```bash
python manage.py restore_db --list
```

Yoki: B2 dashboard → Buckets → bozor-backups → fayllar ro'yxati.

So'nggi 7 kun ichida har kun fayl bo'lishi shart (har kuni 03:00 UTC).

Agar yo'q bo'lsa: GitHub → Actions → "Daily Database Backup" → workflow tarixi.

---

## D. Akkaunt boshqaruvi

### D.1 Birinchi super_admin parolini unutdim

**Yo'l 1 — Telefon OTP'dan kirish (eng oson):**

`/auth?mode=otp` → telefon → SMS kod → kirish → profilda parolni yangilash.

**Yo'l 2 — Backup super_admin orqali:**

1. Backup super_admin (+998 94 112 67 77) bilan kirish
2. AdminPanel → Xodimlar → birinchi admin tahrirlash → set unusable password
3. Birinchi admin uchun OTP yuborish va yangi parol qo'yish
4. Yoki: backup admin shell ga kirib:
   ```bash
   python manage.py shell
   >>> from users.models import User
   >>> u = User.objects.get(phone='<FIRST_ADMIN_PHONE>')
   >>> u.set_password('YangiParol!123')
   >>> u.role_invalidated_at = None
   >>> u.save()
   ```

### D.2 Backup super_admin bilan kirish

**Telefon raqami:** +998 94 112 67 77
**Parol:** 1Password'da (Bozor Backup Super Admin yozuvi)

**Yo'l:**
- `/auth?mode=password` → telefon → parol → kirish
- Yoki OTP: `/auth?mode=otp` → telefon → SMS kod → kirish

### D.3 Parol rotation (har 90 kun yoki shubha bo'lsa)

```bash
python manage.py create_backup_superuser --rotate-password
```

Yangi parol stdout'ga chiqadi → 1Password'da yangilash → eski yozuvni o'chirish.

### D.4 Yangi backup super_admin yaratish (boshqa telefon uchun)

```bash
python manage.py create_backup_superuser \
    --phone=+998901234567 \
    --note="Sherigim Asror"
```

### D.5 Token bekor qilish (hujum shubhasida)

**Bitta foydalanuvchi uchun:**
```bash
python manage.py shell
>>> from users.models import User
>>> from django.utils import timezone
>>> u = User.objects.get(phone='+998...')
>>> u.role_invalidated_at = timezone.now()
>>> u.save()
```

**Barcha super_admin'lar:**
```python
User.objects.filter(is_superuser=True).update(role_invalidated_at=timezone.now())
```

**HAMMA foydalanuvchilar (atom bombasi):**
```python
User.objects.all().update(role_invalidated_at=timezone.now())
# Yoki: Django SECRET_KEY ni almashtirish — barcha JWT signature bekor
```

---

## E. Disaster recovery

### E.1 DB tiklash (B2'dan)

**STAGING'DA SINAB KO'RING.** Production'da to'g'ridan-to'g'ri tiklash xavfli — bor ma'lumotni overwrite qiladi.

**Mavjud backup'larni ko'rish:**
```bash
python manage.py restore_db --list
```

**Oxirgi backup'dan tiklash:**
```bash
python manage.py restore_db --latest --confirm
# Production'da: qo'shimcha "YES" yozib tasdiqlash kerak
```

**Aniq backup nomidan:**
```bash
python manage.py restore_db bozor-backup-2026-05-30-030000.sql.gz --confirm
```

**Staging DB ga tiklash (production'ga tegmasdan):**
```bash
python manage.py restore_db --latest --confirm \
    --target-url=postgresql://test_user:test_pass@staging-db:5432/test_db
```

**Tasdiqlash:**
```bash
python manage.py shell
>>> from orders.models import Order
>>> Order.objects.count()
# Kutilgan: tiklash vaqtidagi soniga teng
```

### E.2 Media (rasmlar) tiklash

**Cloudinary'dan:**
- Cloudinary'da rasm'lar o'z holatida saqlanadi
- Hech narsa qilish kerak emas

**B2'dan:**
```bash
# B2 CLI ishlatib (ko'p fayl):
b2 sync --replaceNewer b2://bozor-media-cdn ./media/
# Yoki settings.py'da DEFAULT_FILE_STORAGE = B2 qilib qo'yish
```

### E.3 Yangi serverga ko'chish (Render → Hetzner)

**Phase 7 ning yengillashtirilgan versiyasi (emergency uchun):**

```bash
# 1. Hetzner CPX11 olish ($5/oy)
# 2. SSH:
ssh root@<HETZNER_IP>

# 3. PostgreSQL + Redis o'rnatish
sudo apt update && sudo apt install postgresql postgresql-contrib redis-server -y

# 4. DB yaratish
sudo -u postgres createuser -P bozor_user
sudo -u postgres createdb -O bozor_user bozor_db

# 5. Backend deploy (git clone + venv + gunicorn)
# 6. Nginx + Let's Encrypt
# 7. B2'dan backup tiklash:
python manage.py restore_db --latest --confirm

# 8. DNS yangilash: A record → Hetzner IP
# 9. SSL: certbot --nginx -d yourdomain.com
```

To'liq protsedura: Phase 7 ga qarang.

### E.4 DNS yangilash (domen)

| Provayder | Manzil |
|-----------|--------|
| Cloudflare | https://dash.cloudflare.com |
| Namecheap | https://ap.www.namecheap.com |
| Domain.uz | https://domain.uz/cabinet |

A record → yangi server IP. TTL 300 (5 daqiqada tarqaladi).

**Tasdiqlash:**
```bash
dig +short yourdomain.com
# Yangi IP qaytishi kerak
```

---

## F. Maintenance

### F.1 Eski log fayllarni o'chirish

```bash
# Render'da log'lar avtomat tozalanadi (7 kun)
# Local'da:
cd backend/logs
find . -name "*.log" -mtime +30 -delete
```

### F.2 PostgreSQL VACUUM (kelajakda)

Production'da haftada bir marta avtomat VACUUM bo'lishi kerak. PostgreSQL `autovacuum` standart bilan yoqilgan. Qo'lda:

```bash
psql $DATABASE_URL
\c bozor_db
VACUUM ANALYZE;
```

### F.3 Backup mavjudligini har hafta tekshirish

**Drill (har Dushanba ertalab):**

```bash
python manage.py restore_db --list
# Oxirgi 7 ta backup ko'rinishi kerak — har bittasi 24 soatdan kam farq
```

Agar oxirgi backup 25+ soat oldin bo'lsa — GitHub Actions'da nimadir noto'g'ri.

### F.4 Telegram bot tokenini almashtirish

**Sirib qolsa yoki shubha bo'lsa:**

```
1. Telegram → @BotFather → /mybots → bot tanlash → "API Token" → "Revoke current token"
2. Yangi token nusxalash
3. .env'da TELEGRAM_BOT_TOKEN yangilash
4. GitHub Secrets'da ham yangilash (TELEGRAM_BOT_TOKEN)
5. Render Environment'da yangilash → Deploy
6. UptimeRobot Alert Contacts → Telegram → yangi token
7. Test:
   python manage.py test_telegram
```

### F.5 Sentry DSN almashtirish

```
1. Sentry → Settings → Projects → Bozor → Client Keys (DSN) → "Generate New Key"
2. Yangi DSN nusxalash
3. .env'da SENTRY_DSN yangilash
4. Render Environment'da yangilash → Deploy
5. Eski key'ni "Disable" qilish (Sentry'da)
```

### F.6 Eskiz tokeni majburiy yangilash

Cache'dagi tokenni o'chiramiz, keyingi SMS'da yangi olinadi:

```bash
python manage.py shell
>>> from django.core.cache import cache
>>> cache.delete('bozor:eskiz_token')
```

---

## G. Escalation

### G.1 Kim bilan bog'lanish (ichki)

| Vaziyat | Kim | Telefon |
|---------|-----|---------|
| Texnik muammo | Birinchi super_admin | `<TODO>` |
| Birinchi admin yo'q | Backup super_admin | +998 94 112 67 77 |
| Hosting to'lov | Hisob egasi | `<TODO>` |
| SMS to'ldirish | Buxgalter | `<TODO>` |

### G.2 Tashqi xizmatlar support

| Xizmat | Email | Telefon | Javob vaqti |
|--------|-------|---------|-------------|
| Render | support@render.com | — | 1-2 ish kun |
| Backblaze B2 | support@backblaze.com | — | 24 soat |
| Sentry | support@sentry.io | — | 1 ish kun |
| UptimeRobot | support@uptimerobot.com | — | 1-2 ish kun |
| Eskiz.uz | support@eskiz.uz | +998 71 200-0-700 | 1 soat (ish vaqti) |
| Cloudinary | support@cloudinary.com | — | 1 ish kun |

### G.3 Force majeure

**Internet uzilgan (O'zbekiston'da):**
- Hech narsa qila olmaymiz
- Telegram orqali mijozlarga xabar (Telegram alohida CDN, ishlaydi)

**Render datacenter offline:**
- Phase 7 ga o'tish vaqti — Hetzner / Railway

**Hosting hisobi suspend:**
- E.3 — yangi serverga ko'chish

---

## H. Drill — test protseduralari

### H.1 Backup restore test (har oy, 1-chislо)

```bash
# Staging DB ga oxirgi backup tiklash
export TEST_DB_URL="postgresql://test_user:test_pass@localhost:5432/bozor_test"
createdb -U test_user bozor_test
python manage.py restore_db --latest --confirm --target-url=$TEST_DB_URL

# Tekshirish
psql $TEST_DB_URL -c "SELECT COUNT(*) FROM orders_order;"
# Production sonidan farq qilmasligi shart

# Tozalash
dropdb -U test_user bozor_test
```

### H.2 Lockout recovery drill (har 6 oyda)

```bash
# Birinchi admin parolini "unutgandek" qilish
python manage.py shell
>>> u = User.objects.get(phone='<FIRST_ADMIN_PHONE>')
>>> u.set_unusable_password()
>>> u.save()

# Backup admin'dan kirish: +998 94 112 67 77 + 1Password parol
# AdminPanel'da birinchi admin parolini qaytarish

# Tasdiqlash: birinchi admin yana kira oladi
```

### H.3 Telegram bot ishlashini har hafta

```bash
python manage.py test_telegram
# Telegram'ga 4 ta test xabar (info/warning/error/critical) keladi
```

### H.4 Health check har hafta

```bash
curl https://<URL>/healthz/?deep=1
# {"status":"healthy"} kelishi shart
```

### H.5 UptimeRobot Telegram alert simulyatsiyasi

```bash
# Render dashboard → Service → Suspend (1 daqiqaga)
# 5 daqiqada Telegram'ga "DOWN" alert kelishi shart
# Service'ni qaytadan ishga tushiring
# 5 daqiqada "back UP" alert kelishi shart
```

---

## Versiya tarixi

| Versiya | Sana | O'zgarishlar |
|---------|------|--------------|
| 1.0 | 2026-06-01 | Birinchi versiya. Phase 0.1, 0.2, 0.3, 0.4, 0.5, 0.7 qamrab oladi |

**TODO (keyingi versiyada):**
- Phase 0.6 (Cold start UX) — mobile rejimda nima ko'rinadi
- Phase 1.1 (Audit log) — kim qachon nima qildi
- Phase 1.9 (Daily digest) — har ertalab xabar
- Phase 2.x (Delivery proof) — kuryer protokoli
- Phase 4.x (Refund, promo) — moliyaviy amallar

---

## Yakuniy eslatma

> Bu hujjat — ish vaqtida emas, kritik vaziyatda foydalaniladi. Ko'rsatilgan
> qadamlarni ko'r-ko'rona bajarish o'rniga, har bir vaziyatni anglashga
> harakat qiling. Agar protsedura xato ko'rinsa — TO'XTANG va savol bering.
> Yomon harakat — harakatsizlikdan ko'ra ko'p zarar keltirishi mumkin.

> **Eng muhim qoida:** Backup mavjud bo'lsa, har qanday narsani qaytarish
> mumkin. Backup yo'q bo'lsa — hech narsani qaytarib bo'lmaydi.
> Shuning uchun [F.3](#f3-backup-mavjudligini-har-hafta-tekshirish) eng muhim
> haftalik amal.
