import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { cancelOrder, getOrders, getProfile } from '../api/endpoints';
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

const Profile = () => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const resetCart = useCartStore((state) => state.resetCart);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const newOrderId = location.state?.newOrderId;

  const [cancelingOrderId, setCancelingOrderId] = useState<number | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then((response) => response.data),
    enabled: isAuthenticated,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ordersPayload } = useQuery<any>({
    queryKey: ['orders'],
    queryFn: () => getOrders().then((response) => response.data),
    enabled: isAuthenticated,
  });
  const ordersData: ProfileOrder[] = ordersPayload?.results || ordersPayload || [];

  const cancelOrderMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: number; reason: string }) =>
      cancelOrder(orderId, { cancellation_reason: reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Buyurtma bekor qilindi.');
      setCancelingOrderId(null);
      setCancellationReason('');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || "Buyurtmani bekor qilib bo'lmadi.");
    },
  });

  const handleLogout = () => {
    logout();
    resetCart();
    navigate('/auth');
  };

  const displayName = useMemo(() => {
    if (profileData?.first_name) {
      return `${profileData.first_name} ${profileData.last_name || ''}`.trim();
    }
    return user?.first_name || user?.phone || 'Foydalanuvchi';
  }, [profileData?.first_name, profileData?.last_name, user?.first_name, user?.phone]);

  if (!isAuthenticated) {
    return (
      <div className="flex-grow w-full py-lg">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl shadow-sm text-center max-w-md mx-auto mt-2xl">
          <span className="material-symbols-outlined text-5xl text-outline mb-4 block">account_circle</span>
          <h2 className="font-h3 text-h3 text-on-surface mb-2">Bozorga xush kelibsiz</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            Buyurtmalar, status tarixi va profil ma&apos;lumotlari uchun tizimga kiring.
          </p>
          <Link
            to="/auth"
            className="block w-full bg-primary text-on-primary font-label-md text-label-md py-3 rounded-lg hover:opacity-90 transition-opacity mb-3 text-center"
          >
            Kirish
          </Link>
        </div>
      </div>
    );
  }

  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <main className="flex-grow w-full py-lg grid grid-cols-1 md:grid-cols-[240px_1fr] gap-lg mb-2xl">
      <aside className="hidden md:block">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm sticky top-24">
          <div className="p-md border-b border-outline-variant flex items-center gap-md bg-surface-container-low">
            <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-lg shadow">
              {initials}
            </div>
            <div>
              <h3 className="font-label-md text-label-md text-on-surface line-clamp-1">{displayName}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{user?.phone}</p>
            </div>
          </div>
          <nav className="flex flex-col py-sm">
            {user?.is_admin && (
              <Link
                to="/admin"
                className="flex items-center gap-md px-md py-sm text-primary hover:bg-primary-container/10 font-body-md border-l-4 border-transparent hover:border-primary transition-all"
              >
                <span className="material-symbols-outlined text-xl">admin_panel_settings</span>
                Admin Panel
              </Link>
            )}
            <a
              href="#profile"
              className="flex items-center gap-md px-md py-sm text-primary bg-primary-container/10 border-l-4 border-primary font-label-md"
            >
              <span className="material-symbols-outlined text-xl fill-icon">person</span>
              Profil
            </a>
            <a
              href="#orders"
              className="flex items-center gap-md px-md py-sm text-on-surface hover:bg-surface-container-low transition-colors font-body-md border-l-4 border-transparent"
            >
              <span className="material-symbols-outlined text-xl text-outline">list_alt</span>
              Buyurtmalarim
            </a>
            <button
              onClick={handleLogout}
              className="flex items-center gap-md px-md py-sm text-error hover:bg-error-container/20 transition-colors font-body-md text-left w-full"
            >
              <span className="material-symbols-outlined text-xl">logout</span>
              Chiqish
            </button>
          </nav>
        </div>
      </aside>

      <section className="flex flex-col gap-lg">
        {newOrderId && (
          <div className="bg-success-container text-on-success-container p-lg rounded-xl border border-success-container shadow-sm flex items-start gap-md">
            <span className="material-symbols-outlined text-3xl">check_circle</span>
            <div>
              <h3 className="font-h3 text-h3">Buyurtma qabul qilindi</h3>
              <p className="font-body-md text-body-md mt-xs opacity-90">
                Buyurtma raqami: #{newOrderId}. Holat tarixini pastda kuzatishingiz mumkin.
              </p>
            </div>
          </div>
        )}

        <div id="profile" className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm">
          <h2 className="font-h3 text-h3 text-on-surface mb-lg">Shaxsiy ma&apos;lumotlar</h2>
          <div className="flex flex-col md:flex-row items-center gap-lg">
            <div className="w-24 h-24 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-3xl font-bold border-4 border-surface-bright shadow-md">
              {initials}
            </div>
            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-md w-full">
              <div className="bg-surface-container-low p-md rounded-lg">
                <p className="text-on-surface-variant font-label-sm text-xs uppercase tracking-wider mb-xs">Ism Familiya</p>
                <p className="text-on-surface font-body-md font-medium">{displayName}</p>
              </div>
              <div className="bg-surface-container-low p-md rounded-lg">
                <p className="text-on-surface-variant font-label-sm text-xs uppercase tracking-wider mb-xs">Telefon</p>
                <p className="text-on-surface font-body-md font-medium">{user?.phone}</p>
              </div>
            </div>
          </div>
        </div>

        <div id="orders" className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm">
          <div className="flex items-center justify-between mb-lg">
            <h2 className="font-h3 text-h3 text-on-surface">Buyurtmalarim</h2>
            <span className="bg-surface-container text-on-surface-variant px-3 py-1 rounded-full text-xs font-bold">
              {ordersData.length} ta
            </span>
          </div>

          {ordersData.length === 0 ? (
            <div className="text-center py-xl bg-surface-container-low rounded-xl border border-dashed border-outline-variant">
              <span className="material-symbols-outlined text-4xl text-outline mb-2">inventory_2</span>
              <p className="text-on-surface-variant font-body-md">Sizda hali buyurtmalar yo&apos;q.</p>
              <Link to="/catalog" className="text-primary hover:underline mt-2 inline-block font-medium">
                Xarid qilishni boshlash
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              {ordersData.map((order) => {
                const paymentStatus = order.payment?.status ? getPaymentStatusLabel(order.payment.status) : null;
                const isCancelOpen = cancelingOrderId === order.id;

                return (
                  <div key={order.id} className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container-low/30">
                    <div className="bg-surface-container-low p-md flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-outline-variant">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-label-md text-label-md text-on-surface">Buyurtma #{order.id}</span>
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${getOrderStatusBadge(order.status)}`}>
                            {getOrderStatusLabel(order.status)}
                          </span>
                          {order.is_credit && (
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              order.credit_paid
                                ? 'bg-green-100 text-green-700'
                                : order.credit_is_overdue
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {order.credit_paid
                                ? "Muddatli to'lov to'langan"
                                : order.credit_is_overdue
                                ? "To'lov muddati o'tdi!"
                                : "Muddatli to'lov"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {new Date(order.created_at).toLocaleString('uz-UZ')}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-xs text-on-surface-variant">To&apos;lov turi</p>
                        <p className="font-body-md text-on-surface">
                          {getPaymentMethodLabel(order.payment_method)}
                        </p>
                        {paymentStatus && (
                          <p className="text-xs text-on-surface-variant">{paymentStatus}</p>
                        )}
                      </div>
                    </div>

                    <div className="p-md grid gap-md lg:grid-cols-[1.15fr_0.85fr]">
                      <div className="space-y-md">
                        <div className="flex items-center justify-between">
                          <div className="flex -space-x-4 overflow-hidden">
                            {order.items?.slice(0, 4).map((item) => (
                              <div
                                key={item.id}
                                className="w-12 h-12 rounded-lg border-2 border-surface-bright bg-surface-container-lowest overflow-hidden shadow-sm"
                              >
                                {item.product_details?.main_image ? (
                                  <img
                                    src={item.product_details.main_image}
                                    className="w-full h-full object-contain p-1"
                                    alt={item.product_details?.name || 'product'}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-surface-container text-outline">
                                    <span className="material-symbols-outlined text-lg">image</span>
                                  </div>
                                )}
                              </div>
                            ))}
                            {order.items?.length > 4 && (
                              <div className="w-12 h-12 rounded-lg border-2 border-surface-bright bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface-variant shadow-sm">
                                +{order.items.length - 4}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-on-surface-variant text-xs mb-xs">Jami summa</p>
                            <p className="font-price text-primary font-bold">{formatPrice(order.total_price)}</p>
                          </div>
                        </div>

                        <div className="grid gap-sm md:grid-cols-2">
                          <div className="rounded-lg bg-surface-container-low p-sm">
                            <p className="text-xs text-on-surface-variant mb-1">Qabul qiluvchi</p>
                            <p className="text-sm text-on-surface">{order.receiver_name}</p>
                            <p className="text-xs text-on-surface-variant mt-1">{order.receiver_phone}</p>
                          </div>
                          <div className="rounded-lg bg-surface-container-low p-sm">
                            <p className="text-xs text-on-surface-variant mb-1">Manzil</p>
                            <p className="text-sm text-on-surface line-clamp-3">{order.delivery_address}</p>
                          </div>
                        </div>

                        {order.cancellation_reason && (
                          <div className="rounded-lg border border-error-container bg-error-container/30 p-sm">
                            <p className="text-xs text-error mb-1">Bekor qilish sababi</p>
                            <p className="text-sm text-on-surface">{order.cancellation_reason}</p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-md">
                        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                          <div className="mb-sm flex items-center justify-between">
                            <h3 className="font-label-md text-on-surface">Status tarixi</h3>
                            <span className="text-xs text-on-surface-variant">{order.history?.length || 0} ta</span>
                          </div>
                          <div className="space-y-sm">
                            {order.history?.map((entry) => (
                              <div key={entry.id} className="flex gap-sm">
                                <div className="flex flex-col items-center">
                                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                                  <span className="min-h-[24px] w-px bg-outline-variant last:hidden" />
                                </div>
                                <div className="min-w-0 pb-sm">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-on-surface">
                                      {getOrderStatusLabel(entry.to_status)}
                                    </span>
                                    <span className="text-[11px] text-on-surface-variant">
                                      {new Date(entry.created_at).toLocaleString('uz-UZ')}
                                    </span>
                                  </div>
                                  <p className="text-xs text-on-surface-variant">
                                    {entry.actor_name || entry.actor_type}
                                  </p>
                                  {entry.note && <p className="text-sm text-on-surface mt-1">{entry.note}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {order.is_credit && !order.credit_paid && (
                          <div className={`rounded-xl border p-md ${
                            order.credit_is_overdue
                              ? 'border-red-300 bg-red-50'
                              : 'border-amber-300 bg-amber-50'
                          }`}>
                            <div className="flex items-center gap-sm mb-xs">
                              <span className={`material-symbols-outlined text-[20px] ${order.credit_is_overdue ? 'text-red-600' : 'text-amber-600'}`}>
                                {order.credit_is_overdue ? 'warning' : 'schedule'}
                              </span>
                              <span className={`font-label-md text-sm font-semibold ${order.credit_is_overdue ? 'text-red-700' : 'text-amber-700'}`}>
                                {order.credit_is_overdue ? "To'lov muddati o'tdi!" : "Muddatli to'lov kutilmoqda"}
                              </span>
                            </div>
                            <p className="text-xs text-on-surface-variant">
                              To'lov muddati: <strong>{order.credit_due_date}</strong>
                            </p>
                            <p className="text-xs text-on-surface-variant mt-xs">
                              Jami summa: <strong>{formatPrice(order.total_price)}</strong>
                            </p>
                            {order.credit_is_overdue && (
                              <p className="text-xs text-red-600 mt-xs font-medium">
                                Muddati o'tgan to'lov buyurtma tarixingizga salbiy ta'sir qiladi. Iltimos, imkon qadar tezroq to'lang.
                              </p>
                            )}
                          </div>
                        )}

                        {order.can_cancel && CANCELLABLE_ORDER_STATUSES.includes(order.status) && (
                          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
                            {isCancelOpen ? (
                              <div className="space-y-sm">
                                <label className="block text-sm text-on-surface">
                                  Bekor qilish sababi
                                  <textarea
                                    className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-bright p-sm outline-none focus:border-primary"
                                    rows={3}
                                    value={cancellationReason}
                                    onChange={(event) => setCancellationReason(event.target.value)}
                                    placeholder="Masalan: manzil o'zgardi yoki fikrim o'zgardi"
                                  />
                                </label>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!cancellationReason.trim()) {
                                        toast.error("Bekor qilish sababini kiriting.");
                                        return;
                                      }
                                      cancelOrderMutation.mutate({
                                        orderId: order.id,
                                        reason: cancellationReason.trim(),
                                      });
                                    }}
                                    disabled={cancelOrderMutation.isPending}
                                    className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                                  >
                                    Bekor qilishni tasdiqlash
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCancelingOrderId(null);
                                      setCancellationReason('');
                                    }}
                                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface"
                                  >
                                    Yopish
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
                                className="w-full rounded-lg border border-error text-error px-4 py-2 text-sm font-medium hover:bg-error-container/20 transition-colors"
                              >
                                Buyurtmani bekor qilish
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
      </section>
    </main>
  );
};

export default Profile;
