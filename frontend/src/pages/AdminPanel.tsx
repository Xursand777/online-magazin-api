import React, {
  useEffect,
  useState,
  useMemo,
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
  adminGetOrders,
  adminGetProducts,
  adminUpdateBanner,
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
} from '../utils/orderStatus';
import { toast } from '../utils/toast';
import { loadShopInfo, useShopInfo, updateShopInfoCache } from '../utils/shopInfoCache';
import { adminPollOrders } from '../api/endpoints';
import ThemeToggle from '../components/ThemeToggle';
import AdminPOS from '../components/AdminPOS';
import AdminProductImport from '../components/AdminProductImport';
// #N3: umumiy tiplar/yordamchilar AdminPanel monolitidan ajratildi (admin/shared).
import {
  MiniBadge, StatusBadge, CreditPayConfirmDialog, ORDER_STATUS_COLORS,
  categoryLabel, dateTimeLocalToIso, extractErrorMessage, formatDate,
  formatMoney, formatPriceInput, mapBannerToForm, stripNumberFormatting,
} from './admin/shared';
import type {
  AdminBanner, AdminCategory, AdminOrder, AdminPaginatedResponse, AdminProduct,
  AdminStockItem, BannerEditorState, BannerFormState, ProductEditorState,
} from './admin/shared';
import { ProductEditor } from './admin/ProductEditor';
import { OrdersTab } from './admin/OrdersTab';
import { ReportsTab } from './admin/ReportsTab';
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
        {/* ── MOBIL KARTALAR (telefon) ── */}
        <div className='divide-y divide-outline-variant md:hidden'>
          {(data?.history?.length ?? 0) === 0 ? (
            <div className='px-4 py-10 text-center text-on-surface-variant'>
              <span className='material-symbols-outlined mb-2 block text-4xl opacity-50'>receipt_long</span>
              Hozircha hech qanday pul yechilmagan
            </div>
          ) : (
            data?.history?.map((w) => (
              <div key={w.id} className='flex items-start justify-between gap-2 p-3'>
                <div className='min-w-0 flex-1'>
                  <div className='text-sm font-medium text-on-surface'>{w.reason}</div>
                  <div className='mt-0.5 text-xs text-on-surface-variant'>
                    {new Date(w.created_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className='mt-0.5 flex items-center gap-1 text-xs text-on-surface-variant'>
                    <span className='material-symbols-outlined text-[14px]'>account_circle</span>
                    {w.admin_name}
                  </div>
                </div>
                <div className='shrink-0 text-sm font-bold text-error'>−{fmt(w.amount)} so'm</div>
              </div>
            ))
          )}
        </div>
        {/* ── DESKTOP JADVAL ── */}
        <div className='hidden overflow-x-auto md:block'>
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
  is_superuser: boolean;
  role: string | null;
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
  const { user: currentUser } = useAuthStore();
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

      {/* List panel — mobilда foydalanuvchi tanlanса yashirinadi (tafsilot to'liq ekranda) */}
      <div className={`flex-col gap-4 transition-all ${selectedId ? 'hidden lg:flex w-full lg:w-[55%]' : 'flex w-full'}`}>
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

      {/* Detail panel — mobilда to'liq ekranda ko'rinadi (X bilan ro'yxatga qaytish) */}
      {selectedId && (
        <div className='block flex-1 lg:block'>
          <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest lg:sticky lg:top-20'>
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

                {/* Actions — Phase 3.2.1 — Block tugmasi gating (defense in depth, UX) */}
                {(() => {
                  // Backend 4-qatlamli himoyaga mos UI gating.
                  // Faqat oddiy mijozlarni boshqa adminlar bloklay oladi.
                  const isSelf = detailData.id === currentUser?.id;
                  const isTargetSuperuser = !!detailData.is_superuser;
                  const isTargetStaff = !!detailData.is_staff || !!detailData.role;
                  const isViewerSuperuser = !!currentUser?.is_superuser;

                  let blockedReason: string | null = null;
                  if (isTargetSuperuser) {
                    blockedReason = "Super Admin'ni bloklab bo'lmaydi. Tizim egasi himoyalangan.";
                  } else if (isSelf) {
                    blockedReason = "O'zingizni bloklab bo'lmaydi.";
                  } else if (isTargetStaff && !isViewerSuperuser) {
                    blockedReason = "Xodimlarni faqat Super Admin bloklay oladi.";
                  }

                  return (
                    <div className='flex flex-col gap-2 border-t border-outline-variant px-5 py-4'>
                      {blockedReason && (
                        <div className='flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800'>
                          <span className='material-symbols-outlined text-[18px] flex-shrink-0'>shield_person</span>
                          <span>{blockedReason}</span>
                        </div>
                      )}
                      <div className='flex gap-2'>
                        {!blockedReason && (
                          <button
                            disabled={toggleActiveMutation.isPending}
                            onClick={() => toggleActiveMutation.mutate(detailData.id)}
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
                        )}
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
                    </div>
                  );
                })()}

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
        <>
        {/* ── MOBIL KARTALAR (telefon) ── */}
        <div className='divide-y divide-outline-variant overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest md:hidden'>
          {filtered.map((order) => {
            const dueDate = order.credit_due_date ? new Date(order.credit_due_date) : null;
            const diffDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000) : null;
            const isOverdue = order.credit_is_overdue;
            const isPaid = order.credit_paid;
            return (
              <div key={order.id} className={`p-3 ${isOverdue && !isPaid ? 'bg-error/5' : ''}`}>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-1.5'>
                      <span className='font-mono text-xs font-bold text-on-surface'>#{order.id}</span>
                      {isPaid ? (
                        <span className='rounded bg-[#22c55e]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#22c55e]'>To'langan</span>
                      ) : isOverdue ? (
                        <span className='rounded bg-error/10 px-1.5 py-0.5 text-[10px] font-bold text-error'>Muddati o'tdi</span>
                      ) : (
                        <span className='rounded bg-[#f59e0b]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#f59e0b]'>Kutilmoqda</span>
                      )}
                    </div>
                    <div className='mt-0.5 truncate text-sm font-semibold text-on-surface'>{order.receiver_name}</div>
                    <div className='text-xs text-on-surface-variant'>{order.receiver_phone}</div>
                  </div>
                  <div className='shrink-0 text-right'>
                    <div className='text-sm font-bold text-primary'>{fmt(order.total_price)} so'm</div>
                    {!isPaid && diffDays !== null && (
                      <div className={`text-xs font-semibold ${isOverdue ? 'text-error' : diffDays <= 3 ? 'text-[#f59e0b]' : 'text-on-surface-variant'}`}>
                        {isOverdue ? `${Math.abs(diffDays)} kun o'tdi` : `${diffDays} kun qoldi`}
                      </div>
                    )}
                  </div>
                </div>
                <div className='mt-2 flex items-center justify-between gap-2'>
                  <span className='text-xs text-on-surface-variant'>
                    {order.credit_days ?? '—'} kun · {dueDate ? dueDate.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                  </span>
                  {!isPaid && (
                    <button
                      onClick={() => setNasiyaConfirmOrder(order)}
                      disabled={payMutation.isPending}
                      className='flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:opacity-90 disabled:opacity-50'
                    >
                      <span className='material-symbols-outlined text-[14px]'>payments</span>
                      To'landi
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* ── DESKTOP JADVAL ── */}
        <div className='hidden overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm md:block'>
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
        </>
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
      // Kurs o'zgardi → backend USD'dagi mahsulotlar narxi va chegirma narxini
      // qayta hisobladi. Saytdagi BARCHA narx ko'rsatadigan ekranlar yangi
      // qiymatni darrov ko'rsatishi uchun tegishli cache'larni invalidatsiya
      // qilamiz (admin ro'yxati, mijoz katalogi, bosh sahifa, kategoriya,
      // mahsulot sahifasi, hisobot).
      ['admin-products', 'products', 'product', 'mainPage', 'categories-home',
       'category-products', 'admin-report', 'search-products'].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      );
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
              <div key={member.id} className='flex flex-col gap-2 px-6 py-4 hover:bg-surface-container/50 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex min-w-0 items-center gap-3'>
                  <div className='w-10 h-10 shrink-0 rounded-full bg-surface-container flex items-center justify-center'>
                    <span className='material-symbols-outlined text-[20px] text-on-surface-variant'>person</span>
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold text-on-surface'>
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
              <div key={master.id} className='flex flex-col gap-2 px-6 py-4 hover:bg-surface-container/50 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex min-w-0 items-center gap-3'>
                  <div className='w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center'>
                    <span className='material-symbols-outlined text-[20px] text-primary'>construction</span>
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold text-on-surface'>
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
