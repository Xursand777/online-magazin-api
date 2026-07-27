/// O'zbek tili (asosiy — kanonik kalit nomlarining manbai).
///
/// Boshqa tillar shu strukturani aks ettiradi. Yangi kalit qo'shsangiz,
/// 3 ta tilga ham qo'shing.
const Map<String, String> translationsUz = {
  // ─── Navigation (bottom nav) ──────────────────────────────────────────────
  'nav.home': 'Asosiy',
  'nav.catalog': 'Katalog',
  'nav.favorites': 'Sevimli',
  'nav.cart': 'Savat',
  'nav.profile': 'Profil',

  // ─── Common (umumiy) ──────────────────────────────────────────────────────
  'common.yes': 'Ha',
  'common.no': "Yo'q",
  'common.ok': 'OK',
  'common.cancel': 'Bekor qilish',
  'common.save': 'Saqlash',
  'common.retry': 'Qayta urinish',
  'common.loading': 'Yuklanmoqda...',
  'common.empty': 'Bo\'sh',
  'common.confirm': 'Tasdiqlash',
  'common.close': 'Yopish',
  'common.next': 'Keyingi',
  'common.back': 'Orqaga',
  'common.search': 'Qidirish',
  'common.clear': 'Tozalash',
  'common.delete': "O'chirish",
  'common.edit': 'Tahrirlash',
  'common.add': "Qo'shish",
  'common.remove': 'Olib tashlash',
  'common.total': 'Jami',
  'common.done': 'Tayyor',
  'common.success': 'Muvaffaqiyatli',
  'common.understood': 'Tushunarli',

  // ─── Auth (kirish/ro'yxat) ────────────────────────────────────────────────
  'auth.login': 'Tizimga kirish',
  'auth.logout': 'Tizimdan chiqish',
  'auth.logoutConfirm': 'Tizimdan chiqishni xohlaysizmi?',
  'auth.phone': 'Telefon raqami',
  'auth.phoneHint': '+998 90 123 45 67',
  'auth.password': 'Parol',
  'auth.otp': 'Tasdiqlash kodi',
  'auth.sendOtp': 'Kod yuborish',
  'auth.verifyOtp': 'Kodni tasdiqlash',
  'auth.guest': 'Mehmon',
  'auth.guestGreeting': 'Salom, mehmon!',
  'auth.guestDescription':
      'Buyurtmalaringizni boshqarish va sevimli mahsulotlarni saqlash uchun tizimga kiring',
  'auth.loginViaPhone': 'Telefon raqamingiz orqali bir necha soniyada',

  // ─── Home (bosh sahifa) ───────────────────────────────────────────────────
  'home.searchHint': 'Mahsulot qidirish...',
  'home.searchHintFull': 'Mahsulot, brend yoki kategoriya...',
  'catalog.loadError': 'Kataloglar yuklab bo\'lmadi',
  'catalog.noCategories': 'Kataloglar topilmadi',
  'catalog.subcategoriesCount': '{count} ta turkum',
  'common.error': 'Xatolik',
  'home.categories': 'Kategoriyalar',
  'home.discounts': 'Chegirmalar',
  'home.new': 'Yangi mahsulotlar',
  'home.popular': 'Mashhur',
  'home.recommended': 'Sizga tavsiya etamiz',
  'home.recentlyViewed': "Ko'rganlaringiz",
  'home.viewAll': "Hammasini ko'rish",

  // ─── Catalog ──────────────────────────────────────────────────────────────
  'catalog.title': 'Katalog',
  'catalog.allCategories': 'Barcha kategoriyalar',
  'catalog.empty': 'Bu kategoriyada mahsulot yo\'q',

  // ─── Cart ─────────────────────────────────────────────────────────────────
  'cart.title': 'Savat',
  'cart.empty': "Savat bo'sh",
  'cart.emptyDescription':
      "Boshlash uchun bosh sahifadagi mahsulotlarni qo'shing",
  'cart.goShopping': 'Xaridni boshlash',
  'cart.itemCount': '{count} ta mahsulot',
  'cart.subtotal': 'Mahsulotlar',
  'cart.delivery': 'Yetkazib berish',
  'cart.free': 'Bepul',
  'cart.totalAmount': 'Jami summa',
  'cart.checkout': 'Rasmiylashtirish',
  // Buyurtma vaqt oynasi (9:00–19:00) eslatmasi
  'orderWindow.title': 'Hozircha yopiqmiz 🌙',
  'orderWindow.body':
      'Buyurtmalar har kuni {open} dan {close} gacha qabul qilinadi. '
          'Belgilangan vaqtda qaytib keling — sizni mamnuniyat bilan kutib qolamiz! 💚',
  'orderWindow.gotIt': 'Tushunarli',
  'cart.removeAll': "Hammasini o'chirish",
  'cart.removeConfirm':
      "Savatdagi barcha mahsulotlarni o'chirishni xohlaysizmi?",

  // ─── Checkout ─────────────────────────────────────────────────────────────
  'checkout.title': 'Rasmiylashtirish',
  'checkout.receiverName': 'Ism va familiya',
  'checkout.receiverPhone': 'Telefon raqam',
  'checkout.phoneLockedHint': "Login raqamingiz — o'zgartirib bo'lmaydi",
  'checkout.deliveryAddress': 'Yetkazib berish manzili',
  'checkout.addressHint': "Viloyat, tuman, ko'cha, uy raqami",
  'checkout.paymentType': "To'lov turi",
  'checkout.cash': 'Naqd pul',
  'checkout.card': 'Plastik karta',
  'checkout.credit': "Muddatli to'lov",
  'checkout.cardSubtitle': 'Click / Payme (Tez kunda)',
  'checkout.creditDays': '{days} kun',
  'checkout.creditDaysRange': '5 – 20 kun',
  'checkout.creditInfo':
      "Muddatli to'lov 5 kundan 20 kungacha beriladi. "
          "Belgilangan muddatdan kechiksa, muddatli to'lov xizmati bloklanadi.",
  'checkout.confirmOrder': 'Buyurtmani tasdiqlash',
  'checkout.totalPayable': "To'lanishi kerak bo'lgan summa:",
  'checkout.allFieldsRequired': 'Barcha maydonlarni to\'ldiring',
  'checkout.phoneInvalid': "Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak",
  'checkout.orderSuccess': 'Buyurtma muvaffaqiyatli yaratildi!',
  'checkout.orderError': 'Xatolik yuz berdi',
  'checkout.masterOnlyHint':
      "Muddatli to'lov faqat Ustalar uchun. Naqd pul tanlandi — qayta urinib ko'ring.",

  // ─── Profile ──────────────────────────────────────────────────────────────
  'profile.title': 'Profil',
  'profile.myOrders': 'Mening buyurtmalarim',
  'profile.favorites': 'Sevimlilar',
  'profile.myAddress': 'Mening manzilim',
  'profile.paymentMethods': "To'lov usullari",
  'profile.settings': 'Sozlamalar',
  'profile.helpCenter': 'Yordam markazi',
  'profile.aboutApp': 'Ilova haqida',
  'profile.editProfile': 'Profilni tahrirlash',
  'profile.firstName': 'Ism',
  'profile.lastName': 'Familiya',
  'profile.required': 'Majburiy',
  'profile.basicInfo': "ASOSIY MA'LUMOTLAR",
  'profile.singleAddress':
      "Yetkazib berish manzili. Bir marta saqlasangiz, "
          "buyurtmani rasmiylashtirishda avtomatik to'ldiriladi.",
  'profile.unsavedChanges': "Saqlanmagan o'zgarishlar",
  'profile.discardChanges':
      "Kiritgan ma'lumotlaringiz saqlanmagan. "
          "Saqlamasdan chiqishni xohlaysizmi?",
  'profile.profileUpdated': 'Profil yangilandi',

  // ─── Orders (buyurtmalar) ─────────────────────────────────────────────────
  'orders.title': 'Buyurtmalarim',
  'orders.empty': "Buyurtmalar yo'q",
  'orders.orderNumber': 'Buyurtma №{id}',
  'orders.status.pending': 'Kutilmoqda',
  'orders.status.confirmed': 'Tasdiqlangan',
  'orders.status.packing': 'Qadoqlanmoqda',
  'orders.status.shipping': 'Yetkazib berilmoqda',
  'orders.status.delivered': 'Yetkazib berildi',
  'orders.status.received': 'Qabul qilindi',
  'orders.status.cancelled': 'Bekor qilindi',
  'orders.cancelOrder': 'Buyurtmani bekor qilish',

  // ─── Favorites ────────────────────────────────────────────────────────────
  'favorites.title': 'Sevimlilar',
  'favorites.empty': "Sevimlilar ro'yxati bo'sh",
  'favorites.emptyDescription':
      "Yoqqan mahsulotlarni qo'shib qo'ying — keyinroq topish oson bo'ladi",

  // ─── Product ──────────────────────────────────────────────────────────────
  'product.addToCart': "Savatga qo'shish",
  'product.buyNow': 'Hozir sotib olish',
  'product.inStock': '{count} ta mavjud',
  'product.outOfStock': 'Omborda yo\'q',
  'product.lowStock': 'Tugayotgan',
  'product.description': 'Tavsif',
  'product.specifications': 'Xususiyatlari',
  'product.variants': 'Variantlar',
  'product.reviews': 'Sharhlar',

  // ─── Settings ─────────────────────────────────────────────────────────────
  'settings.title': 'Sozlamalar',
  'settings.language': 'Til',
  'settings.languageDescription':
      'Ilova interfeysi va mahsulot ma\'lumotlari uchun til',
  'settings.theme': 'Tema',
  'settings.themeLight': 'Yorug\'',
  'settings.themeDark': 'Qorong\'u',
  'settings.themeSystem': 'Tizim',
  'settings.notifications': 'Bildirishnomalar',
  'settings.version': 'Versiya',

  // ─── Master + Credit ──────────────────────────────────────────────────────
  'master.title': 'Usta statusi',
  'master.discountLabel': 'imtiyoz kuchi',
  'master.baseDiscount': 'Bazaviy',
  'master.lowActivity': '(faollik kamaygan)',
  'master.level': 'Daraja',
  'master.statusNew': 'YANGI',
  'master.statusInactive': 'FAOLSIZ',
  'master.statusFull': "TO'LIQ",
  'master.statusReduced': 'KAMAYGAN',
  'master.firstPurchaseHint':
      "Birinchi xaridingizdan boshlab daraja oshib boradi",
  'master.todayPurchase': 'Bugun xarid qildingiz — faol!',
  'master.daysAgo': '{days} kun oldin xarid qildingiz',
  'master.longInactive':
      "{days} kun bo'ldi — yana xarid qiling, daraja qayta tiklanadi",

  'credit.title': "Muddatli to'lov",
  'credit.available': 'Sizga mavjud',
  'credit.availableDescription':
      "Ajoyib! Siz muddatli to'lov bilan xarid qilishingiz mumkin. "
          "Buyurtma vaqtida 5–20 kunlik to'lov muddati tanlanadi.",
  'credit.active': 'Faol kredit',
  'credit.activeDescription':
      "Sizda to'lanmagan muddatli to'lov buyurtma bor. "
          "Belgilangan muddatda to'lashingiz kerak.",
  'credit.overdue': "Muddati o'tgan",
  'credit.overdueDescription':
      "Sizning muddatli to'lov vaqtingiz o'tib ketdi. "
          "Darhol to'lashingiz kerak — aks holda blokga tushasiz.",
  'credit.banned': 'Bloklangan',
  'credit.bannedDescription':
      "Siz 3 marta to'lov muddatini o'tkazib yuborgansiz. "
          "Muddatli to'lov imkoniyatingiz doimiy bloklangan. "
          "Yordam uchun do'kon bilan bog'laning.",
  'credit.orderLabel': 'Buyurtma',
  'credit.dueLabel': 'Muddat',
  'credit.daysRemainingLabel': 'Qoldi',
  'credit.daysOverdue': "{days} kun o'tgan",
  'credit.today': 'Bugun!',
  'credit.tomorrow': 'Ertaga',
  'credit.daysRemaining': '{days} kun qoldi',
  'credit.totalOverdue': "Jami muddati o'tgan: ",
  'credit.viewOrder': "Buyurtmani ko'rish",

  // ─── Errors ───────────────────────────────────────────────────────────────
  'error.network': "Internet aloqasi yo'q",
  'error.server': 'Server xatosi',
  'error.unknown': 'Noma\'lum xatolik',
  'error.tryAgain': 'Qayta urinib ko\'ring',

  // ─── Coming soon ──────────────────────────────────────────────────────────
  'comingSoon.badge': 'TEZ ORADA',
  'comingSoon.notify':
      "Yangilanishlar uchun ilovani App Store yoki Google Play'da kuzatib boring.",

  // ─── About ────────────────────────────────────────────────────────────────
  'about.description':
      "700Mobile — O'zbekistondagi online savdo platformasi. "
          "Mahsulotlar, chegirmalar va tezkor yetkazib berish "
          "imkoniyatlarini bir joyda taklif etamiz.",
  'about.copyright': '© 2026 700Mobile. Barcha huquqlar himoyalangan.',
};
