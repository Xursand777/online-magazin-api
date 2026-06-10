import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getFavorites, toggleFavorite as apiToggleFavorite, syncLocalFavorites } from '../api/endpoints';
import { useAuthStore } from './authStore';

export interface FavoriteProduct {
  id: number | string;
  name: string;
  price: string | number;
  discount_price?: string | number | null;
  is_discount?: boolean;
  main_image?: string | null;
}

interface FavoritesState {
  favorites: FavoriteProduct[];
  loading: boolean;
  fetchFavorites: () => Promise<void>;
  toggleFavorite: (product: FavoriteProduct) => Promise<void>;
  removeFavorite: (id: number | string) => Promise<void>;
  isFavorite: (id: number | string) => boolean;
  syncLocalFavoritesToBackend: () => Promise<{ syncedCount: number }>;
  resetFavorites: () => void;
}

/**
 * Backend javobini xavfsiz Array'ga aylantiradi.
 *
 * Qabul qilinadigan shakllar:
 *   1. To'liq massiv:        [...]                                  → o'sha
 *   2. DRF paginatsiya:      { count, next, previous, results: [] } → results
 *   3. Noma'lum/null/xato:   *                                       → []
 *
 * Bu helper barcha favorites mutatsiyalarini bir joydan o'tkazadi — kelajakda
 * backend pagination yoqilsa yoki javob shakli o'zgarsa, sayt crash bo'lmaydi.
 */
const toArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
};

/**
 * Mavjud favorites'ni xavfsiz olish — `.some()`, `.filter()` chaqirilishidan
 * oldin har doim Array ekanligini kafolatlaydi.
 */
const safeFavorites = (favs: unknown): FavoriteProduct[] => toArray<FavoriteProduct>(favs);

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      loading: false,

      fetchFavorites: async () => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        if (!isAuthenticated) return;
        set({ loading: true });
        try {
          const response = await getFavorites();
          // ⚠ DEFENSIVE: backend pagination yoqilgan bo'lsa ham ishlaydi
          set({ favorites: toArray<FavoriteProduct>(response.data), loading: false });
        } catch (e) {
          console.error('Failed to fetch favorites', e);
          set({ loading: false });
        }
      },

      toggleFavorite: async (product) => {
        const favorites = safeFavorites(get().favorites);
        const exists = favorites.some((f) => String(f.id) === String(product.id));
        const isAuthenticated = useAuthStore.getState().isAuthenticated;

        // Optimistic UI update
        const newFavorites = exists
          ? favorites.filter((f) => String(f.id) !== String(product.id))
          : [
              ...favorites,
              {
                id: product.id,
                name: product.name,
                price: product.price,
                discount_price: product.discount_price,
                is_discount: product.is_discount,
                main_image: product.main_image,
              },
            ];
        set({ favorites: newFavorites });

        if (isAuthenticated) {
          try {
            await apiToggleFavorite(product.id);
          } catch (e) {
            console.error('Failed to toggle favorite on backend, rolling back...', e);
            set({ favorites });
          }
        }
      },

      removeFavorite: async (id) => {
        const favorites = safeFavorites(get().favorites);
        const exists = favorites.some((f) => String(f.id) === String(id));
        if (!exists) return;

        const newFavorites = favorites.filter((f) => String(f.id) !== String(id));
        set({ favorites: newFavorites });

        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        if (isAuthenticated) {
          try {
            await apiToggleFavorite(id);
          } catch (e) {
            console.error('Failed to remove favorite on backend, rolling back...', e);
            set({ favorites });
          }
        }
      },

      isFavorite: (id) => {
        // ⚠ Eng tez-tez chaqirilayotgan funksiya — har doim Array kafolati
        return safeFavorites(get().favorites).some((f) => String(f.id) === String(id));
      },

      syncLocalFavoritesToBackend: async () => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        if (!isAuthenticated) return { syncedCount: 0 };

        const favorites = safeFavorites(get().favorites);
        if (favorites.length === 0) {
          await get().fetchFavorites();
          return { syncedCount: 0 };
        }

        try {
          const productIds = favorites.map((f) => Number(f.id)).filter(Boolean);
          const response = await syncLocalFavorites({ product_ids: productIds });
          set({ favorites: toArray<FavoriteProduct>(response.data) });
          return { syncedCount: productIds.length };
        } catch (e) {
          console.error('Failed to sync favorites with backend', e);
          return { syncedCount: 0 };
        }
      },

      resetFavorites: () => {
        set({ favorites: [] });
      },
    }),
    {
      name: 'bozor-favorites', // key in localStorage
      version: 2, // ⚠ Bumped from 1 → 2 (PageNumberPagination bug fix)
      /**
       * Eski localStorage state'ni avtomatik tuzatish.
       *
       * Foydalanuvchilar v1 bilan eski sayt versiyasini ishlatgan bo'lishi
       * mumkin, ularda `favorites` qiymati `{count, next, previous, results}`
       * obyekt sifatida saqlangan (PageNumberPagination bug). Bu migrate
       * funksiyasi:
       *   1. favorites Array bo'lmasa va `results` ichida Array bo'lsa — chiqaramiz
       *   2. Boshqa hollarda — bo'sh massivga reset (xavfsiz default)
       *
       * Foydalanuvchi sahifani ochsa, store hech qachon crash bo'lmaydi.
       */
      migrate: (persistedState: unknown, version: number) => {
        const fallback = { favorites: [] as FavoriteProduct[], loading: false };
        if (!persistedState || typeof persistedState !== 'object') return fallback as never;
        const state = persistedState as Record<string, unknown>;
        const recovered = toArray<FavoriteProduct>(state.favorites);
        // eslint-disable-next-line no-console
        console.info(
          `[favoritesStore] Migrating from v${version} → v2 — recovered ${recovered.length} items`,
        );
        return { ...state, favorites: recovered, loading: false } as never;
      },
    },
  ),
);
