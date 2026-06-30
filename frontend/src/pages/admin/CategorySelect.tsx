import { useState, useRef, useEffect, useMemo } from 'react';
import type { AdminCategory } from './shared';
import { categoryLabel } from './shared';

interface Props {
  categories: AdminCategory[];
  value: string; // tanlangan kategoriya id (string), '' = tanlanmagan
  onChange: (value: string) => void;
  placeholder?: string;
}

// ── Qidiriladigan kategoriya tanlovchi (combobox) ──────────────────────────
// Oddiy <select> o'rniga: ro'yxat + qidiruv maydoni. Admin kategoriya yoki
// katalog nomini yozib tezda topadi (90+ kategoriya orasidan). Klaviatura
// bilan ham boshqariladi (↑/↓ harakat, Enter tanlash, Esc yopish).
export const CategorySelect = ({ categories, value, onChange, placeholder }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => String(c.id) === value) || null;

  // Qidiruv — nom yoki ota-kategoriya (katalog) nomi bo'yicha (case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => categoryLabel(c).toLowerCase().includes(q));
  }, [categories, query]);

  // Tanlash variantlari: birinchisi "tanlanmagan", keyin filtrlanganlar.
  // activeIdx shu tekis ro'yxat bo'yicha (0 = tanlanmagan).
  const options = useMemo(
    () => [{ id: '', label: placeholder || '-- Kategoriya tanlanmagan --' },
      ...filtered.map((c) => ({ id: String(c.id), label: categoryLabel(c) }))],
    [filtered, placeholder],
  );

  // Tashqariga bosish + Escape — yopadi.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Ochilganda: qidiruvni tozalab, maydonni fokuslaymiz; active'ni tanlangan
  // elementga (yoki 0 ga) qo'yamiz.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = options.findIndex((o) => o.id === value);
    setActiveIdx(idx >= 0 ? idx : 0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Qidiruv o'zgarsa — active'ni boshiga qaytaramiz (chegaradan chiqmasligi uchun).
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, options.length - 1)));
  }, [options.length]);

  // Active element ko'rinib turishi uchun scroll.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) select(opt.id);
    }
  };

  return (
    <div ref={rootRef} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex w-full items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-left outline-none focus:border-primary'
      >
        <span className={selected ? 'truncate text-on-surface' : 'truncate text-on-surface-variant'}>
          {selected ? categoryLabel(selected) : (placeholder || '-- Kategoriya tanlanmagan --')}
        </span>
        <span className='material-symbols-outlined shrink-0 text-[20px] text-on-surface-variant'>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className='absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-outline-variant bg-surface-bright shadow-lg'>
          <div className='border-b border-outline-variant p-2'>
            <div className='flex items-center gap-2 rounded-md border border-outline-variant bg-surface-container px-2 focus-within:border-primary'>
              <span className='material-symbols-outlined text-[18px] text-on-surface-variant'>search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder='Kategoriya yoki katalog izlash...'
                className='w-full bg-transparent py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60'
              />
            </div>
          </div>
          <div ref={listRef} className='max-h-64 overflow-y-auto py-1'>
            {options.length === 1 ? (
              // faqat "tanlanmagan" qoldi — qidiruvda hech narsa topilmadi
              <div className='px-3 py-4 text-center text-sm text-on-surface-variant'>
                Hech narsa topilmadi
              </div>
            ) : (
              options.map((opt, idx) => (
                <button
                  key={opt.id || 'none'}
                  type='button'
                  data-idx={idx}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => select(opt.id)}
                  className={`block w-full truncate px-3 py-2 text-left text-sm ${
                    idx === activeIdx ? 'bg-primary/10' : ''
                  } ${
                    opt.id === value
                      ? 'font-semibold text-primary'
                      : opt.id === ''
                        ? 'text-on-surface-variant'
                        : 'text-on-surface'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
