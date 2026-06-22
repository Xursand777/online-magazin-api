// ─────────────────────────────────────────────────────────────────────────────
//  admin/ReportsTab.tsx — Hisobotlar (KPI, vaqt qatori, mahsulot statistikasi,
//  cheklar). #N3: AdminPanel.tsx monolitidan AYNAN ko'chirildi.
//  Report* tiplari va sana konstantalari faqat shu tabda ishlatiladi — shu yerda.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, Fragment } from 'react';
import type ExcelJSNS from 'exceljs';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { printReport } from '../../utils/reportPrinter';
import { loadShopInfo } from '../../utils/shopInfoCache';
import { adminGetReport, adminGetReportOrders, fetchAllReportOrders } from '../../api/endpoints';
import { toast } from '../../utils/toast';

interface ReportSummary {
  total_revenue: number;
  total_discount: number;
  total_cost: number;
  avg_order_value: number;
  total_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  net_profit: number;
  // Phase 3.5 — qaytarish (returns) maydonlari
  returns_amount: number;
  returns_count: number;
  replacement_amount: number;
  replacement_count: number;
  recovered_cost: number;
  net_revenue: number;
  net_profit_after_returns: number;
  return_rate: number;
}
interface ReportProduct {
  rank: number;
  id: number;
  name: string;
  quality: string;
  model: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  price_usd: number | null;
  discount_price: number | null;
  discount_price_usd: number | null;
  sold_price: number;
  cost_price: number;
  stock: number;
  quantity_sold: number;
  total_revenue: number;
  net_profit: number;
  // Phase 3.5 — per-product qaytarish maydonlari
  quantity_returned: number;
  net_quantity_sold: number;
  total_refunded: number;
  net_revenue: number;
  return_rate: number;
  net_profit_after_returns: number;
}
interface ReportTimeline {
  date: string;
  revenue: number;
  discount: number;
  count: number;
}
interface ReportOrderItem {
  id: number;
  product_name: string;
  variant_str: string;
  quantity: number;
  original_price: number;
  sold_price: number;
  discount_percent: number;
  discount_amount: number;
}

interface ReportOrder {
  id: number;
  created_at: string;
  receiver_name: string;
  receiver_phone: string;
  total_price: number;
  total_discount: number;
  items: ReportOrderItem[];
}

interface ReportData {
  summary: ReportSummary;
  timeline: ReportTimeline[];
  products: ReportProduct[];
  orders: ReportOrder[];
}

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR_START = `${new Date().getFullYear()}-01-01`;
const MONTH_START = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

export const ReportsTab = () => {
  const [subTab, setSubTab] = useState<'general' | 'sales'>('general');
  const [dateFrom, setDateFrom] = useState(MONTH_START);
  const [dateTo, setDateTo] = useState(TODAY);
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const params = useMemo(
    () => ({ date_from: dateFrom || undefined, date_to: dateTo || undefined, period }),
    [dateFrom, dateTo, period],
  );
  const { data, isLoading, isError, refetch } = useQuery<ReportData>({
    queryKey: ['admin-report', params],
    queryFn: () => adminGetReport(params).then((r) => r.data),
    staleTime: 30_000,
  });

  // ⚠ REGRESSIYA TUZATILDI (commit 91499a8): cheklar endi alohida
  // paginatsiyalangan endpoint orqali keladi (/orders/admin/report/orders/).
  // AdminReportView'dan 'orders' maydoni olib tashlangan edi — sales tabi
  // BO'SH ko'rinardi. Endi useInfiniteQuery bilan tartibli yuklanadi:
  //   • Birinchi sahifa: 20 ta chek
  //   • "Yana yuklash" tugmasi yoki skroll uchidagi avtomat fetchNextPage
  //   • Sanani o'zgartirilsa avtomat qayta yuklanadi (queryKey'da params)
  //   • Faqat 'sales' subTab faol bo'lganda yuklanadi (enabled)
  const ordersInfQuery = useInfiniteQuery({
    queryKey: ['admin-report-orders', params],
    queryFn: ({ pageParam = 1 }) =>
      adminGetReportOrders({
        date_from: params.date_from,
        date_to: params.date_to,
        page: pageParam,
        page_size: 20,
      }).then((r) => r.data),
    getNextPageParam: (lastPage) => {
      if (!lastPage?.next) return undefined;
      const m = /[?&]page=(\d+)/.exec(lastPage.next);
      return m ? parseInt(m[1], 10) : undefined;
    },
    initialPageParam: 1,
    enabled: subTab === 'sales', // faqat kerakli tabda
    staleTime: 30_000,
  });

  // Barcha sahifalarning natijalarini bitta tekis massivga birlashtiramiz.
  // Backend `order_by('-created_at')` — eng yangi tepada.
  type ReportOrder = NonNullable<ReportData['orders']>[number];
  const orders: ReportOrder[] = useMemo(
    () =>
      (ordersInfQuery.data?.pages ?? []).flatMap(
        (p) => (p?.results as ReportOrder[]) ?? [],
      ),
    [ordersInfQuery.data],
  );
  const ordersTotalCount: number =
    ordersInfQuery.data?.pages?.[0]?.count ?? orders.length;
  const summary: ReportSummary = data?.summary ?? {
    total_revenue: 0,
    total_discount: 0,
    total_cost: 0,
    avg_order_value: 0,
    total_orders: 0,
    delivered_orders: 0,
    cancelled_orders: 0,
    pending_orders: 0,
    net_profit: 0,
    returns_amount: 0,
    returns_count: 0,
    replacement_amount: 0,
    replacement_count: 0,
    recovered_cost: 0,
    net_revenue: 0,
    net_profit_after_returns: 0,
    return_rate: 0,
  };
  const allProducts: ReportProduct[] = data?.products ?? [];
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return allProducts;
    const q = search.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.quality?.toLowerCase().includes(q) ||
        p.color?.toLowerCase().includes(q) ||
        p.model?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q),
    );
  }, [allProducts, search]);
  const setQuickPeriod = (preset: 'today' | 'month' | 'year' | 'all') => {
    if (preset === 'today') {
      setDateFrom(TODAY);
      setDateTo(TODAY);
      setPeriod('daily');
    } else if (preset === 'month') {
      setDateFrom(MONTH_START);
      setDateTo(TODAY);
      setPeriod('daily');
    } else if (preset === 'year') {
      setDateFrom(YEAR_START);
      setDateTo(TODAY);
      setPeriod('monthly');
    } else {
      setDateFrom('');
      setDateTo('');
      setPeriod('monthly');
    }
  };
  // ── Eksport uchun umumiy ma'lumot yig'ish (barcha cheklar + do'kon info) ────
  const MONEY_FMT = '#,##0';
  const rangeLabel = dateFrom || dateTo ? `${dateFrom || '...'} — ${dateTo || '...'}` : 'Barcha vaqt';

  const gatherExportData = async () => {
    const info = loadShopInfo();
    const shop = { name: info.name || 'Bozor', phone: info.phone, address: info.address };
    // Sana oralig'idagi BARCHA cheklarni olamiz (infinite-scroll emas)
    const rawOrders = (await fetchAllReportOrders({
      date_from: params.date_from,
      date_to: params.date_to,
    })) as ReportOrder[];
    return { shop, orders: rawOrders, products: allProducts };
  };

  const exportPdf = async () => {
    if (exporting) return;
    if (!allProducts.length && !orders.length) {
      toast.error("Eksport qilish uchun ma'lumot yo'q");
      return;
    }
    setExporting(true);
    toast.info('Hisobot tayyorlanmoqda...');
    try {
      const { shop, orders: allOrders } = await gatherExportData();
      printReport({ summary, products: allProducts, orders: allOrders, shop, dateFrom, dateTo });
    } catch {
      toast.error('Hisobotni tayyorlashda xatolik');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    if (exporting) return;
    if (!allProducts.length && !orders.length) {
      toast.error("Eksport qilish uchun ma'lumot yo'q");
      return;
    }
    setExporting(true);
    toast.info('Excel tayyorlanmoqda...');
    try {
      // Dynamic import — exceljs (~165KB) faqat eksport bosilganda yuklanadi,
      // har bir admin sahifa ochishida emas (yengil initial load).
      const ExcelJS = (await import('exceljs')).default;
      const { shop, orders: allOrders } = await gatherExportData();
      const wb = new ExcelJS.Workbook();
      wb.creator = shop.name;
      wb.created = new Date();

      const styleHeader = (row: ExcelJSNS.Row) => {
        row.height = 20;
        row.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A7C55' } };
          cell.alignment = { vertical: 'middle' };
        });
      };

      // ── 1) Xulosa ──
      const s1 = wb.addWorksheet('Xulosa');
      s1.columns = [{ width: 26 }, { width: 22 }];
      const title = s1.addRow([shop.name]);
      title.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF0A7C55' } };
      s1.addRow(['Savdo hisoboti']).getCell(1).font = { bold: true, size: 12 };
      s1.addRow(['Davr', rangeLabel]);
      s1.addRow(['Yaratilgan', new Date().toLocaleString('uz-UZ')]);
      s1.addRow([]);
      ([
        ['Jami tushum (yalpi)', summary.total_revenue],
        ['Yalpi foyda', summary.net_profit],
        ['Jami chegirma', summary.total_discount],
        ['Jami xarajat (kirim)', summary.total_cost],
        ["O'rtacha buyurtma", summary.avg_order_value],
        ['Jami buyurtmalar', summary.total_orders],
        ['Yetkazildi', summary.delivered_orders],
        ['Bekor qilindi', summary.cancelled_orders],
        ['Kutilmoqda', summary.pending_orders],
        // Phase 3.5 — Qaytarish blok'i (faqat returns bo'lsa)
        ['— QAYTARISHLAR —', 0],
        ['Pul qaytarildi (cash)', summary.returns_amount],
        ['Qaytarishlar soni', summary.returns_count],
        ['Almashtirildi soni', summary.replacement_count],
        ['Almashtirildi summa', summary.replacement_amount],
        ['Stokga qaytgan tannarx', summary.recovered_cost],
        ['Sof tushum (net)', summary.net_revenue],
        ['Sof foyda (after returns)', summary.net_profit_after_returns],
        ['Qaytarish darajasi %', summary.return_rate],
      ] as [string, number][]).forEach(([label, val]) => {
        const r = s1.addRow([label, val]);
        r.getCell(1).font = { bold: true };
        r.getCell(2).numFmt = MONEY_FMT;
      });

      // ── 2) Tovarlar ──
      const s2 = wb.addWorksheet('Tovarlar');
      // Phase 3.5: Qaytdi, Sof, %, Sof tushum, Sof foyda — qo'shildi.
      s2.addRow(['#', 'Tovar nomi', 'Sifat', 'Model', 'Xotira', 'Rang', 'SKU',
        'Narx', 'Chegirma', 'Sotilgan narx', 'Kirim', 'Sotildi (dona)',
        'Qaytdi', 'Sof (dona)', 'Qaytarish %',
        'Yalpi tushum', 'Sof tushum', 'Yalpi foyda', 'Sof foyda']);
      s2.columns = [{ width: 5 }, { width: 30 }, { width: 12 }, { width: 14 }, { width: 12 },
        { width: 12 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 14 },
        { width: 13 }, { width: 13 }, { width: 10 }, { width: 12 }, { width: 12 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
      styleHeader(s2.getRow(1));
      allProducts.forEach((p) => {
        const r = s2.addRow([p.rank, p.name, p.quality || '', p.model || '', p.size || '',
          p.color || '', p.sku || '', p.price, p.discount_price ?? null, p.sold_price,
          p.cost_price, p.quantity_sold,
          p.quantity_returned, p.net_quantity_sold, p.return_rate,
          p.total_revenue, p.net_revenue, p.net_profit, p.net_profit_after_returns]);
        // Pul ustunlari format: 8 narx, 9 chegirma, 10 sotilgan, 11 kirim, 16 yalpi
        // tushum, 17 sof tushum, 18 yalpi foyda, 19 sof foyda.
        [8, 9, 10, 11, 16, 17, 18, 19].forEach((c) => (r.getCell(c).numFmt = MONEY_FMT));
      });
      const pTot = allProducts.reduce(
        (a, p) => ({
          qty: a.qty + p.quantity_sold,
          ret: a.ret + (p.quantity_returned || 0),
          net_qty: a.net_qty + (p.net_quantity_sold || 0),
          rev: a.rev + p.total_revenue,
          net_rev: a.net_rev + (p.net_revenue || 0),
          profit: a.profit + p.net_profit,
          net_profit: a.net_profit + (p.net_profit_after_returns || 0),
        }),
        { qty: 0, ret: 0, net_qty: 0, rev: 0, net_rev: 0, profit: 0, net_profit: 0 },
      );
      const pTotRow = s2.addRow(['', 'JAMI', '', '', '', '', '', '', '', '', '',
        pTot.qty, pTot.ret, pTot.net_qty, '',
        pTot.rev, pTot.net_rev, pTot.profit, pTot.net_profit]);
      pTotRow.font = { bold: true };
      [16, 17, 18, 19].forEach((c) => (pTotRow.getCell(c).numFmt = MONEY_FMT));
      s2.autoFilter = 'A1:S1';
      s2.views = [{ state: 'frozen', ySplit: 1 }];

      // ── 3) Buyurtmalar (barcha cheklar) ──
      const s3 = wb.addWorksheet('Buyurtmalar');
      s3.addRow(['ID', 'Sana', 'Qabul qiluvchi', 'Telefon', 'Dona', 'Chegirma', 'Summa']);
      s3.columns = [{ width: 8 }, { width: 20 }, { width: 24 }, { width: 16 },
        { width: 8 }, { width: 14 }, { width: 16 }];
      styleHeader(s3.getRow(1));
      allOrders.forEach((o) => {
        const itemsCount = (o.items ?? []).reduce((s, it) => s + (it.quantity || 0), 0);
        const r = s3.addRow([o.id, new Date(o.created_at).toLocaleString('uz-UZ'),
          o.receiver_name, o.receiver_phone || '', itemsCount,
          Number(o.total_discount ?? 0), Number(o.total_price ?? 0)]);
        [6, 7].forEach((c) => (r.getCell(c).numFmt = MONEY_FMT));
      });
      const oTot = allOrders.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
      const oTotRow = s3.addRow(['', '', '', 'JAMI', '', '', oTot]);
      oTotRow.font = { bold: true };
      oTotRow.getCell(7).numFmt = MONEY_FMT;
      s3.autoFilter = 'A1:G1';
      s3.views = [{ state: 'frozen', ySplit: 1 }];

      // ── Yuklab olish ──
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bozor_hisobot_${dateFrom || 'all'}_${dateTo || 'all'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel fayl yuklab olindi!');
    } catch {
      toast.error('Excel tayyorlashda xatolik');
    } finally {
      setExporting(false);
    }
  };
  const fmt = (v: number) => v.toLocaleString('uz-UZ');
  const kpiCards = [
    {
      label: 'Jami Tushum',
      value: `${fmt(summary.total_revenue)} so'm`,
      icon: 'payments',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Sof Foyda',
      value: `${fmt(summary.net_profit)} so'm`,
      icon: 'trending_up',
      color: 'text-tertiary',
      bg: 'bg-tertiary/10',
    },
    {
      label: 'Jami Buyurtmalar',
      value: String(summary.total_orders),
      icon: 'receipt_long',
      color: 'text-secondary',
      bg: 'bg-secondary/10',
    },
    {
      label: 'Yetkazildi',
      value: String(summary.delivered_orders),
      icon: 'local_shipping',
      color: 'text-[#22c55e]',
      bg: 'bg-[#22c55e]/10',
    },
    {
      label: 'Bekor Qilindi',
      value: String(summary.cancelled_orders),
      icon: 'cancel',
      color: 'text-error',
      bg: 'bg-error/10',
    },
    {
      label: 'Kutilmoqda',
      value: String(summary.pending_orders),
      icon: 'hourglass_top',
      color: 'text-[#f59e0b]',
      bg: 'bg-[#f59e0b]/10',
    },
    {
      label: "O\'rtacha Buyurtma",
      value: `${fmt(summary.avg_order_value)} so'm`,
      icon: 'analytics',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
  ];
  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Hisobotlar</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Daromad, chiqim va tovarlar bo'yicha to\'liq tahlil
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            onClick={exportExcel}
            disabled={exporting}
            className='flex items-center gap-2 rounded-lg border border-[#22c55e] bg-[#22c55e]/10 px-4 py-2 text-sm font-semibold text-[#22c55e] hover:bg-[#22c55e] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <span className='material-symbols-outlined text-[18px]'>
              {exporting ? 'progress_activity' : 'table_view'}
            </span>Excel Yuklash
          </button>
          <button
            onClick={exportPdf}
            disabled={exporting}
            className='flex items-center gap-2 rounded-lg border border-error bg-error/10 px-4 py-2 text-sm font-semibold text-error hover:bg-error hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <span className={`material-symbols-outlined text-[18px] ${exporting ? 'animate-spin' : ''}`}>
              {exporting ? 'progress_activity' : 'picture_as_pdf'}
            </span>PDF
          </button>
        </div>
      </div>
      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
        <div className='mb-4 flex flex-wrap items-center gap-2'>
          <span className='text-sm font-semibold text-on-surface-variant'>Tezkor:</span>
          {[
            { key: 'today', label: 'Bugun' },
            { key: 'month', label: 'Bu oy' },
            { key: 'year', label: 'Bu yil' },
            { key: 'all', label: 'Barchasi' },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setQuickPeriod(p.key as any)}
              className='rounded-lg border border-outline-variant px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/10 hover:text-primary'
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4'>
          <div>
            <label className='mb-1 block text-xs font-semibold uppercase text-on-surface-variant'>
              Dan (sana)
            </label>
            <input
              type='date'
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none'
            />
          </div>
          <div>
            <label className='mb-1 block text-xs font-semibold uppercase text-on-surface-variant'>
              Gacha (sana)
            </label>
            <input
              type='date'
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none'
            />
          </div>
          <div>
            <label className='mb-1 block text-xs font-semibold uppercase text-on-surface-variant'>
              Davr ko\'rinishi
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none'
            >
              <option value='daily'>Kunlik</option>
              <option value='monthly'>Oylik</option>
              <option value='yearly'>Yillik</option>
            </select>
          </div>
          <div>
            <label className='mb-1 block text-xs font-semibold uppercase text-on-surface-variant'>
              Tovar qidirish
            </label>
            <div className='relative'>
              <span className='material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant'>
                search
              </span>
              <input
                type='text'
                placeholder='Tovar, sifat, model...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='w-full rounded-lg border border-outline-variant bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none'
              />
            </div>
          </div>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {kpiCards.map((card, idx) => (
          <div
            key={idx}
            className='flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm'
          >
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${card.bg}`}
            >
              <span className={`material-symbols-outlined fill-icon text-2xl ${card.color}`}>
                {card.icon}
              </span>
            </div>
            <div className='min-w-0'>
              <p className='truncate text-xs text-on-surface-variant'>{card.label}</p>
              <p className={`mt-0.5 truncate text-sm font-bold ${card.color}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Phase 3.5 — Qaytarish (Returns) bloki. Faqat davr ichida qaytarish
          bo'lgan bo'lsa ko'rinadi. Industry naqsh: Gross / Returns / Net /
          Return Rate alohida panel sifatida — admin "haqiqiy ushlab qolingan
          pul"ni ajratib ko'radi. */}
      {(summary.returns_count > 0 || summary.replacement_count > 0) && (
        <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm'>
          <div className='mb-4 flex items-center gap-2'>
            <span className='material-symbols-outlined fill-icon text-2xl text-rose-500 dark:text-rose-400'>
              assignment_return
            </span>
            <h3 className='text-lg font-extrabold text-on-surface'>
              Qaytarishlar va sof tushum
            </h3>
            <span className='ml-auto text-xs text-on-surface-variant'>
              Davr: {dateFrom || 'boshlanishi'} — {dateTo || 'oxirgi'}
            </span>
          </div>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
            <ReturnsKpiCard
              label='Pul qaytarildi'
              value={`${fmt(summary.returns_amount)} so'm`}
              sub={`${summary.returns_count} ta tranzaksiya`}
              tone='rose'
              icon='currency_exchange'
            />
            <ReturnsKpiCard
              label='Almashtirildi'
              value={`${summary.replacement_count} ta`}
              sub={`${fmt(summary.replacement_amount)} so'm qiymatda`}
              tone='amber'
              icon='swap_horiz'
            />
            <ReturnsKpiCard
              label='Stokga qaytdi (tannarx)'
              value={`${fmt(summary.recovered_cost)} so'm`}
              sub='restock=true buyumlar'
              tone='sky'
              icon='inventory_2'
            />
            <ReturnsKpiCard
              label='Sof tushum'
              value={`${fmt(summary.net_revenue)} so'm`}
              sub='Yalpi − qaytarilgan'
              tone='emerald'
              icon='savings'
            />
            <ReturnsKpiCard
              label='Qaytarish darajasi'
              value={`${summary.return_rate.toFixed(2)}%`}
              sub={
                summary.return_rate < 3
                  ? "Sog'lom"
                  : summary.return_rate < 10
                    ? "O'rtacha"
                    : 'Yuqori — tekshirish kerak'
              }
              tone={
                summary.return_rate < 3
                  ? 'emerald'
                  : summary.return_rate < 10
                    ? 'amber'
                    : 'rose'
              }
              icon='percent'
            />
          </div>
          {/* Sof foyda — qaytarishni hisobga olib */}
          <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='rounded-xl border border-outline-variant border-l-4 border-l-primary bg-surface p-3'>
              <div className='text-xs font-semibold uppercase tracking-wide text-on-surface-variant'>
                Yalpi foyda (gross)
              </div>
              <div className='mt-1 text-lg font-extrabold text-on-surface'>
                {fmt(summary.net_profit)} so'm
              </div>
              <div className='mt-0.5 text-xs text-on-surface-variant'>
                Tushum − tannarx (qaytarishsiz)
              </div>
            </div>
            <div className='rounded-xl border border-outline-variant border-l-4 border-l-emerald-500 bg-surface p-3'>
              <div className='text-xs font-semibold uppercase tracking-wide text-on-surface-variant'>
                Sof foyda (after returns)
              </div>
              <div className='mt-1 text-lg font-extrabold text-on-surface'>
                {fmt(summary.net_profit_after_returns)} so'm
              </div>
              <div className='mt-0.5 text-xs text-on-surface-variant'>
                Qaytarib stokga kelgan tannarx hisobga olingan
              </div>
            </div>
          </div>
        </div>
      )}
      <div className='flex items-center gap-2 border-b border-outline-variant pb-3 mt-6'>
        <button
          onClick={() => setSubTab('general')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${subTab === 'general' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-outline-variant'}`}
        >
          <span className='material-symbols-outlined text-[18px]'>bar_chart</span>
          Umumiy
        </button>
        <button
          onClick={() => setSubTab('sales')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${subTab === 'sales' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-outline-variant'}`}
        >
          <span className='material-symbols-outlined text-[18px]'>receipt_long</span>
          Savdo
        </button>
      </div>

      <div className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
        <div className='border-b border-outline-variant bg-surface-container px-5 py-3'>
          <h3 className='font-semibold text-on-surface'>
            {subTab === 'general' ? 'Tovarlar Bo\'yicha Statistika' : 'Cheklar (Savdo) Bo\'yicha Statistika'}
            {subTab === 'general' && (
              <span className='ml-2 text-sm font-normal text-on-surface-variant'>
                ({filteredProducts.length} ta)
              </span>
            )}
            {subTab === 'sales' && (
              <span className='ml-2 text-sm font-normal text-on-surface-variant'>
                ({orders.length} / {ordersTotalCount} ta chek)
              </span>
            )}
          </h3>
        </div>
        {(subTab === 'general' && isLoading) ||
        (subTab === 'sales' && ordersInfQuery.isLoading) ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block animate-spin text-5xl text-primary'>
              progress_activity
            </span>
            <p className='text-on-surface-variant'>Yuklanmoqda...</p>
          </div>
        ) : (subTab === 'general' && isError) ||
          (subTab === 'sales' && ordersInfQuery.isError) ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block text-5xl text-error'>error</span>
            <button
              onClick={() => {
                if (subTab === 'sales') ordersInfQuery.refetch();
                else refetch();
              }}
              className='mt-3 rounded-lg bg-primary px-4 py-2 text-sm text-on-primary'
            >
              Qayta urinish
            </button>
          </div>
        ) : (subTab === 'general' && filteredProducts.length === 0) ||
          (subTab === 'sales' && orders.length === 0) ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block text-5xl text-outline'>
              inventory_2
            </span>
            <p className='text-on-surface-variant'>Ma\'lumot topilmadi</p>
          </div>
        ) : subTab === 'general' ? (
          <div key="general-table-container" className='overflow-x-auto'>
            <table key="general-table" className='w-full min-w-[1400px] border-collapse text-left text-sm'>
              <thead>
                <tr className='bg-surface-container'>
                  {[
                    '#',
                    'Tovar Nomi',
                    'Sifat',
                    'Model',
                    'Xotira',
                    'Rang',
                    'SKU',
                    'Narxi',
                    'Chegirma',
                    'Sotilgan',
                    'Kirim',
                    'Sotildi',
                    'Qaytdi',     // Phase 3.5
                    'Sof',         // Phase 3.5 — net qty
                    'Tushum',
                    'Foyda',
                  ].map((h, i) => (
                    <th
                      key={i}
                      className='border border-outline-variant/50 px-3 py-3 text-center text-xs font-bold uppercase text-on-surface-variant'
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p, ri) => (
                  <tr
                    key={`p-${p.id}-${p.sku || 'nosku'}-${p.quality || 'noq'}-${p.size || 'nos'}-${p.color || 'noc'}-${p.model || 'nom'}-${ri}`}
                    className={`${ri % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container/30'} hover:bg-primary/5`}
                  >
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center font-bold text-on-surface-variant'>
                      {p.rank}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 font-semibold text-on-surface'>
                      {p.name}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      {p.quality || <span className='text-outline'>—</span>}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      {p.model || <span className='text-outline'>—</span>}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      {p.size || <span className='text-outline'>—</span>}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      {p.color || <span className='text-outline'>—</span>}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center font-mono text-xs text-on-surface-variant'>
                      {p.sku || '—'}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-right font-semibold'>
                      {fmt(p.price)} so'm
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-right text-[#f59e0b]'>
                      {p.discount_price ? (
                        `${fmt(p.discount_price)} so'm`
                      ) : (
                        <span className='text-outline'>—</span>
                      )}
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-right font-semibold text-primary'>
                      {fmt(p.sold_price)} so'm
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-right font-semibold text-tertiary'>
                      {fmt(p.cost_price)} so'm
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      <span className='inline-block rounded-full bg-primary/10 px-3 py-0.5 text-sm font-bold text-primary'>
                        {p.quantity_sold}
                      </span>
                    </td>
                    {/* Phase 3.5 — Qaytdi (rangli badge agar > 0) */}
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      {p.quantity_returned > 0 ? (
                        <span
                          className='inline-flex flex-col items-center rounded-full bg-rose-100 px-3 py-0.5 text-sm font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          title={`${p.return_rate}% qaytarildi`}
                        >
                          {p.quantity_returned}
                          <span className='text-[9px] font-normal opacity-80'>
                            {p.return_rate.toFixed(1)}%
                          </span>
                        </span>
                      ) : (
                        <span className='text-outline'>—</span>
                      )}
                    </td>
                    {/* Phase 3.5 — Sof (net qty) */}
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-center'>
                      <span className='inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'>
                        {p.net_quantity_sold}
                      </span>
                    </td>
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-right font-bold'>
                      {fmt(p.total_revenue)} so'm
                      {p.total_refunded > 0 && (
                        <div className='text-[10px] font-normal text-rose-500 dark:text-rose-400'>
                          −{fmt(p.total_refunded)} qaytarildi
                        </div>
                      )}
                    </td>
                    <td
                      className={`border border-outline-variant/40 px-3 py-2.5 text-right font-bold ${p.net_profit_after_returns >= 0 ? 'text-[#22c55e]' : 'text-error'}`}
                    >
                      {fmt(p.net_profit_after_returns)} so'm
                      {p.quantity_returned > 0 && (
                        <div className='text-[10px] font-normal text-on-surface-variant'>
                          gross: {fmt(p.net_profit)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className='bg-surface-container font-bold text-on-surface border-t-2 border-outline-variant'>
                <tr>
                  <td colSpan={11} className='px-3 py-4 text-right uppercase'>Jami:</td>
                  <td className='px-3 py-4 text-center text-primary text-base'>
                    {filteredProducts.reduce((acc, p) => acc + (p.quantity_sold || 0), 0)}
                  </td>
                  <td className='px-3 py-4 text-center text-rose-600 text-base dark:text-rose-300'>
                    {filteredProducts.reduce((acc, p) => acc + (p.quantity_returned || 0), 0)}
                  </td>
                  <td className='px-3 py-4 text-center text-emerald-600 text-base dark:text-emerald-300'>
                    {filteredProducts.reduce((acc, p) => acc + (p.net_quantity_sold || 0), 0)}
                  </td>
                  <td className='px-3 py-4 text-right text-base'>
                    {fmt(
                      filteredProducts.reduce((acc, p) => acc + (p.total_revenue || 0) - (p.total_refunded || 0), 0),
                    )} so'm
                  </td>
                  <td
                    className={`px-3 py-4 text-right text-base ${
                      filteredProducts.reduce((acc, p) => acc + (p.net_profit_after_returns || 0), 0) >= 0
                        ? 'text-[#22c55e]'
                        : 'text-error'
                    }`}
                  >
                    {fmt(filteredProducts.reduce((acc, p) => acc + (p.net_profit_after_returns || 0), 0))} so'm
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div key="sales-table-container" className='overflow-x-auto'>
            <table key="sales-table" className='w-full min-w-[1000px] border-collapse text-left text-sm'>
              <thead>
                <tr className='bg-surface-container'>
                  <th className='border border-outline-variant/50 px-3 py-3 text-center text-xs font-bold uppercase text-on-surface-variant w-16'>No</th>
                  <th className='border border-outline-variant/50 px-3 py-3 text-left text-xs font-bold uppercase text-on-surface-variant w-full'>Tovar nomi</th>
                  <th className='border border-outline-variant/50 px-3 py-3 text-center text-xs font-bold uppercase text-on-surface-variant'>Soni</th>
                  <th className='border border-outline-variant/50 px-3 py-3 text-right text-xs font-bold uppercase text-on-surface-variant'>Narxi</th>
                  <th className='border border-outline-variant/50 px-3 py-3 text-right text-xs font-bold uppercase text-on-surface-variant'>Sotilgan narxi</th>
                  <th className='border border-outline-variant/50 px-3 py-3 text-center text-xs font-bold uppercase text-on-surface-variant'>Chegirma %</th>
                  <th className='border border-outline-variant/50 px-3 py-3 text-right text-xs font-bold uppercase text-on-surface-variant'>Chegirma summasi</th>
                </tr>
              </thead>
              <tbody>
                {/*
                  TARTIB: Yangi cheklar — TEPADA. Backend `order_by('-created_at')`
                  bilan eng yangini birinchi qaytaradi, shu sababli .reverse()
                  ISHLATMAYMIZ. Avvalgi kodda .reverse() bor edi → bug:
                  eski cheklar tepada, yangi pastda. Bu bug bir necha marotaba
                  qaytib kelgan — kelajakda hech kim .reverse() qo'shmasligi
                  uchun shu izoh qoldirilgan.

                  CHEGIRMA % HISOBLASH: Vaznli o'rta (weighted by money), oddiy
                  o'rta emas. Misol: 100 narxi 10% chegirma + 10000 narxi 5%
                  chegirma → vaznli 5.05% (moliyaviy to'g'ri), oddiy o'rta
                  7.5% (adashtiruvchi). Vaznli — receiptDiscount/receiptOriginal.
                */}
                {orders.map((order, orderIndex) => {
                  // Per-receipt total chegirma items'dan recompute (bottom JAMI
                  // bilan bir xil mantiq, eski cache'lar bilan ham to'g'ri).
                  const receiptOriginal = order.items.reduce(
                    (sum, item) => sum + (item.original_price * item.quantity), 0,
                  );
                  const receiptDiscount = order.items.reduce(
                    (sum, item) => sum + item.discount_amount, 0,
                  );
                  // VAZNLI o'rta (oddiy o'rta emas — yuqorida izohni o'qing)
                  const receiptDiscountPct =
                    receiptOriginal > 0 ? (receiptDiscount / receiptOriginal) * 100 : 0;
                  return (
                  <Fragment key={order.id}>
                    {/* Order Header Row */}
                    <tr className='bg-green-100 dark:bg-green-900/30 font-bold'>
                      <td className='border border-outline-variant/40 px-3 py-2.5 text-center text-green-800 dark:text-green-400'>
                        {orderIndex + 1}
                      </td>
                      <td colSpan={6} className='border border-outline-variant/40 px-3 py-2.5 text-green-900 dark:text-green-300'>
                        <span className='mr-4'>Chek №{order.id} ({new Date(order.created_at).toLocaleString('uz-UZ')})</span>
                        <span className='font-normal opacity-80 mr-1'>Xaridor:</span> 
                        <span>{order.receiver_name || 'Ismsiz'}</span>
                      </td>
                    </tr>
                    {/* Order Items */}
                    {order.items.map((item, itemIndex) => (
                      <tr key={item.id} className='bg-surface-container-lowest hover:bg-primary/5'>
                        <td className='border border-outline-variant/40 px-3 py-2 text-center text-on-surface-variant'>
                          {itemIndex + 1}
                        </td>
                        <td className='border border-outline-variant/40 px-3 py-2 text-on-surface'>
                          {item.product_name}
                        </td>
                        <td className='border border-outline-variant/40 px-3 py-2 text-center font-semibold'>
                          {item.quantity}
                        </td>
                        <td className='border border-outline-variant/40 px-3 py-2 text-right'>
                          {fmt(item.original_price)}
                        </td>
                        <td className='border border-outline-variant/40 px-3 py-2 text-right text-primary font-semibold'>
                          {fmt(item.sold_price)}
                        </td>
                        <td className='border border-outline-variant/40 px-3 py-2 text-center text-error'>
                          {item.discount_percent > 0 ? `${item.discount_percent}%` : '0%'}
                        </td>
                        <td className='border border-outline-variant/40 px-3 py-2 text-right text-error font-medium'>
                          {item.discount_amount > 0 ? fmt(item.discount_amount) : '0'}
                        </td>
                      </tr>
                    ))}
                    {/* Order Subtotal Row */}
                    <tr className='bg-surface-container-high font-semibold text-on-surface text-sm border-b-[3px] border-outline-variant/30'>
                      <td colSpan={2} className='border border-outline-variant/40 px-3 py-2.5 text-right opacity-80'>Shu chek bo'yicha jami:</td>
                      <td className='border border-outline-variant/40 px-3 py-2.5 text-center text-primary'>
                        {order.items.reduce((acc, item) => acc + item.quantity, 0)}
                      </td>
                      <td className='border border-outline-variant/40 px-3 py-2.5 text-right'>
                        {fmt(order.items.reduce((acc, item) => acc + (item.original_price * item.quantity), 0))}
                      </td>
                      <td className='border border-outline-variant/40 px-3 py-2.5 text-right text-primary'>
                        {fmt(order.total_price)}
                      </td>
                      <td className='border border-outline-variant/40 px-3 py-2.5 text-center text-error'>
                        {receiptDiscountPct > 0 ? `${receiptDiscountPct.toFixed(2)}%` : '0%'}
                      </td>
                      <td className='border border-outline-variant/40 px-3 py-2.5 text-right text-error'>
                        {receiptDiscount > 0 ? fmt(receiptDiscount) : '0'}
                      </td>
                    </tr>
                  </Fragment>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className='py-8 text-center text-on-surface-variant'>
                      Ma'lumot topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
              {/*
                JAMI — faqat YUKLANGAN sahifalar uchun. Kelajakda backend
                aggregated summary qaytarsa, bu JAMI to'liq count uchun
                bo'ladi (count maydonidan emas, balki real backend totaldan).
                Hozir loaded pages bo'yicha hisoblanadi.
              */}
              <tfoot className='bg-surface-container border-t-2 border-outline-variant font-bold text-on-surface'>
                <tr>
                  <td colSpan={2} className='px-3 py-4 text-right uppercase'>
                    Jami {orders.length < ordersTotalCount ? `(yuklangan: ${orders.length}/${ordersTotalCount})` : ''}:
                  </td>
                  <td className='px-3 py-4 text-center text-primary text-base'>
                    {orders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + item.quantity, 0), 0)}
                  </td>
                  <td className='px-3 py-4 text-right text-base'>
                    {fmt(orders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + (item.original_price * item.quantity), 0), 0))} so'm
                  </td>
                  <td className='px-3 py-4 text-right text-primary text-base'>
                    {fmt(orders.reduce((acc, order) => acc + order.total_price, 0))} so'm
                  </td>
                  <td className='px-3 py-4 text-center'></td>
                  <td className='px-3 py-4 text-right text-error text-base'>
                    {fmt(orders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + item.discount_amount, 0), 0))} so'm
                  </td>
                </tr>
              </tfoot>
            </table>
            {/* "Yana yuklash" tugmasi — keyingi sahifa borligi uchun */}
            {ordersInfQuery.hasNextPage && (
              <div className='py-4 text-center'>
                <button
                  type='button'
                  onClick={() => ordersInfQuery.fetchNextPage()}
                  disabled={ordersInfQuery.isFetchingNextPage}
                  className='inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-60'
                >
                  {ordersInfQuery.isFetchingNextPage ? (
                    <>
                      <span className='material-symbols-outlined animate-spin text-[18px]'>
                        progress_activity
                      </span>
                      Yuklanmoqda...
                    </>
                  ) : (
                    <>
                      <span className='material-symbols-outlined text-[18px]'>
                        expand_more
                      </span>
                      Yana yuklash ({ordersTotalCount - orders.length} ta qoldi)
                    </>
                  )}
                </button>
              </div>
            )}
            {!ordersInfQuery.hasNextPage && orders.length > 0 && (
              <p className='py-3 text-center text-xs text-on-surface-variant opacity-70'>
                Hammasi yuklandi
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Phase 3.5 — Returns KPI mini-card (icon + value + sub + chap aksent rang).
// Dark-mode aware: token tizimi + dark: variantlari.
const ReturnsKpiCard = ({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'rose' | 'amber' | 'sky' | 'emerald';
  icon: string;
}) => {
  const TONES = {
    rose:    { accent: 'border-l-rose-500',    iconBg: 'bg-rose-100 dark:bg-rose-900/40',       iconText: 'text-rose-600 dark:text-rose-300' },
    amber:   { accent: 'border-l-amber-500',   iconBg: 'bg-amber-100 dark:bg-amber-900/40',     iconText: 'text-amber-600 dark:text-amber-300' },
    sky:     { accent: 'border-l-sky-500',     iconBg: 'bg-sky-100 dark:bg-sky-900/40',         iconText: 'text-sky-600 dark:text-sky-300' },
    emerald: { accent: 'border-l-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-600 dark:text-emerald-300' },
  }[tone];
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-outline-variant border-l-4 bg-surface p-3 ${TONES.accent}`}
    >
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${TONES.iconBg}`}
      >
        <span className={`material-symbols-outlined text-xl ${TONES.iconText}`}>
          {icon}
        </span>
      </div>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-xs font-semibold uppercase tracking-wide text-on-surface-variant'>
          {label}
        </div>
        <div className='mt-0.5 truncate text-base font-extrabold text-on-surface'>
          {value}
        </div>
        {sub && (
          <div className='mt-0.5 truncate text-[11px] text-on-surface-variant'>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
};
