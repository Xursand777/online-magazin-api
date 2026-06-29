// ─────────────────────────────────────────────────────────────────────────────
//  admin/OrdersTab.tsx — Buyurtmalar boshqaruvi (admin/sotuvchi/kuryer).
//
//  #N3: AdminPanel.tsx monolitidan AYNAN ko'chirildi — mantiq O'ZGARMAGAN.
//  Faqat shu tab ishlatadigan yordamchilar (AwaitingPaymentCountdown va order
//  status konstantalari) shu fayl ichida; umumiy bo'lganlari (ORDER_STATUS_COLORS,
//  CreditPayConfirmDialog) shared'da.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { printReceipt, printCreditAgreement } from '../../utils/receiptPrinter';
import { getOrderStatusLabel, getOrderStatusBadge, getPaymentStatusLabel } from '../../utils/orderStatus';
import { loadShopInfo } from '../../utils/shopInfoCache';
import { adminGetOrders, adminUpdateOrderStatus, adminPayCreditOrder } from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { formatMoney, ORDER_STATUS_COLORS, CreditPayConfirmDialog, _notNull } from './shared';
import type { AdminOrder } from './shared';
import { OrderHistoryTimeline } from './OrderHistoryTimeline';

const AWAITING_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

const AwaitingPaymentCountdown = ({ createdAt }: { createdAt: string }) => {
  const calcRemaining = () => {
    const created = new Date(createdAt).getTime();
    return Math.max(0, created + AWAITING_PAYMENT_TIMEOUT_MS - Date.now());
  };
  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    const timer = setInterval(() => setRemaining(calcRemaining()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const isExpired = remaining === 0;
  const isUrgent = !isExpired && remaining < 5 * 60 * 1000;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
        isExpired
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-400'
          : isUrgent
            ? 'animate-pulse border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-800/50 dark:bg-orange-950/20 dark:text-orange-400'
            : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400'
      }`}
    >
      <span className='material-symbols-outlined text-[16px] shrink-0'>
        {isExpired ? 'timer_off' : isUrgent ? 'hourglass_bottom' : 'hourglass_top'}
      </span>
      {isExpired ? (
        <span>Muddati o'tdi — tizim buyurtmani bekor qiladi.</span>
      ) : (
        <span>
          To'lov uchun qoldi:{' '}
          <strong>
            {minutes}:{String(seconds).padStart(2, '0')}
          </strong>
          {isUrgent && ' — shoshiling!'}
        </span>
      )}
    </div>
  );
};


const STATUS_FORWARD_TRANSITION: Record<string, string | null> = {
  AWAITING_PAYMENT: 'CONFIRMED',
  PENDING:          'CONFIRMED',
  CONFIRMED:        'PACKING',
  PACKING:          'SHIPPING',
  SHIPPING:         'DELIVERED',
  DELIVERED:        'RECEIVED',
  RECEIVED:         null,
  CANCELLED_BY_USER:   null,
  CANCELLED_BY_ADMIN:  null,
  SYSTEM_AUTO_CANCEL:  null,
};

const ORDER_FINAL_STATUSES = new Set([
  'RECEIVED',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_ADMIN',
  'SYSTEM_AUTO_CANCEL',
]);

const ADMIN_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT:    "To'lov kutilmoqda (karta)",
  PENDING:             "Yangi buyurtma",
  CONFIRMED:           "Tasdiqlandi",
  PACKING:             "Yig'ilmoqda",
  SHIPPING:            "Yo'lda",
  DELIVERED:           "Yetkazildi (eshikda)",
  RECEIVED:            "Xaridorga topshirildi",
  CANCELLED_BY_USER:   "Foydalanuvchi bekor qildi",
  CANCELLED_BY_ADMIN:  "Admin bekor qildi",
  SYSTEM_AUTO_CANCEL:  "Tizim avtomatik bekor qildi",
};

export const OrdersTab = () => {
  const qc = useQueryClient();
  // Kuryer — mijoz tomonidagi himoya: backend kechiksa ham bekor qilish /
  // nasiya tugmalari ko'rsatilmaydi, oldinga tugma faqat DELIVERED/RECEIVED.
  const currentRole = useAuthStore((s) => s.user?.role);
  const isCourier = currentRole === 'courier';
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    date_from: '',
    date_to: '',
    payment_method: '',
    is_credit: '',
    payment_status: '',
    page: 1,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-orders', filters],
    queryFn: () =>
      adminGetOrders({
        q: filters.q || undefined,
        status: filters.status || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        payment_method: filters.payment_method || undefined,
        is_credit: filters.is_credit || undefined,
        payment_status: filters.payment_status || undefined,
        page: filters.page,
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
    // ── REAL-TIME (KAFOLATLI) ─────────────────────────────────────────────
    // Ro'yxat O'ZI har 7s yangilanadi — status o'zgarishlari (Yetkazildi,
    // Xaridorga topshirildi, ...) abnovit qilmasdan darhol ko'rinadi.
    // refetchIntervalInBackground: true — sayt boshqa oynada/ekranda bo'lsa
    // ham (siz mobil bilan ishlayotganda) jonli yangilanib turadi.
    // FAQAT Buyurtmalar tabi ochiq bo'lganda ishlaydi (query mount bo'lganda),
    // shuning uchun yuk chegaralangan. Poll (Max id) — yangi-buyurtma toast/ovoz.
    refetchInterval: 7000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const orders: AdminOrder[] = (data as any)?.results || (Array.isArray(data) ? data : []);
  const totalCount: number = (data as any)?.count || orders.length;
  const hasNext = Boolean((data as any)?.next);
  const hasPrev = Boolean((data as any)?.previous);
  const totalPages = Math.ceil(totalCount / 20) || 1;

  const [drafts, setDrafts] = useState<Record<number, { status: string; note: string }>>({});

  const setFilter = (key: string, value: string) =>
    setFilters((c) => ({ ...c, [key]: value, page: 1 }));

  const resetFilters = () =>
    setFilters({
      q: '',
      status: '',
      date_from: '',
      date_to: '',
      payment_method: '',
      is_credit: '',
      payment_status: '',
      page: 1,
    });

  const hasActiveFilters =
    filters.q ||
    filters.status ||
    filters.date_from ||
    filters.date_to ||
    filters.payment_method ||
    filters.is_credit ||
    filters.payment_status;

  const statusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note: string }) =>
      adminUpdateOrderStatus(id, { status, note }),
    onSuccess: async (_, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-orders'] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      setDrafts((c) => {
        const n = { ...c };
        delete n[vars.id];
        return n;
      });
      toast.success('Buyurtma holati yangilandi.');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Statusni yangilab bo'lmadi."),
  });

  const creditPayMutation = useMutation({
    mutationFn: (id: number) => adminPayCreditOrder(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-orders'] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      setCreditConfirmOrder(null);
      toast.success("Muddatli to'lov muvaffaqiyatli qabul qilindi.");
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || "Muddatli to'lovni qayd etib bo'lmadi.");
    },
  });

  const [creditConfirmOrder, setCreditConfirmOrder] = useState<AdminOrder | null>(null);

  const updateDraft = (
    orderId: number,
    field: 'status' | 'note',
    value: string,
    fallbackStatus: string,
    fallbackNote: string,
  ) => {
    setDrafts((c) => ({
      ...c,
      [orderId]: {
        status: field === 'status' ? value : c[orderId]?.status || fallbackStatus,
        note: field === 'note' ? value : c[orderId]?.note || fallbackNote,
      },
    }));
  };

  return (
    <div className='space-y-6'>
      {/* Credit payment confirmation dialog */}
      <CreditPayConfirmDialog
        order={creditConfirmOrder}
        isPending={creditPayMutation.isPending}
        onConfirm={() => {
          if (creditConfirmOrder) creditPayMutation.mutate(creditConfirmOrder.id);
        }}
        onCancel={() => !creditPayMutation.isPending && setCreditConfirmOrder(null)}
      />


      <div>
        <h2 className='font-h3 text-h3 text-on-surface'>Buyurtmalar ({totalCount})</h2>
        <p className='mt-1 text-body-sm text-on-surface-variant'>
          Buyurtma statuslari, cancellation sababi va tarix shu bo'limda boshqariladi.
        </p>
      </div>

      {/* Quick filters — tez-tez kerak bo'ladigan holatlar */}
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-xs font-medium text-on-surface-variant'>Tez filtr:</span>
        <button
          onClick={() =>
            setFilter('payment_status', filters.payment_status === 'REFUNDED' ? '' : 'REFUNDED')
          }
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            filters.payment_status === 'REFUNDED'
              ? 'border-orange-600 bg-orange-600 text-white shadow-sm'
              : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800/60 dark:bg-orange-950/20 dark:text-orange-400'
          }`}
        >
          <span className='material-symbols-outlined text-[14px]'>currency_exchange</span>
          Refund kutilayotgan
        </button>
        <button
          onClick={() =>
            setFilter('status', filters.status === 'AWAITING_PAYMENT' ? '' : 'AWAITING_PAYMENT')
          }
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            filters.status === 'AWAITING_PAYMENT'
              ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
              : 'border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary hover:text-primary'
          }`}
        >
          <span className='material-symbols-outlined text-[14px]'>hourglass_empty</span>
          To'lov kutilmoqda (karta)
        </button>
        <button
          onClick={() =>
            setFilter('status', filters.status === 'DELIVERED' ? '' : 'DELIVERED')
          }
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            filters.status === 'DELIVERED'
              ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
              : 'border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary hover:text-primary'
          }`}
        >
          <span className='material-symbols-outlined text-[14px]'>payments</span>
          Naqd to'lov kutilmoqda
        </button>
      </div>

      {/* Filters */}
      <div className='rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm'>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          <input
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder='Buyurtma #, ism yoki telefon...'
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          />
          <select
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha statuslar</option>
            {Object.entries(ADMIN_STATUS_LABEL).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={filters.payment_method}
            onChange={(e) => setFilter('payment_method', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value="">Barcha to'lovlar</option>
            <option value='CASH'>Naqd</option>
            <option value='CARD'>Karta</option>
            <option value='CREDIT'>Nasiya</option>
          </select>
          <select
            value={filters.is_credit}
            onChange={(e) => setFilter('is_credit', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barchasi</option>
            <option value='true'>Nasiyali</option>
            <option value='false'>Oddiy</option>
          </select>
          <input
            type='date'
            value={filters.date_from}
            onChange={(e) => setFilter('date_from', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            title="Dan sana"
          />
          <input
            type='date'
            value={filters.date_to}
            onChange={(e) => setFilter('date_to', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            title="Gacha sana"
          />
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container'
            >
              <span className='material-symbols-outlined text-[16px]'>close</span>
              Filtrlarni tozalash
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className='py-12 text-center text-on-surface-variant'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
            progress_activity
          </span>
          Buyurtmalar yuklanmoqda...
        </div>
      ) : orders.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            local_shipping
          </span>
          <p className='font-h3 text-on-surface-variant'>Buyurtmalar yo'q</p>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
          {orders.map((order) => {
            // Oldinga tugma — ROL bo'yicha backend-avtoritar `allowed_transitions`dan.
            // Kuryer faqat SHIPPING→DELIVERED / DELIVERED→RECEIVED ko'radi; sotuvchi
            // PACKING→SHIPPING gacha. Eski (cache) ma'lumot uchun status-fallback.
            const rawNextFwd = order.allowed_transitions
              ? (order.allowed_transitions[0] ?? null)
              : (STATUS_FORWARD_TRANSITION[order.status] ?? null);
            // Qat'iy himoya: kuryer FAQAT ikki yetkazish o'tishini ko'ra oladi.
            const nextFwdStatus =
              isCourier && rawNextFwd !== 'DELIVERED' && rawNextFwd !== 'RECEIVED'
                ? null
                : rawNextFwd;
            const isFinalStatus = ORDER_FINAL_STATUSES.has(order.status);

            // Bekor qilish — backend-avtoritar (kuryer uchun doim false). Eski
            // ma'lumotda mahalliy to'lov-usuli mantig'iga qaytamiz; kuryerga hech qachon.
            const canAdminCancel = isCourier ? false : (order.can_admin_cancel ?? (() => {
              if (isFinalStatus) return false;
              const pm = order.payment_method;
              const st = order.status;
              // Karta: faqat to'lov kelmagan paytda (AWAITING_PAYMENT)
              if (pm === 'card') return st === 'AWAITING_PAYMENT';
              // Naqd / Muddatli: faqat PENDING va CONFIRMED (yig'ilish boshlashdan oldin)
              return st === 'PENDING' || st === 'CONFIRMED';
            })());
            // Default selection: next forward status (pre-selected, ready to save)
            const draft = drafts[order.id] || {
              status: nextFwdStatus ?? order.status,
              note: '',
            };
            const lastHistory = order.history?.[order.history.length - 1];
            // Changes exist when selected status differs from CURRENT order status
            return (
              <div
                key={order.id}
                className='rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm overflow-hidden'
              >
                <div className='border-b border-outline-variant bg-surface-container-low px-5 py-4'>
                  <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                    <div className='space-y-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-h3 text-lg text-on-surface'>
                          Buyurtma #{order.id}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getOrderStatusBadge(order.status)}`}
                        >
                          {getOrderStatusLabel(order.status)}
                        </span>
                        {/* Refund zarur badge — karta to'lovi qaytarilishi kerak */}
                        {order.payment?.status === 'REFUNDED' && (
                          <span className='flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'>
                            <span className='material-symbols-outlined text-[12px]'>currency_exchange</span>
                            Refund zarur
                          </span>
                        )}
                        {order.is_credit && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              order.credit_paid
                                ? 'bg-green-100 text-green-700'
                                : order.credit_is_overdue
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {order.credit_paid
                              ? "Muddatli to'lov to'langan"
                              : order.credit_is_overdue
                                ? "To'lov muddati o'tdi!"
                                : "Muddatli to'lov"}
                          </span>
                        )}
                      </div>
                      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant'>
                        <span>{new Date(order.created_at).toLocaleString('uz-UZ')}</span>
                        <span>{order.receiver_name}</span>
                        <span>{order.receiver_phone}</span>
                      </div>
                    </div>
                    <div className='flex items-start gap-2'>
                      <div className='grid grid-cols-2 gap-3 text-sm xl:min-w-[320px]'>
                        <div className='rounded-xl bg-surface-container-lowest p-3'>
                          <div className='text-xs text-on-surface-variant'>Jami</div>
                          <div className='mt-1 font-semibold text-primary'>
                            {formatMoney(order.total_price)} so'm
                          </div>
                        </div>
                        <div className='rounded-xl bg-surface-container-lowest p-3'>
                          <div className='text-xs text-on-surface-variant'>To'lov</div>
                          <div className='mt-1 text-sm'>
                            {!order.payment ? (
                              <span className='font-medium text-on-surface'>Yo'q</span>
                            ) : order.payment.method === 'cash' ? (
                              order.payment.status === 'PAID' ? (
                                <span className='flex items-center gap-1 font-semibold text-emerald-600'>
                                  <span className='material-symbols-outlined text-[14px]'>check_circle</span>
                                  Naqd to'landi
                                </span>
                              ) : (
                                <span className='flex items-center gap-1 font-medium text-amber-600'>
                                  <span className='material-symbols-outlined text-[14px]'>payments</span>
                                  Kuryerda olinadi
                                </span>
                              )
                            ) : order.payment.method === 'card' ? (
                              order.payment.status === 'PAID' ? (
                                <span className='flex items-center gap-1 font-semibold text-emerald-600'>
                                  <span className='material-symbols-outlined text-[14px]'>check_circle</span>
                                  Karta to'landi
                                </span>
                              ) : order.payment.status === 'REFUNDED' ? (
                                <span className='flex items-center gap-1 font-semibold text-orange-600'>
                                  <span className='material-symbols-outlined text-[14px]'>currency_exchange</span>
                                  Refund zarur!
                                </span>
                              ) : (
                                <span className='flex items-center gap-1 font-medium text-orange-600'>
                                  <span className='material-symbols-outlined text-[14px]'>hourglass_empty</span>
                                  Karta kutilmoqda
                                </span>
                              )
                            ) : order.payment.method === 'credit' ? (
                              <span className='flex items-center gap-1 font-medium text-blue-600'>
                                <span className='material-symbols-outlined text-[14px]'>schedule</span>
                                Muddatli to'lov
                              </span>
                            ) : (
                              <span className='font-medium text-on-surface'>
                                {getPaymentStatusLabel(order.payment.status)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => printReceipt(order, loadShopInfo().name ? loadShopInfo() : undefined)}
                        title='Chek chiqarish'
                        className='flex flex-shrink-0 flex-col items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant transition-all hover:border-primary hover:bg-primary/5 hover:text-primary'
                      >
                        <span className='material-symbols-outlined text-[22px]'>receipt_long</span>
                        <span>Chek</span>
                      </button>
                    </div>
                  </div>
                </div>
                {/* AWAITING_PAYMENT countdown — only for card orders waiting for payment */}
                {order.status === 'AWAITING_PAYMENT' && order.payment_method === 'card' && (
                  <div className='mx-5 mt-1'>
                    <AwaitingPaymentCountdown createdAt={order.created_at} />
                  </div>
                )}

                {/* Cash payment collection alert — shown only for DELIVERED cash orders */}
                {order.payment_method === 'cash' &&
                  order.status === 'DELIVERED' &&
                  order.payment?.status === 'PENDING' && (
                    <div className='mx-5 mt-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20'>
                      <div className='flex items-start gap-3'>
                        <span className='material-symbols-outlined shrink-0 text-[22px] text-amber-600'>payments</span>
                        <div>
                          <p className='text-sm font-semibold text-amber-800 dark:text-amber-400'>
                            Naqd to'lov kutilmoqda
                          </p>
                          <p className='mt-0.5 text-xs text-amber-700 dark:text-amber-500'>
                            Kuryer <strong>{formatMoney(order.total_price)} so'm</strong> naqd pul olishini tasdiqlang.
                          </p>
                        </div>
                      </div>
                      <button
                        type='button'
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            id: order.id,
                            status: 'RECEIVED',
                            note: "Naqd to'lov qabul qilindi va mahsulot xaridorga topshirildi.",
                          })
                        }
                        className='flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60'
                      >
                        <span className='material-symbols-outlined text-[16px]'>check_circle</span>
                        To'lov qabul qilindi
                      </button>
                    </div>
                  )}

                <div className='grid gap-5 px-5 py-5 xl:grid-cols-[1.1fr_0.9fr]'>
                  <div className='space-y-4'>
                    <div className='grid gap-3 lg:grid-cols-2'>
                      <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
                        <div className='mb-2 flex items-center justify-between gap-2'>
                          <div className='text-xs uppercase text-on-surface-variant'>Manzil</div>
                          {/* Phase 3.1 — Kuryer xaritasi tugmasi.
                              MUKAMMAL LOGIKA:
                                • Faqat PACKING/SHIPPING/DELIVERED/RECEIVED
                                  holatlarda ko'rinadi (kuryer aktiv
                                  ishlayotgan vaqt)
                                • PENDING/AWAITING_PAYMENT/CONFIRMED da
                                  hali kuryer kerakmas — buyurtma yig'ilmagan
                                • POS buyurtmalarda yo'q (do'kondan olib ketiladi)
                                • Bekor qilingan buyurtmalarda yo'q
                                • RECEIVED (xaridorga topshirilgan) da YO'Q —
                                  yetkazib berish tugadi, navigatsiya kerakmas
                                • Koordinata bo'lmasa ham ko'rinadi — sahifa
                                  Yandex/Google/2GIS deep link ko'rsatadi */}
                          {['PACKING', 'SHIPPING', 'DELIVERED'].includes(
                              order.status,
                            ) &&
                            !order.delivery_address?.includes('POS') && (
                              <a
                                href={`/courier/route/${order.id}`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='flex items-center gap-1 rounded-lg bg-[#22c55e] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#16a34a] transition-colors'
                              >
                                <span className='material-symbols-outlined text-[14px]'>
                                  map
                                </span>
                                Xaritadan borish
                              </a>
                            )}
                        </div>
                        <div className='text-sm text-on-surface whitespace-pre-line'>
                          {order.delivery_address}
                        </div>
                        {(order as any).delivery_notes && (
                          <div className='mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5'>
                            <span className='material-symbols-outlined text-amber-700 text-[14px] mt-0.5'>
                              sticky_note_2
                            </span>
                            <p className='text-xs text-amber-900 flex-1'>
                              {(order as any).delivery_notes}
                            </p>
                          </div>
                        )}
                        {(order as any).delivery_lat &&
                          (order as any).delivery_lng && (
                            <p className='mt-2 text-[10px] text-on-surface-variant flex items-center gap-1'>
                              <span className='material-symbols-outlined text-[12px] text-[#22c55e]'>
                                verified
                              </span>
                              Xaritada aniq nuqta tanlangan
                            </p>
                          )}
                      </div>
                      <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
                        <div className='mb-2 text-xs uppercase text-on-surface-variant'>
                          Mahsulotlar
                        </div>
                        <div className='space-y-2'>
                          {order.items.slice(0, 4).map((item) => (
                            <div key={item.id} className='flex items-center gap-3'>
                              <div className='h-12 w-12 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest'>
                                {item.product_details?.main_image ? (
                                  <img
                                    src={item.product_details.main_image}
                                    alt={item.product_details.name}
                                    className='h-full w-full object-contain p-1'
                                  />
                                ) : (
                                  <div className='flex h-full w-full items-center justify-center text-outline'>
                                    <span className='material-symbols-outlined text-[18px]'>
                                      image
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className='min-w-0 flex-1'>
                                <div className='text-sm text-on-surface break-words'>
                                  {/* Phase 4.0 — mahsulot nomi to'liq ko'rinsin
                                      (oxirida `...` chiqmasin). Buyurtmalarda
                                      uzun nomli mahsulot ham bir necha qatorga
                                      sig'adi → admin to'liq matnni o'qiy oladi. */}
                                  {item.product_details?.name || 'Mahsulot'}
                                </div>
                                <div className='mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant'>
                                  <span>{item.quantity} dona</span>
                                  {item.variant_details && (
                                    <span>
                                      • {[item.variant_details.color, item.variant_details.quality, item.variant_details.model, item.variant_details.size].filter(_notNull).join(' / ')}
                                    </span>
                                  )}
                                  {/* PHASE 4.0 — POLKA badge (rangli bold kattaroq).
                                      Backend faqat staff so'rovida `variant_shelf`
                                      qaytaradi → xaridor tomonida bu joy yo'q. */}
                                  {item.variant_shelf && (
                                    <span className='inline-flex items-center gap-0.5 rounded-md bg-primary px-2 py-0.5 text-[13px] font-extrabold tracking-wide text-on-primary shadow-sm'>
                                      <span className='material-symbols-outlined text-[14px]'>pin_drop</span>
                                      Polka: {item.variant_shelf}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {order.items.length > 4 && (
                            <div className='text-xs text-on-surface-variant'>
                              Yana {order.items.length - 4} ta mahsulot bor
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {order.cancellation_reason && (
                      <div className='rounded-xl border border-error-container bg-error-container/30 p-4'>
                        <div className='text-xs uppercase text-error'>Cancellation reason</div>
                        <div className='mt-2 text-sm text-on-surface'>
                          {order.cancellation_reason}
                        </div>
                      </div>
                    )}
                    <OrderHistoryTimeline
                      history={order.history ?? []}
                      lastHistory={lastHistory}
                    />
                  </div>
                  <div className='space-y-4'>
                    {order.is_credit && (
                      <div
                        className={`rounded-xl border p-4 ${
                          order.credit_paid
                            ? 'border-green-200 bg-green-50'
                            : order.credit_is_overdue
                              ? 'border-red-300 bg-red-50'
                              : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <div className='mb-2 flex items-center gap-2'>
                          <span
                            className={`material-symbols-outlined text-[20px] ${
                              order.credit_paid
                                ? 'text-green-600'
                                : order.credit_is_overdue
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                            }`}
                          >
                            {order.credit_paid
                              ? 'check_circle'
                              : order.credit_is_overdue
                                ? 'warning'
                                : 'schedule'}
                          </span>
                          <span
                            className={`font-semibold text-sm ${
                              order.credit_paid
                                ? 'text-green-700'
                                : order.credit_is_overdue
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {order.credit_paid
                              ? "Muddatli to'lov to'langan"
                              : order.credit_is_overdue
                                ? "To'lov muddati o'tdi!"
                                : "Muddatli to'lov kutilmoqda"}
                          </span>
                        </div>
                        <div className='text-xs text-on-surface-variant space-y-1'>
                          <div>
                            Muddat: <strong>{order.credit_days} kun</strong>
                          </div>
                          <div>
                            To'lov sanasi: <strong>{order.credit_due_date}</strong>
                          </div>
                          {order.credit_paid && order.credit_paid_at && (
                            <div>
                              To'langan:{' '}
                              <strong>
                                {new Date(order.credit_paid_at).toLocaleString('uz-UZ')}
                              </strong>
                            </div>
                          )}
                          {order.user && (
                            <div>
                              Foydalanuvchi: <strong>{order.user.phone}</strong>
                            </div>
                          )}
                        </div>
                        {/* Nasiyani yopish — faqat kassa huquqiga ega xodim (backend-avtoritar). */}
                        {!isCourier && (order.can_pay_credit ?? !order.credit_paid) && (
                          <button
                            type='button'
                            onClick={() => setCreditConfirmOrder(order)}
                            className='mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700'
                          >
                            <span className='material-symbols-outlined text-[16px]'>payments</span>
                            Muddatli to'lovni qabul qilish
                          </button>
                        )}
                      </div>
                    )}

                    <div className='rounded-xl border border-outline-variant bg-surface-container p-4 space-y-4'>
                      <h3 className='font-h3 text-lg text-on-surface'>Holatni boshqarish</h3>

                      {/* ── Yakuniy holat — hech narsa o'zgarmaydi ── */}
                      {isFinalStatus ? (
                        <div className='flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-4'>
                          <span className='material-symbols-outlined text-[22px] text-outline shrink-0'>lock</span>
                          <div>
                            <p className='text-sm font-semibold text-on-surface'>Yakuniy holat</p>
                            <p className='text-xs text-on-surface-variant mt-0.5'>
                              Bu buyurtma{' '}
                              <span className={`font-medium ${
                                order.status === 'RECEIVED' ? 'text-emerald-600'
                                : order.status.includes('CANCEL') ? 'text-error'
                                : 'text-on-surface'
                              }`}>
                                {ADMIN_STATUS_LABEL[order.status] || order.status}
                              </span>{' '}
                              holatida — o'zgartirib bo'lmaydi.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* ── Joriy holat ko'rsatgichi ── */}
                          <div className='flex items-center gap-2 text-sm'>
                            <span className='text-on-surface-variant shrink-0'>Joriy:</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              ORDER_STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'
                            }`}>
                              {ADMIN_STATUS_LABEL[order.status] || order.status}
                            </span>
                            <span className='material-symbols-outlined text-[16px] text-outline'>arrow_forward</span>
                            {nextFwdStatus && (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                ORDER_STATUS_COLORS[nextFwdStatus] || 'bg-primary-container/20 text-primary'
                              }`}>
                                {ADMIN_STATUS_LABEL[nextFwdStatus]}
                              </span>
                            )}
                          </div>

                          {/* ── Keyingi holat (faqat bir to'g'ri yo'l) ── */}
                          {nextFwdStatus && (
                            <div className='space-y-3'>
                              <textarea
                                rows={3}
                                value={draft.note}
                                onChange={(e) =>
                                  updateDraft(order.id, 'note', e.target.value, order.status, '')
                                }
                                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm outline-none focus:border-primary'
                                placeholder="Izoh (ixtiyoriy): mahsulot tekshirildi, yig'ilish boshlandi..."
                              />

                              {/* Cash → RECEIVED hint */}
                              {nextFwdStatus === 'RECEIVED' && order.payment_method === 'cash' && (
                                <div className='flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400'>
                                  <span className='material-symbols-outlined shrink-0 text-[13px] mt-0.5'>info</span>
                                  <span><strong>Eslatma:</strong> Bu amal naqd to'lovni ham <strong>To'langan</strong> deb avtomatik belgilaydi.</span>
                                </div>
                              )}

                              <button
                                type='button'
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: order.id,
                                    status: nextFwdStatus,
                                    note: draft.note.trim(),
                                  })
                                }
                                className='flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-sm text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60'
                              >
                                {statusMutation.isPending ? (
                                  <>
                                    <span className='material-symbols-outlined animate-spin text-[16px]'>progress_activity</span>
                                    Saqlanmoqda...
                                  </>
                                ) : (
                                  <>
                                    <span className='material-symbols-outlined text-[16px]'>arrow_forward</span>
                                    {ADMIN_STATUS_LABEL[nextFwdStatus]} ga o'tkazish
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* ── Admin bekor qilish — ajratilgan danger zone ── */}
                          {canAdminCancel && (
                            <details className='group rounded-xl border border-error/30 bg-error-container/10'>
                              <summary className='flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-error select-none'>
                                <span className='material-symbols-outlined text-[16px]'>expand_more</span>
                                Admin bekor qilish
                              </summary>
                              <div className='border-t border-error/20 px-4 pb-4 pt-3 space-y-3'>
                                <textarea
                                  rows={3}
                                  value={draft.status === 'CANCELLED_BY_ADMIN' ? draft.note : ''}
                                  onChange={(e) =>
                                    setDrafts((c) => ({
                                      ...c,
                                      [order.id]: { status: 'CANCELLED_BY_ADMIN', note: e.target.value },
                                    }))
                                  }
                                  className='w-full rounded-lg border border-error/40 bg-surface-bright px-3 py-2 text-sm outline-none focus:border-error'
                                  placeholder='Bekor qilish sababi (majburiy)...'
                                />
                                <button
                                  type='button'
                                  disabled={
                                    statusMutation.isPending ||
                                    draft.status !== 'CANCELLED_BY_ADMIN' ||
                                    !draft.note.trim()
                                  }
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: order.id,
                                      status: 'CANCELLED_BY_ADMIN',
                                      note: draft.note.trim(),
                                    })
                                  }
                                  className='flex w-full items-center justify-center gap-2 rounded-lg bg-error px-4 py-2 text-sm font-semibold text-on-error transition-opacity hover:opacity-90 disabled:opacity-40'
                                >
                                  <span className='material-symbols-outlined text-[16px]'>cancel</span>
                                  Buyurtmani bekor qilish
                                </button>
                              </div>
                            </details>
                          )}
                        </>
                      )}

                      {/* ── Chek ── */}
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          onClick={() => printReceipt(order, loadShopInfo().name ? loadShopInfo() : undefined)}
                          className='flex flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:border-primary hover:text-primary'
                        >
                          <span className='material-symbols-outlined text-[18px]'>receipt_long</span>
                          Chek
                        </button>
                        {order.is_credit && (
                          <button
                            type='button'
                            onClick={() => printCreditAgreement(order, loadShopInfo().name ? loadShopInfo() : undefined)}
                            className='flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:border-blue-500 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/20 dark:text-blue-400'
                          >
                            <span className='material-symbols-outlined text-[18px]'>description</span>
                            Nasiya cheki
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalCount > 0 && (
        <div className='flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3'>
          <span className='text-sm text-on-surface-variant'>
            {(filters.page - 1) * 20 + 1}–{Math.min(filters.page * 20, totalCount)} /{' '}
            {totalCount} ta buyurtma
          </span>
          <div className='flex items-center gap-2'>
            <button
              disabled={!hasPrev}
              onClick={() => setFilters((c) => ({ ...c, page: c.page - 1 }))}
              className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-surface-container'
            >
              <span className='material-symbols-outlined text-[16px]'>chevron_left</span>
              Oldingi
            </button>
            <span className='text-sm text-on-surface-variant'>
              {filters.page} / {totalPages}
            </span>
            <button
              disabled={!hasNext}
              onClick={() => setFilters((c) => ({ ...c, page: c.page + 1 }))}
              className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-surface-container'
            >
              Keyingi
              <span className='material-symbols-outlined text-[16px]'>chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

