import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavoritesStore, type FavoriteProduct } from '../store/favoritesStore';
import { toast } from '../utils/toast';
import ProductCard from '../components/ProductCard';
import { useTranslation } from '../i18n/useTranslation';

const Favorites = () => {
  const { favorites, toggleFavorite } = useFavoritesStore();
  const { t } = useTranslation();
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const handleRemove = (product: FavoriteProduct) => {
    const key = String(product.id);
    setRemoving((prev) => new Set(prev).add(key));
    const snapshot = { ...product };
    toggleFavorite(snapshot);
    toast.undo(
      `"${product.name.length > 28 ? product.name.slice(0, 28) + '…' : product.name}" ${t.favorites.removeItem}`,
      () => {
        toggleFavorite(snapshot);
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      },
      t.common.cancel
    );
    setTimeout(() => {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 5500);
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:py-12 pb-28 md:pb-12">
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Link to="/" className="hover:text-primary transition-colors">{t.favorites.breadcrumb}</Link>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          <span className="font-medium text-on-surface">{t.favorites.title}</span>
        </div>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-end gap-3">
            <h1 className="text-2xl font-bold text-on-surface md:text-3xl">❤️ {t.favorites.title}</h1>
            <span className="text-on-surface-variant font-medium mb-1">
              {favorites.length} {t.favorites.items}
            </span>
          </div>
          {favorites.length > 0 && (
            <Link
              to="/catalog"
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span>
              {t.product.addToCart}
            </Link>
          )}
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/30 flex flex-col items-center justify-center py-20 px-4 text-center mt-6">
          <div className="w-24 h-24 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-5xl text-red-400">favorite</span>
          </div>
          <h3 className="text-3xl font-black text-on-surface mb-4 tracking-tight">{t.favorites.empty}</h3>
          <p className="text-base text-on-surface-variant mb-10 max-w-md leading-relaxed">
            {t.favorites.emptyDesc}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              to="/"
              className="bg-primary hover:bg-primary/90 text-on-primary px-8 py-3.5 rounded-[12px] font-semibold transition-colors shadow-sm text-[15px]"
            >
              {t.nav.home}
            </Link>
            <Link
              to="/catalog"
              className="border border-primary text-primary hover:bg-primary-container/10 px-8 py-3.5 rounded-[12px] font-semibold transition-colors text-[15px]"
            >
              {t.favorites.goShopping}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 mt-6">
            {favorites.map((product) => {
              const isRemoving = removing.has(String(product.id));
              return (
                <div
                  key={product.id}
                  className={`relative transition-all duration-500 ${isRemoving ? 'opacity-40 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
                >
                  <ProductCard
                    product={{
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      discount_price: product.discount_price,
                      is_discount: product.is_discount,
                      main_image: product.main_image,
                    }}
                    isFavorite={true}
                    onToggleFavorite={() => handleRemove(product)}
                  />
                  <button
                    onClick={() => handleRemove(product)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm border border-outline-variant flex items-center justify-center text-error hover:bg-error-container/30 transition-all opacity-0 group-hover:opacity-100 z-10"
                    aria-label={t.product.removeFromFavorites}
                    title={t.product.removeFromFavorites}
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center gap-2 p-3.5 rounded-xl bg-surface-container border border-outline-variant/50 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">info</span>
            <span>
              {t.favorites.removeItem} →{' '}
              <strong className="text-on-surface">{t.common.cancel}</strong>
            </span>
          </div>
        </>
      )}
    </main>
  );
};

export default Favorites;
