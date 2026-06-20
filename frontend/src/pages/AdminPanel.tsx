import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import {
  adminCreateBanner,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteBanner,
  adminDeleteCategory,
  adminDeleteProduct,
  adminGetBanners,
  adminGetCategories,
  adminGetProducts,
  adminUpdateBanner,
  adminGetDashboard,
} from '../api/endpoints';
import { ROLE_LABELS, ROLE_COLORS, type StaffRole } from '../store/authStore';
import {
  getOrderStatusBadge,
  getOrderStatusLabel,
} from '../utils/orderStatus';
import { toast } from '../utils/toast';
import { useShopInfo } from '../utils/shopInfoCache';
import { adminPollOrders } from '../api/endpoints';
import ThemeToggle from '../components/ThemeToggle';
import AdminPOS from '../components/AdminPOS';
import AdminProductImport from '../components/AdminProductImport';
// #N3: umumiy tiplar/yordamchilar AdminPanel monolitidan ajratildi (admin/shared).
import {
  MiniBadge, StatusBadge, ORDER_STATUS_COLORS,
  categoryLabel, dateTimeLocalToIso, extractErrorMessage, formatDate,
  formatMoney, formatPriceInput, mapBannerToForm, stripNumberFormatting,
} from './admin/shared';
import type {
  AdminBanner, AdminCategory, AdminPaginatedResponse, AdminProduct,
  BannerEditorState, BannerFormState, ProductEditorState,
} from './admin/shared';
import { ProductEditor } from './admin/ProductEditor';
import { OrdersTab } from './admin/OrdersTab';
import { ReportsTab } from './admin/ReportsTab';
import { StockTab } from './admin/StockTab';
import { KassaTab } from './admin/KassaTab';
import { UsersTab } from './admin/UsersTab';
import { FeedbackTab } from './admin/FeedbackTab';
import { NasiyaTab } from './admin/NasiyaTab';
import { StaffTab } from './admin/StaffTab';
import { MastersTab } from './admin/MastersTab';
import { AuditLogTab } from './admin/AuditLogTab';
import { SozlamalarTab } from './admin/SozlamalarTab';
import { CompatibilityTab } from './admin/CompatibilityTab';
import { _notNull } from './admin/shared';

type AdminTab = 'dashboard' | 'products' | 'banners' | 'categories' | 'orders' | 'users' | 'feedback' | 'reports' | 'stock' | 'pos' | 'kassa' | 'nasiya' | 'sozlamalar' | 'compatibility' | 'staff' | 'masters' | 'audit';

// Har bir tab qaysi rollar uchun ko'rinadi.
// ⭐ ADMIN roli FAQAT quyidagi 7 tabni ko'radi (qolganlari super-admin uchun):
//    Mahsulotlar, Kategoriyalar, Buyurtmalar, Kassa, Hisobotlar, Bannerlar, Moslik.
// SuperAdmin (is_superuser=True) — BARCHA tablar (canSeeTab birinchi qatorda true).
const TAB_ROLES: Partial<Record<AdminTab, StaffRole[]>> = {
  // ── ADMIN ko'radigan 7 tab ──
  products:      ['admin'],            // Mahsulotlar
  categories:    ['admin'],            // Kategoriyalar
  orders:        ['admin', 'seller', 'courier'],  // Buyurtmalar (sotuvchi/kuryer ham)
  kassa:         ['admin'],            // Kassa
  reports:       ['admin'],            // Hisobotlar
  banners:       ['admin'],            // Bannerlar
  compatibility: ['admin'],            // Moslik
  // ── ADMIN ko'rMAYDIGAN (faqat super-admin, [] = super-only) ──
  dashboard:     [],                   // Dashboard — faqat super
  users:         [],                   // Foydalanuvchilar — faqat super
  feedback:      [],                   // Fikrlar — faqat super
  nasiya:        [],                   // Nasiya — faqat super
  sozlamalar:    [],                   // Sozlamalar — faqat super
  staff:         [],                   // Xodimlar — faqat super
  masters:       [],                   // Ustalar — faqat super
  audit:         [],                   // Audit log — faqat super
  // ── Sotuvchi tablari (admin bularni ko'rMAYDI) ──
  pos:           ['seller'],           // POS — sotuvchi (admin yo'q)
  stock:         ['seller'],           // Ombor — sotuvchi (admin yo'q)
};

function canSeeTab(tab: AdminTab, role?: StaffRole | null, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin) return true;
  if (!role) return false;
  const allowed = TAB_ROLES[tab];
  if (!allowed) return true;
  return allowed.includes(role);
}





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

  // Lightweight poll — har 5 sekund. So'rov juda arzon (Max(id)+Count, PK index),
  // shuning uchun 5s "deyarli real-time" UX beradi, Render yukini ham oshirmaydi.
  const poll = useQuery({
    queryKey: ['admin-orders-poll', lastSeenId],
    queryFn: () => adminPollOrders(lastSeenId ?? 0).then((r) => r.data),
    refetchInterval: 5_000,               // 5 sekund — snappy real-time
    refetchIntervalInBackground: false,   // tab yashirin bo'lsa pause (battery/yuk)
    refetchOnWindowFocus: true,           // fokusga qaytsa darhol tekshir
    enabled: enabled && lastSeenId !== null,
  });

  const latestId = poll.data?.latest_id ?? 0;
  const newCount = poll.data?.new_count ?? 0;
  // KRITIK real-time signali — server'dagi eng so'nggi o'zgarish vaqti.
  // Bu qiymat o'zgarsa = biror buyurtma o'zgargan (status/kredit/yangi...).
  const lastUpdate = (poll.data as { last_update?: string } | undefined)?.last_update ?? null;

  // ── REAL-TIME REFETCH — HAR QANDAY o'zgarishda ro'yxatni yangilash ─────────
  // Avval faqat YANGI buyurtmada (latestId) refetch bo'lardi → status o'zgarishlari
  // abnovit qilmaguncha ko'rinmasdi. Endi last_update o'zgarsa darhol refetch.
  const lastUpdateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !lastUpdate) return;
    // Birinchi marta — baseline (mavjud holatni "o'zgargan" deb sanamaslik uchun)
    if (lastUpdateRef.current === null) {
      lastUpdateRef.current = lastUpdate;
      return;
    }
    if (lastUpdate !== lastUpdateRef.current) {
      lastUpdateRef.current = lastUpdate;
      // Active query'lar (har bir rolning Buyurtmalar tabi) avtomat refetch bo'ladi.
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-nasiya-summary'] });
    }
  }, [enabled, lastUpdate, qc]);

  // ── DETECTION — har bir yangi buyurtmani KAFOLATLI ushlash ─────────────────
  // lastNotifiedId: eslatma chiqarilgan eng katta order id. Bu badge'ning
  // lastSeenId'idan MUSTAQIL. Shuning uchun admin Orders tab'ida tursa ham
  // (lastSeenId doim yangilanib tursa ham), latestId oshishi bo'yicha har bir
  // yangi buyurtmada ovoz + toast + ro'yxat yangilanishi ISHLAYDI.
  const lastNotifiedId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || latestId <= 0) return;

    // Birinchi marta — baseline o'rnatamiz, mavjud buyurtmalar uchun eslatma yo'q
    if (lastNotifiedId.current === null) {
      lastNotifiedId.current = latestId;
      return;
    }

    if (latestId > lastNotifiedId.current) {
      // order id ketma-ket (autoincrement) — delta = yangi buyurtmalar soni
      const justArrived = latestId - lastNotifiedId.current;
      lastNotifiedId.current = latestId;

      // Faqat TOAST (ovoz yo'q — brauzer yuki/limit muammosisiz, yengil)
      toast.success(
        justArrived === 1
          ? '🛎 1 ta yangi buyurtma keldi!'
          : `🛎 ${justArrived} ta yangi buyurtma keldi!`,
        { duration: 6000 },
      );

      // Buyurtma REAL qo'shilishi uchun — ro'yxat + dashboard cache'larini
      // darhol invalidatsiya qilamiz (active query'lar avtomat refetch bo'ladi).
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['admin-nasiya-summary'] });
    }
  }, [enabled, latestId, qc]);

  // Admin Orders tab'ida bo'lsa — "ko'rildi" deb belgilaymiz (badge tushadi).
  // Detection lastNotifiedId orqali bo'lgani uchun bu uni BOSTIRMAYDI.
  useEffect(() => {
    if (isOnOrdersTab && latestId > 0) {
      setLastSeenId(latestId);
    }
  }, [isOnOrdersTab, latestId, setLastSeenId]);

  return {
    newCount,
    latestId,
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
    <div className='admin-shell min-h-screen bg-surface-container-low'>
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
  const [importOpen, setImportOpen] = useState(false);
  const qcProducts = useQueryClient();
  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Mahsulotlar ({totalCount})</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Tovar ma'lumotlari, rasm va variantlarni shu yerdan to'liq boshqaring.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            onClick={() => setImportOpen(true)}
            className='flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 font-label-md text-primary hover:bg-primary/20'
          >
            <span className='material-symbols-outlined text-[18px]'>upload_file</span>Excel / CSV import
          </button>
          <button
            onClick={() => setEditorState({ mode: 'create' })}
            className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
          >
            <span className='material-symbols-outlined text-[18px]'>add</span>Mahsulot qo'shish
          </button>
        </div>
      </div>
      {importOpen && (
        <AdminProductImport
          categories={categories}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            qcProducts.invalidateQueries({ queryKey: ['admin-products'] });
            qcProducts.invalidateQueries({ queryKey: ['products'] });
            qcProducts.invalidateQueries({ queryKey: ['mainPage'] });
          }}
        />
      )}
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
          {/* ── MOBIL KARTALAR (telefon) — jadval o'rniga ── */}
          <div className='divide-y divide-outline-variant md:hidden'>
            {products.map((product) => (
              <div key={product.id} className='flex gap-3 p-3'>
                <div className='h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
                  {product.main_image ? (
                    <img src={product.main_image} alt={product.name} className='h-full w-full object-cover' />
                  ) : (
                    <div className='flex h-full w-full items-center justify-center text-outline'>
                      <span className='material-symbols-outlined'>image</span>
                    </div>
                  )}
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='line-clamp-2 text-sm font-semibold text-on-surface'>{product.name}</div>
                  <div className='mt-0.5 text-xs text-on-surface-variant'>
                    {product.category_name || 'Biriktirilmagan'}
                  </div>
                  <div className='mt-1 flex flex-wrap items-center gap-x-2 text-xs'>
                    <span className='font-bold text-primary'>{formatMoney(product.price)} so'm</span>
                    <span className='text-on-surface-variant'>{product.stock} dona</span>
                    {(product.variants?.length ?? 0) > 0 && (
                      <span className='text-on-surface-variant'>{product.variants?.length} variant</span>
                    )}
                  </div>
                  <div className='mt-1.5 flex flex-wrap gap-1'>
                    <StatusBadge active={product.is_active} activeLabel='Faol' inactiveLabel='Yopiq' />
                    {product.is_new && <MiniBadge tone='primary'>Yangi</MiniBadge>}
                    {product.is_popular && <MiniBadge tone='secondary'>Ommabop</MiniBadge>}
                    {product.is_discount && <MiniBadge tone='tertiary'>Chegirma</MiniBadge>}
                  </div>
                </div>
                <div className='flex shrink-0 flex-col gap-1'>
                  <button
                    onClick={() => setEditorState({ mode: 'edit', product })}
                    className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
                    title='Tahrirlash'
                  >
                    <span className='material-symbols-outlined text-[20px]'>edit</span>
                  </button>
                  <button
                    onClick={() => setEditorState({ mode: 'create', product })}
                    className='rounded-lg p-2 text-on-surface-variant hover:bg-surface-container'
                    title='Nusxa olish (klonlash)'
                  >
                    <span className='material-symbols-outlined text-[20px]'>content_copy</span>
                  </button>
                  <button
                    onClick={() => onDelete(product.id)}
                    className='rounded-lg p-2 text-error hover:bg-error-container/20'
                    title="O'chirish"
                  >
                    <span className='material-symbols-outlined text-[20px]'>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* ── DESKTOP JADVAL ── */}
          <div className='hidden overflow-x-auto md:block'>
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
                          onClick={() => setEditorState({ mode: 'create', product })}
                          className='rounded-lg p-2 text-on-surface-variant hover:bg-surface-container'
                          title='Nusxa olish (klonlash)'
                        >
                          <span className='material-symbols-outlined text-[20px]'>content_copy</span>
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



const CategoriesTab = ({
  categories,
  onDelete,
}: {
  categories: AdminCategory[];
  onDelete: (id: number) => void;
}) => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', parent: '', is_popular: false });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setForm({ name: '', parent: '', is_popular: false });
    setImageFile(null);
    setEditingId(null);
  };

  // "Kategoriya qo'shish" tugmasi — yaratish rejimini ochadi/yopadi.
  const openCreate = () => {
    if (showForm && editingId === null) {
      setShowForm(false);
      return;
    }
    resetForm();
    setShowForm(true);
  };

  // Tahrirlash — formani to'ldirib, formaga scroll qiladi.
  const openEdit = (cat: AdminCategory) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      parent: cat.parent ? String(cat.parent) : '',
      is_popular: !!cat.is_popular,
    });
    setImageFile(null);
    setShowForm(true);
    setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60,
    );
  };

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
      if (editingId !== null) {
        await adminUpdateCategory(editingId, fd);
      } else {
        await adminCreateCategory(fd);
      }
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      setShowForm(false);
      resetForm();
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
          onClick={openCreate}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
        >
          <span className='material-symbols-outlined text-[18px]'>
            {showForm && editingId === null ? 'close' : 'add'}
          </span>
          {showForm && editingId === null ? 'Yopish' : "Kategoriya qo'shish"}
        </button>
      </div>
      {showForm && (
        <div
          ref={formRef}
          className='mb-6 scroll-mt-4 rounded-xl border-2 border-primary/50 bg-surface-container-lowest p-6 shadow-md ring-2 ring-primary/10'
        >
          <h3 className='mb-4 font-h3 text-h3 text-on-surface'>
            {editingId !== null ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'}
          </h3>
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
                  .filter((c) => !c.parent && c.id !== editingId)
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
              {editingId !== null && !imageFile && (
                <p className='mt-1 text-[11px] text-on-surface-variant'>
                  Yangi rasm tanlamasangiz, avvalgi rasm saqlanib qoladi.
                </p>
              )}
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
                onClick={() => { setShowForm(false); resetForm(); }}
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
                {editingId !== null ? "O'zgarishlarni saqlash" : 'Saqlash'}
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
          {/* ── MOBIL KARTALAR (telefon) ── */}
          <div className='divide-y divide-outline-variant md:hidden'>
            {flat.map((cat, i) => (
              <div key={cat.id} className='flex items-center gap-3 p-3'>
                <span className='w-5 shrink-0 text-xs text-on-surface-variant'>{i + 1}</span>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    {cat.parent && (
                      <span className='inline-block h-2.5 w-2.5 shrink-0 border-b-2 border-l-2 border-outline' />
                    )}
                    <span className='truncate text-sm font-semibold text-on-surface'>{cat.name}</span>
                  </div>
                  <div className='mt-1 flex items-center gap-2'>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.parent ? 'bg-surface-container text-on-surface-variant' : 'bg-primary-container text-on-primary-container'}`}>
                      {cat.parent ? 'Kategoriya' : 'Katalog'}
                    </span>
                    <span className='truncate font-mono text-[11px] text-outline'>{cat.slug}</span>
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-1'>
                  <button onClick={() => openEdit(cat)} className='rounded p-1.5 text-primary hover:bg-primary-container/20' title='Tahrirlash'>
                    <span className='material-symbols-outlined text-[20px]'>edit</span>
                  </button>
                  <button onClick={() => onDelete(cat.id)} className='rounded p-1.5 text-error hover:bg-error-container/20' title="O'chirish">
                    <span className='material-symbols-outlined text-[20px]'>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* ── DESKTOP JADVAL ── */}
          <table className='hidden w-full text-left md:table'>
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
                    <div className='flex items-center gap-1'>
                      <button
                        onClick={() => openEdit(cat)}
                        className='rounded p-1 text-primary hover:bg-primary-container/20'
                        title='Tahrirlash'
                      >
                        <span className='material-symbols-outlined text-[20px]'>edit</span>
                      </button>
                      <button
                        onClick={() => onDelete(cat.id)}
                        className='rounded p-1 text-error hover:bg-error-container/20'
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
      )}
    </div>
  );
};

export default AdminPanel;
