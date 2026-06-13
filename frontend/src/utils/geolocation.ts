/**
 * geolocation.ts — Brauzer geolokatsiyasi uchun professional yordamchi.
 *
 * NIMA UCHUN BU MAVJUD?
 * ─────────────────────────────────────────────────────────────────────────────
 * Oddiy `navigator.geolocation.getCurrentPosition()` chaqiruvi ikkita
 * yashirin muammoga ega:
 *
 *   1. Foydalanuvchi BIR MARTA "Block" bossa, brauzer keyingi safar dialog
 *      ko'rsatmaydi. API darhol PERMISSION_DENIED bilan qaytadi. Foydalanuvchi
 *      esa "tugma bosildi-yu, hech narsa bo'lmadi" deb tushunmaydi.
 *
 *   2. Brauzerlar (Chrome, Safari, Firefox, Edge) ruxsatni qaytarish uchun
 *      turli xil yo'llardan o'tishni talab qiladi. Foydalanuvchi qaysi
 *      brauzerda qanday qilishni bilmaydi.
 *
 * BU YORDAMCHI QANDAY ISHLAYDI?
 *
 *   1. Permissions API (Chrome 88+, Safari 16+, Firefox 90+, Edge 88+) orqali
 *      ruxsat holatini OLDINDAN tekshiramiz — getCurrentPosition() ni
 *      chaqirmasdan turib. State: granted | prompt | denied | unsupported.
 *
 *   2. State ga qarab UI loyiq xulqni tanlaydi:
 *        granted     → darhol joylashuvni olamiz (default flow)
 *        prompt      → brauzer native dialog ko'rsatadi (default flow)
 *        denied      → professional modal: brauzerga aniq yo'l-yo'riq
 *        unsupported → qo'lda kiritish taklifi
 *
 *   3. Brauzer aniqlanishi User-Agent orqali — har biriga aniq instruksiya.
 *
 * REFERENCES:
 *   - https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
 *   - https://web.dev/articles/permissions-api-for-the-geolocation-api
 *   - W3C Geolocation API Specification
 */

export type GeolocationPermissionState =
  | 'granted'      // Foydalanuvchi ilgari ruxsat bergan — darhol oladi
  | 'prompt'       // Brauzer dialog ko'rsatadi (birinchi marta yoki "Faqat shu safar" tanlangan)
  | 'denied'       // Foydalanuvchi bloklagan — modal orqali yo'l-yo'riq
  | 'unsupported'; // Brauzer Permissions API yoki Geolocation'ni qo'llamaydi

/**
 * Geolocation muammosining ANIQ SABABI — modal'da to'g'ri xabar ko'rsatish uchun.
 *
 *   previously_denied  → Brauzer eslab qolgan: avval Block bosgan, dialog
 *                        endi ko'rsatilmaydi (modal asosiy stsenariy)
 *   just_denied        → Brauzer dialog'ida hozirgina Block bosildi
 *   insecure_context   → Sayt HTTPS emas (HTTP) — geolocation umuman ishlamaydi
 *                        (localhost dan tashqari)
 *   system_block       → OS yoki brauzer darajasidagi blok (macOS Settings,
 *                        Windows Privacy, Android tizim sozlamalari)
 *   unsupported        → Brauzer geolocation'ni umuman qo'llab-quvvatlamaydi
 *                        (juda eski versiya, sandbox iframe)
 */
export type GeolocationDenyReason =
  | 'previously_denied'
  | 'just_denied'
  | 'insecure_context'
  | 'system_block'
  | 'unsupported';

/**
 * Sayt SECURE CONTEXT'da ekanmi (HTTPS yoki localhost)?
 *
 * Geolocation API qattiq qoidaga ega: faqat secure context'da ishlaydi.
 *   ✅ https://example.com
 *   ✅ http://localhost / http://127.0.0.1
 *   ❌ http://example.com (HTTP) — getCurrentPosition rad etiladi
 *   ❌ http://192.168.x.x — dev lokal network ham HTTP da bloklanadi
 *
 * Bu funksiya BIRINCHI bo'lib chaqiriladi — agar false bo'lsa, foydalanuvchiga
 * "sayt HTTPS bo'lishi kerak" deb aniq ko'rsatamiz va modal'da brauzer
 * sozlamalarini ko'rsatmaymiz (chunki bu brauzer muammosi emas).
 */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  // window.isSecureContext zamonaviy brauzerlarda mavjud (Chrome 49+, Safari 12.1+)
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  // Fallback: protocol va hostname tekshiruv
  const proto = window.location.protocol;
  const host = window.location.hostname;
  return proto === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export type BrowserKind = 'chrome' | 'safari' | 'firefox' | 'edge' | 'opera' | 'other';

export interface GeolocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GeolocationError {
  /** PERMISSION_DENIED (1) | POSITION_UNAVAILABLE (2) | TIMEOUT (3) */
  code: number;
  /** Texnik xato matni (foydalanuvchiga ko'rsatish uchun emas — log uchun) */
  message: string;
  /** Foydalanuvchiga ko'rsatish uchun qulay tasnif */
  kind: 'denied' | 'unavailable' | 'timeout' | 'unsupported';
}

/**
 * Permissions API orqali geolokatsiya ruxsat holatini OLDINDAN o'qish.
 *
 * Bu funksiya `getCurrentPosition()` ni CHAQIRMAYDI — shuning uchun brauzer
 * dialog ham chiqmaydi. Faqat hozirgi holatni tekshiradi.
 *
 * @returns Ruxsat holati. 'unsupported' = brauzer Permissions API'ni
 * qo'llamaydi (eski mobile webview, IE), bu holatda getCurrentPosition()
 * orqali oddiy yo'l bilan davom etish kerak.
 */
export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  // 1. Geolocation API umuman bormi? (eski brauzerlar, security konteksti)
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unsupported';
  }

  // 2. Permissions API mavjudmi? (Chrome 88+, Safari 16+, Firefox 90+)
  // navigator.permissions Safari 15 dan oldin yo'q edi
  if (!('permissions' in navigator) || typeof navigator.permissions?.query !== 'function') {
    // Brauzer eski — to'g'ridan-to'g'ri getCurrentPosition() bilan davom etamiz
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    // status.state: 'granted' | 'prompt' | 'denied'
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch (err) {
    // Permission API xato qaytarsa (kamdan-kam holat) — unsupported deb hisoblaymiz
    // va getCurrentPosition() orqali davom etamiz.
    console.warn('[geolocation] Permissions API xato:', err);
    return 'unsupported';
  }
}

/**
 * Joylashuvni oladi (Promise-based). getCurrentPosition'ning callback-based
 * API'sini async/await uchun o'rab beradi va xatolarni qulay format'ga
 * o'tkazadi.
 *
 * Bu funksiya BRAUZER NATIVE DIALOG'INI CHAQIRADI (agar holat 'prompt' bo'lsa).
 * Shuning uchun avval queryGeolocationPermission() bilan holat tekshiriladi
 * va 'denied' bo'lsa modal ko'rsatiladi.
 *
 * @param options Geolocation options. timeout default 10s, accuracy yuqori.
 */
export function getCurrentPosition(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
): Promise<GeolocationCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      const err: GeolocationError = {
        code: 0,
        message: 'Geolocation API mavjud emas',
        kind: 'unsupported',
      };
      reject(err);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        // GeolocationPositionError.code: 1=denied, 2=unavailable, 3=timeout
        let kind: GeolocationError['kind'] = 'unavailable';
        if (error.code === error.PERMISSION_DENIED) kind = 'denied';
        else if (error.code === error.TIMEOUT) kind = 'timeout';

        const err: GeolocationError = {
          code: error.code,
          message: error.message || 'Geolocation xatosi',
          kind,
        };
        reject(err);
      },
      options,
    );
  });
}

/**
 * User-Agent asosida brauzer turini aniqlash. Modal'da to'g'ri yo'l-yo'riq
 * ko'rsatish uchun ishlatiladi.
 *
 * Tartib MUHIM: Edge "Chrome" satrini ham o'z ichiga oladi (Chromium asoslangan),
 * shuning uchun avval Edge tekshiriladi. Xuddi shu Opera bilan.
 */
export function detectBrowser(): BrowserKind {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();

  // Edge va Opera Chromium asoslangan — avval ularni tekshiramiz
  if (ua.includes('edg/') || ua.includes('edge/')) return 'edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'opera';
  if (ua.includes('firefox/')) return 'firefox';

  // Safari Chrome'ni ham o'z ichiga oladi (iOS), shuning uchun Chrome tekshiruvi muhim
  if (ua.includes('chrome/') || ua.includes('chromium/')) return 'chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari';

  return 'other';
}

/**
 * Mobile qurilmami? Modal'da aniq yo'l-yo'riq bermak uchun
 * (iOS/Android'da sozlamalar joyi farq qiladi).
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(navigator.userAgent);
}

/**
 * iOS Safari ekanligini aniqlash — uning yo'l-yo'rig'i alohida.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
