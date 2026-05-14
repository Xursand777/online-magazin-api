import { type FormEvent, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { searchProducts } from '../api/endpoints';

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
  `${Number(value).toLocaleString('uz-UZ')} so'm`;

const HomeSearch = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim();

  const { data: results = [], isFetching } = useQuery<SearchProduct[]>({
    queryKey: ['product-search', normalizedQuery],
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
    <section className="mx-auto mb-2xl w-full max-w-[980px] xl:max-w-[1020px]" ref={containerRef}>
      <div className="rounded-[26px] border border-outline-variant bg-surface-container-lowest p-2 shadow-[0_18px_48px_rgba(15,23,42,0.08)] md:p-2.5">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
            <Link
              to="/catalog"
              className="flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-[18px] border border-primary/90 bg-primary-container/10 px-4 text-primary transition-colors hover:bg-primary-container/20 md:w-[180px] md:justify-start"
            >
              <span className="material-symbols-outlined text-[24px]">menu</span>
              <span className="text-[18px] font-medium tracking-tight md:text-[20px]">Katalog</span>
            </Link>

            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[18px] border border-outline-variant bg-surface-container-lowest px-3 py-2 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 md:h-14 md:px-4">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  if (query.trim()) {
                    setIsOpen(true);
                  }
                }}
                placeholder="Mahsulot nomini kiriting..."
                className="min-w-0 flex-1 border-none bg-transparent text-base font-medium text-on-surface outline-none placeholder:text-outline/60 md:text-[18px]"
              />

              {query && (
                <button
                  type="button"
                  onClick={clearQuery}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-colors hover:text-on-surface"
                  aria-label="Qidiruvni tozalash"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}

              <button
                type="submit"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary text-on-primary shadow-sm transition-transform hover:scale-[1.02] md:h-11 md:w-11"
                aria-label="Qidirish"
              >
                <span className="material-symbols-outlined fill-icon text-[22px]">search</span>
              </button>
            </div>
          </div>
        </form>

        {isOpen && (
          <div className="mt-3 overflow-hidden rounded-[24px] border border-outline-variant bg-surface-container-lowest shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
            {isFetching ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="h-20 animate-pulse rounded-2xl bg-surface-container"
                  />
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className="max-h-[520px] overflow-y-auto">
                {results.map((product, index) => (
                  <Link
                    key={product.id}
                    to={`/products/${product.id}`}
                    onClick={() => {
                      if (normalizedQuery) {
                        void searchProducts(normalizedQuery, true);
                      }
                      setIsOpen(false);
                    }}
                    className={`group flex items-start gap-4 px-4 py-4 transition-colors hover:bg-primary-container/10 dark:hover:bg-surface-container-high ${
                      index !== results.length - 1 ? 'border-b border-outline-variant' : ''
                    }`}
                  >
                    <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-outline-variant text-outline transition-colors group-hover:border-primary group-hover:text-primary">
                      <span className="material-symbols-outlined text-[24px]">search</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2">
                        <span className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                          {product.category_name || "Kategoriya yo'q"}
                        </span>
                      </div>
                      <div className="line-clamp-2 text-base font-semibold leading-6 text-on-surface transition-colors group-hover:text-primary md:text-lg">
                        {product.name}
                      </div>
                      <div className="mt-2 text-sm text-on-surface-variant">ID: {product.id}</div>
                    </div>

                    <div className="shrink-0 pl-2 text-right">
                      {product.is_discount && product.discount_price && (
                        <div className="text-xs text-on-surface-variant line-through">
                          {formatPrice(product.price)}
                        </div>
                      )}
                      <div className="whitespace-nowrap text-lg font-black text-primary md:text-[28px]">
                        {formatPrice(activePrice(product))}
                      </div>
                    </div>
                  </Link>
                ))}
                {normalizedQuery && results.length > 0 && (
                  <div className="border-t border-outline-variant bg-surface-container-low/40 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        navigate(`/catalog?q=${encodeURIComponent(normalizedQuery)}`);
                      }}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Barchasini katalogda ko'rish
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="material-symbols-outlined text-5xl text-outline">search_off</span>
                <h3 className="text-lg font-semibold text-on-surface">Mos mahsulot topilmadi</h3>
                <p className="max-w-md text-sm text-on-surface-variant">
                  So'zni biroz o'zgartirib ko'ring. Nom, kategoriya yoki mahsulot ID orqali qidirsangiz aniqroq chiqadi.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default HomeSearch;
