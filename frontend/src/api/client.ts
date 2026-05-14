import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: token va guest-session ni har bir zaprosga qo'shish
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
    return Promise.reject(error);
  }
);

export default apiClient;
