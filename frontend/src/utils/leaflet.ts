/**
 * leaflet.ts — Leaflet'ni dinamik yuklash (lazy loading).
 *
 * NIMA UCHUN BUNDAY YONDASHUV?
 *   Leaflet (~150 KB) faqat manzil tanlash sahifalarida (Profile, Checkout)
 *   kerak bo'ladi. Asosiy bundle'ga qo'shsak — barcha sahifalarda yuklanadi
 *   va Time to Interactive sekinroq bo'ladi.
 *
 *   Bu fayl Leaflet'ni CDN'dan kerakli payt yuklaydi va keshlaydi:
 *     • Birinchi marta: <link> va <script> qo'shamiz
 *     • Keyingi safar: window.L'dan oladi (qayta yuklash yo'q)
 *     • Parallel chaqiruvlar: bitta yuklash, hammasi shu Promise'ga ulanadi
 *
 * IDEMPOTENT:
 *   loadLeaflet() ko'p marta chaqirsa-da — bitta network so'rov yuboriladi.
 *   Bir nechta komponent (Profile + Checkout) bir vaqtda ishlatsa, ikkala
 *   ham xuddi shu instance'ga kutadi.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEAFLET_VERSION = '1.9.4';
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

// Parallel chaqiruvlar uchun yagona promise
let loadingPromise: Promise<any> | null = null;

/**
 * Leaflet'ni dinamik yuklash. Promise window.L instance'ini qaytaradi.
 *
 * Misol:
 *   const L = await loadLeaflet();
 *   const map = L.map(containerRef.current).setView([41.3, 69.2], 12);
 */
export function loadLeaflet(): Promise<any> {
  // Allaqachon yuklangan
  if (typeof window !== 'undefined' && (window as any).L) {
    return Promise.resolve((window as any).L);
  }

  // Hozirda yuklanmoqda — xuddi shu promise'ni qaytaramiz
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    // CSS — agar yo'q bo'lsa qo'shamiz
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      document.head.appendChild(link);
    }

    // JS — agar mavjud bo'lsa, window.L paydo bo'lishini kutamiz
    const existingScript = document.querySelector('script[src*="leaflet.js"]');
    if (existingScript) {
      const startedAt = Date.now();
      const interval = setInterval(() => {
        if ((window as any).L) {
          clearInterval(interval);
          resolve((window as any).L);
        } else if (Date.now() - startedAt > 15_000) {
          clearInterval(interval);
          loadingPromise = null; // qayta urinish uchun reset
          reject(new Error('Leaflet timeout: window.L yuklanmadi (15s)'));
        }
      }, 100);
      return;
    }

    // Yangi <script> qo'shamiz
    const script = document.createElement('script');
    script.src = JS_URL;
    script.async = true;
    script.onload = () => {
      if ((window as any).L) {
        resolve((window as any).L);
      } else {
        loadingPromise = null;
        reject(new Error('Leaflet skripti yuklandi, ammo window.L topilmadi'));
      }
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('Leaflet skripti yuklab bo\'lmadi (network/CDN xato)'));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}

/**
 * Bozor brendiga mos custom marker pin (yashil rang, Material icon).
 * Map.marker(latlng, { icon: createBozorMarkerIcon(L) }) bilan ishlatiladi.
 */
export function createBozorMarkerIcon(L: any): any {
  return L.divIcon({
    html: `<span class="material-symbols-outlined" style="color: #22c55e; font-size: 38px; transform: translate(-19px, -38px); display: block; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3)); font-weight: bold;">pin_drop</span>`,
    className: 'custom-map-marker-pin',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/**
 * O'zbekiston markazi — xarita default ko'rinishi uchun (Toshkent).
 */
export const UZ_DEFAULT_CENTER: [number, number] = [41.311081, 69.240562];
export const UZ_DEFAULT_ZOOM = 12;

/**
 * Xorazm/Urganch markazi — kuryer/mahalliy biznes uchun.
 */
export const URGANCH_CENTER: [number, number] = [41.5499, 60.6333];
