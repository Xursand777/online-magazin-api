import apiClient from './client';

// AUTH
export const registerUser = (data: { phone: string; password: string; confirm_password: string; terms_accepted: boolean }) =>
  apiClient.post('/auth/register/', data);

export const requestLoginOtp = (data: { phone: string }) =>
  apiClient.post('/auth/login/', data);

export const verifyLoginOtp = (data: { phone: string; code: string }) =>
  apiClient.post('/auth/verify-otp/', data);

export const loginWithPassword = (data: { phone: string; password: string }) =>
  apiClient.post('/auth/login-password/', data);

// Refresh token httpOnly cookie'da saqlanadi — body bo'sh, withCredentials brauzer yuboradi.
export const refreshToken = () =>
  apiClient.post('/auth/refresh/');

// PROFILE
export const getProfile = () => apiClient.get('/profile/');
export const updateProfile = (data: FormData | object) => apiClient.patch('/profile/', data);
export const getMasterStatus = () => apiClient.get('/master/status/');

// PRODUCTS
//
// `expand_variants: true` — variantli mahsulotlarni har variant uchun
// alohida karta sifatida qaytaradi (Amazon/Wildberries uslubi). Foydalanuvchi
// "Savatga qo'shish" tugmasini bossa, AYNAN ko'rib turgan variant savatga
// tushadi. Variantsiz mahsulotlar bitta karta bo'lib qoladi.
const EXPAND = { expand_variants: true } as const;

export const getProducts = (params?: object) =>
  apiClient.get('/products/', { params: { ...EXPAND, ...(params || {}) } });
export const getProductDetail = (id: number | string) => apiClient.get(`/products/${id}/`);
export const getSimilarProducts = (id: number | string) =>
  apiClient.get(`/products/${id}/similar/`, { params: EXPAND });
export const searchProducts = (q: string, track = false) =>
  apiClient.get('/search/products/', { params: { q, track } });
export const getDiscountProducts = (params?: { page?: number; page_size?: number }) =>
  apiClient.get('/products/discounts/', { params: { ...EXPAND, ...(params || {}) } });
export const getNewProducts = (params?: { page?: number; page_size?: number }) =>
  apiClient.get('/products/new/', { params: { ...EXPAND, ...(params || {}) } });
export const getPopularProducts = (params?: { page?: number; page_size?: number }) =>
  apiClient.get('/products/popular/', { params: { ...EXPAND, ...(params || {}) } });
export const getRecommendedProducts = () =>
  apiClient.get('/products/recommended/', { params: EXPAND });
export const getMainPage = () => apiClient.get('/main/', { params: EXPAND });
export const getHomeBanners = () => apiClient.get('/banners/');
export const getRecentlyViewed = (params?: { exclude?: number }) =>
  apiClient.get('/recently-viewed/', { params: { ...EXPAND, ...(params || {}) } });
export const clearRecentlyViewed = () => apiClient.delete('/recently-viewed/');

// CATEGORIES
export const getCategories = () => apiClient.get('/categories/');
// Home sahifa chiplari — admin "homeda ko'rsatish" (is_popular) flagli kategoriyalar.
// Web va mobil IKKALASI shu endpointni ishlatadi → 100% bir xil.
export const getHomeCategories = () => apiClient.get('/categories/home/');
export const getCategoryProducts = (id: number | string) =>
  apiClient.get(`/categories/${id}/products/`, { params: EXPAND });

// FAVORITES
export const getFavorites = () => apiClient.get('/products/favorites/');
export const toggleFavorite = (productId: number | string) =>
  apiClient.post('/products/favorites/toggle/', { product_id: productId });
export const syncLocalFavorites = (data: { product_ids: number[] }) =>
  apiClient.post('/products/favorites/sync/', data);

// CART
export const getCart = () => apiClient.get('/cart/');
export const addToCart = (data: { product_id: number; quantity: number; variant_id?: number }) =>
  apiClient.post('/cart/items/', data);
export const updateCartItem = (id: number, data: { quantity: number }) =>
  apiClient.patch(`/cart/items/${id}/`, data);
export const deleteCartItem = (id: number) => apiClient.delete(`/cart/items/${id}/`);
export const syncLocalCart = (data: {
  items: Array<{ product_id: number; quantity: number; variant_id?: number | null }>;
}) => apiClient.post('/cart/sync-local/', data);

// ORDERS
export const getOrders = () => apiClient.get('/orders/');
export const getOrderDetail = (id: number | string) => apiClient.get(`/orders/${id}/`);

/**
 * Brauzer/mobile uchun UUID v4 generatsiyasi (RFC 4122).
 * `crypto.randomUUID()` — zamonaviy brauzerlarda mavjud (Chrome 92+,
 * Safari 15.4+, Firefox 95+, Node 18+). Fallback — Math.random
 * (mobile webview eski versiyalari uchun).
 *
 * Bu funksiya idempotency key sifatida ishlatiladi: har "Buyurtma berish"
 * form submit'i uchun BITTA UUID generatsiya qilinadi va shu UUID
 * X-Idempotency-Key header'ida yuboriladi. Slow internet retry'larda
 * o'sha UUID qayta ishlatiladi — backend ESKI buyurtmani qaytaradi,
 * yangi yaratmaydi.
 */
export const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (eski webview): UUID v4 format
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Buyurtma yaratish — savat asosida.
 * idempotencyKey: slow internet retry himoyasi uchun (zarur).
 *   Klient o'zining UUID v4 key'ini generatsiya qilib uzatadi.
 *   Backend bu key bilan birinchi marta kelgan so'rovga buyurtma yaratadi,
 *   keyingi takroriy so'rovlarga ESKI buyurtmani qaytaradi (yangi yaratmaydi).
 */
export const createOrderFromCart = (data: object, idempotencyKey?: string) =>
  apiClient.post('/orders/from-cart/', data, {
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
  });

/**
 * Buyurtma yaratish — quick buy (savatsiz, 1 ta mahsulot).
 * idempotencyKey: slow internet retry himoyasi (yuqoridagi kabi).
 */
export const createQuickOrder = (data: object, idempotencyKey?: string) =>
  apiClient.post('/orders/quick/', data, {
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
  });
export const cancelOrder = (id: number | string, data: { cancellation_reason: string }) =>
  apiClient.post(`/orders/${id}/cancel/`, data);
export const getCreditStatus = () => apiClient.get('/orders/credit-status/');
export const adminPayCreditOrder = (id: number | string) =>
  apiClient.post(`/orders/admin/${id}/pay-credit/`);

// ADMIN
export const adminGetProducts = (params?: object) => apiClient.get('/admin/products/', { params });
export const adminCreateProduct = (data: FormData) =>
  apiClient.post('/admin/products/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminUpdateProduct = (id: number, data: FormData) =>
  apiClient.patch(`/admin/products/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminDeleteProduct = (id: number) => apiClient.delete(`/admin/products/${id}/`);
// Ommaviy import (CSV/Excel → 10 000+ mahsulot). Katta fayllar uchun timeout
// o'chirilgan (default cheksiz). Backend: POST /api/admin/bulk-import/.
export const adminBulkImportProducts = (data: FormData) =>
  apiClient.post('/admin/bulk-import/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
export const adminGetBanners = () => apiClient.get('/admin/banners/');
export const adminCreateBanner = (data: FormData) =>
  apiClient.post('/admin/banners/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminUpdateBanner = (id: number, data: FormData) =>
  apiClient.patch(`/admin/banners/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminDeleteBanner = (id: number) => apiClient.delete(`/admin/banners/${id}/`);
export const adminGetCategories = () => apiClient.get('/admin/categories/');
export const adminCreateCategory = (data: FormData | object) => 
  apiClient.post('/admin/categories/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminUpdateCategory = (id: number, data: FormData | object) =>
  apiClient.patch(
    `/admin/categories/${id}/`,
    data,
    data instanceof FormData
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined,
  );
export const adminDeleteCategory = (id: number) => apiClient.delete(`/admin/categories/${id}/`);
export const adminGetOrders = (params?: { q?: string; status?: string; date_from?: string; date_to?: string; payment_method?: string; is_credit?: string; payment_status?: string; page?: number; page_size?: number }) => apiClient.get('/orders/admin/', { params });
export const adminGetDashboard = () => apiClient.get('/orders/admin/dashboard/');
export const adminUpdateOrderStatus = (
  id: number | string,
  data: { status: string; note?: string }
) => apiClient.post(`/orders/admin/${id}/status/`, data);

/**
 * Kuryer qabul kodi bilan yetkazib berishni tasdiqlaydi.
 * Endpoint: POST /api/orders/<id>/courier-confirm/
 *
 * XAVFSIZLIK: bu yagona yo'l DELIVERED → RECEIVED ga o'tishi mumkin.
 * Backend AdminOrderStatusUpdateView bu transition'ni rad etadi —
 * faqat shu endpoint orqali, mijoz telefoniga SMS bilan kelgan 6 xonali
 * qabul kodi bilan. Rasm/GPS so'ralmaydi.
 *
 * Backend xato kodlari (har biri bilan UX boshqa-boshqa ko'rsatiladi):
 *   wrong_status          — buyurtma DELIVERED holatida emas
 *   no_code               — buyurtma uchun kod hali yaratilmagan
 *   wrong_code            — kod noto'g'ri (attempts_left bilan)
 *   too_many_attempts     — 5 ta noto'g'ri = 1 soat blok
 *   code_used             — kod allaqachon ishlatilgan (one-time-use)
 *   code_expired          — kod muddati o'tdi (24 soat TTL)
 */
export const courierConfirmDelivery = (
  id: number | string,
  data: { received_code: string }
) => apiClient.post(`/orders/${id}/courier-confirm/`, data);
export const adminGetReport = (params?: {
  date_from?: string;
  date_to?: string;
  period?: 'daily' | 'monthly' | 'yearly';
}) => apiClient.get('/orders/admin/report/', { params });

/**
 * Cheklar — paginatsiyalangan ro'yxat (DELIVERED + RECEIVED).
 *
 * Regressiya tarixi: commit 91499a8 (3-iyun 2026) AdminReportView'dan
 * `orders` maydonini olib tashladi va alohida endpoint yaratdi
 * (cheklar ko'p bo'lganda paginatsiya uchun). Frontend Hisobotlar > Savdo
 * tabi yangilanmagan edi → cheklar BUTUNLAY ko'rinmasdi.
 *
 * Backend: `/api/orders/admin/report/orders/` (AdminReportOrdersView)
 * Javob: { count, next, previous, results: [Order, Order, ...] }
 * page_size standart 20, max 100. useInfiniteQuery bilan infinite scroll.
 */
export const adminGetReportOrders = (params?: {
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}) => apiClient.get('/orders/admin/report/orders/', { params });

/**
 * Eksport (PDF / Excel) uchun — sana oralig'idagi BARCHA cheklarni yig'adi.
 * Backend max_page_size = 100, shuning uchun `next` tugaguncha sahifalab olamiz.
 * Xavfsizlik chegarasi: MAX_PAGES (10 000 buyurtma) — cheksiz siklning oldini oladi.
 */
export async function fetchAllReportOrders(params: {
  date_from?: string;
  date_to?: string;
}): Promise<unknown[]> {
  const all: unknown[] = [];
  const MAX_PAGES = 100;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await adminGetReportOrders({ ...params, page, page_size: 100 });
    const data = res.data as { results?: unknown[]; next?: string | null };
    if (Array.isArray(data?.results)) all.push(...data.results);
    if (!data?.next) break;
  }
  return all;
}

export const adminGetExchangeRate = () => apiClient.get('/admin/exchange-rate/');
export const adminUpdateExchangeRate = (data: { usd_rate: number | string }) =>
  apiClient.post('/admin/exchange-rate/', data);

export const adminGetStockReport = (params?: { min_stock?: number; max_stock?: number }) =>
  apiClient.get('/admin/stock-report/', { params });

export const adminSearchUser = (phone: string) =>
  apiClient.get('/admin-search/', { params: { phone } });

export const adminGetKassa = () => apiClient.get('/orders/admin/kassa/');
export const adminWithdrawKassa = (data: { amount: number; reason: string }) => 
  apiClient.post('/orders/admin/kassa/withdraw/', data);

export const adminCreatePosOrder = (data: {
  phone: string;
  first_name?: string;
  last_name?: string;
  payment_method: string;
  credit_days?: number;
  items: Array<{ product_id: number; variant_id?: number; quantity: number }>;
}) => apiClient.post('/orders/admin/pos-order/', data);

export const adminGetCustomerHistory = (phone: string) =>
  apiClient.get('/orders/admin/customer-history/', { params: { phone } });

// ADMIN USERS
// ADMIN FEEDBACK
export const adminGetFeedbacks = (params?: {
  status?: string;
  q?: string;
  page?: number;
  page_size?: number;
}) => apiClient.get('/admin/feedback/', { params });
export const adminUpdateFeedback = (id: number, data: { status: string }) =>
  apiClient.patch(`/admin/feedback/${id}/`, data);

export const adminGetUsers = (params?: {
  q?: string;
  is_active?: string;
  credit_ban?: string;
  page?: number;
  page_size?: number;
}) => apiClient.get('/admin/users/', { params });
export const adminGetUser = (id: number) => apiClient.get(`/admin/users/${id}/`);
// Phase 2.7 (qayta dizayn) — Banlangan mijozni 1 ta imkoniyat bilan ban'dan chiqarish
export const adminLiftUserCreditBan = (id: number, reason?: string) =>
  apiClient.post(`/admin/users/${id}/lift-credit-ban/`, { reason: reason || '' });
export const adminToggleUserActive = (id: number) => apiClient.post(`/admin/users/${id}/toggle-active/`);

// PHONE COMPATIBILITY — admin CRUD
export const adminGetPhoneBrands = () => apiClient.get('/admin/phones/brands/');
export const adminCreatePhoneBrand = (data: { name: string; is_popular: boolean; order: number }) =>
  apiClient.post('/admin/phones/brands/', data);
export const adminDeletePhoneBrand = (id: number) => apiClient.delete(`/admin/phones/brands/${id}/`);

export const adminCreatePhoneSeries = (data: { brand: number; name: string; order: number }) =>
  apiClient.post('/admin/phones/series/', data);
export const adminDeletePhoneSeries = (id: number) => apiClient.delete(`/admin/phones/series/${id}/`);

export const adminCreatePhoneModel = (data: {
  series: number; name: string; year?: number | null; is_popular: boolean; order: number;
}) => apiClient.post('/admin/phones/models/', data);
export const adminDeletePhoneModel = (id: number) => apiClient.delete(`/admin/phones/models/${id}/`);

// PRODUCT COMPATIBILITY — moslik boshqaruvi
export const adminGetProductCompatibility = (productId: number) =>
  apiClient.get(`/admin/products/${productId}/compatibility/`);
export const adminAddProductCompatibility = (
  productId: number,
  data: { phone_model_ids: number[]; notes: string },
) => apiClient.post(`/admin/products/${productId}/compatibility/`, data);
export const adminRemoveProductCompatibility = (
  productId: number,
  data: { phone_model_ids: number[] },
) => apiClient.delete(`/admin/products/${productId}/compatibility/`, { data });
export const adminBulkAddCompatibilitySeries = (
  productId: number,
  data: { series_id: number; notes: string },
) => apiClient.post(`/admin/products/${productId}/compatibility/bulk-series/`, data);

// STAFF / ROL BOSHQARUVI (faqat Super Admin)
export const adminGetStaff = (params?: { q?: string }) =>
  apiClient.get('/admin/staff/', { params });
export const adminAssignRole = (data: { phone: string; role: string }) =>
  apiClient.post('/admin/staff/assign-role/', data);
export const adminFireStaff = (id: number) =>
  apiClient.delete(`/admin/staff/${id}/fire/`);

// Masters (Ustalar)
export const adminGetMasters = (params?: { q?: string }) =>
  apiClient.get('/admin/masters/', { params });
export const adminAssignMaster = (data: { phone: string }) =>
  apiClient.post('/admin/masters/assign/', data);
export const adminRemoveMaster = (id: number) =>
  apiClient.delete(`/admin/masters/${id}/remove/`);
export const adminGetMasterDiscount = () =>
  apiClient.get('/admin/masters/discount/');
export const adminSetMasterDiscount = (percent: number) =>
  apiClient.post('/admin/masters/discount/', { percent });

// Real-time orders polling — yangi buyurtmalarni darhol aniqlash
export interface AdminOrdersPollResponse {
  has_new: boolean;
  new_count: number;
  latest_id: number;
  server_time: string;
}
export const adminPollOrders = (since: number) =>
  apiClient.get<AdminOrdersPollResponse>(`/orders/admin/poll/?since=${since}`);

// Do'kon ma'lumotlari (chek/receipt) — server'da saqlanadi
// GET: barcha xodimlar uchun. PATCH: faqat Super Admin.
export interface ShopInfo {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
}
export const adminGetShopInfo = () => apiClient.get<ShopInfo>('/admin/shop-info/');
export const adminUpdateShopInfo = (data: Partial<ShopInfo>) =>
  apiClient.patch<ShopInfo>('/admin/shop-info/', data);

// AUDIT LOG (faqat Super Admin) — Phase 1.1
export const adminGetAuditLogs = (params?: {
  actor?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}) => apiClient.get('/admin/audit-logs/', { params });

// ── Phase 3.2 — Qaytarish (Return / Refund) admin API ──────────────────────
export const adminCheckReturnEligibility = (orderId: number | string) =>
  apiClient.get(`/orders/admin/${orderId}/return-eligibility/`);

export const adminCreateReturn = (orderId: number | string, data: FormData | object) =>
  apiClient.post(`/orders/admin/${orderId}/returns/`, data, {
    headers:
      data instanceof FormData
        ? { 'Content-Type': 'multipart/form-data' }
        : undefined,
  });

export const adminGetReturns = (params?: {
  status?: string;
  order?: number | string;
  active?: 'true' | 'false';
  reason_code?: string;
  page?: number;
  page_size?: number;
}) => apiClient.get('/orders/admin/returns/', { params });

export const adminGetReturn = (id: number | string) =>
  apiClient.get(`/orders/admin/returns/${id}/`);

export const adminTransitionReturn = (
  id: number | string,
  data: {
    new_status: string;
    note?: string;
    inspection_notes?: string;
    refund_method?: string;
    refund_amount?: string;
    refund_reference?: string;
  },
) => apiClient.patch(`/orders/admin/returns/${id}/transition/`, data);

export const adminUpdateReturnItem = (
  id: number | string,
  itemId: number | string,
  data: { condition?: string; restock?: boolean; writeoff_reason?: string },
) => apiClient.patch(`/orders/admin/returns/${id}/items/${itemId}/`, data);

export const adminUploadReturnPhoto = (id: number | string, file: File, kind: 'claim' | 'inspection') => {
  const fd = new FormData();
  fd.append('image', file);
  fd.append('kind', kind);
  return apiClient.post(`/orders/admin/returns/${id}/photos/`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const adminGetReturnsStats = (params?: { date_from?: string; date_to?: string }) =>
  apiClient.get('/orders/admin/returns/stats/', { params });

