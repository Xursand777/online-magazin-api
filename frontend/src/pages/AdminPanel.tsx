import {
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
} from '../api/endpoints';
import {
  getOrderStatusBadge,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from '../utils/orderStatus';
import { toast } from '../utils/toast';
import ThemeToggle from '../components/ThemeToggle';

type AdminTab = 'products' | 'banners' | 'categories' | 'orders' | 'reports' | 'stock';

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
  created_at: string;
  receiver_name: string;
  receiver_phone: string;
  delivery_address: string;
  cancellation_reason: string;
  payment_method: string;
  payment?: { status: string; method: string; amount: string | number } | null;
  items: Array<{
    id: number;
    quantity: number;
    product_details?: { name: string; main_image?: string | null };
    variant_details?: { color?: string; quality?: string; model?: string; size?: string } | null;
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

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('products');
  const [productFilters, setProductFilters] = useState({
    q: '',
    category: '',
    status: '',
    tag: '',
    page: 1,
    page_size: 20,
  });
  const { logout, user } = useAuthStore();
  const resetCart = useCartStore((s) => s.resetCart);
  const navigate = useNavigate();
  const qc = useQueryClient();

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
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => adminGetOrders().then((r) => r.data),
  });
  const orders: AdminOrder[] = ordersData?.results || ordersData || [];

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

  return (
    <div className='min-h-screen bg-surface-container-low'>
      <header className='sticky top-0 z-50 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-6 py-3 shadow-sm'>
        <div className='flex items-center gap-3'>
          <span className='material-symbols-outlined fill-icon text-2xl text-primary'>
            admin_panel_settings
          </span>
          <span className='font-h3 text-h3 text-primary'>Bozor Admin</span>
        </div>
        <div className='flex items-center gap-4'>
          <span className='hidden text-body-sm text-on-surface-variant md:block'>
            {user?.phone}
          </span>
          <ThemeToggle />
          <button
            onClick={() => navigate('/')}
            className='flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary'
          >
            <span className='material-symbols-outlined text-[18px]'>open_in_new</span>Sayt
          </button>
          <button
            onClick={handleLogout}
            className='flex items-center gap-1 text-sm text-error hover:opacity-80'
          >
            <span className='material-symbols-outlined text-[18px]'>logout</span>Chiqish
          </button>
        </div>
      </header>
      <div className='mx-auto max-w-7xl px-4 py-6 md:px-8'>
        <div className='mb-6 flex gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-1'>
          {[
            { key: 'products', label: 'Mahsulotlar', icon: 'inventory_2' },
            { key: 'banners', label: 'Bannerlar', icon: 'view_carousel' },
            { key: 'categories', label: 'Kategoriyalar', icon: 'category' },
            { key: 'orders', label: 'Buyurtmalar', icon: 'local_shipping' },
            { key: 'stock', label: 'Ombor', icon: 'warehouse' },
            { key: 'reports', label: 'Hisobotlar', icon: 'bar_chart' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as AdminTab)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 font-label-md text-label-md transition-all ${activeTab === tab.key ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container'}`}
            >
              <span className='material-symbols-outlined text-[18px]'>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
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
        {activeTab === 'orders' && <OrdersTab loading={ordersLoading} orders={orders} />}
        {activeTab === 'stock' && <StockTab />}
        {activeTab === 'reports' && <ReportsTab />}
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


const ADMIN_ORDER_STATUS_OPTIONS = [
  { value: 'PENDING', label: "To'lov kutilmoqda" },
  { value: 'CONFIRMED', label: 'Rasmiylashtirildi' },
  { value: 'PACKING', label: "Yig'ilmoqda" },
  { value: 'SHIPPING', label: "Yo'lda" },
  { value: 'DELIVERED', label: 'Yetib keldi' },
  { value: 'CANCELLED_BY_ADMIN', label: 'Admin bekor qildi' },
];

const OrdersTab = ({ orders, loading }: { orders: AdminOrder[]; loading: boolean }) => {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, { status: string; note: string }>>({});
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
  if (loading)
    return (
      <div className='py-12 text-center text-on-surface-variant'>
        <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
          progress_activity
        </span>
        Buyurtmalar yuklanmoqda...
      </div>
    );
  if (orders.length === 0)
    return (
      <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
        <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
          local_shipping
        </span>
        <p className='font-h3 text-on-surface-variant'>Buyurtmalar yo'q</p>
      </div>
    );
  return (
    <div className='space-y-6'>
      <div>
        <h2 className='font-h3 text-h3 text-on-surface'>Buyurtmalar ({orders.length})</h2>
        <p className='mt-1 text-body-sm text-on-surface-variant'>
          Buyurtma statuslari, cancellation sababi va tarix shu bo'limda boshqariladi.
        </p>
      </div>
      <div className='space-y-4'>
        {orders.map((order) => {
          const draft = drafts[order.id] || {
            status: order.status,
            note: order.status.startsWith('CANCELLED') ? order.cancellation_reason || '' : '',
          };
          const lastHistory = order.history?.[order.history.length - 1];
          const hasDraftChanges =
            draft.status !== order.status ||
            draft.note !==
              (order.status.startsWith('CANCELLED') ? order.cancellation_reason || '' : '');
          return (
            <div
              key={order.id}
              className='rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm overflow-hidden'
            >
              <div className='border-b border-outline-variant bg-surface-container-low px-5 py-4'>
                <div className='flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between'>
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-h3 text-lg text-on-surface'>Buyurtma #{order.id}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getOrderStatusBadge(order.status)}`}
                      >
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </div>
                    <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-on-surface-variant'>
                      <span>{new Date(order.created_at).toLocaleString('uz-UZ')}</span>
                      <span>{order.receiver_name}</span>
                      <span>{order.receiver_phone}</span>
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-3 text-sm xl:min-w-[360px]'>
                    <div className='rounded-xl bg-surface-container-lowest p-3'>
                      <div className='text-xs text-on-surface-variant'>Jami</div>
                      <div className='mt-1 font-semibold text-primary'>
                        {formatMoney(order.total_price)} so'm
                      </div>
                    </div>
                    <div className='rounded-xl bg-surface-container-lowest p-3'>
                      <div className='text-xs text-on-surface-variant'>To'lov</div>
                      <div className='mt-1 font-medium text-on-surface'>
                        {order.payment
                          ? `${getPaymentStatusLabel(order.payment.status)} / ${order.payment.method}`
                          : "Yo'q"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
                                  ? ` • ${[item.variant_details.color, item.variant_details.quality, item.variant_details.model, item.variant_details.size].filter(Boolean).join(' / ')}`
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
                <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
                  <div className='mb-4'>
                    <h3 className='font-h3 text-lg text-on-surface'>Holatni boshqarish</h3>
                    <p className='mt-1 text-body-sm text-on-surface-variant'>
                      Zanjir bo'yicha yangilang. Cancellation uchun sabab yozib qoldiring.
                    </p>
                  </div>
                  <div className='space-y-4'>
                    <div>
                      <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                        Yangi status
                      </label>
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          updateDraft(order.id, 'status', e.target.value, order.status, draft.note)
                        }
                        className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
                      >
                        {ADMIN_ORDER_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                        Izoh / cancellation reason
                      </label>
                      <textarea
                        rows={4}
                        value={draft.note}
                        onChange={(e) =>
                          updateDraft(order.id, 'note', e.target.value, order.status, '')
                        }
                        className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
                        placeholder='Masalan: mahsulot tekshirildi, qadoqlash boshlandi yoki cancellation sababi.'
                      />
                    </div>
                    <button
                      type='button'
                      disabled={statusMutation.isPending || !hasDraftChanges}
                      onClick={() =>
                        statusMutation.mutate({
                          id: order.id,
                          status: draft.status,
                          note: draft.note.trim(),
                        })
                      }
                      className='w-full rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90 disabled:opacity-60'
                    >
                      {statusMutation.isPending ? 'Saqlanmoqda...' : 'Statusni saqlash'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
  const { data, isLoading, isError, refetch } = useQuery<AdminStockItem[]>({
    queryKey: ['admin-stock-report', params],
    queryFn: () => adminGetStockReport(params).then((r) => r.data),
    staleTime: 30_000,
  });
  const filteredItems = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.variant_info && item.variant_info.toLowerCase().includes(q)),
    );
  }, [data, search]);
  const fmt = (v: number) => Math.round(v).toLocaleString('uz-UZ');
  return (
    <div className='space-y-6'>
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
              ({filteredItems.length} ta pozitsiya)
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
interface ReportData {
  summary: ReportSummary;
  timeline: ReportTimeline[];
  products: ReportProduct[];
}

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR_START = `${new Date().getFullYear()}-01-01`;
const MONTH_START = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

const ReportsTab = () => {
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
      refetch();
    },
    onError: () => toast.error('Kursni yangilashda xatolik'),
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
          <div className='mr-4 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-highest px-4 py-2 shadow-sm'>
            <span className='material-symbols-outlined text-[20px] text-tertiary'>
              currency_exchange
            </span>
            {editingRate ? (
              <div className='flex items-center gap-2'>
                <input
                  type='number'
                  value={newRateValue}
                  onChange={(e) => setNewRateValue(e.target.value)}
                  className='w-24 rounded border border-outline bg-surface px-2 py-1 text-sm focus:outline-none'
                  placeholder='Kurs'
                  autoFocus
                />
                <button
                  onClick={() => updateRateMutation.mutate(newRateValue)}
                  disabled={updateRateMutation.isPending}
                  className='rounded bg-primary px-2 py-1 text-xs text-on-primary'
                >
                  OK
                </button>
                <button
                  onClick={() => setEditingRate(false)}
                  className='rounded bg-surface-variant px-2 py-1 text-xs text-on-surface-variant'
                >
                  X
                </button>
              </div>
            ) : (
              <div className='flex items-center gap-3'>
                <div className='text-sm'>
                  <span className='text-on-surface-variant'>Dollar kursi:</span>{' '}
                  <span className='font-bold text-on-surface'>
                    {rateData?.usd_rate ? rateData.usd_rate.toLocaleString() : '...'} so'm
                  </span>
                </div>
                <button
                  onClick={() => {
                    setNewRateValue(String(rateData?.usd_rate || ''));
                    setEditingRate(true);
                  }}
                  className='flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface-variant'
                >
                  <span className='material-symbols-outlined text-[16px] text-primary'>edit</span>
                </button>
              </div>
            )}
          </div>
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
      {data?.timeline && data.timeline.length > 0 && (
        <div className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
          <div className='border-b border-outline-variant bg-surface-container px-5 py-3'>
            <h3 className='font-semibold text-on-surface'>Vaqt Bo\'yicha Tushum</h3>
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[500px] text-left text-sm'>
              <thead className='bg-surface-container/60'>
                <tr>
                  {['Sana', 'Tushum', 'Chegirma', 'Buyurtmalar'].map((h) => (
                    <th
                      key={h}
                      className='px-5 py-2.5 font-semibold uppercase text-xs text-on-surface-variant'
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-outline-variant'>
                {data.timeline.map((row, i) => (
                  <tr key={i} className='hover:bg-surface-container/40'>
                    <td className='px-5 py-2.5 font-medium text-on-surface'>{row.date}</td>
                    <td className='px-5 py-2.5 font-semibold text-primary'>
                      {fmt(row.revenue)} so'm
                    </td>
                    <td className='px-5 py-2.5 text-[#f59e0b]'>{fmt(row.discount)} so'm</td>
                    <td className='px-5 py-2.5 text-on-surface-variant'>{row.count} ta</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
        <div className='border-b border-outline-variant bg-surface-container px-5 py-3'>
          <h3 className='font-semibold text-on-surface'>
            Tovarlar Bo\'yicha Statistika{' '}
            <span className='ml-2 text-sm font-normal text-on-surface-variant'>
              ({filteredProducts.length} ta)
            </span>
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
        ) : filteredProducts.length === 0 ? (
          <div className='py-16 text-center'>
            <span className='material-symbols-outlined mb-2 block text-5xl text-outline'>
              inventory_2
            </span>
            <p className='text-on-surface-variant'>Ma\'lumot topilmadi</p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[1200px] border-collapse text-left text-sm'>
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
                    key={`${p.id}-${p.quality}-${p.size}`}
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
        )}
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
    setForm(mapProductToForm(product));
    setVariants(mapProductVariants(product));
    setImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews({});
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
      const file = variantImageFiles[v.client_id];
      if (file) payload.append(`variant_image_${i}`, file);
    });
    payload.append(
      'variants_data',
      JSON.stringify(variantsPayload.map(({ client_id, ...v }) => v)),
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
              onVariantChange={handleVariantChange}
              onVariantPriceChange={handleVariantPriceChange}
              onVariantImageChange={handleVariantImageChange}
              onRemoveVariant={removeVariantAt}
              onGenerateSku={handleGenerateVariantSku}
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
  onVariantChange,
  onVariantPriceChange,
  onVariantImageChange,
  onRemoveVariant,
  onGenerateSku,
  onAddVariantToGroup,
}: {
  variants: VariantFormState[];
  variantImageFiles: Record<string, File | null>;
  variantImagePreviews: Record<string, string>;
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
                        Rang rasmi
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

export default AdminPanel;
