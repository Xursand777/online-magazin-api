import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import type { CartItem } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '../i18n/useTranslation';

const formatPrice = (v: string | number) =>
  Number(v).toLocaleString('uz-UZ') + ' UZS';

const CartItemRow = ({ item }: { item: CartItem }) => {
  const { updateItem, removeItem } = useCartStore();
  const { t } = useTranslation();
  const isMaster = useAuthStore((s) => !!s.user?.is_master);
  const imgSrc = item.product_details?.main_image;
  // Oddiy (retail) narx — variant chegirma/narxi, bo'lmasa mahsulot.
  const retailPrice =
    item.variant_details?.discount_price && Number(item.variant_details.discount_price) > 0
      ? Number(item.variant_details.discount_price)
      : item.variant_details?.price && Number(item.variant_details.price) > 0
        ? Number(item.variant_details.price)
      : item.product_details?.is_discount && item.product_details?.discount_price
        ? Number(item.product_details.discount_price)
        : Number(item.product_details?.price || 0);
  // Usta narxi — variant'niki ustun, bo'lmasa mahsulot darajasi. FAQAT usta
  // foydalanuvchiga va master_price > 0 bo'lganda. Bu savat "Jami"si (backend
  // total_price) bilan AYNAN mos bo'lishini ta'minlaydi (homedagi kabi).
  const masterRaw = item.variant_details?.master_price ?? item.product_details?.master_price;
  const masterPrice = isMaster && masterRaw != null && Number(masterRaw) > 0 ? Number(masterRaw) : null;
  const price = masterPrice ?? retailPrice;
  const total = price * item.quantity;
  const showMaster = masterPrice != null && masterPrice < retailPrice;

  return (
    <div className="bg-surface-container-lowest p-md rounded-xl border border-outline-variant flex flex-col sm:flex-row gap-md shadow-sm hover:shadow-md transition-shadow">
      {/* Image */}
      <Link to={`/products/${item.product}`} className="w-full sm:w-28 h-28 flex-shrink-0 bg-surface-bright rounded-lg overflow-hidden border border-outline-variant flex items-center justify-center">
        {imgSrc ? (
          <img alt={item.product_details?.name} className="w-full h-full object-contain p-2" src={imgSrc} />
        ) : (
          <span className="material-symbols-outlined text-3xl text-outline">image_not_supported</span>
        )}
      </Link>

      {/* Info */}
      <div className="flex-grow flex flex-col justify-between">
        <div className="flex justify-between items-start gap-2">
          <div>
            <Link to={`/products/${item.product}`} className="font-body-md text-body-md text-on-surface hover:text-primary transition-colors line-clamp-2">
              {item.product_details?.name}
            </Link>
            {item.variant_details && (
              <p className="font-body-sm text-body-sm text-outline mt-xs">
                {[item.variant_details.color, item.variant_details.quality, item.variant_details.size, item.variant_details.model]
                  .filter(Boolean)
                  .join(' | ')}
              </p>
            )}
          </div>
          <button
            onClick={() => removeItem(item.id)}
            aria-label={t.cart.delete}
            className="text-outline hover:text-error transition-colors p-1 flex-shrink-0 rounded hover:bg-error-container/20"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>

        <div className="flex justify-between items-center mt-md">
          {/* Quantity controls */}
          <div className="flex items-center border border-outline-variant rounded-lg bg-surface-bright overflow-hidden">
            <button
              onClick={() => updateItem(item.id, item.quantity - 1)}
              className="px-3 py-1.5 text-on-surface-variant hover:bg-surface-container-low transition-colors"
              aria-label={t.cart.decrease}
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
            </button>
            <span className="px-4 py-1.5 font-body-md text-body-md border-x border-outline-variant min-w-[40px] text-center">
              {item.quantity}
            </span>
            <button
              onClick={() => updateItem(item.id, item.quantity + 1)}
              className="px-3 py-1.5 text-on-surface-variant hover:bg-surface-container-low transition-colors"
              aria-label={t.cart.increase}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
          </div>

          {/* Price */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              {showMaster && (
                <span className="text-[9px] font-bold bg-primary/15 text-primary rounded-full px-1.5 py-0.5 leading-none">
                  USTA
                </span>
              )}
              <div className="font-price text-price text-on-background">{formatPrice(total)}</div>
            </div>
            {showMaster && (
              <div className="font-body-sm text-body-sm text-outline line-through">
                {formatPrice(retailPrice * item.quantity)}
              </div>
            )}
            {item.quantity > 1 && (
              <div className="font-body-sm text-body-sm text-outline">{formatPrice(price)} × {item.quantity}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Cart = () => {
  const { cart, loading, fetchCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const [initialized, setInitialized] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    setInitialized(false);
    fetchCart().finally(() => {
      if (active) setInitialized(true);
    });
    return () => {
      active = false;
    };
  }, [fetchCart]);

  const items = cart?.items || [];
  const totalPrice = Number(cart?.total_price || 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  if (!initialized || loading) {
    return (
      <div className="flex-grow w-full py-lg flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
        <p className="text-on-surface-variant">{t.cart.loading}</p>
      </div>
    );
  }

    // Empty cart state
  if (!loading && items.length === 0) {
    return (
      <div className="flex-grow w-full py-lg flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-28 h-28 rounded-full bg-surface-container flex items-center justify-center shadow-inner">
          <span className="material-symbols-outlined text-6xl text-outline">shopping_cart</span>
        </div>
        <div className="text-center">
          <h2 className="font-h2 text-h2 text-on-surface mb-3">{t.cart.empty}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mx-auto leading-relaxed">
            {t.cart.emptyDesc}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <Link to="/" className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-8 py-3.5 rounded-[12px] font-semibold transition-colors shadow-sm text-[15px]">
            {t.cart.goHome}
          </Link>
          {!isAuthenticated && (
            <Link to="/auth?redirect=/checkout" className="border border-outline-variant text-on-surface px-6 py-3 rounded-[12px] font-semibold hover:bg-surface-container transition-colors text-[15px]">
              {t.nav.login}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow w-full py-lg pb-28 md:pb-lg">
      <div className="mb-lg">
        <h1 className="font-h1 text-h1 text-on-background flex items-center gap-3">
          {t.cart.title}
          {itemCount > 0 && (
            <span className="bg-primary-container text-on-primary-container text-base font-semibold px-3 py-1 rounded-full">
              {itemCount} {t.cart.items}
            </span>
          )}
        </h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-lg items-start">
          {/* Left: Cart Items */}
          <div className="w-full lg:flex-1 flex flex-col gap-md">
            {items.map(item => (
              <CartItemRow key={item.id} item={item} />
            ))}
          </div>

          {/* Right: Order Summary */}
          <div className="w-full lg:w-96 flex-shrink-0 lg:sticky lg:top-24">
            <div className="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant shadow-sm">
              <h2 className="font-h3 text-h3 text-on-background mb-lg">{t.cart.orderSummary}</h2>
              <div className="flex flex-col gap-md mb-lg">
                <div className="flex justify-between items-center font-body-md text-body-md">
                  <span className="text-on-surface-variant">{t.cart.products} ({itemCount}):</span>
                  <span className="text-on-background">{formatPrice(totalPrice)}</span>
                </div>
                <div className="flex justify-between items-center font-body-md text-body-md">
                  <span className="text-on-surface-variant">{t.cart.delivery}:</span>
                  <span className="text-primary font-medium">{t.cart.free}</span>
                </div>
              </div>

              <div className="border-t border-outline-variant pt-md mb-lg">
                <div className="flex justify-between items-end">
                  <span className="font-body-lg text-on-background">{t.cart.total}:</span>
                  <span className="font-price text-h2 text-on-background">{formatPrice(totalPrice)}</span>
                </div>
              </div>

              {isAuthenticated ? (
                <Link
                  to="/checkout"
                  className="w-full bg-secondary-container text-on-secondary-container font-label-md text-label-md py-3 rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center gap-2 uppercase tracking-wide"
                >
                  {t.cart.checkout}
                  <span className="material-symbols-outlined">arrow_forward</span>
                </Link>
              ) : (
                <Link
                  to="/auth?redirect=/checkout"
                  className="w-full bg-primary text-on-primary font-label-md text-label-md py-3 rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center gap-2"
                >
                  <span className="material-symbols-outlined">login</span>
                  {t.cart.loginCheckout}
                </Link>
              )}

              <div className="mt-md flex items-center justify-center gap-2 text-outline font-body-sm text-body-sm">
                <span className="material-symbols-outlined text-[16px]">verified_user</span>
                {isAuthenticated ? t.cart.securePayment : t.cart.cartSaved}
              </div>
            </div>
          </div>
      </div>
    </div>
  );
};

export default Cart;
