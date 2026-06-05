import axios from 'axios';

// Production'da VITE_API_URL muhit o'zgaruvchisini frontend/.env faylida o'rnating:
//   VITE_API_URL=https://api.yourdomain.com/api
// Development uchun .env.local (git'ga qo'shilmaydi):
//   VITE_API_URL=http://127.0.0.1:8000/api
const defaultHost =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'localhost'
    : '127.0.0.1';
const BASE_URL = import.meta.env.VITE_API_URL ?? `http://${defaultHost}:8000/api`;

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // httpOnly cookie'larni yuboradi
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL SESSION MANAGEMENT
//
// Google, Facebook, GitHub qanday ishlaydi:
//   1. Single-flight refresh   — bir vaqtda BITTA HTTP refresh so'rovi
//   2. Proaktiv yangilash       — 401 ni kutmasdan, muddatdan oldin refresh
//   3. BroadcastChannel        — bir tab refresh qilsa, boshqalarga xabar
//   4. Visibility listener      — tab qayta ochilganda token tekshiruvi
//   5. Online listener          — internet tiklanganda token tekshiruvi
//   6. Tarmoq xatosi = logout YO'Q — faqat server 401/403 = haqiqiy logout
//
// Backend: ROTATE_REFRESH_TOKENS=False — cross-tab race condition yo'q.
// Xavfsizlik saqlanadi: httpOnly cookie, SameSite=Lax, logout blacklist.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Konstantalar ─────────────────────────────────────────────────────────────
// Django settings bilan mos: ACCESS_TOKEN_LIFETIME=24h
const ACCESS_LIFETIME_MS  = 24 * 60 * 60 * 1000; // 24 soat
const PROACTIVE_LEAD_MS   =  5 * 60 * 1000;       // Muddatdan 5 daqiqa oldin refresh
const REFRESH_TIMEOUT_MS  = 25_000;                // Render cold start uchun 25s
const RETRY_AFTER_FAIL_MS =  3 * 60 * 1000;       // Muvaffaqiyatsiz bo'lsa 3 daqiqadan keyin

// ── State ─────────────────────────────────────────────────────────────────────
let _refreshInFlight: Promise<void> | null = null; // Single-flight lock
let _proactiveTimer: ReturnType<typeof setTimeout> | null = null;

// ── BroadcastChannel: Multi-tab sinxronizatsiya ───────────────────────────────
// Gmail, Notion, GitHub kabi saytlar bu mexanizmdan foydalanadi.
// Bir tab refresh qilsa yoki logout bo'lsa — barcha tab biladi.
const _bc =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('bozor_auth_v1')
    : null;

type BcMsg =
  | { type: 'TOKEN_REFRESHED'; issuedAt: number }
  | { type: 'LOGGED_OUT' };

if (_bc) {
  _bc.onmessage = (e: MessageEvent<BcMsg>) => {
    if (e.data.type === 'TOKEN_REFRESHED') {
      // Boshqa tab refresh qildi — bizning timerini yangilaymiz, o'zimiz
      // refresh qilmaymiz (double-spend xavfi yo'q, rotation off bo'lsa ham)
      _applyIssuedAt(e.data.issuedAt);
    } else if (e.data.type === 'LOGGED_OUT') {
      // Boshqa tab logout qildi — biz ham tozalaymiz (broadcast YO'Q — loop oldini olish)
      _clearLocalOnly();
      if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
  };
}

// ── Page Visibility: Foydalanuvchi tabga qaytganda ───────────────────────────
// Brauzer background tab'da timerlarni sekinlashtiradi yoki to'xtatadi.
// visibilitychange — bu muammoni hal qiladi: tab aktiv bo'lganda tekshiruvz.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!localStorage.getItem('user')) return;
    _checkAndRefreshIfNeeded();
  });
}

// ── Online Event: Internet tiklanganda ───────────────────────────────────────
// Foydalanuvchi offline bo'lib qaytsa — token yangimi tekshiramiz.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!localStorage.getItem('user')) return;
    _checkAndRefreshIfNeeded();
  });
}

// ── Ichki yordamchilar ────────────────────────────────────────────────────────

/** issuedAt ni localStorage'ga yozadi va proaktiv timerni sozlaydi. */
function _applyIssuedAt(issuedAt: number): void {
  localStorage.setItem('_token_issued_at', String(issuedAt));
  _scheduleProactiveRefresh(issuedAt);
}

/**
 * Proaktiv refresh timerini o'rnatadi.
 * Token muddati tugashidan PROACTIVE_LEAD_MS oldin background refresh qiladi.
 * Foydalanuvchi hech qachon 401 ko'rmaydi — sessiya uzluksiz.
 */
function _scheduleProactiveRefresh(issuedAtMs: number): void {
  if (_proactiveTimer) clearTimeout(_proactiveTimer);

  const expiresAt = issuedAtMs + ACCESS_LIFETIME_MS;
  const refreshAt = expiresAt - PROACTIVE_LEAD_MS;
  const delay     = Math.max(refreshAt - Date.now(), 60_000); // min 1 daqiqa

  _proactiveTimer = setTimeout(async () => {
    if (!localStorage.getItem('user')) return; // Logout bo'lgan
    try {
      await _ensureRefreshed();
    } catch {
      // Proaktiv refresh muvaffaqiyatsiz (Render uyquda?) — 3 daqiqadan keyin qayta
      // Sessiyani buzmaymiz.
      _proactiveTimer = setTimeout(async () => {
        if (!localStorage.getItem('user')) return;
        _ensureRefreshed().catch(() => {});
      }, RETRY_AFTER_FAIL_MS);
    }
  }, delay);
}

/** Token muddati tugashiga yaqin bo'lsa — darhol refresh. */
function _checkAndRefreshIfNeeded(): void {
  const issuedAt = Number(localStorage.getItem('_token_issued_at') || 0);
  if (issuedAt <= 0) return;
  const age = Date.now() - issuedAt;
  if (age >= ACCESS_LIFETIME_MS - PROACTIVE_LEAD_MS) {
    _ensureRefreshed().catch(() => {});
  }
}

/**
 * LocalStorage va timerlarni tozalaydi. Broadcast YO'Q (loop oldini olish).
 * Faqat bu tabda tozalash kerak bo'lganda ishlatiladi.
 */
function _clearLocalOnly(): void {
  localStorage.removeItem('user');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('_token_issued_at');
  if (_proactiveTimer) { clearTimeout(_proactiveTimer); _proactiveTimer = null; }
}

/**
 * Hamma narsani tozalaydi VA barcha tablarni xabardor qiladi.
 * Faqat haqiqiy auth xatosida (server 401/403) chaqiriladi.
 */
function _clearSession(): void {
  _clearLocalOnly();
  _bc?.postMessage({ type: 'LOGGED_OUT' } as BcMsg);
}

/**
 * Faqat BroadcastChannel orqali boshqa tablarni xabardor qiladi.
 * authStore.logout() dan chaqiriladi — bu tab o'z tozalashini o'zi qiladi.
 */
export function broadcastLogout(): void {
  _bc?.postMessage({ type: 'LOGGED_OUT' } as BcMsg);
}

/**
 * Login yoki refresh muvaffaqiyatli bo'lganda chaqiriladi.
 * Token issue vaqtini saqlaydi + proaktiv timer + boshqa tablarga xabar.
 */
export function recordTokenIssued(): void {
  const now = Date.now();
  _applyIssuedAt(now);
  _bc?.postMessage({ type: 'TOKEN_REFRESHED', issuedAt: now } as BcMsg);
}

/**
 * Tokenni serverdan yangilaydi.
 *
 * Muvaffaqiyatli:
 *   → Yangi access tokenni localStorage'ga (dev mode), cookie yangilanadi (web).
 *   → recordTokenIssued() → proaktiv timer + boshqa tablarga xabar.
 *
 * Server 401/403 (haqiqiy auth rad):
 *   → _clearSession() → /auth ga yo'naltirish.
 *
 * Tarmoq xatosi / timeout (Render uyquda):
 *   → Sessiya SAQLANADI. Xato otiladi (interceptor ushlab oladi).
 *   → Foydalanuvchi kirib qolganicha qoladi, faqat joriy so'rov xato.
 */
async function _doRefresh(): Promise<void> {
  const localRefresh = localStorage.getItem('refresh_token');

  try {
    const res = await axios.post(
      `${BASE_URL}/auth/refresh/`,
      localRefresh ? { refresh: localRefresh } : {},
      { withCredentials: true, timeout: REFRESH_TIMEOUT_MS },
    );

    // Dev/mobile: yangi tokenlar body'da keladi; web prod: faqat cookie yangilanadi
    if (res.data?.access) {
      localStorage.setItem('access_token', res.data.access);
      if (res.data.refresh) {
        localStorage.setItem('refresh_token', res.data.refresh);
      }
    }

    recordTokenIssued(); // Timer + broadcast

  } catch (err: unknown) {
    const isServerRejected =
      axios.isAxiosError(err) &&
      err.response != null &&
      (err.response.status === 401 || err.response.status === 403);

    if (isServerRejected) {
      // Server ANIQ rad etdi → haqiqiy logout (barcha tablarga)
      _clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/auth';
      }
    }
    // Tarmoq/timeout: sessiyani buzmaymiz → xatoni yuqoriga otamiz
    throw err;
  }
}

/**
 * Single-flight wrapper.
 * Bir vaqtda nechta chaqiruv kelmasin — BITTA HTTP so'rov yuboriladi.
 * Hammasi o'sha bitta Promise'ni kutadi.
 *
 * Bu hatto ROTATE_REFRESH_TOKENS=True bo'lgan vaqtda ham double-spend'dan
 * himoya qiladi (tab ichida). Cross-tab himoyasi: BroadcastChannel + rotation off.
 */
async function _ensureRefreshed(): Promise<void> {
  if (_refreshInFlight !== null) return _refreshInFlight;
  _refreshInFlight = _doRefresh().finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
}

// ── Ilova ochilganda: mavjud sessiyani tiklash ────────────────────────────────
// Foydalanuvchi tabni yopib qayta ochsa — timerlar o'chadi.
// Bu blok ularni localStorage'dan tiklaydi.
if (typeof localStorage !== 'undefined') {
  const storedIssued = Number(localStorage.getItem('_token_issued_at') || 0);
  const hasUser      = Boolean(localStorage.getItem('user'));

  if (storedIssued > 0 && hasUser) {
    const age = Date.now() - storedIssued;
    if (age >= ACCESS_LIFETIME_MS) {
      // Token allaqachon eskirgan — 1 soniyadan keyin darhol refresh
      // (Ilova to'liq yuklanguncha kutamiz)
      setTimeout(() => { _ensureRefreshed().catch(() => {}); }, 1_000);
    } else if (age >= ACCESS_LIFETIME_MS - PROACTIVE_LEAD_MS) {
      // Muddatga 5 daqiqa qolgan — tezda refresh
      setTimeout(() => { _ensureRefreshed().catch(() => {}); }, 5_000);
    } else {
      // Token sog'lom — timerini qayta sozlaymiz
      _scheduleProactiveRefresh(storedIssued);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AXIOS INTERCEPTORS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Request interceptor ───────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    // CSRF himoya: cross-site so'rovlarda bu sarlavha yuborib bo'lmaydi
    config.headers['X-Requested-With'] = 'XMLHttpRequest';

    // Dev/local SameSite fallback: localStorage'dagi access token
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Guest session (tizimga kirmagan foydalanuvchi savati)
    const user = localStorage.getItem('user');
    const guestSessionId = localStorage.getItem('guest_session_id');
    if (guestSessionId && !user) {
      config.headers['X-Guest-Session-Id'] = guestSessionId;
    }

    // Til sarlavhasi (Accept-Language)
    try {
      const langState = localStorage.getItem('bozor-language');
      if (langState) {
        const parsed = JSON.parse(langState);
        config.headers['Accept-Language'] = parsed?.state?.language || 'uz';
      }
    } catch {
      // ignore — tilsiz ishlayveradi
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    // Guest session ID'ni saqlash (server yuborsa)
    const guestId =
      response.headers['x-guest-session-id'] ||
      response.headers['X-Guest-Session-Id'] ||
      response.data?.guest_session_id ||
      response.data?.cart?.guest_session_id;
    if (guestId) localStorage.setItem('guest_session_id', guestId);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // ── 401: Token muddati tugagan yoki yaroqsiz ──────────────────────────────
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; // Cheksiz loop oldini olish

      // role_invalidated: admin xodim rolini olib tashlagan
      const code = error.response?.data?.code;
      if (code === 'role_invalidated') {
        _clearSession();
        window.location.href = '/auth?reason=role_changed';
        return Promise.reject(error);
      }

      try {
        // ✅ Single-flight: bir vaqtda faqat BITTA refresh so'rovi
        await _ensureRefreshed();
        // Refresh muvaffaqiyatli → asl so'rovni qayta yuboramiz
        return apiClient(originalRequest);
      } catch {
        // _doRefresh() xato berdi:
        // - Server 401/403: _doRefresh() allaqachon redirect qildi
        // - Tarmoq xatosi: sessiya saqlangan, joriy so'rov xato qaytaradi
        return Promise.reject(error);
      }
    }

    // ── 403: Admin endpoint — ruxsat yo'q ─────────────────────────────────────
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
  },
);

export default apiClient;
