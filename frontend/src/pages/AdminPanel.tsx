import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import {
  adminDeleteBanner,
  adminDeleteCategory,
  adminDeleteProduct,
  adminGetBanners,
  adminGetCategories,
  adminGetProducts,
} from '../api/endpoints';
import { ROLE_LABELS, ROLE_COLORS, type StaffRole } from '../store/authStore';
import { toast } from '../utils/toast';
import { useShopInfo } from '../utils/shopInfoCache';
import { adminPollOrders } from '../api/endpoints';
import ThemeToggle from '../components/ThemeToggle';
import AdminPOS from '../components/AdminPOS';
// #N3: umumiy tiplar AdminPanel monolitidan ajratildi (admin/shared).
import type {
  AdminBanner, AdminCategory, AdminPaginatedResponse, AdminProduct,
} from './admin/shared';
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
import { ReturnsTab } from './admin/ReturnsTab';
import { DefectsTab } from './admin/DefectsTab';
import { SozlamalarTab } from './admin/SozlamalarTab';
import { CompatibilityTab } from './admin/CompatibilityTab';
import { DashboardTab } from './admin/DashboardTab';
import { ProductsTab } from './admin/ProductsTab';
import { BannersTab } from './admin/BannersTab';
import { CategoriesTab } from './admin/CategoriesTab';
import { _notNull } from './admin/shared';

type AdminTab = 'dashboard' | 'products' | 'banners' | 'categories' | 'orders' | 'users' | 'feedback' | 'reports' | 'stock' | 'pos' | 'kassa' | 'nasiya' | 'sozlamalar' | 'compatibility' | 'staff' | 'masters' | 'audit' | 'returns' | 'defects';

// Har bir tab qaysi rollar uchun ko'rinadi.
// ⭐ ADMIN roli FAQAT quyidagi 7 tabni ko'radi (qolganlari super-admin uchun):
//    Mahsulotlar, Kategoriyalar, Buyurtmalar, Kassa, Hisobotlar, Bannerlar, Moslik.
// SuperAdmin (is_superuser=True) — BARCHA tablar (canSeeTab birinchi qatorda true).
const TAB_ROLES: Partial<Record<AdminTab, StaffRole[]>> = {
  // ── ADMIN ko'radigan 7 tab ──
  products:      ['admin'],            // Mahsulotlar
  categories:    ['admin'],            // Kategoriyalar
  orders:        ['admin', 'seller', 'courier'],  // Buyurtmalar (sotuvchi/kuryer ham)
  returns:       ['admin'],            // Qaytarishlar — admin va super
  defects:       ['admin'],            // Defektlar — admin va super
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
  'kassa', 'nasiya', 'reports', 'stock', 'returns', 'defects', 'sozlamalar', 'staff', 'masters', 'audit',
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
  // HAR VARIANT alohida sanalgan jami (backend `total_with_variants`) —
  // "36 xil / 45 dona" ko'rsatish uchun. Yo'q bo'lsa distinct count'ga tushadi.
  const productTotalWithVariants = Array.isArray(productResponse)
    ? productResponse.length
    : productResponse?.total_with_variants ?? productResponse?.count ?? 0;
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
        _tab('returns',  'Qaytarishlar',     'assignment_return'),
        _tab('defects',  'Defektlar',        'dangerous'),
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
          <span className='text-base font-bold text-primary'>700Mobile Admin</span>
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
              totalWithVariants={productTotalWithVariants}
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
          {activeTab === 'returns' && <ReturnsTab />}
          {activeTab === 'defects' && <DefectsTab />}
        </main>
      </div>
    </div>
  );
};


export default AdminPanel;
