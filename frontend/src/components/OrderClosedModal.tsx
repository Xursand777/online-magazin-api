import { useEffect } from 'react';
import { useOrderReminderStore } from '../store/orderReminderStore';
import { useOrderWindow } from '../hooks/useOrderWindow';
import { useTranslation } from '../i18n/useTranslation';

/**
 * Buyurtma yopiq vaqtda chiqadigan iliq, chiroyli eslatma modali.
 * App darajasida bir marta render qilinadi; `useOrderReminderStore.show()`
 * chaqirilganda ochiladi.
 */
export default function OrderClosedModal() {
  const { t } = useTranslation();
  const open = useOrderReminderStore((s) => s.open);
  const hide = useOrderReminderStore((s) => s.hide);
  const { openTime, closeTime } = useOrderWindow();

  // Escape bilan yopish + modal ochiqda body scroll'ni to'xtatish
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, hide]);

  if (!open) return null;

  const body = t.product.orderClosedBody
    .replace('{open}', openTime)
    .replace('{close}', closeTime);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
      onClick={hide}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-surface-container-lowest shadow-2xl animate-[scaleIn_0.2s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Yuqori — gradient bezak + soat ikonkasi */}
        <div className="relative flex flex-col items-center gap-3 bg-gradient-to-b from-primary/15 to-transparent px-6 pt-8 pb-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-8 ring-primary/5">
            <span className="material-symbols-outlined text-[42px] text-primary">schedule</span>
          </div>
          <h2 className="text-center text-xl font-bold text-on-surface">
            {t.product.orderClosedTitle}
          </h2>
        </div>

        {/* Matn + soatlar */}
        <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-1">
          <p className="text-center text-body-md leading-relaxed text-on-surface-variant">
            {body}
          </p>

          <div className="flex items-center gap-2 rounded-full bg-primary-container/40 px-5 py-2">
            <span className="material-symbols-outlined text-[18px] text-primary">alarm</span>
            <span className="text-base font-bold tracking-wide text-primary">
              {openTime} – {closeTime}
            </span>
          </div>

          <button
            type="button"
            onClick={hide}
            className="mt-1 w-full rounded-xl bg-primary py-3 text-base font-semibold text-on-primary transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {t.product.orderClosedGotIt}
          </button>
        </div>
      </div>
    </div>
  );
}
