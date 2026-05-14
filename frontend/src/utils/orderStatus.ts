export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "To'lov kutilmoqda",
  CONFIRMED: 'Rasmiylashtirildi',
  PACKING: "Yig'ilmoqda",
  SHIPPING: "Yo'lda",
  DELIVERED: 'Yetib keldi',
  CANCELLED_BY_USER: 'Foydalanuvchi bekor qildi',
  CANCELLED_BY_ADMIN: 'Admin bekor qildi',
  SYSTEM_AUTO_CANCEL: 'Tizim bekor qildi',
};

export const ORDER_STATUS_BADGES: Record<string, string> = {
  PENDING: 'bg-secondary-container/20 text-secondary',
  CONFIRMED: 'bg-primary-container/20 text-primary',
  PACKING: 'bg-primary-container/20 text-primary',
  SHIPPING: 'bg-primary-container/20 text-primary',
  DELIVERED: 'bg-primary-container/20 text-primary',
  CANCELLED_BY_USER: 'bg-error-container/70 text-on-error-container',
  CANCELLED_BY_ADMIN: 'bg-error-container/70 text-on-error-container',
  SYSTEM_AUTO_CANCEL: 'bg-error-container/70 text-on-error-container',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Kutilmoqda",
  PAID: "To'langan",
  FAILED: 'Muvaffaqiyatsiz',
  REFUNDED: 'Qaytarilgan',
};

export const CANCELLABLE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKING'];

export const getOrderStatusLabel = (status: string) => ORDER_STATUS_LABELS[status] || status;
export const getOrderStatusBadge = (status: string) =>
  ORDER_STATUS_BADGES[status] || 'bg-surface-container text-on-surface-variant';
export const getPaymentStatusLabel = (status: string) => PAYMENT_STATUS_LABELS[status] || status;
