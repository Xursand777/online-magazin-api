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

export const refreshToken = (refresh: string) =>
  apiClient.post('/auth/refresh/', { refresh });

// PROFILE
export const getProfile = () => apiClient.get('/profile/');
export const updateProfile = (data: FormData | object) => apiClient.patch('/profile/', data);

// PRODUCTS
export const getProducts = (params?: object) => apiClient.get('/products/', { params });
export const getProductDetail = (id: number | string) => apiClient.get(`/products/${id}/`);
export const getSimilarProducts = (id: number | string) => apiClient.get(`/products/${id}/similar/`);
export const searchProducts = (q: string, track = false) =>
  apiClient.get('/search/products/', { params: { q, track } });
export const getDiscountProducts = () => apiClient.get('/products/discounts/');
export const getNewProducts = () => apiClient.get('/products/new/');
export const getPopularProducts = () => apiClient.get('/products/popular/');
export const getRecommendedProducts = () => apiClient.get('/products/recommended/');
export const getMainPage = () => apiClient.get('/main/');
export const getHomeBanners = () => apiClient.get('/banners/');

// CATEGORIES
export const getCategories = () => apiClient.get('/categories/');
export const getCategoryProducts = (id: number | string) => apiClient.get(`/categories/${id}/products/`);

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
export const createOrderFromCart = (data: object) => apiClient.post('/orders/from-cart/', data);
export const createQuickOrder = (data: object) => apiClient.post('/orders/quick/', data);
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
export const adminGetBanners = () => apiClient.get('/admin/banners/');
export const adminCreateBanner = (data: FormData) =>
  apiClient.post('/admin/banners/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminUpdateBanner = (id: number, data: FormData) =>
  apiClient.patch(`/admin/banners/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminDeleteBanner = (id: number) => apiClient.delete(`/admin/banners/${id}/`);
export const adminGetCategories = () => apiClient.get('/admin/categories/');
export const adminCreateCategory = (data: FormData | object) => 
  apiClient.post('/admin/categories/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const adminUpdateCategory = (id: number, data: object) => apiClient.patch(`/admin/categories/${id}/`, data);
export const adminDeleteCategory = (id: number) => apiClient.delete(`/admin/categories/${id}/`);
export const adminGetOrders = (params?: { q?: string; status?: string; date_from?: string; date_to?: string; payment_method?: string; is_credit?: string; page?: number; page_size?: number }) => apiClient.get('/orders/admin/', { params });
export const adminGetDashboard = () => apiClient.get('/orders/admin/dashboard/');
export const adminUpdateOrderStatus = (
  id: number | string,
  data: { status: string; note?: string }
) => apiClient.post(`/orders/admin/${id}/status/`, data);
export const adminGetReport = (params?: {
  date_from?: string;
  date_to?: string;
  period?: 'daily' | 'monthly' | 'yearly';
}) => apiClient.get('/orders/admin/report/', { params });

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
export const adminToggleUserBan = (id: number) => apiClient.post(`/admin/users/${id}/toggle-ban/`);
export const adminToggleUserActive = (id: number) => apiClient.post(`/admin/users/${id}/toggle-active/`);

