import { create } from 'zustand';

/**
 * Buyurtma yopiq vaqtdagi iliq eslatma modalini boshqaruvchi kichik store.
 * Istalgan joydan `show()` chaqiriladi; modal App darajasida bir marta render.
 */
interface OrderReminderState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useOrderReminderStore = create<OrderReminderState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
