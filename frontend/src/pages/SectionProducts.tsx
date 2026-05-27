import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';

import ProductCard from '../components/ProductCard';
import type { Product } from '../components/ProductCard';
import ProductSkeleton from '../components/ProductSkeleton';
import { getDiscountProducts, getNewProducts, getPopularProducts } from '../api/endpoints';
import { useTranslation } from '../i18n/useTranslation';
import { useLanguageStore } from '../store/languageStore';

type SectionKey = 'discount' | 'new' | 'popular';

interface PaginatedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Product[];
}

interface SectionMeta {
  icon: string;
  accent: string;
  accentBg: string;
  queryKey: string;
  fetcher: (params?: { page?: number; page_size?: number }) => Promise<{ data: PaginatedResponse }>;
}

const PAGE_SIZE = 40;

const SECTION_CONFIG: Record<SectionKey, SectionMeta> = {
  discount: {
    icon: 'local_fire_department',
    accent: 'text-tertiary',
    accentBg: 'bg-tertiary/10',
    queryKey: 'discount-products',
    fetcher: getDiscountProducts as SectionMeta['fetcher'],
  },
  new: {
    icon: 'new_releases',
    accent: 'text-primary',
    accentBg: 'bg-primary/10',
    queryKey: 'new-products',
    fetcher: getNewProducts as SectionMeta['fetcher'],
  },
  popular: {
    icon: 'trending_up',
    accent: 'text-secondary',
    accentBg: 'bg-secondary/10',
    queryKey: 'popular-products',
    fetcher: getPopularProducts as SectionMeta['fetcher'],
  },
};

const SectionProducts = () => {
  const { section } = useParams<{ section: SectionKey }>();
  const config = section ? SECTION_CONFIG[section] : null;
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sectionTitles: Record<SectionKey, string> = {
    discount: t.sections.discount,
    new: t.sections.new,
    popular: t.sections.popular,
  };

  const sectionDescriptions: Record<SectionKey, string> = {
    discount: t.home.discountProducts,
    new: t.home.newProducts,
    popular: t.home.popularProducts,
  };

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ['section-products', config?.queryKey, language],
    queryFn: async ({ pageParam }) => {
      if (!config) return { count: 0, next: null, previous: null, results: [] };
      const response = await config.fetcher({ page: pageParam as number, page_size: PAGE_SIZE });
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.next) return (lastPageParam as number) + 1;
      return undefined;
    },
    enabled: Boolean(config),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Flatten all pages into a single array
  const products = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const totalCount = data?.pages[0]?.count ?? 0;

  const summary = useMemo(() => {
    const discountCount = products.filter((product) => product.is_discount).length;
    return { total: totalCount, discountCount };
  }, [products, totalCount]);

  // IntersectionObserver for infinite scroll — fires when sentinel is ~300px from viewport
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: '0px 0px 600px 0px', // trigger 600px before the bottom
      threshold: 0,
    });
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [handleIntersection]);

  if (!config || !section) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-2xl font-bold text-on-surface">{t.sections.noProducts}</h1>
      </div>
    );
  }

  const title = sectionTitles[section];

  // Skeleton shimmer rows for initial load
  const renderSkeleton = (count: number) => (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <ProductSkeleton key={index} />
      ))}
    </div>
  );

  // Skeleton shimmer row for "loading more" at the bottom
  const renderLoadMoreSkeleton = () => (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 mt-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <ProductSkeleton key={`more-${index}`} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-8 pb-8">

      <nav className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link to="/" className="transition-colors hover:text-primary">
          {t.favorites.breadcrumb}
        </Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="font-semibold text-on-surface">{title}</span>
      </nav>

      <section className="overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-lowest shadow-[0_18px_54px_rgba(15,23,42,0.08)]">
        <div className="border-b border-outline-variant bg-gradient-to-r from-primary-container/20 via-surface-container-lowest to-secondary-container/20 px-5 py-5 md:px-7 md:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className={`mb-3 inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-3 py-1.5 text-sm font-semibold shadow-sm ${config.accent}`}>
                <span className="material-symbols-outlined text-[18px]">{config.icon}</span>
                {title}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-on-surface md:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
                {sectionDescriptions[section]}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
              <div className="rounded-2xl border border-outline-variant bg-surface-container px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-on-surface-variant">{t.cart.products}</div>
                <div className="mt-1 text-2xl font-black text-on-surface">
                  {isLoading ? (
                    <span className="inline-block w-10 h-7 animate-pulse rounded bg-surface-container-low" />
                  ) : (
                    summary.total.toLocaleString()
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-outline-variant bg-surface-container px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-on-surface-variant">{t.product.discount}</div>
                <div className="mt-1 text-2xl font-black text-on-surface">
                  {isLoading ? (
                    <span className="inline-block w-10 h-7 animate-pulse rounded bg-surface-container-low" />
                  ) : (
                    summary.discountCount.toLocaleString()
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 md:px-6 md:py-6">
          {isLoading ? (
            renderSkeleton(10)
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Loading more shimmer */}
              {isFetchingNextPage && renderLoadMoreSkeleton()}

              {/* Invisible sentinel element for IntersectionObserver */}
              <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />

              {/* End of list indicator */}
              {!hasNextPage && products.length > PAGE_SIZE && (
                <div className="mt-8 flex flex-col items-center gap-2 py-4">
                  <div className="h-[2px] w-20 rounded-full bg-outline-variant/50" />
                  <p className="text-sm font-medium text-on-surface-variant">
                    {products.length.toLocaleString()} / {totalCount.toLocaleString()}
                    {' '}
                    {t.cart.products.toLowerCase()}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
              <span className={`material-symbols-outlined text-6xl ${config.accent}`}>{config.icon}</span>
              <h2 className="mt-4 text-2xl font-bold text-on-surface">{t.sections.noProducts}</h2>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SectionProducts;
