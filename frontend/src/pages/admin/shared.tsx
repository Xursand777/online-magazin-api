// ─────────────────────────────────────────────────────────────────────────────
//  admin/shared.tsx — AdminPanel bo'limlari uchun UMUMIY tiplar, yordamchi
//  funksiyalar, konstantalar va kichik UI komponentlari.
//
//  Bu modul AdminPanel.tsx monolitidan ajratildi (#N3). Mantiq O'ZGARMAGAN —
//  faqat ko'chirildi. AdminPanel va alohida tab/editor fayllari shu yagona
//  manbadan import qiladi (aylanma import yo'q — bularning hammasi "barg"
//  bog'liqliklar: faqat react'ga tayanadi).
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';

// null/undefined ni filterlaydigan type-guard (Array.filter(_notNull) uchun).
export const _notNull = <T,>(x: T | null | undefined): x is T => x != null;

// ─── Tiplar (ma'lumot modeli) ────────────────────────────────────────────────

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  parent_name?: string | null;
  image?: string | null;
  is_active: boolean;
  is_popular: boolean;
}

export interface AdminProductVariant {
  id?: number;
  color?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  // Backend legacy fallback: `id: null` — variant'ning eski `image` field'idan
  // sintetik element. Frontendda alohida `image_url` orqali ko'rsatiladi,
  // shu sababli galereya elementlaridan ajratish uchun null'ni qabul qilamiz.
  images?: { id: number | null; url: string }[];
  quality?: string | null;
  model?: string | null;
  size?: string | null;
  price?: string | number | null;
  price_usd?: string | number | null;
  discount_price?: string | number | null;
  discount_price_usd?: string | number | null;
  cost_price?: string | number | null;
  cost_price_usd?: string | number | null;
  stock?: number;
  sku?: string | null;
  barcode?: string | null;
  is_active?: boolean;
  position?: number;
  // Phase 4.0 — do'kondagi polka manzili (faqat admin/POS). Public API
  // bu maydonni qaytarmaydi → faqat AdminProduct*Serializer'dan keladi.
  shelf_location?: string | null;
  // Phase 4.2 — backend fallback bilan amaldagi polka (variant'niki yoki
  // product.shelf_location'dan o'qiladi). UI faqat shuni ko'rsatsa kifoya.
  effective_shelf?: string | null;
}

export interface AdminProduct {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: number | null;
  category_name?: string | null;
  price: string;
  price_usd: number | null;
  discount_price: string | null;
  discount_price_usd: number | null;
  cost_price: string;
  cost_price_usd: number | null;
  stock: number;
  is_active: boolean;
  is_popular: boolean;
  is_new: boolean;
  is_discount: boolean;
  main_image?: string | null;
  // Phase 4.2 — product-level polka (variantsiz mahsulot uchun yoki
  // barcha variantlar uchun default fallback). Faqat admin so'rovida keladi.
  shelf_location?: string | null;
  created_at: string;
  updated_at: string;
  variants: AdminProductVariant[];
}

export interface AdminPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ProductFormState {
  name: string;
  description: string;
  price: string;
  price_usd: string;
  discount_price: string;
  discount_price_usd: string;
  cost_price: string;
  cost_price_usd: string;
  stock: string;
  category: string;
  is_active: boolean;
  is_new: boolean;
  is_popular: boolean;
  // Phase 4.2 — product darajasidagi polka (variantsiz mahsulot uchun yoki
  // barcha variantlar uchun default — variant.shelf_location bo'sh bo'lsa
  // backend bu yerdan fallback qiladi).
  shelf_location: string;
}

export interface VariantFormState {
  client_id: string;
  group_id: string;
  id?: number;
  color: string;
  color_hex: string;
  image_url?: string | null;
  remove_image: boolean;
  existingImages: { id: number; url: string }[];
  deleteImageIds: number[];
  quality: string;
  model: string;
  size: string;
  price: string;
  price_usd: string;
  discount_price: string;
  discount_price_usd: string;
  cost_price: string;
  cost_price_usd: string;
  stock: string;
  sku: string;
  barcode: string;
  is_active: boolean;
  position: string;
  // Phase 4.0 — do'kondagi jismoniy polka (masalan: "001", "A-3").
  shelf_location: string;
}

export interface ProductEditorState {
  mode: 'create' | 'edit';
  product?: AdminProduct;
}

export interface AdminBanner {
  id: number;
  title: string;
  subtitle: string;
  product: number | null;
  product_name?: string | null;
  original_price: string | null;
  discount_price: string | null;
  product_image_url?: string | null;
  background_image_url?: string | null;
  background_color: string;
  accent_color: string;
  button_label: string;
  button_url: string;
  order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BannerFormState {
  title: string;
  subtitle: string;
  product: string;
  original_price: string;
  discount_price: string;
  background_color: string;
  accent_color: string;
  button_label: string;
  button_url: string;
  order: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
}

export interface BannerEditorState {
  mode: 'create' | 'edit';
  banner?: AdminBanner;
}

export interface AdminOrderHistory {
  id: number;
  to_status: string;
  note: string;
  created_at: string;
  actor_name?: string | null;
  actor_type: string;
}

export interface AdminOrder {
  id: number;
  status: string;
  total_price: string | number;
  delivery_price: string | number;
  discount_price: string | number;
  created_at: string;
  receiver_name: string;
  receiver_phone: string;
  delivery_address: string;
  cancellation_reason: string;
  payment_method: string;
  is_credit: boolean;
  credit_days: number | null;
  credit_due_date: string | null;
  credit_paid: boolean;
  credit_paid_at: string | null;
  credit_is_overdue: boolean;
  can_admin_cancel?: boolean;
  // Backend-avtoritar: nasiyani yopa oladimi (faqat admin/super).
  can_pay_credit?: boolean;
  // Backend-avtoritar: shu xodim o'tkaza oladigan oldinga holatlar (rol bo'yicha).
  allowed_transitions?: string[];
  payment?: { status: string; method: string; amount: string | number } | null;
  items: Array<{
    id: number;
    quantity: number;
    price_snapshot: string | number;
    product_details?: { name: string; main_image?: string | null };
    variant_details?: { color?: string | null; quality?: string | null; model?: string | null; size?: string | null } | null;
    // Phase 4.0 — variant polkasi. Faqat staff so'rovida keladi (xaridorga `null`).
    variant_shelf?: string | null;
  }>;
  history: AdminOrderHistory[];
  user?: { id: number; phone: string } | null;
}

// Phase 4.2 — AdminStockItem'ga shelf_location qo'shildi (admin ombor
// hisobotida polka manzilini ko'rsatishi uchun). Backend fallback bilan
// qaytaradi (variant'niki yoki product'dan), bo'sh bo'lsa string empty.
export interface AdminStockItem {
  type: 'product' | 'variant';
  id: number;
  product_id?: number;
  name: string;
  variant_info: string | null;
  category_name: string | null;
  stock: number;
  sku: string;
  price: number;
  image: string | null;
  status: 'critical' | 'low';
  // Phase 4.2 — backend AdminStockReportView qaytaradigan polka qiymati.
  // Variantli item uchun `effective_shelf` (variant yoki product fallback),
  // variantsiz item uchun product.shelf_location. Bo'sh string mumkin.
  shelf_location?: string;
}

// ─── Bo'sh forma fabrikalari ─────────────────────────────────────────────────

export const emptyProductForm = (): ProductFormState => ({
  name: '',
  description: '',
  price: '',
  price_usd: '',
  discount_price: '',
  discount_price_usd: '',
  cost_price: '',
  cost_price_usd: '',
  stock: '0',
  category: '',
  is_active: true,
  is_new: false,
  is_popular: false,
  shelf_location: '',
});

export const makeVariantClientId = () => `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyVariant = (groupId?: string): VariantFormState => ({
  client_id: makeVariantClientId(),
  group_id: groupId || makeVariantClientId(),
  color: '',
  color_hex: '',
  image_url: null,
  remove_image: false,
  existingImages: [],
  deleteImageIds: [],
  quality: '',
  model: '',
  size: '',
  price: '',
  price_usd: '',
  discount_price: '',
  discount_price_usd: '',
  cost_price: '',
  cost_price_usd: '',
  stock: '0',
  sku: '',
  barcode: '',
  is_active: true,
  position: '0',
  shelf_location: '',
});

export const emptyBannerForm = (): BannerFormState => ({
  title: '',
  subtitle: '',
  product: '',
  original_price: '',
  discount_price: '',
  background_color: '#111827',
  accent_color: '#007a4d',
  button_label: "Mahsulotni ko'rish",
  button_url: '',
  order: '0',
  is_active: true,
  start_date: '',
  end_date: '',
});

// ─── Format / parse yordamchilari ────────────────────────────────────────────

export const formatMoney = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '0';
  return Number(value).toLocaleString('uz-UZ');
};

export const stripNumberFormatting = (value: string) => value.replace(/\s+/g, '').replace(/,/g, '.');

export const formatPriceInput = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).replace(/\s+/g, '').replace(/,/g, '.');
  const [integerPartRaw, decimalPartRaw = ''] = normalized.split('.', 2);
  const integerDigits = integerPartRaw.replace(/\D/g, '') || '0';
  const formattedInteger = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimalDigits = decimalPartRaw.replace(/\D/g, '');
  if (!decimalDigits || /^0+$/.test(decimalDigits)) return formattedInteger;
  return `${formattedInteger}.${decimalDigits.slice(0, 2)}`;
};

export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

// ─── Konstantalar ────────────────────────────────────────────────────────────

export const COLOR_PRESETS = [
  { name: 'Qora', hex: '#111827' },
  { name: 'Oq', hex: '#f8fafc' },
  { name: "Ko'k", hex: '#2563eb' },
  { name: 'Kulrang', hex: '#8b8f98' },
  { name: 'Titan', hex: '#a8a29e' },
  { name: 'Yashil', hex: '#16a34a' },
  { name: 'Oltin', hex: '#d4a017' },
  { name: 'Qizil', hex: '#dc2626' },
  { name: 'Pushti', hex: '#ec4899' },
  { name: 'Moviy', hex: '#0ea5e9' },
  { name: 'Sariq', hex: '#eab308' },
  { name: "To'q sariq", hex: '#f59e0b' },
  { name: 'Binafsha', hex: '#8b5cf6' },
  { name: 'Jigarrang', hex: '#92400e' },
  { name: "Qo'ngir", hex: '#78716c' },
  { name: 'Kumush', hex: '#cbd5e1' },
  { name: 'Bronza', hex: '#b45309' },
  { name: "Qo'ng'ir", hex: '#a16207' },
  { name: 'Lavanda', hex: '#c4b5fd' },
  { name: 'Feruza', hex: '#14b8a6' },
  { name: 'Oltin sariq', hex: '#fbbf24' },
  { name: 'Oq kulrang', hex: '#e2e8f0' },
];

export const QUALITY_PRESETS = ['Original', 'Premium', 'OEM', 'Copy A', 'Copy B'];

// ─── Map / xato yordamchilari ────────────────────────────────────────────────

export const categoryLabel = (category: AdminCategory) =>
  category.parent_name ? `${category.parent_name} / ${category.name}` : category.name;

// DRF xato strukturalari odatda ichma-ich keladi, masalan:
//   { "variants_data": { "0": { "discount_price": ["Chegirma narxi..."] } } }
// Bunday holatda admin "Xatolik yuz berdi" generik xabar o'rniga ASL xato
// matnini ko'rishi kerak — debugni tezlashtiradi va foydalanuvchiga aniq
// nima noto'g'ri ekanligini ko'rsatadi.
//
// Algoritm: rekursiv BFS — har bir tugundan birinchi string'ni topib qaytaradi.
// Maksimal 5 daraja chuqurligi (cheksiz halqalarni oldini olish).
const _findFirstStringWithKey = (val: unknown, depth = 0, currentKey = ''): string | null => {
  if (depth > 5) return null;
  if (val == null) return null;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    return currentKey ? `${currentKey}: ${s}` : s;
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const s = _findFirstStringWithKey(item, depth + 1, currentKey);
      if (s) return s;
    }
    return null;
  }
  if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      // Avoid prefixing with array indices
      const nextKey = /^\d+$/.test(k) ? currentKey : (currentKey ? `${currentKey}.${k}` : k);
      const s = _findFirstStringWithKey(v, depth + 1, nextKey);
      if (s) return s;
    }
  }
  return null;
};

export const extractErrorMessage = (error: unknown) => {
  const err = error as {
    response?: { data?: unknown; status?: number };
    message?: string;
  };
  const responseData = err?.response?.data;
  if (responseData) {
    const found = _findFirstStringWithKey(responseData);
    if (found) return found;
  }
  if (err?.message && typeof err.message === 'string') return err.message;
  return 'Xatolik yuz berdi.';
};

export const mapProductToForm = (product?: AdminProduct): ProductFormState => {
  if (!product) return emptyProductForm();
  return {
    name: product.name,
    description: product.description || '',
    price: formatPriceInput(product.price),
    price_usd: product.price_usd ? String(product.price_usd) : '',
    discount_price: product.discount_price ? formatPriceInput(product.discount_price) : '',
    discount_price_usd: product.discount_price_usd ? String(product.discount_price_usd) : '',
    cost_price: product.cost_price ? formatPriceInput(product.cost_price) : '',
    cost_price_usd: product.cost_price_usd ? String(product.cost_price_usd) : '',
    stock: String(product.stock ?? 0),
    category: product.category ? String(product.category) : '',
    is_active: product.is_active,
    is_new: product.is_new,
    is_popular: product.is_popular,
    shelf_location: (product.shelf_location || '').slice(0, 20),
  };
};

export const mapProductVariants = (product?: AdminProduct): VariantFormState[] => {
  if (!product?.variants?.length) return [];
  return product.variants.map((v) => ({
    client_id: v.id ? `variant-${v.id}` : makeVariantClientId(),
    group_id: v.color ? v.color.trim().toLowerCase() : (v.id ? `g-${v.id}` : makeVariantClientId()),
    id: v.id,
    color: v.color || '',
    color_hex: v.color_hex || '',
    image_url: v.image_url || null,
    remove_image: false,
    // Backend backward-compat: agar variant'da faqat legacy `image` bo'lsa,
    // `images` ro'yxati `{id: null, url: legacyUrl}` fallback'ni qaytaradi.
    // Bu URL allaqachon `image_url` orqali "asosiy rasm" sifatida ko'rsatiladi —
    // shu sababli null-id elementlarni galereyaga qo'shmaymiz (aks holda bir xil
    // rasm 2 marta chiqib qoladi va o'chirish payloadi noto'g'ri ishlaydi).
    existingImages: (v.images || []).filter((img): img is { id: number; url: string } => img.id != null),
    deleteImageIds: [],
    quality: v.quality || '',
    model: v.model || '',
    size: v.size || '',
    price: v.price ? formatPriceInput(v.price) : '',
    price_usd: v.price_usd ? String(v.price_usd) : '',
    discount_price: v.discount_price ? formatPriceInput(v.discount_price) : '',
    discount_price_usd: v.discount_price_usd ? String(v.discount_price_usd) : '',
    cost_price: v.cost_price ? formatPriceInput(v.cost_price) : '',
    cost_price_usd: v.cost_price_usd ? String(v.cost_price_usd) : '',
    stock: String(v.stock ?? 0),
    sku: v.sku || '',
    barcode: v.barcode || '',
    is_active: v.is_active ?? true,
    position: String(v.position ?? 0),
    shelf_location: v.shelf_location || '',
  }));
};

// Klonlash: variantlarni YANGI (id'siz) qilib ko'chiradi — orqaga bog'lanmaydi
// (backend yangi variant yaratadi). Rasm va SKU/barcode tashlanadi (takror
// bo'lmasin — admin keyin qayta beradi).
export const mapVariantsAsNew = (product?: AdminProduct): VariantFormState[] =>
  mapProductVariants(product).map((v) => ({
    ...v,
    client_id: makeVariantClientId(),
    id: undefined,
    image_url: null,
    existingImages: [],
    deleteImageIds: [],
    sku: '',
    barcode: '',
  }));

// Editor variantlari: tahrirlashda mavjud (id bilan), yaratishda — agar manba
// mahsulot berilgan bo'lsa KLON (id'siz), aks holda bo'sh.
export const mapVariantsForEditor = (
  product: AdminProduct | undefined,
  mode: 'create' | 'edit',
): VariantFormState[] =>
  mode === 'edit' ? mapProductVariants(product) : product ? mapVariantsAsNew(product) : [];

export const generateVariantSku = (productName: string, variant: VariantFormState) => {
  const prefix = (productName || 'PRD')
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  const model = (variant.model || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  const size = (variant.size || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  const quality = (variant.quality || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  const color = (variant.color || '')
    .toUpperCase()
    .replace(/[AEIOUY\s]/g, '')
    .slice(0, 3);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return [prefix, quality, model, size, color, random].filter((p) => p.length > 0).join('-');
};

export const toDateTimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export const dateTimeLocalToIso = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

export const mapBannerToForm = (banner?: AdminBanner): BannerFormState => {
  if (!banner) return emptyBannerForm();
  return {
    title: banner.title || '',
    subtitle: banner.subtitle || '',
    product: banner.product ? String(banner.product) : '',
    original_price: banner.original_price ? formatPriceInput(banner.original_price) : '',
    discount_price: banner.discount_price ? formatPriceInput(banner.discount_price) : '',
    background_color: banner.background_color || '#111827',
    accent_color: banner.accent_color || '#007a4d',
    button_label: banner.button_label || "Mahsulotni ko'rish",
    button_url: banner.button_url || '',
    order: String(banner.order ?? 0),
    is_active: banner.is_active,
    start_date: toDateTimeLocal(banner.start_date),
    end_date: toDateTimeLocal(banner.end_date),
  };
};

export const hasVariantContent = (v: VariantFormState) =>
  Boolean(
    v.color.trim() ||
    v.color_hex.trim() ||
    v.quality.trim() ||
    v.model.trim() ||
    v.size.trim() ||
    v.sku.trim() ||
    v.barcode.trim() ||
    Number(stripNumberFormatting(v.price || '0')) > 0 ||
    Number(stripNumberFormatting(v.cost_price || '0')) > 0 ||
    Number(v.stock || 0) > 0,
  );

// ─── Kichik UI komponentlari ─────────────────────────────────────────────────

export const MiniBadge = ({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'primary' | 'secondary' | 'tertiary';
}) => {
  const p = {
    primary: 'bg-primary-container text-on-primary-container',
    secondary: 'bg-secondary-container text-on-secondary-container',
    tertiary: 'bg-tertiary-container text-on-tertiary-container',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p[tone]}`}>
      {children}
    </span>
  );
};

export const StatusBadge = ({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) => (
  <span
    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}
  >
    {active ? activeLabel : inactiveLabel}
  </span>
);

// Buyurtma holati ranglari — DashboardTab va OrdersTab ikkalasi ham ishlatadi.
export const ORDER_STATUS_COLORS: Record<string, string> = {
  AWAITING_PAYMENT:   'bg-orange-100 text-orange-700',
  PENDING:            'bg-amber-100 text-amber-700',
  CONFIRMED:          'bg-blue-100 text-blue-700',
  PACKING:            'bg-purple-100 text-purple-700',
  SHIPPING:           'bg-indigo-100 text-indigo-700',
  DELIVERED:          'bg-teal-100 text-teal-700',
  RECEIVED:           'bg-emerald-100 text-emerald-700',
  CANCELLED_BY_USER:  'bg-red-100 text-red-600',
  CANCELLED_BY_ADMIN: 'bg-red-200 text-red-700',
  SYSTEM_AUTO_CANCEL: 'bg-gray-100 text-gray-600',
};

// Nasiyani yopishni tasdiqlash dialogi — OrdersTab va NasiyaTab ishlatadi.
interface CreditPayConfirmDialogProps {
  order: AdminOrder | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CreditPayConfirmDialog = ({ order, isPending, onConfirm, onCancel }: CreditPayConfirmDialogProps) => {
  if (!order) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = order.credit_due_date ? new Date(order.credit_due_date) : null;
  const isOverdue = dueDate ? dueDate < today : false;
  const daysOverdue = dueDate
    ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4'>
      {/* Backdrop */}
      <div
        className='absolute inset-0 bg-black/60 backdrop-blur-sm'
        onClick={!isPending ? onCancel : undefined}
      />

      {/* Dialog card */}
      <div className='relative w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl border border-outline-variant animate-in fade-in zoom-in-95 duration-200'>

        {/* Header stripe */}
        <div className={`px-6 pt-6 pb-4 ${isOverdue ? 'bg-red-50 dark:bg-red-950/20' : 'bg-green-50 dark:bg-green-950/20'}`}>
          <div className='flex items-start gap-4'>
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${isOverdue ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40'}`}>
              <span className={`material-symbols-outlined text-[26px] ${isOverdue ? 'text-red-600' : 'text-green-600'}`}>
                {isOverdue ? 'warning' : 'payments'}
              </span>
            </div>
            <div>
              <h3 className='text-base font-bold text-on-surface'>
                Muddatli to'lovni tasdiqlash
              </h3>
              <p className='mt-0.5 text-sm text-on-surface-variant'>
                Buyurtma <span className='font-semibold text-on-surface'>#{order.id}</span>
              </p>
            </div>
          </div>

          {/* Overdue warning banner */}
          {isOverdue && (
            <div className='mt-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-100 dark:bg-red-950/40 p-3'>
              <span className='material-symbols-outlined shrink-0 text-[16px] text-red-600 mt-0.5'>error</span>
              <p className='text-sm font-medium text-red-700 dark:text-red-400'>
                To'lov muddati <strong>{daysOverdue} kun</strong> oldin o'tib ketgan!
                Mijozning muddatli to'lov hisobiga ta'sir qilishi mumkin.
              </p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className='px-6 py-4 space-y-3'>
          <div className='rounded-xl border border-outline-variant bg-surface-container divide-y divide-outline-variant/50'>
            {[
              { label: 'Mijoz', value: order.receiver_name },
              { label: 'Telefon', value: order.receiver_phone },
              {
                label: 'To\'lov summasi',
                value: (
                  <span className='font-bold text-primary text-base'>
                    {formatMoney(order.total_price)} so'm
                  </span>
                ),
              },
              {
                label: 'Muddat',
                value: order.credit_days ? `${order.credit_days} kun` : '—',
              },
              {
                label: 'To\'lov sanasi',
                value: (
                  <span className={isOverdue ? 'font-semibold text-red-600' : 'font-medium text-on-surface'}>
                    {order.credit_due_date ?? '—'}
                  </span>
                ),
              },
            ].map(({ label, value }) => (
              <div key={label} className='flex items-center justify-between px-4 py-2.5 text-sm'>
                <span className='text-on-surface-variant'>{label}</span>
                <span className='text-on-surface'>{value}</span>
              </div>
            ))}
          </div>

          <p className='text-xs text-on-surface-variant text-center'>
            Bu amal qaytarib bo'lmaydi. To'lov muvaffaqiyatli qabul qilinganiga ishonch hosil qiling.
          </p>
        </div>

        {/* Actions */}
        <div className='flex gap-3 px-6 pb-6'>
          <button
            type='button'
            onClick={onCancel}
            disabled={isPending}
            className='flex-1 rounded-xl border border-outline-variant bg-surface px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50'
          >
            Bekor qilish
          </button>
          <button
            type='button'
            onClick={onConfirm}
            disabled={isPending}
            className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60'
          >
            {isPending ? (
              <>
                <span className='material-symbols-outlined animate-spin text-[16px]'>progress_activity</span>
                Qayd etilmoqda...
              </>
            ) : (
              <>
                <span className='material-symbols-outlined text-[16px]'>check_circle</span>
                To'lovni tasdiqlash
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
