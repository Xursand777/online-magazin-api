import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';

/**
 * PrivacyPolicy — Maxfiylik siyosati (uz/ru/en).
 *
 * Google Play va App Store talablariga mos rasmiy hujjat. Ilova quyidagilarni
 * yig'adi: telefon raqam (OTP login), ism, yetkazib berish manzili + GPS
 * koordinata, buyurtma tarixi, texnik/crash ma'lumot (Sentry). Bu sahifa
 * ularning barchasini, maqsadlarini, uchinchi tomonlarni va foydalanuvchi
 * huquqlarini (jumladan AKKAUNT O'CHIRISH — Play Store majburiy talabi)
 * ochib beradi.
 *
 * Public URL: https://700mobile.uz/privacy  → Play Console "Privacy Policy"
 * maydoniga aynan shu havola yoziladi.
 */

// ─── Kontakt ma'lumotlari — bitta joyda, o'zgartirish oson ───────────────────
// Play Store review jamoasi shu email/telefon orqali bog'lanishi mumkin, shuning
// uchun ular HAQIQATAN ishlashi shart. Domen pochtasi (support@700mobile.uz)
// sozlangach, quyidagini yangilang.
const CONTACT = {
  brand: '700Mobile.uz',
  legal: "YaTT Matyakubov Yunusbek Atanazar o'g'li",
  email: 'support@700mobile.uz',
  emailFallback: 'xursandbekoktamov865@gmail.com',
  phone: '+998 99 132 00 77',
  website: 'https://700mobile.uz',
  addressUz: "Xorazm viloyati, Urganch shahri, Yangi Urganch ko'chasi 16-A",
  addressRu: 'Хорезмская область, г. Ургенч, ул. Янги Ургенч 16-А',
  addressEn: 'Yangi Urganch str. 16-A, Urgench, Khorezm region, Uzbekistan',
} as const;

// Oxirgi yangilangan sana — siyosat o'zgarganda yangilang.
const LAST_UPDATED = { uz: '2026-yil 21-iyul', ru: '21 июля 2026', en: 'July 21, 2026' };

type Section = { h: string; body: string[] };
type Doc = { title: string; intro: string; sections: Section[]; updatedLabel: string };

const CONTENT: Record<'uz' | 'ru' | 'en', Doc> = {
  // ─────────────────────────────── O'ZBEK ───────────────────────────────────
  uz: {
    title: 'Maxfiylik siyosati',
    updatedLabel: `Oxirgi yangilanish: ${LAST_UPDATED.uz}`,
    intro:
      `${CONTACT.brand} ("biz", "ilova") sizning shaxsiy ma'lumotlaringiz maxfiyligini ` +
      `hurmat qiladi. Ushbu siyosat qanday ma'lumot yig'ishimiz, undan qanday ` +
      `foydalanishimiz, kim bilan bo'lishishimiz va sizning huquqlaringizni tushuntiradi. ` +
      `Ilovadan foydalanish orqali siz shu siyosatga rozilik bildirasiz.`,
    sections: [
      {
        h: '1. Biz kim bo\'lamiz',
        body: [
          `Ilova operatori: ${CONTACT.legal} (${CONTACT.brand}).`,
          `Manzil: ${CONTACT.addressUz}.`,
          `Bog'lanish: ${CONTACT.email} • ${CONTACT.phone} • ${CONTACT.website}`,
        ],
      },
      {
        h: '2. Qanday ma\'lumotlarni yig\'amiz',
        body: [
          '• Telefon raqami — ro\'yxatdan o\'tish va tizimga kirish uchun (SMS orqali bir martalik kod / OTP).',
          '• Ism va profil ma\'lumotlari — buyurtmani rasmiylashtirish va murojaat uchun.',
          '• Yetkazib berish manzili — siz kiritgan yoki tanlagan manzil.',
          '• Joylashuv (GPS) — FAQAT siz ruxsat berganingizda va yetkazib berish manzilini avtomatik aniqlash uchun. Joylashuv fonda kuzatilmaydi.',
          '• Buyurtma va to\'lov tarixi — qaysi mahsulotlarni buyurtma qilganingiz, holati, summasi.',
          '• Texnik ma\'lumot — qurilma turi, ilova versiyasi, xatolik (crash) hisobotlari — ilova barqarorligini yaxshilash uchun.',
        ],
      },
      {
        h: '3. Ma\'lumotdan qanday foydalanamiz',
        body: [
          '• Akkauntingizni yaratish va xavfsiz kirishni ta\'minlash.',
          '• Buyurtmalarni qabul qilish, tayyorlash va yetkazib berish.',
          '• Buyurtma holati va yetkazib berish kodi haqida SMS/bildirishnoma yuborish.',
          '• Mijozlarni qo\'llab-quvvatlash va murojaatlarga javob berish.',
          '• Firibgarlik va suiiste\'molning oldini olish, xavfsizlikni ta\'minlash.',
          '• Ilova ishlashini tahlil qilish va yaxshilash.',
        ],
      },
      {
        h: '4. SMS xabarlar',
        body: [
          'Biz sizga faqat XIZMAT bilan bog\'liq SMS yuboramiz: tizimga kirish kodi (OTP) va buyurtma holati / yetkazib berish kodi.',
          'SMS xabarlar Eskiz.uz operatori orqali yuboriladi. Biz reklama SMS spam yubormaymiz.',
        ],
      },
      {
        h: '5. Ma\'lumotni kim bilan bo\'lishamiz',
        body: [
          'Biz shaxsiy ma\'lumotlaringizni SOTMAYMIZ. Ma\'lumot faqat xizmatni ta\'minlash uchun quyidagi ishonchli xizmat provayderlari bilan ulashilishi mumkin:',
          '• Eskiz.uz — SMS yetkazib berish.',
          '• Cloudflare — hosting, xavfsizlik va tarkib yetkazish (CDN).',
          '• Sentry — xatolik (crash) monitoringi.',
          '• OpenStreetMap / Nominatim — manzilni koordinataga aylantirish (geokodlash).',
          '• Yetkazib beruvchi kuryerlar — buyurtmani yetkazish uchun kerakli manzil va telefon.',
          'Shuningdek, qonun talab qilgan hollarda vakolatli davlat organlariga taqdim etilishi mumkin.',
        ],
      },
      {
        h: '6. Ma\'lumotni saqlash muddati',
        body: [
          'Ma\'lumotlaringizni akkauntingiz faol bo\'lgan davrda va qonun talab qilgan muddat (masalan, buxgalteriya/soliq hisobi) davomida saqlaymiz.',
          'Akkaunt o\'chirilganda, qonuniy majburiyat bo\'lmagan ma\'lumotlar o\'chiriladi yoki anonimlashtiriladi.',
        ],
      },
      {
        h: '7. Xavfsizlik',
        body: [
          'Ma\'lumotlaringizni himoya qilish uchun shifrlash (HTTPS/TLS), xavfsiz autentifikatsiya (JWT), server darajasida cheklovlar va firewall qo\'llaymiz.',
          'Hech bir tizim 100% xavfsiz emas, lekin biz sanoat standartlariga muvofiq choralar ko\'ramiz.',
        ],
      },
      {
        h: '8. Sizning huquqlaringiz va akkauntni o\'chirish',
        body: [
          'Siz quyidagi huquqlarga egasiz:',
          '• Ma\'lumotlaringizni ko\'rish va tuzatish (ilova → Profil).',
          '• Akkaunt va shaxsiy ma\'lumotlaringizni O\'CHIRISH.',
          `Akkauntni o\'chirish uchun: ilovadagi Profil bo\'limidan so\'rov yuboring YOKI ${CONTACT.email} manziliga xat yozing. So\'rov 30 kun ichida bajariladi va qonun talab qilmagan barcha shaxsiy ma\'lumotlar o\'chiriladi.`,
        ],
      },
      {
        h: '9. Bolalar maxfiyligi',
        body: [
          'Ilova 16 yoshgacha bo\'lgan bolalarga mo\'ljallanmagan va biz ulardan bila turib ma\'lumot yig\'maymiz.',
        ],
      },
      {
        h: '10. Ushbu siyosatga o\'zgartirishlar',
        body: [
          'Biz ushbu siyosatni vaqti-vaqti bilan yangilashimiz mumkin. Muhim o\'zgarishlar haqida ilova orqali xabar beramiz. Yuqoridagi "Oxirgi yangilanish" sanasiga e\'tibor bering.',
        ],
      },
      {
        h: '11. Biz bilan bog\'lanish',
        body: [
          `Savollaringiz bo\'lsa: ${CONTACT.email} (yoki ${CONTACT.emailFallback}) • ${CONTACT.phone}`,
          `${CONTACT.brand} — ${CONTACT.website}`,
        ],
      },
    ],
  },

  // ─────────────────────────────── РУССКИЙ ──────────────────────────────────
  ru: {
    title: 'Политика конфиденциальности',
    updatedLabel: `Последнее обновление: ${LAST_UPDATED.ru}`,
    intro:
      `${CONTACT.brand} («мы», «приложение») уважает конфиденциальность ваших ` +
      `персональных данных. Эта политика объясняет, какие данные мы собираем, как ` +
      `используем, с кем делимся и какие права у вас есть. Используя приложение, вы ` +
      `соглашаетесь с настоящей политикой.`,
    sections: [
      {
        h: '1. Кто мы',
        body: [
          `Оператор приложения: ${CONTACT.legal} (${CONTACT.brand}).`,
          `Адрес: ${CONTACT.addressRu}.`,
          `Связь: ${CONTACT.email} • ${CONTACT.phone} • ${CONTACT.website}`,
        ],
      },
      {
        h: '2. Какие данные мы собираем',
        body: [
          '• Номер телефона — для регистрации и входа (одноразовый код по SMS / OTP).',
          '• Имя и данные профиля — для оформления заказа и связи.',
          '• Адрес доставки — введённый или выбранный вами.',
          '• Геолокация (GPS) — ТОЛЬКО с вашего разрешения и для автоопределения адреса доставки. Мы не отслеживаем местоположение в фоне.',
          '• История заказов и платежей — какие товары вы заказали, статус, сумма.',
          '• Технические данные — тип устройства, версия приложения, отчёты об ошибках (crash) — для повышения стабильности.',
        ],
      },
      {
        h: '3. Как мы используем данные',
        body: [
          '• Создание аккаунта и безопасный вход.',
          '• Приём, подготовка и доставка заказов.',
          '• Отправка SMS/уведомлений о статусе заказа и коде получения.',
          '• Поддержка клиентов и ответы на обращения.',
          '• Предотвращение мошенничества и обеспечение безопасности.',
          '• Анализ и улучшение работы приложения.',
        ],
      },
      {
        h: '4. SMS-сообщения',
        body: [
          'Мы отправляем только СЕРВИСНЫЕ SMS: код входа (OTP) и статус заказа / код доставки.',
          'SMS доставляются через оператора Eskiz.uz. Мы не рассылаем рекламный спам.',
        ],
      },
      {
        h: '5. С кем мы делимся данными',
        body: [
          'Мы НЕ продаём ваши персональные данные. Данные могут передаваться только надёжным поставщикам услуг для работы сервиса:',
          '• Eskiz.uz — доставка SMS.',
          '• Cloudflare — хостинг, безопасность и доставка контента (CDN).',
          '• Sentry — мониторинг ошибок (crash).',
          '• OpenStreetMap / Nominatim — геокодирование адреса.',
          '• Курьеры — адрес и телефон, необходимые для доставки заказа.',
          'Также данные могут быть предоставлены уполномоченным госорганам, если этого требует закон.',
        ],
      },
      {
        h: '6. Срок хранения данных',
        body: [
          'Мы храним данные, пока ваш аккаунт активен, и в течение срока, установленного законом (например, бухгалтерский/налоговый учёт).',
          'При удалении аккаунта данные, не подпадающие под юридические обязательства, удаляются или анонимизируются.',
        ],
      },
      {
        h: '7. Безопасность',
        body: [
          'Для защиты данных мы применяем шифрование (HTTPS/TLS), безопасную аутентификацию (JWT), серверные ограничения и firewall.',
          'Ни одна система не защищена на 100%, но мы принимаем меры в соответствии с отраслевыми стандартами.',
        ],
      },
      {
        h: '8. Ваши права и удаление аккаунта',
        body: [
          'Вы имеете право:',
          '• Просматривать и исправлять свои данные (приложение → Профиль).',
          '• УДАЛИТЬ аккаунт и персональные данные.',
          `Чтобы удалить аккаунт: отправьте запрос из раздела Профиль в приложении ИЛИ напишите на ${CONTACT.email}. Запрос выполняется в течение 30 дней; удаляются все персональные данные, не требуемые законом.`,
        ],
      },
      {
        h: '9. Конфиденциальность детей',
        body: [
          'Приложение не предназначено для детей младше 16 лет, и мы сознательно не собираем их данные.',
        ],
      },
      {
        h: '10. Изменения политики',
        body: [
          'Мы можем время от времени обновлять эту политику. О важных изменениях сообщим через приложение. Обращайте внимание на дату «Последнее обновление» выше.',
        ],
      },
      {
        h: '11. Связаться с нами',
        body: [
          `По вопросам: ${CONTACT.email} (или ${CONTACT.emailFallback}) • ${CONTACT.phone}`,
          `${CONTACT.brand} — ${CONTACT.website}`,
        ],
      },
    ],
  },

  // ─────────────────────────────── ENGLISH ──────────────────────────────────
  en: {
    title: 'Privacy Policy',
    updatedLabel: `Last updated: ${LAST_UPDATED.en}`,
    intro:
      `${CONTACT.brand} ("we", "the app") respects the privacy of your personal ` +
      `data. This policy explains what data we collect, how we use it, who we share ` +
      `it with, and your rights. By using the app, you agree to this policy.`,
    sections: [
      {
        h: '1. Who we are',
        body: [
          `App operator: ${CONTACT.legal} (${CONTACT.brand}).`,
          `Address: ${CONTACT.addressEn}.`,
          `Contact: ${CONTACT.email} • ${CONTACT.phone} • ${CONTACT.website}`,
        ],
      },
      {
        h: '2. What data we collect',
        body: [
          '• Phone number — for registration and login (one-time code via SMS / OTP).',
          '• Name and profile data — to place orders and contact you.',
          '• Delivery address — as entered or selected by you.',
          '• Location (GPS) — ONLY with your permission and to auto-detect your delivery address. We do not track location in the background.',
          '• Order and payment history — what you ordered, its status and amount.',
          '• Technical data — device type, app version, crash reports — to improve stability.',
        ],
      },
      {
        h: '3. How we use the data',
        body: [
          '• Create your account and provide secure login.',
          '• Receive, prepare and deliver orders.',
          '• Send SMS/notifications about order status and delivery code.',
          '• Customer support and responding to requests.',
          '• Prevent fraud and abuse, ensure security.',
          '• Analyze and improve app performance.',
        ],
      },
      {
        h: '4. SMS messages',
        body: [
          'We send only SERVICE SMS: login code (OTP) and order status / delivery code.',
          'SMS are delivered via the Eskiz.uz provider. We do not send promotional spam.',
        ],
      },
      {
        h: '5. Who we share data with',
        body: [
          'We do NOT sell your personal data. Data may be shared only with trusted service providers to operate the service:',
          '• Eskiz.uz — SMS delivery.',
          '• Cloudflare — hosting, security and content delivery (CDN).',
          '• Sentry — crash/error monitoring.',
          '• OpenStreetMap / Nominatim — address geocoding.',
          '• Delivery couriers — the address and phone needed to deliver your order.',
          'Data may also be provided to authorized government bodies where required by law.',
        ],
      },
      {
        h: '6. Data retention',
        body: [
          'We keep your data while your account is active and for the period required by law (e.g. accounting/tax records).',
          'When an account is deleted, data not subject to legal obligations is deleted or anonymized.',
        ],
      },
      {
        h: '7. Security',
        body: [
          'We use encryption (HTTPS/TLS), secure authentication (JWT), server-side rate limits and a firewall to protect your data.',
          'No system is 100% secure, but we take measures in line with industry standards.',
        ],
      },
      {
        h: '8. Your rights and account deletion',
        body: [
          'You have the right to:',
          '• View and correct your data (app → Profile).',
          '• DELETE your account and personal data.',
          `To delete your account: send a request from the Profile section in the app OR email ${CONTACT.email}. Requests are completed within 30 days; all personal data not required by law is deleted.`,
        ],
      },
      {
        h: '9. Children\'s privacy',
        body: [
          'The app is not intended for children under 16, and we do not knowingly collect their data.',
        ],
      },
      {
        h: '10. Changes to this policy',
        body: [
          'We may update this policy from time to time. We will notify you of significant changes through the app. Please note the "Last updated" date above.',
        ],
      },
      {
        h: '11. Contact us',
        body: [
          `Questions: ${CONTACT.email} (or ${CONTACT.emailFallback}) • ${CONTACT.phone}`,
          `${CONTACT.brand} — ${CONTACT.website}`,
        ],
      },
    ],
  },
};

const PrivacyPolicy = () => {
  const { language } = useTranslation();
  const doc = CONTENT[language] ?? CONTENT.uz;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-h3 font-h3 text-on-surface sm:text-h2 sm:font-h2">{doc.title}</h1>
      <p className="mt-2 text-body-sm font-body-sm text-on-surface-variant">{doc.updatedLabel}</p>

      <p className="mt-6 text-body-md font-body-md leading-relaxed text-on-surface-variant">
        {doc.intro}
      </p>

      <div className="mt-8 space-y-8">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-title-md font-title-md text-on-surface">{s.h}</h2>
            <div className="mt-3 space-y-2">
              {s.body.map((line, i) => (
                <p
                  key={i}
                  className="text-body-md font-body-md leading-relaxed text-on-surface-variant"
                >
                  {line}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Link
        to="/"
        className="mt-12 inline-flex items-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-base font-semibold text-on-primary transition-opacity hover:opacity-90"
      >
        <span className="material-symbols-outlined text-[20px]">home</span>
        {language === 'ru' ? 'На главную' : language === 'en' ? 'Home' : 'Bosh sahifa'}
      </Link>
    </div>
  );
};

export default PrivacyPolicy;
