import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  toggleFavorite: (product: FavoriteProduct) => void;
  removeFavorite: (id: number | string) => void;
  isFavorite: (id: number | string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggleFavorite: (product) => {
        const { favorites } = get();
        const exists = favorites.some((f) => String(f.id) === String(product.id));
        
        if (exists) {
          set({
            favorites: favorites.filter((f) => String(f.id) !== String(product.id))
          });
        } else {
          // We only save the necessary data to local storage to keep it light
          set({
            favorites: [
              ...favorites, 
              {
                id: product.id,
                name: product.name,
                price: product.price,
                discount_price: product.discount_price,
                is_discount: product.is_discount,
                main_image: product.main_image,
              }
            ]
          });
        }
      },
      removeFavorite: (id) => {
        set({
          favorites: get().favorites.filter((f) => String(f.id) !== String(id))
        });
      },
      isFavorite: (id) => {
        return get().favorites.some((f) => String(f.id) === String(id));
      }
    }),
    {
      name: 'bozor-favorites', // key in localStorage
    }
  )
);
