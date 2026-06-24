import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';

// ─────────────────────────────────────────────────────────────────────────────
// DEFEKTLAR — sotuvga yaroqsiz (writeoff) buyumlar boshqaruvi
//
// Manba: OrderReturnItem (restock=False, qaytarish SUCCESS). Bu buyumlar
// tekshiruvda defekt/buzilgan deb topilgan → stokka QAYTMAGAN → saytga/mobil
// katalogga qayta CHIQMAYDI. Bu yerda admin ularni to'liq ma'lumot bilan kuzatadi.
// ─────────────────────────────────────────────────────────────────────────────

interface DefectItem {
  id: number;
  product_name: string;
  color: string | null;
  quality: string | null;
  model: string | null;
  size: string | null;
  image: string | null;
  quantity: number;
  condition: string;
  condition_display: string;
  writeoff_reason: string;
  writeoff_reason_display: string;
  refund_unit_price: string;
  line_total: string;
  return_number: string;
  return_id: number;
  order_id: number;
  created_at: string | null;
}

interface DefectStats {
  total_records: number;
  total_items: number;
  total_loss: string;
  by_condition: { condition: string; n: number }[];
}

const CONDITION_BADGE: Record<string, string> = {
  defective:    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  used_damaged: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  used_open:    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  new:          'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
};

const fmtPrice = (v: string | number) => Number(v || 0).toLocaleString('uz-UZ') + ' UZS';
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function StatCard({ label, value, icon, tone }: { label: string; value: string | number; icon: string; tone: 'red' | 'amber' | 'gray' }) {
  const toneCls =
    tone === 'red' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
    : 'text-on-surface-variant bg-surface-container';
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${toneCls}`}>
        <span className="material-symbols-outlined text-[24px]">{icon}</span>
      </div>
      <div>
        <div className="text-2xl font-bold text-on-surface">{value}</div>
        <div className="text-xs text-on-surface-variant">{label}</div>
      </div>
    </div>
  );
}

export function DefectsTab() {
  const [condition, setCondition] = useState('');

  const { data: stats } = useQuery<DefectStats>({
    queryKey: ['admin-defects-stats'],
    queryFn: async () => (await apiClient.get('/orders/admin/defects/stats/')).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-defects', condition],
    queryFn: async () =>
      (await apiClient.get('/orders/admin/defects/', { params: condition ? { condition } : {} })).data,
  });

  const items: DefectItem[] = data?.results ?? (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-6">
      {/* Sarlavha */}
      <div>
        <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-red-600 dark:text-red-400">dangerous</span>
          Defektlar
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Sotuvga yaroqsiz (defekt / buzilgan) buyumlar. Bular stokka qaytmagan va saytga qayta chiqmaydi.
        </p>
      </div>

      {/* Statistika kartalari */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Jami defekt yozuvlar" value={stats?.total_records ?? 0} icon="dangerous" tone="red" />
        <StatCard label="Jami buyumlar (dona)" value={stats?.total_items ?? 0} icon="inventory_2" tone="amber" />
        <StatCard label="Jami zarar" value={stats ? fmtPrice(stats.total_loss) : '—'} icon="payments" tone="red" />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: '', label: 'Hammasi' },
          { v: 'defective', label: 'Aybli' },
          { v: 'used_damaged', label: 'Zararlangan' },
          { v: 'used_open', label: 'Ochilgan' },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setCondition(f.v)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              condition === f.v
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ro'yxat */}
      {isLoading ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-outline-variant">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant opacity-40">check_circle</span>
          <p className="mt-3 text-on-surface-variant">Defekt mahsulotlar yo'q</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 flex gap-4 items-center hover:border-red-300 dark:hover:border-red-800/60 transition-colors"
            >
              {/* Rasm */}
              <div className="w-16 h-16 rounded-lg bg-surface-bright border border-outline-variant flex-shrink-0 overflow-hidden flex items-center justify-center">
                {it.image ? (
                  <img src={it.image} alt={it.product_name} className="w-full h-full object-contain" loading="lazy" />
                ) : (
                  <span className="material-symbols-outlined text-on-surface-variant opacity-40">image_not_supported</span>
                )}
              </div>

              {/* Ma'lumot */}
              <div className="flex-grow min-w-0">
                <div className="font-semibold text-on-surface truncate">{it.product_name}</div>
                {/* Variant chiplari: model / sifat / rang / o'lcham */}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {it.model && <Chip icon="memory" text={it.model} />}
                  {it.quality && <Chip icon="grade" text={it.quality} />}
                  {it.color && <Chip icon="palette" text={it.color} />}
                  {it.size && <Chip icon="straighten" text={it.size} />}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-on-surface-variant">
                  <span className="font-mono">{it.return_number}</span>
                  <span>•</span>
                  <span>Buyurtma #{it.order_id}</span>
                  <span>•</span>
                  <span>{fmtDate(it.created_at)}</span>
                </div>
              </div>

              {/* O'ng: sabab + miqdor + narx */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${CONDITION_BADGE[it.condition] || CONDITION_BADGE.used_open}`}>
                  {it.condition_display}
                </span>
                <span className="text-sm font-semibold text-on-surface">{it.quantity} dona</span>
                <span className="text-xs text-on-surface-variant">{fmtPrice(it.refund_unit_price)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-xs text-on-surface-variant">
      <span className="material-symbols-outlined text-[13px]">{icon}</span>
      {text}
    </span>
  );
}

export default DefectsTab;
