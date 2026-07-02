import { useState, useRef, useEffect, useDeferredValue, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchProducts } from '../api/endpoints';
import ProductCard from '../components/ProductCard';
import ProductSkeleton from '../components/ProductSkeleton';
import { useTranslation } from '../i18n/useTranslation';

interface SearchProduct {
  id: number;
  // Qidiruv endi VARIANT kartalarini qaytaradi (mos variant alohida). Variantli
  // karta uchun `card_id` ("80-29") va `variant_id` bo'ladi; variantsizda yo'q.
  card_id?: string;
  variant_id?: number | null;
  name: string;
  category_name: string | null;
  price: string;
  discount_price: string | null;
  is_discount: boolean;
  main_image: string | null;
}

const formatPrice = (value: string | number) =>
  `${Number(value).toLocaleString('uz-UZ')} UZS`;

const activePrice = (p: SearchProduct) =>
  p.is_discount && p.discount_price ? p.discount_price : p.price;

// ─── Popular search terms ────────────────────────────────────────────────────
const POPULAR_QUERIES = [
  'iPhone', 'Samsung', 'Xiaomi', 'MacBook', 'AirPods',
  'Televizor', 'Kamera', 'Notubuk', 'Planshet', 'Smart soat',
];

const SearchPage = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: results = [], isFetching } = useQuery<SearchProduct[]>({
    queryKey: ['search-page', normalizedQuery, language],
    queryFn: async () => {
      const res = await searchProducts(normalizedQuery, false);
      return res.data;
    },
    enabled: normalizedQuery.length >= 2,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/catalog?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSuggestionClick = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-low">
      {/* ─── Sticky Search Header ─────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant/50 px-3 py-3 shadow-sm">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
            aria-label={t.common.back}
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>

          {/* Search input */}
          <div className="flex-1 flex items-center bg-surface-container rounded-xl border border-outline-variant overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all">
            <span className="material-symbols-outlined text-[20px] text-outline ml-3 shrink-0">search</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search.placeholder}
              className="flex-1 h-11 px-3 text-[15px] bg-transparent text-on-surface outline-none placeholder:text-outline/60"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="flex items-center justify-center w-9 h-9 mr-1 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
                aria-label={t.common.close}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Submit button */}
          {query.trim() && (
            <button
              type="submit"
              className="shrink-0 h-10 px-4 bg-primary text-on-primary rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
            >
              {t.search.catalog}
            </button>
          )}
        </form>
      </div>

      {/* ─── Content ──────────────────────────────────────────── */}
      <div className="flex-1 px-3 py-4">

        {/* Empty state — show popular queries */}
        {!normalizedQuery && (
          <div>
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">
              {t.home.popularProducts}
            </h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR_QUERIES.map((term) => (
                <button
                  key={term}
                  onClick={() => handleSuggestionClick(term)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface hover:border-primary hover:text-primary hover:bg-primary-container/10 transition-all"
                >
                  <span className="material-symbols-outlined text-[15px] text-outline">trending_up</span>
                  {term}
                </button>
              ))}
            </div>

            {/* Quick category links */}
            <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mt-6 mb-3">
              {t.nav.catalog}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t.nav.catalog, to: '/catalog', icon: 'grid_view' },
                { label: t.sections.discount, to: '/sections/discount', icon: 'local_fire_department' },
                { label: t.sections.new, to: '/sections/new', icon: 'new_releases' },
                { label: t.sections.popular, to: '/sections/popular', icon: 'trending_up' },
              ].map(({ label, to, icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2.5 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant hover:border-primary/40 hover:bg-primary-container/10 transition-all"
                >
                  <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
                  <span className="text-sm font-semibold text-on-surface">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {normalizedQuery.length >= 2 && isFetching && !results.length && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <ProductSkeleton key={i} layout="list" />
            ))}
          </div>
        )}

        {/* Quick results list (instant, before pressing Enter) */}
        {normalizedQuery.length >= 2 && !isFetching && results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-on-surface-variant">
                <span className="font-bold text-on-surface">{results.length}</span> {t.favorites.items}
              </p>
              <button
                onClick={() => navigate(`/catalog?q=${encodeURIComponent(normalizedQuery)}`)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t.home.viewAll}
              </button>
            </div>

            {/* Quick list view */}
            <div className="space-y-2 mb-4">
              {results.slice(0, 5).map((p) => (
                <Link
                  key={p.card_id ?? p.id}
                  to={p.variant_id ? `/products/${p.id}?variant=${p.variant_id}` : `/products/${p.id}`}
                  className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-outline-variant hover:border-primary/40 hover:bg-primary-container/5 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl border border-outline-variant overflow-hidden bg-surface-container flex items-center justify-center shrink-0">
                    {p.main_image ? (
                      <img src={p.main_image} alt={p.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="material-symbols-outlined text-[22px] text-outline">inventory_2</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="line-clamp-2 text-sm font-semibold text-on-surface leading-snug">{p.name}</div>
                    {p.category_name && (
                      <div className="text-xs text-on-surface-variant mt-0.5">{p.category_name}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {p.is_discount && p.discount_price && (
                      <div className="text-[11px] text-on-surface-variant line-through">{formatPrice(p.price)}</div>
                    )}
                    <div className="text-sm font-bold text-primary whitespace-nowrap">{formatPrice(activePrice(p))}</div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Full grid for more results */}
            {results.length > 5 && (
              <>
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                  {t.home.viewAll}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {results.slice(5, 15).map((p: any) => (
                    <ProductCard key={p.card_id ?? p.id} product={p} />
                  ))}
                </div>
                {results.length > 15 && (
                  <button
                    onClick={() => navigate(`/catalog?q=${encodeURIComponent(normalizedQuery)}`)}
                    className="w-full mt-4 py-3 rounded-xl border-2 border-primary text-primary font-semibold text-sm hover:bg-primary-container/10 transition-colors"
                  >
                    {t.search.viewAllInCatalog}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* No results */}
        {normalizedQuery.length >= 2 && !isFetching && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <span className="material-symbols-outlined text-[64px] text-outline/40">search_off</span>
            <div>
              <h3 className="font-bold text-on-surface text-lg">{t.search.noResults}</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                "<span className="font-semibold">{normalizedQuery}</span>"
              </p>
            </div>
            <p className="text-sm text-on-surface-variant max-w-[260px]">
              {t.search.noResultsDesc}
            </p>
            <Link
              to="/catalog"
              className="mt-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-semibold text-sm"
            >
              {t.home.goToCatalog}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
