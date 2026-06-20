// admin/DashboardTab.tsx — Bosh sahifa KPI paneli (kunlik/oylik tushum, oxirgi
// buyurtmalar). #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
// Eslatma: admin QOBIG'I (sidebar/tab boshqaruvi) AdminPanel ichida qoladi —
// bu faqat "dashboard" tabining kontenti.
import { useQuery } from '@tanstack/react-query';
import { adminGetDashboard } from '../../api/endpoints';
import { getOrderStatusLabel, getOrderStatusBadge } from '../../utils/orderStatus';
import { formatMoney, ORDER_STATUS_COLORS } from './shared';

interface DashboardData {
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number };
  pending_orders: number;
  processing_orders: number;
  overdue_credits: number;
  kassa_balance: number;
  stock: { low_stock: number; out_of_stock: number };
  status_breakdown: Record<string, number>;
  recent_orders: Array<{
    id: number;
    status: string;
    total_price: number;
    receiver_name: string;
    receiver_phone: string;
    created_at: string;
    payment_method: string;
    is_credit: boolean;
    item_count: number;
  }>;
  weekly_chart: Array<{ date: string; revenue: number; orders: number }>;
  feedback_new: number;
}

export const DashboardTab = () => {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminGetDashboard().then((r) => r.data),
    staleTime: 60_000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (isLoading)
    return (
      <div className='py-12 text-center text-on-surface-variant'>
        <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
          progress_activity
        </span>
        Dashboard yuklanmoqda...
      </div>
    );

  if (isError || !data)
    return (
      <div className='rounded-xl border border-error-container bg-error-container/20 py-12 text-center'>
        <span className='material-symbols-outlined mb-2 block text-4xl text-error'>error</span>
        <p className='text-on-surface-variant'>Dashboard yuklanmadi. Qayta urinib ko'ring.</p>
        <button
          onClick={() => refetch()}
          className='mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-on-primary'
        >
          Qayta yuklash
        </button>
      </div>
    );

  const statusLabels: Record<string, string> = {
    AWAITING_PAYMENT: "To'lov kutilmoqda (karta)",
    PENDING: "Yangi buyurtma",
    CONFIRMED: "Tasdiqlandi",
    PACKING: "Yig'ilmoqda",
    SHIPPING: "Yo'lda",
    DELIVERED: "Yetkazildi (eshikda)",
    RECEIVED: "Xaridorga topshirildi",
    CANCELLED_BY_USER: "Foydalanuvchi bekor qildi",
    CANCELLED_BY_ADMIN: "Admin bekor qildi",
    SYSTEM_AUTO_CANCEL: "Avtomatik bekor qilindi",
  };

  const statusColors = ORDER_STATUS_COLORS;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Dashboard</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Barcha asosiy ko'rsatkichlar bir ko'rinishda.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          {lastUpdated && (
            <span className='text-xs text-on-surface-variant'>
              So'nggi yangilangan: {lastUpdated}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container'
          >
            <span className='material-symbols-outlined text-[16px]'>refresh</span>
            Yangilash
          </button>
        </div>
      </div>

      {/* Row 1: 4 KPI cards */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='flex items-start justify-between'>
            <div>
              <div className='text-sm text-on-surface-variant'>Bugungi buyurtmalar</div>
              <div className='mt-1 text-3xl font-bold text-primary'>{data.today.orders} ta</div>
              <div className='mt-1 text-xs text-on-surface-variant'>
                {formatMoney(data.today.revenue)} so'm tushum
              </div>
            </div>
            <span className='material-symbols-outlined fill-icon text-3xl text-primary'>
              shopping_bag
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='flex items-start justify-between'>
            <div>
              <div className='text-sm text-on-surface-variant'>Bu oy tushum</div>
              <div className='mt-1 text-3xl font-bold' style={{ color: '#22c55e' }}>
                {formatMoney(data.month.revenue)} so'm
              </div>
              <div className='mt-1 text-xs text-on-surface-variant'>
                {data.month.orders} ta buyurtma
              </div>
            </div>
            <span
              className='material-symbols-outlined fill-icon text-3xl'
              style={{ color: '#22c55e' }}
            >
              payments
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='flex items-start justify-between'>
            <div>
              <div className='text-sm text-on-surface-variant'>Kutilayotgan</div>
              <div
                className={`mt-1 text-3xl font-bold ${data.pending_orders > 0 ? 'text-amber-500' : 'text-on-surface-variant'}`}
              >
                {data.pending_orders} ta
              </div>
              <div className='mt-1 text-xs text-on-surface-variant'>
                {data.processing_orders} ta qayta ishlanmoqda
              </div>
            </div>
            <span
              className={`material-symbols-outlined text-3xl ${data.pending_orders > 0 ? 'text-amber-500' : 'text-on-surface-variant'}`}
            >
              schedule
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='flex items-start justify-between'>
            <div>
              <div className='text-sm text-on-surface-variant'>Kassadagi qoldiq</div>
              <div className='mt-1 text-3xl font-bold text-primary'>
                {formatMoney(data.kassa_balance)} so'm
              </div>
              <div className='mt-1 text-xs text-on-surface-variant'>
                Barcha tushumlar - chiqimlar
              </div>
            </div>
            <span className='material-symbols-outlined fill-icon text-3xl text-primary'>
              account_balance_wallet
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: 4 alert cards */}
      <div className='grid grid-cols-2 gap-4 xl:grid-cols-4'>
        <div
          className={`rounded-2xl border p-5 shadow-sm ${data.overdue_credits > 0 ? 'border-red-300 bg-red-50' : 'border-outline-variant bg-surface-container-lowest'}`}
        >
          <div className='flex items-start justify-between'>
            <div>
              <div className={`text-sm ${data.overdue_credits > 0 ? 'text-red-700' : 'text-on-surface-variant'}`}>
                Muddati o'tgan nasiyalar
              </div>
              <div className={`mt-1 text-3xl font-bold ${data.overdue_credits > 0 ? 'text-red-700' : 'text-on-surface-variant'}`}>
                {data.overdue_credits} ta
              </div>
            </div>
            <span className={`material-symbols-outlined text-3xl ${data.overdue_credits > 0 ? 'text-red-600' : 'text-on-surface-variant'}`}>
              warning
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='flex items-start justify-between'>
            <div>
              <div className='text-sm text-on-surface-variant'>Zaxirasi kam</div>
              <div className='mt-1 text-3xl font-bold text-amber-500'>{data.stock.low_stock} ta</div>
              <div className='mt-1 text-xs text-on-surface-variant'>1–5 dona qolgan</div>
            </div>
            <span className='material-symbols-outlined text-3xl text-amber-500'>inventory_2</span>
          </div>
        </div>
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='flex items-start justify-between'>
            <div>
              <div className='text-sm text-on-surface-variant'>Tugagan mahsulot</div>
              <div className={`mt-1 text-3xl font-bold ${data.stock.out_of_stock > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                {data.stock.out_of_stock} ta
              </div>
              <div className='mt-1 text-xs text-on-surface-variant'>Stokda 0 dona</div>
            </div>
            <span className={`material-symbols-outlined text-3xl ${data.stock.out_of_stock > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
              production_quantity_limits
            </span>
          </div>
        </div>
        <div
          className={`rounded-2xl border p-5 shadow-sm ${data.feedback_new > 0 ? 'border-blue-300 bg-blue-50' : 'border-outline-variant bg-surface-container-lowest'}`}
        >
          <div className='flex items-start justify-between'>
            <div>
              <div className={`text-sm ${data.feedback_new > 0 ? 'text-blue-700' : 'text-on-surface-variant'}`}>
                Yangi fikrlar
              </div>
              <div className={`mt-1 text-3xl font-bold ${data.feedback_new > 0 ? 'text-blue-700' : 'text-on-surface-variant'}`}>
                {data.feedback_new} ta
              </div>
              <div className={`mt-1 text-xs ${data.feedback_new > 0 ? 'text-blue-600' : 'text-on-surface-variant'}`}>
                {data.feedback_new > 0 ? 'Javob kutmoqda' : "Hammasi ko'rib chiqilgan"}
              </div>
            </div>
            <span className={`material-symbols-outlined text-3xl ${data.feedback_new > 0 ? 'text-blue-600' : 'text-on-surface-variant'}`}>
              forum
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Weekly chart + Status breakdown */}
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        {/* Weekly revenue chart */}
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='mb-4 flex items-center justify-between'>
            <h3 className='text-sm font-semibold text-on-surface'>Haftalik daromad (so'm)</h3>
            <span className='text-xs text-on-surface-variant'>Yetkazilgan buyurtmalar</span>
          </div>
          {(() => {
            const chart = data.weekly_chart || [];
            const maxRev = Math.max(...chart.map((d) => d.revenue), 1);
            const H = 96;
            const barW = 34;
            const gap = 10;
            return (
              <div className='overflow-x-auto'>
                <svg
                  viewBox={`0 0 ${chart.length * (barW + gap) - gap} ${H + 36}`}
                  className='w-full'
                  style={{ minHeight: 110 }}
                >
                  {chart.map((day, i) => {
                    const bh = Math.max((day.revenue / maxRev) * H, day.revenue > 0 ? 3 : 0);
                    const x = i * (barW + gap);
                    const lbl = day.date.slice(5).replace('-', '/');
                    return (
                      <g key={day.date}>
                        <title>{day.date}: {formatMoney(day.revenue)} so'm · {day.orders} buyurtma</title>
                        <rect
                          x={x} y={H - bh} width={barW} height={bh}
                          rx={5}
                          fill='currentColor'
                          className='text-primary opacity-70 hover:opacity-100 transition-opacity'
                        />
                        <text x={x + barW / 2} y={H + 14} textAnchor='middle' fontSize='10' fill='currentColor' className='text-on-surface-variant'>
                          {lbl}
                        </text>
                        {day.orders > 0 && (
                          <text x={x + barW / 2} y={H - bh - 5} textAnchor='middle' fontSize='9' fill='currentColor' className='text-on-surface-variant'>
                            {day.orders}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          })()}
        </div>

        {/* Status breakdown */}
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <h3 className='mb-4 text-sm font-semibold text-on-surface'>Status bo'yicha taqsimot</h3>
          <div className='flex flex-col gap-2'>
            {Object.entries(data.status_breakdown)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => {
                const total = Object.values(data.status_breakdown).reduce((s, n) => s + n, 0) || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={key} className='flex items-center gap-3'>
                    <span className={`inline-flex min-w-[110px] items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColors[key] || 'bg-surface-container text-on-surface-variant'}`}>
                      {statusLabels[key] || key}
                    </span>
                    <div className='flex-1 overflow-hidden rounded-full bg-surface-container' style={{ height: 8 }}>
                      <div
                        className='h-full rounded-full bg-primary/60 transition-all'
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className='min-w-[28px] text-right text-xs font-semibold text-on-surface'>{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Row 4: Recent orders table */}
      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
        <div className='border-b border-outline-variant px-5 py-4'>
          <h3 className='text-sm font-semibold text-on-surface'>So'nggi buyurtmalar</h3>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-outline-variant bg-surface-container-low text-xs text-on-surface-variant'>
                <th className='px-4 py-3 text-left'>#ID</th>
                <th className='px-4 py-3 text-left'>Xaridor</th>
                <th className='px-4 py-3 text-left'>Telefon</th>
                <th className='px-4 py-3 text-right'>Summa</th>
                <th className='px-4 py-3 text-left'>To'lov</th>
                <th className='px-4 py-3 text-left'>Status</th>
                <th className='px-4 py-3 text-left'>Sana</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_orders.map((order) => (
                <tr
                  key={order.id}
                  className='border-b border-outline-variant last:border-0 hover:bg-surface-container-low'
                >
                  <td className='px-4 py-3 font-semibold text-primary'>#{order.id}</td>
                  <td className='px-4 py-3 text-on-surface'>{order.receiver_name}</td>
                  <td className='px-4 py-3 text-on-surface-variant'>{order.receiver_phone}</td>
                  <td className='px-4 py-3 text-right font-semibold text-on-surface'>
                    {formatMoney(order.total_price)} so'm
                  </td>
                  <td className='px-4 py-3 text-on-surface-variant'>
                    {order.payment_method === 'CASH'
                      ? 'Naqd'
                      : order.payment_method === 'CARD'
                        ? 'Karta'
                        : order.payment_method === 'CREDIT'
                          ? 'Nasiya'
                          : order.payment_method}
                  </td>
                  <td className='px-4 py-3'>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getOrderStatusBadge(order.status)}`}
                    >
                      {getOrderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-on-surface-variant'>
                    {new Date(order.created_at).toLocaleString('uz-UZ', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

