# 📱 Telegram Bot Sozlash — To'liq Qo'llanma

> **Maqsad:** Bozor loyihasining alert'larini (server o'chish, balans tugash,
> backup, xato'lar) Telegram'ga yuboradigan bot yaratamiz.
>
> **Vaqt:** ~5 daqiqa
>
> **Tayyor bo'lganda menga jo'natadigan ma'lumotlar:** TOKEN + CHAT_ID

---

## Qadam 1: @BotFather'ni topish

1. Telefoningizda **Telegram**'ni oching
2. Yuqoridagi qidiruv (🔍) ga bosing
3. Yozing: **`@BotFather`**
4. Natijada **ko'k tasdiq belgisi** (verified) bo'lgan **BotFather** bot ko'rinadi
5. Botga bosing → **"START"** tugmasi yoki **`/start`** yuboring

> ⚠️ Diqqat: ko'p taqlid bot'lar bor (BotFather2, BotFatherUz, ...).
> **Faqat ko'k tasdiq belgili** rasmiy BotFather'ga kiring!

---

## Qadam 2: Yangi bot yaratish

1. BotFather bilan suhbatda **`/newbot`** yuboring

2. BotFather javob beradi:
   ```
   Alright, a new bot. How are we going to call it?
   Please choose a name for your bot.
   ```

3. **Bot uchun ko'rinadigan nom yozing** (istalgan):
   ```
   Bozor Alert Bot
   ```

4. BotFather:
   ```
   Good. Now let's choose a username for your bot.
   It must end in `bot`. Like this, for example:
   TetrisBot or tetris_bot.
   ```

5. **Username yozing** (`_bot` bilan tugashi shart va noyob bo'lishi shart):
   ```
   bozor_alert_bot
   ```
   yoki agar band bo'lsa:
   ```
   bozor_xabar_bot
   bozor_admin_alert_bot
   xursand_bozor_bot
   ```
   va h.k. — band bo'lmaguncha sinab ko'ring

6. **Muvaffaqiyatli bo'lsa**, BotFather quyidagi xabar yuboradi:

   ```
   Done! Congratulations on your new bot. You will find it at
   t.me/bozor_alert_bot. You can now add a description, about
   section and profile picture for your bot, see /help for a list
   of commands. By the way, when you've finished creating your
   cool bot, ping our Bot Support if you want a better username
   for it. Just make sure the bot is fully operational before
   you do this.

   Use this token to access the HTTP API:
   7842914738:AAEXabcdef123456789xyz_ABC

   Keep your token secure and store it safely, it can be used by
   anyone to control your bot.
   ```

---

## Qadam 3: 🔑 TOKEN ni nusxalash va saqlash

`Use this token to access the HTTP API:` ostidagi qator — bu sizning **TOKEN**.

Misol uchun:
```
7842914738:AAEXabcdef123456789xyz_ABC
```

📌 **Buni nusxalang va 1Password yoki notepad'ga saqlang.**

> ⚠️ **Xavfsizlik:**
> - TOKEN — parolga teng
> - Kim TOKEN'ni bilsa, bot orqali xabar yuborishi mumkin
> - Hech kimga bermang (men ham faqat sozlash uchun ishlataman)
> - Sizib chiqsa: @BotFather → `/mybots` → bot → "API Token" → "Revoke current token"

---

## Qadam 4: Bot bilan suhbatni boshlash

Bot sizga xabar yuborishi uchun, AVVAL siz bot'ga `/start` yuborishingiz shart.

1. BotFather chiqargan link'ni bosing: **`t.me/bozor_alert_bot`**

   (yoki Telegram qidiruvida sizning bot username'ni qidiring)

2. Botning sahifasi ochiladi (bo'sh chat)

3. Pastdagi **"START"** tugmasini bosing

4. Yoki shunchaki yozing: **`/start`** va yuboring

5. Bot odatda javob bermaydi (sizning kodingiz hali ulanmagan), bu **normal**

---

## Qadam 5: 💬 CHAT_ID ni topish

Endi sizning Telegram chat ID raqamingizni olamiz.

1. **Brauzerni oching** (Chrome, Safari, va h.k.)

2. Quyidagi URL'ga kiring (`<TOKEN>` ni o'zingizning TOKEN'iz bilan almashtiring):

   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```

   Misol:
   ```
   https://api.telegram.org/bot7842914738:AAEXabcdef123456789xyz_ABC/getUpdates
   ```

3. Brauzer JSON ko'rinishidagi javob ko'rsatadi:

   ```json
   {
     "ok": true,
     "result": [
       {
         "update_id": 123456789,
         "message": {
           "message_id": 1,
           "from": {
             "id": 987654321,
             "is_bot": false,
             "first_name": "Xursand",
             "language_code": "uz"
           },
           "chat": {
             "id": 987654321,
             "first_name": "Xursand",
             "type": "private"
           },
           "date": 1717246800,
           "text": "/start"
         }
       }
     ]
   }
   ```

4. **`"chat"`** ichidagi **`"id"`** raqamini topib oling:
   ```
   "chat": {
     "id": 987654321,   ← BU SIZNING CHAT_ID
     ...
   }
   ```

5. Bu raqamni ham nusxalang va saqlang

> 💡 **Agar javob `{"ok":true,"result":[]}` bo'sh bo'lsa:**
> - Bot bilan `/start` yubormagansiz
> - Telegram'da bot'ga qayting va `/start` yuboring
> - Brauzerni qayta yangilang (F5)

---

## 📤 Menga shu 2 narsani yuboring

Telegram'da chat'imizda quyidagi formatda yozing:

```
TOKEN: 7842914738:AAEXabcdef123456789xyz_ABC
CHAT_ID: 987654321
```

Men shu ikkisini olib:
1. `backend/.env` faylga yozaman
2. Sozlamani tekshiraman
3. `python manage.py test_telegram` orqali sizga 4 ta test xabar yuboraman
4. Telegram'ga ✅🟢🟡🔴 xabarlari kelishi kerak

---

## 🎯 Kelajakda: Guruh yaratish (ixtiyoriy)

Hozir bot **shaxsiy chat'ingizga** xabar yuboradi. Lekin keyinroq jamoa kerak bo'lsa:

1. Telegram'da yangi **guruh yarating** (3+ a'zo)
2. Guruhga sizning bot'ni **a'zo qiling**
3. Botni **admin** qiling (Manage group → Administrators → Add → bot)
4. Guruhda biror xabar yuboring
5. Yuqoridagi `getUpdates` URL'ga qayta kiring
6. Guruh `chat.id` boshqacha bo'ladi — **manfiy raqam** (`-100xxxxx`)
7. Bu raqamni menga yuboring, `.env` ni yangilab beraman

Foydasi: ikkinchi super_admin, buxgalter, sherigingiz — barcha alert'larni ko'radi.

---

## 🛠️ Muammolarni hal qilish

### "BotFather is not available"
@BotFather o'rniga @BotSupport'ga yozing yoki @BotFather'ni qayta qidiring (rasmiy bot).

### Username band: "Sorry, this username is already taken"
Boshqa username sinab ko'ring (sizning loyihangiz nomi + son, masalan: `bozor_alert_2026_bot`).

### getUpdates bo'sh `[]` qaytaradi
- Bot bilan `/start` yubormagansiz
- Bot'ga kiring, `/start` yuboring, qayta tekshiring
- Brauzer kesh'ini tozalang (Ctrl+F5 yoki Cmd+Shift+R)

### TOKEN unutilgan
@BotFather → `/mybots` → bot tanlash → "API Token" → ko'rinadi

### TOKEN sizib chiqdi
@BotFather → `/mybots` → bot → "API Token" → **"Revoke current token"**
Yangi token oling, menga yuboring, eski TOKEN ishlamaydi bo'ladi.

---

## ❓ Tez-tez beriladigan savollar

**S: Bot menga doim xabar yuboradimi?**
J: Yo'q. Faqat sodir bo'lgan voqealarda (server o'chsa, balans tugasa, va h.k.).
   Hech narsa bo'lmasa — sukut.

**S: Bot mening Telegram hisobimga kirib ko'radi?**
J: Yo'q. Bot faqat xabar yuboradi. Sizning shaxsiy ma'lumotlaringizga
   kira olmaydi.

**S: Bot pul oladi?**
J: Yo'q. Telegram Bot API to'liq bepul. Hech qachon to'lov bo'lmaydi.

**S: Bot men ulamasdan yo'qoladi?**
J: Yo'q. Bot doim ishlaydi (Telegram serverida). Faqat siz uni o'chirsangiz
   (BotFather → /mybots → Delete Bot).

**S: Bir nechta bot ochsam bo'ladimi?**
J: Ha, BotFather'da bir nechta bot bo'lishi mumkin. Masalan: alert bot,
   support bot, marketing bot — alohida.

---

## 📚 Bu hujjat qaerda?

- **Joriy fayl:** `/Users/xursand/Online Magazin API/TELEGRAM_SETUP.md`
- **RUNBOOK.md F.4** — token rotation protsedurasi
- **.env.example** — sozlash qiymatlari uchun shabloni
