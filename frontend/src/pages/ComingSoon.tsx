import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';

/**
 * ComingSoon — "Ushbu sahifa hozircha tayyor emas" sahifasi.
 *
 * Hozircha tayyor bo'lmagan footer havolalari (Shartlar, Yetkazib berish,
 * Qaytarish, Biz haqimizda, To'lov turlari, Maxfiylik siyosati) shu sahifani
 * ko'rsatadi — 404 o'rniga chiroyli, brendlangan "tez orada" tajribasi.
 *
 * Rasm — qo'lda chizilgan, brend (yashil) palitrasidagi do'stona soat + nihol +
 * uchqunlar illyustratsiyasi. Light/dark rejimda ham yaxshi ko'rinadi.
 */

const ComingSoonIllustration = () => (
  <svg
    viewBox="0 0 420 320"
    className="w-full max-w-[360px] h-auto"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* yumshoq fon dog'i */}
    <ellipse cx="210" cy="165" rx="186" ry="126" fill="#16a34a" opacity="0.08" />

    {/* uchqunlar / yulduzchalar */}
    <path
      transform="translate(72,68)"
      d="M0,-12 Q1.7,-1.7 12,0 Q1.7,1.7 0,12 Q-1.7,1.7 -12,0 Q-1.7,-1.7 0,-12 Z"
      fill="#f59e0b"
      opacity="0.9"
    />
    <path
      transform="translate(352,92)"
      d="M0,-9 Q1.3,-1.3 9,0 Q1.3,1.3 0,9 Q-1.3,1.3 -9,0 Q-1.3,-1.3 0,-9 Z"
      fill="#fb7185"
      opacity="0.9"
    />
    <path
      transform="translate(360,206)"
      d="M0,-6 Q1,-1 6,0 Q1,1 0,6 Q-1,1 -6,0 Q-1,-1 0,-6 Z"
      fill="#16a34a"
      opacity="0.7"
    />
    <circle cx="58" cy="178" r="5" fill="#fb7185" opacity="0.7" />
    <circle cx="332" cy="58" r="4" fill="#16a34a" opacity="0.6" />
    <circle cx="100" cy="256" r="4" fill="#f59e0b" opacity="0.6" />

    {/* yer soyasi */}
    <ellipse cx="210" cy="282" rx="122" ry="16" fill="#0f172a" opacity="0.06" />

    {/* nihol (o'sish — "tez orada") */}
    <g transform="translate(92,198)">
      <path d="M14,40 C-7,28 -5,5 12,1 C10,18 16,30 14,40 Z" fill="#16a34a" />
      <path d="M16,40 C37,26 37,5 20,2 C22,18 16,30 16,40 Z" fill="#15803d" />
      <path d="M15,42 L15,6" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
      <path d="M-2,40 L32,40 L28,66 L2,66 Z" fill="#fb923c" />
      <rect x="-5" y="36" width="40" height="9" rx="3.5" fill="#f59e0b" />
    </g>

    {/* soat (vaqt — "hozircha") */}
    <g transform="translate(210,152)">
      {/* oyoqlar */}
      <rect x="-44" y="72" width="14" height="24" rx="7" fill="#15803d" transform="rotate(20 -37 84)" />
      <rect x="30" y="72" width="14" height="24" rx="7" fill="#15803d" transform="rotate(-20 37 84)" />
      {/* qo'ng'iroqlar */}
      <circle cx="-54" cy="-74" r="16" fill="#16a34a" />
      <circle cx="54" cy="-74" r="16" fill="#16a34a" />
      <rect x="-9" y="-93" width="18" height="15" rx="6" fill="#15803d" />
      {/* korpus */}
      <circle r="82" fill="#16a34a" />
      <circle r="73" fill="#dcfce7" />
      <circle r="73" fill="none" stroke="#16a34a" strokeWidth="2" opacity="0.25" />
      {/* belgilar (12-3-6-9) */}
      <rect x="-2.5" y="-65" width="5" height="14" rx="2.5" fill="#15803d" />
      <rect x="-2.5" y="51" width="5" height="14" rx="2.5" fill="#15803d" />
      <rect x="51" y="-2.5" width="14" height="5" rx="2.5" fill="#15803d" />
      <rect x="-65" y="-2.5" width="14" height="5" rx="2.5" fill="#15803d" />
      {/* strelkalar */}
      <rect x="-4" y="-44" width="8" height="48" rx="4" fill="#15803d" transform="rotate(38)" />
      <rect x="-3.5" y="-30" width="7" height="34" rx="3.5" fill="#0f6b3f" transform="rotate(-72)" />
      <circle r="7" fill="#15803d" />
    </g>
  </svg>
);

const ComingSoon = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <ComingSoonIllustration />

      <h1 className="mt-8 flex items-center justify-center gap-2 text-h3 font-h3 text-on-surface">
        <span aria-hidden="true">🚧</span>
        <span>{t.comingSoon.title}</span>
      </h1>

      <p className="mt-3 max-w-md text-body-md font-body-md text-on-surface-variant">
        {t.comingSoon.subtitle}
      </p>

      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-base font-semibold text-on-primary transition-opacity hover:opacity-90"
      >
        <span className="material-symbols-outlined text-[20px]">home</span>
        {t.comingSoon.button}
      </Link>
    </div>
  );
};

export default ComingSoon;
