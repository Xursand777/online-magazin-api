// admin/FeedbackTab.tsx — Mijoz fikrlari (status boshqaruvi). #N3: AdminPanel'dan
// AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminGetFeedbacks, adminUpdateFeedback } from '../../api/endpoints';
import { toast } from '../../utils/toast';

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

export const FeedbackTab = () => {
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
