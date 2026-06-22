// admin/ReturnsTab.tsx — Phase 3.2 — Qaytarish (Return) boshqaruvi.
// AYNAN web admin: ro'yxat (filter), detail (timeline + items + photos + actions),
// yangi qaytarish yaratish (buyurtma ID orqali — eligibility tekshiruvi bilan).
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminGetReturns,
  adminGetReturn,
  adminGetReturnsStats,
  adminCheckReturnEligibility,
  adminCreateReturn,
  adminTransitionReturn,
  adminUploadReturnPhoto,
} from '../../api/endpoints';
import { extractErrorMessage, formatMoney, formatDate } from './shared';
import { toast } from '../../utils/toast';

// ── Statuslar va sabablar (backend bilan AYNAN bir xil) ────────────────────
const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "So'rov yuborildi",
  APPROVED: 'Tasdiqlandi',
  PICKUP_SCHEDULED: 'Kuryer biriktirildi',
  PICKED_UP: 'Tovar olindi',
  INSPECTING: 'Tekshirilmoqda',
  ACCEPTED: 'Qabul qilindi',
  REFUNDED: 'Pul qaytarildi',
  REPLACED: 'Almashtirildi',
  REJECTED: 'Rad etildi',
  CANCELLED: 'Bekor qilindi',
};

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-purple-100 text-purple-700',
  PICKUP_SCHEDULED: 'bg-indigo-100 text-indigo-700',
  PICKED_UP: 'bg-cyan-100 text-cyan-700',
  INSPECTING: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-teal-100 text-teal-700',
  REFUNDED: 'bg-green-100 text-green-700',
  REPLACED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-700',
};

const STATUS_FLOW: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PICKUP_SCHEDULED', 'PICKED_UP', 'CANCELLED'],
  PICKUP_SCHEDULED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['INSPECTING', 'CANCELLED'],
  INSPECTING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['REFUNDED', 'REPLACED'],
  REFUNDED: [],
  REPLACED: [],
  REJECTED: [],
  CANCELLED: [],
};

type ReturnItem = {
  id: number;
  order_item: number;
  quantity: number;
  refund_unit_price: string;
  condition: string;
  restock: boolean;
  writeoff_reason: string;
  product_name: string;
  line_total: string;
};

type ReturnPhoto = {
  id: number;
  image: string;
  kind: 'claim' | 'inspection';
  uploaded_at: string;
};

type AdminReturn = {
  id: number;
  return_number: string;
  order: number;
  order_number: number;
  dispute: number | null;
  replacement_order: number | null;
  status: string;
  reason_code: string;
  reason_text: string;
  customer_request_note: string;
  initiated_by_phone: string | null;
  initiator_role: string;
  refund_method: string;
  refund_amount: string;
  refund_reference: string;
  refund_processed_at: string | null;
  refund_processed_by_phone: string | null;
  inspector_phone: string | null;
  inspection_at: string | null;
  inspection_notes: string;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
  items: ReturnItem[];
  photos: ReturnPhoto[];
  is_active: boolean;
  is_terminal: boolean;
  // Phase 3.3 — detail endpointi qaytaradi
  kassa_balance?: number;
};

export const ReturnsTab = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState<boolean>(true);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOrderId, setCreateOrderId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const PAGE_SIZE = 20;

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(activeOnly && !statusFilter ? { active: 'true' as const } : {}),
    }),
    [page, statusFilter, activeOnly],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-returns', page, statusFilter, activeOnly],
    queryFn: () =>
      adminGetReturns(params).then(
        (r) => r.data as { count: number; results: AdminReturn[] },
      ),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  // Phase 3.5 — KPI statistikasi
  const { data: stats } = useQuery({
    queryKey: ['admin-returns-stats'],
    queryFn: () =>
      adminGetReturnsStats().then(
        (r) =>
          r.data as {
            total_returns: number;
            success_count: number;
            total_refunded_amount: number;
            by_status: Array<{ status: string; c: number }>;
            by_reason: Array<{ reason_code: string; c: number }>;
            by_method: Array<{ refund_method: string; c: number; total: number }>;
          },
      ),
    staleTime: 60_000,
  });

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-extrabold text-on-surface'>Qaytarishlar</h2>
          <p className='text-sm text-on-surface-variant'>
            Sotilgan tovarni qaytarib olish so'rovlari va jarayonlari.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className='inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90'
        >
          <span className='material-icons text-base'>add</span>
          Yangi qaytarish
        </button>
      </div>

      {/* Phase 3.5 — KPI panel */}
      {stats && (
        <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
          <KpiCard label='Jami qaytarishlar' value={String(stats.total_returns)} />
          <KpiCard
            label='Muvaffaqiyatli'
            value={String(stats.success_count)}
            tone='green'
          />
          <KpiCard
            label='Qaytarilgan summa'
            value={`${formatMoney(String(stats.total_refunded_amount))} so'm`}
            tone='blue'
          />
          <KpiCard
            label='Top sabab'
            value={stats.by_reason[0]?.reason_code || '—'}
            sub={stats.by_reason[0] ? `${stats.by_reason[0].c} ta` : ''}
          />
        </div>
      )}

      {/* Filter */}
      <div className='flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3'>
        <span className='text-sm font-semibold text-on-surface-variant'>Status:</span>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className='rounded-lg border border-outline-variant bg-white px-3 py-1.5 text-sm'
        >
          <option value=''>Barchasi</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {!statusFilter && (
          <label className='ml-2 inline-flex items-center gap-1 text-sm'>
            <input
              type='checkbox'
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            Faqat faollar
          </label>
        )}
      </div>

      {/* Ro'yxat */}
      {isLoading ? (
        <div className='py-12 text-center text-on-surface-variant'>Yuklanmoqda…</div>
      ) : isError ? (
        <div className='py-12 text-center text-red-600'>Xato — qayta urinib ko'ring.</div>
      ) : !data?.results?.length ? (
        <div className='py-12 text-center text-on-surface-variant'>Qaytarishlar topilmadi.</div>
      ) : (
        <div className='overflow-hidden rounded-xl border border-outline-variant'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-container-low text-left'>
              <tr>
                <th className='px-4 py-3 font-bold'>Raqam</th>
                <th className='px-4 py-3 font-bold'>Buyurtma</th>
                <th className='px-4 py-3 font-bold'>Sabab</th>
                <th className='px-4 py-3 font-bold'>Item'lar</th>
                <th className='px-4 py-3 font-bold'>Summa</th>
                <th className='px-4 py-3 font-bold'>Status</th>
                <th className='px-4 py-3 font-bold'>Sana</th>
                <th className='px-4 py-3'></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-outline-variant bg-surface'>
              {data.results.map((r) => (
                <tr key={r.id} className='hover:bg-surface-container-lowest'>
                  <td className='px-4 py-3 font-mono font-bold text-primary'>
                    {r.return_number}
                  </td>
                  <td className='px-4 py-3'>#{r.order_number}</td>
                  <td className='px-4 py-3'>{r.reason_code}</td>
                  <td className='px-4 py-3'>
                    {r.items.reduce((s, it) => s + it.quantity, 0)} ta
                  </td>
                  <td className='px-4 py-3 font-semibold'>
                    {formatMoney(r.refund_amount)} so'm
                  </td>
                  <td className='px-4 py-3'>
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                        STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-on-surface-variant'>
                    {formatDate(r.created_at)}
                  </td>
                  <td className='px-4 py-3 text-right'>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className='rounded-lg border border-outline-variant px-3 py-1 text-xs font-semibold hover:bg-surface-container-lowest'
                    >
                      Ochish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.count > PAGE_SIZE && (
        <div className='flex items-center justify-between'>
          <span className='text-sm text-on-surface-variant'>
            Jami: {data.count} ta
          </span>
          <div className='flex gap-2'>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className='rounded-lg border border-outline-variant px-3 py-1 text-sm disabled:opacity-50'
            >
              Oldingi
            </button>
            <button
              disabled={page * PAGE_SIZE >= data.count}
              onClick={() => setPage((p) => p + 1)}
              className='rounded-lg border border-outline-variant px-3 py-1 text-sm disabled:opacity-50'
            >
              Keyingi
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedId !== null && (
        <ReturnDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* Create modal */}
      {creating && (
        <CreateReturnModal
          orderId={createOrderId}
          setOrderId={setCreateOrderId}
          onClose={() => {
            setCreating(false);
            setCreateOrderId('');
          }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Detail modal
// ─────────────────────────────────────────────────────────────────────────────
const ReturnDetailModal = ({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-return', id],
    queryFn: () => adminGetReturn(id).then((r) => r.data as AdminReturn),
  });

  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [note, setNote] = useState('');

  const transitionMut = useMutation({
    mutationFn: (body: { new_status: string } & Record<string, string>) =>
      adminTransitionReturn(id, body),
    onSuccess: () => {
      toast.success('Status yangilandi');
      qc.invalidateQueries({ queryKey: ['admin-return', id] });
      qc.invalidateQueries({ queryKey: ['admin-returns'] });
    },
    onError: (err) => toast.error(extractErrorMessage(err) || 'Xato'),
  });

  const photoMut = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: 'claim' | 'inspection' }) =>
      adminUploadReturnPhoto(id, file, kind),
    onSuccess: () => {
      toast.success('Rasm yuklandi');
      qc.invalidateQueries({ queryKey: ['admin-return', id] });
    },
    onError: (err) => toast.error(extractErrorMessage(err) || 'Xato'),
  });

  if (isLoading || !data) {
    return (
      <Modal onClose={onClose}>
        <div className='py-8 text-center'>Yuklanmoqda…</div>
      </Modal>
    );
  }

  const nextStates = STATUS_FLOW[data.status] || [];
  const itemsTotal = data.items.reduce(
    (s, it) => s + parseFloat(it.line_total),
    0,
  );

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className='mb-4 flex items-start justify-between'>
        <div>
          <h3 className='text-2xl font-extrabold text-primary'>{data.return_number}</h3>
          <p className='text-sm text-on-surface-variant'>
            Buyurtma #{data.order_number} · {formatDate(data.created_at)}
          </p>
        </div>
        <span
          className={`rounded-md px-3 py-1 text-sm font-bold ${
            STATUS_COLORS[data.status] || 'bg-gray-100 text-gray-700'
          }`}
        >
          {STATUS_LABELS[data.status] || data.status}
        </span>
      </div>

      {/* Sabab */}
      <Section title='Sabab'>
        <div className='text-sm'>
          <div>
            <b>Kategoriya:</b> {data.reason_code}
          </div>
          {data.reason_text && (
            <div className='mt-1'>
              <b>Izoh:</b> {data.reason_text}
            </div>
          )}
          {data.customer_request_note && (
            <div className='mt-1 italic text-on-surface-variant'>
              "{data.customer_request_note}"
            </div>
          )}
        </div>
      </Section>

      {/* Items */}
      <Section title={`Qaytariladigan tovarlar (${data.items.length} ta · Jami: ${formatMoney(itemsTotal)} so'm)`}>
        <div className='overflow-hidden rounded-lg border border-outline-variant'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-container-low text-left'>
              <tr>
                <th className='px-3 py-2'>Mahsulot</th>
                <th className='px-3 py-2'>Soni</th>
                <th className='px-3 py-2'>Narx</th>
                <th className='px-3 py-2'>Stokga</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-outline-variant'>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td className='px-3 py-2 font-semibold'>{it.product_name}</td>
                  <td className='px-3 py-2'>{it.quantity}</td>
                  <td className='px-3 py-2'>{formatMoney(it.line_total)} so'm</td>
                  <td className='px-3 py-2'>
                    {it.restock ? (
                      <span className='text-green-700'>✓ Qaytadi</span>
                    ) : (
                      <span className='text-red-700'>✗ Writeoff</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Photos */}
      {data.photos.length > 0 && (
        <Section title={`Rasmlar (${data.photos.length} ta)`}>
          <div className='flex flex-wrap gap-2'>
            {data.photos.map((ph) => (
              <a
                key={ph.id}
                href={ph.image}
                target='_blank'
                rel='noreferrer'
                className='relative block h-20 w-20 overflow-hidden rounded-lg border border-outline-variant'
              >
                <img src={ph.image} alt='' className='h-full w-full object-cover' />
                <span className='absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-[10px] text-white'>
                  {ph.kind === 'claim' ? "Da'vo" : 'Tekshiruv'}
                </span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Rasm yuklash */}
      {!data.is_terminal && (
        <Section title="Rasm qo'shish">
          <input
            type='file'
            accept='image/*'
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const kind = data.status === 'INSPECTING' ? 'inspection' : 'claim';
              photoMut.mutate({ file: f, kind });
              e.target.value = '';
            }}
            className='block w-full text-sm'
          />
        </Section>
      )}

      {/* Refund metadata (ACCEPTED yoki keyin) */}
      {!data.is_terminal && data.status === 'ACCEPTED' && (
        <Section title="Pul qaytarish ma'lumotlari">
          <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
              className='rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
            >
              <option value='cash'>Naqd (kassa)</option>
              <option value='card'>Karta</option>
              <option value='click'>Click</option>
              <option value='payme'>Payme</option>
              <option value='store_credit'>Do'kon balansi</option>
            </select>
            <input
              type='text'
              placeholder="Summa (so'm)"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className='rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
            />
            <input
              type='text'
              placeholder='Tranzaksiya ref / izoh'
              value={refundReference}
              onChange={(e) => setRefundReference(e.target.value)}
              className='rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
            />
          </div>
          {/* Phase 3.3 — Kassa balansi ko'rsatish (faqat cash uchun) */}
          {refundMethod === 'cash' && data.kassa_balance != null && (
            <KassaBalanceHint
              balance={data.kassa_balance}
              required={parseFloat(refundAmount || String(itemsTotal))}
            />
          )}
        </Section>
      )}

      {/* Inspection izohi */}
      {!data.is_terminal && (data.status === 'INSPECTING' || data.status === 'PICKED_UP') && (
        <Section title='Tekshiruv izohi'>
          <textarea
            value={inspectionNotes}
            onChange={(e) => setInspectionNotes(e.target.value)}
            rows={3}
            placeholder='Inspector tomonidan…'
            className='w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
          />
        </Section>
      )}

      {/* Status actions */}
      {nextStates.length > 0 && (
        <Section title="Statusni o'zgartirish">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Izoh (ixtiyoriy, history'ga yoziladi)"
            className='mb-3 w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
          />
          <div className='flex flex-wrap gap-2'>
            {nextStates.map((s) => (
              <button
                key={s}
                onClick={() => {
                  const body: Record<string, string> = {
                    new_status: s,
                    note,
                    inspection_notes: inspectionNotes,
                  };
                  if (s === 'REFUNDED' || s === 'REPLACED') {
                    body.refund_method = refundMethod;
                    body.refund_amount = refundAmount || String(itemsTotal);
                    if (refundReference) body.refund_reference = refundReference;
                  }
                  transitionMut.mutate(body as { new_status: string });
                }}
                disabled={transitionMut.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                  s === 'REJECTED' || s === 'CANCELLED'
                    ? 'bg-red-600 hover:bg-red-700'
                    : s === 'REFUNDED' || s === 'REPLACED'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-primary hover:opacity-90'
                }`}
              >
                {STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Refund ma'lumotlari (terminal holatda ko'rsatamiz) */}
      {data.is_terminal && data.refund_method && (
        <Section title='Yakuniy refund'>
          <div className='text-sm'>
            <div>
              <b>Usul:</b> {data.refund_method}
            </div>
            <div>
              <b>Summa:</b> {formatMoney(data.refund_amount)} so'm
            </div>
            {data.refund_reference && (
              <div>
                <b>Ref:</b> {data.refund_reference}
              </div>
            )}
            {data.refund_processed_at && (
              <div className='text-on-surface-variant'>
                {formatDate(data.refund_processed_at)} · by{' '}
                {data.refund_processed_by_phone || 'system'}
              </div>
            )}
            {data.replacement_order && (
              <div className='mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800'>
                <b>↪ Almashtirish:</b> yangi Buyurtma #{data.replacement_order}{' '}
                yaratildi (admin → Buyurtmalar bo'limida ko'rish mumkin)
              </div>
            )}
          </div>
        </Section>
      )}

      <div className='mt-6 flex justify-end'>
        <button
          onClick={onClose}
          className='rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold'
        >
          Yopish
        </button>
      </div>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Create modal — buyurtma ID kiritib eligibility tekshiruv + qaytarish ochish
// ─────────────────────────────────────────────────────────────────────────────
const CreateReturnModal = ({
  orderId,
  setOrderId,
  onClose,
}: {
  orderId: string;
  setOrderId: (s: string) => void;
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const [reasonCode, setReasonCode] = useState('defective');
  const [reasonText, setReasonText] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  const eligibilityQuery = useQuery({
    queryKey: ['return-eligibility', orderId],
    queryFn: () => adminCheckReturnEligibility(orderId).then((r) => r.data as {
      eligible: boolean;
      error?: string;
      code?: string;
      window_left_seconds?: number;
      returnable_items?: Array<{
        order_item_id: number;
        returnable_qty: number;
        price: string;
        product_name: string;
      }>;
      reasons?: Array<{ code: string; label: string }>;
    }),
    enabled: !!orderId && /^\d+$/.test(orderId),
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminCreateReturn(orderId, {
        reason_code: reasonCode,
        reason_text: reasonText,
        customer_request_note: customerNote,
      }),
    onSuccess: () => {
      toast.success('Qaytarish yaratildi');
      qc.invalidateQueries({ queryKey: ['admin-returns'] });
      onClose();
    },
    onError: (err) => toast.error(extractErrorMessage(err) || 'Xato'),
  });

  return (
    <Modal onClose={onClose}>
      <h3 className='mb-4 text-2xl font-extrabold'>Yangi qaytarish</h3>

      <Section title='Buyurtma ID'>
        <input
          type='number'
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder='Masalan: 123'
          className='w-full rounded-lg border border-outline-variant bg-white px-3 py-2'
        />
      </Section>

      {orderId && eligibilityQuery.isLoading && (
        <div className='py-3 text-sm text-on-surface-variant'>Tekshirilmoqda…</div>
      )}

      {eligibilityQuery.data && !eligibilityQuery.data.eligible && (
        <div className='mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700'>
          <b>Qaytarish bloklangan:</b> {eligibilityQuery.data.error}
          <div className='mt-1 text-xs text-red-600'>code: {eligibilityQuery.data.code}</div>
        </div>
      )}

      {eligibilityQuery.data?.eligible && (
        <>
          <div className='mb-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700'>
            <b>✓ Qaytarish mumkin.</b> Window:{' '}
            {Math.floor((eligibilityQuery.data.window_left_seconds || 0) / 3600)} soat qoldi.
          </div>

          <Section title='Qaytariladigan tovarlar'>
            <div className='overflow-hidden rounded-lg border border-outline-variant text-sm'>
              <table className='w-full'>
                <thead className='bg-surface-container-low text-left'>
                  <tr>
                    <th className='px-3 py-2'>Mahsulot</th>
                    <th className='px-3 py-2'>Soni</th>
                    <th className='px-3 py-2'>Narx</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-outline-variant'>
                  {eligibilityQuery.data.returnable_items?.map((it) => (
                    <tr key={it.order_item_id}>
                      <td className='px-3 py-2 font-semibold'>{it.product_name}</td>
                      <td className='px-3 py-2'>{it.returnable_qty}</td>
                      <td className='px-3 py-2'>{formatMoney(it.price)} so'm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title='Sabab'>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className='mb-2 w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
            >
              {eligibilityQuery.data.reasons?.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={2}
              placeholder='Batafsil sabab…'
              className='w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
            />
          </Section>

          <Section title="Mijoz so'rovi (telefon orqali bo'lsa)">
            <textarea
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              rows={2}
              placeholder="Mijoz nima dedi…"
              className='w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm'
            />
          </Section>
        </>
      )}

      <div className='mt-6 flex justify-end gap-2'>
        <button
          onClick={onClose}
          className='rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold'
        >
          Bekor
        </button>
        <button
          onClick={() => createMut.mutate()}
          disabled={!eligibilityQuery.data?.eligible || createMut.isPending}
          className='rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50'
        >
          {createMut.isPending ? 'Yaratilmoqda…' : 'Yaratish'}
        </button>
      </div>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
const Modal = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div
    className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
    onClick={onClose}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className='max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl'
    >
      {children}
    </div>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className='mb-4'>
    <h4 className='mb-2 text-sm font-bold uppercase tracking-wide text-on-surface-variant'>
      {title}
    </h4>
    {children}
  </div>
);

// Phase 3.5 — KPI mini-card (statistika paneli uchun)
const KpiCard = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'blue';
}) => {
  const bg =
    tone === 'green'
      ? 'bg-green-50 border-green-200'
      : tone === 'blue'
        ? 'bg-blue-50 border-blue-200'
        : 'bg-surface-container-lowest border-outline-variant';
  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className='text-xs font-semibold uppercase tracking-wide text-on-surface-variant'>
        {label}
      </div>
      <div className='mt-1 text-xl font-extrabold text-on-surface'>{value}</div>
      {sub && <div className='text-xs text-on-surface-variant'>{sub}</div>}
    </div>
  );
};

// Phase 3.3 — Kassa balansi va kerakli summa taqqoslash banneri (cash refund)
const KassaBalanceHint = ({ balance, required }: { balance: number; required: number }) => {
  const enough = balance >= required;
  return (
    <div
      className={`mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        enough
          ? 'border-green-300 bg-green-50 text-green-800'
          : 'border-red-300 bg-red-50 text-red-800'
      }`}
    >
      <div>
        <span className='font-bold'>Kassada:</span>{' '}
        {formatMoney(String(balance))} so'm
      </div>
      <div>
        <span className='font-bold'>Qaytariladi:</span>{' '}
        {formatMoney(String(required || 0))} so'm
      </div>
      <div className='font-bold'>
        {enough ? "✓ Yetarli" : "✗ Yetmaydi — backend bloklaydi"}
      </div>
    </div>
  );
};
