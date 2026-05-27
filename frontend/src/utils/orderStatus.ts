interface OrderI18n {
  orderStatus: Record<string, string>;
  checkout: Record<string, string>;
}

export const ORDER_STATUS_BADGES: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
  PENDING: 'bg-secondary-container/20 text-secondary',
  CONFIRMED: 'bg-primary-container/20 text-primary',
  PACKING: 'bg-primary-container/20 text-primary',
  SHIPPING: 'bg-primary-container/20 text-primary',
  DELIVERED: 'bg-primary-container/20 text-primary',
  RECEIVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  CANCELLED_BY_USER: 'bg-error-container/70 text-on-error-container',
  CANCELLED_BY_ADMIN: 'bg-error-container/70 text-on-error-container',
  SYSTEM_AUTO_CANCEL: 'bg-error-container/70 text-on-error-container',
};

const FALLBACK_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "To'lov kutilmoqda (karta)",
  PENDING: "Yangi buyurtma",
  CONFIRMED: 'Tasdiqlandi',
  PACKING: "Yig'ilmoqda",
  SHIPPING: "Yo'lda (kuryerda)",
  DELIVERED: 'Yetkazildi (eshikda)',
  RECEIVED: 'Xaridorga topshirildi',
  CANCELLED_BY_USER: 'Foydalanuvchi bekor qildi',
  CANCELLED_BY_ADMIN: 'Admin bekor qildi',
  SYSTEM_AUTO_CANCEL: 'Tizim bekor qildi',
};

const FALLBACK_PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Kutilmoqda',
  PAID: "To'langan",
  FAILED: 'Muvaffaqiyatsiz',
  REFUNDED: 'Qaytarilgan',
};

const FALLBACK_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Naqd pul',
  card: 'Karta (Click/Payme)',
  credit: "Muddatli to'lov",
};

// User can cancel: PENDING, CONFIRMED, AWAITING_PAYMENT (unpaid card order)
export const CANCELLABLE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'AWAITING_PAYMENT'];

const STATUS_TO_I18N_KEY: Record<string, string> = {
  AWAITING_PAYMENT: 'awaitingPayment',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PACKING: 'packing',
  SHIPPING: 'shipped',
  DELIVERED: 'delivered',
  RECEIVED: 'received',
  CANCELLED_BY_USER: 'cancelledByUser',
  CANCELLED_BY_ADMIN: 'cancelledByAdmin',
  SYSTEM_AUTO_CANCEL: 'systemAutoCancel',
};

const PAYMENT_STATUS_TO_I18N_KEY: Record<string, string> = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const PAYMENT_METHOD_TO_I18N_KEY: Record<string, string> = {
  cash: 'cash',
  card: 'card',
  credit: 'credit',
};

export const getOrderStatusLabel = (status: string, t?: OrderI18n): string => {
  if (t) {
    const key = STATUS_TO_I18N_KEY[status];
    if (key && t.orderStatus[key]) return t.orderStatus[key];
  }
  return FALLBACK_STATUS_LABELS[status] || status;
};

export const getOrderStatusBadge = (status: string): string =>
  ORDER_STATUS_BADGES[status] || 'bg-surface-container text-on-surface-variant';

export const getPaymentStatusLabel = (status: string, t?: OrderI18n): string => {
  if (t) {
    const key = PAYMENT_STATUS_TO_I18N_KEY[status];
    if (key && t.orderStatus[key]) return t.orderStatus[key];
  }
  return FALLBACK_PAYMENT_STATUS_LABELS[status] || status;
};

export const getPaymentMethodLabel = (method: string, t?: OrderI18n): string => {
  if (t) {
    const key = PAYMENT_METHOD_TO_I18N_KEY[method];
    if (key && t.checkout[key]) return t.checkout[key];
  }
  return FALLBACK_PAYMENT_METHOD_LABELS[method] || method;
};
