import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { createOrderFromCart, generateIdempotencyKey, getCreditStatus, getProfile } from '../api/endpoints';
import { toast } from '../utils/toast';
import { useTranslation } from '../i18n/useTranslation';
import AddressPicker from '../components/AddressPicker';
import { formatStructuredAddress, parseStructuredAddress, type StructuredAddress } from '../utils/address';

const formatPrice = (v: string | number) =>
  Number(v).toLocaleString('uz-UZ') + ' UZS';

const getCheckoutErrorMessage = (err: any, fallback: string) => {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data.error === 'string') return data.error;
  if (Array.isArray(data.error)) return data.error.join(' ');

  const firstValue = Object.values(data)[0];
  if (Array.isArray(firstValue)) return String(firstValue[0]);
  if (typeof firstValue === 'string') return firstValue;

  return fallback;
};

interface CreditStatus {
  credit_ban: boolean;
  overdue_credit_count: number;
  has_unpaid_credit: boolean;
  unpaid_credit_order_id: number | null;
  unpaid_credit_due_date: string | null;
  is_overdue: boolean;
}

const Checkout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cart, fetchCart, loading: cartLoading } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();
  // Muddatli to'lov — FAQAT ustalar uchun. Backend authoritative tarzda
  // blocklaydi; bu yerda UX gating (option umuman ko'rinmaydi).
  // App.tsx page load'da is_master va can_use_credit'ni server'dan
  // sinxronlashtiradi -> bu shartlar har doim freshtek.
  const canUseCredit = !!(user?.can_use_credit ?? user?.is_master);
  const [loading, setLoading] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);

  // ── IDEMPOTENCY KEY (slow internet himoyasi) ─────────────────────────────
  // Foydalanuvchi "Buyurtma berish" tugmasini bosgan paytda UUID generatsiya
  // qilinadi va ref'da saqlanadi. Slow internet timeout sodir bo'lsa,
  // qayta urinishda XUDDI SHU UUID ishlatiladi → backend ESKI buyurtmani
  // qaytaradi, yangi yaratmaydi.
  //
  // Muvaffaqiyatli buyurtmadan keyin ref tozalanmaydi (sahifa /profile'ga
  // navigate bo'ladi). Agar foydalanuvchi back tugmasi bilan qaytib kelib
  // yangi buyurtma bersa, useEffect cleanup yo'q — lekin biz handleSubmit
  // boshida YANGI key generatsiya qilamiz (faqat agar oldingisi yo'q bo'lsa).
  const idempotencyKeyRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    receiver_name: '',
    receiver_phone: '',
    delivery_address: '',
    payment_method: 'cash' as 'cash' | 'card' | 'credit',
    credit_days: 10,
  });

  // ── STRUKTURALANGAN MANZIL — AddressPicker bilan sinxron ────────────────
  // Profile.delivery_address backend'dan string sifatida keladi. Uni 4 ta
  // strukturalangan maydonga ajratib, AddressPicker'ga uzatamiz. Foydalanuvchi
  // o'zgartirsa (input typing yoki xarita/geolokatsiya), structured + full
  // qaytadi va formData.delivery_address yangilanadi.
  //
  // AVTOMAT TO'LDIRISH:
  //   1. Sahifa ochiladi → getProfile() chaqiriladi
  //   2. profile.delivery_address (eski saqlangan) formData.delivery_address ga keladi
  //   3. structuredAddress useEffect orqali parse qilinadi va inputlarga to'ldiriladi
  //   4. Foydalanuvchi tahrir qilmasdan tugatishi mumkin — eski manzil ishlatiladi
  const [structuredAddress, setStructuredAddress] = useState<StructuredAddress>(() =>
    parseStructuredAddress(''),
  );

  // Profile'dan delivery_address kelgan vaqtda structured'ni ham yangilash
  useEffect(() => {
    const parsed = parseStructuredAddress(formData.delivery_address);
    const currentFull = formatStructuredAddress(structuredAddress);
    if (formData.delivery_address && formData.delivery_address !== currentFull) {
      setStructuredAddress(parsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.delivery_address]);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error(t.checkout.loginRequired);
      navigate('/auth?redirect=/checkout', { replace: true });
      return;
    }

    let active = true;
    setCartReady(false);

    fetchCart().finally(() => {
      if (active) setCartReady(true);
    });

    getProfile()
      .then((res) => {
        const p = res.data;
        setFormData((prev) => ({
          ...prev,
          receiver_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || prev.receiver_name,
          receiver_phone: p.phone || prev.receiver_phone,
          delivery_address: p.delivery_address || prev.delivery_address,
        }));
      })
      .catch(() => {});

    getCreditStatus()
      .then((res) => setCreditStatus(res.data))
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [fetchCart, isAuthenticated, navigate]);

  // Defensive: agar user usta emas, lekin payment_method 'credit'da turibsa
  // (masalan user master edi, keyin admin uni o'chirib qo'ydi va sahifa
  // refresh qilingan), avtomat 'cash'ga qaytaramiz.
  useEffect(() => {
    if (!canUseCredit && formData.payment_method === 'credit') {
      setFormData((prev) => ({ ...prev, payment_method: 'cash' }));
    }
  }, [canUseCredit, formData.payment_method]);

  const items = cart?.items || [];
  const itemsTotalPrice = Number(cart?.total_price || 0);
  const deliveryCost = itemsTotalPrice > 500_000 ? 0 : 30_000;
  const finalPrice = itemsTotalPrice + deliveryCost;

  if (!isAuthenticated) {
    return null;
  }

  if (!cartReady || cartLoading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 gap-4">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
        <p className="text-on-surface-variant">{t.checkout.loading}</p>
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 gap-4">
        <span className="material-symbols-outlined text-6xl text-outline">shopping_cart_off</span>
        <h2 className="text-h2 font-h2">{t.cart.empty}</h2>
        <p className="text-on-surface-variant">{t.cart.emptyDesc}</p>
        <Link to="/" className="text-primary hover:underline font-medium">{t.nav.home}</Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── ULTRA-SECURE: telefon ALWAYS user.phone'dan olinadi.
    // Frontend formData.receiver_phone backend tomondan e'tiborga olinmaydi,
    // lekin biz UI tutarli bo'lishi uchun bu yerda ham user.phone'ni
    // ishlatamiz.
    const authoritativePhone = user?.phone || '';

    if (!formData.receiver_name || !authoritativePhone || !formData.delivery_address) {
      toast.error(t.checkout.allFieldsRequired);
      return;
    }

    // Manzil strukturalangan — kamida viloyat + tuman/shahar + uy/ko'cha
    // bo'lishi shart. AddressPicker'da required=true bo'lsa-da, qo'shimcha
    // himoya: foydalanuvchi inputlarni bo'shatib qoldirgan bo'lsa.
    if (!structuredAddress.viloyat.trim() || !structuredAddress.tumanShahar.trim() || !structuredAddress.domUy.trim()) {
      toast.error(t.checkout.allFieldsRequired);
      return;
    }

    const phoneRegex = /^\+998(33|88|90|91|93|94|95|97|98|99)\d{7}$/;
    if (!phoneRegex.test(authoritativePhone)) {
      toast.error("Ro'yxatdan o'tgan telefon raqamingiz noto'g'ri formatda. Profilingizni yangilang.");
      return;
    }

    if (formData.payment_method === 'credit') {
      if (creditStatus?.credit_ban) {
        toast.error(t.checkout.creditBanToast);
        return;
      }
      if (creditStatus?.has_unpaid_credit) {
        toast.error(t.checkout.unpaidCreditToast);
        return;
      }
    }

    // ⚠ DEFENSIVE NORMALIZATION (Phase 3.0)
    // Foydalanuvchi usta emas, lekin formData.payment_method='credit' bo'lsa
    // (stale localStorage, useEffect race condition, yoki React state buzilishi),
    // kuch bilan 'cash'ga aylantirib yuboramiz. Bu backend master_required
    // xatosini OLDIN-OLDIN to'xtatadi — foydalanuvchi qayta urinmaydi.
    const safePaymentMethod =
      !canUseCredit && formData.payment_method === 'credit'
        ? 'cash'
        : formData.payment_method;

    const payload: Record<string, unknown> = {
      ...formData,
      receiver_phone: authoritativePhone,   // backend baribir user.phone'ga almashtiradi
      payment_method: safePaymentMethod,
    };
    if (safePaymentMethod !== 'credit') {
      delete payload.credit_days;
    }

    // Idempotency key: birinchi marta bosishda generatsiya, qayta urinishlarda
    // o'sha kalit ishlatiladi. Bu slow internet timeout'da takroriy buyurtmani
    // oldini oladi (backend cached response qaytaradi).
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
    const idemKey = idempotencyKeyRef.current;

    setLoading(true);
    try {
      const res = await createOrderFromCart(payload, idemKey);
      // Muvaffaqiyatli — keyingi yangi buyurtma uchun key tozalanadi
      idempotencyKeyRef.current = null;
      toast.success(t.checkout.orderSuccess);
      await useCartStore.getState().fetchCart();
      navigate(`/profile`, { state: { newOrderId: res.data.id } });
    } catch (err: any) {
      // 409 Conflict (idempotency_in_progress) bo'lsa — boshqa so'rov
      // ishlamoqda, biroz kutib qayta urinish kerak. Key tozalanmaydi.
      const code = err?.response?.data?.code;
      const status = err?.response?.status;
      if (status === 409 && code === 'idempotency_in_progress') {
        toast.error("So'rov ishlamoqda. Bir necha soniyada qayta urinib ko'ring.");
      } else {
        // Boshqa xato — keyingi urinishda YANGI key (forma o'zgargan bo'lishi
        // mumkin: validatsiya xato bo'lib qolgan field tuzatildi).
        idempotencyKeyRef.current = null;
        toast.error(getCheckoutErrorMessage(err, t.checkout.orderError));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow w-full py-lg pb-3xl">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1 text-on-surface">{t.checkout.title}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-sm">{t.checkout.deliveryAddress}</p>
      </header>
      
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-lg lg:gap-xl">
        {/* Left Column: Forms */}
        <div className="lg:col-span-8 flex flex-col gap-lg">
          {/* 1. Delivery Information */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
            <h2 className="font-h3 text-h3 text-on-surface mb-md border-b border-outline-variant pb-sm">{t.checkout.deliveryAddress}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-md">
              <div className="flex flex-col md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface-variant mb-xs" htmlFor="receiver_name">{t.checkout.receiverName} *</label>
                <input 
                  className="border border-outline-variant rounded-lg px-sm py-sm focus:ring-primary focus:border-primary bg-surface-bright outline-none" 
                  id="receiver_name" 
                  placeholder="Eshmatov Toshmat" 
                  required
                  type="text"
                  value={formData.receiver_name}
                  onChange={(e) => setFormData({...formData, receiver_name: e.target.value})}
                />
              </div>
              <div className="flex flex-col md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface-variant mb-xs flex items-center gap-xs" htmlFor="receiver_phone">
                  {t.checkout.receiverPhone} *
                  <span className="material-symbols-outlined text-[16px] text-primary" title="Ro'yxatdan o'tgan telefon raqami — xavfsizlik uchun o'zgartirib bo'lmaydi">lock</span>
                </label>
                <input
                  className="border border-outline-variant rounded-lg px-sm py-sm bg-surface-container outline-none cursor-not-allowed text-on-surface-variant"
                  id="receiver_phone"
                  type="tel"
                  value={user?.phone || formData.receiver_phone}
                  readOnly
                  disabled
                  aria-readonly="true"
                  title="Ro'yxatdan o'tgan telefon raqami — xavfsizlik uchun o'zgartirib bo'lmaydi"
                />
                <p className="text-xs text-on-surface-variant mt-xs flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  Ro'yxatdan o'tgan raqamingiz. Xavfsizlik uchun o'zgartirib bo'lmaydi.
                </p>
              </div>
            </div>
            
            {/* ── YETKAZIB BERISH MANZILI — AddressPicker ────────────────────
                Profile sahifasi bilan IDENTIK komponent. Foydalanuvchi:
                  • 4 ta strukturalangan maydon (viloyat, tuman, mahalla, uy)
                  • "Kartadan tanlash" — Leaflet xarita orqali
                  • "Joylashuvni aniqlash" — GPS + permission modal

                AVVAL SAQLANGAN MANZIL AUTO-FILL:
                  Profile.delivery_address eski saqlangan bo'lsa, getProfile()
                  yuqorida formData.delivery_address ga yozadi va structuredAddress
                  useEffect orqali avtomat to'ldiriladi. Foydalanuvchi qayta
                  yozish/tanlashga majbur emas — eski manzil tayyor turadi.

                Manzil o'zgarganda formData.delivery_address ham yangilanadi
                (string format) — bu handleSubmit ga jo'natiladi. */}
            <div className="mb-md">
              <AddressPicker
                value={structuredAddress}
                onChange={({ structured, full }) => {
                  setStructuredAddress(structured);
                  setFormData((prev) => ({ ...prev, delivery_address: full }));
                }}
                required={true}
                showHeading={false}
                accentColor="#22c55e"
              />
            </div>
          </section>

          {/* 2. Payment Methods */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
            <h2 className="font-h3 text-h3 text-on-surface mb-md border-b border-outline-variant pb-sm">{t.checkout.paymentMethod}</h2>

            {/* Muddatli to'lov ogohlantirishlari — faqat ustalar uchun
                (oddiy mijozlar kreditni umuman ko'rmaydi) */}
            {canUseCredit && creditStatus?.credit_ban && (
              <div className="mb-md p-md rounded-xl border border-error bg-error-container/30 flex items-start gap-sm">
                <span className="material-symbols-outlined text-error text-[22px] mt-0.5">block</span>
                <div>
                  <p className="font-label-md text-error font-semibold">{t.checkout.creditBanTitle}</p>
                  <p className="text-xs text-on-surface-variant mt-xs">
                    {t.checkout.creditBanDesc}
                  </p>
                </div>
              </div>
            )}
            {canUseCredit && !creditStatus?.credit_ban && creditStatus?.has_unpaid_credit && (
              <div className="mb-md p-md rounded-xl border flex items-start gap-sm" style={{borderColor:'#f59e0b', background:'#fef3c720'}}>
                <span className="material-symbols-outlined text-[22px] mt-0.5" style={{color:'#d97706'}}>warning</span>
                <div>
                  <p className="font-label-md font-semibold" style={{color:'#92400e'}}>
                    {t.checkout.unpaidCreditPrefix} (#{creditStatus.unpaid_credit_order_id})
                  </p>
                  <p className="text-xs text-on-surface-variant mt-xs">
                    {t.checkout.dueDateLabel} <strong>{creditStatus.unpaid_credit_due_date}</strong>.
                    {creditStatus.is_overdue && (
                      <span className="text-error ml-1 font-semibold">{t.checkout.overdueTag}</span>
                    )}
                    {' '}{t.checkout.cannotOrder}
                  </p>
                </div>
              </div>
            )}
            {canUseCredit && !creditStatus?.credit_ban && !creditStatus?.has_unpaid_credit && (creditStatus?.overdue_credit_count ?? 0) > 0 && (
              <div className="mb-md p-md rounded-xl border flex items-start gap-sm" style={{borderColor:'#f59e0b', background:'#fef3c720'}}>
                <span className="material-symbols-outlined text-[20px] mt-0.5" style={{color:'#d97706'}}>info</span>
                <p className="text-xs text-on-surface-variant">
                  {creditStatus!.overdue_credit_count} {t.checkout.overdueCountWarning}{' '}
                  {t.checkout.overdueCountBlock}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  name="payment"
                  type="radio"
                  checked={formData.payment_method === 'cash'}
                  onChange={() => setFormData({...formData, payment_method: 'cash'})}
                />
                <div className="border-2 border-outline-variant rounded-xl p-md flex flex-col items-center text-center gap-sm peer-checked:border-primary peer-checked:bg-primary-container/10 transition-all h-full">
                  <span className="material-symbols-outlined text-on-surface-variant text-[32px]">payments</span>
                  <span className="font-label-md text-label-md text-on-surface">{t.checkout.cash}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">{t.checkout.cash}</span>
                </div>
              </label>

              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  name="payment"
                  type="radio"
                  checked={formData.payment_method === 'card'}
                  onChange={() => setFormData({...formData, payment_method: 'card'})}
                />
                <div className="border-2 border-outline-variant rounded-xl p-md flex flex-col items-center text-center gap-sm peer-checked:border-primary peer-checked:bg-primary-container/10 transition-all h-full">
                  <span className="material-symbols-outlined text-on-surface-variant text-[32px]">credit_card</span>
                  <span className="font-label-md text-label-md text-on-surface">{t.checkout.card}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">Click / Payme ({t.checkout.comingSoon})</span>
                </div>
              </label>

              {/* Muddatli to'lov — FAQAT ustalar uchun ko'rinadi (is_master=true).
                  Backend ham authoritative tarzda blocklaydi (services.py
                  check_credit_eligibility -> master_required). */}
              {canUseCredit && (
              <label className={creditStatus?.credit_ban || creditStatus?.has_unpaid_credit ? 'cursor-not-allowed opacity-50 select-none' : 'cursor-pointer'}>
                <input
                  className="peer sr-only"
                  name="payment"
                  type="radio"
                  checked={formData.payment_method === 'credit'}
                  disabled={!!(creditStatus?.credit_ban || creditStatus?.has_unpaid_credit)}
                  onChange={() => {
                    if (!creditStatus?.credit_ban && !creditStatus?.has_unpaid_credit) {
                      setFormData({...formData, payment_method: 'credit'});
                    }
                  }}
                />
                <div className="border-2 border-outline-variant rounded-xl p-md flex flex-col items-center text-center gap-sm peer-checked:border-primary peer-checked:bg-primary-container/10 transition-all h-full">
                  <span className="material-symbols-outlined text-on-surface-variant text-[32px]">schedule_send</span>
                  <span className="font-label-md text-label-md text-on-surface">{t.checkout.credit}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">5 – 20 {t.checkout.creditDays}</span>
                </div>
              </label>
              )}
            </div>

            {/* Muddatli to'lov kunlari slider — faqat ustalar uchun */}
            {canUseCredit && formData.payment_method === 'credit' && !creditStatus?.credit_ban && !creditStatus?.has_unpaid_credit && (
              <div className="mt-md p-md rounded-xl border border-primary/40 bg-primary-container/10">
                <div className="flex items-center justify-between mb-sm">
                  <label className="font-label-md text-label-md text-on-surface">
                    {t.checkout.selectCreditDays}
                  </label>
                  <span className="font-bold text-primary text-lg">{formData.credit_days} {t.checkout.daysUnit}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={20}
                  step={1}
                  value={formData.credit_days}
                  onChange={(e) => setFormData({...formData, credit_days: Number(e.target.value)})}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-on-surface-variant mt-xs">
                  <span>{t.checkout.minDaysLabel}</span>
                  <span>{t.checkout.maxDaysLabel}</span>
                </div>
                <p className="text-xs text-on-surface-variant mt-sm leading-relaxed">
                  {t.checkout.creditDaysWarningBefore} <strong>{formData.credit_days} {t.checkout.daysUnit}</strong> {t.checkout.creditDaysWarningAfter}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-4">
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg sticky top-[80px]">
            <h2 className="font-h3 text-h3 text-on-surface mb-md">{t.checkout.orderSummary}</h2>
            <div className="space-y-sm mb-md pb-md border-b border-outline-variant">
              <div className="flex justify-between items-center">
                <span className="font-body-md text-body-md text-on-surface-variant">{t.cart.products} ({cart?.items.length})</span>
                <span className="font-body-md text-body-md text-on-surface">{formatPrice(itemsTotalPrice)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body-md text-body-md text-on-surface-variant">{t.checkout.delivery}</span>
                <span className="font-body-md text-body-md text-primary font-medium">
                  {deliveryCost === 0 ? t.checkout.free : formatPrice(deliveryCost)}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center mb-lg">
              <span className="font-h3 text-h3 text-on-surface">{t.checkout.total}</span>
              <span className="font-price text-price text-primary">{formatPrice(finalPrice)}</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary font-label-md text-label-md py-md rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center gap-sm disabled:opacity-60"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              ) : null}
              {t.checkout.placeOrder}
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>

            <div className="mt-md flex items-center justify-center gap-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px]">verified_user</span>
              <span className="font-body-sm text-body-sm text-xs">{t.cart.securePayment}</span>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
};

export default Checkout;
