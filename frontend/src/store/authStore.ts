import { create } from 'zustand';
import { broadcastLogout } from '../api/client';

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
  // Backend hisoblaydi (User.can_use_credit property). Frontend UX gating
  // (Checkout, AdminPOS) shu maydondan foydalanadi. Backend authoritative —
  // bypass urinishlari 400 master_required bilan rad etiladi.
  can_use_credit?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Muhim: access va refresh tokenlar localStorage'da SAQLANMAYDI (production web).
// Ular httpOnly cookie sifatida brauzerda yashaydi — JavaScript tomonidan
// o'qib bo'lmaydi → XSS hujumlari tokenlarni o'g'irlay olmaydi.
//
// Dev/mobile rejimida esa server tokenlarni response body'da ham qaytaradi,
// shuning uchun ular localStorage'da ham bo'ladi (SameSite fallback).
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

let initialUser = null;
try {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    initialUser = JSON.parse(storedUser);
  }
} catch (e) {
  console.error("Failed to parse user from localStorage", e);
  localStorage.removeItem('user');
}

export const useAuthStore = create<AuthState>((set) => ({
  user:            initialUser,
  isAuthenticated: !!initialUser,

  login: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    // ── 1. Boshqa tablarni xabardor qilamiz ──────────────────────────────────
    // Barcha ochiq tablar ham logout bo'ladi (BroadcastChannel orqali).
    broadcastLogout();

    // ── 2. Server logout: refresh token blacklist'ga qo'shiladi ──────────────
    // withCredentials: httpOnly cookie yuboriladi (production web).
    // Body'da refresh: dev/mobile uchun localStorage'dagi token ham yuboriladi.
    // Server cookie'larni o'chiradi + token blacklist → sessiya qayta ishlamaydi.
    const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';
    const localRefresh = localStorage.getItem('refresh_token');
    fetch(`${BASE_URL}/auth/logout/`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        localRefresh ? JSON.stringify({ refresh: localRefresh }) : undefined,
    }).catch(() => {
      // Tarmoq xatosi — server blacklist qilolmadi, lekin lokal tozalanadi
    });

    // ── 3. Lokal ma'lumotlarni tozalash ───────────────────────────────────────
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('_token_issued_at');
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updatedFields) =>
    set((state) => {
      const updated = state.user ? { ...state.user, ...updatedFields } : null;
      if (updated) localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    }),
}));
