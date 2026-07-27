# Google Play Store — 700Mobile.uz chiqarish qo'llanmasi

Bu hujjat ilovani Google Play Console'ga yuklash uchun **tayyor barcha ma'lumotlarni**
o'z ichiga oladi. D-U-N-S raqami kelib, tashkilot akkaunti tasdiqlangach, shu
hujjatdan nusxa ko'chirib to'ldirasiz.

---

## 0. Texnik holat (BAJARILGAN ✅)

| Element | Holat |
|---|---|
| **Application ID** | `uz.mobile700.app` (doimiy — o'zgartirilmaydi) |
| **App nomi (label)** | `700Mobile` |
| **Versiya** | `1.0.1` (versionCode 2) — `pubspec.yaml` |
| **Release imzo** | `android/upload-keystore.jks` (alias: `upload`) ✅ |
| **R8 minify + shrink** | Yoqilgan ✅ |
| **Backend URL** | `https://api.700mobile.uz` (release rejimda avtomatik) ✅ |
| **Privacy Policy** | `https://700mobile.uz/privacy` (uz/ru/en) ✅ |

### Release AAB build qilish (yuklash uchun)
```bash
cd bozor_mobile
flutter build appbundle --release
# Natija: build/app/outputs/bundle/release/app-release.aab
```

> ⚠️ **Keystore — eng muhim fayl.** `android/upload-keystore.jks` va `android/key.properties`
> ni xavfsiz joyda zaxira qiling (masalan, parolli bulut). **Bu fayl yo'qolsa,
> ilovaga boshqa hech qachon yangilanish chiqara olmaysiz.** Git'ga commit qilinmagan
> (`.gitignore`da) — bu to'g'ri, lekin shaxsiy zaxira shart.

---

## 1. Do'kon sahifasi matnlari (Store listing)

### Ilova nomi (App name) — maks. 30 belgi
```
700Mobile — Onlayn do'kon
```

### Qisqa tavsif (Short description) — maks. 80 belgi

**O'zbek:**
```
Telefon, aksessuar va maishiy texnika — tez yetkazib berish bilan onlayn xarid.
```
**Rus:**
```
Телефоны, аксессуары и бытовая техника — онлайн-покупки с быстрой доставкой.
```
**English:**
```
Phones, accessories & appliances — online shopping with fast delivery.
```

### To'liq tavsif (Full description) — maks. 4000 belgi

**O'zbek:**
```
700Mobile — O'zbekistondagi qulay va ishonchli onlayn do'kon. Smartfonlar,
aksessuarlar, maishiy texnika va boshqa mahsulotlarni uydan chiqmasdan buyurtma
qiling.

ASOSIY IMKONIYATLAR:
• Keng katalog — smartfonlar, aksessuarlar, maishiy texnika va boshqalar.
• Qulay qidiruv va kategoriyalar bo'yicha saralash.
• Uch tilda ishlaydi: o'zbek, rus va ingliz.
• Tez ro'yxatdan o'tish — telefon raqami va SMS kod orqali.
• Savatga qo'shish, sevimlilar ro'yxati va buyurtma tarixi.
• Yetkazib berish manzilini xaritadan tanlash.
• Buyurtma holati haqida SMS orqali xabar.
• Xavfsiz yetkazib berish — maxsus kod orqali qabul qilish.

Nega 700Mobile?
✓ Ishonchli mahsulotlar va shaffof narxlar.
✓ Tez va qulay yetkazib berish.
✓ Oson va xavfsiz xarid tajribasi.

Hoziroq yuklab oling va xaridni boshlang!
```

**Rus:**
```
700Mobile — удобный и надёжный интернет-магазин в Узбекистане. Заказывайте
смартфоны, аксессуары, бытовую технику и другие товары, не выходя из дома.

ОСНОВНЫЕ ВОЗМОЖНОСТИ:
• Широкий каталог — смартфоны, аксессуары, бытовая техника и другое.
• Удобный поиск и сортировка по категориям.
• Три языка: узбекский, русский и английский.
• Быстрая регистрация — по номеру телефона и SMS-коду.
• Корзина, список избранного и история заказов.
• Выбор адреса доставки на карте.
• SMS-уведомления о статусе заказа.
• Безопасная доставка — получение по специальному коду.

Почему 700Mobile?
✓ Надёжные товары и прозрачные цены.
✓ Быстрая и удобная доставка.
✓ Простой и безопасный шопинг.

Скачайте прямо сейчас и начните покупки!
```

**English:**
```
700Mobile is a convenient and reliable online store in Uzbekistan. Order
smartphones, accessories, home appliances and more without leaving your home.

KEY FEATURES:
• Wide catalog — smartphones, accessories, home appliances and more.
• Easy search and sorting by category.
• Three languages: Uzbek, Russian and English.
• Fast sign-up — via phone number and SMS code.
• Cart, favorites list and order history.
• Pick your delivery address on the map.
• SMS notifications about your order status.
• Secure delivery — accept your order with a one-time code.

Why 700Mobile?
✓ Reliable products and transparent prices.
✓ Fast and convenient delivery.
✓ Simple and secure shopping.

Download now and start shopping!
```

---

## 2. Grafik materiallar (Graphics) — TAYYORLASH KERAK

Play Console quyidagilarni talab qiladi. Bularni dizaynerga yoki Canva'da
tayyorlash mumkin:

| Element | O'lcham | Izoh |
|---|---|---|
| **App icon** | 512×512 px, PNG (32-bit) | Ilova ikonkasi. `android/app/src/main/res/mipmap-*` da bor — 512px versiyasi kerak |
| **Feature graphic** | 1024×500 px, PNG/JPG | Do'kon yuqorisidagi banner |
| **Telefon skrinshotlari** | Kamida 2 ta (maks 8) | 16:9 yoki 9:16, min 320px | 
| **7" planshet** (ixtiyoriy) | — | Kerak emas, lekin tavsiya |

> **Skrinshot tayyorlash:** ilovani emulyator yoki telefonda ochib, asosiy
> ekranlarni suratga oling: Bosh sahifa, Katalog, Mahsulot sahifasi, Savat,
> Profil. Chiroyli ko'rinishi uchun statusbar toza bo'lsin.

---

## 3. Data Safety formasi (Ma'lumotlar xavfsizligi) — MAJBURIY

Play Console → App content → Data safety. Quyidagicha to'ldiring:

**Savol: Ilova foydalanuvchi ma'lumotini yig'adi yoki ulashadimi?** → **Ha (Yes)**

**Yig'iladigan ma'lumot turlari:**

| Ma'lumot turi | Yig'iladimi | Ulashiladimi | Maqsad | Majburiymi |
|---|---|---|---|---|
| **Ism (Name)** | Ha | Yo'q* | App functionality, Account management | Majburiy |
| **Telefon raqami** | Ha | Yo'q* | App functionality, Account management | Majburiy |
| **Manzil (Address)** | Ha | Yo'q* | App functionality (yetkazib berish) | Majburiy |
| **Taxminiy joylashuv** | Ha | Yo'q | App functionality | Ixtiyoriy |
| **Aniq joylashuv (GPS)** | Ha | Yo'q | App functionality (manzil aniqlash) | Ixtiyoriy |
| **Xarid tarixi** | Ha | Yo'q | App functionality | Majburiy |
| **Crash loglari** | Ha | Yo'q | Analytics (barqarorlik) | Ixtiyoriy |
| **Diagnostika** | Ha | Yo'q | Analytics | Ixtiyoriy |

> \* "Ulashiladimi" = uchinchi tomonga uzatiladimi. Kuryerga manzil berish va
> Eskiz orqali SMS yuborish — bu **xizmatni bajarish uchun** (service provider),
> Google buni "sharing" deb hisoblamaydi. Reklama yoki sotish uchun ulashmaysiz —
> shuning uchun "Yo'q".

**Xavfsizlik savollari:**
- **Ma'lumot uzatishda shifrlanadimi (encrypted in transit)?** → **Ha** (HTTPS/TLS).
- **Foydalanuvchi ma'lumotni o'chirishni so'ray oladimi?** → **Ha** —
  akkaunt o'chirish: ilova Profil bo'limi yoki `support@700mobile.uz`.
  (URL: `https://700mobile.uz/privacy` — akkaunt o'chirish bo'limi ko'rsatilgan.)

---

## 4. Content rating (Yosh reytingi)

App content → Content rating so'rovnomasini to'ldiring.
- Kategoriya: **Shopping / Xarid** (o'yin emas).
- Zo'ravonlik, kontent, giyohvandlik va h.k. — hammasiga **Yo'q**.
- Natija: odatda **Everyone / Hamma uchun (3+)**.

---

## 5. App access (Kirish ma'lumoti) — MUHIM

Ilova login talab qiladi (telefon + SMS). Google review jamoasi ilovani sinash
uchun kirishi kerak. **App content → App access** bo'limida test akkaunt bering:

- Login turi: telefon raqami + OTP kod.
- ⚠️ Real SMS moderatsiyada bo'lgani uchun hozir **DEBUG OTP** ishlaydi
  (`OTP_DEBUG=True`) — kod: `121212`. Test uchun:
  - Telefon: (ishlaydigan test raqami, masalan `+998 90 000 00 00`)
  - Kod: `121212`
  - Izohga yozing: "Enter any phone number, then use OTP code 121212 to log in."

> Agar production'da real SMS yoqilgan bo'lsa (`OTP_DEBUG=False`), Google
> reviewerга haqiqiy kirishi mumkin bo'lgan alohida test raqam/kod bering.

---

## 6. To'liq yuklash ketma-ketligi (D-U-N-S kelgach)

1. **D-U-N-S raqami** emailga keladi → Play Console tashkilot verifikatsiyasiga kiriting.
2. Identity verification (pasport/hujjat) — yakunlang.
3. Play Console → **Create app**:
   - App name: `700Mobile — Onlayn do'kon`
   - Default language: `O'zbek (uz)` yoki `Rus (ru)`
   - App yoki Game: **App**
   - Free yoki Paid: **Free**
4. **Store listing** → yuqoridagi 1-bo'lim matnlari (uz asosiy til, ru/en qo'shimcha).
5. **Graphics** → 2-bo'lim: icon 512px, feature graphic, skrinshotlar.
6. **Data safety** → 3-bo'lim.
7. **Content rating** → 4-bo'lim.
8. **App access** → 5-bo'lim (test login).
9. **Privacy Policy URL** → `https://700mobile.uz/privacy`
10. **Production → Create release**:
    - `app-release.aab` ni yuklang.
    - Release notes yozing (masalan: "Birinchi versiya — 700Mobile onlayn do'kon.")
11. **Countries** → O'zbekiston (yoki kerakli davlatlar).
12. **Review va Publish** → yuboring. Birinchi review odatda bir necha kun – 1 hafta.

> **Tashkilot akkaunti** uchun 20 tester / 14 kunlik closed testing talabi
> **YO'Q** — to'g'ridan-to'g'ri Production'ga chiqarasiz.

---

## 7. Nusxa ko'chirish uchun tez ma'lumot

```
Application ID : uz.mobile700.app
App name       : 700Mobile — Onlayn do'kon
Category       : Shopping
Privacy Policy : https://700mobile.uz/privacy
Website        : https://700mobile.uz
Email (support): support@700mobile.uz  (yoki xursandbekoktamov865@gmail.com)
Phone          : +998 99 132 00 77
AAB path       : build/app/outputs/bundle/release/app-release.aab
Test OTP       : 121212 (DEBUG rejimda)
```
