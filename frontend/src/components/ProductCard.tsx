import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { useAuthStore } from '../store/authStore';
import { toast } from '../utils/toast';
import { useTranslation } from '../i18n/useTranslation';

export interface Product {
  id: number | string;
  name: string;
  price: string | number;
  discount_price?: string | number | null;
  master_price?: string | number | null;
  is_discount?: boolean;
  // API returns main_image, but we also accept image for flexibility
  main_image?: string | null;
  image?: string | null;
  rating?: number;
  reviews?: number;
  is_new?: boolean;
  is_popular?: boolean;
  stock?: number;

  // ─── Variant-expanded card maydonlari (Amazon/Wildberries uslubi) ───────────
  // Backend `?expand_variants=true` bilan qaytaradi.
  // Variantsiz mahsulot uchun bu maydonlar mavjud emas / null.
  card_id?: string;                  // unikal React key (variantli: "1-3", oddiy: "1")
  variant_id?: number | null;        // null = base product (variantsiz)
  variant?: {
    color?: string | null;
    color_hex?: string | null;
    quality?: string | null;
    model?: string | null;
    size?: string | null;
  } | null;
}

interface ProductCardProps {
  product: Product;
  onAddToCart?: (id: string | number) => void;
  onToggleFavorite?: (id: string | number) => void;
  isFavorite?: boolean;
  layout?: 'grid' | 'list';
}

const NoImage = () => (
  <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant opacity-40">
    <span className="material-symbols-outlined text-4xl">image_not_supported</span>
  </div>
);

const ProductCard = ({ product, onToggleFavorite, isFavorite: propIsFavorite, layout = 'grid' }: ProductCardProps) => {
  const imageUrl = product.main_image || product.image || null;
  const { t } = useTranslation();
  const isMaster = useAuthStore(s => s.user?.is_master ?? false);

  // Variant-aware: bu karta variantli bo'lsa, savatda o'sha variantni qidiramiz.
  // Variantsiz karta (variant_id=null) → eski xulq (variantsiz cart item).
  const cardVariantId = product.variant_id ?? null;
  const cartItem = useCartStore((state) =>
    state.cart?.items.find(
      (item) =>
        item.product === Number(product.id) &&
        (item.variant ?? null) === cardVariantId
    ) || null
  );

  // Mahsulot batafsil sahifasiga URL — agar variant bo'lsa ?variant=ID qo'shamiz.
  // Buning sababi: ProductDetail sahifasi bu parametrni o'qib, aynan shu variantni
  // oldindan tanlangan holatda ko'rsatadi (foydalanuvchi qaysi variantni bosgan bo'lsa).
  const productLink = cardVariantId
    ? `/products/${product.id}?variant=${cardVariantId}`
    : `/products/${product.id}`;
  
  // Connect to favorites store
  const { toggleFavorite, isFavorite: checkFavorite } = useFavoritesStore();
  const isFav = propIsFavorite !== undefined ? propIsFavorite : checkFavorite(product.id);
  
  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Build the product snapshot for the store
    const productSnapshot = {
      id: product.id,
      name: product.name,
      price: product.price,
      discount_price: product.discount_price,
      is_discount: product.is_discount,
      main_image: imageUrl,
    };

    if (onToggleFavorite) {
      onToggleFavorite(product.id);
      return;
    }

    if (isFav) {
      toggleFavorite(productSnapshot);
      toast.undo(
        t.product.removedFromFavorites,
        () => { toggleFavorite(productSnapshot); },
        t.common.cancel
      );
    } else {
      toggleFavorite(productSnapshot);
      toast.success(t.product.addedToFavorites);
    }
  };

  const { addItem, updateItem, removeItem, addingId, updatingItemIds } = useCartStore();
  // Eslatma: addingId faqat product_id ni ushlaydi (variant'ga moslashtirilmagan).
  // Bu — har variant kartasi alohida bo'lsa ham — bitta mahsulotning HAR variantida
  // "yuklanmoqda" holati ko'rinadi. Bu juda kichik UX kompromiss (1-2 soniya).
  // To'liq alohida holat uchun cartStore'da addingKey: `${productId}-${variantId}`
  // kerak bo'lardi, lekin bu hozircha qabul qilinarli.
  const isAdding = addingId === Number(product.id);
  const quantity = cartItem?.quantity || 0;
  const stockLimitRaw = product.stock ?? cartItem?.product_details?.stock;
  const stockLimit = stockLimitRaw === undefined || stockLimitRaw === null ? null : Number(stockLimitRaw);
  const hasStockLimit = stockLimit !== null && Number.isFinite(stockLimit);
  const isOutOfStock = hasStockLimit && stockLimit <= 0;
  const isAtStockLimit = hasStockLimit && quantity >= stockLimit;
  const isUpdating = Boolean(cartItem && updatingItemIds[String(cartItem.id)]);
  const addPayload = {
    productId: Number(product.id),
    // Variant ID — agar bu variant kartasi bo'lsa, savatga aynan shu variant qo'shiladi.
    // Bu Amazon/Wildberries uslubidagi yondashuv: foydalanuvchi qaysi variantni
    // ko'rib turibdi, savatga ham SHU variant tushadi (aralashtirish yo'q).
    variantId: cardVariantId ?? undefined,
    productDetails: {
      id: Number(product.id),
      name: product.name,
      price: String(product.price),
      discount_price: product.discount_price !== undefined && product.discount_price !== null ? String(product.discount_price) : null,
      is_discount: Boolean(product.is_discount),
      main_image: imageUrl,
      stock: product.stock,
    },
  };

  const formatPrice = (price: string | number) => {
    return Number(price).toLocaleString('uz-UZ') + ' UZS';
  };

  const calculateDiscountPercent = () => {
    if (!product.is_discount || !product.discount_price) return 0;
    const p = Number(product.price);
    const d = Number(product.discount_price);
    return Math.round(((p - d) / p) * 100);
  };

  const displayPrice = product.is_discount && product.discount_price
    ? product.discount_price
    : product.price;

  const QuantityControl = ({ compact = false }: { compact?: boolean }) =>
    quantity > 0 ? (
      <div className={`inline-flex items-center overflow-hidden rounded-lg border border-outline-variant bg-surface-bright ${compact ? 'h-9' : 'h-11'} w-full`}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!cartItem) return;
            if (quantity === 1) {
              removeItem(cartItem.id);
              return;
            }
            updateItem(cartItem.id, quantity - 1);
          }}
          className="flex h-full w-10 items-center justify-center text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          aria-label={t.cart.decrease}
        >
          <span className="material-symbols-outlined text-[18px]">remove</span>
        </button>
        <div className="flex min-w-[44px] flex-1 items-center justify-center border-x border-outline-variant text-sm font-semibold text-on-surface">
          {quantity}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (cartItem) {
              if (isAtStockLimit) {
                toast.error(`Omborda ${stockLimit} dona mavjud.`);
                return;
              }
              updateItem(cartItem.id, quantity + 1);
            } else {
              addItem(addPayload);
            }
          }}
          disabled={isUpdating || isAtStockLimit}
          className="flex h-full w-10 items-center justify-center text-primary transition-colors hover:bg-primary-container/20 disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t.cart.increase}
        >
          <span className={`material-symbols-outlined text-[18px] ${isUpdating ? 'animate-spin' : ''}`}>
            {isUpdating ? 'progress_activity' : 'add'}
          </span>
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isOutOfStock) {
            toast.error(t.product.outOfStock);
            return;
          }
          addItem(addPayload);
        }}
        disabled={isAdding || isOutOfStock}
        className={`flex w-full items-center justify-center gap-2 rounded-lg bg-primary text-on-primary transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 ${compact ? 'py-2' : 'py-2.5'}`}
      >
        <span className={`material-symbols-outlined text-[18px] ${isAdding ? 'animate-spin' : ''}`}>
          {isAdding ? 'progress_activity' : 'shopping_cart'}
        </span>
        <span className="text-label-md font-label-md">
          {isAdding ? t.product.addedToCart : isOutOfStock ? t.product.outOfStock : t.product.addToCart}
        </span>
      </button>
    );

  if (layout === 'list') {
    return (
      <article className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 flex gap-4 items-center hover:border-primary/45 hover:bg-primary-container/5 hover:shadow-sm dark:hover:border-outline dark:hover:bg-surface-container-high transition-all cursor-pointer">
        <div className="w-24 h-24 bg-surface-bright rounded border border-outline-variant p-2 flex-shrink-0 relative overflow-hidden">
          {imageUrl ? (
            <img alt={product.name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" src={imageUrl} loading="lazy" />
          ) : <NoImage />}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-surface/60 backdrop-blur-[1px] flex items-center justify-center z-10">
              <span className="bg-error text-on-error px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm text-center leading-none">
                {t.product.outOfStock}
              </span>
            </div>
          )}
          {product.is_discount && (
            <span className="absolute top-1 left-1 bg-secondary-container text-on-secondary-container px-1 rounded text-[9px] font-bold tracking-wide">
              -{calculateDiscountPercent()}%
            </span>
          )}
        </div>
        <div className="flex-grow">
          <Link to={productLink} className="text-body-sm font-body-sm text-on-surface line-clamp-2 mb-1 hover:text-primary transition-colors block">
            {product.name}
          </Link>
          {isMaster && product.master_price ? (
            <div className="flex items-center gap-1.5 mb-2">
              <div className="text-price font-price text-primary text-[16px]">
                {formatPrice(product.master_price)}
              </div>
              <span className="text-[9px] font-bold bg-primary/15 text-primary rounded-full px-1.5 py-0.5 leading-none">
                USTA
              </span>
            </div>
          ) : (
            <div className="text-price font-price text-primary text-[16px] mb-2">
              {formatPrice(displayPrice)}
            </div>
          )}
          <div className="max-w-[180px]">
            <QuantityControl compact />
          </div>
        </div>
      </article>
    );
  }

  // Default Grid Layout
  return (
    <article className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden flex flex-col shadow-sm hover:-translate-y-1 hover:border-primary/45 hover:bg-primary-container/5 hover:shadow-[0_10px_26px_rgba(30,41,59,0.14)] dark:hover:border-outline dark:hover:bg-surface-container-high dark:hover:shadow-[0_14px_34px_rgba(0,0,0,0.34)] transition-all duration-300 group">
      <Link to={productLink} className="relative aspect-square bg-surface-bright block overflow-hidden">
        <div className="w-full h-full p-4 flex items-center justify-center">
          {imageUrl ? (
            <img
              alt={product.name}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
              src={imageUrl}
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : <NoImage />}
        </div>

        {isOutOfStock && (
          <div className="absolute inset-0 bg-surface/50 backdrop-blur-[2px] flex items-center justify-center z-10">
            <span className="bg-error text-on-error px-3 py-1.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">cancel</span>
              {t.product.outOfStock}
            </span>
          </div>
        )}

        {/* Discount badge */}
        {product.is_discount && calculateDiscountPercent() > 0 && (
          <span className="absolute top-2 left-2 bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full text-[11px] font-bold shadow-sm">
            -{calculateDiscountPercent()}%
          </span>
        )}

        {/* New badge */}
        {product.is_new && !product.is_discount && (
          <span className="absolute top-2 left-2 bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full text-[11px] font-bold shadow-sm">
            {t.product.isNew}
          </span>
        )}

        {/* Favorite button */}
        <button
          onClick={handleToggleFavorite}
          className={`absolute top-2 right-2 transition-all duration-300 bg-surface-container-lowest/85 rounded-full p-1.5 backdrop-blur-sm shadow-sm active:scale-75 ${isFav ? 'text-red-500 scale-110' : 'text-outline hover:text-red-400 hover:scale-110'}`}
        >
          <span className={`material-symbols-outlined text-[20px] transition-colors ${isFav ? 'fill-icon' : ''}`}>favorite</span>
        </button>
      </Link>

      <div className="p-md flex flex-col flex-grow">
        <Link to={productLink}>
          <h3 className="text-body-sm font-body-sm text-on-surface line-clamp-2 mb-xs min-h-[40px] hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Stars (mock) */}
        <div className="flex items-center text-secondary-container mb-sm gap-0.5">
          {[1,2,3,4,5].map(i => (
            <span key={i} className="material-symbols-outlined text-[13px] fill-icon">star</span>
          ))}
          <span className="text-[11px] text-outline ml-1">({product.reviews || 0})</span>
        </div>

        <div className="mt-auto">
          {isMaster && product.master_price ? (
            <>
              {/* Crossed-out effective price (discount or regular) */}
              <div className="text-body-sm font-body-sm text-outline line-through mb-[-2px]">
                {formatPrice(product.is_discount && product.discount_price ? product.discount_price : product.price)}
              </div>
              {/* Master price */}
              <div className="flex items-center gap-1.5 mb-md">
                <div className="text-price font-price text-primary">
                  {formatPrice(product.master_price)}
                </div>
                <span className="text-[9px] font-bold bg-primary/15 text-primary rounded-full px-1.5 py-0.5 leading-none">
                  USTA
                </span>
              </div>
            </>
          ) : product.is_discount && product.discount_price ? (
            <>
              <div className="text-body-sm font-body-sm text-outline line-through mb-[-2px]">
                {formatPrice(product.price)}
              </div>
              <div className="text-price font-price text-secondary-container mb-md">
                {formatPrice(product.discount_price)}
              </div>
            </>
          ) : (
            <div className="text-price font-price text-primary mb-md mt-[22px]">
              {formatPrice(product.price)}
            </div>
          )}
          <QuantityControl />
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
