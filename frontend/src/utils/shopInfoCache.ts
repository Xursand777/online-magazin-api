/**
 * Do'kon ma'lumotlari (chek/receipt'da ko'rinadigan nom, telefon, manzil)
 * uchun bitta yagona modul cache + React Query integrasiyasi.
 *
 * NIMA UCHUN BITTA MODUL CACHE:
 *   AdminPanel (SozlamalarTab) va AdminPOS ikkalasi ham chek bosishda
 *   sinxron `loadShopInfo()` chaqirishadi. Avvalgi implementatsiyada har
 *   component'da alohida cache bor edi -> Super Admin Sozlamalar'da
 *   o'zgartirgan qiymat POS'ga yetib bormas edi (stale ko'rsatardi).
 *
 *   Bu fayl yagona modul-level cache saqlaydi va barcha update yo'llari
 *   (React Query refetch, mutation success) shu cache'ni yangilab turadi.
 *
 * FORMAT FARQI:
 *   Backend snake_case: shop_name / shop_phone / shop_address
 *   Frontend camelCase: name / phone / address
 *   Tarjimani `apiToCache()` qiladi — boshqa joyda transformatsiya YO'Q
 *   bo'lishi shart.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  adminGetShopInfo,
  type ShopInfo as ApiShopInfo,
} from '../api/endpoints';

export type StoreInfo = {
  name: string;
  phone: string;
  address: string;
};

// Default qiymatlar — backend'dagi `SHOP_INFO_DEFAULTS` bilan TO'LIQ mos
// kelishi shart. Aks holda offline rejimda nom mosligi buziladi.
const DEFAULTS: StoreInfo = {
  name: 'BOZOR UZ',
  phone: '+998 71 000-00-00',
  address: 'Toshkent sh.',
};

let _cache: StoreInfo = { ...DEFAULTS };
let _loadPromise: Promise<void> | null = null;

const apiToCache = (info: ApiShopInfo): StoreInfo => ({
  name: info.shop_name,
  phone: info.shop_phone,
  address: info.shop_address,
});

/**
 * Sinxron — printReceipt va printCreditAgreement callerlar uchun.
 * Hech qachon `Promise` qaytarmaydi. Cache hali to'lmagan bo'lsa defaultlar
 * qaytariladi (bu offline yoki birinchi load uchun xavfsiz).
 */
export const loadShopInfo = (): StoreInfo => ({ ..._cache });

/**
 * Mutation success / React Query data ulanishi — har ikkala yo'l ham
 * shu helper'ni chaqiradi. Kelajakda boshqa joydan ham chaqirilishi mumkin.
 */
export const updateShopInfoCache = (info: ApiShopInfo): void => {
  _cache = apiToCache(info);
};

/**
 * AdminPOS yoki boshqa mounted (lekin React Query bilan ishlamaydigan)
 * place'lardan chaqiriladi: bir marta server'dan fetch va modul cache'ga
 * yozib qo'yadi. Promise ko'p marta chaqirilsa ham bitta inflight bo'ladi.
 */
export const ensureShopInfo = (): Promise<void> => {
  if (_loadPromise) return _loadPromise;
  _loadPromise = adminGetShopInfo()
    .then((r) => {
      _cache = apiToCache(r.data);
    })
    .catch(() => {
      // Offline yoki 401 — defaults ishlatiladi. Promise'ni null qilamiz
      // ki keyingi chaqirilishda qaytadan urinish bo'lishi mumkin.
      _loadPromise = null;
    });
  return _loadPromise;
};

/**
 * React component'larida foydalanish uchun React Query hook.
 * Data kelganda `_cache`'ni avtomat yangilab beradi — boshqa joylar
 * sinxron `loadShopInfo()` orqali yangi qiymatni olishadi.
 *
 * Query key: ['shop-info']. Mutation onSuccess'da:
 *   queryClient.setQueryData(['shop-info'], newData)
 * + updateShopInfoCache(newData) ikkalasini ham chaqirish kerak.
 */
export const useShopInfo = () => {
  const query = useQuery({
    queryKey: ['shop-info'],
    queryFn: () => adminGetShopInfo().then((r) => r.data),
    staleTime: 5 * 60 * 1000, // backend Redis cache TTL bilan mos
    refetchOnWindowFocus: false,
  });

  // Modul cache'ni React Query natijasiga sinxronlash. useEffect ichida
  // — strict mode'da ham deterministic.
  useEffect(() => {
    if (query.data) {
      _cache = apiToCache(query.data);
    }
  }, [query.data]);

  return query;
};

/**
 * Test/utility — modul cache'ni qo'lda almashtirish kerak bo'lganda
 * (masalan, logout paytida defaultlarga qaytarish).
 */
export const resetShopInfoCache = (): void => {
  _cache = { ...DEFAULTS };
  _loadPromise = null;
};
