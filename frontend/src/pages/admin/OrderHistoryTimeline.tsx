// Phase 3.6 — Status tarixi vizualizatsiyasi.
//
// Muammo (Phase 3.5'gacha): qaytarish o'tishlari OrderHistory'ga yozilganda
// `to_status` = order.status (Order modified emas — RECEIVED qoladi). Demak
// barcha qaytarish status o'zgarishi "Xaridorga topshirildi" deb chiqayotgan.
// Aslida note'da to'g'ri ma'lumot bor: "Qaytarish R-2026-NNNNNN: STATE_A → STATE_B"
//
// Yechim: note'ni regex bilan parse qilib, qaytarish o'tishi bo'lsa o'zbek
// labeli + R-... raqamini ajratib ko'rsatamiz. Aks holda Order status labelini.
//
// UX: 6 dan ortiq element bo'lsa, boshidagi 2 + sariq "Yana N ta o'tish" tugmasi
// + oxirgi 2 ko'rsatamiz. Bosishda hammasi ochiladi.

import { useState } from 'react';
import { getOrderStatusLabel } from '../../utils/orderStatus';
import type { AdminOrderHistory } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
//  Qaytarish status o'zbek labellari (mobile/web 100% bir xil)
// ─────────────────────────────────────────────────────────────────────────────
const RETURN_STATUS_LABELS_UZ: Record<string, string> = {
  REQUESTED: "Qaytarish so'rovi yuborildi",
  APPROVED: 'Qaytarish tasdiqlandi',
  PICKUP_SCHEDULED: 'Kuryer biriktirildi',
  PICKED_UP: 'Kuryer tovarni oldi',
  INSPECTING: 'Do\'konda tekshirilmoqda',
  ACCEPTED: 'Do\'kon qabul qildi',
  REFUNDED: "Do'konga qaytarildi — pul qaytarib berildi",
  REPLACED: "Do'konga qaytarildi — yangi tovarga almashtirildi",
  REJECTED: "Qaytarish rad etildi",
  CANCELLED: 'Qaytarish bekor qilindi',
};

const RETURN_STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-blue-500',
  APPROVED: 'bg-purple-500',
  PICKUP_SCHEDULED: 'bg-indigo-500',
  PICKED_UP: 'bg-cyan-500',
  INSPECTING: 'bg-amber-500',
  ACCEPTED: 'bg-teal-500',
  REFUNDED: 'bg-green-500',
  REPLACED: 'bg-emerald-500',
  REJECTED: 'bg-red-500',
  CANCELLED: 'bg-gray-500',
};

// note format: "Qaytarish R-2026-NNNNNN: REQUESTED → APPROVED" yoki
// "Qaytarish R-2026-NNNNNN: APPROVED → REFUNDED (izoh)"
const RETURN_NOTE_RE =
  /^Qaytarish\s+(R-\d{4}-\d{6}):\s*([A-Z_]+)\s*[→\->]+\s*([A-Z_]+)(?:\s*\((.*)\))?$/;

type ParsedReturnEntry = {
  returnNumber: string;
  fromStatus: string;
  toStatus: string;
  extraNote: string | null;
} | null;

function parseReturnNote(note: string | null | undefined): ParsedReturnEntry {
  if (!note) return null;
  const m = note.trim().match(RETURN_NOTE_RE);
  if (!m) return null;
  return {
    returnNumber: m[1],
    fromStatus: m[2],
    toStatus: m[3],
    extraNote: m[4] ?? null,
  };
}

type Props = {
  history: AdminOrderHistory[];
  lastHistory?: AdminOrderHistory | null;
};

export function OrderHistoryTimeline({ history, lastHistory }: Props) {
  // Eskidan yangi qatorga ko'tarib chiqarish — chiroyli ketma-ketlik
  // (back-end created_at ascending qaytaradi; tashqi sort kerak emas).
  const entries = history ?? [];
  const total = entries.length;
  const COLLAPSE_THRESHOLD = 6;
  const VISIBLE_HEAD = 2;
  const VISIBLE_TAIL = 2;
  const [expanded, setExpanded] = useState(false);

  const shouldCollapse = total > COLLAPSE_THRESHOLD && !expanded;
  const hiddenCount = shouldCollapse ? total - VISIBLE_HEAD - VISIBLE_TAIL : 0;
  const visibleEntries: { entry: AdminOrderHistory; index: number }[] = [];
  if (shouldCollapse) {
    for (let i = 0; i < VISIBLE_HEAD; i++) {
      visibleEntries.push({ entry: entries[i], index: i });
    }
    for (let i = total - VISIBLE_TAIL; i < total; i++) {
      visibleEntries.push({ entry: entries[i], index: i });
    }
  } else {
    for (let i = 0; i < total; i++) {
      visibleEntries.push({ entry: entries[i], index: i });
    }
  }

  return (
    <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <div className='text-sm font-semibold text-on-surface'>Status tarixi</div>
        <div className='flex items-center gap-3'>
          {total > COLLAPSE_THRESHOLD && (
            <button
              type='button'
              onClick={() => setExpanded((v) => !v)}
              className='text-xs font-bold text-primary hover:underline'
            >
              {expanded ? 'Yig\'ish' : `Hammasini ko'rsatish (${total})`}
            </button>
          )}
          {lastHistory && (
            <div className='text-xs text-on-surface-variant'>
              Oxirgisi: {new Date(lastHistory.created_at).toLocaleString('uz-UZ')}
            </div>
          )}
        </div>
      </div>
      <div className='space-y-3'>
        {visibleEntries.map(({ entry, index }, i) => {
          // Collapsed holatda HEAD/TAIL chegarasida "..." ko'rsatamiz
          const isLastVisibleHead =
            shouldCollapse && i === VISIBLE_HEAD - 1 && total > VISIBLE_HEAD + VISIBLE_TAIL;
          const parsed = parseReturnNote(entry.note);
          return (
            <div key={`${entry.id}-${index}`}>
              <TimelineEntry entry={entry} parsed={parsed} />
              {isLastVisibleHead && (
                <button
                  type='button'
                  onClick={() => setExpanded(true)}
                  className='ml-5 mt-3 mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60'
                >
                  <span>···</span>
                  <span>Yana {hiddenCount} ta o'tish</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineEntry({
  entry,
  parsed,
}: {
  entry: AdminOrderHistory;
  parsed: ParsedReturnEntry;
}) {
  const isReturn = parsed != null;
  const label = isReturn
    ? RETURN_STATUS_LABELS_UZ[parsed!.toStatus] ?? parsed!.toStatus
    : getOrderStatusLabel(entry.to_status);
  const dotColor = isReturn
    ? RETURN_STATUS_COLORS[parsed!.toStatus] ?? 'bg-gray-500'
    : 'bg-primary';

  return (
    <div className='flex gap-3'>
      <div className='flex flex-col items-center'>
        <span
          className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${dotColor}`}
        />
      </div>
      <div className='flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-semibold text-on-surface'>{label}</span>
          {isReturn && (
            <span className='inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary'>
              {parsed!.returnNumber}
            </span>
          )}
          <span className='text-xs text-on-surface-variant'>
            {new Date(entry.created_at).toLocaleString('uz-UZ')}
          </span>
        </div>
        <div className='text-xs text-on-surface-variant'>
          {entry.actor_name || entry.actor_type}
        </div>
        {isReturn && parsed!.extraNote && (
          <div className='mt-1 text-xs italic text-on-surface-variant'>
            "{parsed!.extraNote}"
          </div>
        )}
        {!isReturn && entry.note && (
          <div className='mt-1 text-sm text-on-surface'>{entry.note}</div>
        )}
      </div>
    </div>
  );
}
