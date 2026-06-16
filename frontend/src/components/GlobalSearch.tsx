import { type FormEvent, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { searchProducts } from '../api/endpoints';
import { useTranslation } from '../i18n/useTranslation';

interface SearchProduct {
  id: number;
  name: string;
  category_name: string | null;
  price: string;
  discount_price: string | null;
  is_discount: boolean;
  main_image: string | null;
}

const formatPrice = (value: string | number) =>
  `${Number(value).toLocaleString('uz-UZ')} UZS`;

const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Katalog tugmasi toggle: katalogda bo'lsak — X (yopish), bosilsa Asosiyga.
  const isOnCatalog = location.pathname.startsWith('/catalog');
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();
  const { t, language } = useTranslation();

  const { data: results = [], isFetching } = useQuery<SearchProduct[]>({
    queryKey: ['product-search', normalizedQuery, language],
    queryFn: async () => {
      const response = await searchProducts(normalizedQuery, false);
      return response.data;
    },
    enabled: normalizedQuery.length >= 2,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setIsOpen(normalizedQuery.length >= 2);
  }, [normalizedQuery]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const activePrice = (product: SearchProduct) =>
    product.is_discount && product.discount_price ? product.discount_price : product.price;

  const clearQuery = () => {
    setQuery('');
    setIsOpen(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setIsOpen(false);
    navigate(`/catalog?q=${encodeURIComponent(nextQuery)}`);
  };

  return (
    <div className="relative flex-1 w-full max-w-[840px] mx-auto" ref={containerRef}>
      <form onSubmit={handleSubmit} className="flex h-[44px] md:h-[48px] w-full gap-2">
        <button
          type="button"
          onClick={() => navigate(isOnCatalog ? '/' : '/catalog')}
          aria-pressed={isOnCatalog}
          className="hidden md:flex h-full items-center justify-center gap-2 rounded-[10px] border-2 border-primary bg-primary-container/10 px-5 text-primary transition-colors hover:bg-primary-container/20"
        >
          <span className="material-symbols-outlined text-[20px] transition-transform duration-200">
            {isOnCatalog ? 'close' : 'menu'}
          </span>
          <span className="text-[15px] font-bold">{t.search.catalog}</span>
        </button>

        <div className="flex flex-1 items-center rounded-[10px] border-2 border-primary bg-surface-container-lowest overflow-hidden transition-shadow focus-within:shadow-[0_0_0_4px_rgba(34,197,94,0.15)]">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (query.trim()) setIsOpen(true);
            }}
            placeholder={t.search.placeholder}
            className="flex-1 h-full px-4 text-[14px] md:text-[15px] font-medium text-on-surface outline-none placeholder:text-outline/60 bg-transparent"
          />

          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface hover:bg-surface-container mr-1"
              aria-label={t.common.close}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}

          <button
            type="submit"
            className="flex h-full px-5 md:px-7 items-center justify-center bg-primary text-on-primary transition-colors hover:bg-primary/90"
            aria-label={t.search.catalog}
          >
            <span className="material-symbols-outlined text-[24px]">search</span>
          </button>
        </div>
      </form>

      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-[100] mt-1 overflow-hidden rounded-[16px] border border-outline-variant/40 bg-surface-container-lowest shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
          {isFetching ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-[72px] animate-pulse rounded-[12px] bg-surface-container-low"
                />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {results.map((product) => (
                <Link
                  key={product.id}
                  to={`/products/${product.id}`}
                  onClick={() => {
                    if (normalizedQuery) void searchProducts(normalizedQuery, true);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className="group flex items-center gap-4 rounded-[12px] px-3 py-3 transition-colors hover:bg-surface-container-low"
                >
                  <div className="h-12 w-12 shrink-0 rounded-[10px] border border-outline-variant overflow-hidden bg-surface-container flex items-center justify-center">
                    {product.main_image ? (
                      <img src={product.main_image} alt={product.name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-[15px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                      {product.name}
                    </div>
                    {product.category_name && (
                      <div className="mt-0.5 text-[12px] text-on-surface-variant">
                        {product.category_name}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right pl-2">
                    {product.is_discount && product.discount_price && (
                      <div className="text-[11px] text-on-surface-variant line-through mb-0.5">
                        {formatPrice(product.price)}
                      </div>
                    )}
                    <div className="whitespace-nowrap text-[15px] font-bold text-primary">
                      {formatPrice(activePrice(product))}
                    </div>
                  </div>
                </Link>
              ))}
              {normalizedQuery && results.length > 0 && (
                <div className="mt-2 border-t border-outline-variant/30 pt-2 px-2 pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setQuery('');
                      navigate(`/catalog?q=${encodeURIComponent(normalizedQuery)}`);
                    }}
                    className="w-full rounded-[10px] bg-surface-container-low py-2.5 text-[14px] font-semibold text-primary hover:bg-surface-container transition-colors"
                  >
                    {t.search.viewAllInCatalog}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="material-symbols-outlined text-[48px] text-outline/50">search_off</span>
              <h3 className="text-[16px] font-semibold text-on-surface">{t.search.noResults}</h3>
              <p className="max-w-[280px] text-[13px] text-on-surface-variant">
                {t.search.noResultsDesc}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
