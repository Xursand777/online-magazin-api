// admin/NasiyaTab.tsx — Muddatli to'lov (nasiya) buyurtmalari va to'lovni qabul
// qilish. #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminGetOrders, adminPayCreditOrder } from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { CreditPayConfirmDialog } from './shared';
import type { AdminOrder } from './shared';

export const NasiyaTab = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'overdue' | 'paid'>('active');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const params = useMemo(
    () => ({
      is_credit: 'true',
      page,
      page_size: PAGE_SIZE,
    }),
    [page],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-nasiya', page],
    queryFn: () => adminGetOrders(params).then((r) => r.data as { count: number; next: string | null; results: AdminOrder[] }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => adminPayCreditOrder(id),
    onSuccess: () => {
      toast.success("Muddatli to'lov muvaffaqiyatli qabul qilindi!");
      qc.invalidateQueries({ queryKey: ['admin-nasiya'] });
      setNasiyaConfirmOrder(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Xatolik yuz berdi'),
  });

  const [nasiyaConfirmOrder, setNasiyaConfirmOrder] = useState<AdminOrder | null>(null);

  const fmt = (v: string | number) => Number(v || 0).toLocaleString('uz-UZ');
  const today = new Date();

  const allOrders: AdminOrder[] = data?.results ?? [];
  const filtered = useMemo(() => {
    if (filter === 'paid') return allOrders.filter((o) => o.credit_paid);
    if (filter === 'overdue')
      return allOrders.filter((o) => !o.credit_paid && o.credit_is_overdue);
    return allOrders.filter((o) => !o.credit_paid && !o.credit_is_overdue);
  }, [allOrders, filter]);

  const counts = useMemo(() => ({
    active: allOrders.filter((o) => !o.credit_paid && !o.credit_is_overdue).length,
    overdue: allOrders.filter((o) => !o.credit_paid && o.credit_is_overdue).length,
    paid: allOrders.filter((o) => o.credit_paid).length,
  }), [allOrders]);

  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  const FILTERS: { key: 'active' | 'overdue' | 'paid'; label: string; icon: string; color: string }[] = [
    { key: 'active', label: 'Faol nasiyalar', icon: 'schedule', color: 'text-primary' },
    { key: 'overdue', label: 'Muddati o\'tgan', icon: 'warning', color: 'text-error' },
    { key: 'paid', label: 'To\'langan', icon: 'check_circle', color: 'text-[#22c55e]' },
  ];

  return (
    <div className='space-y-6'>
      {/* Credit payment confirmation dialog */}
      <CreditPayConfirmDialog
        order={nasiyaConfirmOrder}
        isPending={payMutation.isPending}
        onConfirm={() => {
          if (nasiyaConfirmOrder) payMutation.mutate(nasiyaConfirmOrder.id);
        }}
        onCancel={() => !payMutation.isPending && setNasiyaConfirmOrder(null)}
      />

      <div>
        <h2 className='font-h3 text-h3 text-on-surface'>Nasiya Buyurtmalar</h2>
        <p className='mt-1 text-body-sm text-on-surface-variant'>
          Muddatli to'lov bilan amalga oshirilgan barcha buyurtmalar
        </p>
      </div>

      {/* Filter pills */}
      <div className='flex flex-wrap gap-2'>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all border ${
              filter === f.key
                ? 'bg-primary text-on-primary border-primary shadow-sm'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary'
            }`}
          >
            <span className={`material-symbols-outlined text-[18px] ${filter === f.key ? '' : f.color}`}>
              {f.icon}
            </span>
            {f.label}
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              filter === f.key ? 'bg-white/20 text-white' : 'bg-surface-container text-on-surface-variant'
            }`}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className='py-16 text-center'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-5xl text-primary'>
            progress_activity
          </span>
          <p className='text-on-surface-variant'>Yuklanmoqda...</p>
        </div>
      ) : isError ? (
        <div className='rounded-2xl border border-error-container bg-error-container/20 py-12 text-center text-error'>
          <span className='material-symbols-outlined mb-2 block text-4xl'>error</span>
          <p>Xatolik yuz berdi</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>calendar_month</span>
          <p className='font-semibold text-on-surface-variant'>
            {filter === 'paid' ? "To'langan nasiya yo'q" : filter === 'overdue' ? "Muddati o'tgan nasiya yo'q" : 'Faol nasiya yo\'q'}
          </p>
        </div>
      ) : (
        <>
        {/* ── MOBIL KARTALAR (telefon) ── */}
        <div className='divide-y divide-outline-variant overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest md:hidden'>
          {filtered.map((order) => {
            const dueDate = order.credit_due_date ? new Date(order.credit_due_date) : null;
            const diffDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000) : null;
            const isOverdue = order.credit_is_overdue;
            const isPaid = order.credit_paid;
            return (
              <div key={order.id} className={`p-3 ${isOverdue && !isPaid ? 'bg-error/5' : ''}`}>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-1.5'>
                      <span className='font-mono text-xs font-bold text-on-surface'>#{order.id}</span>
                      {isPaid ? (
                        <span className='rounded bg-[#22c55e]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#22c55e]'>To'langan</span>
                      ) : isOverdue ? (
                        <span className='rounded bg-error/10 px-1.5 py-0.5 text-[10px] font-bold text-error'>Muddati o'tdi</span>
                      ) : (
                        <span className='rounded bg-[#f59e0b]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#f59e0b]'>Kutilmoqda</span>
                      )}
                    </div>
                    <div className='mt-0.5 truncate text-sm font-semibold text-on-surface'>{order.receiver_name}</div>
                    <div className='text-xs text-on-surface-variant'>{order.receiver_phone}</div>
                  </div>
                  <div className='shrink-0 text-right'>
                    <div className='text-sm font-bold text-primary'>{fmt(order.total_price)} so'm</div>
                    {!isPaid && diffDays !== null && (
                      <div className={`text-xs font-semibold ${isOverdue ? 'text-error' : diffDays <= 3 ? 'text-[#f59e0b]' : 'text-on-surface-variant'}`}>
                        {isOverdue ? `${Math.abs(diffDays)} kun o'tdi` : `${diffDays} kun qoldi`}
                      </div>
                    )}
                  </div>
                </div>
                <div className='mt-2 flex items-center justify-between gap-2'>
                  <span className='text-xs text-on-surface-variant'>
                    {order.credit_days ?? '—'} kun · {dueDate ? dueDate.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                  </span>
                  {!isPaid && (
                    <button
                      onClick={() => setNasiyaConfirmOrder(order)}
                      disabled={payMutation.isPending}
                      className='flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:opacity-90 disabled:opacity-50'
                    >
                      <span className='material-symbols-outlined text-[14px]'>payments</span>
                      To'landi
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* ── DESKTOP JADVAL ── */}
        <div className='hidden overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm md:block'>
          <table className='w-full min-w-[900px] text-left text-sm'>
            <thead className='bg-surface-container'>
              <tr>
                {['Chek #', 'Xaridor', 'Summa', 'Muddat (kun)', 'To\'lov sanasi', 'Qolgan / O\'tgan', 'Holat', 'Amal'].map((h) => (
                  <th key={h} className='px-4 py-3 text-xs font-bold uppercase text-on-surface-variant'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-outline-variant'>
              {filtered.map((order) => {
                const dueDate = order.credit_due_date ? new Date(order.credit_due_date) : null;
                const diffDays = dueDate
                  ? Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000)
                  : null;
                const isOverdue = order.credit_is_overdue;
                const isPaid = order.credit_paid;

                return (
                  <tr key={order.id} className={`transition-colors ${isOverdue && !isPaid ? 'bg-error/5 hover:bg-error/10' : 'hover:bg-primary/5'}`}>
                    <td className='px-4 py-3 font-mono font-bold text-on-surface'>#{order.id}</td>
                    <td className='px-4 py-3'>
                      <div className='font-semibold text-on-surface'>{order.receiver_name}</div>
                      <div className='text-xs text-on-surface-variant'>{order.receiver_phone}</div>
                    </td>
                    <td className='px-4 py-3 font-bold text-primary'>{fmt(order.total_price)} so'm</td>
                    <td className='px-4 py-3 text-center'>
                      <span className='rounded-lg bg-surface-container px-2 py-1 font-mono font-bold text-on-surface'>
                        {order.credit_days ?? '—'} kun
                      </span>
                    </td>
                    <td className='px-4 py-3 text-on-surface'>
                      {dueDate
                        ? dueDate.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className='px-4 py-3'>
                      {isPaid ? (
                        <span className='text-xs text-[#22c55e] font-semibold'>
                          {order.credit_paid_at
                            ? new Date(order.credit_paid_at).toLocaleDateString('uz-UZ')
                            : 'To\'langan'}
                        </span>
                      ) : diffDays !== null ? (
                        <span className={`text-sm font-bold ${isOverdue ? 'text-error' : diffDays <= 3 ? 'text-[#f59e0b]' : 'text-on-surface'}`}>
                          {isOverdue
                            ? `${Math.abs(diffDays)} kun o'tdi`
                            : `${diffDays} kun qoldi`}
                        </span>
                      ) : '—'}
                    </td>
                    <td className='px-4 py-3'>
                      {isPaid ? (
                        <span className='inline-flex items-center gap-1 rounded-lg bg-[#22c55e]/10 px-2 py-1 text-xs font-bold text-[#22c55e]'>
                          <span className='material-symbols-outlined text-[14px]'>check_circle</span>
                          To'langan
                        </span>
                      ) : isOverdue ? (
                        <span className='inline-flex items-center gap-1 rounded-lg bg-error/10 px-2 py-1 text-xs font-bold text-error'>
                          <span className='material-symbols-outlined text-[14px]'>warning</span>
                          Muddati o'tdi
                        </span>
                      ) : (
                        <span className='inline-flex items-center gap-1 rounded-lg bg-[#f59e0b]/10 px-2 py-1 text-xs font-bold text-[#f59e0b]'>
                          <span className='material-symbols-outlined text-[14px]'>schedule</span>
                          Kutilmoqda
                        </span>
                      )}
                    </td>
                    <td className='px-4 py-3'>
                      {!isPaid && (
                        <button
                          onClick={() => setNasiyaConfirmOrder(order)}
                          disabled={payMutation.isPending}
                          className='flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity'
                        >
                          <span className='material-symbols-outlined text-[14px]'>payments</span>
                          To'landi
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-center gap-2'>
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className='rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-40'
          >
            <span className='material-symbols-outlined text-[18px]'>chevron_left</span>
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`min-w-[32px] rounded-lg px-2 py-1 text-xs font-medium ${p === page ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}
              >
                {p}
              </button>
            );
          })}
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className='rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-40'
          >
            <span className='material-symbols-outlined text-[18px]'>chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
};
