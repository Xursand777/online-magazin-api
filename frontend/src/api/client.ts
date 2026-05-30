import axios from 'axios';

// Production'da VITE_API_URL muhit o'zgaruvchisini frontend/.env faylida o'rnating:
//   VITE_API_URL=https://api.yourdomain.com/api
//
// Development uchun .env.local faylida ham yozish mumkin (git'ga qo'shilmaydi):
//   VITE_API_URL=http://127.0.0.1:8000/api
//
// DIQQAT: 'http://127.0.0.1:8000/api' — faqat localhost fallback (development).
// Brauzer HttpOnly (SameSite=Lax) cookie'larni cross-origin zaproslarda o'chirib yubormasligi uchun,
// frontend qaysi hostda ochilgan bo'lsa (localhost yoki 127.0.0.1), backend API ham xuddi shu hostga yo'naltiriladi.
const defaultHost = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'localhost' : '127.0.0.1';
const BASE_URL = import.meta.env.VITE_API_URL ?? `http://${defaultHost}:8000/api`;

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // withCredentials: true — brauzer httpOnly cookie'larini (bozor_refresh) yuboradi.
  withCredentials: true,
});

// ── Single-flight refresh + proaktiv yangilash ───────────────────────────────
//
// MUAMMO 1 — Double-spend (asosiy logout sababi):
//   ROTATE_REFRESH_TOKENS=True + bir vaqtda bir nechta 401 →
//   har biri alohida refresh qiladi → birinchisi muvaffaqiyatli → token blacklist →
//   ikkinchisi blacklisted token bilan refresh → server 401 → FORCE-LOGOUT!
//   YECHIM: _refreshInFlight lock — hammasi BITTA refresh kutadi.
//
// MUAMMO 2 — Render cold start logout:
//   Render uyquda → refresh so'rovi timeout → hozirgi kod: window.location.href='/auth'
//   Token aslida to'g'ri edi, faqat server uyquda! — ASOSSIZ LOGOUT.
//   YECHIM: faqat server ANIQ 401/403 bersa logout, tarmoq xatosida SAQLAYMIZ.
//
// MUAMMO 3 — Proaktiv refresh yo'q:
//   24 soat o'tib foydalanuvchi qaytsa → bir vaqtda ko'p 401 → muammo 1 qayta.
//   YECHIM: expiry dan 10 daqiqa oldin background refresh (timer).

let _refreshInFlight: Promise<void> | null = null;
let _proactiveTimer: ReturnType<typeof setTimeout> | null = null;

// Django settings bilan mos: ACCESS_TOKEN_LIFETIME=24h
const ACCESS_LIFETIME_MS  = 24 * 60 * 60 * 1000;
// 10 daqiqa oldin proaktiv yangilash
const PROACTIVE_LEAD_MS   = 10 * 60 * 1000;
// Refresh timeout: Render cold start ~50s, biz 25s beramiz (ular uyg'onmaguncha)
const REFRESH_TIMEOUT_MS  = 25_000;

// ── Yordamchi funksiyalar ────────────────────────────────────────────────────

/** Token yangilangach yoki login muvaffaqiyatli bo'lgach chaqiriladi. */
export function recordTokenIssued(): void {
  const now = Date.now();
  localStorage.setItem('_token_issued_at', String(now));
  _scheduleProactiveRefresh(now);
}

/** Barcha auth ma'lumotlarini tozalash (localStorage + proaktiv timer). */
function _clearSession(): void {
  localStorage.removeItem('user');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('_token_issued_at');
  if (_proactiveTimer) { clearTimeout(_proactiveTimer); _proactiveTimer = null; }
}

/**
 * Proaktiv refresh uchun timer o'rnatish.
 * Token muddatidan 10 daqiqa oldin background refresh qiladi.
 * Foydalanuvchi 401 ko'rmaydi — sessiya uzluksiz davom etadi.
 */
function _scheduleProactiveRefresh(issuedAtMs: number): void {
  if (_proactiveTimer) clearTimeout(_proactiveTimer);

  const expiresAt = issuedAtMs + ACCESS_LIFETIME_MS;
  const refreshAt = expiresAt - PROACTIVE_LEAD_MS;
  const delay     = Math.max(refreshAt - Date.now(), 60_000); // kamida 1 daqiqa

  _proactiveTimer = setTimeout(async () => {
    // Foydalanuvchi logout qilgan bo'lsa — ishlamaydi
    if (!localStorage.getItem('user')) return;
    try {
      await _ensureRefreshed();
    } catch {
      // Proaktiv refresh muvaffaqiyatsiz bo'lsa — sessiyani buzmaymiz.
      // Keyingi 401 da yana uriniladi.
    }
  }, delay);
}

/**
 * Tokenni serverdan yangilash (HTTP so'rov).
 *
 * Muvaffaqiyatli bo'lsa:
 *   – Yangi access/refresh tokenlarni localStorage'ga saqlaydi (dev mode).
 *   – Web production'da faqat httpOnly cookie yangilanadi (server tomonida).
 *   – Proaktiv refresh timerini qayta belgilaydi.
 *
 * Xato bo'lsa:
 *   – Server ANIQ 401/403 bersa: session tozalanadi + /auth'ga yo'naltiradi.
 *   – Tarmoq xatosi (timeout, Render cold start): sessiya SAQLANADI, xato otiladi.
 */
async function _doRefresh(): Promise<void> {
  const localRefresh = localStorage.getItem('refresh_token');

  try {
    const res = await axios.post(
      `${BASE_URL}/auth/refresh/`,
      // Dev/mobile: body'da token; Web production: body bo'sh, cookie yuboriladi
      localRefresh ? { refresh: localRefresh } : {},
      {
        withCredentials: true,
        timeout: REFRESH_TIMEOUT_MS,
      },
    );

    // Dev/mobile: body'da yangi tokenlar keladi
    if (res.data?.access) {
      localStorage.setItem('access_token', res.data.access);
      if (res.data.refresh) {
        localStorage.setItem('refresh_token', res.data.refresh);
      }
    }
    // Proaktiv timer: yangi token uchun qayta belgilaymiz
    recordTokenIssued();

  } catch (err: unknown) {
    const isAuthRejected =
      axios.isAxiosError(err) &&
      (err.response?.status === 401 || err.response?.status === 403);

    if (isAuthRejected) {
      // Server token'ni ANIQ rad etdi → haqiqiy sessiya tugagan → logout
      _clearSession();
      window.location.href = '/auth';
    }
    // Tarmoq xatosi / timeout / Render cold start:
    // Sessiyani BUZMAYMIZ — foydalanuvchi kirib qolganicha qoladi.
    // Tarmoq tiklanganda keyingi so'rov muvaffaqiyatli bo'ladi.
    throw err;
  }
}

/**
 * Single-flight wrapper: bir vaqtda bir nechta chaqiruv kelsa,
 * hammasi BITTA refresh so'rovini kutadi.
 *
 * Bu ROTATE_REFRESH_TOKENS muhitida "double-spend" ni to'liq bartaraf etadi:
 *   - 2-chi refresh eski (blacklisted) token bilan bormaydi.
 *   - Barcha 401 lar birgalikda yangi tokenni oladi.
 */
async function _ensureRefreshed(): Promise<void> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = _doRefresh().finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

// ── Ilova ochilganda: mavjud sessiya uchun proaktiv timerni tiklash ──────────
// Foydalanuvchi tab'ni yopib qayta ochsa — timer qayta belgilanadi.
{
  const storedIssued = Number(localStorage.getItem('_token_issued_at') || 0);
  if (storedIssued > 0 && localStorage.getItem('user')) {
    _scheduleProactiveRefresh(storedIssued);
  }
}

// ── Request interceptor ──────────────────────────────────────────────────────
// CSRF himoya sarlavhasi, guest-session va til
// Eslatma: Access token httpOnly cookie orqali yuboriladi, ammo local dev/IP-address
// SameSite fallback uchun localStorage'dan ham Authorization header orqali yuboriladi.
apiClient.interceptors.request.use(
  (config) => {
    // X-Requested-With: cross-site so'rovlarda bu sarlavha yuborib bo'lmaydi
    config.headers['X-Requested-With'] = 'XMLHttpRequest';

    // Local dev SameSite fallback: localStorage'dagi access token
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    const user = localStorage.getItem('user');
    const guestSessionId = localStorage.getItem('guest_session_id');
    if (guestSessionId && !user) {
      config.headers['X-Guest-Session-Id'] = guestSessionId;
    }

    try {
      const langState = localStorage.getItem('bozor-language');
      if (langState) {
        const parsed = JSON.parse(langState);
        const lang = parsed?.state?.language || 'uz';
        config.headers['Accept-Language'] = lang;
      }
    } catch {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    // Guest session ID'ni saqlash
    const guestId = response.headers['x-guest-session-id'];
    if (guestId) {
      localStorage.setItem('guest_session_id', guestId);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // ── 401: Token muddati tugagan yoki yaroqsiz ─────────────────────────────
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // role_invalidated: administrator foydalanuvchi rolini o'chirgan
      const code = error.response?.data?.code;
      if (code === 'role_invalidated') {
        _clearSession();
        window.location.href = '/auth?reason=role_changed';
        return Promise.reject(error);
      }

      try {
        // ✅ SINGLE-FLIGHT: bir vaqtda faqat BITTA refresh so'rovi
        // Boshqalar shu promise'ni kutadi — eski token double-spend bo'lmaydi
        await _ensureRefreshed();

        // Refresh muvaffaqiyatli → so'rovni qayta yuboramiz
        return apiClient(originalRequest);

      } catch (refreshErr: unknown) {
        // _doRefresh() muvaffaqiyatsiz bo'ldi.
        // Server 401/403 bergan bo'lsa — _doRefresh() allaqachon logout qilgan.
        // Tarmoq xatosi bo'lsa — sessiya saqlanadi, faqat joriy so'rov xato qaytaradi.
        return Promise.reject(error);
      }
    }

    // ── 403: Admin endpoint — ruxsat yo'q ────────────────────────────────────
    if (error.response?.status === 403) {
      const url: string = originalRequest?.url || '';
      if (url.startsWith('/admin/') || url.startsWith('admin/')) {
        const code = error.response?.data?.code;
        if (code === 'role_invalidated' || code === 'permission_denied') {
          _clearSession();
          window.location.href = '/auth?reason=role_changed';
          return Promise.reject(error);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
