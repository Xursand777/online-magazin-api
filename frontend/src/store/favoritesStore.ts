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
          set({ favorites: response.data, loading: false });
        } catch (e) {
          console.error("Failed to fetch favorites", e);
          set({ loading: false });
        }
      },

      toggleFavorite: async (product) => {
        const { favorites } = get();
        const exists = favorites.some((f) => String(f.id) === String(product.id));
        const isAuthenticated = useAuthStore.getState().isAuthenticated;

        // Optimistic UI update
        let newFavorites;
        if (exists) {
          newFavorites = favorites.filter((f) => String(f.id) !== String(product.id));
        } else {
          newFavorites = [
            ...favorites,
            {
              id: product.id,
              name: product.name,
              price: product.price,
              discount_price: product.discount_price,
              is_discount: product.is_discount,
              main_image: product.main_image,
            }
          ];
        }
        set({ favorites: newFavorites });

        if (isAuthenticated) {
          try {
            await apiToggleFavorite(product.id);
          } catch (e) {
            console.error("Failed to toggle favorite on backend, rolling back...", e);
            // Rollback state on error
            set({ favorites });
          }
        }
      },

      removeFavorite: async (id) => {
        const { favorites } = get();
        const exists = favorites.some((f) => String(f.id) === String(id));
        if (!exists) return;

        const newFavorites = favorites.filter((f) => String(f.id) !== String(id));
        set({ favorites: newFavorites });

        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        if (isAuthenticated) {
          try {
            await apiToggleFavorite(id);
          } catch (e) {
            console.error("Failed to remove favorite on backend, rolling back...", e);
            set({ favorites });
          }
        }
      },

      isFavorite: (id) => {
        return get().favorites.some((f) => String(f.id) === String(id));
      },

      syncLocalFavoritesToBackend: async () => {
        const isAuthenticated = useAuthStore.getState().isAuthenticated;
        if (!isAuthenticated) return { syncedCount: 0 };

        const { favorites } = get();
        if (favorites.length === 0) {
          await get().fetchFavorites();
          return { syncedCount: 0 };
        }

        try {
          const productIds = favorites.map((f) => Number(f.id)).filter(Boolean);
          const response = await syncLocalFavorites({ product_ids: productIds });
          set({ favorites: response.data });
          return { syncedCount: productIds.length };
        } catch (e) {
          console.error("Failed to sync favorites with backend", e);
          return { syncedCount: 0 };
        }
      },

      resetFavorites: () => {
        set({ favorites: [] });
      }
    }),
    {
      name: 'bozor-favorites', // key in localStorage
    }
  )
);
