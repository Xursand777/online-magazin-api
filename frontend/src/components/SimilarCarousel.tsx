import { useCallback, useEffect, useRef, useState } from 'react';
import ProductCard, { type Product as ProductCardData } from './ProductCard';

interface SimilarCarouselProps {
  products: ProductCardData[];
  title: string;
}

// Boshda nechta karta MOUNT qilinadi (og'ir kartalarni birdaniga chizmaymiz).
const INITIAL_VISIBLE = 8;
// O'ngga surganda / o'ng strelka bosilganda qo'shiladigan karta soni.
const REVEAL_STEP = 6;

/**
 * O'xshash mahsulotlar karuseli — Aros uslubidagi CHAP/O'NG strelkalar bilan.
 *
 * - Ko'rinmas scrollbar (silliq, professional ko'rinish).
 * - Kartalar BIRDANIGA emas — o'ngga surgan/strelka bosgan sari OCHILIB boradi.
 *   Bu faqat CLIENT tomonda (`slice`) — SERVERGA QO'SHIMCHA SO'ROV YO'Q, chunki
 *   o'xshash mahsulotlar allaqachon bitta so'rovda kelib bo'lgan.
 * - Strelkalar chekkaga yetganda avtomatik o'chadi (disabled).
 */
export default function SimilarCarousel({ products, title }: SimilarCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => Math.min(INITIAL_VISIBLE, products.length));
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(products.length > 0);

  // Ro'yxat o'zgarsa (variant almashsa) — boshidan boshlaymiz.
  useEffect(() => {
    setVisible(Math.min(INITIAL_VISIBLE, products.length));
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: 0 });
  }, [products]);

  // Strelkalar holatini (va kerak bo'lsa progressive reveal'ni) yangilaydi.
  const syncArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    const moreToMount = visible < products.length;

    setCanPrev(scrollLeft > 4);
    setCanNext(scrollLeft < maxScroll - 4 || moreToMount);

    // O'ng chekkaga yaqinlashsa — yana kartalar mount qilamiz (server so'rovisiz).
    if (moreToMount && maxScroll - scrollLeft < clientWidth * 0.75) {
      setVisible((v) => Math.min(products.length, v + REVEAL_STEP));
    }
  }, [visible, products.length]);

  // Ko'rinadigan kartalar soni yoki ro'yxat o'zgarsa — strelkalarni qayta hisoblaymiz.
  useEffect(() => {
    syncArrows();
  }, [visible, syncArrows]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    // O'ngga surishdan OLDIN yetarli karta mount bo'lganiga ishonch hosil qilamiz.
    if (dir === 1 && visible < products.length) {
      setVisible((v) => Math.min(products.length, v + REVEAL_STEP));
    }
    // Yangi kartalar DOM'ga chizilgach suramiz (silliq).
    requestAnimationFrame(() => {
      el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
    });
  };

  if (products.length === 0) return null;

  return (
    <div>
      {/* Sarlavha + Aros uslubidagi strelkalar (o'ng yuqorida) */}
      <div className="mb-md flex items-center justify-between gap-3">
        <h2 className="text-h3 font-h3 text-on-surface">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Oldingi"
            onClick={() => scrollByDir(-1)}
            disabled={!canPrev}
            className="grid h-9 w-9 place-items-center rounded-full border border-outline-variant text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-outline-variant disabled:hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <button
            type="button"
            aria-label="Keyingi"
            onClick={() => scrollByDir(1)}
            disabled={!canNext}
            className="grid h-9 w-9 place-items-center rounded-full border border-outline-variant text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-outline-variant disabled:hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Gorizontal oqim — ko'rinmas scrollbar, snap bilan silliq to'xtash */}
      <div
        ref={scrollRef}
        onScroll={syncArrows}
        role="list"
        className="-mx-4 flex snap-x snap-mandatory gap-md overflow-x-auto scroll-px-4 px-4 pb-3 scrollbar-hide md:mx-0 md:px-0 md:scroll-px-0"
      >
        {products.slice(0, visible).map((item) => (
          <div
            key={item.card_id ?? item.id}
            role="listitem"
            className="w-[45%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-[18.5%] xl:w-[15.5%]"
          >
            <ProductCard product={item} />
          </div>
        ))}
      </div>
    </div>
  );
}
