import { useEffect, useCallback, useState } from 'react';

interface LightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Professional full-screen image lightbox with:
 * - Keyboard navigation (← → Esc)
 * - Touch swipe support
 * - Zoom (click or button)
 * - Thumbnails strip
 * - Smooth transitions
 */
const Lightbox = ({ images, initialIndex = 0, onClose }: LightboxProps) => {
  const [current, setCurrent] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const goNext = useCallback(() => {
    setIsZoomed(false);
    setCurrent((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setIsZoomed(false);
    setCurrent((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goNext, goPrev]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const delta = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) {
      delta > 0 ? goNext() : goPrev();
    }
    setTouchStartX(null);
  };

  if (!images.length) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Rasm kattalashtirish"
    >
      {/* ─── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white/60 text-sm font-medium tabular-nums select-none">
          {current + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          {/* Zoom toggle */}
          <button
            onClick={() => setIsZoomed((z) => !z)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={isZoomed ? "Kichraytirish" : "Kattalashtirish"}
          >
            <span className="material-symbols-outlined text-[22px]">
              {isZoomed ? 'zoom_out' : 'zoom_in'}
            </span>
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Yopish"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>
      </div>

      {/* ─── Main image area ──────────────────────────────────── */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Prev button */}
        {images.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-3 z-10 flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/25 transition-all active:scale-90"
            aria-label="Oldingi rasm"
          >
            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
          </button>
        )}

        {/* Image */}
        <div
          className="w-full h-full flex items-center justify-center cursor-zoom-in"
          onClick={() => setIsZoomed((z) => !z)}
        >
          <img
            key={current}
            src={images[current]}
            alt={`Rasm ${current + 1}`}
            className={`max-h-full transition-all duration-300 select-none ${
              isZoomed
                ? 'scale-150 object-contain w-full cursor-zoom-out'
                : 'object-contain max-w-full max-h-full cursor-zoom-in'
            }`}
            draggable={false}
          />
        </div>

        {/* Next button */}
        {images.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-3 z-10 flex items-center justify-center w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/25 transition-all active:scale-90"
            aria-label="Keyingi rasm"
          >
            <span className="material-symbols-outlined text-[28px]">chevron_right</span>
          </button>
        )}
      </div>

      {/* ─── Thumbnail strip ──────────────────────────────────── */}
      {images.length > 1 && (
        <div className="shrink-0 px-4 py-3 overflow-x-auto">
          <div className="flex gap-2 justify-center">
            {images.map((src, idx) => (
              <button
                key={idx}
                onClick={() => { setCurrent(idx); setIsZoomed(false); }}
                className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  idx === current
                    ? 'border-white scale-105 shadow-lg'
                    : 'border-white/20 opacity-60 hover:opacity-90 hover:border-white/50'
                }`}
              >
                <img
                  src={src}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-contain bg-white/5 p-0.5"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Lightbox;
