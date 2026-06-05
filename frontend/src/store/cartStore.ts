import { create } from 'zustand';

import {
  addToCart,
  deleteCartItem,
  getCart,
  getProductDetail,
  syncLocalCart,
  updateCartItem,
} from '../api/endpoints';
import { useAuthStore } from './authStore';
import { toast } from '../utils/toast';

const LOCAL_CART_STORAGE_KEY = 'guest_cart_items';
const GUEST_SESSION_STORAGE_KEY = 'guest_session_id';

export interface CartItemProduct {
  id: number;
  name: string;
  price: string;
  discount_price: string | null;
  is_discount: boolean;
  main_image: string | null;
  stock?: number;
}

export interface CartItemVariant {
  id: number;
  color: string;
  quality: string;
  size: string;
  model: string;
  price?: string | number | null;
  discount_price?: string | number | null;
}

export interface CartItem {
  id: number | string;
  product: number;
  variant: number | null;
  quantity: number;
  price_snapshot: string | null;
  product_details: CartItemProduct;
  variant_details: CartItemVariant | null;
}

export interface CartData {
  id: number | string;
  items: CartItem[];
  total_price: number | string;
  guest_mode?: boolean;
}

interface AddItemInput {
  productId: number;
  quantity?: number;
  variantId?: number | null;
  productDetails?: Partial<CartItemProduct>;
  variantDetails?: CartItemVariant | null;
}

interface CartState {
  cart: CartData | null;
  loading: boolean;
  addingId: number | null;
  updatingItemIds: Record<string, boolean>;
  fetchCart: () => Promise<void>;
  addItem: (input: AddItemInput) => Promise<void>;
  updateItem: (itemId: number | string, quantity: number) => Promise<void>;
  removeItem: (itemId: number | string) => Promise<void>;
  syncLocalCartToBackend: () => Promise<{ syncedCount: number; skippedItems: unknown[] }>;
  resetCart: () => void;
  itemCount: () => number;
}

const readLocalCartItems = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(LOCAL_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Noto'g'ri (product yo'q) yoki oldingi login bo'lgan holatdagi INT (server) id'larni o'chirib yuboramiz.
    // Faqat string (guest-) bo'lgan id'larnigina mahalliy xotiradan o'qiymiz.
    return parsed.filter((item) => item && item.product && typeof item.id === 'string' && item.id.startsWith('guest-'));
  } catch {
    return [];
  }
};

const writeLocalCartItems = (items: CartItem[]) => {
  if (items.length === 0) {
    localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LOCAL_CART_STORAGE_KEY, JSON.stringify(items));
};

const clearGuestSession = () => {
  localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
};

const getDisplayPrice = (item: CartItem) => {
  if (item.variant_details?.discount_price && Number(item.variant_details.discount_price) > 0) {
    return Number(item.variant_details.discount_price);
  }
  if (item.variant_details?.price && Number(item.variant_details.price) > 0) {
    return Number(item.variant_details.price);
  }
  if (item.price_snapshot) return Number(item.price_snapshot);
  
  const product_details = item.product_details;
  if (!product_details) return 0; // Agar xato bilan null kelib qolgan bo'lsa, crash bermaslik uchun
  
  if (product_details.is_discount && product_details.discount_price) {
    return Number(product_details.discount_price);
  }
  return Number(product_details.price || 0);
};

const extractApiErrorMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.join(' ');

  if (typeof data === 'object') {
    const errorValue = (data as { error?: unknown }).error;
    if (typeof errorValue === 'string') return errorValue;
    if (Array.isArray(errorValue)) return errorValue.join(' ');

    const firstValue = Object.values(data as Record<string, unknown>)[0];
    if (typeof firstValue === 'string') return firstValue;
    if (Array.isArray(firstValue) && firstValue.length > 0) return String(firstValue[0]);
  }

  return fallback;
};

const getCartItemStock = (item: CartItem) => {
  if (item.product_details.stock === undefined || item.product_details.stock === null) return null;
  const stock = Number(item.product_details.stock);
  return Number.isFinite(stock) ? stock : null;
};

const buildLocalCartData = (items: CartItem[]): CartData => ({
  id: 'guest-local-cart',
  guest_mode: true,
  items,
  total_price: items.reduce((sum, item) => sum + getDisplayPrice(item) * item.quantity, 0),
});

const resolveGuestItemDetails = async (input: AddItemInput) => {
  if (input.productDetails?.name && input.productDetails?.price !== undefined) {
    return {
      product_details: {
        id: input.productId,
        name: input.productDetails.name,
        price: String(input.productDetails.price),
        discount_price:
          input.productDetails.discount_price !== undefined && input.productDetails.discount_price !== null
            ? String(input.productDetails.discount_price)
            : null,
        is_discount: Boolean(
          input.productDetails.is_discount &&
            input.productDetails.discount_price !== null &&
            input.productDetails.discount_price !== undefined
        ),
        main_image: input.productDetails.main_image || null,
        stock: input.productDetails.stock,
      } satisfies CartItemProduct,
      variant_details: input.variantDetails || null,
    };
  }

  const response = await getProductDetail(input.productId);
  const product = response.data;
  const images = product.images || [];
  const mainImage = images.find((img: { is_main: boolean }) => img.is_main)?.image || images[0]?.image || null;
  const variant = input.variantId
    ? (product.variants || []).find((item: { id: number }) => item.id === input.variantId) || null
    : null;

  return {
    product_details: {
      id: product.id,
      name: product.name,
      price: String(product.price),
      discount_price: product.discount_price ? String(product.discount_price) : null,
      is_discount: Boolean(product.is_discount && product.discount_price),
      main_image: mainImage,
      stock: product.stock,
    } satisfies CartItemProduct,
    variant_details: variant
      ? {
          id: variant.id,
          color: variant.color || '',
          quality: variant.quality || '',
          size: variant.size || '',
          model: variant.model || '',
          price: variant.price || null,
          discount_price: variant.discount_price || null,
        }
      : null,
  };
};

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  loading: false,
  addingId: null,
  updatingItemIds: {},

  fetchCart: async () => {
    const isAuthenticated = useAuthStore.getState().isAuthenticated;
    set({ loading: true });
    try {
      if (isAuthenticated) {
        const res = await getCart();
        set({ cart: res.data });
      } else {
        set({ cart: buildLocalCartData(readLocalCartItems()) });
      }
    } catch {
      // Agar Auth bo'lsa va server down bo'lsa, lokal xotiradagi (guest) ID larni tiqib yubormaslik kerak!
      // Faqat guest bo'lsa local cart ni set qilamiz.
      if (!isAuthenticated) {
        set({ cart: buildLocalCartData(readLocalCartItems()) });
      } else {
        const prev = get().cart;
        if (!prev) {
          set({ cart: { id: 'error-cart', items: [], total_price: '0' } });
        }
      }
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (input) => {
    const { productId, quantity = 1, variantId } = input;
    set({ addingId: productId });

    try {
      if (useAuthStore.getState().isAuthenticated) {
        const res = await addToCart({
          product_id: productId,
          quantity,
          ...(variantId ? { variant_id: variantId } : {}),
        });
        set({ cart: res.data, addingId: null });
      } else {
        const items = readLocalCartItems();
        const existing = items.find(
          (item) => item.product === productId && (item.variant || null) === (variantId || null)
        );

        if (existing) {
          const stock = getCartItemStock(existing);
          if (stock !== null && existing.quantity + quantity > stock) {
            toast.error(`Omborda ${stock} dona mavjud.`);
            set({ addingId: null });
            return;
          }
          existing.quantity += quantity;
          writeLocalCartItems(items);
          set({ cart: buildLocalCartData(items), addingId: null });
        } else {
          const resolved = await resolveGuestItemDetails(input);
          const newItem: CartItem = {
            id: `guest-${productId}-${variantId || 'base'}`,
            product: productId,
            variant: variantId || null,
            quantity,
            price_snapshot: resolved.variant_details?.discount_price
              ? String(resolved.variant_details.discount_price)
              : resolved.variant_details?.price
                ? String(resolved.variant_details.price)
              : resolved.product_details.is_discount && resolved.product_details.discount_price
                ? resolved.product_details.discount_price
                : resolved.product_details.price,
            product_details: resolved.product_details,
            variant_details: resolved.variant_details,
          };
          items.push(newItem);
          writeLocalCartItems(items);
          set({ cart: buildLocalCartData(items), addingId: null });
        }
      }

      toast.success("Savatga qo'shildi! 🛒");
    } catch (error) {
      set({ addingId: null });
      toast.error(extractApiErrorMessage(error, "Xatolik yuz berdi. Qaytadan urinib ko'ring."));
    }
  },

  updateItem: async (itemId, quantity) => {
    const itemKey = String(itemId);
    if (get().updatingItemIds[itemKey]) return;

    if (quantity < 1) {
      await get().removeItem(itemId);
      return;
    }

    if (useAuthStore.getState().isAuthenticated && typeof itemId === 'number') {
      try {
        set((state) => ({ updatingItemIds: { ...state.updatingItemIds, [itemKey]: true } }));
        const res = await updateCartItem(itemId, { quantity });
        set({ cart: res.data });
      } catch (error) {
        const isNotFound = (error as any)?.response?.status === 404;
        if (isNotFound) {
          await get().fetchCart();
          toast.error("Ushbu mahsulot savatda topilmadi, xatolik bartaraf etildi. Qayta qo'shing.");
        } else {
          await get().fetchCart();
          toast.error(extractApiErrorMessage(error, "Yangilanmadi. Qaytadan urinib ko'ring."));
        }
      } finally {
        set((state) => {
          const next = { ...state.updatingItemIds };
          delete next[itemKey];
          return { updatingItemIds: next };
        });
      }
      return;
    }

    const items = readLocalCartItems();
    const existing = items.find((item) => item.id === itemId);
    const stock = existing ? getCartItemStock(existing) : null;
    if (stock !== null && quantity > stock) {
      toast.error(`Omborda ${stock} dona mavjud.`);
      return;
    }
    const nextItems = items.map((item) => item.id === itemId ? { ...item, quantity } : item);
    writeLocalCartItems(nextItems);
    set({ cart: buildLocalCartData(nextItems) });
  },

  removeItem: async (itemId) => {
    if (useAuthStore.getState().isAuthenticated && typeof itemId === 'number') {
      const prevCart = get().cart;
      if (prevCart) {
        set({
          cart: {
            ...prevCart,
            items: prevCart.items.filter((item) => item.id !== itemId),
          },
        });
      }

      try {
        await deleteCartItem(itemId);
        await get().fetchCart();
      } catch (error) {
        if ((error as any)?.response?.status === 404) {
          await get().fetchCart();
          return;
        }
        set({ cart: prevCart });
        toast.error("O'chirilmadi. Qaytadan urinib ko'ring.");
      }
      return;
    }

    const items = readLocalCartItems().filter((item) => item.id !== itemId);
    writeLocalCartItems(items);
    set({ cart: buildLocalCartData(items) });
  },

  syncLocalCartToBackend: async () => {
    if (!useAuthStore.getState().isAuthenticated) {
      return { syncedCount: 0, skippedItems: [] };
    }

    const localItems = readLocalCartItems();
    if (localItems.length === 0) {
      await get().fetchCart();
      return { syncedCount: 0, skippedItems: [] };
    }

    const response = await syncLocalCart({
      items: localItems.map((item) => ({
        product_id: item.product,
        quantity: item.quantity,
        variant_id: item.variant,
      })),
    });

    localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
    clearGuestSession();
    set({ cart: response.data.cart });

    return {
      syncedCount: response.data.synced_count || 0,
      skippedItems: response.data.skipped_items || [],
    };
  },

  resetCart: () => {
    if (useAuthStore.getState().isAuthenticated) {
      set({ cart: null, updatingItemIds: {} });
      return;
    }
    set({ cart: buildLocalCartData(readLocalCartItems()), updatingItemIds: {} });
  },

  itemCount: () => {
    const cart = get().cart;
    if (!cart) return 0;
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
