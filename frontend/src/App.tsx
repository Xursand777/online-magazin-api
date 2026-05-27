import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import AdminPanel from './pages/AdminPanel';
import SectionProducts from './pages/SectionProducts';
import Favorites from './pages/Favorites';
import SearchPage from './pages/SearchPage';
import { useCartStore } from './store/cartStore';
import { applyThemeMode, useThemeStore } from './store/themeStore';

const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, search]);

  return null;
};

function App() {
  const fetchCart = useCartStore((s) => s.fetchCart);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  useEffect(() => {
    applyThemeMode(theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Admin route - full page, no main layout */}
        <Route path="/admin" element={<AdminPanel />} />

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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
