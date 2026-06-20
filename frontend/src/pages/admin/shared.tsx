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
  images?: { id: number; url: string }[];
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
  }>;
  history: AdminOrderHistory[];
  user?: { id: number; phone: string } | null;
}

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

export const extractErrorMessage = (error: unknown) => {
  const responseData = (error as { response?: { data?: unknown } })?.response?.data;
  if (!responseData) return 'Xatolik yuz berdi.';
  if (typeof responseData === 'string') return responseData;
  if (Array.isArray(responseData)) return responseData.join(', ');
  if (typeof responseData === 'object') {
    for (const value of Object.values(responseData as Record<string, unknown>)) {
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
    }
  }
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
    existingImages: v.images || [],
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
