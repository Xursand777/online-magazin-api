// admin/AuditLogTab.tsx — Tizim audit log ko'rinishi (Super Admin). #N3:
// AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminGetAuditLogs } from '../../api/endpoints';

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

export const AuditLogTab = () => {
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
