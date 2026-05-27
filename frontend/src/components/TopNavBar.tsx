import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { useLanguageStore, type Language } from '../store/languageStore';
import { useTranslation } from '../i18n/useTranslation';
import ThemeToggle from './ThemeToggle';
import GlobalSearch from './GlobalSearch';

// ─── Flag SVGs ───────────────────────────────────────────────────────────────
const FlagUz = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={Math.round(size * 0.7)} viewBox="0 0 60 40" fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="rounded-[2px] shadow-sm border border-outline-variant/30 shrink-0"
    aria-label="O'zbek tili">
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

const FlagRu = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={Math.round(size * 0.7)} viewBox="0 0 60 40" fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="rounded-[2px] shadow-sm border border-outline-variant/30 shrink-0"
    aria-label="Русский язык">
    <rect width="60" height="13.3" fill="#ffffff" />
    <rect y="13.3" width="60" height="13.3" fill="#0039A6" />
    <rect y="26.6" width="60" height="13.4" fill="#D52B1E" />
  </svg>
);

const FlagEn = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={Math.round(size * 0.7)} viewBox="0 0 60 40" fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="rounded-[2px] shadow-sm border border-outline-variant/30 shrink-0"
    aria-label="English">
    <rect width="60" height="40" fill="#012169" />
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="white" strokeWidth="5" />
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" strokeWidth="3" />
    <path d="M30 0 V40 M0 20 H60" stroke="white" strokeWidth="8" />
    <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="5" />
  </svg>
);

const langFlags: Record<Language, React.ReactElement> = {
  uz: <FlagUz />,
  ru: <FlagRu />,
  en: <FlagEn />,
};

const langLabels: Record<Language, string> = {
  uz: "O'zb",
  ru: "Рус",
  en: "Eng",
};

// ─── Language Switcher ───────────────────────────────────────────────────────
const LanguageSwitcher = () => {
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
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-container transition-colors cursor-pointer group"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {langFlags[language]}
        <span className="font-semibold text-on-surface text-[12.5px] group-hover:text-primary transition-colors">
          {langLabels[language]}
        </span>
        <span className={`material-symbols-outlined text-[14px] text-on-surface-variant transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[200] min-w-[148px] overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-[0_12px_40px_rgba(0,0,0,0.15)] backdrop-blur-sm">
          <div className="px-3 py-2 border-b border-outline-variant/30">
            <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
              {t.language.select}
            </span>
          </div>
          <ul role="listbox" className="py-1.5">
            {langs.map((lang) => (
              <li key={lang}>
                <button
                  role="option"
                  aria-selected={language === lang}
                  onClick={() => { setLanguage(lang); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    language === lang
                      ? 'bg-primary-container/30 text-primary font-semibold'
                      : 'text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {lang === 'uz' && <FlagUz size={22} />}
                  {lang === 'ru' && <FlagRu size={22} />}
                  {lang === 'en' && <FlagEn size={22} />}
                  <span className="flex-1 text-left font-medium">{t.language[lang]}</span>
                  {language === lang && (
                    <span className="material-symbols-outlined text-[16px] text-primary">check</span>
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

// ─── Top Info Bar ─────────────────────────────────────────────────────────────
const TopInfoBar = () => {
  const { t } = useTranslation();

  return (
    <div className="hidden md:flex bg-surface-container border-b border-outline-variant/40 text-[12.5px] text-on-surface-variant w-full">
      <div className="max-w-container-max mx-auto px-margin-desktop w-full flex items-center justify-between h-9 gap-4">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-default">
            <span className="material-symbols-outlined text-[15px] text-primary">location_on</span>
            <span className="font-medium">{t.topbar.location}</span>
          </div>
          <span className="w-px h-3.5 bg-outline-variant/60 shrink-0" />
          <Link
            to="/payment-info"
            className="flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">credit_card</span>
            <span>{t.topbar.paymentTypes}</span>
          </Link>
        </div>

        <div className="flex items-center gap-5">
          <a
            href="tel:+998941126777"
            className="flex items-center gap-1.5 hover:text-primary transition-colors font-medium"
          >
            <span className="material-symbols-outlined text-[15px]">call</span>
            {t.topbar.contact}&nbsp;<span className="text-primary font-bold tracking-wide">+998 94 112 67 77</span>
          </a>
          <span className="w-px h-3.5 bg-outline-variant/60 shrink-0" />
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
};

// ─── Main Nav Bar ─────────────────────────────────────────────────────────────
const TopNavBar = () => {
  const itemCount = useCartStore((s) => s.itemCount());
  const { isAuthenticated, user } = useAuthStore();
  const favoritesCount = useFavoritesStore((s) => s.favorites.length);
  const { t } = useTranslation();

  return (
    <>
      <TopInfoBar />

      <header className="hidden md:flex bg-surface-container-lowest border-b border-outline-variant/50 shadow-sm justify-between items-center px-4 md:px-8 py-3 w-full sticky top-0 z-50">
        <Link to="/" className="text-[32px] font-black tracking-tight text-primary mr-8 shrink-0">
          Bozor
        </Link>

        <div className="flex-1 max-w-[840px] px-4">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-6 ml-4 shrink-0">
          <ThemeToggle />

          <Link
            to={isAuthenticated ? "/profile?tab=orders" : "/auth"}
            className="group flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[26px] group-hover:-translate-y-0.5 transition-transform">inventory_2</span>
            <span className="text-[12px] font-semibold tracking-wide">{t.nav.orders}</span>
          </Link>

          <Link to="/cart" aria-label={t.nav.cart} className="group relative flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
            <div className="relative">
              <span className="material-symbols-outlined text-[26px] group-hover:-translate-y-0.5 transition-transform">shopping_cart</span>
              {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-on-primary text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-surface-container-lowest">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </div>
            <span className="text-[12px] font-semibold tracking-wide">{t.nav.cart}</span>
          </Link>

          <Link to="/favorites" aria-label={t.nav.favorites} className="group flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
            <div className="relative">
              <span className="material-symbols-outlined text-[26px] group-hover:-translate-y-0.5 transition-transform">favorite_border</span>
              {favoritesCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-surface-container-lowest">
                  {favoritesCount > 99 ? '99+' : favoritesCount}
                </span>
              )}
            </div>
            <span className="text-[12px] font-semibold tracking-wide">{t.nav.favorites}</span>
          </Link>

          {isAuthenticated ? (
            <Link to="/profile" className="group flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
              <div className="w-[26px] h-[26px] rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-[11px] group-hover:-translate-y-0.5 transition-transform">
                {user?.phone?.slice(-2) || 'U'}
              </div>
              <span className="text-[12px] font-semibold tracking-wide">{t.nav.profile}</span>
            </Link>
          ) : (
            <Link to="/auth" className="group flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[26px] group-hover:-translate-y-0.5 transition-transform">person</span>
              <span className="text-[12px] font-semibold tracking-wide">{t.nav.login}</span>
            </Link>
          )}
        </div>
      </header>
    </>
  );
};

export default TopNavBar;
