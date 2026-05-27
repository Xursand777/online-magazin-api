import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useLanguageStore, type Language } from '../store/languageStore';
import { useTranslation } from '../i18n/useTranslation';

const FlagUz = () => (
  <svg width="18" height="13" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg"
    className="rounded-[2px] border border-outline-variant/30 shrink-0">
    <rect width="60" height="13" fill="#1eb2fc" />
    <rect y="13" width="60" height="2" fill="#ffffff" />
    <rect y="15" width="60" height="10" fill="#ffffff" />
    <rect y="25" width="60" height="2" fill="#ffffff" />
    <rect y="27" width="60" height="13" fill="#1dbf57" />
    <circle cx="10" cy="6.5" r="3.8" fill="#ffffff" />
    <circle cx="11.5" cy="6.5" r="3.1" fill="#1eb2fc" />
    <circle cx="16.5" cy="4" r="0.9" fill="#ffffff" />
    <circle cx="18.5" cy="4" r="0.9" fill="#ffffff" />
    <circle cx="20.5" cy="4" r="0.9" fill="#ffffff" />
  </svg>
);

const FlagRu = () => (
  <svg width="18" height="13" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg"
    className="rounded-[2px] border border-outline-variant/30 shrink-0">
    <rect width="60" height="13.3" fill="#ffffff" />
    <rect y="13.3" width="60" height="13.3" fill="#0039A6" />
    <rect y="26.6" width="60" height="13.4" fill="#D52B1E" />
  </svg>
);

const FlagEn = () => (
  <svg width="18" height="13" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg"
    className="rounded-[2px] border border-outline-variant/30 shrink-0">
    <rect width="60" height="40" fill="#012169" />
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="white" strokeWidth="5" />
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" strokeWidth="3" />
    <path d="M30 0 V40 M0 20 H60" stroke="white" strokeWidth="8" />
    <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="5" />
  </svg>
);

const langLabels: Record<Language, string> = {
  uz: "O'zb",
  ru: "Рус",
  en: "Eng",
};

const MobileLanguageSwitcher = () => {
  const [open, setOpen] = useState(false);
  const { language, setLanguage } = useLanguageStore();
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const langs: Language[] = ['uz', 'ru', 'en'];

  return (
    <div ref={ref} className="relative select-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-10 h-10 rounded-xl justify-center text-on-surface-variant hover:text-primary transition-colors relative"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.language.select}
      >
        {language === 'uz' && <FlagUz />}
        {language === 'ru' && <FlagRu />}
        {language === 'en' && <FlagEn />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[200] min-w-[140px] overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
          <ul role="listbox" className="py-1.5">
            {langs.map((lang) => (
              <li key={lang}>
                <button
                  role="option"
                  aria-selected={language === lang}
                  onClick={() => { setLanguage(lang); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                    language === lang
                      ? 'bg-primary-container/30 text-primary font-semibold'
                      : 'text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {lang === 'uz' && <FlagUz />}
                  {lang === 'ru' && <FlagRu />}
                  {lang === 'en' && <FlagEn />}
                  <span className="font-medium">{langLabels[lang]}</span>
                  {language === lang && (
                    <span className="material-symbols-outlined text-[15px] text-primary ml-auto">check</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const MobileTopBar = () => {
  const navigate = useNavigate();
  const itemCount = useCartStore((s) => s.itemCount());
  const { t } = useTranslation();

  return (
    <div className="md:hidden sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant/50 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Link to="/" className="text-[22px] font-black tracking-tight text-primary shrink-0 mr-1">
          Bozor
        </Link>

        <button
          onClick={() => navigate('/search')}
          className="flex-1 flex items-center gap-2 h-10 px-3 bg-surface-container rounded-xl border border-outline-variant text-left transition-colors hover:border-primary/50 active:bg-surface-container-low"
          aria-label={t.search.searchPlaceholder}
        >
          <span className="material-symbols-outlined text-[18px] text-outline shrink-0">search</span>
          <span className="text-sm text-outline/60 flex-1 select-none">{t.search.searchPlaceholder}</span>
        </button>

        <MobileLanguageSwitcher />

        <Link
          to="/cart"
          className="relative flex items-center justify-center w-10 h-10 rounded-xl text-on-surface-variant hover:text-primary transition-colors shrink-0"
          aria-label={t.nav.cart}
        >
          <span className="material-symbols-outlined text-[24px]">shopping_cart</span>
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-on-primary text-[9px] font-bold min-w-[17px] h-[17px] rounded-full flex items-center justify-center px-[3px] shadow border border-surface-container-lowest leading-none">
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
};

export default MobileTopBar;
