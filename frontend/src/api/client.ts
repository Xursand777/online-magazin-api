import axios from 'axios';

// Production'da VITE_API_URL muhit o'zgaruvchisini frontend/.env faylida o'rnating:
//   VITE_API_URL=https://api.yourdomain.com/api
//
// Development uchun .env.local faylida ham yozish mumkin (git'ga qo'shilmaydi):
//   VITE_API_URL=http://127.0.0.1:8000/api
//
// DIQQAT: 'http://127.0.0.1:8000/api' — faqat localhost fallback (development).
// Har bir foydalanuvchi bu URL'ni o'z kompyuteriga yo'naltiradi.
// Production build'ida bu URL server manziliga o'zgartirilishi SHART.
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // withCredentials: true — brauzer httpOnly cookie'larini (bozor_refresh) yuboradi.
  // Bu CORS sozlamalarida Access-Control-Allow-Credentials: true va aniq origin talab qiladi.
  withCredentials: true,
});

// Request interceptor: guest-session va til sarlavhasi
// Eslatma: Access token endi httpOnly cookie orqali avtomatik yuboriladi
apiClient.interceptors.request.use(
  (config) => {
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

// Response interceptor: 401 → cookie'dan refresh, guest-session-id saqlash
apiClient.interceptors.response.use(
  (response) => {
    const guestId = response.headers['x-guest-session-id'];
    if (guestId) {
      localStorage.setItem('guest_session_id', guestId);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // role_invalidated: rol o'chirilganda server 401 + code='role_invalidated' qaytaradi
      const code = error.response?.data?.code;
      if (code === 'role_invalidated') {
        localStorage.removeItem('user');
        window.location.href = '/auth?reason=role_changed';
        return Promise.reject(error);
      }

      try {
        // Refresh token httpOnly cookie'da — body yo'q, withCredentials brauzer yuboradi.
        // Server CookieTokenRefreshView cookie'ni o'qib yangi access (va refresh) cookieni qaytaradi.
        await axios.post(
          `${BASE_URL}/auth/refresh/`,
          {},                        // body bo'sh — token cookie'da
          { withCredentials: true }  // httpOnly cookie yuboriladi
        );
        // Requestni qayta yuboramiz (yangi access cookie avtomatik ilova qilinadi)
        return apiClient(originalRequest);
      } catch {
        // Refresh ham muvaffaqiyatsiz → sessiya tugagan, qayta kirish kerak
        localStorage.removeItem('user');
        window.location.href = '/auth';
      }
    }

    // 403 admin endpoint — ruxsat yo'q, admin paneldan chiqarish
    if (error.response?.status === 403) {
      const url: string = originalRequest?.url || '';
      if (url.startsWith('/admin/') || url.startsWith('admin/')) {
        const code = error.response?.data?.code;
        if (code === 'role_invalidated' || code === 'permission_denied') {
          localStorage.removeItem('user');
          window.location.href = '/auth?reason=role_changed';
          return Promise.reject(error);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
