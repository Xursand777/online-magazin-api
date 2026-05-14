import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import ThemeToggle from './ThemeToggle';

const TopNavBar = () => {
  const itemCount = useCartStore((s) => s.itemCount());
  const { isAuthenticated, user } = useAuthStore();

  return (
    <header className="hidden md:flex bg-surface-container-lowest border-b border-outline-variant shadow-sm justify-between items-center px-4 md:px-12 py-3 w-full sticky top-0 z-50">
      <Link to="/" className="text-2xl font-black tracking-tight text-primary">
        Bozor
      </Link>
      <div className="flex items-center gap-5">
        <ThemeToggle />

        {/* Cart icon with badge */}
        <Link to="/cart" aria-label="Savat" className="relative text-on-surface-variant hover:text-primary transition-colors flex items-center">
          <span className="material-symbols-outlined text-[24px]">shopping_cart</span>
          {itemCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-on-primary text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          )}
          <span className="ml-2 text-label-md font-label-md hidden lg:block">Savat</span>
        </Link>

        {/* Profile / Auth link */}
        {isAuthenticated ? (
          <Link to="/profile" className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs">
              {user?.phone?.slice(-2) || 'U'}
            </div>
            <span className="text-label-md font-label-md hidden lg:block">Profil</span>
          </Link>
        ) : (
          <Link to="/auth" className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[24px]">person</span>
            <span className="text-label-md font-label-md">Kirish</span>
          </Link>
        )}
      </div>
    </header>
  );
};

export default TopNavBar;
