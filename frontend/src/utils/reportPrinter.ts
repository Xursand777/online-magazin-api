/**
 * reportPrinter.ts — Admin "Hisobotlar" sahifasi uchun TOZA, BRENDLANGAN A4 PDF.
 *
 * NIMA UCHUN window.print() EMAS:
 *   Avval "PDF" tugmasi shunchaki window.print() chaqirardi — butun admin
 *   sahifa (yon-menyu, tugmalar, qidiruv) chop etilardi va infinite-scroll
 *   sababli ma'lumot to'liq bo'lmasdi. Bu modul receiptPrinter.ts uslubida
 *   alohida oynada to'liq, chiroyli A4 hisobot yaratadi — ekran holatidan
 *   mustaqil.
 */

export interface ReportSummaryLite {
  total_revenue: number;
  total_discount: number;
  total_cost: number;
  avg_order_value: number;
  total_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  net_profit: number;
}

export interface ReportProductLite {
  rank: number;
  name: string;
  quality?: string | null;
  model?: string | null;
  size?: string | null;
  color?: string | null;
  sku?: string | null;
  cost_price: number;
  sold_price: number;
  quantity_sold: number;
  total_revenue: number;
  net_profit: number;
}

export interface ReportOrderLite {
  id: number;
  created_at: string;
  receiver_name: string;
  receiver_phone?: string | null;
  total_price: number;
  total_discount?: number | null;
  items?: { quantity: number }[];
}

export interface ReportShopInfo {
  name: string;
  phone?: string;
  address?: string;
}

export interface ReportPrintOptions {
  summary: ReportSummaryLite;
  products: ReportProductLite[];
  orders: ReportOrderLite[];
  shop: ReportShopInfo;
  dateFrom?: string;
  dateTo?: string;
}

const money = (v: number | null | undefined): string =>
  Number(v ?? 0).toLocaleString('ru-RU');

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

const spec = (p: ReportProductLite): string =>
  [p.quality, p.model, p.size, p.color].filter(Boolean).join(' · ') || '—';

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uz-UZ', { year: '2-digit', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};

export function generateReportHtml(opts: ReportPrintOptions): string {
  const { summary, products, orders, shop } = opts;
  const rangeLabel =
    opts.dateFrom || opts.dateTo
      ? `${opts.dateFrom || '...'} — ${opts.dateTo || '...'}`
      : 'Barcha vaqt';
  const generatedAt = new Date().toLocaleString('uz-UZ', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  // ── KPI bloklari ──────────────────────────────────────────────────────────
  const kpis: { label: string; value: string; accent?: string }[] = [
    { label: 'Jami tushum', value: `${money(summary.total_revenue)} so'm`, accent: '#0a7c55' },
    { label: 'Sof foyda', value: `${money(summary.net_profit)} so'm`, accent: '#7c3aed' },
    { label: 'Jami chegirma', value: `${money(summary.total_discount)} so'm` },
    { label: "O'rtacha buyurtma", value: `${money(summary.avg_order_value)} so'm` },
    { label: 'Jami buyurtmalar', value: String(summary.total_orders) },
    { label: 'Yetkazildi', value: String(summary.delivered_orders), accent: '#16a34a' },
    { label: 'Bekor qilindi', value: String(summary.cancelled_orders), accent: '#dc2626' },
    { label: 'Kutilmoqda', value: String(summary.pending_orders), accent: '#d97706' },
  ];
  const kpiHtml = kpis
    .map(
      (k) => `
      <div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value" style="color:${k.accent || '#111827'}">${esc(k.value)}</div>
      </div>`,
    )
    .join('');

  // ── Tovarlar jadvali + Jami qatori ────────────────────────────────────────
  const prodRows = products
    .map(
      (p) => `
      <tr>
        <td class="c">${p.rank}</td>
        <td>${esc(p.name)}</td>
        <td class="muted">${esc(spec(p))}</td>
        <td class="c">${p.quantity_sold}</td>
        <td class="r">${money(p.sold_price)}</td>
        <td class="r">${money(p.total_revenue)}</td>
        <td class="r profit">${money(p.net_profit)}</td>
      </tr>`,
    )
    .join('');
  const prodTotals = products.reduce(
    (a, p) => {
      a.qty += p.quantity_sold;
      a.rev += p.total_revenue;
      a.profit += p.net_profit;
      return a;
    },
    { qty: 0, rev: 0, profit: 0 },
  );

  // ── Buyurtmalar (cheklar) jadvali ─────────────────────────────────────────
  const orderRows = orders
    .map((o) => {
      const itemsCount = (o.items ?? []).reduce((s, it) => s + (it.quantity || 0), 0);
      return `
      <tr>
        <td class="c">#${o.id}</td>
        <td>${esc(fmtDate(o.created_at))}</td>
        <td>${esc(o.receiver_name)}</td>
        <td class="muted">${esc(o.receiver_phone || '—')}</td>
        <td class="c">${itemsCount}</td>
        <td class="r">${money(o.total_discount)}</td>
        <td class="r bold">${money(o.total_price)}</td>
      </tr>`;
    })
    .join('');
  const ordersTotal = orders.reduce((s, o) => s + Number(o.total_price ?? 0), 0);

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<title>Hisobot — ${esc(shop.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; font-size: 12px; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0a7c55; padding-bottom: 14px; margin-bottom: 18px; }
  .brand { font-size: 26px; font-weight: 800; color: #0a7c55; letter-spacing: -0.5px; }
  .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 18px; font-weight: 700; color: #111827; }
  .doc-title .meta { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #f9fafb; }
  .kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; }
  .kpi-value { font-size: 15px; font-weight: 700; margin-top: 4px; }
  .section-title { font-size: 14px; font-weight: 700; color: #0a7c55; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #0a7c55; color: #fff; text-align: left; padding: 7px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.2px; }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td.r { text-align: right; }
  td.c { text-align: center; }
  td.muted { color: #6b7280; }
  td.bold { font-weight: 700; }
  td.profit { color: #7c3aed; font-weight: 600; }
  tfoot td { padding: 8px; border-top: 2px solid #0a7c55; font-weight: 800; background: #f0fdf4; }
  tfoot td.r { text-align: right; }
  tfoot td.c { text-align: center; }
  .empty { color: #9ca3af; font-style: italic; padding: 12px 8px; }
  .foot { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  @media print {
    @page { size: A4; margin: 12mm; }
    body { font-size: 11px; }
    .page { max-width: none; padding: 0; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .kpi { background: #f9fafb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead th, tfoot td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="head">
    <div>
      <div class="brand">${esc(shop.name)}</div>
      <div class="brand-sub">${esc(shop.address || '')}${shop.phone ? ' · ' + esc(shop.phone) : ''}</div>
    </div>
    <div class="doc-title">
      <h1>Savdo hisoboti</h1>
      <div class="meta">Davr: <b>${esc(rangeLabel)}</b><br>Yaratilgan: ${esc(generatedAt)}</div>
    </div>
  </div>

  <div class="kpis">${kpiHtml}</div>

  <div class="section-title">Tovarlar bo'yicha (${products.length} ta)</div>
  <table>
    <thead>
      <tr>
        <th class="c">#</th><th>Tovar nomi</th><th>Tafsilot</th>
        <th class="c">Sotildi</th><th class="r">Narx</th><th class="r">Tushum</th><th class="r">Foyda</th>
      </tr>
    </thead>
    <tbody>
      ${prodRows || '<tr><td colspan="7" class="empty">Ma\'lumot yo\'q</td></tr>'}
    </tbody>
    ${
      products.length
        ? `<tfoot><tr>
            <td colspan="3">JAMI</td>
            <td class="c">${prodTotals.qty}</td>
            <td></td>
            <td class="r">${money(prodTotals.rev)}</td>
            <td class="r">${money(prodTotals.profit)}</td>
          </tr></tfoot>`
        : ''
    }
  </table>

  <div class="section-title">Buyurtmalar / Cheklar (${orders.length} ta)</div>
  <table>
    <thead>
      <tr>
        <th class="c">ID</th><th>Sana</th><th>Qabul qiluvchi</th><th>Telefon</th>
        <th class="c">Dona</th><th class="r">Chegirma</th><th class="r">Summa</th>
      </tr>
    </thead>
    <tbody>
      ${orderRows || '<tr><td colspan="7" class="empty">Ma\'lumot yo\'q</td></tr>'}
    </tbody>
    ${
      orders.length
        ? `<tfoot><tr>
            <td colspan="6">JAMI (${orders.length} ta buyurtma)</td>
            <td class="r">${money(ordersTotal)}</td>
          </tr></tfoot>`
        : ''
    }
  </table>

  <div class="foot">Ushbu hisobot ${esc(shop.name)} tizimi tomonidan avtomatik yaratildi · ${esc(generatedAt)}</div>
</div>

<script>
  window.onload = function () { window.print(); };
  window.onafterprint = function () { window.close(); };
</script>
</body>
</html>`;
}

export function printReport(opts: ReportPrintOptions): void {
  const html = generateReportHtml(opts);
  const win = window.open('', '_blank', 'width=900,height=800,scrollbars=yes,toolbar=no,menubar=no');
  if (!win) {
    alert(
      "Brauzer pop-up oynasini blokladi.\nBrauzer sozlamalarida bu sayt uchun pop-up ruxsatini bering.",
    );
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
