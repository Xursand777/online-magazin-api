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
});

// Request interceptor: token, guest-session, and language header
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const guestSessionId = localStorage.getItem('guest_session_id');
    if (guestSessionId && !token) {
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

// Response interceptor: 401 bo'lsa token yangilash, guest-session-id ni saqlash
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
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/auth?reason=role_changed';
        return Promise.reject(error);
      }
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const res = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh: refreshToken });
        localStorage.setItem('access_token', res.data.access);
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
        return apiClient(originalRequest);
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
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
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
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
