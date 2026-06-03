import React, {
  Fragment,
  useEffect,
  useState,
  useMemo,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import {
  adminCreateBanner,
  adminCreateCategory,
  adminCreateProduct,
  adminDeleteBanner,
  adminDeleteCategory,
  adminDeleteProduct,
  adminGetBanners,
  adminGetCategories,
  adminGetOrders,
  adminGetProducts,
  adminGetReport,
  adminUpdateBanner,
  adminUpdateOrderStatus,
  adminUpdateProduct,
  adminGetExchangeRate,
  adminUpdateExchangeRate,
  adminGetStockReport,
  adminPayCreditOrder,
  adminGetKassa,
  adminWithdrawKassa,
  adminGetDashboard,
  adminGetUsers,
  adminGetUser,
  adminLiftUserCreditBan,
  adminGetShopInfo,
  adminUpdateShopInfo,
  adminToggleUserActive,
  adminGetFeedbacks,
  adminUpdateFeedback,
  adminGetPhoneBrands,
  adminCreatePhoneBrand,
  adminDeletePhoneBrand,
  adminCreatePhoneSeries,
  adminDeletePhoneSeries,
  adminCreatePhoneModel,
  adminDeletePhoneModel,
  adminGetProductCompatibility,
  adminAddProductCompatibility,
  adminRemoveProductCompatibility,
  adminBulkAddCompatibilitySeries,
  adminGetStaff,
  adminAssignRole,
  adminFireStaff,
  adminGetMasters,
  adminAssignMaster,
  adminRemoveMaster,
  adminGetMasterDiscount,
  adminSetMasterDiscount,
  adminGetAuditLogs,
} from '../api/endpoints';
import { ROLE_LABELS, ROLE_COLORS, type StaffRole } from '../store/authStore';
import {
  getOrderStatusBadge,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from '../utils/orderStatus';
import { toast } from '../utils/toast';
import { printReceipt, printCreditAgreement } from '../utils/receiptPrinter';
import { loadShopInfo, useShopInfo, updateShopInfoCache } from '../utils/shopInfoCache';
import { playNewOrderSound } from '../utils/notificationSound';
import { adminPollOrders } from '../api/endpoints';
import ThemeToggle from '../components/ThemeToggle';
import AdminPOS from '../components/AdminPOS';

type AdminTab = 'dashboard' | 'products' | 'banners' | 'categories' | 'orders' | 'users' | 'feedback' | 'reports' | 'stock' | 'pos' | 'kassa' | 'nasiya' | 'sozlamalar' | 'compatibility' | 'staff' | 'masters' | 'audit';

// Har bir tab qaysi rollar uchun ko'rinadi
const TAB_ROLES: Partial<Record<AdminTab, StaffRole[]>> = {
  // isSuperUser (is_superuser=True) har qanday tabni ko'ra oladi
  dashboard:     ['admin'],
  pos:           ['admin', 'seller'],
  orders:        ['admin', 'seller', 'courier'],
  users:         ['admin'],
  feedback:      ['admin'],
  products:      ['admin'],
  categories:    ['admin'],
  banners:       ['admin'],
  compatibility: ['admin'],
  kassa:         ['admin'],          // faqat Admin + SuperAdmin
  nasiya:        ['admin'],
  reports:       ['admin'],
  stock:         ['admin', 'seller'],  // Sotuvchi ombor ko'ra oladi
  sozlamalar:    ['admin'],
  staff:         [],                 // faqat isSuperUser (is_superuser=True)
  masters:       [],                 // faqat isSuperUser (is_superuser=True)
  audit:         [],                 // faqat isSuperUser (is_superuser=True)
};

function canSeeTab(tab: AdminTab, role?: StaffRole | null, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!role) return false;
  const allowed = TAB_ROLES[tab];
  if (!allowed) return true;
  return allowed.includes(role);
}

const _notNull = <T,>(x: T | null | undefined): x is T => x != null;

interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  parent_name?: string | null;
  image?: string | null;
  is_active: boolean;
  is_popular: boolean;
}

interface AdminProductVariant {
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

interface AdminProduct {
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

interface AdminPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface ProductFormState {
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

interface VariantFormState {
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

interface ProductEditorState {
  mode: 'create' | 'edit';
  product?: AdminProduct;
}

interface AdminBanner {
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

interface BannerFormState {
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

interface BannerEditorState {
  mode: 'create' | 'edit';
  banner?: AdminBanner;
}

interface AdminOrderHistory {
  id: number;
  to_status: string;
  note: string;
  created_at: string;
  actor_name?: string | null;
  actor_type: string;
}

interface AdminOrder {
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

interface AdminStockItem {
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

const emptyProductForm = (): ProductFormState => ({
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

const makeVariantClientId = () => `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyVariant = (groupId?: string): VariantFormState => ({
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

const emptyBannerForm = (): BannerFormState => ({
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

const formatMoney = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '0';
  return Number(value).toLocaleString('uz-UZ');
};

const stripNumberFormatting = (value: string) => value.replace(/\s+/g, '').replace(/,/g, '.');

const formatPriceInput = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '';
  const normalized = String(value).replace(/\s+/g, '').replace(/,/g, '.');
  const [integerPartRaw, decimalPartRaw = ''] = normalized.split('.', 2);
  const integerDigits = integerPartRaw.replace(/\D/g, '') || '0';
  const formattedInteger = integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimalDigits = decimalPartRaw.replace(/\D/g, '');
  if (!decimalDigits || /^0+$/.test(decimalDigits)) return formattedInteger;
  return `${formattedInteger}.${decimalDigits.slice(0, 2)}`;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

// ─── AWAITING_PAYMENT Countdown Timer ────────────────────────────────────────
const AWAITING_PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;

const AwaitingPaymentCountdown = ({ createdAt }: { createdAt: string }) => {
  const calcRemaining = () => {
    const created = new Date(createdAt).getTime();
    return Math.max(0, created + AWAITING_PAYMENT_TIMEOUT_MS - Date.now());
  };
  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    const timer = setInterval(() => setRemaining(calcRemaining()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const isExpired = remaining === 0;
  const isUrgent = !isExpired && remaining < 5 * 60 * 1000;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
        isExpired
          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-400'
          : isUrgent
            ? 'animate-pulse border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-800/50 dark:bg-orange-950/20 dark:text-orange-400'
            : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400'
      }`}
    >
      <span className='material-symbols-outlined text-[16px] shrink-0'>
        {isExpired ? 'timer_off' : isUrgent ? 'hourglass_bottom' : 'hourglass_top'}
      </span>
      {isExpired ? (
        <span>Muddati o'tdi — tizim buyurtmani bekor qiladi.</span>
      ) : (
        <span>
          To'lov uchun qoldi:{' '}
          <strong>
            {minutes}:{String(seconds).padStart(2, '0')}
          </strong>
          {isUrgent && ' — shoshiling!'}
        </span>
      )}
    </div>
  );
};

// ─── Credit Payment Confirmation Dialog ──────────────────────────────────────
interface CreditPayConfirmDialogProps {
  order: AdminOrder | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CreditPayConfirmDialog = ({ order, isPending, onConfirm, onCancel }: CreditPayConfirmDialogProps) => {
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

const COLOR_PRESETS = [
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

const QUALITY_PRESETS = ['Original', 'Premium', 'OEM', 'Copy A', 'Copy B'];

const categoryLabel = (category: AdminCategory) =>
  category.parent_name ? `${category.parent_name} / ${category.name}` : category.name;

const extractErrorMessage = (error: unknown) => {
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

const mapProductToForm = (product?: AdminProduct): ProductFormState => {
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

const mapProductVariants = (product?: AdminProduct): VariantFormState[] => {
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

const generateVariantSku = (productName: string, variant: VariantFormState) => {
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

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const dateTimeLocalToIso = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const mapBannerToForm = (banner?: AdminBanner): BannerFormState => {
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

const hasVariantContent = (v: VariantFormState) =>
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

const MiniBadge = ({
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

const StatusBadge = ({
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

const AdminPanel = () => {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  if (!isAuthenticated || !user?.is_admin) {
    return (
      <div className='flex min-h-[60vh] flex-col items-center justify-center gap-4'>
        <span className='material-symbols-outlined text-6xl text-error'>lock</span>
        <h2 className='font-h2 text-h2 text-on-surface'>Ruxsat yo'q</h2>
        <p className='text-on-surface-variant'>Bu sahifa faqat adminlar uchun.</p>
        <button
          onClick={() => navigate('/auth')}
          className='rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary'
        >
          Kirish
        </button>
      </div>
    );
  }
  return <AdminDashboard />;
};

const _ALL_TABS: AdminTab[] = [
  'dashboard', 'pos', 'orders', 'users', 'feedback',
  'products', 'categories', 'banners', 'compatibility',
  'kassa', 'nasiya', 'reports', 'stock', 'sozlamalar', 'staff', 'masters', 'audit',
];

// ─── Real-time buyurtmalar polling ───────────────────────────────────────────
//
// 10 sekundlik polling — yangi buyurtmalarni darhol aniqlash. WebSocket/SSE
// o'rniga polling tanlandi (Render Free tier persistent connection cheklovi).
//
// FUNKSIYALAR:
//   • lastSeenId localStorage'da saqlanadi -> sahifa yangilansa ham
//     "yangi"larni eslab qoladi.
//   • Birinchi load: server'dan joriy latest_id baseline sifatida olinadi
//     -> mavjud buyurtmalar uchun "yangi" badge chiqarmaydi.
//   • Yangi keldi -> sound + toast + admin-orders cache invalidatsiya.
//   • Tab background bo'lsa polling to'xtaydi (battery + Render yuki).
//   • Sahifa fokusiga qaytsa darhol refetch.
//   • prevNewCount ref bilan dedup -> bir xil counter ikki marta toast bermaydi.
const LAST_SEEN_ORDER_ID_KEY = 'admin:last-seen-order-id';

const useOrdersPolling = (enabled: boolean, isOnOrdersTab: boolean) => {
  const qc = useQueryClient();

  // Baseline lastSeenId — localStorage'dan o'qiymiz yoki birinchi marta
  // server'dan boshlang'ich qiymat olamiz
  const [lastSeenId, setLastSeenIdState] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(LAST_SEEN_ORDER_ID_KEY);
      return stored ? parseInt(stored, 10) : null;
    } catch {
      return null;
    }
  });

  const setLastSeenId = useCallback((id: number) => {
    setLastSeenIdState(id);
    try {
      localStorage.setItem(LAST_SEEN_ORDER_ID_KEY, String(id));
    } catch { /* noop */ }
  }, []);

  // Birinchi load — baseline o'rnatish (mavjud buyurtmalarni "yangi" deb
  // ko'rsatmaslik uchun)
  useEffect(() => {
    if (enabled && lastSeenId === null) {
      adminPollOrders(0)
        .then((r) => setLastSeenId(r.data.latest_id || 0))
        .catch(() => {/* ignore */});
    }
  }, [enabled, lastSeenId, setLastSeenId]);

  // Polling query
  const poll = useQuery({
    queryKey: ['admin-orders-poll', lastSeenId],
    queryFn: () => adminPollOrders(lastSeenId ?? 0).then((r) => r.data),
    refetchInterval: 10_000, // 10 sekund
    refetchIntervalInBackground: false, // tab yashirin bo'lsa pause
    refetchOnWindowFocus: true,           // qaytib kelsa darhol
    enabled: enabled && lastSeenId !== null,
  });

  // prevNewCount — bir xil counter ikki marta toast bermasligi uchun ref
  const prevNewCount = useRef(0);
  // lastSeenId o'zgarsa (markAllSeen orqali) — counterni ham reset
  useEffect(() => {
    prevNewCount.current = 0;
  }, [lastSeenId]);

  // Yangi keldi -> reaktsiya
  useEffect(() => {
    const currentCount = poll.data?.new_count ?? 0;
    if (currentCount > prevNewCount.current) {
      // Faqat baseline o'rnatilgandan keyin toast (init noise oldini olish)
      if (lastSeenId !== null && lastSeenId > 0) {
        const justArrived = currentCount - prevNewCount.current;
        playNewOrderSound();
        toast.success(
          `🛎 ${justArrived} ta yangi buyurtma keldi!`,
          { duration: 5000 },
        );
      }
      // Orders list va dashboard cache'larni invalidatsiya — UI darhol yangilanadi
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-nasiya-summary'] });
    }
    prevNewCount.current = currentCount;
  }, [poll.data?.new_count, lastSeenId, qc]);

  // Admin Orders tab'iga o'tsa "ko'rdim" deb belgilash (badge tushadi)
  useEffect(() => {
    if (isOnOrdersTab && poll.data?.latest_id) {
      setLastSeenId(poll.data.latest_id);
    }
  }, [isOnOrdersTab, poll.data?.latest_id, setLastSeenId]);

  return {
    newCount: poll.data?.new_count ?? 0,
    latestId: poll.data?.latest_id ?? 0,
    isPolling: poll.isFetching,
  };
};

const AdminDashboard = () => {
  const { logout, user } = useAuthStore();
  const resetCart = useCartStore((s) => s.resetCart);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Do'kon ma'lumotlarini erta yuklaymiz -> shared modul cache (shopInfoCache.ts)
  // avtomat to'ladi va OrdersTab'dan chek bosilganda printReceipt sinxron
  // loadShopInfo()'dan yangi qiymatni oladi. Cache yangilanishi useShopInfo
  // hook ichida useEffect bilan boshqariladi -> bu yerda alohida useEffect
  // kerakmas.
  useShopInfo();

  const userRole    = user?.role as StaffRole | undefined;
  const isSuperUser = !!(user?.is_admin && !userRole);

  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    _ALL_TABS.find(t => canSeeTab(t, userRole, isSuperUser)) ?? 'orders'
  );

  // Real-time polling — yangi buyurtmalar son badge'i + toast + sound
  // Faqat xodimlar uchun (canSeeTab orders) va auth bor bo'lganda
  const canSeeOrders = canSeeTab('orders', userRole, isSuperUser);
  const { newCount: newOrdersCount } = useOrdersPolling(
    !!user && canSeeOrders,
    activeTab === 'orders',
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productFilters, setProductFilters] = useState({
    q: '',
    category: '',
    status: '',
    tag: '',
    page: 1,
    page_size: 20,
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['admin-products', productFilters],
    queryFn: () =>
      adminGetProducts({
        q: productFilters.q || undefined,
        category: productFilters.category || undefined,
        status: productFilters.status || undefined,
        tag: productFilters.tag || undefined,
        page: productFilters.page,
        page_size: productFilters.page_size,
      }).then((r) => r.data),
  });
  const productResponse = productsData as
    | AdminPaginatedResponse<AdminProduct>
    | AdminProduct[]
    | undefined;
  const products: AdminProduct[] = Array.isArray(productResponse)
    ? productResponse
    : productResponse?.results || [];
  const productCount = Array.isArray(productResponse)
    ? productResponse.length
    : productResponse?.count || 0;
  const productHasPrev = Array.isArray(productResponse)
    ? false
    : Boolean(productResponse?.previous);
  const productHasNext = Array.isArray(productResponse) ? false : Boolean(productResponse?.next);

  const { data: bannersData, isLoading: bannersLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: () => adminGetBanners().then((r) => r.data),
  });
  const banners: AdminBanner[] = bannersData?.results || bannersData || [];
  const { data: categoriesData } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminGetCategories().then((r) => r.data),
  });
  const categories: AdminCategory[] = categoriesData?.results || categoriesData || [];
  const deleteProductMutation = useMutation({
    mutationFn: (id: number) => adminDeleteProduct(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-products'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['product'] }),
        qc.invalidateQueries({ queryKey: ['mainPage'] }),
      ]);
    },
  });
  const deleteBannerMutation = useMutation({
    mutationFn: (id: number) => adminDeleteBanner(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-banners'] }),
        qc.invalidateQueries({ queryKey: ['mainPage'] }),
      ]);
    },
  });
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => adminDeleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });

  const handleLogout = () => {
    logout();
    resetCart();
    navigate('/auth');
  };

  type NavItem = { key: AdminTab; label: string; icon: string; badge?: number };
  const _tab = (key: AdminTab, label: string, icon: string, badge?: number): NavItem | null =>
    canSeeTab(key, userRole, isSuperUser) ? { key, label, icon, badge } : null;

  const NAV_GROUPS = [
    {
      group: 'Asosiy',
      items: [_tab('dashboard', 'Dashboard', 'dashboard')].filter(_notNull),
    },
    {
      group: 'Savdo',
      items: [
        _tab('pos',      "Do'kon (POS)",     'point_of_sale'),
        // Buyurtmalar — yangi buyurtmalar son badge (real-time polling)
        _tab('orders',   'Buyurtmalar',      'local_shipping', newOrdersCount),
        _tab('users',    'Foydalanuvchilar', 'people'),
        _tab('feedback', 'Fikrlar',          'forum'),
      ].filter(_notNull),
    },
    {
      group: 'Katalog',
      items: [
        _tab('products',     'Mahsulotlar',      'inventory_2'),
        _tab('categories',   'Kategoriyalar',    'category'),
        _tab('banners',      'Bannerlar',         'view_carousel'),
        _tab('compatibility','Moslik matritsasi', 'device_hub'),
      ].filter(_notNull),
    },
    {
      group: 'Moliya',
      items: [
        _tab('kassa',   'Kassa',       'account_balance_wallet'),
        _tab('nasiya',  'Nasiya',      'calendar_month'),
        _tab('reports', 'Hisobotlar',  'bar_chart'),
      ].filter(_notNull),
    },
    {
      group: 'Ombor',
      items: [_tab('stock', 'Ombor', 'warehouse')].filter(_notNull),
    },
    {
      group: 'Tizim',
      items: [
        _tab('sozlamalar', 'Sozlamalar',    'settings'),
        _tab('staff',      'Xodimlar',      'manage_accounts'),
        _tab('masters',    'Ustalar',       'construction'),
        _tab('audit',      'Audit log',     'fact_check'),
      ].filter(_notNull),
    },
  ].filter(g => g.items.length > 0) as { group: string; items: NavItem[] }[];

  const activeLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.label || '';

  return (
    <div className='min-h-screen bg-surface-container-low'>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 z-30 bg-black/50 lg:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-outline-variant bg-surface-container-lowest transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className='flex items-center gap-3 border-b border-outline-variant px-5 py-4'>
          <span className='material-symbols-outlined fill-icon text-2xl text-primary'>
            admin_panel_settings
          </span>
          <span className='text-base font-bold text-primary'>Bozor Admin</span>
        </div>

        {/* Navigation */}
        <nav className='flex-1 overflow-y-auto px-3 py-4'>
          {NAV_GROUPS.map(({ group, items }) => (
            <div key={group} className='mb-5'>
              <p className='mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50'>
                {group}
              </p>
              {items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setActiveTab(item.key as AdminTab);
                    setSidebarOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    activeTab === item.key
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[20px] ${activeTab === item.key ? 'fill-icon' : ''}`}
                  >
                    {item.icon}
                  </span>
                  <span className='flex-1 text-left'>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      // Real-time polling badge — pulsing animatsiya
                      className='inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-on-error animate-pulse'
                      title={`${item.badge} ta yangi buyurtma`}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className='border-t border-outline-variant p-4'>
          <p className='truncate text-sm font-semibold text-on-surface'>{user?.phone}</p>
          <div className='mb-3 mt-1'>
            {userRole ? (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[userRole] || ''}`}>
                {ROLE_LABELS[userRole] || userRole}
              </span>
            ) : (
              <span className='inline-block rounded-full bg-error/15 text-error border border-error/20 px-2 py-0.5 text-[11px] font-semibold'>
                Super Admin
              </span>
            )}
          </div>
          <div className='flex gap-2'>
            <button
              onClick={() => navigate('/')}
              className='flex flex-1 items-center justify-center gap-1 rounded-lg border border-outline-variant py-1.5 text-xs text-on-surface-variant hover:bg-surface-container hover:text-primary'
            >
              <span className='material-symbols-outlined text-[15px]'>open_in_new</span>Sayt
            </button>
            <button
              onClick={handleLogout}
              className='flex flex-1 items-center justify-center gap-1 rounded-lg border border-error/30 py-1.5 text-xs text-error hover:bg-error/10'
            >
              <span className='material-symbols-outlined text-[15px]'>logout</span>Chiqish
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className='flex min-h-screen flex-col lg:ml-64'>
        {/* Top bar */}
        <header className='sticky top-0 z-20 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-sm'>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className='rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container lg:hidden'
          >
            <span className='material-symbols-outlined text-[22px]'>menu</span>
          </button>
          <span className='flex-1 text-sm font-semibold text-on-surface'>{activeLabel}</span>
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main className='flex-1 px-4 py-6 md:px-6'>
          {activeTab === 'products' && (
            <ProductsTab
              categories={categories}
              loading={productsLoading}
              filters={productFilters}
              onFiltersChange={setProductFilters}
              onDelete={(id) => {
                if (confirm("Mahsulotni o'chirishni tasdiqlaysizmi?"))
                  deleteProductMutation.mutate(id);
              }}
              totalCount={productCount}
              hasPrevPage={productHasPrev}
              hasNextPage={productHasNext}
              products={products}
            />
          )}
          {activeTab === 'banners' && (
            <BannersTab
              banners={banners}
              loading={bannersLoading}
              onDelete={(id) => {
                if (confirm("Bannerni o'chirishni tasdiqlaysizmi?")) deleteBannerMutation.mutate(id);
              }}
              products={products}
            />
          )}
          {activeTab === 'categories' && (
            <CategoriesTab
              categories={categories}
              onDelete={(id) => {
                if (confirm("Kategoriyani o'chirishni tasdiqlaysizmi?"))
                  deleteCategoryMutation.mutate(id);
              }}
            />
          )}
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'feedback' && <FeedbackTab />}
          {activeTab === 'stock' && <StockTab />}
          {activeTab === 'pos' && <AdminPOS />}
          {activeTab === 'reports' && <ReportsTab />}
          {activeTab === 'kassa' && <KassaTab />}
          {activeTab === 'nasiya' && <NasiyaTab />}
          {activeTab === 'sozlamalar' && <SozlamalarTab />}
          {activeTab === 'compatibility' && <CompatibilityTab />}
          {activeTab === 'staff' && <StaffTab />}
          {activeTab === 'masters' && <MastersTab />}
          {activeTab === 'audit' && <AuditLogTab />}
        </main>
      </div>
    </div>
  );
};

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

const DashboardTab = () => {
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

const ProductsTab = ({
  products,
  totalCount,
  loading,
  categories,
  filters,
  onFiltersChange,
  hasPrevPage,
  hasNextPage,
  onDelete,
}: {
  products: AdminProduct[];
  totalCount: number;
  loading: boolean;
  categories: AdminCategory[];
  filters: {
    q: string;
    category: string;
    status: string;
    tag: string;
    page: number;
    page_size: number;
  };
  onFiltersChange: Dispatch<
    SetStateAction<{
      q: string;
      category: string;
      status: string;
      tag: string;
      page: number;
      page_size: number;
    }>
  >;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  onDelete: (id: number) => void;
}) => {
  const [editorState, setEditorState] = useState<ProductEditorState | null>(null);
  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Mahsulotlar ({totalCount})</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Tovar ma'lumotlari, rasm va variantlarni shu yerdan to'liq boshqaring.
          </p>
        </div>
        <button
          onClick={() => setEditorState({ mode: 'create' })}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
        >
          <span className='material-symbols-outlined text-[18px]'>add</span>Mahsulot qo'shish
        </button>
      </div>
      {editorState && (
        <ProductEditor
          categories={categories}
          mode={editorState.mode}
          product={editorState.product}
          onClose={() => setEditorState(null)}
        />
      )}
      <div className='rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm'>
        <div className='grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_220px_180px_180px_140px_auto]'>
          <input
            value={filters.q}
            onChange={(e) => onFiltersChange((c) => ({ ...c, q: e.target.value, page: 1 }))}
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            placeholder="Nomi, slug, SKU, barcode, rang yoki sifat bo'yicha qidiring"
          />
          <select
            value={filters.category}
            onChange={(e) => onFiltersChange((c) => ({ ...c, category: e.target.value, page: 1 }))}
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha kategoriyalar</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => onFiltersChange((c) => ({ ...c, status: e.target.value, page: 1 }))}
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha statuslar</option>
            <option value='active'>Faol</option>
            <option value='inactive'>Noaktiv</option>
          </select>
          <select
            value={filters.tag}
            onChange={(e) => onFiltersChange((c) => ({ ...c, tag: e.target.value, page: 1 }))}
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha belgilar</option>
            <option value='discount'>Chegirmadagi</option>
            <option value='new'>Yangi</option>
            <option value='popular'>Ommabop</option>
          </select>
          <select
            value={filters.page_size}
            onChange={(e) =>
              onFiltersChange((c) => ({ ...c, page_size: Number(e.target.value), page: 1 }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value={20}>20 ta</option>
            <option value={50}>50 ta</option>
            <option value={100}>100 ta</option>
          </select>
          <button
            type='button'
            onClick={() =>
              onFiltersChange({
                q: '',
                category: '',
                status: '',
                tag: '',
                page: 1,
                page_size: filters.page_size,
              })
            }
            className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
          >
            Tozalash
          </button>
        </div>
      </div>
      {loading ? (
        <div className='py-12 text-center text-on-surface-variant'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
            progress_activity
          </span>
          Yuklanmoqda...
        </div>
      ) : products.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            inventory_2
          </span>
          <p className='font-h3 text-on-surface-variant'>Mahsulotlar yo'q</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[980px] text-left'>
              <thead className='border-b border-outline-variant bg-surface-container'>
                <tr>
                  {[
                    'Mahsulot',
                    'Kategoriya',
                    'Narx',
                    'Ombor',
                    'Variant',
                    'Holat',
                    'Yangilangan',
                    'Amal',
                  ].map((h) => (
                    <th
                      key={h}
                      className='px-4 py-3 text-label-md font-label-md uppercase text-on-surface-variant'
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-outline-variant'>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className='transition-colors hover:bg-surface-container-low/50'
                  >
                    <td className='px-4 py-4'>
                      <div className='flex items-center gap-3'>
                        <div className='h-14 w-14 overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
                          {product.main_image ? (
                            <img
                              src={product.main_image}
                              alt={product.name}
                              className='h-full w-full object-cover'
                            />
                          ) : (
                            <div className='flex h-full w-full items-center justify-center text-outline'>
                              <span className='material-symbols-outlined'>image</span>
                            </div>
                          )}
                        </div>
                        <div className='min-w-0'>
                          <div className='font-body-md text-on-surface'>{product.name}</div>
                          <div className='mt-1 text-xs text-on-surface-variant'>
                            slug: {product.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className='px-4 py-4 text-body-sm text-on-surface'>
                      {product.category_name || (
                        <span className='text-on-surface-variant'>Biriktirilmagan</span>
                      )}
                    </td>
                    <td className='px-4 py-4'>
                      <div className='font-semibold text-on-surface'>
                        {formatMoney(product.price)} so'm
                      </div>
                      {product.discount_price && (
                        <div className='text-xs text-secondary-container'>
                          Chegirma: {formatMoney(product.discount_price)} so'm
                        </div>
                      )}
                    </td>
                    <td className='px-4 py-4 text-body-sm text-on-surface'>{product.stock} dona</td>
                    <td className='px-4 py-4 text-body-sm text-on-surface'>
                      {product.variants?.length || 0} ta
                    </td>
                    <td className='px-4 py-4'>
                      <div className='flex flex-wrap gap-1'>
                        <StatusBadge
                          active={product.is_active}
                          activeLabel='Faol'
                          inactiveLabel='Ochiq emas'
                        />
                        {product.is_new && <MiniBadge tone='primary'>Yangi</MiniBadge>}
                        {product.is_popular && <MiniBadge tone='secondary'>Ommabop</MiniBadge>}
                        {product.is_discount && <MiniBadge tone='tertiary'>Chegirma</MiniBadge>}
                      </div>
                    </td>
                    <td className='px-4 py-4 text-body-sm text-on-surface-variant'>
                      {formatDate(product.updated_at)}
                    </td>
                    <td className='px-4 py-4'>
                      <div className='flex items-center gap-1'>
                        <button
                          onClick={() => setEditorState({ mode: 'edit', product })}
                          className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
                          title='Tahrirlash'
                        >
                          <span className='material-symbols-outlined text-[20px]'>edit</span>
                        </button>
                        <button
                          onClick={() => onDelete(product.id)}
                          className='rounded-lg p-2 text-error hover:bg-error-container/20'
                          title="O'chirish"
                        >
                          <span className='material-symbols-outlined text-[20px]'>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className='flex flex-col gap-3 border-t border-outline-variant px-4 py-3 md:flex-row md:items-center md:justify-between'>
            <div className='text-sm text-on-surface-variant'>
              Sahifa: {filters.page} • Ko'rsatilmoqda: {products.length} ta
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                disabled={!hasPrevPage}
                onClick={() => onFiltersChange((c) => ({ ...c, page: Math.max(1, c.page - 1) }))}
                className='rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface hover:bg-surface-container disabled:opacity-45'
              >
                Oldingi
              </button>
              <button
                type='button'
                disabled={!hasNextPage}
                onClick={() => onFiltersChange((c) => ({ ...c, page: c.page + 1 }))}
                className='rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface hover:bg-surface-container disabled:opacity-45'
              >
                Keyingi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const BannersTab = ({
  banners,
  products,
  loading,
  onDelete,
}: {
  banners: AdminBanner[];
  products: AdminProduct[];
  loading: boolean;
  onDelete: (id: number) => void;
}) => {
  const [editorState, setEditorState] = useState<BannerEditorState | null>(null);
  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Bannerlar ({banners.length})</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Home sahifadagi reklama bannerlari shu yerdan boshqariladi.
          </p>
        </div>
        <button
          onClick={() => setEditorState({ mode: 'create' })}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
        >
          <span className='material-symbols-outlined text-[18px]'>add</span>Banner qo'shish
        </button>
      </div>
      {editorState && (
        <BannerEditor
          banner={editorState.banner}
          mode={editorState.mode}
          onClose={() => setEditorState(null)}
          products={products}
        />
      )}
      {loading ? (
        <div className='py-12 text-center text-on-surface-variant'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
            progress_activity
          </span>
          Yuklanmoqda...
        </div>
      ) : banners.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            view_carousel
          </span>
          <p className='font-h3 text-on-surface-variant'>Bannerlar yo'q</p>
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          {banners.map((banner) => (
            <article
              key={banner.id}
              className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'
            >
              <div
                className='relative min-h-[180px] overflow-hidden p-5 text-white'
                style={{
                  backgroundColor: banner.background_color || '#111827',
                  backgroundImage: banner.background_image_url
                    ? `linear-gradient(90deg,${banner.background_color || '#111827'}e6 0%,${banner.background_color || '#111827'}bf 46%,${banner.accent_color || '#007a4d'}8c 100%),url(${banner.background_image_url})`
                    : `linear-gradient(105deg,${banner.background_color || '#111827'} 0%,${banner.background_color || '#111827'} 52%,${banner.accent_color || '#007a4d'} 100%)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div className='relative z-10 max-w-[70%]'>
                  <span className='rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm'>
                    Reklama
                  </span>
                  <h3 className='mt-4 text-2xl font-black leading-tight'>{banner.title}</h3>
                  {banner.subtitle && (
                    <p className='mt-2 line-clamp-2 text-sm text-white/80'>{banner.subtitle}</p>
                  )}
                  <div className='mt-4 flex flex-wrap items-end gap-2'>
                    {banner.original_price && banner.discount_price && (
                      <span className='text-sm text-white/60 line-through'>
                        {formatMoney(banner.original_price)} so'm
                      </span>
                    )}
                    {(banner.discount_price || banner.original_price) && (
                      <span className='text-xl font-black'>
                        {formatMoney(banner.discount_price || banner.original_price)} so'm
                      </span>
                    )}
                  </div>
                </div>
                {banner.product_image_url && (
                  <img
                    src={banner.product_image_url}
                    alt={banner.title}
                    className='absolute bottom-0 right-3 h-[88%] max-w-[46%] object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,0.32)]'
                  />
                )}
              </div>
              <div className='space-y-4 p-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge
                    active={banner.is_active}
                    activeLabel='Faol'
                    inactiveLabel='Ochiq emas'
                  />
                  <MiniBadge tone='primary'>Tartib: {String(banner.order)}</MiniBadge>
                  {banner.product_name && (
                    <MiniBadge tone='secondary'>{banner.product_name}</MiniBadge>
                  )}
                </div>
                <div className='flex justify-end gap-2 border-t border-outline-variant pt-3'>
                  <button
                    onClick={() => setEditorState({ mode: 'edit', banner })}
                    className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
                  >
                    <span className='material-symbols-outlined text-[20px]'>edit</span>
                  </button>
                  <button
                    onClick={() => onDelete(banner.id)}
                    className='rounded-lg p-2 text-error hover:bg-error-container/20'
                  >
                    <span className='material-symbols-outlined text-[20px]'>delete</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

const BannerEditor = ({
  mode,
  banner,
  products,
  onClose,
}: {
  mode: 'create' | 'edit';
  banner?: AdminBanner;
  products: AdminProduct[];
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<BannerFormState>(() => mapBannerToForm(banner));
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [removeProductImage, setRemoveProductImage] = useState(false);
  const [removeBackgroundImage, setRemoveBackgroundImage] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setForm(mapBannerToForm(banner));
    setProductImageFile(null);
    setBackgroundImageFile(null);
    setRemoveProductImage(false);
    setRemoveBackgroundImage(false);
    setFormError('');
  }, [banner, mode]);

  const saveMutation = useMutation({
    mutationFn: (payload: FormData) =>
      mode === 'edit' && banner
        ? adminUpdateBanner(banner.id, payload)
        : adminCreateBanner(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-banners'] }),
        qc.invalidateQueries({ queryKey: ['mainPage'] }),
      ]);
      onClose();
    },
    onError: (error) => setFormError(extractErrorMessage(error)),
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    const payload = new FormData();
    payload.append('title', form.title.trim());
    payload.append('subtitle', form.subtitle.trim());
    payload.append('product', form.product);
    payload.append('original_price', stripNumberFormatting(form.original_price.trim()));
    payload.append('discount_price', stripNumberFormatting(form.discount_price.trim()));
    payload.append('background_color', form.background_color || '#111827');
    payload.append('accent_color', form.accent_color || '#007a4d');
    payload.append('button_label', form.button_label.trim() || "Mahsulotni ko'rish");
    payload.append('button_url', form.button_url.trim());
    payload.append('order', form.order || '0');
    payload.append('is_active', String(form.is_active));
    payload.append('start_date', dateTimeLocalToIso(form.start_date));
    payload.append('end_date', dateTimeLocalToIso(form.end_date));
    payload.append('remove_product_image', String(removeProductImage));
    payload.append('remove_background_image', String(removeBackgroundImage));
    if (productImageFile) payload.append('product_image', productImageFile);
    if (backgroundImageFile) payload.append('background_image', backgroundImageFile);
    await saveMutation.mutateAsync(payload);
  };

  return (
    <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
      <div className='mb-6 flex flex-col gap-2 border-b border-outline-variant pb-4 md:flex-row md:items-center md:justify-between'>
        <h3 className='font-h3 text-h3 text-on-surface'>
          {mode === 'edit' ? 'Bannerni tahrirlash' : 'Yangi banner'}
        </h3>
      </div>
      {formError && (
        <div className='mb-4 flex gap-2 rounded-lg bg-error-container p-3 text-body-sm text-on-error-container'>
          <span className='material-symbols-outlined text-[16px]'>error</span>
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} className='space-y-6'>
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <div className='xl:col-span-5'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tovar nomi *
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='Tovar nomini kiriting'
            />
          </div>
          <div className='xl:col-span-4'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Bog'langan tovar
            </label>
            <select
              value={form.product}
              onChange={(e) => setForm((c) => ({ ...c, product: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            >
              <option value=''>-- Tovar tanlanmagan --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} - {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tartib
            </label>
            <input
              min='0'
              type='number'
              value={form.order}
              onChange={(e) => setForm((c) => ({ ...c, order: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            />
          </div>
          <div className='xl:col-span-12'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Kichik sharh
            </label>
            <textarea
              rows={3}
              value={form.subtitle}
              onChange={(e) => setForm((c) => ({ ...c, subtitle: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='Reklama ostida chiqadigan qisqa sharh'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Asl narx
            </label>
            <input
              type='text'
              inputMode='decimal'
              value={form.original_price}
              onChange={(e) =>
                setForm((c) => ({ ...c, original_price: formatPriceInput(e.target.value) }))
              }
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='3 200 000'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Chegirma narxi
            </label>
            <input
              type='text'
              inputMode='decimal'
              value={form.discount_price}
              onChange={(e) =>
                setForm((c) => ({ ...c, discount_price: formatPriceInput(e.target.value) }))
              }
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='3 099 994'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Orqa fon rangi
            </label>
            <div className='flex overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
              <input
                type='color'
                value={form.background_color}
                onChange={(e) => setForm((c) => ({ ...c, background_color: e.target.value }))}
                className='h-10 w-12 cursor-pointer border-0 bg-transparent p-1'
              />
              <input
                value={form.background_color}
                onChange={(e) => setForm((c) => ({ ...c, background_color: e.target.value }))}
                className='min-w-0 flex-1 bg-transparent px-3 outline-none'
              />
            </div>
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Accent rangi
            </label>
            <div className='flex overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
              <input
                type='color'
                value={form.accent_color}
                onChange={(e) => setForm((c) => ({ ...c, accent_color: e.target.value }))}
                className='h-10 w-12 cursor-pointer border-0 bg-transparent p-1'
              />
              <input
                value={form.accent_color}
                onChange={(e) => setForm((c) => ({ ...c, accent_color: e.target.value }))}
                className='min-w-0 flex-1 bg-transparent px-3 outline-none'
              />
            </div>
          </div>
          <div className='xl:col-span-6'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tovar rasmi
            </label>
            <input
              type='file'
              accept='image/*'
              onChange={(e) => {
                setProductImageFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveProductImage(false);
              }}
              className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
            />
          </div>
          <div className='xl:col-span-6'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Orqa fon rasmi
            </label>
            <input
              type='file'
              accept='image/*'
              onChange={(e) => {
                setBackgroundImageFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveBackgroundImage(false);
              }}
              className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Boshlanish vaqti
            </label>
            <input
              type='datetime-local'
              value={form.start_date}
              onChange={(e) => setForm((c) => ({ ...c, start_date: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tugash vaqti
            </label>
            <input
              type='datetime-local'
              value={form.end_date}
              onChange={(e) => setForm((c) => ({ ...c, end_date: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            />
          </div>
          <div className='flex items-center xl:col-span-6'>
            <label className='flex w-full items-center gap-2 rounded-lg border border-outline-variant bg-surface-bright px-3 py-3'>
              <input
                type='checkbox'
                checked={form.is_active}
                onChange={(e) => setForm((c) => ({ ...c, is_active: e.target.checked }))}
                className='rounded text-primary'
              />
              <span className='text-body-sm text-on-surface'>
                Faol banner sifatida home sahifada ko'rsatish
              </span>
            </label>
          </div>
        </div>
        <div className='flex flex-col gap-3 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='text-body-sm text-on-surface-variant'>
            Banner saqlangach home sahifadagi reklama slideri avtomatik yangilanadi.
          </div>
          <div className='flex gap-3'>
            <button
              type='button'
              onClick={onClose}
              className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
            >
              Bekor
            </button>
            <button
              type='submit'
              disabled={saveMutation.isPending}
              className='flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary hover:opacity-90 disabled:opacity-60'
            >
              {saveMutation.isPending && (
                <span className='material-symbols-outlined animate-spin text-[16px]'>
                  progress_activity
                </span>
              )}
              {mode === 'edit' ? "O'zgarishlarni saqlash" : 'Saqlash'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};


// Frontend mirror of backend STATUS_TRANSITIONS — admin faqat oldinga yura oladi
const STATUS_FORWARD_TRANSITION: Record<string, string | null> = {
  AWAITING_PAYMENT: 'CONFIRMED',
  PENDING:          'CONFIRMED',
  CONFIRMED:        'PACKING',
  PACKING:          'SHIPPING',
  SHIPPING:         'DELIVERED',
  DELIVERED:        'RECEIVED',
  RECEIVED:         null,
  CANCELLED_BY_USER:   null,
  CANCELLED_BY_ADMIN:  null,
  SYSTEM_AUTO_CANCEL:  null,
};

const ORDER_FINAL_STATUSES = new Set([
  'RECEIVED',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_ADMIN',
  'SYSTEM_AUTO_CANCEL',
]);

const ADMIN_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT:    "To'lov kutilmoqda (karta)",
  PENDING:             "Yangi buyurtma",
  CONFIRMED:           "Tasdiqlandi",
  PACKING:             "Yig'ilmoqda",
  SHIPPING:            "Yo'lda",
  DELIVERED:           "Yetkazildi (eshikda)",
  RECEIVED:            "Xaridorga topshirildi",
  CANCELLED_BY_USER:   "Foydalanuvchi bekor qildi",
  CANCELLED_BY_ADMIN:  "Admin bekor qildi",
  SYSTEM_AUTO_CANCEL:  "Tizim avtomatik bekor qildi",
};

// Modul darajasida — DashboardTab va OrdersTab ikkalasi ham ishlatadi
const ORDER_STATUS_COLORS: Record<string, string> = {
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

const OrdersTab = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    date_from: '',
    date_to: '',
    payment_method: '',
    is_credit: '',
    payment_status: '',
    page: 1,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-orders', filters],
    queryFn: () =>
      adminGetOrders({
        q: filters.q || undefined,
        status: filters.status || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        payment_method: filters.payment_method || undefined,
        is_credit: filters.is_credit || undefined,
        payment_status: filters.payment_status || undefined,
        page: filters.page,
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const orders: AdminOrder[] = (data as any)?.results || (Array.isArray(data) ? data : []);
  const totalCount: number = (data as any)?.count || orders.length;
  const hasNext = Boolean((data as any)?.next);
  const hasPrev = Boolean((data as any)?.previous);
  const totalPages = Math.ceil(totalCount / 20) || 1;

  const [drafts, setDrafts] = useState<Record<number, { status: string; note: string }>>({});

  const setFilter = (key: string, value: string) =>
    setFilters((c) => ({ ...c, [key]: value, page: 1 }));

  const resetFilters = () =>
    setFilters({
      q: '',
      status: '',
      date_from: '',
      date_to: '',
      payment_method: '',
      is_credit: '',
      payment_status: '',
      page: 1,
    });

  const hasActiveFilters =
    filters.q ||
    filters.status ||
    filters.date_from ||
    filters.date_to ||
    filters.payment_method ||
    filters.is_credit ||
    filters.payment_status;

  const statusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note: string }) =>
      adminUpdateOrderStatus(id, { status, note }),
    onSuccess: async (_, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-orders'] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      setDrafts((c) => {
        const n = { ...c };
        delete n[vars.id];
        return n;
      });
      toast.success('Buyurtma holati yangilandi.');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Statusni yangilab bo'lmadi."),
  });

  const creditPayMutation = useMutation({
    mutationFn: (id: number) => adminPayCreditOrder(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-orders'] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      setCreditConfirmOrder(null);
      toast.success("Muddatli to'lov muvaffaqiyatli qabul qilindi.");
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || "Muddatli to'lovni qayd etib bo'lmadi.");
    },
  });

  const [creditConfirmOrder, setCreditConfirmOrder] = useState<AdminOrder | null>(null);

  const updateDraft = (
    orderId: number,
    field: 'status' | 'note',
    value: string,
    fallbackStatus: string,
    fallbackNote: string,
  ) => {
    setDrafts((c) => ({
      ...c,
      [orderId]: {
        status: field === 'status' ? value : c[orderId]?.status || fallbackStatus,
        note: field === 'note' ? value : c[orderId]?.note || fallbackNote,
      },
    }));
  };

  return (
    <div className='space-y-6'>
      {/* Credit payment confirmation dialog */}
      <CreditPayConfirmDialog
        order={creditConfirmOrder}
        isPending={creditPayMutation.isPending}
        onConfirm={() => {
          if (creditConfirmOrder) creditPayMutation.mutate(creditConfirmOrder.id);
        }}
        onCancel={() => !creditPayMutation.isPending && setCreditConfirmOrder(null)}
      />


      <div>
        <h2 className='font-h3 text-h3 text-on-surface'>Buyurtmalar ({totalCount})</h2>
        <p className='mt-1 text-body-sm text-on-surface-variant'>
          Buyurtma statuslari, cancellation sababi va tarix shu bo'limda boshqariladi.
        </p>
      </div>

      {/* Quick filters — tez-tez kerak bo'ladigan holatlar */}
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-xs font-medium text-on-surface-variant'>Tez filtr:</span>
        <button
          onClick={() =>
            setFilter('payment_status', filters.payment_status === 'REFUNDED' ? '' : 'REFUNDED')
          }
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            filters.payment_status === 'REFUNDED'
              ? 'border-orange-600 bg-orange-600 text-white shadow-sm'
              : 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800/60 dark:bg-orange-950/20 dark:text-orange-400'
          }`}
        >
          <span className='material-symbols-outlined text-[14px]'>currency_exchange</span>
          Refund kutilayotgan
        </button>
        <button
          onClick={() =>
            setFilter('status', filters.status === 'AWAITING_PAYMENT' ? '' : 'AWAITING_PAYMENT')
          }
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            filters.status === 'AWAITING_PAYMENT'
              ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
              : 'border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary hover:text-primary'
          }`}
        >
          <span className='material-symbols-outlined text-[14px]'>hourglass_empty</span>
          To'lov kutilmoqda (karta)
        </button>
        <button
          onClick={() =>
            setFilter('status', filters.status === 'DELIVERED' ? '' : 'DELIVERED')
          }
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            filters.status === 'DELIVERED'
              ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
              : 'border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary hover:text-primary'
          }`}
        >
          <span className='material-symbols-outlined text-[14px]'>payments</span>
          Naqd to'lov kutilmoqda
        </button>
      </div>

      {/* Filters */}
      <div className='rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm'>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          <input
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder='Buyurtma #, ism yoki telefon...'
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          />
          <select
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha statuslar</option>
            {Object.entries(ADMIN_STATUS_LABEL).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={filters.payment_method}
            onChange={(e) => setFilter('payment_method', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value="">Barcha to'lovlar</option>
            <option value='CASH'>Naqd</option>
            <option value='CARD'>Karta</option>
            <option value='CREDIT'>Nasiya</option>
          </select>
          <select
            value={filters.is_credit}
            onChange={(e) => setFilter('is_credit', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barchasi</option>
            <option value='true'>Nasiyali</option>
            <option value='false'>Oddiy</option>
          </select>
          <input
            type='date'
            value={filters.date_from}
            onChange={(e) => setFilter('date_from', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            title="Dan sana"
          />
          <input
            type='date'
            value={filters.date_to}
            onChange={(e) => setFilter('date_to', e.target.value)}
            className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            title="Gacha sana"
          />
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container'
            >
              <span className='material-symbols-outlined text-[16px]'>close</span>
              Filtrlarni tozalash
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className='py-12 text-center text-on-surface-variant'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
            progress_activity
          </span>
          Buyurtmalar yuklanmoqda...
        </div>
      ) : orders.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            local_shipping
          </span>
          <p className='font-h3 text-on-surface-variant'>Buyurtmalar yo'q</p>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
          {orders.map((order) => {
            const nextFwdStatus = STATUS_FORWARD_TRANSITION[order.status] ?? null;
            const isFinalStatus = ORDER_FINAL_STATUSES.has(order.status);

            // To'lov usuliga qarab admin bekor qila oladimi
            const canAdminCancel = (() => {
              if (isFinalStatus) return false;
              const pm = order.payment_method;
              const st = order.status;
              // Karta: faqat to'lov kelmagan paytda (AWAITING_PAYMENT)
              if (pm === 'card') return st === 'AWAITING_PAYMENT';
              // Naqd / Muddatli: faqat PENDING va CONFIRMED (yig'ilish boshlashdan oldin)
              return st === 'PENDING' || st === 'CONFIRMED';
            })();
            // Default selection: next forward status (pre-selected, ready to save)
            const draft = drafts[order.id] || {
              status: nextFwdStatus ?? order.status,
              note: '',
            };
            const lastHistory = order.history?.[order.history.length - 1];
            // Changes exist when selected status differs from CURRENT order status
            return (
              <div
                key={order.id}
                className='rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm overflow-hidden'
              >
                <div className='border-b border-outline-variant bg-surface-container-low px-5 py-4'>
                  <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                    <div className='space-y-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-h3 text-lg text-on-surface'>
                          Buyurtma #{order.id}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getOrderStatusBadge(order.status)}`}
                        >
                          {getOrderStatusLabel(order.status)}
                        </span>
                        {/* Refund zarur badge — karta to'lovi qaytarilishi kerak */}
                        {order.payment?.status === 'REFUNDED' && (
                          <span className='flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'>
                            <span className='material-symbols-outlined text-[12px]'>currency_exchange</span>
                            Refund zarur
                          </span>
                        )}
                        {order.is_credit && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              order.credit_paid
                                ? 'bg-green-100 text-green-700'
                                : order.credit_is_overdue
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {order.credit_paid
                              ? "Muddatli to'lov to'langan"
                              : order.credit_is_overdue
                                ? "To'lov muddati o'tdi!"
                                : "Muddatli to'lov"}
                          </span>
                        )}
                      </div>
                      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant'>
                        <span>{new Date(order.created_at).toLocaleString('uz-UZ')}</span>
                        <span>{order.receiver_name}</span>
                        <span>{order.receiver_phone}</span>
                      </div>
                    </div>
                    <div className='flex items-start gap-2'>
                      <div className='grid grid-cols-2 gap-3 text-sm xl:min-w-[320px]'>
                        <div className='rounded-xl bg-surface-container-lowest p-3'>
                          <div className='text-xs text-on-surface-variant'>Jami</div>
                          <div className='mt-1 font-semibold text-primary'>
                            {formatMoney(order.total_price)} so'm
                          </div>
                        </div>
                        <div className='rounded-xl bg-surface-container-lowest p-3'>
                          <div className='text-xs text-on-surface-variant'>To'lov</div>
                          <div className='mt-1 text-sm'>
                            {!order.payment ? (
                              <span className='font-medium text-on-surface'>Yo'q</span>
                            ) : order.payment.method === 'cash' ? (
                              order.payment.status === 'PAID' ? (
                                <span className='flex items-center gap-1 font-semibold text-emerald-600'>
                                  <span className='material-symbols-outlined text-[14px]'>check_circle</span>
                                  Naqd to'landi
                                </span>
                              ) : (
                                <span className='flex items-center gap-1 font-medium text-amber-600'>
                                  <span className='material-symbols-outlined text-[14px]'>payments</span>
                                  Kuryerda olinadi
                                </span>
                              )
                            ) : order.payment.method === 'card' ? (
                              order.payment.status === 'PAID' ? (
                                <span className='flex items-center gap-1 font-semibold text-emerald-600'>
                                  <span className='material-symbols-outlined text-[14px]'>check_circle</span>
                                  Karta to'landi
                                </span>
                              ) : order.payment.status === 'REFUNDED' ? (
                                <span className='flex items-center gap-1 font-semibold text-orange-600'>
                                  <span className='material-symbols-outlined text-[14px]'>currency_exchange</span>
                                  Refund zarur!
                                </span>
                              ) : (
                                <span className='flex items-center gap-1 font-medium text-orange-600'>
                                  <span className='material-symbols-outlined text-[14px]'>hourglass_empty</span>
                                  Karta kutilmoqda
                                </span>
                              )
                            ) : order.payment.method === 'credit' ? (
                              <span className='flex items-center gap-1 font-medium text-blue-600'>
                                <span className='material-symbols-outlined text-[14px]'>schedule</span>
                                Muddatli to'lov
                              </span>
                            ) : (
                              <span className='font-medium text-on-surface'>
                                {getPaymentStatusLabel(order.payment.status)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => printReceipt(order, loadShopInfo().name ? loadShopInfo() : undefined)}
                        title='Chek chiqarish'
                        className='flex flex-shrink-0 flex-col items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant transition-all hover:border-primary hover:bg-primary/5 hover:text-primary'
                      >
                        <span className='material-symbols-outlined text-[22px]'>receipt_long</span>
                        <span>Chek</span>
                      </button>
                    </div>
                  </div>
                </div>
                {/* AWAITING_PAYMENT countdown — only for card orders waiting for payment */}
                {order.status === 'AWAITING_PAYMENT' && order.payment_method === 'card' && (
                  <div className='mx-5 mt-1'>
                    <AwaitingPaymentCountdown createdAt={order.created_at} />
                  </div>
                )}

                {/* Cash payment collection alert — shown only for DELIVERED cash orders */}
                {order.payment_method === 'cash' &&
                  order.status === 'DELIVERED' &&
                  order.payment?.status === 'PENDING' && (
                    <div className='mx-5 mt-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20'>
                      <div className='flex items-start gap-3'>
                        <span className='material-symbols-outlined shrink-0 text-[22px] text-amber-600'>payments</span>
                        <div>
                          <p className='text-sm font-semibold text-amber-800 dark:text-amber-400'>
                            Naqd to'lov kutilmoqda
                          </p>
                          <p className='mt-0.5 text-xs text-amber-700 dark:text-amber-500'>
                            Kuryer <strong>{formatMoney(order.total_price)} so'm</strong> naqd pul olishini tasdiqlang.
                          </p>
                        </div>
                      </div>
                      <button
                        type='button'
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            id: order.id,
                            status: 'RECEIVED',
                            note: "Naqd to'lov qabul qilindi va mahsulot xaridorga topshirildi.",
                          })
                        }
                        className='flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60'
                      >
                        <span className='material-symbols-outlined text-[16px]'>check_circle</span>
                        To'lov qabul qilindi
                      </button>
                    </div>
                  )}

                <div className='grid gap-5 px-5 py-5 xl:grid-cols-[1.1fr_0.9fr]'>
                  <div className='space-y-4'>
                    <div className='grid gap-3 lg:grid-cols-2'>
                      <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
                        <div className='mb-2 text-xs uppercase text-on-surface-variant'>Manzil</div>
                        <div className='text-sm text-on-surface whitespace-pre-line'>
                          {order.delivery_address}
                        </div>
                      </div>
                      <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
                        <div className='mb-2 text-xs uppercase text-on-surface-variant'>
                          Mahsulotlar
                        </div>
                        <div className='space-y-2'>
                          {order.items.slice(0, 4).map((item) => (
                            <div key={item.id} className='flex items-center gap-3'>
                              <div className='h-12 w-12 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest'>
                                {item.product_details?.main_image ? (
                                  <img
                                    src={item.product_details.main_image}
                                    alt={item.product_details.name}
                                    className='h-full w-full object-contain p-1'
                                  />
                                ) : (
                                  <div className='flex h-full w-full items-center justify-center text-outline'>
                                    <span className='material-symbols-outlined text-[18px]'>
                                      image
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className='min-w-0 flex-1'>
                                <div className='line-clamp-1 text-sm text-on-surface'>
                                  {item.product_details?.name || 'Mahsulot'}
                                </div>
                                <div className='text-xs text-on-surface-variant'>
                                  {item.quantity} dona
                                  {item.variant_details
                                    ? ` • ${[item.variant_details.color, item.variant_details.quality, item.variant_details.model, item.variant_details.size].filter(_notNull).join(' / ')}`
                                    : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                          {order.items.length > 4 && (
                            <div className='text-xs text-on-surface-variant'>
                              Yana {order.items.length - 4} ta mahsulot bor
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {order.cancellation_reason && (
                      <div className='rounded-xl border border-error-container bg-error-container/30 p-4'>
                        <div className='text-xs uppercase text-error'>Cancellation reason</div>
                        <div className='mt-2 text-sm text-on-surface'>
                          {order.cancellation_reason}
                        </div>
                      </div>
                    )}
                    <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
                      <div className='mb-3 flex items-center justify-between'>
                        <div className='text-sm font-semibold text-on-surface'>Status tarixi</div>
                        {lastHistory && (
                          <div className='text-xs text-on-surface-variant'>
                            Oxirgisi: {new Date(lastHistory.created_at).toLocaleString('uz-UZ')}
                          </div>
                        )}
                      </div>
                      <div className='space-y-3'>
                        {order.history?.map((entry) => (
                          <div key={entry.id} className='flex gap-3'>
                            <span className='mt-1 h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0' />
                            <div>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='text-sm font-medium text-on-surface'>
                                  {getOrderStatusLabel(entry.to_status)}
                                </span>
                                <span className='text-xs text-on-surface-variant'>
                                  {new Date(entry.created_at).toLocaleString('uz-UZ')}
                                </span>
                              </div>
                              <div className='text-xs text-on-surface-variant'>
                                {entry.actor_name || entry.actor_type}
                              </div>
                              {entry.note && (
                                <div className='mt-1 text-sm text-on-surface'>{entry.note}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className='space-y-4'>
                    {order.is_credit && (
                      <div
                        className={`rounded-xl border p-4 ${
                          order.credit_paid
                            ? 'border-green-200 bg-green-50'
                            : order.credit_is_overdue
                              ? 'border-red-300 bg-red-50'
                              : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <div className='mb-2 flex items-center gap-2'>
                          <span
                            className={`material-symbols-outlined text-[20px] ${
                              order.credit_paid
                                ? 'text-green-600'
                                : order.credit_is_overdue
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                            }`}
                          >
                            {order.credit_paid
                              ? 'check_circle'
                              : order.credit_is_overdue
                                ? 'warning'
                                : 'schedule'}
                          </span>
                          <span
                            className={`font-semibold text-sm ${
                              order.credit_paid
                                ? 'text-green-700'
                                : order.credit_is_overdue
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {order.credit_paid
                              ? "Muddatli to'lov to'langan"
                              : order.credit_is_overdue
                                ? "To'lov muddati o'tdi!"
                                : "Muddatli to'lov kutilmoqda"}
                          </span>
                        </div>
                        <div className='text-xs text-on-surface-variant space-y-1'>
                          <div>
                            Muddat: <strong>{order.credit_days} kun</strong>
                          </div>
                          <div>
                            To'lov sanasi: <strong>{order.credit_due_date}</strong>
                          </div>
                          {order.credit_paid && order.credit_paid_at && (
                            <div>
                              To'langan:{' '}
                              <strong>
                                {new Date(order.credit_paid_at).toLocaleString('uz-UZ')}
                              </strong>
                            </div>
                          )}
                          {order.user && (
                            <div>
                              Foydalanuvchi: <strong>{order.user.phone}</strong>
                            </div>
                          )}
                        </div>
                        {!order.credit_paid && (
                          <button
                            type='button'
                            onClick={() => setCreditConfirmOrder(order)}
                            className='mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700'
                          >
                            <span className='material-symbols-outlined text-[16px]'>payments</span>
                            Muddatli to'lovni qabul qilish
                          </button>
                        )}
                      </div>
                    )}

                    <div className='rounded-xl border border-outline-variant bg-surface-container p-4 space-y-4'>
                      <h3 className='font-h3 text-lg text-on-surface'>Holatni boshqarish</h3>

                      {/* ── Yakuniy holat — hech narsa o'zgarmaydi ── */}
                      {isFinalStatus ? (
                        <div className='flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-4'>
                          <span className='material-symbols-outlined text-[22px] text-outline shrink-0'>lock</span>
                          <div>
                            <p className='text-sm font-semibold text-on-surface'>Yakuniy holat</p>
                            <p className='text-xs text-on-surface-variant mt-0.5'>
                              Bu buyurtma{' '}
                              <span className={`font-medium ${
                                order.status === 'RECEIVED' ? 'text-emerald-600'
                                : order.status.includes('CANCEL') ? 'text-error'
                                : 'text-on-surface'
                              }`}>
                                {ADMIN_STATUS_LABEL[order.status] || order.status}
                              </span>{' '}
                              holatida — o'zgartirib bo'lmaydi.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* ── Joriy holat ko'rsatgichi ── */}
                          <div className='flex items-center gap-2 text-sm'>
                            <span className='text-on-surface-variant shrink-0'>Joriy:</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              ORDER_STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'
                            }`}>
                              {ADMIN_STATUS_LABEL[order.status] || order.status}
                            </span>
                            <span className='material-symbols-outlined text-[16px] text-outline'>arrow_forward</span>
                            {nextFwdStatus && (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                ORDER_STATUS_COLORS[nextFwdStatus] || 'bg-primary-container/20 text-primary'
                              }`}>
                                {ADMIN_STATUS_LABEL[nextFwdStatus]}
                              </span>
                            )}
                          </div>

                          {/* ── Keyingi holat (faqat bir to'g'ri yo'l) ── */}
                          {nextFwdStatus && (
                            <div className='space-y-3'>
                              <textarea
                                rows={3}
                                value={draft.note}
                                onChange={(e) =>
                                  updateDraft(order.id, 'note', e.target.value, order.status, '')
                                }
                                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm outline-none focus:border-primary'
                                placeholder="Izoh (ixtiyoriy): mahsulot tekshirildi, yig'ilish boshlandi..."
                              />

                              {/* Cash → RECEIVED hint */}
                              {nextFwdStatus === 'RECEIVED' && order.payment_method === 'cash' && (
                                <div className='flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400'>
                                  <span className='material-symbols-outlined shrink-0 text-[13px] mt-0.5'>info</span>
                                  <span><strong>Eslatma:</strong> Bu amal naqd to'lovni ham <strong>To'langan</strong> deb avtomatik belgilaydi.</span>
                                </div>
                              )}

                              <button
                                type='button'
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: order.id,
                                    status: nextFwdStatus,
                                    note: draft.note.trim(),
                                  })
                                }
                                className='flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-sm text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60'
                              >
                                {statusMutation.isPending ? (
                                  <>
                                    <span className='material-symbols-outlined animate-spin text-[16px]'>progress_activity</span>
                                    Saqlanmoqda...
                                  </>
                                ) : (
                                  <>
                                    <span className='material-symbols-outlined text-[16px]'>arrow_forward</span>
                                    {ADMIN_STATUS_LABEL[nextFwdStatus]} ga o'tkazish
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* ── Admin bekor qilish — ajratilgan danger zone ── */}
                          {canAdminCancel && (
                            <details className='group rounded-xl border border-error/30 bg-error-container/10'>
                              <summary className='flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-error select-none'>
                                <span className='material-symbols-outlined text-[16px]'>expand_more</span>
                                Admin bekor qilish
                              </summary>
                              <div className='border-t border-error/20 px-4 pb-4 pt-3 space-y-3'>
                                <textarea
                                  rows={3}
                                  value={draft.status === 'CANCELLED_BY_ADMIN' ? draft.note : ''}
                                  onChange={(e) =>
                                    setDrafts((c) => ({
                                      ...c,
                                      [order.id]: { status: 'CANCELLED_BY_ADMIN', note: e.target.value },
                                    }))
                                  }
                                  className='w-full rounded-lg border border-error/40 bg-surface-bright px-3 py-2 text-sm outline-none focus:border-error'
                                  placeholder='Bekor qilish sababi (majburiy)...'
                                />
                                <button
                                  type='button'
                                  disabled={
                                    statusMutation.isPending ||
                                    draft.status !== 'CANCELLED_BY_ADMIN' ||
                                    !draft.note.trim()
                                  }
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: order.id,
                                      status: 'CANCELLED_BY_ADMIN',
                                      note: draft.note.trim(),
                                    })
                                  }
                                  className='flex w-full items-center justify-center gap-2 rounded-lg bg-error px-4 py-2 text-sm font-semibold text-on-error transition-opacity hover:opacity-90 disabled:opacity-40'
                                >
                                  <span className='material-symbols-outlined text-[16px]'>cancel</span>
                                  Buyurtmani bekor qilish
                                </button>
                              </div>
                            </details>
                          )}
                        </>
                      )}

                      {/* ── Chek ── */}
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          onClick={() => printReceipt(order, loadShopInfo().name ? loadShopInfo() : undefined)}
                          className='flex flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:border-primary hover:text-primary'
                        >
                          <span className='material-symbols-outlined text-[18px]'>receipt_long</span>
                          Chek
                        </button>
                        {order.is_credit && (
                          <button
                            type='button'
                            onClick={() => printCreditAgreement(order, loadShopInfo().name ? loadShopInfo() : undefined)}
                            className='flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:border-blue-500 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/20 dark:text-blue-400'
                          >
                            <span className='material-symbols-outlined text-[18px]'>description</span>
                            Nasiya cheki
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalCount > 0 && (
        <div className='flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3'>
          <span className='text-sm text-on-surface-variant'>
            {(filters.page - 1) * 20 + 1}–{Math.min(filters.page * 20, totalCount)} /{' '}
            {totalCount} ta buyurtma
          </span>
          <div className='flex items-center gap-2'>
            <button
              disabled={!hasPrev}
              onClick={() => setFilters((c) => ({ ...c, page: c.page - 1 }))}
              className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-surface-container'
            >
              <span className='material-symbols-outlined text-[16px]'>chevron_left</span>
              Oldingi
            </button>
            <span className='text-sm text-on-surface-variant'>
              {filters.page} / {totalPages}
            </span>
            <button
              disabled={!hasNext}
              onClick={() => setFilters((c) => ({ ...c, page: c.page + 1 }))}
              className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-surface-container'
            >
              Keyingi
              <span className='material-symbols-outlined text-[16px]'>chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CategoriesTab = ({
  categories,
  onDelete,
}: {
  categories: AdminCategory[];
  onDelete: (id: number) => void;
}) => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', parent: '', is_popular: false });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('parent', form.parent || '');
      fd.append('is_active', 'true');
      fd.append('is_popular', String(form.is_popular));
      if (imageFile) fd.append('image', imageFile);
      await adminCreateCategory(fd);
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      setShowForm(false);
      setForm({ name: '', parent: '', is_popular: false });
      setImageFile(null);
    } catch (err) {
      alert(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };
  const flat = Array.isArray(categories) ? categories : [];
  return (
    <div>
      <div className='mb-4 flex justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Kategoriyalar ({flat.length})</h2>
        </div>
        <button
          onClick={() => setShowForm((c) => !c)}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
        >
          <span className='material-symbols-outlined text-[18px]'>
            {showForm ? 'close' : 'add'}
          </span>
          {showForm ? 'Yopish' : "Kategoriya qo'shish"}
        </button>
      </div>
      {showForm && (
        <div className='mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
          <h3 className='mb-4 font-h3 text-h3 text-on-surface'>Yangi kategoriya</h3>
          <form onSubmit={handleSubmit} className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div>
              <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                Kategoriya nomi *
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
                placeholder='Elektronika'
              />
            </div>
            <div>
              <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                Asosiy katalog
              </label>
              <select
                value={form.parent}
                onChange={(e) => setForm({ ...form, parent: e.target.value })}
                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              >
                <option value=''>-- Asosiy katalog --</option>
                {flat
                  .filter((c) => !c.parent)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                Kategoriya rasmi
              </label>
              <input
                type='file'
                accept='image/*'
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
              />
            </div>
            <div className='flex items-center gap-6 pt-4'>
              <label className='flex cursor-pointer items-center gap-2'>
                <input
                  type='checkbox'
                  checked={form.is_popular}
                  onChange={(e) => setForm({ ...form, is_popular: e.target.checked })}
                  className='rounded text-primary'
                />
                <span className='text-body-sm text-on-surface'>
                  Home sahifada ommabop bo'lib ko'rinsin
                </span>
              </label>
            </div>
            <div className='md:col-span-2 flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setShowForm(false)}
                className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
              >
                Bekor
              </button>
              <button
                type='submit'
                disabled={submitting}
                className='flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary hover:opacity-90 disabled:opacity-60'
              >
                {submitting && (
                  <span className='material-symbols-outlined animate-spin text-[16px]'>
                    progress_activity
                  </span>
                )}
                Saqlash
              </button>
            </div>
          </form>
        </div>
      )}
      {flat.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            category
          </span>
          <p className='font-h3 text-on-surface-variant'>Kategoriyalar yo'q</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
          <table className='w-full text-left'>
            <thead className='border-b border-outline-variant bg-surface-container'>
              <tr>
                {['#', 'Nomi', 'Turi', 'Slug', 'Amal'].map((h) => (
                  <th
                    key={h}
                    className='px-4 py-3 text-label-md font-label-md uppercase text-on-surface-variant'
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y divide-outline-variant'>
              {flat.map((cat, i) => (
                <tr key={cat.id} className='hover:bg-surface-container-low/50'>
                  <td className='px-4 py-3 text-body-sm text-on-surface-variant'>{i + 1}</td>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      {cat.parent ? (
                        <span className='ml-2 inline-block h-3 w-3 border-b-2 border-l-2 border-outline' />
                      ) : null}
                      <span className='font-body-md text-on-surface'>{cat.name}</span>
                    </div>
                  </td>
                  <td className='px-4 py-3'>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cat.parent ? 'bg-surface-container text-on-surface-variant' : 'bg-primary-container text-on-primary-container'}`}
                    >
                      {cat.parent ? 'Kategoriya' : 'Katalog'}
                    </span>
                  </td>
                  <td className='px-4 py-3 font-mono text-body-sm text-outline'>{cat.slug}</td>
                  <td className='px-4 py-3'>
                    <button
                      onClick={() => onDelete(cat.id)}
                      className='rounded p-1 text-error hover:bg-error-container/20'
                    >
                      <span className='material-symbols-outlined text-[20px]'>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const StockTab = () => {
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
          <div className='overflow-x-auto'>
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
        )}
      </div>
    </div>
  );
};

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

interface StockStats {
  total_products: number;
  total_stock: number;
  total_value: number;
  critical_count: number;
  low_count: number;
}

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

const KassaTab = () => {
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
        <div className='overflow-x-auto'>
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

interface AdminUser {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_verified: boolean;
  is_staff: boolean;
  credit_ban: boolean;
  overdue_credit_count: number;
  date_joined: string;
  order_count: number;
  total_spent: number;
}

interface AdminUserDetail extends AdminUser {
  last_login: string | null;
  recent_orders: Array<{
    id: number;
    status: string;
    total_price: number | string;
    created_at: string;
    payment_method: string;
    is_credit: boolean;
  }>;
}

const UsersTab = () => {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [filterBan, setFilterBan] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, q, filterActive, filterBan],
    queryFn: () =>
      adminGetUsers({
        q: q || undefined,
        is_active: filterActive || undefined,
        credit_ban: filterBan || undefined,
        page,
        page_size: 20,
      }).then((r) => r.data as { count: number; next: string | null; previous: string | null; results: AdminUser[] }),
    placeholderData: (prev) => prev,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-user-detail', selectedId],
    queryFn: () => adminGetUser(selectedId!).then((r) => r.data as AdminUserDetail),
    enabled: selectedId !== null,
  });

  // Phase 2.7 (qayta dizayn) — Banlangan mijozni 1 ta imkoniyat bilan
  // ban'dan chiqarish. Eski toggle (count=0) o'rnini bosadi.
  const [liftBanTarget, setLiftBanTarget] = useState<AdminUserDetail | null>(null);
  const [liftBanReason, setLiftBanReason] = useState('');
  const liftCreditBanMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      adminLiftUserCreditBan(id, reason),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.setQueryData(['admin-user-detail', vars.id], (old: AdminUserDetail | undefined) =>
        old
          ? { ...old, credit_ban: res.data.credit_ban, overdue_credit_count: res.data.overdue_credit_count }
          : old,
      );
      const forgiven = res.data.forgiven_orders ?? 0;
      setLiftBanTarget(null);
      setLiftBanReason('');
      toast.success(
        forgiven > 0
          ? `Ban olib tashlandi. ${forgiven} ta buyurtma kechirildi. 1 ta imkoniyat berildi.`
          : 'Ban olib tashlandi. 1 ta imkoniyat berildi.',
      );
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || "Ban'dan chiqarib bo'lmadi.");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: number) => adminToggleUserActive(id),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.setQueryData(['admin-user-detail', id], (old: AdminUserDetail | undefined) =>
        old ? { ...old, is_active: res.data.is_active } : old,
      );
      toast.success(res.data.is_active ? 'Faollashtirildi' : 'Bloklandi');
    },
  });

  const users: AdminUser[] = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div className='flex gap-4'>
      {/* Phase 2.7 (qayta dizayn) — Ban hisobidan chiqarish modal */}
      {liftBanTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className='w-full max-w-md rounded-2xl bg-white p-6 shadow-xl'>
            <div className='mb-4 flex items-center gap-3'>
              <span className='material-symbols-outlined text-[28px] text-amber-600'>lock_open</span>
              <h3 className='font-h3 text-h3 text-on-surface'>Ban hisobidan chiqarish</h3>
            </div>
            <div className='mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800'>
              <p className='mb-2 font-semibold'>
                {liftBanTarget.phone} — bu mijoz uchun:
              </p>
              <ul className='ml-4 list-disc text-xs space-y-1'>
                <li>Kredit ban olib tashlanadi</li>
                <li>Yana <strong>faqat 1 ta imkoniyat</strong> beriladi (3 emas)</li>
                <li>Mavjud "muddati o'tgan" buyurtmalar kechiriladi (cron qaytadan ban qilmasin)</li>
                <li>Keyingi 1 ta yangi muddati o'tgan buyurtma — darhol qaytadan ban</li>
              </ul>
            </div>
            <label className='mb-2 block text-xs font-semibold text-on-surface-variant'>
              Sabab (ixtiyoriy, audit uchun)
            </label>
            <textarea
              value={liftBanReason}
              onChange={(e) => setLiftBanReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Mijoz pul to'lab keldi, biznes xatosi, VIP mijoz..."
              className='mb-4 w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary'
              disabled={liftCreditBanMutation.isPending}
            />
            <div className='flex gap-3'>
              <button
                onClick={() => { setLiftBanTarget(null); setLiftBanReason(''); }}
                disabled={liftCreditBanMutation.isPending}
                className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50'
              >
                Bekor qilish
              </button>
              <button
                onClick={() => liftCreditBanMutation.mutate({ id: liftBanTarget.id, reason: liftBanReason })}
                disabled={liftCreditBanMutation.isPending}
                className='flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2'
              >
                {liftCreditBanMutation.isPending ? (
                  <>
                    <span className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                    Bajarilmoqda...
                  </>
                ) : (
                  <>
                    <span className='material-symbols-outlined text-[16px]'>lock_open</span>
                    Tasdiqlash
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List panel */}
      <div className={`flex flex-col gap-4 transition-all ${selectedId ? 'w-full lg:w-[55%]' : 'w-full'}`}>
        {/* Filters */}
        <div className='flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3'>
          <form
            className='flex flex-1 items-center gap-2'
            onSubmit={(e) => {
              e.preventDefault();
              setQ(draftQ);
              setPage(1);
            }}
          >
            <span className='material-symbols-outlined text-[18px] text-on-surface-variant'>search</span>
            <input
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder='Telefon yoki ism...'
              className='flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60'
            />
            {draftQ && (
              <button type='button' onClick={() => { setDraftQ(''); setQ(''); setPage(1); }}>
                <span className='material-symbols-outlined text-[16px] text-on-surface-variant'>close</span>
              </button>
            )}
          </form>
          <select
            value={filterActive}
            onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
            className='rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-xs text-on-surface outline-none'
          >
            <option value=''>Barchasi</option>
            <option value='true'>Faol</option>
            <option value='false'>Bloklangan</option>
          </select>
          <select
            value={filterBan}
            onChange={(e) => { setFilterBan(e.target.value); setPage(1); }}
            className='rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-xs text-on-surface outline-none'
          >
            <option value=''>Barcha kredit</option>
            <option value='false'>Ban yo'q</option>
            <option value='true'>Kredit ban</option>
          </select>
        </div>

        {/* Stats row */}
        <div className='flex items-center justify-between px-1'>
          <p className='text-sm text-on-surface-variant'>
            Jami: <span className='font-semibold text-on-surface'>{totalCount}</span> foydalanuvchi
          </p>
          {(q || filterActive || filterBan) && (
            <button
              onClick={() => { setQ(''); setDraftQ(''); setFilterActive(''); setFilterBan(''); setPage(1); }}
              className='text-xs text-primary hover:underline'
            >
              Filterni tozalash
            </button>
          )}
        </div>

        {/* Table */}
        <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest'>
          {isLoading ? (
            <div className='flex h-40 items-center justify-center'>
              <span className='material-symbols-outlined animate-spin text-[32px] text-primary'>progress_activity</span>
            </div>
          ) : users.length === 0 ? (
            <div className='flex h-40 flex-col items-center justify-center gap-2 text-on-surface-variant'>
              <span className='material-symbols-outlined text-[40px]'>people</span>
              <p className='text-sm'>Foydalanuvchi topilmadi</p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-outline-variant bg-surface-container text-xs text-on-surface-variant'>
                    <th className='px-4 py-3 text-left font-medium'>Foydalanuvchi</th>
                    <th className='hidden px-4 py-3 text-center font-medium md:table-cell'>Buyurtmalar</th>
                    <th className='hidden px-4 py-3 text-right font-medium md:table-cell'>Jami xarid</th>
                    <th className='px-4 py-3 text-center font-medium'>Holat</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-outline-variant/50'>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedId(selectedId === u.id ? null : u.id)}
                      className={`cursor-pointer transition-colors hover:bg-surface-container/50 ${selectedId === u.id ? 'bg-primary/5' : ''}`}
                    >
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-3'>
                          <div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary'>
                            {(u.first_name?.[0] || u.phone[0]).toUpperCase()}
                          </div>
                          <div>
                            <p className='font-medium text-on-surface'>
                              {u.first_name || u.last_name
                                ? `${u.first_name} ${u.last_name}`.trim()
                                : u.phone}
                            </p>
                            {(u.first_name || u.last_name) && (
                              <p className='text-xs text-on-surface-variant'>{u.phone}</p>
                            )}
                            <div className='mt-0.5 flex flex-wrap gap-1'>
                              {u.is_staff && (
                                <span className='rounded-full bg-secondary/10 px-1.5 py-0.5 text-[10px] font-medium text-secondary'>
                                  Staff
                                </span>
                              )}
                              {u.credit_ban && (
                                <span className='rounded-full bg-error/10 px-1.5 py-0.5 text-[10px] font-medium text-error'>
                                  Kredit ban
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className='hidden px-4 py-3 text-center text-on-surface-variant md:table-cell'>
                        {u.order_count}
                      </td>
                      <td className='hidden px-4 py-3 text-right font-medium text-on-surface md:table-cell'>
                        {formatMoney(u.total_spent)} so'm
                      </td>
                      <td className='px-4 py-3 text-center'>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            u.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-error/10 text-error'
                          }`}
                        >
                          <span className='material-symbols-outlined text-[12px]'>
                            {u.is_active ? 'check_circle' : 'block'}
                          </span>
                          {u.is_active ? 'Faol' : 'Bloklangan'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className='flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3'>
            <p className='text-xs text-on-surface-variant'>
              {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} / {totalCount}
            </p>
            <div className='flex gap-1'>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className='rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-40'
              >
                <span className='material-symbols-outlined text-[18px]'>chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
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
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div className='hidden flex-1 lg:block'>
          <div className='sticky top-20 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest'>
            {/* Header */}
            <div className='flex items-center justify-between border-b border-outline-variant bg-surface-container px-5 py-3'>
              <p className='font-semibold text-on-surface'>Foydalanuvchi ma'lumotlari</p>
              <button
                onClick={() => setSelectedId(null)}
                className='rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high'
              >
                <span className='material-symbols-outlined text-[18px]'>close</span>
              </button>
            </div>

            {detailLoading ? (
              <div className='flex h-48 items-center justify-center'>
                <span className='material-symbols-outlined animate-spin text-[32px] text-primary'>progress_activity</span>
              </div>
            ) : detailData ? (
              <div className='max-h-[calc(100vh-180px)] overflow-y-auto'>
                {/* Avatar + name */}
                <div className='flex items-center gap-4 p-5'>
                  <div className='flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary'>
                    {(detailData.first_name?.[0] || detailData.phone[0]).toUpperCase()}
                  </div>
                  <div>
                    <p className='text-base font-bold text-on-surface'>
                      {detailData.first_name || detailData.last_name
                        ? `${detailData.first_name} ${detailData.last_name}`.trim()
                        : detailData.phone}
                    </p>
                    <p className='text-sm text-on-surface-variant'>{detailData.phone}</p>
                    <div className='mt-1 flex flex-wrap gap-1.5'>
                      {detailData.is_staff && (
                        <span className='rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary'>Staff</span>
                      )}
                      {detailData.is_verified && (
                        <span className='rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-green-600'>Tasdiqlangan</span>
                      )}
                      {detailData.credit_ban && (
                        <span className='rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error'>
                          Kredit ban ({detailData.overdue_credit_count})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className='grid grid-cols-2 gap-3 border-t border-outline-variant px-5 py-4'>
                  <div className='rounded-xl bg-surface-container p-3 text-center'>
                    <p className='text-2xl font-bold text-primary'>{detailData.order_count}</p>
                    <p className='text-xs text-on-surface-variant'>Buyurtmalar</p>
                  </div>
                  <div className='rounded-xl bg-surface-container p-3 text-center'>
                    <p className='text-lg font-bold text-on-surface'>{formatMoney(detailData.total_spent)}</p>
                    <p className='text-xs text-on-surface-variant'>Jami xarid (so'm)</p>
                  </div>
                </div>

                {/* Info */}
                <div className='border-t border-outline-variant px-5 py-4'>
                  <p className='mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60'>
                    Ma'lumotlar
                  </p>
                  <div className='space-y-2 text-sm'>
                    <div className='flex items-center justify-between'>
                      <span className='text-on-surface-variant'>Ro'yxatdan o'tgan</span>
                      <span className='font-medium text-on-surface'>{formatDate(detailData.date_joined)}</span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-on-surface-variant'>So'nggi kirish</span>
                      <span className='font-medium text-on-surface'>
                        {detailData.last_login ? formatDate(detailData.last_login) : '—'}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-on-surface-variant'>Holat</span>
                      <span className={`font-medium ${detailData.is_active ? 'text-green-600' : 'text-error'}`}>
                        {detailData.is_active ? 'Faol' : 'Bloklangan'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className='flex gap-2 border-t border-outline-variant px-5 py-4'>
                  <button
                    disabled={toggleActiveMutation.isPending || detailData.is_staff}
                    onClick={() => toggleActiveMutation.mutate(detailData.id)}
                    title={detailData.is_staff ? 'Staff bloklanmaydi' : ''}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
                      detailData.is_active
                        ? 'bg-error/10 text-error hover:bg-error/20'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    <span className='material-symbols-outlined text-[18px]'>
                      {detailData.is_active ? 'block' : 'check_circle'}
                    </span>
                    {detailData.is_active ? 'Bloklash' : 'Faollashtirish'}
                  </button>
                  {/* Phase 2.7 (qayta dizayn) — Faqat banlangan mijoz uchun ko'rinadi.
                      Bosilganda modal ochiladi; lift 1 ta imkoniyat beradi (count=2). */}
                  {detailData.credit_ban && (
                    <button
                      disabled={liftCreditBanMutation.isPending}
                      onClick={() => setLiftBanTarget(detailData)}
                      className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-100 py-2.5 text-sm font-medium text-amber-700 transition-all hover:bg-amber-200 disabled:opacity-50'
                    >
                      <span className='material-symbols-outlined text-[18px]'>lock_open</span>
                      Ban hisobidan chiqarish
                    </button>
                  )}
                </div>

                {/* Recent orders */}
                {detailData.recent_orders.length > 0 && (
                  <div className='border-t border-outline-variant px-5 py-4'>
                    <p className='mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60'>
                      So'nggi buyurtmalar
                    </p>
                    <div className='space-y-2'>
                      {detailData.recent_orders.map((o) => (
                        <div
                          key={o.id}
                          className='flex items-center justify-between rounded-xl bg-surface-container px-3 py-2'
                        >
                          <div>
                            <p className='text-sm font-medium text-on-surface'>#{o.id}</p>
                            <p className='text-xs text-on-surface-variant'>{formatDate(o.created_at)}</p>
                          </div>
                          <div className='text-right'>
                            <p className='text-sm font-semibold text-on-surface'>
                              {formatMoney(o.total_price)} so'm
                            </p>
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${getOrderStatusBadge(o.status)}`}
                            >
                              {getOrderStatusLabel(o.status)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

interface AdminFeedback {
  id: number;
  user_id: number;
  user_phone: string;
  user_name: string;
  message: string;
  status: 'new' | 'read' | 'resolved';
  created_at: string;
}

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  new: "Yangi",
  read: "O'qilgan",
  resolved: "Yechildi",
};

const FEEDBACK_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  read: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
};

const FeedbackTab = () => {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [q, setQ] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-feedbacks', page, filterStatus, q],
    queryFn: () =>
      adminGetFeedbacks({ status: filterStatus || undefined, q: q || undefined, page, page_size: 20 }).then(
        (r) => r.data as { count: number; next: string | null; previous: string | null; results: AdminFeedback[] },
      ),
    placeholderData: (prev) => prev,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => adminUpdateFeedback(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-feedbacks'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      toast.success('Status yangilandi');
    },
    onError: () => toast.error('Xatolik yuz berdi'),
  });

  const feedbacks: AdminFeedback[] = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const STATUS_TABS = [
    { value: '', label: 'Barchasi', count: totalCount },
    { value: 'new', label: 'Yangi', icon: 'fiber_new' },
    { value: 'read', label: "O'qilgan", icon: 'mark_email_read' },
    { value: 'resolved', label: 'Yechildi', icon: 'check_circle' },
  ];

  return (
    <div className='space-y-4'>
      {/* Header + search */}
      <div className='flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4'>
        <form
          className='flex flex-1 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2'
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draftQ);
            setPage(1);
          }}
        >
          <span className='material-symbols-outlined text-[18px] text-on-surface-variant'>search</span>
          <input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Telefon yoki xabar bo'yicha izlash..."
            className='flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60'
          />
          {draftQ && (
            <button type='button' onClick={() => { setDraftQ(''); setQ(''); setPage(1); }}>
              <span className='material-symbols-outlined text-[16px] text-on-surface-variant'>close</span>
            </button>
          )}
        </form>
        <span className='text-sm text-on-surface-variant'>
          Jami: <span className='font-semibold text-on-surface'>{totalCount}</span>
        </span>
      </div>

      {/* Status tabs */}
      <div className='flex gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-1'>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setFilterStatus(tab.value); setPage(1); }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filterStatus === tab.value
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            {'icon' in tab && <span className='material-symbols-outlined text-[16px]'>{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback list */}
      {isLoading ? (
        <div className='flex h-48 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest'>
          <span className='material-symbols-outlined animate-spin text-[36px] text-primary'>progress_activity</span>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className='flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant'>
          <span className='material-symbols-outlined text-[48px]'>forum</span>
          <p className='text-sm'>Fikrlar topilmadi</p>
        </div>
      ) : (
        <div className='space-y-3'>
          {feedbacks.map((fb) => (
            <div
              key={fb.id}
              className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md'
            >
              {/* Card header */}
              <div className='flex items-start gap-4 p-4'>
                {/* Avatar */}
                <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary'>
                  {(fb.user_name?.[0] || fb.user_phone[0]).toUpperCase()}
                </div>

                {/* Content */}
                <div className='flex-1 min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='text-sm font-semibold text-on-surface'>
                      {fb.user_name || fb.user_phone}
                    </p>
                    {fb.user_name && (
                      <p className='text-xs text-on-surface-variant'>{fb.user_phone}</p>
                    )}
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${FEEDBACK_STATUS_COLORS[fb.status]}`}
                    >
                      {FEEDBACK_STATUS_LABELS[fb.status]}
                    </span>
                  </div>
                  <p className='mt-1 text-xs text-on-surface-variant'>
                    {new Date(fb.created_at).toLocaleString('uz-UZ', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  {/* Message preview */}
                  <p
                    className={`mt-2 text-sm text-on-surface ${expandedId === fb.id ? '' : 'line-clamp-2'}`}
                  >
                    {fb.message}
                  </p>
                  {fb.message.length > 120 && (
                    <button
                      onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                      className='mt-1 text-xs font-medium text-primary hover:underline'
                    >
                      {expandedId === fb.id ? "Yig'irish ▲" : "Ko'proq ▼"}
                    </button>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className='flex items-center gap-2 border-t border-outline-variant/50 bg-surface-container/40 px-4 py-2.5'>
                <span className='text-xs text-on-surface-variant'>Statusni o'zgartirish:</span>
                {(['new', 'read', 'resolved'] as const).map((s) => (
                  <button
                    key={s}
                    disabled={fb.status === s || updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: fb.id, status: s })}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-all disabled:cursor-default disabled:opacity-50 ${
                      fb.status === s
                        ? `${FEEDBACK_STATUS_COLORS[s]} ring-1 ring-current`
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    {FEEDBACK_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3'>
          <p className='text-xs text-on-surface-variant'>
            {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} / {totalCount}
          </p>
          <div className='flex gap-1'>
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
        </div>
      )}
    </div>
  );
};

const ReportsTab = () => {
  const [subTab, setSubTab] = useState<'general' | 'sales'>('general');
  const [dateFrom, setDateFrom] = useState(MONTH_START);
  const [dateTo, setDateTo] = useState(TODAY);
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [search, setSearch] = useState('');
  const params = useMemo(
    () => ({ date_from: dateFrom || undefined, date_to: dateTo || undefined, period }),
    [dateFrom, dateTo, period],
  );
  const { data, isLoading, isError, refetch } = useQuery<ReportData>({
    queryKey: ['admin-report', params],
    queryFn: () => adminGetReport(params).then((r) => r.data),
    staleTime: 30_000,
  });
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
  const exportExcel = () => {
    if (!filteredProducts.length) {
      toast.error("Eksport qilish uchun ma'lumot yo'q");
      return;
    }
    const wsData = [
      [
        '#',
        'Tovar nomi',
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
        'Tushum',
        'Foyda',
      ],
      ...filteredProducts.map((p) => [
        p.rank,
        p.name,
        p.quality || '—',
        p.model || '—',
        p.size || '—',
        p.color || '—',
        p.sku || '—',
        p.price,
        p.discount_price ?? '—',
        p.sold_price,
        p.cost_price,
        p.quantity_sold,
        p.total_revenue,
        p.net_profit,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hisobot');
    XLSX.writeFile(wb, `bozor_hisobot_${dateFrom || 'all'}_${dateTo || 'all'}.xlsx`);
    toast.success('Excel fayl yuklab olindi!');
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
            className='flex items-center gap-2 rounded-lg border border-[#22c55e] bg-[#22c55e]/10 px-4 py-2 text-sm font-semibold text-[#22c55e] hover:bg-[#22c55e] hover:text-white'
          >
            <span className='material-symbols-outlined text-[18px]'>table_view</span>Excel Yuklash
          </button>
          <button
            onClick={() => window.print()}
            className='flex items-center gap-2 rounded-lg border border-error bg-error/10 px-4 py-2 text-sm font-semibold text-error hover:bg-error hover:text-white'
          >
            <span className='material-symbols-outlined text-[18px]'>picture_as_pdf</span>PDF
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
                ({data?.orders?.length || 0} ta chek)
              </span>
            )}
          </h3>
        </div>
        {isLoading ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block animate-spin text-5xl text-primary'>
              progress_activity
            </span>
            <p className='text-on-surface-variant'>Yuklanmoqda...</p>
          </div>
        ) : isError ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block text-5xl text-error'>error</span>
            <button
              onClick={() => refetch()}
              className='mt-3 rounded-lg bg-primary px-4 py-2 text-sm text-on-primary'
            >
              Qayta urinish
            </button>
          </div>
        ) : (subTab === 'general' && filteredProducts.length === 0) || (subTab === 'sales' && (!data?.orders || data.orders.length === 0)) ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block text-5xl text-outline'>
              inventory_2
            </span>
            <p className='text-on-surface-variant'>Ma\'lumot topilmadi</p>
          </div>
        ) : subTab === 'general' ? (
          <div key="general-table-container" className='overflow-x-auto'>
            <table key="general-table" className='w-full min-w-[1200px] border-collapse text-left text-sm'>
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
                    <td className='border border-outline-variant/40 px-3 py-2.5 text-right font-bold'>
                      {fmt(p.total_revenue)} so'm
                    </td>
                    <td
                      className={`border border-outline-variant/40 px-3 py-2.5 text-right font-bold ${p.net_profit >= 0 ? 'text-[#22c55e]' : 'text-error'}`}
                    >
                      {fmt(p.net_profit)} so'm
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
                  <td className='px-3 py-4 text-right text-base'>
                    {fmt(filteredProducts.reduce((acc, p) => acc + (p.total_revenue || 0), 0))} so'm
                  </td>
                  <td className={`px-3 py-4 text-right text-base ${filteredProducts.reduce((acc, p) => acc + (p.net_profit || 0), 0) >= 0 ? 'text-[#22c55e]' : 'text-error'}`}>
                    {fmt(filteredProducts.reduce((acc, p) => acc + (p.net_profit || 0), 0))} so'm
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
                {(data?.orders ?? []).map((order, orderIndex) => {
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
                {(!data?.orders || data.orders.length === 0) && (
                  <tr>
                    <td colSpan={7} className='py-8 text-center text-on-surface-variant'>
                      Ma'lumot topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className='bg-surface-container border-t-2 border-outline-variant font-bold text-on-surface'>
                <tr>
                  <td colSpan={2} className='px-3 py-4 text-right uppercase'>Jami:</td>
                  <td className='px-3 py-4 text-center text-primary text-base'>
                    {data?.orders?.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + item.quantity, 0), 0) || 0}
                  </td>
                  <td className='px-3 py-4 text-right text-base'>
                    {fmt(data?.orders?.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + (item.original_price * item.quantity), 0), 0) || 0)} so'm
                  </td>
                  <td className='px-3 py-4 text-right text-primary text-base'>
                    {fmt(data?.orders?.reduce((acc, order) => acc + order.total_price, 0) || 0)} so'm
                  </td>
                  <td className='px-3 py-4 text-center'></td>
                  <td className='px-3 py-4 text-right text-error text-base'>
                    {fmt(data?.orders?.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + item.discount_amount, 0), 0) || 0)} so'm
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Nasiya Tab ──────────────────────────────────────────────────────────────
const NasiyaTab = () => {
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
        <div className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
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

// ─── Sozlamalar Tab ───────────────────────────────────────────────────────────
// Do'kon ma'lumotlari uchun cache va React Query hook'lar shared utility'ga
// ko'chirildi — AdminPOS bilan birgalikda bitta source of truth (yagona cache).
// Avval dual cache bor edi -> POS'da stale qiymat bug. Shu utility tuzatadi.
//
// Import: loadShopInfo (sinxron printReceipt uchun), useShopInfo (React hook),
// updateShopInfoCache (mutation onSuccess'da).

const SozlamalarTab = () => {
  const qc = useQueryClient();

  // Dollar kursi
  const [editingRate, setEditingRate] = useState(false);
  const [newRateValue, setNewRateValue] = useState('');
  const { data: rateData, refetch: refetchRate } = useQuery({
    queryKey: ['admin-exchange-rate'],
    queryFn: () => adminGetExchangeRate().then((r) => r.data),
  });
  const updateRateMutation = useMutation({
    mutationFn: (val: string) => adminUpdateExchangeRate({ usd_rate: val }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Dollar kursi yangilandi');
      setEditingRate(false);
      refetchRate();
      qc.invalidateQueries({ queryKey: ['admin-report'] });
    },
    onError: () => toast.error('Kursni yangilashda xatolik'),
  });

  // Do'kon sozlamalari (server'da saqlanadi — faqat Super Admin tahrir qila oladi)
  const { user } = useAuthStore();
  const isSuper = !!(user?.is_admin && !user?.role);

  // Shared cache hook — modul cache'ini avtomat sinxronlashtiradi
  // (useShopInfo ichida useEffect bor)
  const shopInfoQuery = useShopInfo();

  const FIXED_STORE_NAME = shopInfoQuery.data?.shop_name || loadShopInfo().name;
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeSaved, setStoreSaved] = useState(false);

  // Server javobi kelganda formani to'ldiramiz (faqat foydalanuvchi tahrir
  // qilmagan bo'lsa)
  useEffect(() => {
    if (shopInfoQuery.data) {
      setStorePhone((cur) => (cur ? cur : shopInfoQuery.data!.shop_phone));
      setStoreAddress((cur) => (cur ? cur : shopInfoQuery.data!.shop_address));
    }
  }, [shopInfoQuery.data]);

  const updateShopInfoMutation = useMutation({
    mutationFn: () =>
      adminUpdateShopInfo({
        shop_phone: storePhone,
        shop_address: storeAddress,
      }),
    onSuccess: (res) => {
      // Shared cache + React Query store ikkalasi ham yangilanadi -> POS,
      // OrdersTab, har joy darhol yangi qiymatni ko'radi.
      updateShopInfoCache(res.data);
      qc.setQueryData(['shop-info'], res.data);
      setStoreSaved(true);
      toast.success("Do'kon ma'lumotlari saqlandi (server'da, barcha qurilmalarda mos)!");
      setTimeout(() => setStoreSaved(false), 2000);
    },
    onError: (e: any) => {
      // Backend validatsiyasi xatosini foydalanuvchi-do'st ko'rinishga aylantirish
      const data = e?.response?.data;
      const msg =
        data?.error ||
        data?.shop_phone?.[0] ||
        data?.shop_address?.[0] ||
        data?.shop_name?.[0] ||
        "Saqlashda xatolik yuz berdi.";
      toast.error(msg);
    },
  });

  const saveStoreInfo = () => {
    if (!isSuper) return;
    updateShopInfoMutation.mutate();
  };

  return (
    <div className='space-y-6 max-w-2xl'>
      <div>
        <h2 className='font-h3 text-h3 text-on-surface'>Sozlamalar</h2>
        <p className='mt-1 text-body-sm text-on-surface-variant'>
          Tizim sozlamalari, dollar kursi va do'kon ma'lumotlari
        </p>
      </div>

      {/* Dollar kursi */}
      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
        <h3 className='mb-1 flex items-center gap-2 font-semibold text-on-surface'>
          <span className='flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary'>
            <span className='material-symbols-outlined text-[20px]'>currency_exchange</span>
          </span>
          Dollar kursi (USD → UZS)
        </h3>
        <p className='mb-5 ml-11 text-sm text-on-surface-variant'>
          Mahsulot narxlarini avtomatik hisoblash uchun ishlatiladi
        </p>

        <div className='flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container p-4'>
          <div className='flex-1'>
            <p className='text-xs font-semibold uppercase text-on-surface-variant mb-1'>Joriy kurs</p>
            <p className='text-2xl font-black text-on-surface'>
              {rateData?.usd_rate ? Number(rateData.usd_rate).toLocaleString('uz-UZ') : '...'}
              <span className='ml-1 text-base font-normal text-on-surface-variant'>so'm / $1</span>
            </p>
          </div>
          {editingRate ? (
            <div className='flex items-center gap-2'>
              <input
                type='number'
                value={newRateValue}
                onChange={(e) => setNewRateValue(e.target.value)}
                className='w-32 rounded-xl border-2 border-primary bg-surface px-3 py-2 text-sm font-bold focus:outline-none'
                placeholder='Yangi kurs'
                autoFocus
              />
              <button
                onClick={() => updateRateMutation.mutate(newRateValue)}
                disabled={updateRateMutation.isPending || !newRateValue}
                className='flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50'
              >
                {updateRateMutation.isPending ? (
                  <span className='material-symbols-outlined animate-spin text-[16px]'>progress_activity</span>
                ) : (
                  <span className='material-symbols-outlined text-[16px]'>check</span>
                )}
                Saqlash
              </button>
              <button
                onClick={() => setEditingRate(false)}
                className='rounded-xl border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container'
              >
                Bekor
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNewRateValue(String(rateData?.usd_rate || ''));
                setEditingRate(true);
              }}
              className='flex items-center gap-2 rounded-xl border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container hover:text-primary transition-colors'
            >
              <span className='material-symbols-outlined text-[18px]'>edit</span>
              O'zgartirish
            </button>
          )}
        </div>
      </div>

      {/* Do'kon sozlamalari */}
      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
        <h3 className='mb-1 flex items-center gap-2 font-semibold text-on-surface'>
          <span className='flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary'>
            <span className='material-symbols-outlined text-[20px]'>store</span>
          </span>
          Do'kon ma'lumotlari
        </h3>
        <p className='mb-3 ml-11 text-sm text-on-surface-variant'>
          Savdo cheki (receipt) da ko'rinadigan telefon raqam va manzil
        </p>

        {!isSuper && (
          <div className='mb-4 ml-11 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'>
            <span className='material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5'>lock</span>
            <span>Do'kon ma'lumotlarini faqat <strong>Super Admin</strong> tahrir qila oladi. Siz faqat ko'rib turibsiz.</span>
          </div>
        )}

        <div className='space-y-4'>
          <div>
            <label className='mb-1.5 block text-sm font-bold text-on-surface'>Telefon raqam</label>
            <input
              type='text'
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              placeholder="+998 71 000-00-00"
              disabled={!isSuper || shopInfoQuery.isLoading}
              className='w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            />
          </div>
          <div>
            <label className='mb-1.5 block text-sm font-bold text-on-surface'>Manzil</label>
            <input
              type='text'
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
              placeholder="Toshkent sh., ..."
              disabled={!isSuper || shopInfoQuery.isLoading}
              className='w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            />
          </div>
          {isSuper && (
            <div className='flex items-center gap-3 pt-2'>
              <button
                onClick={saveStoreInfo}
                disabled={updateShopInfoMutation.isPending || shopInfoQuery.isLoading}
                className='flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50'
              >
                <span className='material-symbols-outlined text-[18px]'>
                  {updateShopInfoMutation.isPending ? 'progress_activity' : storeSaved ? 'check_circle' : 'save'}
                </span>
                {updateShopInfoMutation.isPending ? 'Saqlanmoqda...' : storeSaved ? 'Saqlandi!' : 'Saqlash'}
              </button>
              <p className='text-xs text-on-surface-variant'>
                Bu ma'lumotlar <strong>server'da</strong> saqlanadi (barcha qurilmalarda mos)
              </p>
            </div>
          )}
        </div>

        {/* Receipt preview */}
        <div className='mt-6 rounded-xl border border-outline-variant bg-surface-container p-4'>
          <p className='mb-2 text-xs font-semibold uppercase text-on-surface-variant'>Chek ko'rinishi:</p>
          <div className='rounded-lg border border-outline bg-surface p-3 font-mono text-xs text-on-surface'>
            <div className='text-center font-bold uppercase tracking-widest'>{FIXED_STORE_NAME}</div>
            {storePhone && <div className='text-center text-on-surface-variant'>{storePhone}</div>}
            {storeAddress && <div className='text-center text-on-surface-variant'>{storeAddress}</div>}
            <div className='my-1.5 border-t border-dashed border-outline-variant' />
            <div className='text-on-surface-variant'>CHEK #000001</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProductEditor = ({
  mode,
  product,
  categories,
  onClose,
}: {
  mode: 'create' | 'edit';
  product?: AdminProduct;
  categories: AdminCategory[];
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProductFormState>(() => mapProductToForm(product));
  const [variants, setVariants] = useState<VariantFormState[]>(() => mapProductVariants(product));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [variantImageFiles, setVariantImageFiles] = useState<Record<string, File | null>>({});
  const [variantImagePreviews, setVariantImagePreviews] = useState<Record<string, string>>({});
  const [variantGalleryFiles, setVariantGalleryFiles] = useState<Record<string, File[]>>({});
  const [variantGalleryPreviews, setVariantGalleryPreviews] = useState<Record<string, string[]>>({});
  const [removeImage, setRemoveImage] = useState(false);
  const [formError, setFormError] = useState('');
  const [showBulkGenerator, setShowBulkGenerator] = useState(false);

  const { data: rateData } = useQuery({
    queryKey: ['admin-exchange-rate'],
    queryFn: () => adminGetExchangeRate().then((r) => r.data),
    staleTime: 60_000,
  });
  const usdRate = rateData?.usd_rate || 0;

  const handlePriceChange = (
    field: 'price' | 'discount_price' | 'cost_price',
    value: string,
    isUsd: boolean,
  ) => {
    const numericValue = Number(stripNumberFormatting(value));
    setForm((prev) => {
      const next = { ...prev };
      if (isUsd) {
        (next as any)[`${field}_usd`] = value;
        if (usdRate > 0) {
          next[field] = formatPriceInput(String(Math.round(numericValue * usdRate)));
        }
      } else {
        next[field] = formatPriceInput(value);
        if (usdRate > 0) {
          const uv = (numericValue / usdRate).toFixed(2);
          (next as any)[`${field}_usd`] = uv === '0.00' || isNaN(Number(uv)) ? '' : uv;
        }
      }
      return next;
    });
  };

  useEffect(() => {
    Object.values(variantImagePreviews).forEach((url) => URL.revokeObjectURL(url));
    Object.values(variantGalleryPreviews).forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
    setForm(mapProductToForm(product));
    setVariants(mapProductVariants(product));
    setImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews({});
    setVariantGalleryFiles({});
    setVariantGalleryPreviews({});
    setRemoveImage(false);
    setFormError('');
  }, [product, mode]);

  const hasVariants = variants.length > 0;

  useEffect(() => {
    if (!hasVariants) return;
    const validPrices = variants
      .map((v) => Number(stripNumberFormatting(v.price)))
      .filter((p) => p > 0);
    if (validPrices.length === 0) return;
    const minPrice = Math.min(...validPrices);
    const validDiscounts = variants
      .map((v) => Number(stripNumberFormatting(v.discount_price)))
      .filter((p) => p > 0);
    const minDiscount = validDiscounts.length > 0 ? Math.min(...validDiscounts) : 0;
    const validCosts = variants
      .map((v) => Number(stripNumberFormatting(v.cost_price)))
      .filter((p) => p > 0);
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;
    setForm((prev) => ({
      ...prev,
      price: formatPriceInput(String(minPrice)),
      price_usd: usdRate > 0 ? (minPrice / usdRate).toFixed(2) : prev.price_usd,
      discount_price: minDiscount > 0 ? formatPriceInput(String(minDiscount)) : prev.discount_price,
      discount_price_usd:
        minDiscount > 0 && usdRate > 0
          ? (minDiscount / usdRate).toFixed(2)
          : prev.discount_price_usd,
      cost_price: minCost > 0 ? formatPriceInput(String(minCost)) : prev.cost_price,
      cost_price_usd:
        minCost > 0 && usdRate > 0 ? (minCost / usdRate).toFixed(2) : prev.cost_price_usd,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, hasVariants]);

  const saveMutation = useMutation({
    mutationFn: (payload: FormData) =>
      mode === 'edit' && product
        ? adminUpdateProduct(product.id, payload)
        : adminCreateProduct(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-products'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['product'] }),
        qc.invalidateQueries({ queryKey: ['mainPage'] }),
      ]);
      onClose();
    },
    onError: (error) => setFormError(extractErrorMessage(error)),
  });

  const handleVariantChange = (index: number, field: keyof VariantFormState, value: string) =>
    setVariants((c) => c.map((v, i) => (i === index ? { ...v, [field]: value } : v)));

  const handleVariantPriceChange = (
    index: number,
    field: 'price' | 'discount_price' | 'cost_price',
    value: string,
    isUsd: boolean,
  ) => {
    const numericValue = Number(stripNumberFormatting(value));
    setVariants((c) =>
      c.map((v, i) => {
        if (i !== index) return v;
        const next = { ...v };
        if (isUsd) {
          (next as any)[`${field}_usd`] = value;
          if (usdRate > 0)
            next[field] = formatPriceInput(String(Math.round(numericValue * usdRate)));
        } else {
          next[field] = formatPriceInput(value);
          if (usdRate > 0) {
            const uv = (numericValue / usdRate).toFixed(2);
            (next as any)[`${field}_usd`] = uv === '0.00' || isNaN(Number(uv)) ? '' : uv;
          }
        }
        return next;
      }),
    );
  };

  const handleVariantImageChange = (variant: VariantFormState, file: File | null) => {
    setVariantImageFiles((c) => ({ ...c, [variant.client_id]: file }));
    setVariantImagePreviews((c) => {
      if (c[variant.client_id]) URL.revokeObjectURL(c[variant.client_id]);
      const n = { ...c };
      if (file) n[variant.client_id] = URL.createObjectURL(file);
      else delete n[variant.client_id];
      return n;
    });
    if (file)
      setVariants((c) =>
        c.map((item) =>
          item.client_id === variant.client_id ? { ...item, remove_image: false } : item,
        ),
      );
  };

  const handleVariantGalleryAdd = (clientId: string, files: File[]) => {
    setVariantGalleryFiles((c) => ({ ...c, [clientId]: [...(c[clientId] || []), ...files] }));
    setVariantGalleryPreviews((c) => ({
      ...c,
      [clientId]: [...(c[clientId] || []), ...files.map((f) => URL.createObjectURL(f))],
    }));
  };

  const handleVariantGalleryRemoveNew = (clientId: string, idx: number) => {
    setVariantGalleryFiles((c) => {
      const next = [...(c[clientId] || [])];
      next.splice(idx, 1);
      return { ...c, [clientId]: next };
    });
    setVariantGalleryPreviews((c) => {
      const next = [...(c[clientId] || [])];
      if (next[idx]) URL.revokeObjectURL(next[idx]);
      next.splice(idx, 1);
      return { ...c, [clientId]: next };
    });
  };

  const handleVariantGalleryDeleteExisting = (clientId: string, imageId: number) => {
    setVariants((c) =>
      c.map((v) =>
        v.client_id === clientId
          ? {
              ...v,
              existingImages: v.existingImages.filter((img) => img.id !== imageId),
              deleteImageIds: [...v.deleteImageIds, imageId],
            }
          : v,
      ),
    );
  };

  const removeVariantAt = (index: number) => {
    setVariants((c) => {
      const removed = c[index];
      if (removed) {
        setVariantImageFiles((f) => {
          const n = { ...f };
          delete n[removed.client_id];
          return n;
        });
        setVariantImagePreviews((p) => {
          if (p[removed.client_id]) URL.revokeObjectURL(p[removed.client_id]);
          const n = { ...p };
          delete n[removed.client_id];
          return n;
        });
      }
      return c.filter((_, i) => i !== index);
    });
  };

  const handleGenerateAllSkus = () =>
    setVariants((c) => c.map((v) => ({ ...v, sku: generateVariantSku(form.name, v) })));
  const handleGenerateVariantSku = (index: number) =>
    setVariants((c) =>
      c.map((v, i) => (i === index ? { ...v, sku: generateVariantSku(form.name, v) } : v)),
    );

  const handleBulkGenerate = (config: {
    colors: string;
    qualities: string;
    models: string;
    sizes: string;
    baseStock: string;
    basePrice: string;
    baseDiscountPrice: string;
    baseCostPrice: string;
  }) => {
    const colors = config.colors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const qualities = config.qualities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const models = config.models
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const sizes = config.sizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      colors.length === 0 &&
      qualities.length === 0 &&
      models.length === 0 &&
      sizes.length === 0
    ) {
      toast.error("Hech bo'lmasa rang yoki sifat kiriting");
      return;
    }
    const cList = colors.length > 0 ? colors : [''],
      qList = qualities.length > 0 ? qualities : [''],
      mList = models.length > 0 ? models : [''],
      sList = sizes.length > 0 ? sizes : [''];
    const newVariants: VariantFormState[] = [];
    cList.forEach((c) =>
      qList.forEach((q) =>
        mList.forEach((m) =>
          sList.forEach((s) => {
            const v = emptyVariant();
            v.color = c;
            v.quality = q;
            v.model = m;
            v.size = s;
            v.stock = config.baseStock || '0';
            v.price = formatPriceInput(config.basePrice || form.price || '');
            v.discount_price = formatPriceInput(
              config.baseDiscountPrice || form.discount_price || '',
            );
            v.cost_price = formatPriceInput(config.baseCostPrice || form.cost_price || '');
            v.position = String(newVariants.length);
            v.sku = generateVariantSku(form.name, v);
            newVariants.push(v);
          }),
        ),
      ),
    );
    setVariants((prev) => [...prev, ...newVariants]);
    setShowBulkGenerator(false);
    toast.success(`${newVariants.length} ta variant generatsiya qilindi!`);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    const payload = new FormData();
    payload.append('name', form.name.trim());
    payload.append('description', form.description.trim());
    payload.append('price', stripNumberFormatting(form.price) || '0');
    payload.append('price_usd', stripNumberFormatting(form.price_usd) || '0');
    payload.append('discount_price', stripNumberFormatting(form.discount_price.trim()));
    payload.append('discount_price_usd', stripNumberFormatting(form.discount_price_usd.trim()));
    payload.append('cost_price', stripNumberFormatting(form.cost_price.trim()) || '0');
    payload.append('cost_price_usd', stripNumberFormatting(form.cost_price_usd.trim()) || '0');
    payload.append('stock', form.stock || '0');
    payload.append('category', form.category);
    payload.append('is_active', String(form.is_active));
    payload.append('is_new', String(form.is_new));
    payload.append('is_popular', String(form.is_popular));
    payload.append('remove_image', String(removeImage));
    if (imageFile) payload.append('image', imageFile);
    const variantsPayload = variants
      .map((v) => ({
        client_id: v.client_id,
        ...(v.id ? { id: v.id } : {}),
        color: v.color.trim(),
        color_hex: v.color_hex.trim(),
        image_url: v.image_url,
        remove_image: v.remove_image,
        quality: v.quality.trim(),
        model: v.model.trim(),
        size: v.size.trim(),
        price: stripNumberFormatting(v.price) || null,
        price_usd: stripNumberFormatting(v.price_usd) || null,
        discount_price: stripNumberFormatting(v.discount_price) || null,
        discount_price_usd: stripNumberFormatting(v.discount_price_usd) || null,
        cost_price: stripNumberFormatting(v.cost_price) || null,
        cost_price_usd: stripNumberFormatting(v.cost_price_usd) || null,
        stock: Number(v.stock || 0),
        sku: v.sku.trim(),
        barcode: v.barcode.trim(),
        is_active: v.is_active,
        position: Number(v.position || 0),
      }))
      .filter((v) =>
        hasVariantContent({
          ...v,
          price: v.price ? String(v.price) : '',
          price_usd: v.price_usd ? String(v.price_usd) : '',
          discount_price: v.discount_price ? String(v.discount_price) : '',
          discount_price_usd: v.discount_price_usd ? String(v.discount_price_usd) : '',
          cost_price: v.cost_price ? String(v.cost_price) : '',
          cost_price_usd: v.cost_price_usd ? String(v.cost_price_usd) : '',
          stock: String(v.stock),
          position: String(v.position),
        } as VariantFormState),
      );
    variantsPayload.forEach((v, i) => {
      const swatchFile = variantImageFiles[v.client_id];
      if (swatchFile) payload.append(`variant_image_${i}`, swatchFile);
      const galleryFiles = variantGalleryFiles[v.client_id] || [];
      galleryFiles.forEach((f, j) => payload.append(`variant_images_${i}_${j}`, f));
    });
    payload.append(
      'variants_data',
      JSON.stringify(
        variantsPayload.map(({ client_id, ...v }) => {
          const deleteIds = variants.find((vv) => vv.client_id === client_id)?.deleteImageIds || [];
          return { ...v, delete_image_ids: deleteIds };
        }),
      ),
    );
    await saveMutation.mutateAsync(payload);
  };

  return (
    <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
      <div className='mb-6 flex flex-col gap-2 border-b border-outline-variant pb-4 md:flex-row md:items-center md:justify-between'>
        <div>
          <h3 className='font-h3 text-h3 text-on-surface'>
            {mode === 'edit' ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
          </h3>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Narx, tavsif, rasm va variantlar bir joydan boshqariladi.
          </p>
        </div>
        {mode === 'edit' && product && (
          <div className='rounded-xl bg-surface-container px-4 py-2 text-sm text-on-surface-variant'>
            ID: {product.id} | Slug: {product.slug}
          </div>
        )}
      </div>
      {formError && (
        <div className='mb-4 flex gap-2 rounded-lg bg-error-container p-3 text-body-sm text-on-error-container'>
          <span className='material-symbols-outlined text-[16px]'>error</span>
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} className='space-y-6'>
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <div className='xl:col-span-8'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Mahsulot nomi *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary'
              placeholder='iPhone 17 Pro Max'
            />
          </div>
          <div className='xl:col-span-4'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Kategoriya
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            >
              <option value=''>-- Kategoriya tanlanmagan --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>

          <div className='xl:col-span-12'>
            {hasVariants ? (
              <div className='rounded-xl border border-primary/20 bg-primary/5 px-4 py-3'>
                <div className='mb-3 flex items-center gap-2'>
                  <span className='material-symbols-outlined text-[18px] text-primary'>
                    auto_fix_high
                  </span>
                  <span className='text-sm font-semibold text-primary'>
                    Asosiy narxlar variantlardan avtomatik to'ldirildi
                  </span>
                  <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary'>
                    AUTO
                  </span>
                </div>
                <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
                  {[
                    {
                      label: "Min. narx (so'm)",
                      value: form.price,
                      color: 'text-on-surface font-bold',
                    },
                    {
                      label: 'Min. narx (USD)',
                      value: form.price_usd ? `$${form.price_usd}` : '—',
                      color: 'text-primary font-bold',
                    },
                    {
                      label: "Min. chegirma (so'm)",
                      value: form.discount_price || '—',
                      color: 'text-tertiary font-semibold',
                    },
                    {
                      label: 'Min. chegirma (USD)',
                      value: form.discount_price_usd ? `$${form.discount_price_usd}` : '—',
                      color: 'text-[#f59e0b] font-semibold',
                    },
                    {
                      label: "Min. kirim (so'm)",
                      value: form.cost_price || '—',
                      color: 'text-on-surface-variant font-semibold',
                    },
                    {
                      label: 'Min. kirim (USD)',
                      value: form.cost_price_usd ? `$${form.cost_price_usd}` : '—',
                      color: 'text-on-surface-variant font-semibold',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2'
                    >
                      <div className='text-[10px] font-bold uppercase text-on-surface-variant'>
                        {item.label}
                      </div>
                      <div className={`mt-1 text-sm ${item.color}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <p className='mt-2 text-[11px] text-on-surface-variant'>
                  💡 Hisobotda har bir variant o'z narxida ko'rinadi. Bu qatorlar faqat saytda
                  "boshlanish narxi" uchun.
                </p>
              </div>
            ) : (
              <div className='grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'>
                <div>
                  <label className='mb-1 flex items-center gap-1 text-label-md font-label-md text-on-surface-variant'>
                    Narx (so'm)<span className='text-error'>*</span>
                  </label>
                  <input
                    required={!hasVariants}
                    type='text'
                    inputMode='decimal'
                    value={form.price}
                    onChange={(e) => handlePriceChange('price', e.target.value, false)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                    placeholder='15 000 000'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Narx (USD)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.price_usd}
                    onChange={(e) => handlePriceChange('price', e.target.value, true)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-primary outline-none focus:border-primary'
                    placeholder='1200'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Chegirma (so'm)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.discount_price}
                    onChange={(e) => handlePriceChange('discount_price', e.target.value, false)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-tertiary outline-none focus:border-primary'
                    placeholder='13 500 000'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Chegirma (USD)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.discount_price_usd}
                    onChange={(e) => handlePriceChange('discount_price', e.target.value, true)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-[#f59e0b] outline-none focus:border-primary'
                    placeholder='1100'
                  />
                </div>
                <div>
                  <label className='mb-1 flex items-center gap-1 text-label-md font-label-md text-on-surface-variant'>
                    Kirim (so'm)<span className='text-error'>*</span>
                  </label>
                  <input
                    required={!hasVariants}
                    type='text'
                    inputMode='decimal'
                    value={form.cost_price}
                    onChange={(e) => handlePriceChange('cost_price', e.target.value, false)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                    placeholder='10 000 000'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Kirim (USD)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.cost_price_usd}
                    onChange={(e) => handlePriceChange('cost_price', e.target.value, true)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                    placeholder='800'
                  />
                </div>
              </div>
            )}
          </div>

          <div className='xl:col-span-2'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Jami soni
            </label>
            <input
              min='0'
              type='number'
              value={form.stock}
              onChange={(e) => setForm((c) => ({ ...c, stock: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='10'
            />
          </div>
          <div className='xl:col-span-4'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Asosiy rasm
            </label>
            <input
              type='file'
              accept='image/*'
              onChange={(e) => {
                setImageFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveImage(false);
              }}
              className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
            />
          </div>
          <div className='xl:col-span-12'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tavsif
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='Mahsulotning asosiy afzalliklari...'
            />
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]'>
          <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
            <div className='mb-3 flex items-center justify-between'>
              <h4 className='font-h3 text-lg text-on-surface'>Ko\'rinish va status</h4>
            </div>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              {[
                {
                  checked: form.is_active,
                  onChange: (v: boolean) => setForm((c) => ({ ...c, is_active: v })),
                  label: 'Faol mahsulot',
                },
                {
                  checked: form.is_new,
                  onChange: (v: boolean) => setForm((c) => ({ ...c, is_new: v })),
                  label: 'Yangi belgi',
                },
                {
                  checked: form.is_popular,
                  onChange: (v: boolean) => setForm((c) => ({ ...c, is_popular: v })),
                  label: 'Ommabop belgi',
                },
              ].map((item) => (
                <label
                  key={item.label}
                  className='flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-bright px-3 py-3'
                >
                  <input
                    type='checkbox'
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.target.checked)}
                    className='rounded text-primary'
                  />
                  <span className='text-body-sm text-on-surface'>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
            <h4 className='mb-3 font-h3 text-lg text-on-surface'>Rasm holati</h4>
            <div className='space-y-3'>
              {product?.main_image && !removeImage && !imageFile && (
                <div className='flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-bright p-3'>
                  <img
                    src={product.main_image}
                    alt={product.name}
                    className='h-16 w-16 rounded-lg object-cover'
                  />
                  <div className='min-w-0'>
                    <div className='font-body-md text-on-surface'>Joriy asosiy rasm</div>
                  </div>
                </div>
              )}
              {product?.main_image && (
                <label className='flex items-center gap-2 text-body-sm text-on-surface'>
                  <input
                    type='checkbox'
                    checked={removeImage}
                    onChange={(e) => setRemoveImage(e.target.checked)}
                    className='rounded text-primary'
                  />
                  Joriy rasmni olib tashlash
                </label>
              )}
            </div>
          </div>
        </div>

        <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
          <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <div>
              <h4 className='font-h3 text-lg text-on-surface'>Variantlar</h4>
              <p className='mt-1 text-body-sm text-on-surface-variant'>
                Rang guruhlari bo'yicha — har rang uchun alohida sifat/narx jadval.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {variants.length > 0 && (
                <button
                  type='button'
                  onClick={handleGenerateAllSkus}
                  className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-xs text-tertiary hover:bg-surface-container'
                >
                  <span className='material-symbols-outlined text-[15px]'>magic_button</span>SKU
                  generatsiya
                </button>
              )}
              <button
                type='button'
                onClick={() => setShowBulkGenerator(!showBulkGenerator)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${showBulkGenerator ? 'bg-error-container text-on-error-container' : 'bg-primary text-on-primary hover:opacity-90'}`}
              >
                <span className='material-symbols-outlined text-[15px]'>
                  {showBulkGenerator ? 'cancel' : 'auto_fix_high'}
                </span>
                {showBulkGenerator ? 'Generatorni yopish' : '⚡ Tez Generator'}
              </button>
              <button
                type='button'
                onClick={() => setVariants((c) => [...c, emptyVariant()])}
                className='flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary-container/10'
              >
                <span className='material-symbols-outlined text-[15px]'>add_circle</span>Qo\'lda
                qo'shish
              </button>
            </div>
          </div>
          {showBulkGenerator && (
            <BulkVariantGenerator
              defaults={{
                basePrice: form.price,
                baseDiscountPrice: form.discount_price,
                baseCostPrice: form.cost_price,
                baseStock: form.stock,
              }}
              onGenerate={handleBulkGenerate}
            />
          )}
          {variants.length > 0 ? (
            <ColorGroupVariantEditor
              variants={variants}
              variantImageFiles={variantImageFiles}
              variantImagePreviews={variantImagePreviews}
              variantGalleryPreviews={variantGalleryPreviews}
              onVariantChange={handleVariantChange}
              onVariantPriceChange={handleVariantPriceChange}
              onVariantImageChange={handleVariantImageChange}
              onRemoveVariant={removeVariantAt}
              onGenerateSku={handleGenerateVariantSku}
              onGalleryAdd={handleVariantGalleryAdd}
              onGalleryRemoveNew={handleVariantGalleryRemoveNew}
              onGalleryDeleteExisting={handleVariantGalleryDeleteExisting}
              onAddVariantToGroup={(baseVariant) => {
                const newVar = emptyVariant(baseVariant.group_id);
                newVar.color = baseVariant.color;
                newVar.color_hex = baseVariant.color_hex;
                newVar.image_url = baseVariant.image_url;
                newVar.price = baseVariant.price;
                newVar.price_usd = baseVariant.price_usd;
                newVar.cost_price = baseVariant.cost_price;
                newVar.cost_price_usd = baseVariant.cost_price_usd;
                setVariants((c) => [...c, newVar]);
              }}
            />
          ) : (
            <div className='rounded-xl border-2 border-dashed border-outline-variant bg-surface-bright p-8 text-center'>
              <span className='material-symbols-outlined mb-2 block text-4xl text-outline'>
                inventory_2
              </span>
              <p className='font-semibold text-on-surface-variant'>Hozircha variant yo'q</p>
              <p className='mt-1 text-sm text-on-surface-variant'>
                ⚡ Tez Generator yoki "Qo\'lda qo'shish" tugmasidan foydalaning
              </p>
            </div>
          )}
        </div>

        <div className='flex flex-col gap-3 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='text-body-sm text-on-surface-variant'>
            {mode === 'edit'
              ? "O'zgartirishlar saqlansa frontenddagi ko\'rinish ham yangilanadi."
              : "Yangi mahsulot saqlangach darhol katalogda ishlatish mumkin bo'ladi."}
          </div>
          <div className='flex gap-3'>
            <button
              type='button'
              onClick={onClose}
              className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
            >
              Bekor
            </button>
            <button
              type='submit'
              disabled={saveMutation.isPending}
              className='flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary hover:opacity-90 disabled:opacity-60'
            >
              {saveMutation.isPending && (
                <span className='material-symbols-outlined animate-spin text-[16px]'>
                  progress_activity
                </span>
              )}
              {mode === 'edit' ? "O\'zgarishlarni saqlash" : 'Saqlash'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const ColorGroupVariantEditor = ({
  variants,
  variantImageFiles,
  variantImagePreviews,
  variantGalleryPreviews,
  onVariantChange,
  onVariantPriceChange,
  onVariantImageChange,
  onRemoveVariant,
  onGenerateSku,
  onGalleryAdd,
  onGalleryRemoveNew,
  onGalleryDeleteExisting,
  onAddVariantToGroup,
}: {
  variants: VariantFormState[];
  variantImageFiles: Record<string, File | null>;
  variantImagePreviews: Record<string, string>;
  variantGalleryPreviews: Record<string, string[]>;
  onVariantChange: (index: number, field: keyof VariantFormState, value: string) => void;
  onVariantPriceChange: (
    index: number,
    field: 'price' | 'discount_price' | 'cost_price',
    value: string,
    isUsd: boolean,
  ) => void;
  onVariantImageChange: (variant: VariantFormState, file: File | null) => void;
  onRemoveVariant: (index: number) => void;
  onGenerateSku: (index: number) => void;
  onGalleryAdd: (clientId: string, files: File[]) => void;
  onGalleryRemoveNew: (clientId: string, idx: number) => void;
  onGalleryDeleteExisting: (clientId: string, imageId: number) => void;
  onAddVariantToGroup: (baseVariant: VariantFormState) => void;
}) => {
  // Group variants by color (or client_id if no color)
  const groups = useMemo(() => {
    const g = new Map<string, VariantFormState[]>();
    variants.forEach((v) => {
      const key = v.group_id;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(v);
    });
    return Array.from(g.values());
  }, [variants]);

  const [openItems, setOpenItems] = useState<Set<string>>(
    () => new Set(groups.map((g) => g[0].client_id)),
  );
  const toggleItem = (clientId: string) =>
    setOpenItems((prev) => {
      const n = new Set(prev);
      n.has(clientId) ? n.delete(clientId) : n.add(clientId);
      return n;
    });

  return (
    <div className='space-y-6'>
      {groups.map((group, groupIndex) => {
        const baseVariant = group[0];
        const isOpen = openItems.has(baseVariant.client_id);
        const groupLabel = baseVariant.color || `Yangi rang #${groupIndex + 1}`;
        const totalStock = group.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        return (
          <div
            key={baseVariant.client_id}
            className='overflow-hidden rounded-xl border border-outline-variant bg-surface-bright shadow-sm'
          >
            <div
              className='flex items-center gap-3 px-4 py-3 cursor-pointer select-none bg-surface-container-lowest'
              onClick={() => toggleItem(baseVariant.client_id)}
            >
              {baseVariant.color_hex && (
                <span
                  className='h-5 w-5 flex-shrink-0 rounded-full border border-outline-variant shadow-sm'
                  style={{ backgroundColor: baseVariant.color_hex }}
                />
              )}
              <span className='flex-1 font-bold text-on-surface'>{groupLabel}</span>
              <div className='flex items-center gap-4' onClick={(e) => e.stopPropagation()}>
                <span className='text-xs font-medium text-on-surface-variant'>
                  {group.length} xil sifat
                </span>
                <span className='text-xs font-medium text-primary'>{totalStock} dona stok</span>
                <span className='material-symbols-outlined text-[20px] text-on-surface-variant'>
                  {isOpen ? 'expand_less' : 'expand_more'}
                </span>
              </div>
            </div>

            {isOpen && (
              <div className='border-t border-outline-variant p-5'>
                {/* 1. Color Group Settings */}
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6'>
                  <div className='lg:col-span-2'>
                    <label className='mb-2 block text-[11px] font-bold uppercase text-on-surface-variant'>
                      Rang nomi
                    </label>
                    <input
                      value={baseVariant.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        group.forEach((v) => onVariantChange(variants.indexOf(v), 'color', val));
                      }}
                      className='w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                      placeholder="Qora, Ko'k, Kumush..."
                    />
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.hex}
                          type='button'
                          title={preset.name}
                          onClick={() => {
                            group.forEach((v) => {
                              const idx = variants.indexOf(v);
                              onVariantChange(idx, 'color', preset.name);
                              onVariantChange(idx, 'color_hex', preset.hex);
                            });
                          }}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all hover:scale-105 ${baseVariant.color === preset.name ? 'border-primary bg-primary-container/20 text-primary' : 'border-outline-variant text-on-surface-variant hover:border-outline'}`}
                        >
                          <span
                            className='h-3 w-3 rounded-full border shadow-sm'
                            style={{ backgroundColor: preset.hex }}
                          />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className='flex gap-4'>
                      <div className='flex-1'>
                        <label className='mb-2 block text-[11px] font-bold uppercase text-on-surface-variant'>
                          Rang kodi (HEX)
                        </label>
                        <div className='flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden'>
                          <input
                            type='color'
                            value={baseVariant.color_hex || '#000000'}
                            onChange={(e) => {
                              const val = e.target.value;
                              group.forEach((v) =>
                                onVariantChange(variants.indexOf(v), 'color_hex', val),
                              );
                            }}
                            className='h-[38px] w-12 cursor-pointer border-0 bg-transparent p-1'
                          />
                          <input
                            value={baseVariant.color_hex}
                            onChange={(e) => {
                              const val = e.target.value;
                              group.forEach((v) =>
                                onVariantChange(variants.indexOf(v), 'color_hex', val),
                              );
                            }}
                            className='min-w-0 flex-1 bg-transparent px-2 text-sm font-mono outline-none'
                            placeholder='#111827'
                          />
                        </div>
                      </div>
                    </div>
                    <div className='mt-4'>
                      <label className='mb-2 block text-[11px] font-bold uppercase text-on-surface-variant'>
                        Rang (swatch) rasmi
                      </label>
                      <input
                        type='file'
                        accept='image/*'
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          group.forEach((v) => onVariantImageChange(v, file));
                        }}
                        className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:text-on-primary'
                      />
                      {variantImagePreviews[baseVariant.client_id] && (
                        <img src={variantImagePreviews[baseVariant.client_id]} alt='' className='mt-2 h-16 w-16 rounded-lg object-cover' />
                      )}
                      {baseVariant.image_url && !variantImageFiles[baseVariant.client_id] && (
                        <div className='mt-2 flex items-center gap-2'>
                          <img src={baseVariant.image_url} alt='' className='h-16 w-16 rounded-lg object-cover' />
                          <label className='flex items-center gap-1 text-xs text-error'>
                            <input type='checkbox' checked={baseVariant.remove_image} onChange={e => {
                               const val = String(e.target.checked);
                               group.forEach(v => onVariantChange(variants.indexOf(v), 'remove_image', val));
                            }} className='rounded' />
                            Rasmni o'chirish
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Gallery images */}
                    <div className='mt-4'>
                      <label className='mb-2 block text-[11px] font-bold uppercase text-on-surface-variant'>
                        Galereya rasmlari
                      </label>
                      <div className='flex flex-wrap gap-2 mb-2'>
                        {baseVariant.existingImages.map((img) => (
                          <div key={img.id} className='relative group/img'>
                            <img src={img.url} alt='' className='h-20 w-20 rounded-lg object-cover border border-outline-variant' />
                            <button
                              type='button'
                              onClick={() => onGalleryDeleteExisting(baseVariant.client_id, img.id)}
                              className='absolute -top-1.5 -right-1.5 hidden group-hover/img:flex h-5 w-5 items-center justify-center rounded-full bg-error text-on-error text-[11px] shadow'
                            >
                              <span className='material-symbols-outlined text-[13px]'>close</span>
                            </button>
                          </div>
                        ))}
                        {(variantGalleryPreviews[baseVariant.client_id] || []).map((url, j) => (
                          <div key={`new-${j}`} className='relative group/img'>
                            <img src={url} alt='' className='h-20 w-20 rounded-lg object-cover border-2 border-primary/50' />
                            <button
                              type='button'
                              onClick={() => onGalleryRemoveNew(baseVariant.client_id, j)}
                              className='absolute -top-1.5 -right-1.5 hidden group-hover/img:flex h-5 w-5 items-center justify-center rounded-full bg-error text-on-error text-[11px] shadow'
                            >
                              <span className='material-symbols-outlined text-[13px]'>close</span>
                            </button>
                          </div>
                        ))}
                        <label className='flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary transition-colors'>
                          <span className='material-symbols-outlined text-2xl'>add_photo_alternate</span>
                          <span className='text-[10px] mt-0.5'>Qo'shish</span>
                          <input
                            type='file'
                            accept='image/*'
                            multiple
                            className='hidden'
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length) onGalleryAdd(baseVariant.client_id, files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Variations Table */}
                <div className='overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest'>
                  <table className='w-full text-left text-sm whitespace-nowrap'>
                    <thead className='bg-surface-container text-[10px] font-bold uppercase text-on-surface-variant'>
                      <tr>
                        <th className='px-3 py-2'>Sifat</th>
                        <th className='px-3 py-2'>Model/Hajm</th>
                        <th className='px-3 py-2 text-primary'>Narx (so'm)</th>
                        <th className='px-3 py-2 text-tertiary'>Chegirma</th>
                        <th className='px-3 py-2'>Kirim</th>
                        <th className='px-3 py-2'>Stock</th>
                        <th className='px-3 py-2'>SKU</th>
                        <th className='px-2 py-2 text-center'>Faol</th>
                        <th className='px-2 py-2'></th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-outline-variant'>
                      {group.map((variant) => {
                        const idx = variants.indexOf(variant);
                        return (
                          <tr key={variant.client_id} className='hover:bg-surface-container/30'>
                            <td className='p-2'>
                              <input
                                value={variant.quality}
                                onChange={(e) => onVariantChange(idx, 'quality', e.target.value)}
                                className='w-full min-w-[120px] rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs outline-none focus:border-primary'
                                placeholder='Original...'
                              />
                            </td>
                            <td className='p-2'>
                              <div className='flex gap-1'>
                                <input
                                  value={variant.model}
                                  onChange={(e) => onVariantChange(idx, 'model', e.target.value)}
                                  className='w-16 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs outline-none focus:border-primary'
                                  placeholder='Pro...'
                                />
                                <input
                                  value={variant.size}
                                  onChange={(e) => onVariantChange(idx, 'size', e.target.value)}
                                  className='w-16 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs outline-none focus:border-primary'
                                  placeholder='128GB...'
                                />
                              </div>
                            </td>
                            <td className='p-2'>
                              <div className='flex gap-1'>
                                <input
                                  value={variant.price}
                                  onChange={(e) =>
                                    onVariantPriceChange(idx, 'price', e.target.value, false)
                                  }
                                  className='w-24 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs font-bold text-primary outline-none focus:border-primary'
                                  placeholder="so'm"
                                />
                                <input
                                  value={variant.price_usd}
                                  onChange={(e) =>
                                    onVariantPriceChange(idx, 'price', e.target.value, true)
                                  }
                                  className='w-12 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs font-bold text-[#10b981] outline-none focus:border-primary'
                                  placeholder='$'
                                />
                              </div>
                            </td>
                            <td className='p-2'>
                              <div className='flex gap-1'>
                                <input
                                  value={variant.discount_price}
                                  onChange={(e) =>
                                    onVariantPriceChange(
                                      idx,
                                      'discount_price',
                                      e.target.value,
                                      false,
                                    )
                                  }
                                  className='w-24 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs text-tertiary outline-none focus:border-primary'
                                  placeholder="so'm"
                                />
                                <input
                                  value={variant.discount_price_usd}
                                  onChange={(e) =>
                                    onVariantPriceChange(
                                      idx,
                                      'discount_price',
                                      e.target.value,
                                      true,
                                    )
                                  }
                                  className='w-12 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs text-[#f59e0b] outline-none focus:border-primary'
                                  placeholder='$'
                                />
                              </div>
                            </td>
                            <td className='p-2'>
                              <div className='flex gap-1'>
                                <input
                                  value={variant.cost_price}
                                  onChange={(e) =>
                                    onVariantPriceChange(idx, 'cost_price', e.target.value, false)
                                  }
                                  className='w-24 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs outline-none focus:border-primary'
                                  placeholder="so'm"
                                />
                                <input
                                  value={variant.cost_price_usd}
                                  onChange={(e) =>
                                    onVariantPriceChange(idx, 'cost_price', e.target.value, true)
                                  }
                                  className='w-12 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs outline-none focus:border-primary'
                                  placeholder='$'
                                />
                              </div>
                            </td>
                            <td className='p-2'>
                              <input
                                value={variant.stock}
                                onChange={(e) => onVariantChange(idx, 'stock', e.target.value)}
                                className='w-14 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-xs outline-none focus:border-primary'
                                placeholder='0'
                              />
                            </td>
                            <td className='p-2'>
                              <div className='flex items-center gap-1'>
                                <input
                                  value={variant.sku}
                                  onChange={(e) => onVariantChange(idx, 'sku', e.target.value)}
                                  className='w-24 rounded border border-outline-variant bg-surface-bright px-2 py-1.5 text-[10px] font-mono outline-none focus:border-primary'
                                  placeholder='SKU...'
                                />
                                <button
                                  type='button'
                                  onClick={() => onGenerateSku(idx)}
                                  className='flex-shrink-0 rounded p-1 text-primary hover:bg-primary-container/20'
                                  title='Auto SKU'
                                >
                                  <span className='material-symbols-outlined text-[14px]'>
                                    magic_button
                                  </span>
                                </button>
                              </div>
                            </td>
                            <td className='p-2 text-center'>
                              <input
                                type='checkbox'
                                checked={variant.is_active}
                                onChange={(e) =>
                                  onVariantChange(idx, 'is_active', String(e.target.checked))
                                }
                                className='h-4 w-4 rounded text-primary focus:ring-primary'
                              />
                            </td>
                            <td className='p-2 text-center'>
                              <button
                                type='button'
                                onClick={() => onRemoveVariant(idx)}
                                className='flex h-6 w-6 items-center justify-center rounded bg-error-container/30 text-error transition-all hover:bg-error hover:text-on-error'
                                title="O'chirish"
                              >
                                <span className='material-symbols-outlined text-[16px]'>
                                  delete
                                </span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className='mt-3 flex'>
                  <button
                    type='button'
                    onClick={() => onAddVariantToGroup(baseVariant)}
                    className='flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary-container/10'
                  >
                    <span className='material-symbols-outlined text-[16px]'>add_circle</span>
                    Bu rangga yangi sifat/hajm qo'shish
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BulkVariantGenerator = ({
  defaults,
  onGenerate,
}: {
  defaults: {
    basePrice: string;
    baseDiscountPrice: string;
    baseCostPrice: string;
    baseStock: string;
  };
  onGenerate: (config: any) => void;
}) => {
  const [config, setConfig] = useState({
    colors: '',
    qualities: '',
    models: '',
    sizes: '',
    baseStock: defaults.baseStock || '0',
    basePrice: defaults.basePrice || '',
    baseDiscountPrice: defaults.baseDiscountPrice || '',
    baseCostPrice: defaults.baseCostPrice || '',
  });
  const preview = useMemo(() => {
    const c = config.colors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const q = config.qualities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const m = config.models
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const s = config.sizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      Math.max(1, c.length || 1) *
      Math.max(1, q.length || 1) *
      Math.max(1, m.length || 1) *
      Math.max(1, s.length || 1)
    );
  }, [config]);
  return (
    <div className='mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5'>
      <div className='mb-4 flex items-center gap-2'>
        <span className='material-symbols-outlined text-[20px] text-primary'>auto_fix_high</span>
        <h5 className='font-semibold text-primary'>⚡ Tez Variant Generator</h5>
        <span className='ml-auto rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary'>
          {preview} ta variant generatsiya qilinadi
        </span>
      </div>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Ranglar (vergul bilan)
          </label>
          <input
            value={config.colors}
            onChange={(e) => setConfig((c) => ({ ...c, colors: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder="Qora, Oq, Ko'k"
          />
          <div className='mt-1 flex flex-wrap gap-1'>
            {COLOR_PRESETS.slice(0, 8).map((p) => (
              <button
                key={p.hex}
                type='button'
                onClick={() =>
                  setConfig((c) => ({ ...c, colors: c.colors ? `${c.colors}, ${p.name}` : p.name }))
                }
                className='flex items-center gap-1 rounded-md border border-outline-variant px-1.5 py-0.5 text-[10px] hover:bg-surface-container'
              >
                <span className='h-2.5 w-2.5 rounded-full' style={{ backgroundColor: p.hex }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Sifatlar (vergul bilan)
          </label>
          <input
            value={config.qualities}
            onChange={(e) => setConfig((c) => ({ ...c, qualities: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='Original, OEM, Copy A'
          />
          <div className='mt-1 flex flex-wrap gap-1'>
            {QUALITY_PRESETS.map((q) => (
              <button
                key={q}
                type='button'
                onClick={() =>
                  setConfig((c) => ({ ...c, qualities: c.qualities ? `${c.qualities}, ${q}` : q }))
                }
                className='rounded-md border border-outline-variant px-1.5 py-0.5 text-[10px] hover:bg-surface-container'
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Modellar (vergul bilan)
          </label>
          <input
            value={config.models}
            onChange={(e) => setConfig((c) => ({ ...c, models: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='Pro, Ultra, Max'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            O\'lchamlar (vergul bilan)
          </label>
          <input
            value={config.sizes}
            onChange={(e) => setConfig((c) => ({ ...c, sizes: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='128GB, 256GB, 512GB'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Asosiy narx (so'm)
          </label>
          <input
            type='text'
            inputMode='decimal'
            value={config.basePrice}
            onChange={(e) =>
              setConfig((c) => ({ ...c, basePrice: formatPriceInput(e.target.value) }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary'
            placeholder='15 000 000'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Chegirma narxi (so'm)
          </label>
          <input
            type='text'
            inputMode='decimal'
            value={config.baseDiscountPrice}
            onChange={(e) =>
              setConfig((c) => ({ ...c, baseDiscountPrice: formatPriceInput(e.target.value) }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold text-tertiary outline-none focus:border-primary'
            placeholder='13 500 000'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Kirim narxi (so'm)
          </label>
          <input
            type='text'
            inputMode='decimal'
            value={config.baseCostPrice}
            onChange={(e) =>
              setConfig((c) => ({ ...c, baseCostPrice: formatPriceInput(e.target.value) }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary'
            placeholder='10 000 000'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Ombor soni
          </label>
          <input
            type='number'
            min='0'
            value={config.baseStock}
            onChange={(e) => setConfig((c) => ({ ...c, baseStock: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='10'
          />
        </div>
      </div>
      <div className='mt-4 flex justify-end'>
        <button
          type='button'
          onClick={() => onGenerate(config)}
          className='flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-semibold text-on-primary hover:opacity-90 shadow-lg shadow-primary/20'
        >
          <span className='material-symbols-outlined text-[18px]'>auto_fix_high</span>
          {preview} ta Variant Generatsiya Qilish
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPATIBILITY TAB — Telefon Mos Kelish Matritsasi
// ─────────────────────────────────────────────────────────────────────────────

interface CPhoneModel {
  id: number;
  slug: string;
  full_name: string;
  brand_name: string;
  series_name: string;
  year: number | null;
  is_popular: boolean;
}
interface CPhoneSeries {
  id: number;
  name: string;
  slug: string;
  order: number;
  models: CPhoneModel[];
}
interface CPhoneBrand {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  is_popular: boolean;
  order: number;
  series: CPhoneSeries[];
}
interface CCompatEntry {
  id: number;
  phone_model: CPhoneModel;
  notes: string;
}

type CompatSubTab = 'models' | 'products';

// ── Reusable: Brand / Series / Model tree viewer ──────────────────────────────
const PhoneTree = ({
  brands,
  renderModelExtra,
  renderSeriesExtra,
  renderBrandExtra,
  checkable,
  checkedIds,
  existingIds,
  onToggleModel,
}: {
  brands: CPhoneBrand[];
  renderModelExtra?: (m: CPhoneModel, series: CPhoneSeries) => React.ReactNode;
  renderSeriesExtra?: (s: CPhoneSeries, brand: CPhoneBrand) => React.ReactNode;
  renderBrandExtra?: (b: CPhoneBrand) => React.ReactNode;
  checkable?: boolean;
  checkedIds?: Set<number>;
  existingIds?: Set<number>;
  onToggleModel?: (id: number) => void;
}) => {
  const [openBrands, setOpenBrands] = useState<Set<number>>(new Set(brands.map((b) => b.id)));
  const [openSeries, setOpenSeries] = useState<Set<number>>(new Set());

  const toggleBrand = (id: number) =>
    setOpenBrands((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSeries = (id: number) =>
    setOpenSeries((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!brands.length)
    return <p className="py-8 text-center text-sm text-on-surface-variant">Brendlar yo'q</p>;

  return (
    <div className="space-y-2">
      {brands.map((brand) => (
        <div key={brand.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
          {/* Brand header */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button onClick={() => toggleBrand(brand.id)} className="flex flex-1 items-center gap-2 text-left">
              <span className="material-symbols-outlined text-[18px] text-primary transition-transform"
                style={{ transform: openBrands.has(brand.id) ? 'rotate(90deg)' : 'none' }}>
                chevron_right
              </span>
              <span className="font-medium text-on-surface">{brand.name}</span>
              {brand.is_popular && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Mashhur</span>
              )}
              <span className="ml-1 text-xs text-on-surface-variant">
                ({brand.series.reduce((s, sr) => s + sr.models.length, 0)} model)
              </span>
            </button>
            {renderBrandExtra?.(brand)}
          </div>

          {/* Series list */}
          {openBrands.has(brand.id) && (
            <div className="border-t border-outline-variant/50 bg-surface-container-low/30 px-4 py-2 space-y-2">
              {brand.series.length === 0 && (
                <p className="py-2 text-xs text-on-surface-variant">Seriyalar yo'q</p>
              )}
              {brand.series.map((series) => (
                <div key={series.id}>
                  <div className="flex items-center gap-2 py-1.5">
                    <button onClick={() => toggleSeries(series.id)} className="flex flex-1 items-center gap-1.5 text-left">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform"
                        style={{ transform: openSeries.has(series.id) ? 'rotate(90deg)' : 'none' }}>
                        chevron_right
                      </span>
                      <span className="text-sm font-medium text-on-surface">{series.name}</span>
                      <span className="text-xs text-on-surface-variant">({series.models.length})</span>
                    </button>
                    {renderSeriesExtra?.(series, brand)}
                  </div>
                  {openSeries.has(series.id) && (
                    <div className="ml-6 space-y-1 pb-1">
                      {series.models.map((m) => {
                        const isExisting = existingIds?.has(m.id);
                        const isChecked = checkedIds?.has(m.id);
                        return (
                          <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-container">
                            {checkable && (
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                disabled={isExisting}
                                checked={isExisting || isChecked}
                                onChange={() => onToggleModel?.(m.id)}
                              />
                            )}
                            <span className={`flex-1 text-sm ${isExisting ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                              {m.full_name}
                              {m.is_popular && <span className="ml-1 text-xs text-primary">★</span>}
                            </span>
                            {isExisting && (
                              <span className="text-xs text-secondary">qo'shilgan</span>
                            )}
                            {renderModelExtra?.(m, series)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Sub-tab 1: Phone Models Manager ──────────────────────────────────────────
const PhoneModelsManager = () => {
  const qc = useQueryClient();
  const [showBrandForm, setShowBrandForm]   = useState(false);
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [showModelForm, setShowModelForm]   = useState(false);
  const [brandForm, setBrandForm]   = useState({ name: '', is_popular: false, order: 0 });
  const [seriesForm, setSeriesForm] = useState({ brand: '', name: '', order: 0 });
  const [modelForm, setModelForm]   = useState({ series: '', name: '', year: '', is_popular: false, order: 0 });
  const [saving, setSaving] = useState(false);

  const { data: brands = [], isLoading } = useQuery<CPhoneBrand[]>({
    queryKey: ['admin-phone-brands'],
    queryFn: () => adminGetPhoneBrands().then((r) => r.data?.results ?? r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-phone-brands'] });

  const handleBrand = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await adminCreatePhoneBrand({ ...brandForm, order: Number(brandForm.order) });
      invalidate(); setShowBrandForm(false); setBrandForm({ name: '', is_popular: false, order: 0 });
      toast.success('Brend qo\'shildi');
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const handleSeries = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await adminCreatePhoneSeries({ brand: Number(seriesForm.brand), name: seriesForm.name, order: Number(seriesForm.order) });
      invalidate(); setShowSeriesForm(false); setSeriesForm({ brand: '', name: '', order: 0 });
      toast.success('Seriya qo\'shildi');
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const handleModel = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await adminCreatePhoneModel({
        series: Number(modelForm.series),
        name: modelForm.name,
        year: modelForm.year ? Number(modelForm.year) : null,
        is_popular: modelForm.is_popular,
        order: Number(modelForm.order),
      });
      invalidate(); setShowModelForm(false); setModelForm({ series: '', name: '', year: '', is_popular: false, order: 0 });
      toast.success('Model qo\'shildi');
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const deleteBrand = async (id: number, name: string) => {
    if (!confirm(`"${name}" brendini o'chirishni tasdiqlaysizmi? Barcha seriya va modellari ham o'chadi.`)) return;
    try { await adminDeletePhoneBrand(id); invalidate(); toast.success('Brend o\'chirildi'); }
    catch (err) { toast.error(extractErrorMessage(err)); }
  };
  const deleteSeries = async (id: number, name: string) => {
    if (!confirm(`"${name}" seriyasini o'chirishni tasdiqlaysizmi?`)) return;
    try { await adminDeletePhoneSeries(id); invalidate(); toast.success('Seriya o\'chirildi'); }
    catch (err) { toast.error(extractErrorMessage(err)); }
  };
  const deleteModel = async (id: number, name: string) => {
    if (!confirm(`"${name}" modelini o'chirishni tasdiqlaysizmi?`)) return;
    try { await adminDeletePhoneModel(id); invalidate(); toast.success('Model o\'chirildi'); }
    catch (err) { toast.error(extractErrorMessage(err)); }
  };

  const allSeries = brands.flatMap((b) => b.series.map((s) => ({ ...s, brandName: b.name })));

  if (isLoading) return <div className="py-16 text-center text-on-surface-variant">Yuklanmoqda…</div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowBrandForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Brend qo'shish
        </button>
        <button onClick={() => setShowSeriesForm(true)}
          className="flex items-center gap-1.5 rounded-xl border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Seriya qo'shish
        </button>
        <button onClick={() => setShowModelForm(true)}
          className="flex items-center gap-1.5 rounded-xl border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">smartphone</span>
          Model qo'shish
        </button>
      </div>

      {/* Brand Tree */}
      <PhoneTree
        brands={brands}
        renderBrandExtra={(b) => (
          <button onClick={() => deleteBrand(b.id, b.name)}
            className="rounded-lg p-1.5 text-error hover:bg-error/10" title="O'chirish">
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
        renderSeriesExtra={(s) => (
          <button onClick={() => deleteSeries(s.id, s.name)}
            className="rounded-lg p-1.5 text-error hover:bg-error/10" title="O'chirish">
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        )}
        renderModelExtra={(m) => (
          <button onClick={() => deleteModel(m.id, m.full_name)}
            className="rounded-lg p-1 text-error hover:bg-error/10" title="O'chirish">
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        )}
      />

      {/* ── Brand Form Modal ── */}
      {showBrandForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-on-surface">Yangi brend</h3>
            <form onSubmit={handleBrand} className="space-y-3">
              <input required placeholder="Brend nomi (Apple, Samsung…)" value={brandForm.name}
                onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="bp" checked={brandForm.is_popular}
                  onChange={(e) => setBrandForm({ ...brandForm, is_popular: e.target.checked })} />
                <label htmlFor="bp" className="text-sm text-on-surface">Mashhur brend</label>
              </div>
              <input type="number" placeholder="Tartib (0, 1, 2…)" value={brandForm.order}
                onChange={(e) => setBrandForm({ ...brandForm, order: Number(e.target.value) })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowBrandForm(false)}
                  className="flex-1 rounded-xl border border-outline py-2 text-sm text-on-surface hover:bg-surface-container">
                  Bekor
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Series Form Modal ── */}
      {showSeriesForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-on-surface">Yangi seriya</h3>
            <form onSubmit={handleSeries} className="space-y-3">
              <select required value={seriesForm.brand}
                onChange={(e) => setSeriesForm({ ...seriesForm, brand: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary">
                <option value="">Brendni tanlang</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input required placeholder="Seriya nomi (iPhone 15, Galaxy S24…)" value={seriesForm.name}
                onChange={(e) => setSeriesForm({ ...seriesForm, name: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <input type="number" placeholder="Tartib" value={seriesForm.order}
                onChange={(e) => setSeriesForm({ ...seriesForm, order: Number(e.target.value) })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowSeriesForm(false)}
                  className="flex-1 rounded-xl border border-outline py-2 text-sm text-on-surface hover:bg-surface-container">
                  Bekor
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Model Form Modal ── */}
      {showModelForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-on-surface">Yangi model</h3>
            <form onSubmit={handleModel} className="space-y-3">
              <select required value={modelForm.series}
                onChange={(e) => setModelForm({ ...modelForm, series: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary">
                <option value="">Seriyani tanlang</option>
                {allSeries.map((s) => (
                  <option key={s.id} value={s.id}>{s.brandName} — {s.name}</option>
                ))}
              </select>
              <input placeholder="Variant nomi (Pro, Pro Max, Ultra, bo'sh=standart)" value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <input type="number" placeholder="Chiqarilgan yil (2023, 2024…)" value={modelForm.year}
                onChange={(e) => setModelForm({ ...modelForm, year: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="mp" checked={modelForm.is_popular}
                  onChange={(e) => setModelForm({ ...modelForm, is_popular: e.target.checked })} />
                <label htmlFor="mp" className="text-sm text-on-surface">Mashhur model (★)</label>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowModelForm(false)}
                  className="flex-1 rounded-xl border border-outline py-2 text-sm text-on-surface hover:bg-surface-container">
                  Bekor
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-tab 2: Product Compatibility Manager ──────────────────────────────────
const ProductCompatibilityManager = () => {
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState('');
  const [bulkSeriesId, setBulkSeriesId] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Product search
  const { data: productData } = useQuery({
    queryKey: ['admin-products-compat-search', productSearch],
    queryFn: () =>
      adminGetProducts({ q: productSearch, page_size: 12 }).then((r) => r.data),
    enabled: productSearch.length >= 1,
  });
  const productResults: AdminProduct[] = productData?.results ?? [];

  // Phone brands
  const { data: brands = [] } = useQuery<CPhoneBrand[]>({
    queryKey: ['admin-phone-brands'],
    queryFn: () => adminGetPhoneBrands().then((r) => r.data?.results ?? r.data),
  });
  const allSeries = brands.flatMap((b) => b.series.map((s) => ({ ...s, brandName: b.name })));

  // Current compatibility for selected product
  const { data: compatList = [], refetch: refetchCompat } = useQuery<CCompatEntry[]>({
    queryKey: ['admin-product-compat', selectedProduct?.id],
    queryFn: () =>
      adminGetProductCompatibility(selectedProduct!.id).then((r) => r.data),
    enabled: !!selectedProduct,
  });
  const existingIds = useMemo(() => new Set(compatList.map((c) => c.phone_model.id)), [compatList]);

  const resetSelection = () => { setCheckedIds(new Set()); setNotes(''); };

  const toggleModel = (id: number) =>
    setCheckedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handleAdd = async () => {
    if (!selectedProduct || checkedIds.size === 0) return;
    setSaving(true);
    try {
      const res = await adminAddProductCompatibility(selectedProduct.id, {
        phone_model_ids: [...checkedIds],
        notes,
      });
      toast.success(`${res.data.added} ta model qo'shildi`);
      resetSelection();
      refetchCompat();
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const handleBulkSeries = async () => {
    if (!selectedProduct || !bulkSeriesId) return;
    setSaving(true);
    try {
      const res = await adminBulkAddCompatibilitySeries(selectedProduct.id, {
        series_id: Number(bulkSeriesId),
        notes: bulkNotes,
      });
      toast.success(`${res.data.added} ta model qo'shildi (${res.data.series})`);
      setBulkSeriesId(''); setBulkNotes('');
      refetchCompat();
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const handleRemove = async (entry: CCompatEntry) => {
    if (!selectedProduct) return;
    try {
      await adminRemoveProductCompatibility(selectedProduct.id, {
        phone_model_ids: [entry.phone_model.id],
      });
      toast.success(`${entry.phone_model.full_name} o'chirildi`);
      refetchCompat();
    } catch (err) { toast.error(extractErrorMessage(err)); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Left: Product selector ── */}
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-on-surface">
            Mahsulot tanlang
          </label>
          <input
            placeholder="Mahsulot nomi bo'yicha qidiring…"
            value={productSearch}
            onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); resetSelection(); }}
            className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
          />
        </div>

        {/* Search results */}
        {!selectedProduct && productResults.length > 0 && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest divide-y divide-outline-variant/40 max-h-72 overflow-y-auto">
            {productResults.map((p) => (
              <button key={p.id} onClick={() => { setSelectedProduct(p); setProductSearch(p.name); resetSelection(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-container">
                {p.main_image && (
                  <img src={p.main_image} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-on-surface">{p.name}</p>
                  <p className="text-xs text-on-surface-variant">{p.price?.toLocaleString()} so'm</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected product info */}
        {selectedProduct && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              {selectedProduct.main_image && (
                <img src={selectedProduct.main_image} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-medium text-on-surface">{selectedProduct.name}</p>
                <p className="text-sm text-on-surface-variant">ID: {selectedProduct.id}</p>
              </div>
              <button onClick={() => { setSelectedProduct(null); setProductSearch(''); resetSelection(); }}
                className="rounded-lg p-1 hover:bg-error/10 text-on-surface-variant hover:text-error">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Current compatible models */}
        {selectedProduct && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-on-surface">
                Hozirgi mosliklar
                <span className="ml-2 rounded-full bg-secondary/10 px-2 py-0.5 text-xs text-secondary">
                  {compatList.length}
                </span>
              </h4>
            </div>
            {compatList.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant py-6 text-center text-sm text-on-surface-variant">
                Hech qanday moslik belgilanmagan
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {compatList.map((c) => (
                  <span key={c.id}
                    className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-3 py-1 text-xs text-on-surface">
                    {c.phone_model.full_name}
                    {c.notes && <span className="text-on-surface-variant">· {c.notes}</span>}
                    <button onClick={() => handleRemove(c)}
                      className="ml-0.5 text-error hover:text-error/70" title="O'chirish">
                      <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bulk add by series */}
        {selectedProduct && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
            <h4 className="text-sm font-medium text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">bolt</span>
              Seriya bo'yicha barchasini qo'shish
            </h4>
            <select value={bulkSeriesId} onChange={(e) => setBulkSeriesId(e.target.value)}
              className="w-full rounded-xl border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary">
              <option value="">Seriyani tanlang…</option>
              {allSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.brandName} — {s.name} ({s.models.length} model)
                </option>
              ))}
            </select>
            <input placeholder="Izoh (ixtiyoriy): 'Asl ekran', 'A tipli'…" value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              className="w-full rounded-xl border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
            <button onClick={handleBulkSeries} disabled={!bulkSeriesId || saving}
              className="w-full rounded-xl bg-secondary py-2.5 text-sm font-medium text-on-secondary hover:bg-secondary/90 disabled:opacity-40">
              {saving ? 'Qo\'shilmoqda…' : 'Seriyani barchasini qo\'shish'}
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Model checkboxes ── */}
      <div className="space-y-4">
        {!selectedProduct ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-outline-variant">
            <div className="text-center">
              <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant/40">
                phonelink
              </span>
              <p className="text-sm text-on-surface-variant">
                Mahsulot tanlang, keyin<br />mos telefonlarni belgilang
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-on-surface">
                Moslik qo'shish
                {checkedIds.size > 0 && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {checkedIds.size} tanlandi
                  </span>
                )}
              </h4>
              {checkedIds.size > 0 && (
                <button onClick={resetSelection} className="text-xs text-on-surface-variant hover:text-on-surface">
                  Bekor
                </button>
              )}
            </div>

            <PhoneTree
              brands={brands}
              checkable
              checkedIds={checkedIds}
              existingIds={existingIds}
              onToggleModel={toggleModel}
            />

            {checkedIds.size > 0 && (
              <div className="sticky bottom-0 rounded-2xl border border-outline-variant bg-surface p-4 shadow-lg space-y-3">
                <input placeholder="Izoh (ixtiyoriy): 'Faqat eSIM versiyasi'…" value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
                <button onClick={handleAdd} disabled={saving}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : `${checkedIds.size} ta modelga moslik qo'shish`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Main CompatibilityTab ─────────────────────────────────────────────────────
const CompatibilityTab = () => {
  const [subTab, setSubTab] = useState<CompatSubTab>('models');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-h3 text-h3 text-on-surface">Moslik Matritsasi</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Telefon modellarini boshqaring va mahsulotlarga mos keladigan qurilmalarni belgilang.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-container-low p-1 w-fit">
        {([
          { key: 'models',   label: 'Telefon modellari', icon: 'smartphone' },
          { key: 'products', label: 'Mahsulot mosliqlari', icon: 'link' },
        ] as { key: CompatSubTab; label: string; icon: string }[]).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              subTab === key
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'models'   && <PhoneModelsManager />}
      {subTab === 'products' && <ProductCompatibilityManager />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// StaffTab — Xodimlar boshqaruvi (faqat Super Admin)
// ─────────────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  role: StaffRole;
  role_display: string;
  is_active: boolean;
  date_joined: string;
}

const ROLES_LIST: { value: StaffRole | ''; label: string }[] = [
  { value: 'admin',   label: 'Admin' },
  { value: 'seller',  label: 'Sotuvchi' },
  { value: 'courier', label: 'Kuryer' },
  { value: '',        label: '— Rolni olib tashlash —' },
];

const StaffTab = () => {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'seller' | 'courier' | ''>('admin');
  const [fireTarget, setFireTarget] = useState<StaffMember | null>(null);

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ['admin-staff'],
    queryFn: () => adminGetStaff().then(r => r.data.results ?? r.data),
  });

  const assignMut = useMutation({
    mutationFn: (data: { phone: string; role: string }) => adminAssignRole(data),
    onSuccess: (res) => {
      const d = res.data;
      const label = d.new_role ? (ROLE_LABELS[d.new_role] || d.new_role) : 'Rol olib tashlandi';
      toast.success(`${d.phone} → ${label}`);
      setPhone('');
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
    },
  });

  const fireMut = useMutation({
    mutationFn: (id: number) => adminFireStaff(id),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Xodim ishdan bo\'shatildi');
      setFireTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
      setFireTarget(null);
    },
  });

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { toast.error("Telefon raqam kiriting"); return; }
    assignMut.mutate({ phone: phone.trim(), role: selectedRole });
  };

  return (
    <div className='flex flex-col gap-xl'>
      <div>
        <h2 className='text-h2 font-h2 text-on-surface'>Xodimlar boshqaruvi</h2>
        <p className='text-body-sm text-on-surface-variant mt-1'>
          Foydalanuvchilarga rol bering yoki rolni olib tashlang.
        </p>
      </div>

      {/* Rol berish formasi */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant p-6'>
        <h3 className='text-label-lg font-semibold text-on-surface mb-4'>Rol berish / o'zgartirish</h3>
        <form onSubmit={handleAssign} className='flex flex-col sm:flex-row gap-3'>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder='+998901234567'
            className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none'
          />
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value as 'admin' | 'seller' | 'courier' | '')}
            className='rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none'
          >
            {ROLES_LIST.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            type='submit'
            disabled={assignMut.isPending}
            className='rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50'
          >
            {assignMut.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </form>
      </div>

      {/* Xodimlar ro'yxati */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden'>
        <div className='px-6 py-4 border-b border-outline-variant flex items-center justify-between'>
          <h3 className='text-label-lg font-semibold text-on-surface'>
            Joriy xodimlar
          </h3>
          <span className='text-body-sm text-on-surface-variant'>{staffList.length} ta xodim</span>
        </div>

        {isLoading ? (
          <div className='p-6 flex flex-col gap-3'>
            {[1,2,3].map(i => <div key={i} className='h-14 bg-surface-container rounded-xl animate-pulse' />)}
          </div>
        ) : staffList.length === 0 ? (
          <div className='p-10 text-center text-on-surface-variant text-body-sm'>
            Hali xodim yo'q. Yuqoridagi forma orqali rol bering.
          </div>
        ) : (
          <div className='divide-y divide-outline-variant'>
            {staffList.map(member => (
              <div key={member.id} className='flex items-center justify-between px-6 py-4 hover:bg-surface-container/50'>
                <div className='flex items-center gap-3'>
                  <div className='w-10 h-10 rounded-full bg-surface-container flex items-center justify-center'>
                    <span className='material-symbols-outlined text-[20px] text-on-surface-variant'>person</span>
                  </div>
                  <div>
                    <p className='text-sm font-semibold text-on-surface'>
                      {member.first_name || member.last_name
                        ? `${member.first_name} ${member.last_name}`.trim()
                        : member.phone}
                    </p>
                    <p className='text-xs text-on-surface-variant'>{member.phone}</p>
                  </div>
                </div>
                <div className='flex items-center gap-3'>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ROLE_COLORS[member.role] || 'bg-surface-container text-on-surface-variant'}`}>
                    {ROLE_LABELS[member.role] || member.role_display}
                  </span>
                  <button
                    onClick={() => setFireTarget(member)}
                    className='flex items-center gap-1 rounded-lg border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/20 transition-colors'
                    title="Ishdan bo'shatish"
                  >
                    <span className='material-symbols-outlined text-[14px]'>person_off</span>
                    Bo'shatish
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ishdan bo'shatish confirmation dialog */}
      {fireTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
          <div className='bg-surface rounded-3xl border border-outline-variant p-6 max-w-sm w-full shadow-2xl'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='w-12 h-12 rounded-full bg-error/15 flex items-center justify-center flex-shrink-0'>
                <span className='material-symbols-outlined text-error text-[24px]'>warning</span>
              </div>
              <div>
                <h3 className='text-label-lg font-bold text-on-surface'>Ishdan bo'shatish</h3>
                <p className='text-xs text-on-surface-variant mt-0.5'>Bu amalni ortga qaytarib bo'lmaydi</p>
              </div>
            </div>

            <p className='text-body-md text-on-surface mb-1'>
              <span className='font-semibold'>{fireTarget.phone}</span> ni ishdan bo'shatmoqchimisiz?
            </p>
            <p className='text-body-sm text-on-surface-variant mb-6'>
              Xodim <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${ROLE_COLORS[fireTarget.role]}`}>
                {ROLE_LABELS[fireTarget.role]}
              </span> rolidan mahrum bo'ladi va barcha aktiv tokenlari darhol bekor qilinadi.
            </p>

            <div className='flex gap-3'>
              <button
                onClick={() => setFireTarget(null)}
                disabled={fireMut.isPending}
                className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50'
              >
                Bekor qilish
              </button>
              <button
                onClick={() => fireMut.mutate(fireTarget.id)}
                disabled={fireMut.isPending}
                className='flex-1 rounded-xl bg-error px-4 py-2.5 text-sm font-semibold text-on-error hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2'
              >
                {fireMut.isPending
                  ? <><span className='w-4 h-4 border-2 border-on-error/30 border-t-on-error rounded-full animate-spin' /> Bo'shatilmoqda...</>
                  : <><span className='material-symbols-outlined text-[16px]'>person_off</span> Ha, bo'shatish</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rol izohlari */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        {/* Super Admin — tayinlab bo'lmaydi, ma'lumot sifatida ko'rsatiladi */}
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['super_admin']} opacity-60`}>
          <div className='flex items-center gap-2 mb-1'>
            <p className='text-sm font-bold'>Super Admin</p>
            <span className='text-[10px] bg-error/20 text-error rounded-full px-2 py-0.5'>Tayinlab bo'lmaydi</span>
          </div>
          <p className='text-xs opacity-70'>Barcha huquqlar. Tizim yaratuvchisi. Faqat 1 dona bo'ladi.</p>
        </div>
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['admin'] || ''}`}>
          <p className='text-sm font-bold mb-1'>Admin</p>
          <p className='text-xs opacity-70'>Mahsulot, kategoriya, buyurtma, kassa, hisobot, banner, moslik.</p>
        </div>
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['seller'] || ''}`}>
          <p className='text-sm font-bold mb-1'>Sotuvchi</p>
          <p className='text-xs opacity-70'>POS savdo, buyurtma tasdiqlash, ombor ko'rish.</p>
        </div>
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['courier'] || ''}`}>
          <p className='text-sm font-bold mb-1'>Kuryer</p>
          <p className='text-xs opacity-70'>Buyurtmalarni ko'rish va yetkazib berildi deb belgilash.</p>
        </div>
      </div>
    </div>
  );
};

// MastersTab — Ustalar boshqaruvi (faqat Super Admin)
// ─────────────────────────────────────────────────────────────────────────────

interface MasterUser {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_master: boolean;
  is_active: boolean;
  date_joined: string;
}

const MastersTab = () => {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [removeTarget, setRemoveTarget] = useState<MasterUser | null>(null);
  const [discountInput, setDiscountInput] = useState('');

  const { data: masterList = [], isLoading } = useQuery<MasterUser[]>({
    queryKey: ['admin-masters'],
    queryFn: () => adminGetMasters().then(r => r.data.results ?? r.data),
  });

  const { data: discountPct = 5 } = useQuery<number>({
    queryKey: ['admin-master-discount'],
    queryFn: () => adminGetMasterDiscount().then(r => r.data.percent),
  });

  // Saqlangan foiz o'zgarsa, input maydonini sinxronlaymiz (faqat foydalanuvchi
  // hali tahrir qilmagan bo'lsa).
  useEffect(() => {
    setDiscountInput(String(discountPct));
  }, [discountPct]);

  const assignMut = useMutation({
    mutationFn: (data: { phone: string }) => adminAssignMaster(data),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Usta qo\'shildi');
      setPhone('');
      qc.invalidateQueries({ queryKey: ['admin-masters'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => adminRemoveMaster(id),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Usta olib tashlandi');
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-masters'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
      setRemoveTarget(null);
    },
  });

  const discountMut = useMutation({
    mutationFn: (percent: number) => adminSetMasterDiscount(percent),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Chegirma foizi saqlandi');
      qc.invalidateQueries({ queryKey: ['admin-master-discount'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
    },
  });

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { toast.error('Telefon raqam kiriting'); return; }
    assignMut.mutate({ phone: phone.trim() });
  };

  const handleSaveDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    const pct = Number(discountInput);
    if (Number.isNaN(pct) || pct < 0 || pct > 90) {
      toast.error("Foiz 0 va 90 oralig'ida bo'lishi kerak");
      return;
    }
    discountMut.mutate(pct);
  };

  const dirty = String(discountPct) !== discountInput.trim();

  // Foizni chiroyli ko'rsatish: 4 → "4", 3.75 → "3.75", 2.5 → "2.5"
  const fmtPct = (n: number) => String(Math.round(n * 100) / 100);

  return (
    <div className='flex flex-col gap-xl'>
      <div>
        <h2 className='text-h2 font-h2 text-on-surface'>Ustalar boshqaruvi</h2>
        <p className='text-body-sm text-on-surface-variant mt-1'>
          Ustalar <span className='font-semibold text-primary'>{discountPct}% gacha chegirma</span> oladi
          (chegirmadagi mahsulotlardan ham). Foiz ustaning xarid faolligiga qarab dinamik o'zgaradi.
        </p>
      </div>

      {/* Chegirma foizini sozlash */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant p-6'>
        <div className='flex items-center gap-2 mb-1'>
          <span className='material-symbols-outlined text-primary text-[20px]'>percent</span>
          <h3 className='text-label-lg font-semibold text-on-surface'>Chegirma foizi</h3>
        </div>
        <p className='text-body-sm text-on-surface-variant mb-4'>
          Bu foiz barcha ustalarga qo'llaniladi. O'zgartirilsa, darhol kuchga kiradi.
        </p>
        <form onSubmit={handleSaveDiscount} className='flex flex-col sm:flex-row gap-3 sm:items-center'>
          <div className='relative flex-1 max-w-[200px]'>
            <input
              type='number'
              min={0}
              max={90}
              step='0.1'
              value={discountInput}
              onChange={e => setDiscountInput(e.target.value)}
              className='w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 pr-10 text-sm text-on-surface focus:border-primary focus:outline-none'
            />
            <span className='absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm font-semibold'>%</span>
          </div>
          <button
            type='submit'
            disabled={discountMut.isPending || !dirty}
            className='rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 flex items-center gap-2 w-fit'
          >
            {discountMut.isPending
              ? <><span className='w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin' /> Saqlanmoqda...</>
              : <><span className='material-symbols-outlined text-[16px]'>save</span> Saqlash</>
            }
          </button>
        </form>
      </div>

      {/* Usta qo'shish */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant p-6'>
        <h3 className='text-label-lg font-semibold text-on-surface mb-4'>Usta qo'shish</h3>
        <form onSubmit={handleAssign} className='flex flex-col sm:flex-row gap-3'>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder='+998901234567'
            className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none'
          />
          <button
            type='submit'
            disabled={assignMut.isPending}
            className='rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 flex items-center gap-2'
          >
            {assignMut.isPending
              ? <><span className='w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin' /> Qo'shilmoqda...</>
              : <><span className='material-symbols-outlined text-[16px]'>construction</span> Usta qilish</>
            }
          </button>
        </form>
      </div>

      {/* Faollikka asoslangan chegirma izohi */}
      <div className='bg-primary/8 rounded-2xl border border-primary/20 p-5'>
        <div className='flex items-start gap-4 mb-4'>
          <div className='w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0'>
            <span className='material-symbols-outlined text-primary text-[20px]'>insights</span>
          </div>
          <div>
            <p className='text-sm font-semibold text-on-surface mb-1'>Faollikka asoslangan chegirma (4 pog'onali)</p>
            <p className='text-xs text-on-surface-variant leading-relaxed'>
              Bazaviy foiz ({fmtPct(discountPct)}%) ustaning xarid faolligiga qarab dinamik o'zgaradi —
              qaysi foiz kiritsangiz ham (3%, 4%, 5%...) shunga proporsional moslashadi.
              Quyidagi jadval <span className='font-medium text-on-surface'>"shift"</span> (eng yuqori
              erishish mumkin bo'lgan daraja)ni ko'rsatadi.
            </p>
          </div>
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs'>
          {[
            ['Har kuni (0–1 kun)', `${fmtPct(discountPct)}%`, '100%'],
            ['2 kunda bir', `${fmtPct(discountPct * 0.75)}%`, '¾'],
            ['3–4 kunda bir', `${fmtPct(discountPct * 0.5)}%`, '½'],
            ['5–6 kun sust', `${fmtPct(discountPct * 0.25)}%`, '¼'],
            ['Haftada bir / 10 kun', "oddiy narx", '0'],
            ['Yangi usta', `${fmtPct(discountPct)}%`, 'xush kelibsiz'],
          ].map(([label, val, ratio]) => (
            <div key={label} className='flex items-center justify-between gap-2 bg-surface-container-lowest/60 rounded-lg px-3 py-2 border border-outline-variant/40'>
              <span className='text-on-surface-variant'>{label}</span>
              <span className='flex items-center gap-1.5'>
                <span className='text-[10px] text-on-surface-variant/70'>{ratio}</span>
                <span className='font-semibold text-on-surface'>{val}</span>
              </span>
            </div>
          ))}
        </div>
        {/* Adolatli tiklanish + yumshoq qo'nish */}
        <div className='mt-3 flex items-start gap-2 text-xs text-on-surface-variant bg-surface-container-lowest/60 rounded-lg px-3 py-2.5 border border-outline-variant/40'>
          <span className='material-symbols-outlined text-[16px] text-primary mt-px'>trending_up</span>
          <p className='leading-relaxed'>
            <span className='font-medium text-on-surface'>Adolatli tiklanish:</span> sustlikda chegirma
            tez pasayadi, lekin <span className='font-medium text-on-surface'>bir zumda qaytmaydi</span> —
            har kungi xarid darajani bittadan ko'taradi.
            <br />
            <span className='font-medium text-on-surface'>Yumshoq qo'nish:</span> ilgari sodiq bo'lgan usta
            hafta/10 kun tanaffusdan keyin <span className='font-medium text-on-surface'>0 ga emas, avvalgi darajasining yarmidan</span> qaytadi
            (≤14 kun → ½, 15–28 kun → ¼, keyin noldan). Masalan to'liq {fmtPct(discountPct)}% edi →
            qaytishda {fmtPct(discountPct / 2)}% → {fmtPct(discountPct * 0.75)}% → {fmtPct(discountPct)}% (2 kunda to'liq).
            Tasodifiy (¾ darajaga chiqmagan) xaridor esa oddiy 0% dan tiklanadi.
          </p>
        </div>
      </div>

      {/* Ustalar ro'yxati */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden'>
        <div className='px-6 py-4 border-b border-outline-variant flex items-center justify-between'>
          <h3 className='text-label-lg font-semibold text-on-surface'>Joriy ustalar</h3>
          <span className='text-body-sm text-on-surface-variant'>{masterList.length} ta usta</span>
        </div>

        {isLoading ? (
          <div className='p-6 flex flex-col gap-3'>
            {[1, 2, 3].map(i => <div key={i} className='h-14 bg-surface-container rounded-xl animate-pulse' />)}
          </div>
        ) : masterList.length === 0 ? (
          <div className='p-10 text-center text-on-surface-variant text-body-sm'>
            Hali usta yo'q. Yuqoridagi forma orqali qo'shing.
          </div>
        ) : (
          <div className='divide-y divide-outline-variant'>
            {masterList.map(master => (
              <div key={master.id} className='flex items-center justify-between px-6 py-4 hover:bg-surface-container/50'>
                <div className='flex items-center gap-3'>
                  <div className='w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center'>
                    <span className='material-symbols-outlined text-[20px] text-primary'>construction</span>
                  </div>
                  <div>
                    <p className='text-sm font-semibold text-on-surface'>
                      {master.full_name !== master.phone ? master.full_name : master.phone}
                    </p>
                    <p className='text-xs text-on-surface-variant'>{master.phone}</p>
                  </div>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='rounded-full px-3 py-1 text-xs font-semibold bg-primary/15 text-primary border border-primary/20'>
                    {discountPct}% chegirma
                  </span>
                  <button
                    onClick={() => setRemoveTarget(master)}
                    className='flex items-center gap-1 rounded-lg border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/20 transition-colors'
                    title="Ustadan olib tashlash"
                  >
                    <span className='material-symbols-outlined text-[14px]'>person_off</span>
                    Olib tashlash
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Olib tashlash confirmation dialog */}
      {removeTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
          <div className='bg-surface rounded-3xl border border-outline-variant p-6 max-w-sm w-full shadow-2xl'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='w-12 h-12 rounded-full bg-error/15 flex items-center justify-center flex-shrink-0'>
                <span className='material-symbols-outlined text-error text-[24px]'>warning</span>
              </div>
              <div>
                <h3 className='text-label-lg font-bold text-on-surface'>Ustadan olib tashlash</h3>
                <p className='text-xs text-on-surface-variant mt-0.5'>Chegirma huquqi bekor qilinadi</p>
              </div>
            </div>
            <p className='text-body-md text-on-surface mb-6'>
              <span className='font-semibold'>{removeTarget.phone}</span> ni usta ro'yxatidan olib tashlaysizmi?
              Keyingi xaridlarida <span className='font-semibold'>{discountPct}%</span> chegirma qo'llanilmaydi.
            </p>
            <div className='flex gap-3'>
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removeMut.isPending}
                className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50'
              >
                Bekor qilish
              </button>
              <button
                onClick={() => removeMut.mutate(removeTarget.id)}
                disabled={removeMut.isPending}
                className='flex-1 rounded-xl bg-error px-4 py-2.5 text-sm font-semibold text-on-error hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2'
              >
                {removeMut.isPending
                  ? <><span className='w-4 h-4 border-2 border-on-error/30 border-t-on-error rounded-full animate-spin' /> Olib tashlanmoqda...</>
                  : <><span className='material-symbols-outlined text-[16px]'>person_off</span> Ha, olib tashlash</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AuditLogTab — Phase 1.1
// Super Admin uchun audit log ko'rish UI. Backend: GET /api/admin/audit-logs/
// ─────────────────────────────────────────────────────────────────────────────

interface AuditLogRow {
  id: number;
  actor: number | null;
  actor_phone: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: number | null;
  data: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_OPTIONS = [
  { value: '', label: 'Barcha amallar' },
  { value: 'create', label: 'Yaratish' },
  { value: 'update', label: 'Yangilash' },
  { value: 'delete', label: "O'chirish" },
  { value: 'status', label: 'Status' },
  { value: 'login', label: 'Kirish' },
  { value: 'logout', label: 'Chiqish' },
];

const TARGET_TYPE_OPTIONS = [
  { value: '', label: 'Barcha turlar' },
  { value: 'Product', label: 'Mahsulot' },
  { value: 'Order', label: 'Buyurtma' },
  { value: 'User', label: 'Foydalanuvchi' },
  { value: 'Category', label: 'Kategoriya' },
  { value: 'Banner', label: 'Banner' },
];

const formatActionBadge = (action: string) => {
  const a = action.toLowerCase();
  if (a.includes('create')) return { tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: 'add_circle' };
  if (a.includes('delete')) return { tone: 'bg-red-500/15 text-red-700 dark:text-red-300', icon: 'delete' };
  if (a.includes('update') || a.includes('edit') || a.includes('patch')) return { tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: 'edit' };
  if (a.includes('login')) return { tone: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', icon: 'login' };
  if (a.includes('logout')) return { tone: 'bg-slate-500/15 text-slate-700 dark:text-slate-300', icon: 'logout' };
  return { tone: 'bg-primary/10 text-primary', icon: 'bolt' };
};

const formatLogDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
};

const AuditLogTab = () => {
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState('');
  const [actorDraft, setActorDraft] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-audit-logs', page, actor, action, targetType, targetId, dateFrom, dateTo],
    queryFn: () =>
      adminGetAuditLogs({
        actor: actor || undefined,
        action: action || undefined,
        target_type: targetType || undefined,
        target_id: targetId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: 25,
      }).then(
        (r) => r.data as { count: number; next: string | null; previous: string | null; results: AuditLogRow[] },
      ),
    placeholderData: (prev) => prev,
  });

  const rows: AuditLogRow[] = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const resetFilters = () => {
    setActor(''); setActorDraft(''); setAction(''); setTargetType('');
    setTargetId(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4'>
        <div className='flex items-center gap-3'>
          <span className='material-symbols-outlined fill-icon text-2xl text-primary'>fact_check</span>
          <div>
            <h2 className='text-base font-bold text-on-surface'>Audit log</h2>
            <p className='text-xs text-on-surface-variant'>
              Admin amallari tarixi — Jami: <span className='font-semibold text-on-surface'>{totalCount}</span>
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className='flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-50'
          >
            <span className={`material-symbols-outlined text-[18px] ${isFetching ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Yangilash
          </button>
          <button
            onClick={resetFilters}
            className='flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-high'
          >
            <span className='material-symbols-outlined text-[18px]'>filter_alt_off</span>
            Tozalash
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className='grid gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-2 lg:grid-cols-3'>
        <form
          className='flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2'
          onSubmit={(e) => {
            e.preventDefault();
            setActor(actorDraft.trim());
            setPage(1);
          }}
        >
          <span className='material-symbols-outlined text-[18px] text-on-surface-variant'>person_search</span>
          <input
            value={actorDraft}
            onChange={(e) => setActorDraft(e.target.value)}
            placeholder='Aktor ID yoki telefon...'
            className='flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60'
          />
          {actorDraft && (
            <button
              type='button'
              onClick={() => { setActorDraft(''); setActor(''); setPage(1); }}
            >
              <span className='material-symbols-outlined text-[16px] text-on-surface-variant'>close</span>
            </button>
          )}
        </form>

        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className='rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none'
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={targetType}
          onChange={(e) => { setTargetType(e.target.value); setPage(1); }}
          className='rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none'
        >
          {TARGET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          value={targetId}
          onChange={(e) => { setTargetId(e.target.value); setPage(1); }}
          placeholder='Maqsad ID'
          inputMode='numeric'
          className='rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60'
        />

        <div className='flex items-center gap-2'>
          <span className='text-xs text-on-surface-variant'>Dan:</span>
          <input
            type='date'
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className='flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none'
          />
        </div>

        <div className='flex items-center gap-2'>
          <span className='text-xs text-on-surface-variant'>Gacha:</span>
          <input
            type='date'
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className='flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none'
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className='flex h-48 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest'>
          <span className='material-symbols-outlined animate-spin text-[36px] text-primary'>progress_activity</span>
        </div>
      ) : isError ? (
        <div className='flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant'>
          <span className='material-symbols-outlined text-[48px] text-error'>error</span>
          <p className='text-sm'>Audit loglarni yuklab bo'lmadi. Faqat Super Admin uchun ruxsat etilgan.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className='flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant'>
          <span className='material-symbols-outlined text-[48px]'>fact_check</span>
          <p className='text-sm'>Tanlangan filtrlar bo'yicha yozuv topilmadi</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest'>
          <div className='hidden grid-cols-12 gap-3 border-b border-outline-variant bg-surface-container px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant lg:grid'>
            <span className='col-span-3'>Sana / IP</span>
            <span className='col-span-3'>Aktor</span>
            <span className='col-span-2'>Amal</span>
            <span className='col-span-3'>Maqsad</span>
            <span className='col-span-1 text-right'>Tafsilot</span>
          </div>

          <ul className='divide-y divide-outline-variant'>
            {rows.map((row) => {
              const badge = formatActionBadge(row.action);
              const isOpen = expandedId === row.id;
              return (
                <li key={row.id} className='p-4 text-sm transition-colors hover:bg-surface-container/50'>
                  <div className='grid grid-cols-1 gap-3 lg:grid-cols-12'>
                    <div className='lg:col-span-3'>
                      <p className='text-on-surface'>{formatLogDate(row.created_at)}</p>
                      {row.ip && (
                        <p className='text-[11px] text-on-surface-variant'>IP: {row.ip}</p>
                      )}
                    </div>

                    <div className='lg:col-span-3'>
                      {row.actor_phone || row.actor_name ? (
                        <>
                          <p className='font-semibold text-on-surface'>
                            {row.actor_name || row.actor_phone}
                          </p>
                          {row.actor_name && row.actor_phone && (
                            <p className='text-[11px] text-on-surface-variant'>{row.actor_phone}</p>
                          )}
                          {row.actor_role && (
                            <span className='mt-1 inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold text-on-secondary-container'>
                              {row.actor_role}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className='text-on-surface-variant'>—</span>
                      )}
                    </div>

                    <div className='lg:col-span-2'>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}>
                        <span className='material-symbols-outlined text-[14px]'>{badge.icon}</span>
                        {row.action}
                      </span>
                    </div>

                    <div className='lg:col-span-3'>
                      <p className='text-on-surface'>{row.target_type || '—'}</p>
                      {row.target_id != null && (
                        <p className='text-[11px] text-on-surface-variant'>ID: {row.target_id}</p>
                      )}
                    </div>

                    <div className='flex items-start justify-end lg:col-span-1'>
                      <button
                        onClick={() => setExpandedId(isOpen ? null : row.id)}
                        className='rounded-lg border border-outline-variant px-2 py-1 text-xs text-on-surface hover:bg-surface-container-high'
                      >
                        {isOpen ? 'Yashir' : "Ko'rish"}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className='mt-3 rounded-lg border border-outline-variant bg-surface-container p-3'>
                      {row.user_agent && (
                        <p className='mb-2 text-[11px] text-on-surface-variant'>
                          <span className='font-semibold'>User-Agent:</span> {row.user_agent}
                        </p>
                      )}
                      <p className='mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant'>
                        Diff / snapshot
                      </p>
                      <pre className='overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-container-lowest p-3 text-[11px] text-on-surface'>
                        {row.data ? JSON.stringify(row.data, null, 2) : '— bo\'sh —'}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm'>
          <p className='text-on-surface-variant'>
            Sahifa <span className='font-semibold text-on-surface'>{page}</span> / {totalPages}
          </p>
          <div className='flex items-center gap-2'>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className='flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-on-surface hover:bg-surface-container-high disabled:opacity-50'
            >
              <span className='material-symbols-outlined text-[16px]'>chevron_left</span>
              Oldingi
            </button>
            <button
              onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))}
              disabled={page >= totalPages}
              className='flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-on-surface hover:bg-surface-container-high disabled:opacity-50'
            >
              Keyingi
              <span className='material-symbols-outlined text-[16px]'>chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
