import { create } from 'zustand';

export type StaffRole = 'super_admin' | 'admin' | 'seller' | 'courier';

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  seller:      'Sotuvchi',
  courier:     'Kuryer',
};

export const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-error/15 text-error border border-error/20',
  admin:       'bg-primary/15 text-primary border border-primary/20',
  seller:      'bg-blue-500/15 text-blue-600 border border-blue-500/20',
  courier:     'bg-purple-500/15 text-purple-600 border border-purple-500/20',
};

interface AuthUser {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  role?: StaffRole | null;
  is_master?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Muhim: refreshToken endi localStorage'da SAQLANMAYDI.
// U httpOnly cookie sifatida brauzerda yashaydi — JavaScript tomonidan
// o'qib bo'lmaydi → XSS hujumlari refresh tokenni o'g'irlay olmaydi.
//
// accessToken localStorage'da saqlanishi (qisqa muddatli — 60 daqiqa)
// amaliy murosadur: SPA sessiyasini sahifa yangilanishidan keyin ham
// saqlab qolish uchun zarur. Access token muddati qisqa (60 daqiqa)
// bo'lgani sababli, o'g'irlanish oynasi ham tor.
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, access: string) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

const storedUser   = localStorage.getItem('user');
const storedAccess = localStorage.getItem('access_token');

export const useAuthStore = create<AuthState>((set) => ({
  user:            storedUser ? JSON.parse(storedUser) : null,
  accessToken:     storedAccess || null,
  isAuthenticated: !!storedAccess,

  login: (user, access) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('access_token', access);
    // refreshToken localStorage'ga YOZILMAYDI — httpOnly cookie'da
    set({ user, accessToken: access, isAuthenticated: true });
  },

  logout: () => {
    // Server tomonida refresh cookie blacklist'ga qo'shiladi va o'chiriladi.
    // withCredentials: true → brauzer httpOnly cookie'ni o'zi yuboradi.
    // Fire-and-forget: tarmoq xatosi bo'lsa ham lokal holat tozalanadi.
    const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';
    const accessToken = localStorage.getItem('access_token');
    fetch(`${BASE_URL}/auth/logout/`, {
      method:      'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    }).catch(() => {
      // Tarmoq xatosi yoki token muddati o'tgan — lokal tozalash baribir bajariladi
    });

    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  updateUser: (updatedFields) =>
    set((state) => {
      const updated = state.user ? { ...state.user, ...updatedFields } : null;
      if (updated) localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    }),
}));
