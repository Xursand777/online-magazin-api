import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import ProductCard from '../components/ProductCard';
import type { Product } from '../components/ProductCard';
import ProductSkeleton from '../components/ProductSkeleton';
import { getMainPage, getDiscountProducts, getNewProducts, getPopularProducts, getCategories, getRecentlyViewed, clearRecentlyViewed } from '../api/endpoints';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '../i18n/useTranslation';

interface MainPageData {
  banners?: HomeBanner[];
  discount_products: Product[];
  new_products: Product[];
  popular_products: Product[];
  recommended_products: Product[];
  recommended_title?: string;
  recommended_description?: string;
}

interface HomeBanner {
  id: number;
  title: string;
  subtitle: string;
  product: number | null;
  product_name?: string | null;
  original_price?: string | null;
  discount_price?: string | null;
  product_image_url?: string | null;
  background_image_url?: string | null;
  background_color?: string;
  accent_color?: string;
  button_label?: string;
  target_url?: string;
  order?: number;
}

interface BannerSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  price: string | null;
  oldPrice: string | null;
  image: string | null;
  ctaLabel: string;
  ctaHref: string;
  backgroundColor: string;
  accentColor: string;
  backgroundImage?: string | null;
}

const bannerTitleSize = (title: string) => {
  const length = title.trim().length;
  if (length > 48) return 'text-[26px] leading-[1.08] md:text-[38px] lg:text-[44px]';
  if (length > 32) return 'text-[30px] leading-[1.05] md:text-[42px] lg:text-[50px]';
  return 'text-[34px] leading-[1.02] md:text-[48px] lg:text-[56px]';
};

const ProductSectionSkeleton = () => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    {[1,2,3,4,5,6,7,8,9,10].map(i => (
      <ProductSkeleton key={i} />
    ))}
  </div>
);

const formatMoney = (value: string | number | null | undefined, suffix = 'UZS') => {
  if (value === null || value === undefined || value === '') return null;
  return `${Number(value).toLocaleString('uz-UZ')} ${suffix}`;
};

const activeProductPrice = (product?: Product | null) =>
  product?.is_discount && product.discount_price ? product.discount_price : product?.price;

const categoryIcon = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes('telefon') || normalized.includes('redmi')) return 'smartphone';
  if (normalized.includes('telev')) return 'tv';
  if (normalized.includes('muzlat') || normalized.includes('sovut')) return 'kitchen';
  if (normalized.includes('texnika')) return 'home_iot_device';
  return 'grid_view';
};

type SlideDirection = 'next' | 'prev';

// ─── Ko'rgan mahsulotlar bo'limi ─────────────────────────────────────────────
//
// Manba: server (`/recently-viewed/`). Ma'lumot foydalanuvchiga (auth) yoki
// mehmon sessiyasiga bog'langan — har bir foydalanuvchi uchun alohida, hech
// qachon umumiy emas. Mahsulot ko'rilganda backend avtomatik yozadi; bu yerda
// faqat o'qiymiz va istalganda tarixni tozalaymiz.
//
const RecentlyViewedSection = () => {
  const { t, language } = useTranslation();
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: products = [] } = useQuery<Product[]>({
    // language: mahsulot nomlari tarjima bo'lib keladi — til almashganda qayta fetch qilish kerak
    queryKey: ['recently-viewed', isAuthenticated, language],
    queryFn: () => getRecentlyViewed().then((r) => r.data),
    staleTime: 0,
  });

  const clearAll = async () => {
    await clearRecentlyViewed();
    qc.setQueryData(['recently-viewed', isAuthenticated, language], []);
  };

  // Minimal 2 ta ko'rilgan mahsulot bo'lmasа bo'limni ko'rsatmaymiz
  if (products.length < 2) return null;

  return (
    <section className="mb-2xl">
      {/* Section header */}
      <div className="flex items-center justify-between mb-md">
        <h2 className="font-h2 text-h2 text-on-background text-xl md:text-2xl flex items-center gap-2">
          <span className="material-symbols-outlined text-primary fill-icon">history</span>
          {t.home.recentlyViewed}
        </h2>
        <button
          onClick={clearAll}
          className="text-sm text-on-surface-variant hover:text-error transition-colors flex items-center gap-1 group"
          aria-label={t.home.clearHistory}
        >
          <span className="material-symbols-outlined text-[16px] group-hover:text-error transition-colors">delete_sweep</span>
          {t.home.clearHistory}
        </button>
      </div>

      {/* Horizontally scrollable product strip */}
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 md:overflow-visible md:pb-0">
          {products.slice(0, 12).map((product) => (
            <div
              // Variantli kartalarda bir xil id bo'lishi mumkin — card_id ishlatamiz
              // (lekin recently-viewed dedup qiladi, shu sababli odatda card_id = id)
              key={product.card_id ?? product.id}
              className="flex-shrink-0 w-44 snap-start md:w-auto md:flex-shrink md:min-w-0"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        {/* Fade-out hint on the right edge (mobile only) */}
        {products.length > 3 && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-10 bg-gradient-to-l from-surface-container-low/80 to-transparent md:hidden" />
        )}
      </div>
    </section>
  );
};

const Home = () => {
  const { t, language } = useTranslation();
  const [activeSlide, setActiveSlide] = useState(0);
  const [incomingSlide, setIncomingSlide] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>('next');
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'prepare' | 'animate'>('idle');
  const { data: mainData, isLoading } = useQuery<MainPageData>({
    queryKey: ['mainPage', language],
    staleTime: 0, // always fetch fresh data
    queryFn: async () => {
      try {
        const res = await getMainPage();
        return res.data;
      } catch (err) {
        console.error("Main page fetch failed, trying individual endpoints", err);
        const [disc, newP, pop] = await Promise.allSettled([
          getDiscountProducts(),
          getNewProducts(),
          getPopularProducts(),
        ]);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getData = (res: any) => {
          if (res.status === 'fulfilled' && res.value?.data) {
            return res.value.data.results ?? res.value.data;
          }
          return [];
        };

        return {
          banners: [],
          discount_products: getData(disc),
          new_products: getData(newP),
          popular_products: getData(pop),
          recommended_products: [],
          recommended_title: t.home.recommended,
          recommended_description: t.home.recommended,
        };
      }
    },
  });

  const discountProducts: Product[] = mainData?.discount_products || [];
  const newProducts: Product[] = mainData?.new_products || [];
  const popularProducts: Product[] = mainData?.popular_products || [];
  const recommendedProducts: Product[] = mainData?.recommended_products || [];
  const adminBanners: HomeBanner[] = mainData?.banners || [];

  const heroProducts = useMemo(() => {
    const seen = new Set<number | string>();
    return [...recommendedProducts, ...discountProducts, ...newProducts, ...popularProducts].filter((product) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    });
  }, [recommendedProducts, discountProducts, newProducts, popularProducts]);

  const xiaomiHero = useMemo(
    () =>
      heroProducts.find((product) => product.name.toLowerCase().includes('xiaomi redmi note 15')) ||
      heroProducts.find((product) => product.name.toLowerCase().includes('redmi')) ||
      heroProducts[0] ||
      null,
    [heroProducts]
  );

  const premiumHero = useMemo(
    () =>
      heroProducts.find((product) => product.name.toLowerCase().includes('iphone 17 pro max')) ||
      heroProducts.find((product) => product.name.toLowerCase().includes('samsung s26 ultra')) ||
      heroProducts.find((product) => product.id !== xiaomiHero?.id) ||
      xiaomiHero,
    [heroProducts, xiaomiHero]
  );

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-home', language],
    queryFn: () => getCategories().then(res => res.data.results || res.data),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayCats = categories.some((c: any) => c.is_popular)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? categories.filter((c: any) => c.is_popular).slice(0, 6)
    : categories.slice(0, 6);

  const fallbackBannerSlides = useMemo<BannerSlide[]>(
    () => [
      {
        id: 'xiaomi-redmi-note-15',
        eyebrow: t.home.bannerAd,
        title: t.home.bannerXiaomiTitle,
        subtitle: t.home.bannerXiaomiSubtitle,
        price: formatMoney(activeProductPrice(xiaomiHero)),
        oldPrice:
          xiaomiHero?.is_discount && xiaomiHero.price ? formatMoney(xiaomiHero.price) : null,
        image: xiaomiHero?.main_image || null,
        ctaLabel: t.home.viewProduct,
        ctaHref: xiaomiHero ? `/products/${xiaomiHero.id}` : '/catalog',
        backgroundColor: '#111433',
        accentColor: '#12b981',
        backgroundImage: null,
      },
      {
        id: 'premium-products',
        eyebrow: t.home.bannerSeason,
        title: t.home.bannerPremiumTitle,
        subtitle: t.home.bannerPremiumSubtitle,
        price: premiumHero ? formatMoney(activeProductPrice(premiumHero), 'UZS') : null,
        oldPrice:
          premiumHero?.is_discount && premiumHero.price ? formatMoney(premiumHero.price, 'UZS') : null,
        image: premiumHero?.main_image || null,
        ctaLabel: t.home.goToCatalog,
        ctaHref: premiumHero ? `/products/${premiumHero.id}` : '/catalog',
        backgroundColor: '#007a4d',
        accentColor: '#ffb23f',
        backgroundImage: null,
      },
    ],
    [premiumHero, xiaomiHero]
  );

  const bannerSlides = useMemo<BannerSlide[]>(() => {
    if (adminBanners.length === 0) return fallbackBannerSlides;

    return adminBanners.map((banner) => {
      const salePrice = banner.discount_price || banner.original_price || null;
      const oldPrice = banner.discount_price && banner.original_price ? banner.original_price : null;

      return {
        id: `admin-banner-${banner.id}`,
        eyebrow: t.home.bannerAd,
        title: banner.title || 'Tovar nomini kiriting',
        subtitle: banner.subtitle || '',
        price: formatMoney(salePrice),
        oldPrice: formatMoney(oldPrice),
        image: banner.product_image_url || null,
        ctaLabel: banner.button_label || t.home.viewProduct,
        ctaHref: banner.target_url || (banner.product ? `/products/${banner.product}` : '/catalog'),
        backgroundColor: banner.background_color || '#111827',
        accentColor: banner.accent_color || '#007a4d',
        backgroundImage: banner.background_image_url || null,
      };
    });
  }, [adminBanners, fallbackBannerSlides]);

  useEffect(() => {
    if (animationPhase !== 'prepare') return;
    const frame = window.requestAnimationFrame(() => {
      setAnimationPhase('animate');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [animationPhase]);

  useEffect(() => {
    if (animationPhase !== 'animate' || incomingSlide === null) return;
    const timer = window.setTimeout(() => {
      setActiveSlide(incomingSlide);
      setIncomingSlide(null);
      setAnimationPhase('idle');
    }, 480);
    return () => window.clearTimeout(timer);
  }, [animationPhase, incomingSlide]);

  useEffect(() => {
    if (activeSlide >= bannerSlides.length) {
      setTimeout(() => {
        setActiveSlide(0);
        setIncomingSlide(null);
        setAnimationPhase('idle');
      }, 0);
    }
  }, [activeSlide, bannerSlides.length]);

  const changeSlide = useCallback((nextIndex: number, direction: SlideDirection) => {
    if (bannerSlides.length <= 1 || nextIndex === activeSlide || animationPhase !== 'idle') return;
    setSlideDirection(direction);
    setIncomingSlide(nextIndex);
    setAnimationPhase('prepare');
  }, [activeSlide, animationPhase, bannerSlides.length]);

  useEffect(() => {
    if (bannerSlides.length <= 1 || animationPhase !== 'idle') return;
    const timer = window.setTimeout(() => {
      changeSlide((activeSlide + 1) % bannerSlides.length, 'next');
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [activeSlide, animationPhase, bannerSlides.length, changeSlide]);

  const jumpToSlide = useCallback((index: number) => {
    if (index === activeSlide) return;
    const isWrappedForward = activeSlide === bannerSlides.length - 1 && index === 0;
    const isWrappedBackward = activeSlide === 0 && index === bannerSlides.length - 1;
    const direction: SlideDirection = isWrappedForward || (!isWrappedBackward && index > activeSlide) ? 'next' : 'prev';
    changeSlide(index, direction);
  }, [activeSlide, bannerSlides.length, changeSlide]);

  const currentSlide = bannerSlides[activeSlide];
  const nextSlide = incomingSlide !== null ? bannerSlides[incomingSlide] : null;

  const currentSlideTransform = incomingSlide === null
    ? 'translate-x-0'
    : animationPhase === 'animate'
      ? slideDirection === 'next'
        ? '-translate-x-full'
        : 'translate-x-full'
      : 'translate-x-0';

  const nextSlideTransform = incomingSlide === null
    ? 'translate-x-full'
    : animationPhase === 'animate'
      ? 'translate-x-0'
      : slideDirection === 'next'
        ? 'translate-x-full'
        : '-translate-x-full';

  const renderBannerSlide = (slide: BannerSlide, isActive: boolean) => (
    <div
      key={`${slide.id}-${isActive ? 'current' : 'incoming'}`}
      style={{
        backgroundColor: slide.backgroundColor,
        backgroundImage: slide.backgroundImage
          ? `linear-gradient(90deg, ${slide.backgroundColor}e6 0%, ${slide.backgroundColor}bf 46%, ${slide.accentColor}8c 100%), url(${slide.backgroundImage})`
          : `linear-gradient(105deg, ${slide.backgroundColor} 0%, ${slide.backgroundColor} 52%, ${slide.accentColor} 100%)`,
      }}
      className={`absolute inset-0 isolate bg-cover bg-center text-white ${
        isActive ? currentSlideTransform : nextSlideTransform
      } ${incomingSlide !== null ? 'transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]' : ''}`}
    >
      <div className="grid min-h-[340px] grid-cols-1 items-stretch md:min-h-[440px] md:grid-cols-[1fr_0.92fr] lg:min-h-[480px]">
        <div className="relative z-10 flex flex-col justify-center px-7 py-8 md:px-12 md:py-12 lg:py-14">
          <div className="mb-4 inline-flex w-fit items-center rounded-full border border-white/30 bg-white/8 px-3 py-1 text-[12px] font-semibold tracking-wide backdrop-blur-sm">
            {slide.eyebrow}
          </div>
          <h1 className={`max-w-[620px] font-black tracking-normal ${bannerTitleSize(slide.title)}`}>
            {slide.title}
          </h1>
          <p className="mt-4 max-w-[540px] text-sm leading-6 opacity-85 md:text-base md:leading-7">
            {slide.subtitle}
          </p>
          {(slide.price || slide.oldPrice) && (
            <div className="mt-5 md:mt-6">
              {slide.oldPrice && (
                <div className="mb-2 text-sm opacity-65 line-through md:text-base">{slide.oldPrice}</div>
              )}
              {slide.price && (
                <div className="text-[30px] font-black leading-none text-white md:text-[42px] lg:text-[48px]">
                  {slide.price}
                </div>
              )}
            </div>
          )}
          <div className="mt-6">
            <Link
              to={slide.ctaHref}
              style={{ color: slide.accentColor }}
              className="inline-flex items-center gap-2 rounded-full bg-white/95 px-5 py-3 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.02] hover:bg-white"
            >
              {slide.ctaLabel}
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>

        <div className="relative hidden min-h-[340px] items-center justify-end overflow-hidden md:flex lg:min-h-[480px]">
          {slide.image ? (
            <img
              src={slide.image}
              alt={slide.title}
              className="relative z-10 mr-4 h-[82%] max-h-[420px] w-[86%] object-contain object-center drop-shadow-[0_36px_54px_rgba(0,0,0,0.34)] lg:mr-8 lg:max-h-[460px]"
            />
          ) : (
            <div className="relative z-10 mr-8 mb-6 flex h-[240px] w-[240px] items-center justify-center rounded-[32px] bg-white/10 backdrop-blur-sm">
              <span className="material-symbols-outlined text-[88px] text-white/85">smartphone</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full pb-24 md:pb-8">

      {/* ── MOBIL — ixcham, yon-suriladigan banner carousel (FAQAT mobil) ──
          Rasm ko'rinadi, balandligi past, barmoq bilan yon tomonga suriladi
          (snap-x snap-mandatory). Desktop'da yashirin — desktop o'z hero'sini
          ko'rsatadi (pastda hidden md:block). */}
      <section className="mb-lg md:hidden">
        <div className="-mx-margin-mobile flex snap-x snap-mandatory gap-3 overflow-x-auto px-margin-mobile pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {bannerSlides.map((slide) => (
            <Link
              key={slide.id}
              to={slide.ctaHref}
              style={{
                backgroundColor: slide.backgroundColor,
                backgroundImage: slide.backgroundImage
                  ? `linear-gradient(100deg, ${slide.backgroundColor}f0 0%, ${slide.backgroundColor}cc 55%, ${slide.accentColor}99 100%), url(${slide.backgroundImage})`
                  : `linear-gradient(110deg, ${slide.backgroundColor} 0%, ${slide.backgroundColor} 50%, ${slide.accentColor} 100%)`,
              }}
              className="relative flex w-[88%] shrink-0 snap-center items-stretch overflow-hidden rounded-[22px] bg-cover bg-center text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]"
            >
              <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
                <span className="mb-2 inline-flex w-fit items-center rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide backdrop-blur-sm">
                  {slide.eyebrow}
                </span>
                <h3 className="line-clamp-2 text-[16px] font-black leading-tight">{slide.title}</h3>
                {(slide.price || slide.oldPrice) && (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                    {slide.price && (
                      <span className="text-[19px] font-black leading-none">{slide.price}</span>
                    )}
                    {slide.oldPrice && (
                      <span className="text-[11px] opacity-70 line-through">{slide.oldPrice}</span>
                    )}
                  </div>
                )}
              </div>
              {slide.image && (
                <div className="flex w-[40%] shrink-0 items-center justify-center p-2">
                  <img
                    src={slide.image}
                    alt={slide.title}
                    className="max-h-[112px] w-full object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* ── DESKTOP hero (FAQAT desktop) ── */}
      <section className="mb-xl hidden md:block">
        <div className="relative overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-lowest shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="relative min-h-[340px] md:min-h-[440px] lg:min-h-[480px]">
            {renderBannerSlide(currentSlide, true)}
            {nextSlide ? renderBannerSlide(nextSlide, false) : null}
          </div>

          <button
            type="button"
            onClick={() => changeSlide((activeSlide - 1 + bannerSlides.length) % bannerSlides.length, 'prev')}
            className="absolute left-4 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/22 text-white backdrop-blur-sm transition-colors hover:bg-white/30 md:flex"
            aria-label="Oldingi banner"
          >
            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => changeSlide((activeSlide + 1) % bannerSlides.length, 'next')}
            className="absolute right-4 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/22 text-white backdrop-blur-sm transition-colors hover:bg-white/30 md:flex"
            aria-label="Keyingi banner"
          >
            <span className="material-symbols-outlined text-[28px]">chevron_right</span>
          </button>

          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
            {bannerSlides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => jumpToSlide(index)}
                className={`h-2.5 rounded-full transition-all ${index === activeSlide ? 'w-7 bg-white' : 'w-2.5 bg-white/45'}`}
                aria-label={`${index + 1}-banner`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mb-2xl">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {displayCats.slice(0, 5).map((cat: any) => (
            <Link
              key={cat.id}
              to={`/catalog/${cat.slug}`}
            className="group flex items-center gap-3 rounded-[24px] border border-outline-variant bg-surface-container-low px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary-container/10 dark:hover:border-outline dark:hover:bg-surface-container-high"
          >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-container-lowest text-primary shadow-sm">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-[26px]">{categoryIcon(cat.name)}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-semibold leading-5 text-on-surface md:text-base">
                  {cat.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Ko'rgan mahsulotlar ─────────────────────────────── */}
      <RecentlyViewedSection />

      {/* Personalized Recommendations */}
      {recommendedProducts.length > 0 && (
        <section className="mb-2xl overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-lowest shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="border-b border-outline-variant bg-gradient-to-r from-secondary-container/45 via-surface-container-lowest to-primary-container/30 px-4 py-3 md:px-6">
            <div className="inline-flex items-center rounded-full bg-surface-container-lowest/90 px-3 py-1.5 text-sm font-semibold text-primary shadow-sm">
              {t.home.recommended} →
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-3 md:px-5 lg:grid-cols-4 xl:grid-cols-5">
            {recommendedProducts.slice(0, 5).map((product) => (
              <ProductCard key={product.card_id ?? product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* Chegirmadagi mahsulotlar */}
      <section className="mb-2xl">
        <div className="flex justify-between items-center mb-md">
          <h2 className="font-h2 text-h2 text-on-background text-xl md:text-2xl flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary fill-icon">local_fire_department</span>
            {t.home.discountProducts}
          </h2>
          <Link to="/sections/discount" className="text-primary font-label-md text-label-md hover:underline">
            {t.home.viewAll}
          </Link>
        </div>
        {isLoading ? (
          <ProductSectionSkeleton />
        ) : discountProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {discountProducts.slice(0, 10).map(p => (
              <ProductCard key={p.card_id ?? p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="text-on-surface-variant text-center py-8 bg-surface-container rounded-xl">
            <span className="material-symbols-outlined text-4xl block mb-2">inventory_2</span>
            {t.home.noDiscountProducts}
          </div>
        )}
      </section>

      {/* Yangi mahsulotlar */}
      <section className="mb-2xl">
        <div className="flex justify-between items-center mb-md">
          <h2 className="font-h2 text-h2 text-on-background text-xl md:text-2xl flex items-center gap-2">
            <span className="material-symbols-outlined text-primary fill-icon">new_releases</span>
            {t.home.newProducts}
          </h2>
          <Link to="/sections/new" className="text-primary font-label-md text-label-md hover:underline">
            {t.home.viewAll}
          </Link>
        </div>
        {isLoading ? (
          <ProductSectionSkeleton />
        ) : newProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {newProducts.slice(0, 10).map(p => (
              <ProductCard key={p.card_id ?? p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="text-on-surface-variant text-center py-8 bg-surface-container rounded-xl">
            <span className="material-symbols-outlined text-4xl block mb-2">inventory_2</span>
            {t.home.noNewProducts}
          </div>
        )}
      </section>

      {/* Ommabop mahsulotlar */}
      <section className="mb-2xl">
        <div className="flex justify-between items-center mb-md">
          <h2 className="font-h2 text-h2 text-on-background text-xl md:text-2xl flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary fill-icon">trending_up</span>
            {t.home.popularProducts}
          </h2>
          <Link to="/sections/popular" className="text-primary font-label-md text-label-md hover:underline">
            {t.home.viewAll}
          </Link>
        </div>
        {isLoading ? (
          <ProductSectionSkeleton />
        ) : popularProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {popularProducts.slice(0, 10).map(p => (
              <ProductCard key={p.card_id ?? p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="text-on-surface-variant text-center py-8 bg-surface-container rounded-xl">
            <span className="material-symbols-outlined text-4xl block mb-2">inventory_2</span>
            {t.home.noPopularProducts}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
