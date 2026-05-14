import { NavLink } from 'react-router-dom';

const BottomNavBar = () => {
  const getNavClasses = (isActive: boolean) => 
    `flex flex-col items-center justify-center rounded-xl px-3 py-1 flex-1 transition-all duration-200 relative ${
      isActive 
        ? 'text-primary bg-primary-container/10 scale-105' 
        : 'text-on-surface-variant active:bg-surface-container-low'
    }`;

  const getIconClasses = (isActive: boolean) => 
    `material-symbols-outlined mb-1 ${isActive ? 'fill-icon' : ''}`;

  return (
    <nav className="md:hidden bg-surface-container-lowest/95 backdrop-blur-md border-t border-outline-variant shadow-[0_-2px_10px_rgba(0,0,0,0.05)] fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 pb-[env(safe-area-inset-bottom)] pt-2 h-[72px]">
      <NavLink to="/" className={({ isActive }) => getNavClasses(isActive)}>
        {({ isActive }) => (
          <>
            <span className={getIconClasses(isActive)}>home</span>
            <span className="text-[11px] font-semibold font-sans">Home</span>
          </>
        )}
      </NavLink>
      <NavLink to="/catalog" className={({ isActive }) => getNavClasses(isActive)}>
        {({ isActive }) => (
          <>
            <span className={getIconClasses(isActive)}>grid_view</span>
            <span className="text-[11px] font-semibold font-sans">Catalog</span>
          </>
        )}
      </NavLink>
      <NavLink to="/cart" className={({ isActive }) => getNavClasses(isActive)}>
        {({ isActive }) => (
          <>
            <span className={getIconClasses(isActive)}>shopping_cart</span>
            {/* Example cart badge indicator */}
            <span className="absolute top-1 right-3 bg-error w-2 h-2 rounded-full border border-surface-container-lowest"></span>
            <span className="text-[11px] font-semibold font-sans">Cart</span>
          </>
        )}
      </NavLink>
      <NavLink 
        to="/profile"
        className={({ isActive }) => `flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 ${
          isActive 
            ? 'text-primary bg-primary-container font-semibold px-3 py-1 scale-100' 
            : 'text-on-surface-variant active:bg-surface-container-low scale-90'
        }`}
      >
        <span className="material-symbols-outlined text-[24px] mb-1">person</span>
        <span>Profile</span>
      </NavLink>
    </nav>
  );
};

export default BottomNavBar;
