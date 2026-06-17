import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminGetProducts,
  adminSearchUser,
  adminCreatePosOrder,
  adminGetCustomerHistory,
} from '../api/endpoints';
import { toast } from '../utils/toast';
import { getOrderStatusLabel, getPaymentMethodLabel } from '../utils/orderStatus';
import { printReceipt } from '../utils/receiptPrinter';
// Shared cache — AdminPanel SozlamalarTab bilan bitta source of truth.
// Super Admin Sozlamalar'da yangilasa POS darhol yangi qiymatni ko'radi
// (avvalgi dual-cache bug shu yo'l bilan tuzatildi).
import { loadShopInfo, ensureShopInfo } from '../utils/shopInfoCache';

const getStoreInfo = () => loadShopInfo();

// ─── Types ──────────────────────────────────────────────────────────────────

interface POSItem {
  cartId: string;
  productId: number;
  variantId?: number;
  name: string;
  quality: string;
  model: string;
  size: string;
  color: string;
  price: number;
  costPrice: number;
  quantity: number;
  stock: number;
  sku: string;
}

interface HistoryOrderItem {
  name: string;
  variant: string;
  quantity: number;
  price: string;
}

interface HistoryOrder {
  id: number;
  created_at: string;
  status: string;
  payment_method: string;
  payment_status: string | null;
  total_price: string;
  receiver_name: string;
  receiver_phone: string;
  is_credit: boolean;
  credit_due_date: string | null;
  credit_paid: boolean;
  delivery_address: string;
  items: HistoryOrderItem[];
}

// ─── Utils ───────────────────────────────────────────────────────────────────

const fmt = (v: number | string) => Number(v).toLocaleString('ru-RU');

/** Uzbekistan phone: +998 XX XXXXXXX */
const formatUzPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} ${digits.slice(2)}`;
};

const getFullPhone = (displayDigits: string) => {
  const d = displayDigits.replace(/\D/g, '');
  return d.length === 9 ? `+998${d}` : '';
};

const isPhoneComplete = (displayDigits: string) =>
  displayDigits.replace(/\D/g, '').length === 9;

const isPhonePartiallyFilled = (displayDigits: string) => {
  const len = displayDigits.replace(/\D/g, '').length;
  return len > 0 && len < 9;
};

// ─── HistoryRow Component ────────────────────────────────────────────────────

const HistoryRow = ({ order }: { order: HistoryOrder }) => {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const hasMultiple = order.items.length > 1;
  const firstItem = order.items[0];
  const isPOS = order.delivery_address.includes('POS');

  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  const statusColor =
    order.status === 'DELIVERED'
      ? 'text-green-600'
      : order.status.includes('CANCEL')
      ? 'text-red-500'
      : 'text-amber-600';

  return (
    <div ref={rowRef} className="border border-outline-variant rounded-lg overflow-hidden bg-surface-container-lowest">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Date + channel */}
        <div className="w-28 shrink-0">
          <p className="text-xs text-on-surface font-medium">
            {new Date(order.created_at).toLocaleDateString('uz-UZ')}
          </p>
          <p className="text-[10px] text-on-surface-variant">
            {isPOS ? '🏪 Do\'kon' : '🌐 Online'}
          </p>
        </div>

        {/* Product name(s) */}
        <div className="flex-1 min-w-0">
          {firstItem ? (
            <p className="text-sm text-on-surface truncate">
              {firstItem.name}
              {firstItem.variant ? (
                <span className="text-on-surface-variant text-xs ml-1">({firstItem.variant})</span>
              ) : null}
              {' '}× {firstItem.quantity}
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant italic">Mahsulot yo'q</p>
          )}
          {hasMultiple && !expanded && (
            <p className="text-[10px] text-on-surface-variant">
              +{order.items.length - 1} ta boshqa
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="text-right shrink-0 w-24">
          <p className="text-sm font-bold text-primary">{fmt(order.total_price)}</p>
          <p className={`text-[10px] font-medium ${statusColor}`}>
            {getOrderStatusLabel(order.status)}
          </p>
        </div>

        {/* Expand arrow */}
        {hasMultiple && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="shrink-0 p-1 rounded hover:bg-surface-container text-on-surface-variant transition-transform"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-label="Kengaytirish"
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
          </button>
        )}
        {!hasMultiple && <div className="w-7 shrink-0" />}
      </div>

      {/* Expanded item list */}
      {expanded && hasMultiple && (
        <div className="border-t border-outline-variant bg-surface-container/50 px-4 py-2 space-y-1">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-0.5">
              <span className="text-on-surface truncate flex-1">
                {item.name}
                {item.variant ? (
                  <span className="text-on-surface-variant text-xs ml-1">({item.variant})</span>
                ) : null}
              </span>
              <span className="text-on-surface-variant ml-3 shrink-0">
                {item.quantity} × {fmt(item.price)} so'm
              </span>
            </div>
          ))}
          <div className="flex justify-between text-xs text-on-surface-variant pt-1 border-t border-outline-variant mt-1">
            <span>To'lov turi: {getPaymentMethodLabel(order.payment_method)}</span>
            {order.is_credit && (
              <span className={order.credit_paid ? 'text-green-600' : 'text-amber-600'}>
                {order.credit_paid ? "To'langan" : `Muddat: ${order.credit_due_date}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CustomerHistory Panel ───────────────────────────────────────────────────

const CustomerHistoryPanel = ({ phone, onClose }: { phone: string; onClose: () => void }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-history', phone],
    queryFn: () => adminGetCustomerHistory(phone).then((r) => r.data),
    enabled: !!phone,
  });

  const customer = data?.customer;
  const orders: HistoryOrder[] = data?.orders || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg text-on-surface">Xaridor tarixi</h3>
          <p className="text-xs text-on-surface-variant">{phone}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-container text-on-surface-variant">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {customer && (
        <div className="mb-4 p-3 rounded-xl bg-surface-container border border-outline-variant">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            <span className="font-semibold text-on-surface">
              {customer.first_name || customer.last_name
                ? `${customer.first_name} ${customer.last_name}`.trim()
                : 'Ismsiz'}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">{customer.phone}</p>
          {customer.credit_ban && (
            <p className="text-xs text-error font-semibold mt-1">⛔ Muddatli to'lov bloklangan</p>
          )}
          {!customer.credit_ban && customer.overdue_credit_count > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠ {customer.overdue_credit_count} marta kechiktirilgan
            </p>
          )}
        </div>
      )}

      {!customer && data && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-700 font-semibold">
            Ro'yxatdan o'tmagan mehmon mijoz
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
          Yuklanmoqda...
        </div>
      ) : orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant text-center">
          <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
          <p className="text-sm">Bu mijoz hali xarid qilmagan</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <p className="text-xs text-on-surface-variant mb-2">
            Jami: <strong>{orders.length} ta buyurtma</strong>
          </p>
          {orders.map((order) => (
            <HistoryRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── AllBuyersHistory ────────────────────────────────────────────────────────

const AllBuyersHistory = () => {
  const [searchPhone, setSearchPhone] = useState('');
  const [activePhone, setActivePhone] = useState('');

  const handleSearch = () => {
    const digits = searchPhone.replace(/\D/g, '');
    if (digits.length === 9) setActivePhone('+998' + digits);
    else if (digits.length === 12 && digits.startsWith('998')) setActivePhone('+' + digits);
    else toast.error('Telefon raqami to\'liq emas (9 ta raqam kerak)');
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-160px)]">
      <div className="w-full md:w-72 md:shrink-0 flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h3 className="font-bold text-on-surface mb-3">Xaridor qidirish</h3>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex items-center rounded-lg border border-outline-variant bg-surface overflow-hidden focus-within:border-primary">
            <span className="pl-3 text-on-surface-variant text-sm shrink-0">+998</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="90 1234567"
              value={formatUzPhone(searchPhone)}
              onChange={(e) => setSearchPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-transparent outline-none px-2 py-2 text-sm font-mono"
            />
          </div>
          <button
            onClick={handleSearch}
            className="shrink-0 px-3 rounded-lg bg-primary text-on-primary hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>
        </div>
        <p className="text-xs text-on-surface-variant">
          Telefon raqam bo'yicha barcha xaridlarni ko'rish
        </p>
      </div>

      <div className="flex-1 min-h-[420px] md:min-h-0 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 overflow-hidden flex flex-col">
        {activePhone ? (
          <CustomerHistoryPanel phone={activePhone} onClose={() => setActivePhone('')} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant text-center">
            <span className="material-symbols-outlined text-5xl mb-3">manage_search</span>
            <p className="font-semibold">Xaridor tarixini ko'rish</p>
            <p className="text-sm mt-1">Chap tarafdan telefon raqam kiriting</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main AdminPOS ───────────────────────────────────────────────────────────

type POSTab = 'sale' | 'history';

const AdminPOS = () => {
  const qc = useQueryClient();
  const [posTab, setPosTab] = useState<POSTab>('sale');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<POSItem[]>([]);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  // Mobil (telefon) uchun — bir vaqtda bitta panel: mahsulotlar yoki savat.
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');

  // POS ochilganda shared cache'ni server'dan to'ldiramiz (idempotent).
  // AdminDashboard'da useShopInfo() ham bor — bu yerda ikkilamchi himoya:
  // POS to'g'ridan-to'g'ri router orqali ochilsa ham cache to'g'ri ishlaydi.
  useEffect(() => {
    ensureShopInfo();
  }, []);

  // Checkout form state
  const [phoneDigits, setPhoneDigits] = useState('');   // only 9 digits
  const [fullName, setFullName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit'>('cash');
  const [creditDays, setCreditDays] = useState(10);
  const [userData, setUserData] = useState<any>(null);
  const [searchingUser, setSearchingUser] = useState(false);

  const [lastOrderDetails, setLastOrderDetails] = useState<any>(null);

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    if (searchQuery === '') {
      setDebouncedSearchQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    data: infiniteProductsData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading: loadingProducts,
  } = useInfiniteQuery({
    queryKey: ['admin-products', debouncedSearchQuery],
    queryFn: ({ pageParam = 1 }) =>
      adminGetProducts({ q: debouncedSearchQuery, page: pageParam, page_size: 20 }).then((r) => r.data),
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      const match = lastPage.next.match(/[?&]page=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
    initialPageParam: 1,
  });

  const products = useMemo(() => {
    return infiniteProductsData?.pages.flatMap((page) => page.results || []) || [];
  }, [infiniteProductsData]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // useCallback — har render'da qayta yaratilmasin (perfomance)
  // Backend allaqachon FTS qiladi: q + page bo'yicha filtrlangan natijalar
  // qaytaradi. Bu yerda faqat infinite-scroll trigger'i.
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // 200px buffer — yetib kelmaganda oldindan keyingi sahifani so'raymiz
    if (container.scrollHeight - container.scrollTop <= container.clientHeight + 200) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ⚠ MUHIM: client-side query filtri OLIB TASHLANDI.
  // Sabab: backend PostgreSQL FTS bilan rank'ga qarab natija qaytaradi
  // (description, kategoriya nomi va boshqalarda ham qidiradi).
  // Eski client filtri faqat name/sku/model/color'ga `includes` qilardi —
  // bu backend FTS bilan KELISHMASLIKKA olib kelardi:
  //   • Backend: 20 ta natija (FTS match)
  //   • Client: filter ularning 5 tasini HIDE qilardi → foydalanuvchi
  //     izlagan mahsulotni KO'RMAY qolardi.
  // Endi `expandedItems` faqat variantlarni POSItem'larga ajratadi —
  // SEARCH server tomonda qoldi.
  const expandedItems = useMemo(() => {
    const items: POSItem[] = [];
    products.forEach((p: any) => {
      if (p.variants?.length > 0) {
        p.variants.forEach((v: any) => {
          items.push({
            cartId: `v-${v.id}`,
            productId: p.id,
            variantId: v.id,
            name: p.name,
            quality: v.quality || '',
            model: v.model || '',
            size: v.size || '',
            color: v.color || '',
            price: Number(v.discount_price || v.price || p.discount_price || p.price),
            costPrice: Number(v.cost_price || p.cost_price),
            quantity: 1,
            stock: v.stock,
            sku: v.sku || '',
          });
        });
      } else {
        items.push({
          cartId: `p-${p.id}`,
          productId: p.id,
          name: p.name,
          quality: '', model: '', size: '', color: '',
          price: Number(p.discount_price || p.price),
          costPrice: Number(p.cost_price),
          quantity: 1, stock: p.stock, sku: '',
        });
      }
    });
    return items;
  }, [products]);

  const addToCart = useCallback((item: POSItem) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.cartId === item.cartId);
      if (ex) {
        if (ex.quantity >= ex.stock) { toast.error('Omborda yetarli emas!'); return prev; }
        return prev.map((i) => i.cartId === item.cartId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (item.stock < 1) { toast.error('Omborda qolmagan!'); return prev; }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = (cartId: string) => setCart((p) => p.filter((i) => i.cartId !== cartId));

  const updateQty = (cartId: string, delta: number) => {
    setCart((p) => p.map((i) => {
      if (i.cartId !== cartId) return i;
      const nq = i.quantity + delta;
      if (nq > i.stock) { toast.error('Omborda buncha yo\'q'); return i; }
      if (nq < 1) return i;
      return { ...i, quantity: nq };
    }));
  };

  const totalAmount = cart.reduce((a, i) => a + i.price * i.quantity, 0);
  const totalProfit = cart.reduce((a, i) => a + (i.price - i.costPrice) * i.quantity, 0);

  // Phone lookup (debounced)
  useEffect(() => {
    setUserData(null);
    if (!isPhoneComplete(phoneDigits)) return;

    const fullPhone = getFullPhone(phoneDigits);
    setSearchingUser(true);
    const timer = setTimeout(() => {
      adminSearchUser(fullPhone)
        .then((res) => {
          setUserData(res.data);
          // Defensive: agar tanlangan to'lov 'credit' lekin yangi mijoz usta
          // emas, avtomat 'cash'ga qaytaramiz (option allaqachon yashirin)
          if (paymentMethod === 'credit' && !res.data.can_use_credit) {
            setPaymentMethod('cash');
          }
          // Pre-fill name only if field is empty
          if (!fullName.trim()) {
            const n = `${res.data.first_name || ''} ${res.data.last_name || ''}`.trim();
            if (n) setFullName(n);
          }
        })
        .catch(() => {
          setUserData(null);
          // Mehmon mijoz -> kredit'ni avtomat 'cash'ga qaytaramiz
          if (paymentMethod === 'credit') setPaymentMethod('cash');
        })
        .finally(() => setSearchingUser(false));
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneDigits]);

  const checkoutMutation = useMutation({
    mutationFn: adminCreatePosOrder,
    onSuccess: (res) => {
      const order = res.data;
      setLastOrderDetails({ order, cart });
      toast.success('Savdo muvaffaqiyatli yakunlandi!');
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['customer-history'] });

      // Build receipt from server response (has price_snapshot) or fallback to cart
      const receiptItems = order.items?.length
        ? order.items
        : cart.map((item) => ({
            quantity: item.quantity,
            price_snapshot: item.price,
            product_details: { name: item.name },
            variant_details: {
              color: item.color || null,
              quality: item.quality || null,
              model: item.model || null,
              size: item.size || null,
            },
          }));

      const si = getStoreInfo();
      printReceipt({
        id: order.id,
        created_at: order.created_at || new Date().toISOString(),
        receiver_name: order.receiver_name,
        receiver_phone: order.receiver_phone,
        delivery_address: order.delivery_address || "Do'kon",
        payment_method: order.payment_method,
        is_credit: order.is_credit ?? false,
        credit_days: order.credit_days ?? null,
        credit_due_date: order.credit_due_date ?? null,
        credit_paid: order.credit_paid ?? false,
        total_price: order.total_price,
        delivery_price: order.delivery_price ?? 0,
        discount_price: order.discount_price ?? 0,
        items: receiptItems,
      }, si.name ? si : undefined);

      setCart([]);
      setCheckoutModalOpen(false);
      resetCheckoutForm();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Savdoda xatolik'),
  });

  const resetCheckoutForm = () => {
    setPhoneDigits('');
    setFullName('');
    setPaymentMethod('cash');
    setCreditDays(10);
    setUserData(null);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return toast.error("Savat bo'sh!");

    if (!isPhoneComplete(phoneDigits)) {
      return toast.error("Telefon raqamini to'liq kiriting (9 ta raqam).");
    }

    if (paymentMethod === 'credit' && !userData) {
      return toast.error("Muddatli to'lov uchun mijoz tizimda ro'yxatdan o'tgan bo'lishi shart.");
    }
    // Defensive: backend ham aynan shu tekshiruvni bajaradi (master_required).
    // Bu yerda toast tezroq, lekin haqiqiy himoya backend'da.
    if (paymentMethod === 'credit' && userData && !userData.can_use_credit) {
      return toast.error("Bu mijoz Ustalar ro'yxatida emas — muddatli to'lov yo'q.");
    }
    if (paymentMethod === 'credit' && userData?.credit_ban) {
      return toast.error("Bu mijozga muddatli to'lov taqiqlangan!");
    }

    const nameParts = fullName.trim().split(/\s+/);
    checkoutMutation.mutate({
      phone: getFullPhone(phoneDigits),
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' '),
      payment_method: paymentMethod,
      credit_days: paymentMethod === 'credit' ? creditDays : undefined,
      items: cart.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.quantity })),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-outline-variant pb-3">
        <button
          onClick={() => setPosTab('sale')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${posTab === 'sale' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-outline-variant'}`}
        >
          <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
          Savdo
        </button>
        <button
          onClick={() => setPosTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${posTab === 'history' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-outline-variant'}`}
        >
          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
          Xaridorlar tarixi
        </button>
      </div>

      {posTab === 'history' && <AllBuyersHistory />}

      {posTab === 'sale' && (
        <>
          {/* Mobil panel toggle — bir vaqtda bitta panel (faqat telefon) */}
          <div className="flex gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileView('products')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${mobileView === 'products' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
              Mahsulotlar
            </button>
            <button
              type="button"
              onClick={() => setMobileView('cart')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${mobileView === 'cart' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
              Savat{cart.length > 0 ? ` (${cart.length})` : ''}
            </button>
          </div>

        <div className="flex flex-col md:flex-row h-[calc(100dvh-250px)] md:h-[calc(100vh-220px)] gap-3 md:gap-4">
          {/* LEFT: Products grid */}
          <div className={`${mobileView === 'products' ? 'flex' : 'hidden'} md:flex w-full md:w-2/3 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:p-4`}>
            <div className="relative mb-4 w-full">
              <input
                type="text"
                placeholder="Barkod, nom yoki model bo'yicha qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface pl-4 pr-10 py-2.5 outline-none focus:border-primary text-sm font-medium"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                {isFetching && !isFetchingNextPage ? (
                  <span className="material-symbols-outlined animate-spin text-[20px] text-primary">
                    progress_activity
                  </span>
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="pointer-events-auto text-on-surface-variant hover:text-on-surface flex items-center"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                ) : (
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    search
                  </span>
                )}
              </div>
            </div>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto pr-1"
            >
              {loadingProducts ? (
                /* Birinchi yuklanish — skeleton/spinner */
                <div className="flex h-full items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                  Yuklanmoqda...
                </div>
              ) : expandedItems.length === 0 ? (
                /* Empty state — backend hech narsa qaytarmadi */
                <div className="flex h-full flex-col items-center justify-center text-on-surface-variant px-6 text-center">
                  <span className="material-symbols-outlined text-6xl mb-3 opacity-40">
                    {debouncedSearchQuery ? 'search_off' : 'inventory_2'}
                  </span>
                  <p className="font-semibold text-base mb-1">
                    {debouncedSearchQuery
                      ? `"${debouncedSearchQuery}" bo'yicha hech narsa topilmadi`
                      : "Mahsulot mavjud emas"}
                  </p>
                  <p className="text-xs opacity-70">
                    {debouncedSearchQuery
                      ? "Boshqa kalit so'z bilan urinib ko'ring yoki qidiruvni tozalang"
                      : "Avval omborga mahsulot qo'shing"}
                  </p>
                  {debouncedSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Qidiruvni tozalash
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Natijalar soni — server qaytargani */}
                  {debouncedSearchQuery && (
                    <p className="mb-2 text-xs text-on-surface-variant">
                      <span className="font-semibold text-primary">{expandedItems.length}</span> ta variant topildi
                      {hasNextPage && " (skroll qiling — yana bor)"}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
                    {expandedItems.map((item) => (
                      <button
                        key={item.cartId}
                        type="button"
                        onClick={() => addToCart(item)}
                        disabled={item.stock < 1}
                        className={`text-left rounded-xl border p-3 transition-all hover:border-primary hover:bg-primary/5 active:scale-95 ${item.stock < 1 ? 'opacity-40 cursor-not-allowed border-error' : 'border-outline-variant cursor-pointer'}`}
                      >
                        <p className="font-bold leading-tight text-on-surface line-clamp-2 text-sm mb-1">{item.name}</p>
                        {(item.color || item.size || item.model) && (
                          <p className="text-xs text-on-surface-variant line-clamp-1 mb-2">
                            {[item.color, item.size, item.model].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="flex items-end justify-between">
                          <span className="font-bold text-primary text-sm">{fmt(item.price)}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${item.stock < 5 ? 'bg-error-container/50 text-error' : 'bg-surface-container text-on-surface-variant'}`}>
                            {item.stock} ta
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center py-4 text-on-surface-variant">
                      <span className="material-symbols-outlined animate-spin mr-2 text-[20px]">progress_activity</span>
                      Yana yuklanmoqda...
                    </div>
                  )}
                  {!hasNextPage && expandedItems.length > 0 && debouncedSearchQuery === '' && (
                    <p className="py-3 text-center text-xs text-on-surface-variant opacity-70">
                      Hammasi yuklandi
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT: Cart */}
          <div className={`${mobileView === 'cart' ? 'flex' : 'hidden'} md:flex w-full md:w-1/3 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:p-4`}>
            <h2 className="mb-3 font-bold text-lg text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">shopping_cart</span>
              Savat
              {cart.length > 0 && (
                <span className="ml-auto bg-primary text-on-primary text-xs font-bold px-2 py-0.5 rounded-full">
                  {cart.length}
                </span>
              )}
            </h2>

            <div className="flex-1 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-outline">
                  <span className="material-symbols-outlined mb-2 text-4xl">add_shopping_cart</span>
                  <p className="text-sm">Mahsulot qo'shing</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.map((item) => (
                    <div key={item.cartId} className="flex items-center gap-2 rounded-lg border border-outline-variant p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface line-clamp-1">{item.name}</p>
                        {(item.color || item.size || item.model) && (
                          <p className="text-xs text-on-surface-variant">
                            {[item.color, item.size, item.model].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="text-xs font-bold text-primary mt-0.5">
                          {fmt(item.price * item.quantity)} so'm
                        </p>
                      </div>
                      <div className="flex items-center rounded-lg bg-surface-container overflow-hidden border border-outline-variant">
                        <button onClick={() => updateQty(item.cartId, -1)} className="w-7 h-7 flex items-center justify-center hover:bg-outline-variant text-on-surface font-bold">−</button>
                        <span className="w-8 text-center text-sm font-bold text-on-surface">{item.quantity}</span>
                        <button onClick={() => updateQty(item.cartId, 1)} className="w-7 h-7 flex items-center justify-center hover:bg-outline-variant text-on-surface font-bold">+</button>
                      </div>
                      <button onClick={() => removeFromCart(item.cartId)} className="text-error hover:opacity-70 p-1">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-outline-variant pt-3 space-y-1.5">
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>Foyda:</span>
                <span className="font-semibold text-green-600">{fmt(totalProfit)} so'm</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-on-surface">
                <span>Jami:</span>
                <span className="text-primary">{fmt(totalAmount)} so'm</span>
              </div>
              <button
                disabled={cart.length === 0}
                onClick={() => setCheckoutModalOpen(true)}
                className="mt-2 w-full rounded-xl bg-primary py-3 font-bold text-on-primary hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
                Sotishni Yakunlash
              </button>
            </div>
          </div>
        </div>
        </>
      )}

      {/* ─── CHECKOUT MODAL ─── */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest shadow-2xl overflow-hidden">
            <div className="bg-primary px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-primary">Savdoni Rasmiylashtirish</h3>
              <button
                onClick={() => { setCheckoutModalOpen(false); resetCheckoutForm(); }}
                className="text-on-primary/70 hover:text-on-primary"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

              {/* Full name — optional */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Xaridor ismi
                  <span className="ml-1.5 text-on-surface-variant font-normal">(ixtiyoriy)</span>
                </label>
                <div className="flex items-center rounded-lg border border-outline-variant bg-surface overflow-hidden focus-within:border-primary transition-colors">
                  <span className="pl-3 text-on-surface-variant shrink-0">
                    <span className="material-symbols-outlined text-[18px]">person</span>
                  </span>
                  <input
                    type="text"
                    placeholder="Jasur Toshmatov"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="flex-1 bg-transparent outline-none px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              {/* Phone input */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Telefon raqam <span className="text-error">*</span>
                </label>
                <div className={`flex items-center rounded-lg border bg-surface overflow-hidden transition-colors ${
                  isPhoneComplete(phoneDigits)
                    ? userData
                      ? 'border-green-500'
                      : 'border-outline-variant'
                    : 'border-outline-variant focus-within:border-primary'
                }`}>
                  <span className="pl-3 pr-1 text-sm font-mono text-on-surface-variant shrink-0 select-none bg-surface-container/60 border-r border-outline-variant py-2.5 mr-2">
                    +998
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="90 123 45 67"
                    value={formatUzPhone(phoneDigits)}
                    onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    className="flex-1 bg-transparent outline-none pr-2 py-2.5 text-sm font-mono"
                    maxLength={11}
                  />
                  {searchingUser && (
                    <span className="material-symbols-outlined animate-spin text-primary text-[18px] pr-2.5">progress_activity</span>
                  )}
                  {!searchingUser && isPhoneComplete(phoneDigits) && userData && (
                    <span className="material-symbols-outlined text-green-600 text-[18px] pr-2.5">check_circle</span>
                  )}
                  {!searchingUser && isPhoneComplete(phoneDigits) && !userData && (
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px] pr-2.5">person_add</span>
                  )}
                </div>

                {/* Status messages */}
                {!searchingUser && isPhoneComplete(phoneDigits) && userData && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
                    <span className="material-symbols-outlined text-[15px] text-green-600">verified_user</span>
                    <span>
                      {userData.first_name || userData.last_name
                        ? `${userData.first_name} ${userData.last_name}`.trim()
                        : 'Ro\'yxatdan o\'tgan mijoz'}
                    </span>
                    {userData.is_master && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider dark:bg-amber-900/40 dark:text-amber-200">
                        Usta
                      </span>
                    )}
                    {userData.credit_ban && (
                      <span className="ml-auto text-error font-semibold">Muddatli to'lov bloklangan</span>
                    )}
                  </div>
                )}
                {!searchingUser && isPhoneComplete(phoneDigits) && !userData && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant text-xs">
                    <span className="material-symbols-outlined text-[15px]">storefront</span>
                    <span>Mehmon xaridor — naqd yoki karta bilan sotib olishi mumkin</span>
                  </div>
                )}
                {isPhonePartiallyFilled(phoneDigits) && (
                  <p className="mt-1.5 text-xs text-on-surface-variant pl-1">
                    {9 - phoneDigits.replace(/\D/g, '').length} ta raqam qoldi
                  </p>
                )}
              </div>

              {/* Payment method — Muddatli to'lov FAQAT ustalar uchun ko'rinadi.
                  Backend ham authoritative tarzda blocklaydi (master_required). */}
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-2">To'lov turi</label>
                <div className={`grid gap-2 ${userData?.can_use_credit ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {/* Cash + Card barcha mijozlar uchun */}
                  {(['cash', 'card'] as const).map((m) => {
                    const icons = { cash: 'payments', card: 'credit_card' };
                    const labels = { cash: 'Naqd pul', card: 'Karta' };
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-bold transition-all ${
                          paymentMethod === m
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-outline-variant text-on-surface-variant hover:bg-surface-container hover:border-outline'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[22px]">{icons[m]}</span>
                        {labels[m]}
                      </button>
                    );
                  })}
                  {/* Muddatli — faqat usta mijozlar uchun */}
                  {userData?.can_use_credit && (
                    <button
                      type="button"
                      disabled={userData?.credit_ban}
                      onClick={() => setPaymentMethod('credit')}
                      className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        paymentMethod === 'credit'
                          ? 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container hover:border-outline'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">schedule</span>
                      Muddatli
                    </button>
                  )}
                </div>
                {!userData && (
                  <p className="text-xs text-on-surface-variant mt-1.5 pl-1">
                    Ro'yxatdan o'tgan bo'lmasa muddatli to'lov mavjud emas
                  </p>
                )}
                {userData && !userData.can_use_credit && (
                  <p className="text-xs text-on-surface-variant mt-1.5 pl-1">
                    Bu mijoz Ustalar ro'yxatida emas — muddatli to'lov yo'q
                  </p>
                )}
              </div>

              {/* Credit days slider — faqat master mijoz tanlangan bo'lsa */}
              {paymentMethod === 'credit' && userData?.can_use_credit && (
                <div className="p-3 rounded-xl border border-primary/40 bg-primary-container/10">
                  <div className="flex justify-between mb-1">
                    <label className="text-sm font-semibold text-on-surface">To'lov muddati</label>
                    <span className="font-bold text-primary">{creditDays} kun</span>
                  </div>
                  <input
                    type="range" min={5} max={20} step={1}
                    value={creditDays}
                    onChange={(e) => setCreditDays(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-on-surface-variant mt-0.5">
                    <span>5 kun</span><span>20 kun</span>
                  </div>
                </div>
              )}

              {/* Order summary */}
              <div className="rounded-xl border border-outline-variant bg-surface-container p-3 space-y-1">
                <p className="text-xs font-semibold text-on-surface-variant mb-2">Buyurtma xulosasi</p>
                {cart.map((item) => (
                  <div key={item.cartId} className="flex justify-between text-sm">
                    <span className="text-on-surface truncate flex-1 mr-2">
                      {item.name}{item.color ? ` (${item.color})` : ''} × {item.quantity}
                    </span>
                    <span className="text-on-surface-variant shrink-0">{fmt(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="border-t border-outline-variant pt-1.5 mt-1.5 flex justify-between font-bold text-on-surface">
                  <span>Jami:</span>
                  <span className="text-primary">{fmt(totalAmount)} so'm</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-outline-variant flex gap-3">
              <button
                type="button"
                onClick={() => { setCheckoutModalOpen(false); resetCheckoutForm(); }}
                className="flex-1 rounded-xl border border-outline-variant py-3 font-bold text-on-surface hover:bg-surface-container"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkoutMutation.isPending || !isPhoneComplete(phoneDigits)}
                className="flex-1 rounded-xl bg-primary py-3 font-bold text-on-primary hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {checkoutMutation.isPending ? (
                  <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Sotilmoqda...</>
                ) : (
                  <><span className="material-symbols-outlined text-[18px]">point_of_sale</span> Sotish</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repeat-print button for last completed order */}
      {lastOrderDetails && (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={() => {
              const order = lastOrderDetails.order;
              const receiptItems = order.items?.length
                ? order.items
                : lastOrderDetails.cart.map((item: any) => ({
                    quantity: item.quantity,
                    price_snapshot: item.price,
                    product_details: { name: item.name },
                    variant_details: { color: item.color || null, quality: item.quality || null, model: item.model || null, size: item.size || null },
                  }));
              const si2 = getStoreInfo();
              printReceipt({
                id: order.id,
                created_at: order.created_at || new Date().toISOString(),
                receiver_name: order.receiver_name,
                receiver_phone: order.receiver_phone,
                delivery_address: order.delivery_address || "Do'kon",
                payment_method: order.payment_method,
                is_credit: order.is_credit ?? false,
                credit_days: order.credit_days ?? null,
                credit_due_date: order.credit_due_date ?? null,
                credit_paid: order.credit_paid ?? false,
                total_price: order.total_price,
                delivery_price: order.delivery_price ?? 0,
                discount_price: order.discount_price ?? 0,
                items: receiptItems,
              }, si2.name ? si2 : undefined);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-lg hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            Chekni qayta chiqarish
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminPOS;
