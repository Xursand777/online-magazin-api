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
// Muhim: access va refresh tokenlar localStorage'da SAQLANMAYDI.
// Ular httpOnly cookie sifatida brauzerda yashaydi — JavaScript tomonidan
// o'qib bo'lmaydi → XSS hujumlari tokenlarni o'g'irlay olmaydi.
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
    // Server tomonida refresh cookie blacklist'ga qo'shiladi va o'chiriladi.
    // bilan birga access cookie ham o'chiriladi.
    const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';
    fetch(`${BASE_URL}/auth/logout/`, {
      method:      'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // Tarmoq xatosi yoki token muddati o'tgan — lokal tozalash baribir bajariladi
    });

    localStorage.removeItem('user');
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updatedFields) =>
    set((state) => {
      const updated = state.user ? { ...state.user, ...updatedFields } : null;
      if (updated) localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    }),
}));
