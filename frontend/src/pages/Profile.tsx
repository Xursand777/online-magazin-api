import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { cancelOrder, getOrders, getProfile, updateProfile, getMasterStatus } from '../api/endpoints';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import {
  CANCELLABLE_ORDER_STATUSES,
  getOrderStatusBadge,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from '../utils/orderStatus';
import { toast } from '../utils/toast';
import { useTranslation } from '../i18n/useTranslation';
import { useLanguageStore } from '../store/languageStore';
import AddressPicker from '../components/AddressPicker';
import { parseStructuredAddress } from '../utils/address';

interface ProfileOrderItem {
  id: number;
  quantity: number;
  product_details?: {
    name: string;
    main_image?: string | null;
  };
}

interface ProfileOrderHistory {
  id: number;
  from_status: string;
  to_status: string;
  actor_type: string;
  actor_name?: string | null;
  note: string;
  created_at: string;
}

interface ProfileOrder {
  id: number;
  status: string;
  payment_method: string;
  total_price: string | number;
  created_at: string;
  receiver_name: string;
  receiver_phone: string;
  delivery_address: string;
  cancellation_reason: string;
  can_cancel: boolean;
  is_credit: boolean;
  credit_days: number | null;
  credit_due_date: string | null;
  credit_paid: boolean;
  credit_paid_at: string | null;
  credit_is_overdue: boolean;
  payment?: {
    status: string;
    method: string;
  } | null;
  items: ProfileOrderItem[];
  history: ProfileOrderHistory[];
}

const formatPrice = (v: string | number) => Number(v).toLocaleString('uz-UZ') + ' UZS';

interface MasterStatusData {
  is_master: boolean;
  base_percent: number;
  effective_percent: number;
  level: number;
  max_level: number;
  days_since_last_purchase: number | null;
  last_purchase_at: string | null;
}

// Usta chegirma holati — pog'onali (level) dinamik chegirmani shaffof ko'rsatadi
const MasterStatusCard = () => {
  const { data } = useQuery<MasterStatusData>({
    queryKey: ['master-status'],
    queryFn: () => getMasterStatus().then((r) => r.data),
    staleTime: 60_000,
  });

  if (!data || !data.is_master) return null;

  // Faqat faollik pog'onasi ko'rsatiladi — usta ko'radigan "imtiyoz kuchi %"
  // va "optom + ustama%" matnlari ATAYIN olib tashlandi (ichki narx mantig'i
  // mijozga oshkor qilinmaydi). Pog'ona indikatori va sarlavha qoladi.
  const { level, max_level, days_since_last_purchase } = data;
  const isFull = level >= max_level;
  const isActive = level > 0;

  const tone: 'full' | 'partial' | 'none' = isFull ? 'full' : isActive ? 'partial' : 'none';
  const accent =
    tone === 'full' ? 'from-primary/15 to-primary/5 border-primary/25'
    : tone === 'partial' ? 'from-amber-500/15 to-amber-500/5 border-amber-500/25'
    : 'from-on-surface/8 to-transparent border-outline-variant';

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${accent} p-5`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-primary text-[24px]">construction</span>
          </div>
          <div>
            <p className="text-label-lg font-bold text-on-surface">Usta narxi</p>
            <p className="text-xs text-on-surface-variant">
              {days_since_last_purchase === null
                ? "Hali xarid qilmagansiz"
                : `Oxirgi xariddan ${days_since_last_purchase} kun o'tdi`}
            </p>
          </div>
        </div>
      </div>

      {/* Pog'ona indikatori (level / max_level) */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-on-surface-variant">Faollik pog'onasi</span>
          <span className="text-[11px] font-semibold text-on-surface">{level} / {max_level}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: max_level }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-all ${i < level ? 'bg-primary' : 'bg-surface-container'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const Profile = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const resetCart = useCartStore((state) => state.resetCart);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);
  const newOrderId = location.state?.newOrderId;

  const activeTab = searchParams.get('tab') || 'profile';
  const orderFilter = searchParams.get('filter') || 'active';

  const [cancelingOrderId, setCancelingOrderId] = useState<number | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Strukturalangan manzil maydonlari — AddressPicker boshqaradi.
  // Parent state shu yerda saqlanadi → updateProfile chaqirilganda
  // delivery_address ni concat qilib backend'ga yuboramiz.
  const [viloyat, setViloyat] = useState('');
  const [tumanShahar, setTumanShahar] = useState('');
  const [mahalla, setMahalla] = useState('');
  const [domUy, setDomUy] = useState('');
  // ── Phase 3.1 — Manzil koordinatasi va kuryer eslatmasi ────────────────
  // Foydalanuvchi xaritadan tanlasa, bu state'lar to'ladi. Saqlanganda
  // backend'ga yuboriladi → keyingi safar Checkout'da avtomat ishlatiladi.
  const [profileCoords, setProfileCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [profileNotes, setProfileNotes] = useState<string>('');

  const updateUserStore = useAuthStore((state) => state.updateUser);

  const startEditing = () => {
    setFirstName(profileData?.first_name || user?.first_name || '');
    setLastName(profileData?.last_name || '');
    const parsed = parseStructuredAddress(profileData?.delivery_address || '');
    setViloyat(parsed.viloyat);
    setTumanShahar(parsed.tumanShahar);
    setMahalla(parsed.mahalla);
    setDomUy(parsed.domUy);
    // Phase 3.1 — saqlangan koordinata va eslatmani tahrir oynasiga yuklash
    const lat = profileData?.delivery_lat;
    const lng = profileData?.delivery_lng;
    setProfileCoords(
      lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null,
    );
    setProfileNotes(profileData?.delivery_notes || '');
    setIsEditing(true);
  };

  // ── Manzil bilan ishlash AddressPicker komponentiga ko'chirildi ─────────
  // Xarita yuklash, geolokatsiya, permission modal, reverse geocoding —
  // hammasi AddressPicker ichida. Profile bu yerda faqat 4 ta strukturalangan
  // state'ni ushlab turadi va updateProfile'ga concat qilib yuboradi.

  const updateProfileMutation = useMutation({
    mutationFn: (data: {
      first_name: string;
      last_name: string;
      delivery_address: string;
      // Phase 3.1 — koordinata va eslatma
      delivery_lat?: number | null;
      delivery_lng?: number | null;
      delivery_notes?: string;
    }) =>
      updateProfile(data),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      updateUserStore({
        first_name: response.data.first_name,
        last_name: response.data.last_name,
      });
      toast.success(t.profile.toastSaved);
      setIsEditing(false);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t.profile.toastSaveError);
    }
  });

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then((response) => response.data),
    enabled: isAuthenticated,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ordersPayload } = useQuery<any>({
    // language: mahsulot nomlari tarjima bo'lib keladi — til almashganda qayta fetch qilish kerak
    queryKey: ['orders', language],
    queryFn: () => getOrders().then((response) => response.data),
    enabled: isAuthenticated,
  });
  const ordersData: ProfileOrder[] = ordersPayload?.results || ordersPayload || [];

  const activeOrders = ordersData.filter(o =>
    !['RECEIVED', 'CANCELLED_BY_USER', 'CANCELLED_BY_ADMIN', 'SYSTEM_AUTO_CANCEL'].includes(o.status.toUpperCase())
  );

  const unpaidOrders = ordersData.filter(o => o.is_credit && !o.credit_paid);

  let displayedOrders = ordersData;
  if (orderFilter === 'active') displayedOrders = activeOrders;
  if (orderFilter === 'unpaid') displayedOrders = unpaidOrders;

  const cancelOrderMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: number; reason: string }) =>
      cancelOrder(orderId, { cancellation_reason: reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', language] });
      toast.success(t.profile.toastOrderCancelled);
      setCancelingOrderId(null);
      setCancellationReason('');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t.profile.toastCancelFailed);
    },
  });

  const handleLogout = () => {
    logout();
    resetCart();
    navigate('/auth');
  };

  const noOrdersDesc = orderFilter === 'unpaid'
    ? t.profile.noUnpaidOrdersDesc
    : orderFilter === 'active'
    ? t.profile.noActiveOrdersDesc
    : t.profile.noAllOrdersDesc;

  if (!isAuthenticated) {
    return (
      <div className="flex-grow w-full py-lg">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl shadow-sm text-center max-w-md mx-auto mt-2xl">
          <span className="material-symbols-outlined text-5xl text-outline mb-4 block">account_circle</span>
          <h2 className="font-h3 text-h3 text-on-surface mb-2">{t.profile.welcome}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            {t.profile.loginDesc}
          </p>
          <Link
            to="/auth"
            className="block w-full bg-primary text-on-primary font-label-md text-label-md py-3 rounded-lg hover:opacity-90 transition-opacity mb-3 text-center"
          >
            {t.auth.login}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:py-12">
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Link to="/" className="hover:text-primary transition-colors">{t.favorites.breadcrumb}</Link>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          <span className="font-medium text-on-surface">
            {activeTab === 'profile' ? t.profile.myInfo : t.profile.myOrders}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-on-surface md:text-3xl">
          {activeTab === 'profile' ? t.profile.myInfo : t.profile.myOrders}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 lg:gap-8 items-start">
        {/* Sidebar Navigation */}
        <aside className="bg-surface-container-lowest rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/30 overflow-hidden md:sticky md:top-24">
          <nav className="flex flex-col py-3">
            {user?.is_admin && (
              <Link
                to="/admin"
                className="flex items-center gap-3 px-6 py-3.5 text-on-surface hover:bg-primary/5 transition-colors font-medium border-l-4 border-transparent hover:border-primary"
              >
                <span className="material-symbols-outlined text-[22px]">admin_panel_settings</span>
                Admin Panel
              </Link>
            )}

            <button
              onClick={() => setSearchParams({ tab: 'profile' })}
              className={`flex w-full items-center gap-3 px-6 py-3.5 text-base font-medium transition-all ${
                activeTab === 'profile'
                  ? 'bg-[#22c55e] text-white border-l-4 border-[#16a34a]'
                  : 'text-on-surface hover:bg-surface-container-low hover:text-primary border-l-4 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[22px] font-light">person</span>
              {t.profile.myInfo}
            </button>

            <button
              onClick={() => setSearchParams({ tab: 'orders', filter: 'active' })}
              className={`flex w-full items-center gap-3 px-6 py-3.5 text-base font-medium transition-all ${
                activeTab === 'orders'
                  ? 'bg-[#22c55e] text-white border-l-4 border-[#16a34a]'
                  : 'text-on-surface hover:bg-surface-container-low hover:text-primary border-l-4 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[22px] font-light">inventory_2</span>
              {t.profile.myOrders}
            </button>

            <div className="mt-4 pt-4 border-t border-outline-variant/50">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-6 py-3.5 text-on-surface hover:bg-surface-container-low transition-colors text-base font-medium"
              >
                <span className="material-symbols-outlined text-[22px] font-light">logout</span>
                {t.profile.logoutText}
              </button>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <section className="flex flex-col gap-6">
          <MasterStatusCard />

          {newOrderId && (
            <div className="bg-success-container text-on-success-container p-lg rounded-xl border border-success-container shadow-sm flex items-start gap-md">
              <span className="material-symbols-outlined text-3xl">check_circle</span>
              <div>
                <h3 className="font-h3 text-h3">{t.profile.orderAccepted}</h3>
                <p className="font-body-md text-body-md mt-xs opacity-90">
                  {t.profile.orderNum} #{newOrderId}. {t.profile.orderAcceptedDesc}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-6">
              {isEditing ? (
                <div className="bg-surface-container-lowest rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/30 p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-6 pb-6 border-b border-outline-variant/30">
                    <span className="material-symbols-outlined text-2xl text-[#22c55e]">edit_note</span>
                    <h2 className="text-xl font-bold text-on-surface">{t.profile.editInfo}</h2>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!firstName.trim()) {
                        toast.error(t.profile.toastFirstNameRequired);
                        return;
                      }
                      const fullAddress = [viloyat, tumanShahar, mahalla, domUy]
                        .map(p => p.trim())
                        .filter(Boolean)
                        .join(', ');
                      updateProfileMutation.mutate({
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        delivery_address: fullAddress,
                        // Phase 3.1 — koordinata + eslatma. toFixed(6) GpsDecimalField
                        // bilan birga 2 darajadagi himoya (frontend + backend).
                        delivery_lat: profileCoords
                          ? Number(profileCoords.lat.toFixed(6))
                          : null,
                        delivery_lng: profileCoords
                          ? Number(profileCoords.lng.toFixed(6))
                          : null,
                        delivery_notes: profileNotes.trim(),
                      });
                    }}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant mb-2">{t.profile.name} *</label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low/50 p-3 outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e] transition-all text-sm font-medium"
                          placeholder={t.profile.regionPlaceholder.replace('Masalan: Xorazm viloyati', t.profile.name)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant mb-2">{t.profile.lastName}</label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low/50 p-3 outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e] transition-all text-sm font-medium"
                          placeholder={t.profile.lastName}
                        />
                      </div>
                    </div>

                    <div className="border-t border-outline-variant/30 pt-6">
                      {/* AddressPicker — Profile va Checkout uchun yagona komponent.
                          Strukturalangan manzil obyektini value sifatida olib,
                          o'zgarishlarda strukturalangan + string formatini parent'ga
                          uzatadi. accentColor=#22c55e — Profile yashil brendiga mos. */}
                      <AddressPicker
                        value={{ viloyat, tumanShahar, mahalla, domUy }}
                        initialCoordinates={profileCoords}
                        initialNotes={profileNotes}
                        showNotesField={true}
                        onChange={({ structured, coordinates, notes }) => {
                          setViloyat(structured.viloyat);
                          setTumanShahar(structured.tumanShahar);
                          setMahalla(structured.mahalla);
                          setDomUy(structured.domUy);
                          // Phase 3.1 — koordinata va eslatmani saqlash
                          setProfileCoords(coordinates);
                          setProfileNotes(notes);
                        }}
                        required={false}
                        showHeading={true}
                        accentColor="#22c55e"
                      />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-outline-variant/30">
                      <button
                        type="submit"
                        disabled={updateProfileMutation.isPending}
                        className="bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-60 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        {updateProfileMutation.isPending && (
                          <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                        )}
                        {t.common.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="border border-outline-variant hover:bg-surface-container-low text-on-surface px-6 py-3 rounded-xl text-sm font-bold transition-all"
                      >
                        {t.common.cancel}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <>
                  <div className="bg-surface-container-lowest rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/30 p-6 md:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-outline-variant/30">
                      <h2 className="text-xl font-bold text-on-surface">{t.profile.info}</h2>
                      <button
                        onClick={startEditing}
                        className="flex items-center justify-center gap-2 bg-[#22c55e] hover:bg-[#16a34a] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-fit"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                        {t.profile.edit}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div>
                        <p className="text-sm text-on-surface-variant mb-1">{t.profile.name}</p>
                        <p className="text-base font-semibold text-on-surface">{profileData?.first_name || user?.first_name || t.profile.unknown}</p>
                      </div>
                      <div>
                        <p className="text-sm text-on-surface-variant mb-1">{t.profile.lastName}</p>
                        <p className="text-base font-semibold text-on-surface">{profileData?.last_name || t.profile.notEntered}</p>
                      </div>
                      <div>
                        <p className="text-sm text-on-surface-variant mb-1">{t.auth.phone}</p>
                        <p className="text-base font-semibold text-on-surface">{user?.phone || t.profile.unknown}</p>
                      </div>
                      <div>
                        <p className="text-sm text-on-surface-variant mb-1">{t.profile.orderStatus}</p>
                        <span className="inline-flex px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-xs font-bold uppercase tracking-wider">
                          {t.profile.customer}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/30 p-6 md:p-8">
                    <h2 className="text-xl font-bold text-on-surface mb-6">{t.profile.deliveryAddress}</h2>
                    {profileData?.delivery_address ? (
                      <div className="flex items-start gap-4 p-5 border border-outline-variant/50 rounded-xl bg-surface-container-low/20">
                        <div className="w-12 h-12 rounded-xl bg-[#f0fdf4] dark:bg-green-950/20 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-2xl text-[#22c55e]">pin_drop</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-on-surface-variant mb-1">{t.profile.defaultAddress}</p>
                          <p className="text-base font-semibold text-on-surface">{profileData.delivery_address}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-outline-variant/50 rounded-xl bg-surface-container-low/30">
                        <div className="w-24 h-24 rounded-full bg-[#f0fdf4] dark:bg-green-950/20 flex items-center justify-center mb-4">
                          <span className="material-symbols-outlined text-5xl text-[#22c55e]">pin_drop</span>
                        </div>
                        <h3 className="text-lg font-bold text-on-surface mb-2">{t.profile.noAddress}</h3>
                        <p className="text-sm text-on-surface-variant max-w-sm">
                          {t.profile.noAddressDesc}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-6 bg-surface-container-lowest rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/30 p-6 md:p-8">
              <div className="flex gap-6 border-b border-outline-variant/50 mb-6">
                <button
                  onClick={() => setSearchParams({ tab: 'orders', filter: 'active' })}
                  className={`pb-3 text-[15px] font-semibold transition-colors ${
                    orderFilter === 'active'
                      ? 'text-[#22c55e] border-b-[3px] border-[#22c55e]'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t.profile.activeOrders} ({activeOrders.length})
                </button>
                <button
                  onClick={() => setSearchParams({ tab: 'orders', filter: 'unpaid' })}
                  className={`pb-3 text-[15px] font-semibold transition-colors ${
                    orderFilter === 'unpaid'
                      ? 'text-[#22c55e] border-b-[3px] border-[#22c55e]'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t.profile.unpaidOrders} ({unpaidOrders.length})
                </button>
                <button
                  onClick={() => setSearchParams({ tab: 'orders', filter: 'all' })}
                  className={`pb-3 text-[15px] font-semibold transition-colors ${
                    orderFilter === 'all'
                      ? 'text-[#22c55e] border-b-[3px] border-[#22c55e]'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t.profile.allOrders} ({ordersData.length})
                </button>
              </div>

              {displayedOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <h3 className="text-3xl font-black text-on-surface mb-4 tracking-tight">{t.profile.noItems}</h3>
                  <p className="text-base text-on-surface-variant mb-10 max-w-md leading-relaxed">
                    {noOrdersDesc} {t.profile.noOrdersSearch}
                  </p>

                  <Link
                    to="/"
                    className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-8 py-3.5 rounded-[12px] font-semibold transition-colors shadow-sm text-[15px]"
                  >
                    {t.profile.goHome}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {displayedOrders.map((order) => {
                    const paymentStatus = order.payment?.status ? getPaymentStatusLabel(order.payment.status, t) : null;
                    const isCancelOpen = cancelingOrderId === order.id;

                    return (
                      <div key={order.id} className="border border-outline-variant/50 rounded-2xl overflow-hidden bg-surface-container-lowest shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                        <div className="bg-surface-container-low/30 p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-outline-variant/30">
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-bold text-base text-on-surface">{t.profile.orderNum} #{order.id}</span>
                              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${getOrderStatusBadge(order.status)}`}>
                                {getOrderStatusLabel(order.status, t)}
                              </span>
                              {order.is_credit && (
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                  order.credit_paid
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : order.credit_is_overdue
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {order.credit_paid
                                    ? t.profile.creditPaid
                                    : order.credit_is_overdue
                                    ? t.profile.overdue
                                    : t.checkout.credit}
                                </span>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs text-on-surface-variant font-medium">
                              {new Date(order.created_at).toLocaleString('uz-UZ')}
                            </p>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">{t.profile.paymentType}</p>
                            <p className="font-medium text-sm text-on-surface">
                              {getPaymentMethodLabel(order.payment_method, t)}
                            </p>
                            {paymentStatus && (
                              <p className="text-xs text-on-surface-variant mt-0.5">{paymentStatus}</p>
                            )}
                          </div>
                        </div>

                        <div className="p-5 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                          <div className="space-y-6">
                            <div className="flex items-center justify-between bg-surface-container-low/20 p-4 rounded-xl border border-outline-variant/30">
                              <div className="flex -space-x-3 overflow-hidden">
                                {order.items?.slice(0, 4).map((item) => (
                                  <div
                                    key={item.id}
                                    className="w-12 h-12 rounded-lg border-2 border-surface-container-lowest bg-surface-container-low overflow-hidden shadow-sm"
                                  >
                                    {item.product_details?.main_image ? (
                                      <img
                                        src={item.product_details.main_image}
                                        className="w-full h-full object-contain p-1"
                                        alt={item.product_details?.name || 'product'}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-outline">
                                        <span className="material-symbols-outlined text-lg">image</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {order.items?.length > 4 && (
                                  <div className="w-12 h-12 rounded-lg border-2 border-surface-container-lowest bg-surface-container-low flex items-center justify-center text-xs font-bold text-on-surface-variant shadow-sm z-10">
                                    +{order.items.length - 4}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-on-surface-variant text-[11px] uppercase tracking-wider font-semibold mb-1">{t.profile.totalAmount}</p>
                                <p className="font-price text-primary font-bold text-lg">{formatPrice(order.total_price)}</p>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/20 p-4">
                                <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wider mb-2">{t.profile.receiver}</p>
                                <p className="text-sm font-medium text-on-surface mb-0.5">{order.receiver_name}</p>
                                <p className="text-sm text-on-surface-variant">{order.receiver_phone}</p>
                              </div>
                              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/20 p-4">
                                <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wider mb-2">{t.profile.address}</p>
                                <p className="text-sm text-on-surface line-clamp-2">{order.delivery_address}</p>
                              </div>
                            </div>

                            {order.cancellation_reason && (
                              <div className="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/30 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-1.5">{t.profile.cancelReason}</p>
                                <p className="text-sm text-red-900 dark:text-red-300">{order.cancellation_reason}</p>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                              <div className="mb-4 flex items-center justify-between border-b border-outline-variant/30 pb-3">
                                <h3 className="font-semibold text-sm text-on-surface">{t.profile.statusHistory}</h3>
                                <span className="text-xs font-medium text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">{order.history?.length || 0} {t.cart.items}</span>
                              </div>
                              <div className="space-y-0">
                                {order.history?.map((entry) => (
                                  <div key={entry.id} className="flex gap-3 group">
                                    <div className="flex flex-col items-center">
                                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#22c55e] shadow-[0_0_0_2px_rgba(34,197,94,0.2)]" />
                                      <span className="min-h-[28px] w-[2px] bg-outline-variant/40 group-last:hidden my-1" />
                                    </div>
                                    <div className="min-w-0 pb-3">
                                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                        <span className="text-sm font-bold text-on-surface">
                                          {getOrderStatusLabel(entry.to_status, t)}
                                        </span>
                                        <span className="text-[11px] font-medium text-on-surface-variant">
                                          {new Date(entry.created_at).toLocaleString('uz-UZ')}
                                        </span>
                                      </div>
                                      {entry.note ? (
                                        <p className="text-[13px] text-on-surface-variant">{entry.note}</p>
                                      ) : (
                                        <p className="text-[13px] text-on-surface-variant">
                                          {entry.actor_name || entry.actor_type}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {order.is_credit && !order.credit_paid && (
                              <div className={`rounded-xl border p-4 ${
                                order.credit_is_overdue
                                  ? 'border-red-200 bg-red-50 dark:bg-red-950/20'
                                  : 'border-amber-200 bg-amber-50 dark:bg-amber-950/20'
                              }`}>
                                <div className="flex items-center gap-2 mb-3">
                                  <span className={`material-symbols-outlined text-[20px] ${order.credit_is_overdue ? 'text-red-600' : 'text-amber-600'}`}>
                                    {order.credit_is_overdue ? 'warning' : 'schedule'}
                                  </span>
                                  <span className={`text-sm font-bold ${order.credit_is_overdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                    {order.credit_is_overdue ? t.profile.overdue : t.profile.creditWaiting}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <p className="text-xs text-on-surface-variant flex justify-between">
                                    <span>{t.profile.dueDate}</span>
                                    <strong className="text-on-surface">{order.credit_due_date}</strong>
                                  </p>
                                  <p className="text-xs text-on-surface-variant flex justify-between">
                                    <span>{t.profile.totalDebt}</span>
                                    <strong className="text-on-surface font-price">{formatPrice(order.total_price)}</strong>
                                  </p>
                                </div>
                                {order.credit_is_overdue && (
                                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-3 font-medium leading-relaxed bg-red-100/50 dark:bg-red-900/30 p-2 rounded-lg">
                                    {t.profile.overdueWarning}
                                  </p>
                                )}
                              </div>
                            )}

                            {order.can_cancel && CANCELLABLE_ORDER_STATUSES.includes(order.status) && (
                              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                                {isCancelOpen ? (
                                  <div className="space-y-3">
                                    <label className="block text-sm font-medium text-on-surface">
                                      {t.profile.cancelReason}
                                      <textarea
                                        className="mt-2 w-full rounded-xl border border-outline-variant/50 bg-surface-container-low/50 p-3 outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e] transition-all text-sm resize-none"
                                        rows={3}
                                        value={cancellationReason}
                                        onChange={(event) => setCancellationReason(event.target.value)}
                                        placeholder={t.profile.cancelReasonPlaceholder}
                                      />
                                    </label>
                                    <div className="flex gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!cancellationReason.trim()) {
                                            toast.error(t.profile.toastCancelReasonRequired);
                                            return;
                                          }
                                          cancelOrderMutation.mutate({
                                            orderId: order.id,
                                            reason: cancellationReason.trim(),
                                          });
                                        }}
                                        disabled={cancelOrderMutation.isPending}
                                        className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 shadow-sm"
                                      >
                                        {t.common.confirm}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCancelingOrderId(null);
                                          setCancellationReason('');
                                        }}
                                        className="rounded-lg border border-outline-variant hover:bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors"
                                      >
                                        {t.common.close}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCancelingOrderId(order.id);
                                      setCancellationReason('');
                                    }}
                                    className="w-full rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 dark:border-red-900/30 px-4 py-2.5 text-sm font-semibold transition-colors"
                                  >
                                    {t.profile.cancelOrder}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

    </main>
  );
};

export default Profile;
