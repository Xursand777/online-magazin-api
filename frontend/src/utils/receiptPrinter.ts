export interface ReceiptItem {
  quantity: number;
  price_snapshot: string | number;
  product_details?: { name?: string | null } | null;
  variant_details?: {
    color?: string | null;
    quality?: string | null;
    model?: string | null;
    size?: string | null;
  } | null;
}

export interface ReceiptOrder {
  id: number;
  created_at: string;
  receiver_name: string;
  receiver_phone: string;
  delivery_address?: string;
  payment_method: string;
  is_credit: boolean;
  credit_days?: number | null;
  credit_due_date?: string | null;
  credit_paid?: boolean;
  total_price: string | number;
  delivery_price?: string | number;
  discount_price?: string | number;
  items: ReceiptItem[];
}

export interface StoreInfo {
  name: string;
  phone?: string;
  address?: string;
}

const DEFAULT_STORE: StoreInfo = {
  name: 'Bozor UZ',
  phone: '+998 71 000-00-00',
  address: "Toshkent sh.",
};

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

const money = (v: string | number | null | undefined): string =>
  num(v).toLocaleString('ru-RU');

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Naqd pul',
  card: 'Plastik karta (Click/Payme)',
  credit: "Muddatli to'lov (Nasiya)",
};

const PAYMENT_ICONS: Record<string, string> = {
  cash: '💵',
  card: '💳',
  credit: '📅',
};

export function generateReceiptHtml(order: ReceiptOrder, store: StoreInfo = DEFAULT_STORE): string {
  const dt = new Date(order.created_at);
  const dateStr = dt.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = dt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const deliveryPrice = num(order.delivery_price);
  const discountPrice = num(order.discount_price);
  const totalPrice = num(order.total_price);

  const itemsHtml = order.items
    .map((item) => {
      const name = item.product_details?.name || 'Mahsulot';
      const variantParts = [
        item.variant_details?.color,
        item.variant_details?.quality,
        item.variant_details?.model,
        item.variant_details?.size,
      ].filter(Boolean);
      const variantStr = variantParts.join(' / ');
      const unitPrice = num(item.price_snapshot);
      const lineTotal = unitPrice * item.quantity;

      return `
        <div class="item-block">
          <div class="item-name">${name}</div>
          ${variantStr ? `<div class="item-sub">${variantStr}</div>` : ''}
          <div class="item-row">
            <span class="item-qty">${item.quantity} dona × ${money(unitPrice)} so'm</span>
            <span class="item-total">${money(lineTotal)} so'm</span>
          </div>
        </div>`;
    })
    .join('<div class="thin-line"></div>');

  const creditSection = order.is_credit
    ? `
      <div class="section">
        <div class="credit-box">
          <div class="credit-title">📅 MUDDATLI TO'LOV SHARTLARI</div>
          <div class="info-row">
            <span>Muddat:</span>
            <span class="bold">${order.credit_days ?? '—'} kun</span>
          </div>
          ${
            order.credit_due_date
              ? `<div class="info-row"><span>Oxirgi to'lov sanasi:</span><span class="bold highlight">${order.credit_due_date}</span></div>`
              : ''
          }
          <div class="info-row">
            <span>Holat:</span>
            <span class="${order.credit_paid ? 'status-paid' : 'status-pending'}">
              ${order.credit_paid ? '✓ To\'langan' : '⏳ Kutilmoqda'}
            </span>
          </div>
        </div>
      </div>`
    : '';

  const isOnline = order.delivery_address && order.delivery_address !== "Do'kon" && order.delivery_address !== "Dokon";

  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Savdo cheki #${order.id}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: 80mm auto;
      margin: 0;
    }

    html, body {
      width: 80mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .receipt {
      width: 80mm;
      padding: 6mm 5mm 10mm;
    }

    /* ─── Header ─── */
    .store-header {
      text-align: center;
      margin-bottom: 6px;
    }
    .store-name {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .store-sub {
      font-size: 10px;
      color: #444;
      margin-top: 2px;
    }

    /* ─── Dividers ─── */
    .solid-line  { border-top: 2px solid #000; margin: 5px 0; }
    .dashed-line { border-top: 1px dashed #555; margin: 5px 0; }
    .thin-line   { border-top: 1px dotted #bbb; margin: 3px 0; }

    /* ─── Section ─── */
    .section { margin: 4px 0; }

    /* ─── Order meta ─── */
    .order-meta { display: flex; justify-content: space-between; font-size: 11px; }
    .order-id   { font-weight: bold; font-size: 13px; }
    .order-dt   { color: #444; }

    /* ─── Info rows ─── */
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin: 2px 0;
      font-size: 11px;
      gap: 4px;
    }
    .info-row span:last-child {
      text-align: right;
      max-width: 55%;
    }
    .label { color: #555; white-space: nowrap; }
    .bold  { font-weight: bold; }

    /* ─── Items ─── */
    .items-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #555;
      margin-bottom: 3px;
    }
    .item-block { margin: 3px 0; }
    .item-name  { font-weight: bold; font-size: 12px; line-height: 1.3; }
    .item-sub   { font-size: 10px; color: #555; margin-top: 1px; }
    .item-row   { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; }
    .item-qty   { font-size: 10px; color: #444; }
    .item-total { font-weight: bold; font-size: 12px; }

    /* ─── Totals ─── */
    .totals-section { margin: 4px 0; }
    .totals-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 11px;
    }
    .total-final {
      display: flex;
      justify-content: space-between;
      font-size: 18px;
      font-weight: bold;
      margin: 6px 0 4px;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 4px 0;
    }

    /* ─── Payment ─── */
    .payment-badge {
      display: inline-block;
      border: 1.5px solid #111;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: bold;
      margin-top: 2px;
    }

    /* ─── Credit box ─── */
    .credit-box {
      border: 1.5px solid #111;
      border-radius: 4px;
      padding: 5px 7px;
      background: #fafafa;
    }
    .credit-title {
      font-size: 11px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .status-paid    { color: #006400; font-weight: bold; }
    .status-pending { color: #cc3300; font-weight: bold; }
    .highlight { color: #cc3300; }

    /* ─── Type badge ─── */
    .type-badge {
      display: inline-block;
      border: 1px dashed #333;
      border-radius: 3px;
      padding: 0 5px;
      font-size: 10px;
      vertical-align: middle;
      margin-left: 4px;
    }

    /* ─── Footer ─── */
    .footer {
      text-align: center;
      font-size: 10px;
      color: #555;
      margin-top: 8px;
    }
    .footer-thanks {
      font-size: 13px;
      font-weight: bold;
      color: #000;
      margin-bottom: 2px;
    }
    .barcode-placeholder {
      font-size: 22px;
      letter-spacing: 3px;
      margin: 4px 0 2px;
      color: #000;
    }
    .order-ref {
      font-size: 10px;
      color: #444;
    }

    @media print {
      html, body { width: 80mm; }
    }
  </style>
</head>
<body>
<div class="receipt">

  <!-- ══════════ STORE HEADER ══════════ -->
  <div class="store-header">
    <div class="store-name">${store.name}</div>
    ${store.phone ? `<div class="store-sub">${store.phone}</div>` : ''}
    ${store.address ? `<div class="store-sub">${store.address}</div>` : ''}
  </div>

  <div class="solid-line"></div>

  <!-- ══════════ ORDER META ══════════ -->
  <div class="section">
    <div class="order-meta">
      <span class="order-id">CHEK #${order.id}</span>
      <span class="order-dt">${dateStr}</span>
    </div>
    <div class="order-meta" style="margin-top:2px;">
      <span class="label">${isOnline ? '🌐 Online buyurtma' : '🏪 Do\'kon savdosi'}</span>
      <span class="label">${timeStr}</span>
    </div>
  </div>

  <div class="dashed-line"></div>

  <!-- ══════════ CUSTOMER ══════════ -->
  <div class="section">
    <div class="info-row">
      <span class="label">Xaridor:</span>
      <span class="bold">${order.receiver_name}</span>
    </div>
    <div class="info-row">
      <span class="label">Telefon:</span>
      <span>${order.receiver_phone}</span>
    </div>
    ${
      isOnline
        ? `<div class="info-row">
             <span class="label">Manzil:</span>
             <span>${order.delivery_address}</span>
           </div>`
        : ''
    }
  </div>

  <div class="dashed-line"></div>

  <!-- ══════════ ITEMS ══════════ -->
  <div class="section">
    <div class="items-header">▸ Mahsulotlar ro'yxati</div>
    ${itemsHtml}
  </div>

  <div class="solid-line"></div>

  <!-- ══════════ TOTALS ══════════ -->
  <div class="totals-section">
    ${
      discountPrice > 0
        ? `<div class="totals-row"><span class="label">Mahsulotlar jami:</span><span>${money(num(order.total_price) + discountPrice - deliveryPrice)} so'm</span></div>
           <div class="totals-row"><span class="label">Chegirma:</span><span>- ${money(discountPrice)} so'm</span></div>`
        : ''
    }
    ${
      deliveryPrice > 0
        ? `<div class="totals-row"><span class="label">Yetkazib berish:</span><span>${money(deliveryPrice)} so'm</span></div>`
        : ''
    }
    <div class="total-final">
      <span>JAMI:</span>
      <span>${money(totalPrice)} so'm</span>
    </div>
  </div>

  <!-- ══════════ PAYMENT METHOD ══════════ -->
  <div class="section">
    <div class="info-row">
      <span class="label">To'lov usuli:</span>
      <span class="payment-badge">
        ${PAYMENT_ICONS[order.payment_method] ?? ''} ${PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
      </span>
    </div>
  </div>

  <!-- ══════════ CREDIT TERMS ══════════ -->
  ${creditSection}

  <div class="dashed-line"></div>

  <!-- ══════════ FOOTER ══════════ -->
  <div class="footer">
    <div class="footer-thanks">Xarid uchun rahmat! 🙏</div>
    <div>Tovarlar qaytarilmaydi va almashinmaydi</div>
    <div class="barcode-placeholder">||| || ||| || |||</div>
    <div class="order-ref">Ref: ${store.name.replace(/\s/g, '').toUpperCase()}-${String(order.id).padStart(6, '0')}</div>
  </div>

</div>

<script>
  window.onload = function() {
    window.print();
  };
  window.onafterprint = function() {
    window.close();
  };
</script>
</body>
</html>`;
}

export function generateCreditAgreementHtml(order: ReceiptOrder, store: StoreInfo = DEFAULT_STORE): string {
  const dt = new Date(order.created_at);
  const dateStr = dt.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const agreementNo = `${store.name.replace(/\s/g, '').toUpperCase().slice(0, 4)}-NASIYA-${String(order.id).padStart(6, '0')}`;
  const totalPrice = num(order.total_price);

  const itemsRows = order.items
    .map((item, idx) => {
      const name = item.product_details?.name || 'Mahsulot';
      const variant = [
        item.variant_details?.color,
        item.variant_details?.quality,
        item.variant_details?.model,
        item.variant_details?.size,
      ]
        .filter(Boolean)
        .join(' / ');
      const unit = num(item.price_snapshot);
      const total = unit * item.quantity;
      return `
        <tr>
          <td class="td-num">${idx + 1}</td>
          <td class="td-name">${name}${variant ? `<br/><span class="sub">${variant}</span>` : ''}</td>
          <td class="td-r">${item.quantity}</td>
          <td class="td-r">${money(unit)}</td>
          <td class="td-r bold">${money(total)}</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8"/>
  <title>Nasiya shartnomasi #${order.id}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 20mm 15mm; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 780px; margin: 0 auto; padding: 20px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #111; padding-bottom: 14px; }
    .store-name { font-size: 24px; font-weight: bold; letter-spacing: 1px; }
    .store-sub { font-size: 12px; color: #555; margin-top: 3px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 18px; font-weight: bold; color: #1a237e; }
    .doc-title p { font-size: 12px; color: #555; margin-top: 4px; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0; }
    .info-box { border: 1px solid #ccc; border-radius: 6px; padding: 12px 14px; }
    .info-box h3 { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 8px; }
    .info-row-doc { display: flex; justify-content: space-between; margin: 4px 0; font-size: 12px; }
    .info-row-doc .val { font-weight: bold; text-align: right; }
    .highlight-val { color: #c62828; }

    /* Items table */
    .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #333; margin: 20px 0 8px; border-bottom: 1.5px solid #333; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th { background: #1a237e; color: #fff; font-size: 11px; text-transform: uppercase; padding: 6px 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: top; font-size: 12px; }
    tr:nth-child(even) td { background: #f5f5f5; }
    .td-num { width: 36px; text-align: center; color: #666; }
    .td-name { min-width: 220px; }
    .td-r { text-align: right; white-space: nowrap; }
    .bold { font-weight: bold; }
    .sub { font-size: 11px; color: #777; }

    /* Totals */
    .totals { display: flex; justify-content: flex-end; margin: 8px 0 20px; }
    .totals-box { border: 1.5px solid #333; border-radius: 6px; padding: 10px 16px; min-width: 240px; }
    .total-row { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
    .total-final-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; border-top: 2px solid #333; margin-top: 6px; padding-top: 6px; color: #1a237e; }

    /* Credit terms */
    .credit-box { border: 2px solid #1a237e; border-radius: 8px; padding: 14px 18px; margin: 16px 0; background: #e8eaf6; }
    .credit-box h3 { font-size: 13px; font-weight: bold; color: #1a237e; margin-bottom: 10px; }
    .credit-terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .credit-term { display: flex; flex-direction: column; }
    .credit-term .label { font-size: 11px; color: #555; }
    .credit-term .value { font-size: 14px; font-weight: bold; color: #1a237e; margin-top: 2px; }
    .credit-term .value.danger { color: #c62828; }

    /* Terms text */
    .terms-section { border: 1px solid #ccc; border-radius: 6px; padding: 12px 14px; margin: 16px 0; background: #fafafa; }
    .terms-section h3 { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
    .terms-list { padding-left: 16px; }
    .terms-list li { font-size: 11px; color: #444; margin: 4px 0; line-height: 1.5; }

    /* Signatures */
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
    .sig-block { border-top: 1.5px solid #333; padding-top: 10px; }
    .sig-block .sig-label { font-size: 11px; color: #555; margin-bottom: 6px; }
    .sig-block .sig-name { font-size: 13px; font-weight: bold; }
    .sig-block .sig-line { margin-top: 28px; border-top: 1px solid #999; font-size: 10px; color: #888; padding-top: 3px; text-align: center; }

    /* Footer */
    .doc-footer { margin-top: 24px; text-align: center; font-size: 10px; color: #888; border-top: 1px dashed #ccc; padding-top: 10px; }

    @media print { .page { padding: 0; } }
  </style>
</head>
<body>
<div class="page">

  <!-- ══════════ HEADER ══════════ -->
  <div class="header">
    <div>
      <div class="store-name">${store.name}</div>
      ${store.phone ? `<div class="store-sub">Tel: ${store.phone}</div>` : ''}
      ${store.address ? `<div class="store-sub">${store.address}</div>` : ''}
    </div>
    <div class="doc-title">
      <h1>NASIYA SHARTNOMASI</h1>
      <p>Shartnoma №: <strong>${agreementNo}</strong></p>
      <p>Sana: <strong>${dateStr}</strong></p>
    </div>
  </div>

  <!-- ══════════ INFO GRID ══════════ -->
  <div class="info-grid">
    <div class="info-box">
      <h3>Sotuvchi</h3>
      <div class="info-row-doc"><span>Nomi:</span><span class="val">${store.name}</span></div>
      ${store.phone ? `<div class="info-row-doc"><span>Telefon:</span><span class="val">${store.phone}</span></div>` : ''}
      ${store.address ? `<div class="info-row-doc"><span>Manzil:</span><span class="val">${store.address}</span></div>` : ''}
    </div>
    <div class="info-box">
      <h3>Xaridor</h3>
      <div class="info-row-doc"><span>Ism Familiya:</span><span class="val">${order.receiver_name}</span></div>
      <div class="info-row-doc"><span>Telefon:</span><span class="val">${order.receiver_phone}</span></div>
      ${order.delivery_address ? `<div class="info-row-doc"><span>Manzil:</span><span class="val">${order.delivery_address}</span></div>` : ''}
    </div>
  </div>

  <!-- ══════════ ITEMS ══════════ -->
  <div class="section-title">Mahsulotlar ro'yxati</div>
  <table>
    <thead>
      <tr>
        <th class="td-num">#</th>
        <th>Mahsulot nomi</th>
        <th style="text-align:right">Miqdor</th>
        <th style="text-align:right">Narx (so'm)</th>
        <th style="text-align:right">Jami (so'm)</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <!-- ══════════ TOTALS ══════════ -->
  <div class="totals">
    <div class="totals-box">
      ${num(order.discount_price) > 0 ? `<div class="total-row"><span>Chegirma:</span><span>- ${money(num(order.discount_price))} so'm</span></div>` : ''}
      ${num(order.delivery_price) > 0 ? `<div class="total-row"><span>Yetkazib berish:</span><span>${money(num(order.delivery_price))} so'm</span></div>` : ''}
      <div class="total-final-row">
        <span>JAMI SUMMA:</span>
        <span>${money(totalPrice)} so'm</span>
      </div>
    </div>
  </div>

  <!-- ══════════ CREDIT TERMS ══════════ -->
  <div class="credit-box">
    <h3>📅 Muddatli to'lov shartlari</h3>
    <div class="credit-terms-grid">
      <div class="credit-term">
        <span class="label">To'lov summasi</span>
        <span class="value">${money(totalPrice)} so'm</span>
      </div>
      <div class="credit-term">
        <span class="label">To'lov muddati</span>
        <span class="value">${order.credit_days ?? '—'} kun</span>
      </div>
      <div class="credit-term">
        <span class="label">Buyurtma sanasi</span>
        <span class="value">${dateStr}</span>
      </div>
      <div class="credit-term">
        <span class="label">Oxirgi to'lov sanasi</span>
        <span class="value danger">${order.credit_due_date ?? '—'}</span>
      </div>
    </div>
  </div>

  <!-- ══════════ SHARTLAR ══════════ -->
  <div class="terms-section">
    <h3>Shartnoma shartlari</h3>
    <ul class="terms-list">
      <li>Xaridor ko'rsatilgan to'lov muddatiga qat'iy rioya etishi shart.</li>
      <li>To'lov muddati o'tib ketgan taqdirda, sotuvchi qo'shimcha choralar ko'rish huquqini o'zida saqlab qoladi.</li>
      <li>Mahsulot to'liq to'lov qilinmaguncha sotuvchi mulki hisoblanadi.</li>
      <li>To'lov naqd pul ko'rinishida sotuvchi manziliga yoki elektron to'lov tizimi orqali amalga oshiriladi.</li>
      <li>Ushbu shartnoma ikki nusxada tuzildi va har ikki tomon uchun teng yuridik kuchga ega.</li>
    </ul>
  </div>

  <!-- ══════════ SIGNATURES ══════════ -->
  <div class="signatures">
    <div class="sig-block">
      <div class="sig-label">Sotuvchi vakili:</div>
      <div class="sig-name">${store.name}</div>
      <div class="sig-line">Imzo / Muhr</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">Xaridor:</div>
      <div class="sig-name">${order.receiver_name}</div>
      <div class="sig-line">Imzo: ____________________</div>
    </div>
  </div>

  <!-- ══════════ FOOTER ══════════ -->
  <div class="doc-footer">
    ${store.name} · Shartnoma №${agreementNo} · ${dateStr}
  </div>

</div>
<script>
  window.onload = function() { window.print(); };
  window.onafterprint = function() { window.close(); };
</script>
</body>
</html>`;
}

export function printCreditAgreement(order: ReceiptOrder, store: StoreInfo = DEFAULT_STORE): void {
  const html = generateCreditAgreementHtml(order, store);
  const win = window.open('', '_blank', 'width=900,height=750,scrollbars=yes,toolbar=no,menubar=no');
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

export function printReceipt(order: ReceiptOrder, store: StoreInfo = DEFAULT_STORE): void {
  const html = generateReceiptHtml(order, store);
  const win = window.open('', '_blank', 'width=440,height=700,scrollbars=yes,toolbar=no,menubar=no');
  if (!win) {
    alert(
      "Brauzer pop-up oynasini blokladi.\nBrauzer sozlamalarida bu sayt uchun pop-up ruxsatini bering va qayta urinib ko'ring.",
    );
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
