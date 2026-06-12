/**
 * address.ts — Yetkazib berish manzili bilan ishlash uchun yordamchilar.
 *
 * STRUKTURALANGAN MANZIL ↔ STRING KONVERTATSIYA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Backend `delivery_address` ni BITTA matn (string) sifatida saqlaydi
 * (UserProfile.delivery_address). Lekin foydalanuvchi to'g'ri kiritishi va
 * keyinroq tahrir qila olishi uchun frontend uni 4 ta strukturalangan
 * maydonga ajratadi:
 *
 *   • viloyat     — Viloyat / region (Xorazm viloyati, Toshkent shahri, ...)
 *   • tumanShahar — Tuman yoki shahar (Urganch shahri, Mirzo Ulug'bek tumani)
 *   • mahalla     — Mahalla / qishloq (Bog'bon mahallasi, Kichik halqa)
 *   • domUy       — Ko'cha + uy raqami (Tashkent ko'chasi, 15-uy)
 *
 * KELISHILGAN FORMAT:
 *   String formati 4 qism vergul bilan ajratilgan:
 *     "Viloyat, Tuman/Shahar, Mahalla, Uy/Ko'cha"
 *
 *   PARSE ASIMETRIK:
 *     Foydalanuvchi qo'lda kiritsa, vergulsiz yoki noto'g'ri formatda
 *     yuborishi mumkin. parseStructuredAddress() iloji boricha qutqaradi.
 */

export interface StructuredAddress {
  viloyat: string;
  tumanShahar: string;
  mahalla: string;
  domUy: string;
}

export const EMPTY_ADDRESS: StructuredAddress = {
  viloyat: '',
  tumanShahar: '',
  mahalla: '',
  domUy: '',
};

/**
 * Strukturalangan manzilni bitta satrga yig'adi.
 * Bo'sh maydonlarni o'tkazib yuboradi (vergullar to'g'ri qo'yiladi).
 */
export function formatStructuredAddress(addr: Partial<StructuredAddress>): string {
  return [addr.viloyat, addr.tumanShahar, addr.mahalla, addr.domUy]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Backend'dan kelgan string manzilni 4 ta maydonga ajratadi.
 *
 * Algoritm:
 *   • Bo'sh bo'lsa — bo'sh struktura
 *   • 4+ qism: birinchi 3 ta alohida, qolgani domUy'ga birlashadi
 *   • Kam qism: imkon qadar to'ldiradi, qolgani bo'sh
 *
 * BU FUNKSIYA UNICITY KAFOLATLAYDI:
 *   formatStructuredAddress(parseStructuredAddress(s)) ≈ s
 *   (faqat ortiqcha bo'sh joylar yo'qoladi)
 */
export function parseStructuredAddress(full: string): StructuredAddress {
  if (!full) return { ...EMPTY_ADDRESS };
  const parts = full.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return { ...EMPTY_ADDRESS };

  if (parts.length >= 4) {
    return {
      viloyat: parts[0],
      tumanShahar: parts[1],
      mahalla: parts[2],
      domUy: parts.slice(3).join(', '),
    };
  }

  return {
    viloyat: parts[0] || '',
    tumanShahar: parts[1] || '',
    mahalla: parts[2] || '',
    domUy: '',
  };
}

/**
 * Nominatim reverse geocode javobidan 4 maydon to'ldirish.
 * Toshkent shahri uchun maxsus logika (region=Tashkent City fix).
 */
export interface NominatimAddress {
  state?: string;
  region?: string;
  province?: string;
  city?: string;
  city_district?: string;
  district?: string;
  county?: string;
  town?: string;
  suburb?: string;
  neighbourhood?: string;
  residential?: string;
  village?: string;
  hamlet?: string;
  road?: string;
  street?: string;
  house_number?: string;
  building?: string;
}

export function addressFromNominatim(addr: NominatimAddress): StructuredAddress {
  let detectedViloyat = addr.state || addr.region || addr.province || '';

  // Toshkent shahri uchun maxsus normalizatsiya
  if (!detectedViloyat && (addr.city === 'Toshkent' || addr.city === 'Tashkent')) {
    detectedViloyat = 'Toshkent shahri';
  }
  if (
    detectedViloyat.toLowerCase().includes('tashkent') ||
    detectedViloyat.toLowerCase().includes('toshkent')
  ) {
    detectedViloyat = 'Toshkent shahri';
  }

  let detectedTuman =
    addr.city_district || addr.district || addr.county || addr.town || addr.city || '';
  if (detectedTuman === detectedViloyat) {
    detectedTuman = addr.city_district || addr.district || '';
  }

  const detectedMahalla =
    addr.suburb || addr.neighbourhood || addr.residential || addr.village || addr.hamlet || '';

  const road = addr.road || addr.street || '';
  const houseNo = addr.house_number || addr.building || '';
  const detectedDom = [road, houseNo].filter(Boolean).join(' ');

  return {
    viloyat: detectedViloyat,
    tumanShahar: detectedTuman,
    mahalla: detectedMahalla,
    domUy: detectedDom,
  };
}

/**
 * Manzilning to'liq to'ldirilganligini tekshiradi.
 * Default: kamida viloyat + tumanShahar bo'lishi kerak.
 */
export function isAddressValid(addr: Partial<StructuredAddress>, strict = false): boolean {
  if (strict) {
    return !!(addr.viloyat?.trim() && addr.tumanShahar?.trim() && addr.mahalla?.trim() && addr.domUy?.trim());
  }
  return !!(addr.viloyat?.trim() && addr.tumanShahar?.trim());
}

/**
 * Reverse geocoding chaqiruvi (Nominatim API).
 * Til parametri ('uz' yoki 'ru') natijani lokalizatsiya qiladi.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  lang: 'uz' | 'ru' | 'en' = 'uz',
): Promise<NominatimAddress | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=${lang}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.address as NominatimAddress) || null;
  } catch (err) {
    console.error('[address] reverseGeocode xato:', err);
    return null;
  }
}
