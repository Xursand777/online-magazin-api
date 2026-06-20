// admin/KassaTab.tsx — Kassa (tushum/chiqim balansi, pul yechish). #N3:
// AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { adminGetKassa, adminWithdrawKassa } from '../../api/endpoints';
import { toast } from '../../utils/toast';

interface KassaData {
  total_income: number;
  total_expense: number;
  balance: number;
  payment_breakdown: { cash: number; card: number; credit: number };
  weekly_chart: Array<{ date: string; income: number }>;
  history: {
    id: number;
    amount: number;
    reason: string;
    created_at: string;
    admin_name: string;
  }[];
}


export const KassaTab = () => {
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const { data, isLoading, refetch } = useQuery<KassaData>({
    queryKey: ['admin-kassa'],
    queryFn: () => adminGetKassa().then((r) => r.data),
    staleTime: 0,
  });

  const withdrawMutation = useMutation({
    mutationFn: () => adminWithdrawKassa({ amount: Number(amount), reason }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Muvaffaqiyatli yechildi!');
      setShowModal(false);
      setAmount('');
      setReason('');
      refetch();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Xatolik yuz berdi');
    },
  });

  const fmt = (v?: number) => (v || 0).toLocaleString('uz-UZ');

  if (isLoading) {
    return (
      <div className='py-16 text-center'>
        <span className='material-symbols-outlined mb-2 block animate-spin text-5xl text-primary'>
          progress_activity
        </span>
        <p className='text-on-surface-variant'>Yuklanmoqda...</p>
      </div>
    );
  }

  // Weekly chart helpers
  const chart = data?.weekly_chart ?? [];
  const maxIncome = Math.max(...chart.map((d) => d.income), 1);
  const barW = 28;
  const gap = 10;
  const H = 80;
  const DAY_SHORT = ['Yak', 'Du', 'Se', 'Ch', 'Pa', 'Sh', 'Ya'];

  const bd = data?.payment_breakdown ?? { cash: 0, card: 0, credit: 0 };
  const totalIncome = data?.total_income || 1;
  const breakdownItems = [
    { label: 'Naqd pul', icon: 'payments', value: bd.cash, color: 'text-[#22c55e]', bg: 'bg-[#22c55e]/10', bar: 'bg-[#22c55e]' },
    { label: 'Plastik karta', icon: 'credit_card', value: bd.card, color: 'text-primary', bg: 'bg-primary/10', bar: 'bg-primary' },
    { label: 'Nasiya', icon: 'calendar_month', value: bd.credit, color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/10', bar: 'bg-[#f59e0b]' },
  ];

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Moliya va Kassa</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Kassadagi haqiqiy mablag', to'lov usullari va chiqimlar tarixi
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className='flex items-center gap-2 rounded-xl border-2 border-error px-5 py-2.5 font-bold text-error hover:bg-error/10 transition-all'
        >
          <span className='material-symbols-outlined'>money_off</span>
          Pul Yechish
        </button>
      </div>

      {/* Main KPI cards */}
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        <div className='flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden'>
          <div className='absolute -right-4 -top-4 opacity-5'>
            <span className='material-symbols-outlined text-[120px]'>add_circle</span>
          </div>
          <div className='flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#22c55e]/10 text-[#22c55e]'>
            <span className='material-symbols-outlined text-3xl'>payments</span>
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-semibold uppercase text-on-surface-variant mb-1'>Barcha tushumlar</p>
            <p className='text-2xl font-bold text-[#22c55e]'>{fmt(data?.total_income)} <span className='text-base font-normal'>so'm</span></p>
          </div>
        </div>
        <div className='flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm relative overflow-hidden'>
          <div className='absolute -right-4 -top-4 opacity-5'>
            <span className='material-symbols-outlined text-[120px]'>remove_circle</span>
          </div>
          <div className='flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-error/10 text-error'>
            <span className='material-symbols-outlined text-3xl'>money_off</span>
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-semibold uppercase text-on-surface-variant mb-1'>Jami chiqimlar</p>
            <p className='text-2xl font-bold text-error'>{fmt(data?.total_expense)} <span className='text-base font-normal'>so'm</span></p>
          </div>
        </div>
        <div className='flex items-center gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-6 shadow-md relative overflow-hidden'>
          <div className='absolute -right-4 -top-4 opacity-10'>
            <span className='material-symbols-outlined text-[120px]'>account_balance_wallet</span>
          </div>
          <div className='flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-sm'>
            <span className='material-symbols-outlined text-3xl'>account_balance_wallet</span>
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-bold uppercase text-primary mb-1'>Kassadagi Qoldiq</p>
            <p className='text-3xl font-black text-on-surface'>{fmt(data?.balance)} <span className='text-lg font-bold'>so'm</span></p>
          </div>
        </div>
      </div>

      {/* Payment breakdown + weekly chart */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {/* Payment breakdown */}
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
          <h3 className='mb-5 flex items-center gap-2 font-semibold text-on-surface'>
            <span className='material-symbols-outlined text-primary text-[20px]'>pie_chart</span>
            To'lov usullari bo'yicha tushum
          </h3>
          <div className='space-y-4'>
            {breakdownItems.map((b) => {
              const pct = totalIncome > 0 ? Math.round((b.value / totalIncome) * 100) : 0;
              return (
                <div key={b.label}>
                  <div className='flex items-center justify-between mb-1.5'>
                    <div className='flex items-center gap-2'>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${b.bg} ${b.color}`}>
                        <span className='material-symbols-outlined text-[16px]'>{b.icon}</span>
                      </span>
                      <span className='text-sm font-medium text-on-surface'>{b.label}</span>
                    </div>
                    <div className='text-right'>
                      <span className={`text-sm font-bold ${b.color}`}>{fmt(b.value)} so'm</span>
                      <span className='ml-2 text-xs text-on-surface-variant'>({pct}%)</span>
                    </div>
                  </div>
                  <div className='h-2 rounded-full bg-surface-container overflow-hidden'>
                    <div
                      className={`h-full rounded-full ${b.bar} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly chart */}
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
          <h3 className='mb-5 flex items-center gap-2 font-semibold text-on-surface'>
            <span className='material-symbols-outlined text-primary text-[20px]'>bar_chart</span>
            Haftalik tushum (oxirgi 7 kun)
          </h3>
          {chart.length > 0 ? (
            <svg
              viewBox={`0 0 ${chart.length * (barW + gap) - gap} ${H + 40}`}
              className='w-full'
              aria-label='Haftalik tushum grafigi'
            >
              {chart.map((day, i) => {
                const bh = Math.max((day.income / maxIncome) * H, day.income > 0 ? 4 : 0);
                const x = i * (barW + gap);
                const dt = new Date(day.date);
                const lbl = DAY_SHORT[dt.getDay()];
                const hasIncome = day.income > 0;
                return (
                  <g key={day.date}>
                    <title>{day.date}: {fmt(day.income)} so'm</title>
                    <rect
                      x={x} y={H - bh} width={barW} height={bh} rx={6}
                      fill='currentColor'
                      className={`${hasIncome ? 'text-primary opacity-75 hover:opacity-100' : 'text-outline-variant opacity-40'} transition-opacity`}
                    />
                    <text
                      x={x + barW / 2} y={H + 16}
                      textAnchor='middle' fontSize='10' fill='currentColor'
                      className='text-on-surface-variant'
                    >
                      {lbl}
                    </text>
                    {hasIncome && (
                      <text
                        x={x + barW / 2} y={H - bh - 5}
                        textAnchor='middle' fontSize='8' fill='currentColor'
                        className='text-primary font-bold'
                      >
                        {(day.income / 1_000_000).toFixed(1)}M
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className='flex h-[120px] items-center justify-center text-on-surface-variant'>
              <span className='material-symbols-outlined mr-2 text-3xl opacity-40'>bar_chart</span>
              Ma'lumot yo'q
            </div>
          )}
          <p className='mt-2 text-center text-xs text-on-surface-variant'>
            Faqat yetkazilgan buyurtmalar hisoblanadi
          </p>
        </div>
      </div>

      {/* Withdrawal history */}
      <div className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
        <div className='border-b border-outline-variant bg-surface-container px-6 py-4 flex items-center justify-between'>
          <h3 className='font-bold text-on-surface flex items-center gap-2'>
            <span className='material-symbols-outlined text-primary'>history</span>
            Chiqimlar Tarixi (Ledger)
          </h3>
          <span className='text-sm font-semibold text-on-surface-variant bg-surface px-3 py-1 rounded-full border border-outline-variant'>
            {data?.history?.length || 0} ta yozuv
          </span>
        </div>
        {/* ── MOBIL KARTALAR (telefon) ── */}
        <div className='divide-y divide-outline-variant md:hidden'>
          {(data?.history?.length ?? 0) === 0 ? (
            <div className='px-4 py-10 text-center text-on-surface-variant'>
              <span className='material-symbols-outlined mb-2 block text-4xl opacity-50'>receipt_long</span>
              Hozircha hech qanday pul yechilmagan
            </div>
          ) : (
            data?.history?.map((w) => (
              <div key={w.id} className='flex items-start justify-between gap-2 p-3'>
                <div className='min-w-0 flex-1'>
                  <div className='text-sm font-medium text-on-surface'>{w.reason}</div>
                  <div className='mt-0.5 text-xs text-on-surface-variant'>
                    {new Date(w.created_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className='mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant'>
                    <span className='material-symbols-outlined text-[14px]'>account_circle</span>
                    {w.admin_name}
                  </div>
                </div>
                <div className='shrink-0 text-sm font-bold text-error'>−{fmt(w.amount)} so'm</div>
              </div>
            ))
          )}
        </div>
        {/* ── DESKTOP JADVAL ── */}
        <div className='hidden overflow-x-auto md:block'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-surface-container/40 border-b border-outline-variant'>
              <tr>
                <th className='px-6 py-3 font-bold uppercase text-xs text-on-surface-variant'>No</th>
                <th className='px-6 py-3 font-bold uppercase text-xs text-on-surface-variant'>Sana va Vaqt</th>
                <th className='px-6 py-3 font-bold uppercase text-xs text-on-surface-variant'>Yechilgan Miqdor</th>
                <th className='px-6 py-3 font-bold uppercase text-xs text-on-surface-variant'>Maqsad (Izoh)</th>
                <th className='px-6 py-3 font-bold uppercase text-xs text-on-surface-variant'>Admin</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-outline-variant'>
              {data?.history?.map((w, i) => (
                <tr key={w.id} className='hover:bg-primary/5 transition-colors'>
                  <td className='px-6 py-3 font-semibold text-on-surface-variant'>{i + 1}</td>
                  <td className='px-6 py-3 text-on-surface'>
                    {new Date(w.created_at).toLocaleString('uz-UZ', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className='px-6 py-3 font-bold text-error'>−{fmt(w.amount)} so'm</td>
                  <td className='px-6 py-3 text-on-surface font-medium'>{w.reason}</td>
                  <td className='px-6 py-3 text-on-surface-variant'>
                    <div className='flex items-center gap-1.5'>
                      <span className='material-symbols-outlined text-[16px]'>account_circle</span>
                      {w.admin_name}
                    </div>
                  </td>
                </tr>
              ))}
              {(!data?.history || data.history.length === 0) && (
                <tr>
                  <td colSpan={5} className='px-6 py-12 text-center text-on-surface-variant'>
                    <span className='material-symbols-outlined text-4xl opacity-50 mb-2 block'>receipt_long</span>
                    Hozircha hech qanday pul yechilmagan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdraw modal */}
      {showModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
          <div className='w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl relative'>
            <button
              onClick={() => setShowModal(false)}
              className='absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface hover:bg-outline-variant transition-colors'
            >
              <span className='material-symbols-outlined text-[20px]'>close</span>
            </button>
            <h3 className='font-h3 text-h3 text-on-surface flex items-center gap-2 mb-6'>
              <span className='material-symbols-outlined text-error text-3xl'>money_off</span>
              Pul Yechish
            </h3>
            <div className='mb-6 bg-surface-container p-4 rounded-xl border border-outline-variant flex justify-between items-center'>
              <span className='font-semibold text-on-surface-variant'>Kassadagi Qoldiq:</span>
              <span className='font-bold text-lg text-primary'>{fmt(data?.balance)} so'm</span>
            </div>
            <div className='space-y-4'>
              <div>
                <label className='mb-1.5 block text-sm font-bold text-on-surface'>
                  Yechiladigan summa (so'm) <span className='text-error'>*</span>
                </label>
                <input
                  type='number'
                  min='0'
                  max={data?.balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder='Masalan: 1500000'
                  className='w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 font-semibold text-lg focus:border-primary focus:outline-none'
                />
              </div>
              <div>
                <label className='mb-1.5 block text-sm font-bold text-on-surface'>
                  Maqsad / Izoh <span className='text-error'>*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Pul nima uchun yechilmoqda? (Kuryerga, Ijara uchun...)"
                  rows={3}
                  className='w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none'
                />
              </div>
            </div>
            <div className='mt-8 flex justify-end gap-3'>
              <button
                onClick={() => setShowModal(false)}
                className='rounded-xl border border-outline px-6 py-2.5 font-bold text-on-surface hover:bg-surface-container transition-colors'
              >
                Bekor qilish
              </button>
              <button
                onClick={() => withdrawMutation.mutate()}
                disabled={withdrawMutation.isPending || !amount || !reason || Number(amount) <= 0 || Number(amount) > (data?.balance || 0)}
                className='rounded-xl bg-error px-6 py-2.5 font-bold text-white shadow-md hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2'
              >
                {withdrawMutation.isPending ? (
                  <span className='material-symbols-outlined animate-spin text-[20px]'>progress_activity</span>
                ) : (
                  <span className='material-symbols-outlined text-[20px]'>check_circle</span>
                )}
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

