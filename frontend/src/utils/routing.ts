/**
 * routing.ts — Driving directions (kuryer navigatsiyasi).
 *
 * OSRM (Open Source Routing Machine) PUBLIC DEMO:
 *   • Tekin, API key kerak emas
 *   • OpenStreetMap data — Xorazm va Urganch yo'llari mavjud
 *   • Endpoint: router.project-osrm.org
 *   • Limit: kuniga ~1000 so'rov (bizning hajm uchun yetarli)
 *   • Quality: real ko'cha bo'ylab navigation, masofa va vaqt
 *
 * RE-ROUTE STRATEGIYA:
 *   Kuryer harakat qilarkan, har bir GPS yangilanishida route'ni qayta
 *   chizmaymiz (OSRM'ni spam qilmaymiz). Faqat:
 *     • Birinchi marta
 *     • 200m+ harakatdan keyin
 *     • 30 soniyalik intervaldan keyin
 *
 * CACHE:
 *   Bir xil koordinata juftligi uchun 30 soniya ichida bir marta so'rov.
 *   Bu mobile internet limitda ham minimal trafiklash.
 *
 * XATO BOSHQARUV:
 *   OSRM xato bo'lsa (timeout, 5xx) — null qaytaramiz. UI to'g'ri chiziq
 *   (straight line) ko'rsatadi va xato banner chiqaradi.
 */

const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_CACHE_TTL_MS = 30_000; // 30 soniya
const ROUTE_TIMEOUT_MS = 10_000; // 10 soniya
const RE_ROUTE_MIN_METERS = 200; // 200m harakat = re-route
const RE_ROUTE_MIN_INTERVAL_MS = 30_000; // 30 soniya

/** Koordinatalar [lat, lng] formatda — Leaflet bilan moslik. */
export type LatLng = [number, number];

export interface RouteResult {
  /** Yo'l geometriyasi: [lat, lng] juftliklarining ro'yxati. */
  geometry: LatLng[];
  /** Yo'l uzunligi metrlarda. */
  distanceMeters: number;
  /** Taxminiy yetib borish vaqti soniyalarda. */
  durationSeconds: number;
}

// ── Cache (browser tab davomida) ──────────────────────────────────────────
interface CacheEntry {
  result: RouteResult;
  ts: number;
}
const _routeCache = new Map<string, CacheEntry>();

function cacheKey(from: LatLng, to: LatLng): string {
  // 4 kasr xonagacha — taxminan 10m aniqlik
  return (
    `${from[0].toFixed(4)},${from[1].toFixed(4)}|` +
    `${to[0].toFixed(4)},${to[1].toFixed(4)}`
  );
}

/**
 * OSRM API'ga so'rov yuborib, driving routini olish.
 *
 * @param from [lat, lng] kuryer joriy joylashuvi
 * @param to   [lat, lng] mijoz manzili
 * @returns RouteResult yoki null (xato/cache miss)
 */
export async function fetchRoute(
  from: LatLng,
  to: LatLng,
): Promise<RouteResult | null> {
  // Cache check
  const key = cacheKey(from, to);
  const cached = _routeCache.get(key);
  if (cached && Date.now() - cached.ts < ROUTE_CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    // OSRM koordinata tartibi: lng,lat — Leaflet'dan teskari
    const url =
      `${OSRM_ENDPOINT}/` +
      `${from[1]},${from[0]};${to[1]},${to[0]}` +
      `?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn('[routing] OSRM HTTP error:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      console.warn('[routing] OSRM no route:', data.code);
      return null;
    }

    const route = data.routes[0];
    // GeoJSON: coordinates are [lng, lat] — Leaflet uchun [lat, lng] formatga
    const geometry: LatLng[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    );

    const result: RouteResult = {
      geometry,
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
    };

    _routeCache.set(key, { result, ts: Date.now() });
    return result;
  } catch (err) {
    // Network error, timeout, AbortError
    console.warn('[routing] fetchRoute exception:', err);
    return null;
  }
}

/**
 * Haversine formula — ikki nuqta orasidagi to'g'ri masofa (metrda).
 *
 * Re-route shartini tekshirish va "manzilga yaqinlashganda" detect uchun.
 *
 * @param a [lat, lng] birinchi nuqta
 * @param b [lat, lng] ikkinchi nuqta
 * @returns masofa metrda
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371_000; // Yer radiusi metrda
  const toRad = (x: number) => (x * Math.PI) / 180;

  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return R * 2 * Math.asin(Math.sqrt(c));
}

/**
 * Re-route qilish shartmi tekshiradi.
 *
 * Quyidagi hollardan biri bo'lsa true:
 *   • Birinchi marta (lastFetch=null)
 *   • Joriy pozitsiya oldingidan 200m+ uzoq
 *   • Oldingi so'rovdan 30s o'tdi
 *
 * Bu OSRM'ni spam qilmaslik va batareyani tejash uchun.
 */
export function shouldRefreshRoute(
  current: LatLng,
  lastFetch: { pos: LatLng; ts: number } | null,
): boolean {
  if (!lastFetch) return true;
  const distMoved = haversineDistance(lastFetch.pos, current);
  if (distMoved >= RE_ROUTE_MIN_METERS) return true;
  const timeSince = Date.now() - lastFetch.ts;
  if (timeSince >= RE_ROUTE_MIN_INTERVAL_MS) return true;
  return false;
}

/**
 * Masofa formatlash: < 1km bo'lsa metr, >= 1km bo'lsa km.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Vaqt formatlash: soniyani inson o'qiy oladigan formatga.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours} soat ${rem} daqiqa` : `${hours} soat`;
}

/**
 * To'g'ri chiziq fallback — OSRM ishlamasa, kamida ko'rinish uchun.
 * Bu route emas, faqat "qaerda joylashgani"ni ko'rsatish uchun.
 */
export function straightLineFallback(from: LatLng, to: LatLng): RouteResult {
  return {
    geometry: [from, to],
    distanceMeters: Math.round(haversineDistance(from, to)),
    durationSeconds: 0, // bilmasalik
  };
}

// Konstantalarni export — komponentlarda ishlatish uchun
export const ROUTING_CONSTANTS = {
  RE_ROUTE_MIN_METERS,
  RE_ROUTE_MIN_INTERVAL_MS,
  ROUTE_CACHE_TTL_MS,
  ROUTE_TIMEOUT_MS,
} as const;
