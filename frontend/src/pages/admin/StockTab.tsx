// admin/StockTab.tsx — Ombor (kam qolgan zaxira) hisoboti. #N3: AdminPanel'dan
// AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminGetStockReport } from '../../api/endpoints';
import type { AdminStockItem } from './shared';

interface StockStats {
  total_products: number;
  total_stock: number;
  total_value: number;
  critical_count: number;
  low_count: number;
}


export const StockTab = () => {
  const [minStock, setMinStock] = useState(0);
  const [maxStock, setMaxStock] = useState(10);
  const [search, setSearch] = useState('');
  const params = useMemo(
    () => ({ min_stock: minStock, max_stock: maxStock }),
    [minStock, maxStock],
  );
  const { data, isLoading, isError, refetch } = useQuery<{ stats: StockStats; items: AdminStockItem[] }>({
    queryKey: ['admin-stock-report', params],
    queryFn: () => adminGetStockReport(params).then((r) => r.data),
    staleTime: 30_000,
  });
  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.variant_info && item.variant_info.toLowerCase().includes(q)),
    );
  }, [data, search]);
  const fmt = (v: number) => Math.round(v).toLocaleString('uz-UZ');
  const stats = data?.stats;
  const kpiCards = [
    {
      label: 'Jami pozitsiyalar',
      value: stats?.total_products ?? '—',
      unit: 'ta',
      icon: 'inventory_2',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Jami zaxira',
      value: stats ? fmt(stats.total_stock) : '—',
      unit: 'dona',
      icon: 'warehouse',
      color: 'text-secondary',
      bg: 'bg-secondary/10',
    },
    {
      label: 'Ombor qiymati',
      value: stats ? fmt(stats.total_value) : '—',
      unit: "so'm",
      icon: 'paid',
      color: 'text-[#22c55e]',
      bg: 'bg-[#22c55e]/10',
    },
    {
      label: 'Kritik (0 dona)',
      value: stats?.critical_count ?? '—',
      unit: 'ta',
      icon: 'priority_high',
      color: 'text-error',
      bg: 'bg-error/10',
    },
    {
      label: 'Kam qolgan (1–5)',
      value: stats?.low_count ?? '—',
      unit: 'ta',
      icon: 'warning',
      color: 'text-[#f59e0b]',
      bg: 'bg-[#f59e0b]/10',
    },
  ];
  return (
    <div className='space-y-6'>
      {/* KPI cards */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
        {kpiCards.map((c) => (
          <div
            key={c.label}
            className='flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm'
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} ${c.color}`}>
              <span className='material-symbols-outlined text-[20px]'>{c.icon}</span>
            </div>
            <p className='text-xs font-semibold uppercase text-on-surface-variant leading-tight'>{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>
              {isLoading ? <span className='material-symbols-outlined animate-spin text-[18px]'>progress_activity</span> : c.value}
              {!isLoading && <span className='ml-1 text-xs font-normal text-on-surface-variant'>{c.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
        <div className='flex flex-col gap-5 lg:flex-row lg:items-end'>
          <div className='flex-1'>
            <h3 className='mb-4 font-h3 text-lg text-on-surface'>Kam qolgan tovarlar filtri</h3>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
              <div>
                <label className='mb-1 block text-xs font-bold uppercase text-on-surface-variant'>
                  Min. qoldiq
                </label>
                <input
                  type='number'
                  value={minStock}
                  onChange={(e) => setMinStock(Number(e.target.value))}
                  className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
                />
              </div>
              <div>
                <label className='mb-1 block text-xs font-bold uppercase text-on-surface-variant'>
                  Max. qoldiq
                </label>
                <input
                  type='number'
                  value={maxStock}
                  onChange={(e) => setMaxStock(Number(e.target.value))}
                  className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
                />
              </div>
              <div className='sm:col-span-2'>
                <label className='mb-1 block text-xs font-bold uppercase text-on-surface-variant'>
                  Qidirish
                </label>
                <div className='relative'>
                  <span className='material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant'>
                    search
                  </span>
                  <input
                    type='text'
                    placeholder='Tovar nomi, SKU...'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className='w-full rounded-lg border border-outline-variant bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-primary'
                  />
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className='flex h-10 items-center gap-2 rounded-lg bg-primary px-5 font-label-md text-on-primary hover:opacity-90'
          >
            <span className='material-symbols-outlined text-[20px]'>refresh</span>Yangilash
          </button>
        </div>
      </div>
      <div className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
        <div className='flex items-center justify-between border-b border-outline-variant bg-surface-container px-5 py-3'>
          <h3 className='font-semibold text-on-surface'>
            Zaxira holati{' '}
            <span className='ml-2 text-sm font-normal text-on-surface-variant'>
              ({filteredItems.length} ta ko'rsatilmoqda)
            </span>
          </h3>
        </div>
        {isLoading ? (
          <div className='py-20 text-center'>
            <span className='material-symbols-outlined mb-2 block animate-spin text-5xl text-primary'>
              progress_activity
            </span>
            <p className='text-on-surface-variant'>Yuklanmoqda...</p>
          </div>
        ) : isError ? (
          <div className='py-20 text-center text-error'>
            <span className='material-symbols-outlined mb-2 text-5xl'>error</span>
            <p>Xatolik yuz berdi</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className='py-20 text-center'>
            <span className='material-symbols-outlined mb-3 block text-4xl text-outline'>
              inventory_2
            </span>
            <p className='text-on-surface-variant'>Topilmadi</p>
          </div>
        ) : (
          <>
          {/* ── MOBIL KARTALAR (telefon) ── */}
          <div className='divide-y divide-outline-variant md:hidden'>
            {filteredItems.map((item) => (
              <div key={`m-${item.type}-${item.id}`} className='flex gap-3 p-3'>
                <div className='h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-outline-variant bg-surface-container'>
                  {item.image ? (
                    <img src={item.image} alt={item.name} className='h-full w-full object-contain p-1' />
                  ) : (
                    <div className='flex h-full w-full items-center justify-center text-outline'>
                      <span className='material-symbols-outlined text-[20px]'>image</span>
                    </div>
                  )}
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-sm font-semibold text-on-surface'>{item.name}</div>
                  <div className='truncate text-xs text-on-surface-variant'>
                    {item.variant_info || 'Standart'} · {item.category_name || 'Kategoriyasiz'}
                  </div>
                  <div className='mt-1 flex flex-wrap items-center gap-2 text-xs'>
                    <span className='font-semibold text-on-surface'>{fmt(item.price)} so'm</span>
                    <span className='rounded bg-surface-container px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant'>{item.sku}</span>
                  </div>
                </div>
                <div className='flex shrink-0 flex-col items-center gap-1'>
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${item.status === 'critical' ? 'bg-error-container text-error' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}>
                    {item.stock}
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${item.status === 'critical' ? 'bg-error text-on-error' : 'bg-[#f59e0b] text-white'}`}>
                    {item.status === 'critical' ? 'Kritik' : 'Kam'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {/* ── DESKTOP JADVAL ── */}
          <div className='hidden overflow-x-auto md:block'>
            <table className='w-full min-w-[900px] text-left text-sm'>
              <thead className='bg-surface-container/60'>
                <tr>
                  {['Mahsulot', 'Variant', 'SKU', 'Narx', 'Qoldiq', 'Status'].map((h) => (
                    <th
                      key={h}
                      className='px-5 py-3 font-bold uppercase text-xs text-on-surface-variant'
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-outline-variant'>
                {filteredItems.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className='hover:bg-primary/5'>
                    <td className='px-5 py-4'>
                      <div className='flex items-center gap-3'>
                        <div className='h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-outline-variant bg-surface-container'>
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className='h-full w-full object-contain p-1'
                            />
                          ) : (
                            <div className='flex h-full w-full items-center justify-center text-outline'>
                              <span className='material-symbols-outlined text-[20px]'>image</span>
                            </div>
                          )}
                        </div>
                        <div className='min-w-0'>
                          <div className='font-semibold text-on-surface truncate max-w-[240px]'>
                            {item.name}
                          </div>
                          <div className='text-xs text-on-surface-variant'>
                            {item.category_name || 'Kategoriyasiz'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className='px-5 py-4 text-on-surface font-medium'>
                      {item.variant_info || <span className='text-outline italic'>Standart</span>}
                    </td>
                    <td className='px-5 py-4'>
                      <span className='rounded bg-surface-container px-2 py-1 font-mono text-[11px] text-on-surface-variant'>
                        {item.sku}
                      </span>
                    </td>
                    <td className='px-5 py-4 font-semibold text-on-surface'>
                      {fmt(item.price)} so'm
                    </td>
                    <td className='px-5 py-4 text-center'>
                      <div
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full font-bold ${item.status === 'critical' ? 'bg-error-container text-error' : 'bg-[#f59e0b]/10 text-[#f59e0b]'}`}
                      >
                        {item.stock}
                      </div>
                    </td>
                    <td className='px-5 py-4'>
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase ${item.status === 'critical' ? 'bg-error text-on-error' : 'bg-[#f59e0b] text-white'}`}
                      >
                        <span className='material-symbols-outlined text-[14px]'>
                          {item.status === 'critical' ? 'priority_high' : 'warning'}
                        </span>
                        {item.status === 'critical' ? 'Kritik holat' : 'Kam qoldi'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
};

