import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import SectionProducts from './pages/SectionProducts';
import Favorites from './pages/Favorites';
import SearchPage from './pages/SearchPage';
import ComingSoon from './pages/ComingSoon';
import PrivacyPolicy from './pages/PrivacyPolicy';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import { useCartStore } from './store/cartStore';
import { useFavoritesStore } from './store/favoritesStore';
import { useAuthStore } from './store/authStore';
import { applyThemeMode, useThemeStore } from './store/themeStore';
import { getProfile } from './api/endpoints';

// ── Lazy load: faqat admin foydalanuvchilar uchun yuklanadi ───────────────────
// AdminPanel eng katta komponent (~500KB). Odatdagi foydalanuvchilar uni
// HECH QACHON yuklamaydi — bu initial load vaqtini ~40% kamaytiradi.
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
// CourierRouteMap — lazy, Leaflet va xarita kodi alohida chunk'da
const CourierRouteMap = lazy(() => import('./pages/CourierRouteMap'));

const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search]);

  return null;
};

// Admin yuklanayotganda oddiy spinner
const AdminFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-surface">
    <div className="flex flex-col items-center gap-3 text-on-surface-variant">
      <span className="material-symbols-outlined text-4xl animate-spin text-primary">
        progress_activity
      </span>
      <span className="text-sm">Admin panel yuklanmoqda...</span>
    </div>
  </div>
);

function App() {
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchFavorites = useFavoritesStore((s) => s.fetchFavorites);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    fetchCart();
    fetchFavorites();
  }, [fetchCart, fetchFavorites]);

  useEffect(() => {
    applyThemeMode(theme);
  }, [theme]);

  // Page load'da is_master + can_use_credit ni server'dan sinxronlash.
  // Sabab: eski sessiya (auth localStorage cache) is_master'siz bo'lishi
  // mumkin -> Checkout/POS gating buzilardi. Bu useEffect har refresh'da
  // serverdan freshtek qiymat olib authStore'ga yozadi.
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  useEffect(() => {
    if (!isAuthed) return;
    getProfile()
      .then((r) => {
        const p = (r.data || {}) as { is_master?: boolean; can_use_credit?: boolean };
        updateUser({
          is_master: !!p.is_master,
          // can_use_credit shu vaqtga is_master bilan ekvivalent (User
          // domain), lekin alohida ham saqlaymiz — kelajakdagi qoidalar
          // qo'shilsa code o'zgartirish kerakmas.
          can_use_credit: p.can_use_credit !== undefined ? !!p.can_use_credit : !!p.is_master,
        });
      })
      .catch(() => { /* offline yoki 401 — silent, login chiqib ketadi */ });
  }, [isAuthed, updateUser]);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Admin route - protected + lazy loaded */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/admin"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminPanel />
              </Suspense>
            }
          />
          {/* Phase 3.0 — Kuryer real-time navigatsiya xaritasi.
              Permission backend tomonidan tekshiriladi (CanConfirmDelivery).
              ProtectedRoute — autentifikatsiya kerak. */}
          <Route
            path="/courier/route/:orderId"
            element={
              <Suspense fallback={<AdminFallback />}>
                <CourierRouteMap />
              </Suspense>
            }
          />
        </Route>

        {/* Main app routes */}
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="catalog/*" element={<Catalog />} />
          <Route path="sections/:section" element={<SectionProducts />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="profile" element={<Profile />} />
          <Route path="auth" element={<Auth />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="search" element={<SearchPage />} />

          {/* Maxfiylik siyosati — Play Store / App Store uchun rasmiy hujjat */}
          <Route path="privacy" element={<PrivacyPolicy />} />

          {/* Qolgan footer ma'lumot sahifalari — hozircha "tez orada" (ComingSoon) */}
          <Route path="terms" element={<ComingSoon />} />
          <Route path="payment-info" element={<ComingSoon />} />
          <Route path="delivery" element={<ComingSoon />} />
          <Route path="returns" element={<ComingSoon />} />
          <Route path="about" element={<ComingSoon />} />

          {/* 404 Catch-all Route */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
