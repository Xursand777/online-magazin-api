// admin/UsersTab.tsx — Foydalanuvchilar (qidiruv, batafsil, faollik, kredit ban
// olib tashlash). #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { getOrderStatusLabel, getOrderStatusBadge } from '../../utils/orderStatus';
import { adminGetUsers, adminGetUser, adminToggleUserActive, adminLiftUserCreditBan } from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { formatMoney, formatDate } from './shared';

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


export const UsersTab = () => {
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

