import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import HomeSearch from '../components/HomeSearch';
import ProductCard from '../components/ProductCard';
import type { Product } from '../components/ProductCard';
import { getDiscountProducts, getNewProducts, getPopularProducts } from '../api/endpoints';

type SectionKey = 'discount' | 'new' | 'popular';

interface SectionMeta {
  title: string;
  description: string;
  icon: string;
  accent: string;
  queryKey: string;
  fetcher: () => Promise<{ data: Product[] }>;
}

const SECTION_CONFIG: Record<SectionKey, SectionMeta> = {
  discount: {
    title: 'Chegirmadagi mahsulotlar',
    description: "Ayni paytdagi chegirma bilan sotuvdagi mahsulotlarning to'liq ro'yxati.",
    icon: 'local_fire_department',
    accent: 'text-tertiary',
    queryKey: 'discount-products',
    fetcher: getDiscountProducts,
  },
  new: {
    title: 'Yangi mahsulotlar',
    description: "Yaqinda qo'shilgan yangi mahsulotlarning to'liq ro'yxati.",
    icon: 'new_releases',
    accent: 'text-primary',
    queryKey: 'new-products',
    fetcher: getNewProducts,
  },
  popular: {
    title: 'Ommabop mahsulotlar',
    description: "Eng ko'p qiziqish uyg'otayotgan va ommabop mahsulotlarning to'liq ro'yxati.",
    icon: 'trending_up',
    accent: 'text-secondary',
    queryKey: 'popular-products',
    fetcher: getPopularProducts,
  },
};

const SectionProducts = () => {
  const { section } = useParams<{ section: SectionKey }>();
  const config = section ? SECTION_CONFIG[section] : null;

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['section-products', config?.queryKey],
    queryFn: async () => {
      if (!config) return [];
      const response = await config.fetcher();
      return response.data;
    },
    enabled: Boolean(config),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const summary = useMemo(() => {
    const discountCount = products.filter((product) => product.is_discount).length;
    return {
      total: products.length,
      discountCount,
    };
  }, [products]);

  if (!config) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-2xl font-bold text-on-surface">Bo'lim topilmadi</h1>
        <p className="mt-2 text-on-surface-variant">Kerakli bo'lim manzili noto'g'ri berilgan.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      <HomeSearch />

      <nav className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link to="/" className="transition-colors hover:text-primary">
          Bosh sahifa
        </Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="font-semibold text-on-surface">{config.title}</span>
      </nav>

      <section className="overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-lowest shadow-[0_18px_54px_rgba(15,23,42,0.08)]">
        <div className="border-b border-outline-variant bg-gradient-to-r from-primary-container/20 via-surface-container-lowest to-secondary-container/20 px-5 py-5 md:px-7 md:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className={`mb-3 inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-3 py-1.5 text-sm font-semibold shadow-sm ${config.accent}`}>
                <span className="material-symbols-outlined text-[18px]">{config.icon}</span>
                {config.title}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-on-surface md:text-4xl">
                {config.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant md:text-base">
                {config.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
              <div className="rounded-2xl border border-outline-variant bg-surface-container px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-on-surface-variant">Mahsulotlar</div>
                <div className="mt-1 text-2xl font-black text-on-surface">{summary.total}</div>
              </div>
              <div className="rounded-2xl border border-outline-variant bg-surface-container px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-on-surface-variant">Chegirma</div>
                <div className="mt-1 text-2xl font-black text-on-surface">{summary.discountCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 md:px-6 md:py-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[0.78] animate-pulse rounded-3xl border border-outline-variant bg-surface-container"
                />
              ))}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center">
              <span className={`material-symbols-outlined text-6xl ${config.accent}`}>{config.icon}</span>
              <h2 className="mt-4 text-2xl font-bold text-on-surface">{config.title} yo'q</h2>
              <p className="mt-2 text-on-surface-variant">Hozircha bu bo'limda mahsulotlar mavjud emas.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SectionProducts;
