# 🛒 Hisob ochish va sotib olish qo'llanmasi (Hetzner + Domen + Cloudflare)

> Noldan boshlovchilar uchun. Bu yerdagi 3 narsani sotib olasiz/ochasiz:
> **1) Hetzner server  ·  2) Domen  ·  3) Cloudflare (bepul)**.
> Narxlar taxminiy (EUR/USD) — buyurtma paytida joriy narxni tekshiring.

---

## QISM A — Hetzner hisobini ochish

### A.1 Ro'yxatdan o'tish
1. https://accounts.hetzner.com → **Register**
2. Email + kuchli parol → emailни tasdiqlang.
3. Profil ma'lumotlari: ism, manzil (haqiqiy — hisob tekshiruvi uchun).
4. **To'lov usuli** qo'shing:
   - **Kredit karta** (Visa/Mastercard — xalqaro to'lovga, EUR'ga ruxsat berilgan, 3D Secure) — eng tez.
   - yoki **PayPal**.

### A.2 ⚠️ Hisob tekshiruvi (Uzbekistondan muhim)
Hetzner yangi mijozlarni (ayniqsa EU'dan tashqari) **tekshiradi**:
- Pasport/ID surati so'rashi mumkin.
- Birinchi server "review" ostida 1–24 soat kutishi mumkin.
- Bu **normal** — so'ralsa, hujjatni yuklang va kuting.

> **Agar Hetzner rad etsa yoki cho'zilsa** — muqobil (xuddi shu Docker stack ishlaydi):
> **Vultr** (vultr.com) yoki **DigitalOcean** (digitalocean.com) — Uzbekistondan
> ochish osonroq. Frankfurt/Amsterdam regionini tanlang. Server tavsiyasi (B qism)
> bularda ham bir xil: 4 vCPU / 8 GB.

### A.3 SSH kalit yaratish (Mac'da — serverga xavfsiz kirish uchun)
Server ochishdan **oldin** terminalда:
```bash
ssh-keygen -t ed25519 -C "bozor-hetzner"
# Enter (default joy) → parol qo'ying (ixtiyoriy, lekin tavsiya)
cat ~/.ssh/id_ed25519.pub      # ← shu PUBLIC kalitni nusxalaysiz
```
`.pub` (public) kalitni Hetzner'ga qo'shasiz. **Private kalit (`id_ed25519`) hech kimga berilmaydi.**

---

## QISM B — Qaysi serverni sotib olish (aniq tavsiya)

Sizning miqyos (10 000+ foydalanuvchi, 5 000+ mahsulot) + bitta serverda
Django + PostgreSQL + Redis + Celery + Nginx (Docker) ishlaydi.

### ⭐ TAVSIYA: **CPX31**
| Parametr | Qiymat |
|----------|--------|
| vCPU | 4 (AMD) |
| RAM | **8 GB** |
| Disk | 160 GB NVMe SSD |
| Traffic | 20 TB/oy |
| Narx | ~€15–16/oy |

**Nega 8 GB:** Postgres + Redis + 3 gunicorn worker + Celery + Nginx bir joyda
turadi. 8 GB — "qolib ketmaslik" uchun bemalol zaxira beradi. Yetmasa, bir necha
daqiqada CPX41 (8 vCPU/16 GB) ga **resize** qilinadi (ma'lumot saqlanadi).

### Variantlar
| Plan | vCPU / RAM | Narx/oy | Kimga |
|------|-----------|---------|-------|
| CPX21 | 3 / 4 GB | ~€8 | Tejamkor start (kichikroq zaxira) |
| **CPX31** ⭐ | **4 / 8 GB** | **~€16** | **Tavsiya — qulay zaxira** |
| CAX31 (ARM) | 4 / 8 GB | ~€8 | Eng yaxshi narx (ARM — bizning Docker image'lar mos) |
| CPX41 | 8 / 16 GB | ~€30 | Keyin o'sganda |

> CAX (ARM) eng arzon va kuchli, lekin boshlovchi uchun x86 (CPX) "kafolatlangan
> moslik". Ikkalasi ham bizning stack bilan ishlaydi.

### Server yaratishda tanlovlar
- **Location:** **Falkenstein** yoki **Nuremberg** (Germaniya) — UZ'ga eng mos latency.
- **Image:** **Ubuntu 24.04**
- **SSH Key:** A.3'dagi public kalitni yuklang (parol bilan kirishni o'chiring).
- **Backups:** ✅ yoqing (+~20%, ~€3/oy) — to'liq server snapshot (DB B2 backup'iga qo'shimcha himoya).
- **Volume / Floating IP:** hozir SHART EMAS.
- **Name:** `bozor-prod`

> Server yaratilgach sizga **IPv4 manzil** beriladi — uni Cloudflare DNS'ga (`api` A-record) yozasiz.

---

## QISM C — Domen sotib olish

### C.1 Qaysi TLD (.uz yoki .com)?
| TLD | Afzallik | Kamchilik | Qayerdan |
|-----|----------|-----------|----------|
| **.com** | Tez, arzon, darhol (~$10/yil), butun dunyo | Lokal "ishonch" kamroq | Cloudflare / Porkbun |
| **.uz** | O'zbek bozori uchun ishonchli, mahalliy | Hujjat talab qiladi, sekinroq, qimmatroq | Mahalliy registrator |

**Tavsiya:** tezda jonli bo'lish uchun avval **`.com`** oling (Cloudflare orqali,
10 daqiqada). Parallel ravishda mahalliy bozor uchun **`.uz`** ham olib, asosiy
saytga yo'naltirishingiz mumkin.

### C.2 Nom tanlash va bandligini tekshirish
"bozor" odatda band. O'ziga xos nom o'ylang (masalan `bozoruz.com`, `mybozor.com`,
`bozormarket.com`). Tekshirish: Cloudflare yoki https://porkbun.com da nom yozib qidiring.

### C.3 ⭐ Eng yaxshi joy: **Cloudflare Registrar**
**Nega:** narx ustiga ustama qo'ymaydi (at-cost), WHOIS maxfiyligi **bepul**, va
biz baribir Cloudflare ishlatamiz (DNS, CDN, R2, Pages) — hammasi bir joyda.

Qadamlar:
1. https://dash.cloudflare.com → ro'yxatdan o'ting (bepul).
2. **Registrar → Register Domain** → nom qidiring → sotib oling (~$10/yil .com).
3. Domen avtomat Cloudflare'ga ulanadi (DNS tayyor).

> Cloudflare Registrar `.uz` ni qo'llab-quvvatlamaydi. `.uz` uchun mahalliy
> akkreditlangan registrator (masalan **ahost.uz**, **uzinfocom/cctld.uz**) — pasport
> yoki tashkilot hujjati kerak bo'lishi mumkin. Olganingizdan keyin uning
> nameserver'larini Cloudflare'nikiga o'zgartirasiz.

### C.4 Agar boshqa registratordan olsangiz (Porkbun/Namecheap)
1. Domenni o'sha yerdan oling.
2. Cloudflare → **Add a site** → domenni kiriting.
3. Cloudflare bergan 2 ta **nameserver**ни registratoringizда almashtiring.
4. ~1–24 soatda Cloudflare'ga o'tadi.

---

## QISM D — Umumiy oylik xarajat (taxminiy)

| Narsa | Narx |
|-------|------|
| Hetzner CPX31 | ~€16/oy (~$17) |
| Hetzner Backups | ~€3/oy |
| Domen (.com) | ~$10/yil (~$1/oy) |
| Cloudflare (CDN/DDoS/Pages/R2) | **Bepul** (R2 ~$1/oy) |
| Backblaze B2 (DB backup) | ~$1/oy |
| **Jami** | **~$22–25/oy** |

---

## QISM E — Sotib olgandan keyin (ketma-ketlik)

1. ✅ Hetzner server ochildi → **IPv4 manzilni** yozib oling.
2. ✅ Domen olindi + Cloudflare'ga ulandi.
3. ✅ Cloudflare R2 bucket + API token (DEPLOYMENT_HETZNER.md → 3-bo'lim).
4. → **`DEPLOYMENT_HETZNER.md`** bo'yicha serverni sozlash.
5. → **`MIGRATION_RENDER_TO_HETZNER.md`** bo'yicha Render'dan ma'lumot ko'chirish.

> Hammasi ochilgach menga IP va domenni ayting — `api.conf`, `.env` va mobil
> URL'ni to'ldirib/sozlab beraman, har qadamni birga nazorat qilamiz.

---

## QISM F — CAX21 sotib olish (aniq qadamlar)

### F.1 Hisob ochish
1. https://accounts.hetzner.com → **Register** → email + parol → emailни tasdiqlang.
2. To'lov usuli: **Visa/Mastercard** (xalqaro, EUR, 3D Secure) yoki **PayPal**.
3. ID so'ralsa — pasport suratini yuklang, tasdiqни kuting (1–24 soat).

### F.2 SSH kalit (server ochishdan oldin — Mac terminalда)
```bash
ssh-keygen -t ed25519 -C "bozor-hetzner"
cat ~/.ssh/id_ed25519.pub      # shu PUBLIC kalitni nusxalang
```

### F.3 Serverni yaratish
1. https://console.hetzner.cloud → **+ New Project** → nomi `bozor`.
2. Loyiha ichida → **Add Server**.
3. Tanlovlar:
   - **Location:** Falkenstein (Germaniya)
   - **Image:** Ubuntu 24.04
   - **Type:** **Shared vCPU → Arm64 (Ampere) → CAX21** (4 vCPU / 8 GB / 80 GB)
   - **Networking:** IPv4 + IPv6 (default)
   - **SSH Keys:** "Add SSH Key" → F.2'dagi public kalitni joylang
   - **Backups:** ✅ **yoqing** (+~€1.7/oy — to'liq server snapshot)
   - **Name:** `bozor-prod`
4. **Create & Buy now** → ~30 soniyada tayyor → **IPv4 manzilni** yozib oling.

### F.4 To'lov xavfsizligi (xotirjam bo'ling)
- **Soatbay**: faqat ishlatgan soat uchun, oyiga maks €8.49 (+~€0.50 IPv4).
- **Shartnoma yo'q**: istalgan vaqt server → **Delete** → to'lov to'xtaydi.
- **Katta summa ketmaydi**: bir necha dollarlik metrlangan to'lov.

## QISM G — Tez-tez so'raladigan savollar

**S: CAX21 → CAX31 ga keyin o'tsa muammo bo'ladimi?**
J: Yo'q. Server → **Rescale** → CAX31 → ~1-3 daqiqa restart. Ma'lumot, IP, disk
saqlanadi. CAX↔CAX (ARM) resize silliq. (ARM↔x86 resize yo'q — shuning uchun CAX'da qoling.)

**S: Server ilovamga "kichik" desa, oldindan ogohlantiradimi?**
J: Avtomat ogohlantirmaydi. Lekin soatbay + o'chirsa bo'ladi + resize oson → xavf nol.
Kichik bo'lsa kattalashtirasiz.

**S: Backup qayerda?**
J: Ikki qatlam — (1) **Hetzner Backups** (to'liq server snapshot, F.3'da yoqasiz),
(2) **B2** kunlik DB backup (kodda bor). Cloudflare'da emas.

**S: Domen va Cloudflare?**
J: Domen Cloudflare Registrar (.com) — C qism. DNS/CDN/SSL/Pages/R2 — hammasi
Cloudflare ichida, bepul (R2 ~$0).
