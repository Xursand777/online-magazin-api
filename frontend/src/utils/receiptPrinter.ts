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
