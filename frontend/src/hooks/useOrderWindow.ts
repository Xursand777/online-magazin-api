import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

export interface OrderWindowData {
  is_open: boolean;
  open_hour: number;
  close_hour: number;
  open_time: string; // "09:00"
  close_time: string; // "19:00"
  server_time: string;
  message: string | null;
}

/**
 * Buyurtma qabul qilish vaqt oynasi holati (SERVER vaqti — Asia/Tashkent).
 *
 * - Bir marta so'raladi (queryKey bo'yicha dedupe) — barcha komponentlar
 *   bitta so'rovni ulashadi.
 * - Har daqiqa yangilanadi: soat 19:00 ga yetganda tugmalar avtomat yopiladi.
 * - Server vaqti asos — foydalanuvchi telefon soatini o'zgartirsa ham to'g'ri.
 *
 * Haqiqiy xavfsizlik baribir backend'da (buyurtma yaratish rad etiladi);
 * bu faqat UI qulayligi uchun.
 */
export function useOrderWindow() {
  const { data } = useQuery<OrderWindowData>({
    queryKey: ['order-window'],
    queryFn: async () =>
      (await apiClient.get<OrderWindowData>('/orders/window/')).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Ma'lumot yuklanmaguncha "ochiq" deb hisoblaymiz — UX bloklanmasin.
  return {
    isOpen: data ? data.is_open : true,
    openTime: data?.open_time ?? '09:00',
    closeTime: data?.close_time ?? '19:00',
    message: data?.message ?? null,
    ready: !!data,
  };
}
