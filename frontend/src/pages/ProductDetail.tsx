import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProductDetail, getSimilarProducts } from '../api/endpoints';
import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { useAuthStore } from '../store/authStore';
import { toast } from '../utils/toast';
import Lightbox from '../components/Lightbox';
import ProductCard, { type Product as ProductCardData } from '../components/ProductCard';
import ProductSkeleton from '../components/ProductSkeleton';
import { useTranslation } from '../i18n/useTranslation';


interface ProductImage { id: number; image: string; is_main: boolean; }
interface ProductVariant {
  id: number;
  color: string;
  color_hex?: string | null;
  image_url?: string | null;
  images: { id: number | null; url: string }[];
  quality?: string | null;
  model: string;
  size: string;
  price: string | null;
  price_usd: string | null;
  discount_price: string | null;
  discount_price_usd: string | null;
  stock: number;
}
interface CompatModel {
  id: number;
  slug: string;
  full_name: string;
  notes: string;
}
interface CompatBrandGroup {
  brand: string;
  brand_slug: string;
  models: CompatModel[];
}
interface ProductDetailData {
  id: number; name: string; description: string;
  price: string; discount_price: string | null; master_price: string | null; is_discount: boolean; stock: number;
  is_new: boolean; is_popular: boolean;
  category: { id: number; name: string; slug: string; parent: number | null; };
  images: ProductImage[]; variants: ProductVariant[];
  compatible_models: CompatBrandGroup[];
}

// ── Moslik bo'limi ────────────────────────────────────────────────────────────
const COLLAPSED_MODELS_PER_BRAND = 4;

const CompatibilitySection = ({
  groups,
  t,
}: {
  groups: CompatBrandGroup[];
  t: ReturnType<typeof import('../i18n/useTranslation').useTranslation>['t'];
}) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const totalModels = groups.reduce((s, g) => s + g.models.length, 0);

  const toggleBrand = useCallback((slug: string) => {
    setExpandedBrands((prev) => {
      const n = new Set(prev);
      n.has(slug) ? n.delete(slug) : n.add(slug);
      return n;
    });
  }, []);

  if (!groups.length) return null;

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-container/40 transition-colors"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <span className="material-symbols-outlined text-[20px] text-primary">phonelink</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface">{t.product.compatibleWith}</p>
          <p className="text-xs text-on-surface-variant">
            {totalModels} {t.product.compatibleDevices}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[20px] text-on-surface-variant transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        >
          expand_more
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-outline-variant/60 px-4 pb-4 pt-3 space-y-4">
          {groups.map((group) => {
            const isBrandExpanded = expandedBrands.has(group.brand_slug);
            const visibleModels = isBrandExpanded
              ? group.models
              : group.models.slice(0, COLLAPSED_MODELS_PER_BRAND);
            const hiddenCount = group.models.length - COLLAPSED_MODELS_PER_BRAND;

            return (
              <div key={group.brand_slug}>
                {/* Brand label */}
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  {group.brand}
                </p>

                {/* Model chips */}
                <div className="flex flex-wrap gap-1.5">
                  {visibleModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => navigate(`/catalog?compatible_with=${model.slug}`)}
                      title={model.notes || model.full_name}
                      className="group relative flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-3 py-1 text-xs text-on-surface transition-all hover:border-primary hover:bg-primary/5 hover:text-primary active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[13px] text-on-surface-variant group-hover:text-primary transition-colors">
                        smartphone
                      </span>
                      {model.full_name}
                      {model.notes && (
                        <span className="ml-0.5 text-[10px] text-on-surface-variant group-hover:text-primary/70">
                          · {model.notes}
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Show more / less toggle for this brand */}
                  {hiddenCount > 0 && !isBrandExpanded && (
                    <button
                      onClick={() => toggleBrand(group.brand_slug)}
                      className="flex items-center gap-1 rounded-full border border-dashed border-outline-variant px-3 py-1 text-xs text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                    >
                      +{hiddenCount} {t.product.showAllModels}
                    </button>
                  )}
                  {isBrandExpanded && group.models.length > COLLAPSED_MODELS_PER_BRAND && (
                    <button
                      onClick={() => toggleBrand(group.brand_slug)}
                      className="flex items-center gap-1 rounded-full border border-dashed border-outline-variant px-3 py-1 text-xs text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                    >
                      {t.product.hideModels}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const formatPrice = (v: string | number) =>
  Number(v).toLocaleString('uz-UZ') + ' UZS';

const calcDiscount = (price: string, discount: string) =>
  Math.round(((Number(price) - Number(discount)) / Number(price)) * 100);

const COLOR_NAME_MAP: Record<string, string> = {
  qora: '#111827',
  black: '#111827',
  oq: '#f8fafc',
  white: '#f8fafc',
  "ko'k": '#2563eb',
  kok: '#2563eb',
  blue: '#2563eb',
  kulrang: '#8b8f98',
  gray: '#8b8f98',
  grey: '#8b8f98',
  yashil: '#16a34a',
  green: '#16a34a',
  qizil: '#dc2626',
  red: '#dc2626',
  sariq: '#facc15',
  yellow: '#facc15',
  orange: '#f97316',
  pushti: '#ec4899',
  pink: '#ec4899',
  binafsha: '#8b5cf6',
  purple: '#8b5cf6',
  titanium: '#a8a29e',
};

const normalizeColorName = (value: string) =>
  value.toLowerCase().replace(/ʻ/g, "'").replace(/’/g, "'").trim();

const resolveColorHex = (variant: ProductVariant) => {
  if (variant.color_hex) return variant.color_hex;
  const normalized = normalizeColorName(variant.color || '');
  if (COLOR_NAME_MAP[normalized]) return COLOR_NAME_MAP[normalized];
  const matchingKey = Object.keys(COLOR_NAME_MAP).find((key) => normalized.includes(key));
  return matchingKey ? COLOR_NAME_MAP[matchingKey] : '#94a3b8';
};

const uniqueBy = <T,>(items: T[], keyGetter: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyGetter(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const isMaster = useAuthStore(s => s.user?.is_master ?? false);
  const [activeImg, setActiveImg] = useState(0);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxStartIdx, setLightboxStartIdx] = useState(0);

  const { data: product, isLoading, isError } = useQuery<ProductDetailData>({
    queryKey: ['product', id, language],
    queryFn: () => getProductDetail(id!).then(r => r.data),
    enabled: !!id,
  });

  const { data: similarProducts = [], isLoading: isSimilarLoading } = useQuery<ProductCardData[]>({
    queryKey: ['similar-products', id, language],
    queryFn: () => getSimilarProducts(id!).then(r => r.data),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const { addItem, updateItem, removeItem, addingId, updatingItemIds } = useCartStore();
  const cart = useCartStore((state) => state.cart);
  const isAdding = addingId === Number(id);

  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const queryClient = useQueryClient();
  const isFav = isFavorite(Number(id));

  const handleToggleFavorite = () => {
    if (!product) return;
    const productSnapshot = {
      id: product.id,
      name: product.name,
      price: product.price,
      discount_price: product.discount_price,
      is_discount: product.is_discount,
      main_image: product.images[0]?.image || null,
    };

    if (isFav) {
      toggleFavorite(productSnapshot);
      toast.undo(
        t.product.removedFromFavorites,
        () => toggleFavorite(productSnapshot),
        t.common.cancel
      );
    } else {
      toggleFavorite(productSnapshot);
      toast.success(t.product.addedToFavorites);
    }
  };

  const images = product?.images || [];
  const variants = product?.variants || [];
  const colorOptions = uniqueBy(variants.filter((variant) => variant.color), (variant) => variant.color);
  const selectedColorVariant = colorOptions.find((variant) => variant.color === selectedColor) || colorOptions[0] || null;
  const filteredByColor = selectedColor ? variants.filter((variant) => variant.color === selectedColor) : variants;
  const qualityOptions = uniqueBy(
    filteredByColor.filter((variant) => variant.quality),
    (variant) => variant.quality || ''
  );
  const filteredVariants = selectedQuality
    ? filteredByColor.filter((variant) => (variant.quality || '') === selectedQuality)
    : filteredByColor;
  const sizeOptions = uniqueBy(
    filteredVariants.filter((variant) => variant.size || variant.model),
    (variant) => variant.size || variant.model
  );
  const currentVariant = filteredVariants.find(
    (variant) => (selectedSize ? (variant.size || variant.model) === selectedSize : true)
  ) || filteredVariants[0] || null;
  const cartItem = cart?.items.find(
    (item) =>
      item.product === Number(id) &&
      (item.variant || null) === (currentVariant?.id || null)
  ) || null;
  const variantGallery: { id: number | null; url: string }[] =
    currentVariant?.images?.length ? currentVariant.images
    : selectedColorVariant?.images?.length ? selectedColorVariant.images
    : [];
  const mainImg = variantGallery[galleryIdx]?.url || variantGallery[0]?.url || images[activeImg]?.image || null;
  const cartQuantity = cartItem?.quantity || 0;
  const currentStock = currentVariant ? currentVariant.stock : product?.stock ?? 0;
  const stockLimit = currentStock === undefined || currentStock === null ? null : Number(currentStock);
  const hasStockLimit = stockLimit !== null && Number.isFinite(stockLimit);
  const isOutOfStock = hasStockLimit && stockLimit <= 0;
  const isAtStockLimit = hasStockLimit && cartQuantity >= stockLimit;
  const isUpdatingCartItem = Boolean(cartItem && updatingItemIds[String(cartItem.id)]);
  const variantPrice = Number(currentVariant?.price || product?.price || 0);
  const variantDiscountPrice =
    currentVariant?.discount_price
      ? Number(currentVariant.discount_price)
      : currentVariant?.price
        ? null
        : product?.discount_price
          ? Number(product.discount_price)
          : null;

  useEffect(() => {
    if (!product?.variants?.length) {
      setSelectedColor('');
      setSelectedQuality('');
      setSelectedSize('');
      return;
    }

    const firstColor = product.variants.find((variant) => variant.color)?.color || '';
    const firstVariant = product.variants[0];
    setSelectedColor(firstColor || '');
    setSelectedQuality(firstVariant?.quality || '');
    setSelectedSize(firstVariant?.size || firstVariant?.model || '');
  }, [product?.id, product?.variants]);

  const displayTitle = useMemo(() => {
    if (!product) return '';
    const parts = [];
    if (selectedQuality) parts.push(selectedQuality);
    if (selectedSize) parts.push(selectedSize);
    if (selectedColor) parts.push(selectedColor);

    if (parts.length > 0) {
      return `${product.name} • ${parts.join(' • ')}`;
    }
    return product.name;
  }, [product, selectedQuality, selectedSize, selectedColor]);

  useEffect(() => {
    if (displayTitle) {
      document.title = `${displayTitle} | Bozor`;
    }
  }, [displayTitle]);

  // Ko'rilgan mahsulot server tomonida avtomatik yoziladi (GET /products/<id>/).
  // Bosh sahifadagi "Ko'rgan mahsulotlar" yangilanishi uchun query'ni eskirtiramiz.
  useEffect(() => {
    if (!product) return;
    queryClient.invalidateQueries({ queryKey: ['recently-viewed'] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  useEffect(() => {
    if (!variants.length || !colorOptions.length) return;
    if (!selectedColor || !colorOptions.some((variant) => variant.color === selectedColor)) {
      setSelectedColor(colorOptions[0]?.color || '');
    }
  }, [variants, colorOptions, selectedColor]);

  useEffect(() => {
    if (!filteredByColor.length) return;
    if (qualityOptions.length === 0) {
      if (selectedQuality) setSelectedQuality('');
      return;
    }
    if (!selectedQuality || !qualityOptions.some((variant) => variant.quality === selectedQuality)) {
      setSelectedQuality(qualityOptions[0]?.quality || '');
    }
  }, [filteredByColor, qualityOptions, selectedQuality]);

  useEffect(() => {
    if (sizeOptions.length === 0) {
      if (selectedSize) setSelectedSize('');
      return;
    }
    if (!selectedSize || !sizeOptions.some((variant) => (variant.size || variant.model) === selectedSize)) {
      setSelectedSize((sizeOptions[0]?.size || sizeOptions[0]?.model) || '');
    }
  }, [sizeOptions, selectedSize]);

  useEffect(() => { setGalleryIdx(0); }, [currentVariant?.id]);

  if (isLoading) return (
    <div className="flex-grow w-full py-lg flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
        <p className="text-on-surface-variant">{t.product.loading}</p>
      </div>
    </div>
  );

  if (isError || !product) return (
    <div className="flex-grow w-full py-lg flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <span className="material-symbols-outlined text-5xl text-error">error</span>
      <h2 className="font-h3 text-on-surface">{t.product.notFound}</h2>
      <button onClick={() => navigate(-1)} className="text-primary hover:underline">{t.product.goBack}</button>
    </div>
  );

  const addToCartPayload = {
    productId: product.id,
    variantId: currentVariant?.id || null,
    quantity: 1,
    productDetails: {
      id: product.id,
      name: displayTitle,
      price: String(variantPrice),
      discount_price: variantDiscountPrice ? String(variantDiscountPrice) : null,
      is_discount: product.is_discount,
      main_image: mainImg,
      stock: currentStock,
    },
  };

  return (
    <div className="flex-grow w-full py-lg grid grid-cols-1 md:grid-cols-12 gap-lg lg:gap-2xl pb-24 md:pb-8">
      {/* Breadcrumbs */}
      <nav className="md:col-span-12 flex items-center gap-sm text-body-sm font-body-sm text-on-surface-variant">
        <Link to="/" className="hover:text-primary transition-colors">{t.favorites.breadcrumb}</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <Link to="/catalog" className="hover:text-primary transition-colors">{t.nav.catalog}</Link>
        {product.category && (
          <>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <Link to={`/catalog?category=${product.category.id}`} className="hover:text-primary transition-colors">
              {product.category.name}
            </Link>
          </>
        )}
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-on-surface line-clamp-1 max-w-[300px]">{displayTitle}</span>
      </nav>

      {/* Image Gallery */}
      <section className="md:col-span-6 lg:col-span-5 flex flex-col gap-md">
        <div
          className="aspect-square bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex items-center justify-center relative shadow-sm cursor-zoom-in group"
          onClick={() => {
            if (!mainImg) return;
            setLightboxStartIdx(variantGallery.length > 0 ? galleryIdx : activeImg);
            setLightboxOpen(true);
          }}
          title={t.product.zoomHint}
        >
          {mainImg ? (
            <img
              alt={product.name}
              className="w-full h-full object-contain p-lg transition-all duration-300 group-hover:scale-105"
              src={mainImg}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-6xl">image</span>
              <span className="text-body-sm">{t.product.noImage}</span>
            </div>
          )}
          {product.is_discount && product.discount_price && (
            <div className="absolute top-sm left-sm bg-tertiary-container text-on-tertiary-container text-xs font-bold px-2 py-1 rounded-full shadow">
              -{calcDiscount(product.price, product.discount_price)}%
            </div>
          )}
          {product.is_new && (
            <div className="absolute top-sm right-sm bg-primary-container text-on-primary-container text-xs font-bold px-2 py-1 rounded-full shadow">
              {t.product.isNew}
            </div>
          )}
          {mainImg && (
            <div className="absolute bottom-2 right-2 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <span className="material-symbols-outlined text-[18px]">zoom_in</span>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {variantGallery.length > 1 ? (
          <div className="flex gap-sm overflow-x-auto pb-1">
            {variantGallery.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setGalleryIdx(idx)}
                className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === galleryIdx ? 'border-primary shadow-md' : 'border-outline-variant hover:border-outline'
                }`}
              >
                <img alt="" className="w-full h-full object-contain p-1 bg-surface-bright" src={img.url} />
              </button>
            ))}
          </div>
        ) : images.length > 1 ? (
          <div className="flex gap-sm overflow-x-auto pb-1">
            {images.map((img, idx) => (
              <button
                key={img.id}
                onClick={() => setActiveImg(idx)}
                className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === activeImg ? 'border-primary shadow-md' : 'border-outline-variant hover:border-outline'
                }`}
              >
                <img alt="" className="w-full h-full object-contain p-1 bg-surface-bright" src={img.image} />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* Product Info */}
      <section className="md:col-span-6 lg:col-span-7 flex flex-col gap-lg">
        <div className="flex flex-col gap-sm">
          <div className="flex justify-between items-start gap-3">
            <h1 className="text-h2 font-h2 text-on-surface leading-tight transition-all duration-300">
              {displayTitle}
            </h1>
            <button
              onClick={handleToggleFavorite}
              aria-label="favorite"
              className={`transition-all duration-300 rounded-full p-2 backdrop-blur-sm active:scale-75 flex-shrink-0 mt-1 ${isFav ? 'text-red-500 scale-110 bg-red-50/50' : 'text-on-surface-variant hover:text-red-400 hover:scale-110 hover:bg-surface-container'}`}
            >
              <span className={`material-symbols-outlined text-2xl transition-colors ${isFav ? 'fill-icon' : ''}`}>favorite</span>
            </button>
          </div>

          {/* Stock badge */}
          <div className="flex items-center gap-3 flex-wrap">
            {currentStock > 0 ? (
              <span className="flex items-center gap-1 text-primary text-body-sm font-semibold">
                <span className="material-symbols-outlined text-[16px] fill-icon">check_circle</span>
                {t.product.variantInStock} ({currentStock} {t.product.pcs})
              </span>
            ) : (
              <span className="flex items-center gap-1 text-error text-body-sm font-semibold">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                {t.product.variantOutOfStock}
              </span>
            )}
            <span className="text-primary font-medium flex items-center gap-1 text-body-sm">
              <span className="material-symbols-outlined text-sm">local_shipping</span>
              {t.product.freeShipping}
            </span>
          </div>

          {/* Price */}
          <div className="mt-xs">
            {(() => {
              const hasVariantsOnPage = variants.length > 0;
              const showDiscount = variantDiscountPrice && variantDiscountPrice > 0 && variantDiscountPrice < variantPrice;
              const savings = showDiscount ? variantPrice - variantDiscountPrice! : 0;
              const discountPct = showDiscount ? Math.round(100 - (variantDiscountPrice! / variantPrice) * 100) : 0;

              return (
                <div key={`price-block-${currentVariant?.id}`} className="animate-in fade-in zoom-in-95 duration-200 space-y-1">
                  {hasVariantsOnPage && !currentVariant && (
                    <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                      {t.product.startingFrom}
                    </div>
                  )}
                  {isMaster && product.master_price ? (
                    // Usta narxi — faollikka qarab amaldagi foiz (variantlarga ham qo'llanadi).
                    // Foiz mahsulot darajasidagi master_price'dan olinadi va joriy
                    // (variant) narxga qo'llanadi — server bilan bir xil natija.
                    (() => {
                      const productEffective = product.is_discount && product.discount_price
                        ? Number(product.discount_price)
                        : Number(product.price);
                      const masterFactor = productEffective > 0
                        ? Number(product.master_price) / productEffective
                        : 1;
                      const masterEffective = showDiscount ? variantDiscountPrice! : variantPrice;
                      const masterCurrent = Math.round(masterEffective * masterFactor);
                      // 2 kasr xonagacha aniqlik (3.75% kabi proporsional foizlarni to'g'ri ko'rsatadi)
                      const masterPct = Math.round((1 - masterFactor) * 10000) / 100;
                      return (
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-h2 font-h2 text-primary">{formatPrice(masterCurrent)}</span>
                        <span className="text-body-lg text-on-surface-variant line-through">
                          {formatPrice(masterEffective)}
                        </span>
                        <span className="rounded-full bg-primary/15 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-bold">
                          USTA −{masterPct}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 w-fit">
                        <span className="material-symbols-outlined text-[15px] text-primary">construction</span>
                        <span className="text-xs font-semibold text-primary">
                          Usta chegirmasi: {formatPrice(masterEffective - masterCurrent)} tejaysiz
                        </span>
                      </div>
                    </div>
                      );
                    })()
                  ) : showDiscount ? (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-h2 font-h2 text-on-surface">{formatPrice(variantDiscountPrice!)}</span>
                      <span className="text-body-lg text-on-surface-variant line-through">{formatPrice(variantPrice)}</span>
                      <span className="rounded-full bg-tertiary-container px-2 py-0.5 text-xs font-bold text-on-tertiary-container">
                        -{discountPct}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-h2 font-h2 text-on-surface block">{formatPrice(variantPrice)}</span>
                  )}
                  {!isMaster && savings > 0 && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-tertiary-container/20 px-3 py-1.5 w-fit">
                      <span className="material-symbols-outlined text-[15px] text-tertiary">savings</span>
                      <span className="text-xs font-semibold text-tertiary">
                        {formatPrice(savings)} {t.product.youSave}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Variants */}
        {(colorOptions.length > 0 || sizeOptions.length > 0) && (
          <div className="flex flex-col gap-md border-t border-b border-outline-variant py-md">
            {colorOptions.length > 0 && (
              <div className="flex flex-col gap-sm">
                <span className="text-label-md font-label-md text-on-surface">
                  {t.product.color}: <span className="font-bold">{selectedColorVariant?.color || selectedColor}</span>
                </span>

                <div className="flex flex-wrap gap-sm">
                  {colorOptions.map((variant) => {
                    const active = variant.color === selectedColor;
                    const disabled = variant.stock <= 0;

                    return (
                      <button
                        key={variant.color}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedColor(variant.color)}
                        title={variant.color}
                        className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 bg-surface-container-lowest transition-all ${
                          active ? 'border-primary shadow-[0_0_0_3px_rgb(var(--color-primary)/0.18)]' : 'border-outline hover:border-primary/70'
                        } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                      >
                        <span
                          className="h-9 w-9 rounded-full border border-black/10 shadow-inner"
                          style={{ backgroundColor: resolveColorHex(variant) }}
                        />
                        {disabled && (
                          <span className="absolute inset-1 rounded-full bg-[linear-gradient(55deg,transparent_46%,rgb(var(--color-outline))_48%,rgb(var(--color-outline))_52%,transparent_54%)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {qualityOptions.length > 0 && (
              <div className="flex flex-col gap-sm">
                <span className="text-label-md font-label-md text-on-surface uppercase">{t.product.quality}</span>
                <div className="flex flex-wrap gap-sm">
                  {qualityOptions.map((variant) => {
                    const label = variant.quality || '';
                    const active = selectedQuality === label;
                    const disabled = variant.stock <= 0;
                    const qPrice = Number(variant.discount_price || variant.price || 0);

                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedQuality(label)}
                        className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 transition-all text-sm ${
                          active
                            ? 'border-primary bg-primary-container/15 text-primary shadow-sm'
                            : 'border-outline-variant bg-surface-bright text-on-surface hover:border-primary hover:text-primary'
                        } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                      >
                        <span className="font-label-md">{label}</span>
                        {qPrice > 0 && (
                          <span className={`text-[11px] font-semibold ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
                            {qPrice.toLocaleString('uz-UZ')} UZS
                          </span>
                        )}
                        {disabled && <span className="text-[10px] text-error">{t.product.outOfStock}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {sizeOptions.length > 0 && (
              <div className="flex flex-col gap-sm">
                <span className="text-label-md font-label-md text-on-surface uppercase">{t.product.sizeModel}</span>
                <div className="flex flex-wrap gap-sm">
                  {sizeOptions.map((variant) => {
                    const label = variant.size || variant.model;
                    const active = selectedSize === label;
                    const disabled = variant.stock <= 0;

                    return (
                    <button
                      key={label}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedSize(label)}
                      className={`px-4 py-2 rounded-md border transition-colors font-label-md text-label-md text-sm ${
                        active
                          ? 'border-primary bg-primary-container/15 text-primary'
                          : 'border-outline-variant bg-surface-bright text-on-surface hover:border-primary hover:text-primary'
                      } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                    >
                      {label}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-sm w-full">
          {cartQuantity > 0 && cartItem ? (
            <div className="flex-1 inline-flex h-[48px] items-center overflow-hidden rounded-lg border border-outline-variant bg-surface-bright shadow-sm">
              <button
                type="button"
                disabled={isUpdatingCartItem}
                onClick={() => {
                  if (cartQuantity === 1) {
                    removeItem(cartItem.id);
                    return;
                  }
                  updateItem(cartItem.id, cartQuantity - 1);
                }}
                className="flex h-full w-14 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={t.product.reduce}
              >
                <span className="material-symbols-outlined text-[20px]">remove</span>
              </button>
              <div className="flex h-full min-w-[76px] flex-1 items-center justify-center border-x border-outline-variant text-base font-semibold text-on-surface">
                {cartQuantity}
              </div>
              <button
                type="button"
                disabled={isUpdatingCartItem || isAtStockLimit}
                onClick={() => updateItem(cartItem.id, cartQuantity + 1)}
                className="flex h-full w-14 items-center justify-center text-primary transition-colors hover:bg-primary-container/20 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={t.product.increase}
                title={isAtStockLimit ? `${stockLimit} ${t.product.stockLimitPcs}` : undefined}
              >
                <span className={`material-symbols-outlined text-[20px] ${isUpdatingCartItem ? 'animate-spin' : ''}`}>
                  {isUpdatingCartItem ? 'progress_activity' : 'add'}
                </span>
              </button>
            </div>
          ) : (
            <button
              disabled={isOutOfStock || isAdding}
              onClick={() => addItem(addToCartPayload)}
              className="flex-1 bg-primary text-on-primary py-3 px-6 rounded-lg font-label-md text-label-md shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className={`material-symbols-outlined ${isAdding ? 'animate-spin' : ''}`}>
                {isAdding ? 'progress_activity' : 'shopping_cart'}
              </span>
              {isAdding ? t.product.adding : isOutOfStock ? t.product.outOfStock : t.product.addToCart}
            </button>
          )}
          <Link
            to="/checkout"
            className="flex-1 bg-secondary-container text-on-secondary-container py-3 px-6 rounded-lg font-label-md text-label-md shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">bolt</span>
            {t.product.quickOrder}
          </Link>
        </div>

        {/* Store Info */}
        <div className="bg-surface-container-low rounded-xl p-md border border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-md">
            <div className="w-12 h-12 bg-surface-container-lowest rounded-lg flex items-center justify-center border border-outline-variant shadow-sm">
              <span className="material-symbols-outlined text-primary text-2xl">storefront</span>
            </div>
            <div>
              <h3 className="text-body-md font-body-md text-on-surface font-semibold">{t.product.officialStore}</h3>
              <p className="text-body-sm font-body-sm text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary fill-icon">verified</span>
                {t.product.verifiedSeller}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-body-sm font-body-sm text-on-surface font-semibold">99.8%</div>
            <div className="text-body-sm font-body-sm text-on-surface-variant">{t.product.positiveRating}</div>
          </div>
        </div>

        {/* Moslik bo'limi */}
        {product.compatible_models?.length > 0 && (
          <CompatibilitySection groups={product.compatible_models} t={t} />
        )}
      </section>

      {/* Description */}
      {product.description && (
        <section className="md:col-span-12 mt-lg border-t border-outline-variant pt-lg">
          <h2 className="text-h3 font-h3 text-on-surface mb-md">{t.product.about}</h2>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
            <p className="text-body-md font-body-md text-on-surface-variant whitespace-pre-line leading-relaxed">
              {product.description}
            </p>
          </div>
        </section>
      )}

      {(isSimilarLoading || similarProducts.length > 0) && (
        <section className="md:col-span-12 mt-lg border-t border-outline-variant pt-lg">
          <div className="mb-md flex items-center justify-between gap-3">
            <h2 className="text-h3 font-h3 text-on-surface">{t.product.similar}</h2>
          </div>

          {isSimilarLoading ? (
            <div className="grid grid-cols-2 gap-md md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((item) => (
                <ProductSkeleton key={item} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-md md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {similarProducts.slice(0, 10).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          )}
        </section>
      )}

      {lightboxOpen && (
        <Lightbox
          images={
            variantGallery.length > 0
              ? variantGallery.map((i) => i.url)
              : images.map((i) => i.image)
          }
          initialIndex={lightboxStartIdx}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default ProductDetail;
