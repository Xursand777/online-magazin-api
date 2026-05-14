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
export const adminGetOrders = (params?: object) => apiClient.get('/orders/admin/', { params });
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
