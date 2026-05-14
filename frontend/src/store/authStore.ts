import { create } from 'zustand';

interface AuthUser {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, access: string, refresh: string) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

const storedUser = localStorage.getItem('user');
const storedAccess = localStorage.getItem('access_token');
const storedRefresh = localStorage.getItem('refresh_token');

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  accessToken: storedAccess || null,
  refreshToken: storedRefresh || null,
  isAuthenticated: !!storedAccess,

  login: (user, access, refresh) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    set({ user, accessToken: access, refreshToken: refresh, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  updateUser: (updatedFields) =>
    set((state) => {
      const updated = state.user ? { ...state.user, ...updatedFields } : null;
      if (updated) localStorage.setItem('user', JSON.stringify(updated));
      return { user: updated };
    }),
}));
