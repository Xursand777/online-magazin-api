import { NavLink } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '../i18n/useTranslation';

const BottomNavBar = () => {
  const itemCount = useCartStore((s) => s.itemCount());
  const favoritesCount = useFavoritesStore((s) => s.favorites.length);
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 w-full z-50
        bg-surface-container-lowest/98 backdrop-blur-xl
        border-t border-outline-variant/50
        shadow-[0_-4px_24px_rgba(0,0,0,0.08)]
        flex justify-around items-center
        px-1
        pb-[env(safe-area-inset-bottom)]
        pt-1
        h-[66px]"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200 ${
            isActive ? 'text-primary' : 'text-on-surface-variant'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`material-symbols-outlined text-[24px] transition-all duration-200 ${isActive ? 'fill-icon scale-110' : ''}`}>
              home
            </span>
            <span className={`text-[10px] font-semibold tracking-tight ${isActive ? 'font-bold' : ''}`}>
              {t.nav.home}
            </span>
          </>
        )}
      </NavLink>

      <NavLink
        to="/catalog"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200 ${
            isActive ? 'text-primary' : 'text-on-surface-variant'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`material-symbols-outlined text-[24px] transition-all duration-200 ${isActive ? 'fill-icon scale-110' : ''}`}>
              grid_view
            </span>
            <span className={`text-[10px] font-semibold tracking-tight ${isActive ? 'font-bold' : ''}`}>
              {t.nav.catalog}
            </span>
          </>
        )}
      </NavLink>

      <NavLink
        to="/cart"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200 relative ${
            isActive ? 'text-primary' : 'text-on-surface-variant'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <div className="relative">
              <span className={`material-symbols-outlined text-[24px] transition-all duration-200 ${isActive ? 'fill-icon scale-110' : ''}`}>
                shopping_cart
              </span>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-on-primary text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-[3px] shadow-sm border border-surface-container-lowest leading-none">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-semibold tracking-tight ${isActive ? 'font-bold' : ''}`}>
              {t.nav.cart}
            </span>
          </>
        )}
      </NavLink>

      <NavLink
        to="/favorites"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200 relative ${
            isActive ? 'text-red-500' : 'text-on-surface-variant'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <div className="relative">
              <span className={`material-symbols-outlined text-[24px] transition-all duration-200 ${isActive ? 'fill-icon scale-110' : ''}`}>
                favorite
              </span>
              {favoritesCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-[3px] shadow-sm border border-surface-container-lowest leading-none">
                  {favoritesCount > 99 ? '99+' : favoritesCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-semibold tracking-tight ${isActive ? 'font-bold' : ''}`}>
              {t.nav.favorite}
            </span>
          </>
        )}
      </NavLink>

      <NavLink
        to={isAuthenticated ? '/profile' : '/auth'}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-all duration-200 ${
            isActive ? 'text-primary' : 'text-on-surface-variant'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`material-symbols-outlined text-[24px] transition-all duration-200 ${isActive ? 'fill-icon scale-110' : ''}`}>
              person
            </span>
            <span className={`text-[10px] font-semibold tracking-tight ${isActive ? 'font-bold' : ''}`}>
              {t.nav.profile}
            </span>
          </>
        )}
      </NavLink>
    </nav>
  );
};

export default BottomNavBar;
