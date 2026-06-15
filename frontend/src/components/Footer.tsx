import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation();

  return (
    <footer className="bg-surface-container-lowest border-t border-outline-variant/60 w-full mt-16 pb-20 md:pb-0">
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-10 md:py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">

          {/* Column 1 — Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-block mb-4">
              <span className="text-[28px] font-black tracking-tight text-primary">Bozor</span>
            </Link>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
              {t.footer.description}
            </p>
            <div className="flex flex-col gap-2.5">
              <a
                href="tel:+998941126777"
                className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[18px] text-primary">call</span>
                <span className="font-semibold">+998 94 112 67 77</span>
              </a>
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
                <span>{t.footer.location}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                <span>{t.footer.workHours}</span>
              </div>
            </div>
          </div>

          {/* Column 2 — Navigation */}
          <div>
            <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider mb-4">
              {t.footer.sections}
            </h3>
            <ul className="flex flex-col gap-2.5">
              {[
                { to: '/', label: t.footer.mainPage },
                { to: '/catalog', label: t.footer.catalog },
                { to: '/cart', label: t.footer.cart },
                { to: '/favorites', label: t.footer.favorites },
                { to: '/profile', label: t.footer.profile },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-on-surface-variant hover:text-primary transition-colors hover:translate-x-0.5 inline-flex items-center gap-1.5 group"
                  >
                    <span className="material-symbols-outlined text-[13px] opacity-0 group-hover:opacity-100 transition-all">
                      arrow_forward_ios
                    </span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Info */}
          <div>
            <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider mb-4">
              {t.footer.info}
            </h3>
            <ul className="flex flex-col gap-2.5">
              {[
                { to: '/payment-info', label: t.footer.paymentTypes },
                { to: '/delivery', label: t.footer.delivery },
                { to: '/returns', label: t.footer.returns },
                { to: '/terms', label: t.footer.terms },
                { to: '/privacy', label: t.footer.privacy },
                { to: '/about', label: t.footer.about },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-on-surface-variant hover:text-primary transition-colors hover:translate-x-0.5 inline-flex items-center gap-1.5 group"
                  >
                    <span className="material-symbols-outlined text-[13px] opacity-0 group-hover:opacity-100 transition-all">
                      arrow_forward_ios
                    </span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 — Social & Payment */}
          <div>
            <h3 className="font-bold text-on-surface text-sm uppercase tracking-wider mb-4">
              {t.footer.social}
            </h3>
            <div className="flex flex-col gap-3">
              <a
                href="https://t.me/bozoruz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-xl border border-outline-variant hover:border-primary/50 hover:bg-primary-container/10 transition-all group"
              >
                <svg className="w-5 h-5 text-[#2AABEE] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span className="text-sm text-on-surface group-hover:text-primary transition-colors">Telegram</span>
              </a>

              <a
                href="https://instagram.com/bozoruz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-xl border border-outline-variant hover:border-primary/50 hover:bg-primary-container/10 transition-all group"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f09433" />
                      <stop offset="25%" stopColor="#e6683c" />
                      <stop offset="50%" stopColor="#dc2743" />
                      <stop offset="75%" stopColor="#cc2366" />
                      <stop offset="100%" stopColor="#bc1888" />
                    </linearGradient>
                  </defs>
                  <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)"/>
                  <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.5" fill="none"/>
                  <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
                </svg>
                <span className="text-sm text-on-surface group-hover:text-primary transition-colors">Instagram</span>
              </a>
            </div>

            <div className="mt-5">
              <p className="text-xs text-on-surface-variant mb-2 font-medium">{t.footer.acceptedPayments}</p>
              <div className="flex flex-wrap gap-2">
                {[t.footer.cash, t.footer.cardPayment, t.footer.installment].map((method) => (
                  <span
                    key={method}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface-container border border-outline-variant text-on-surface-variant"
                  >
                    {method}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-outline-variant/40">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-on-surface-variant text-center sm:text-left">
            © {currentYear} Bozor. {t.footer.copyright}
          </p>
          <div className="flex items-center gap-1.5">
            <svg width="18" height="12" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-sm border border-outline-variant/30">
              <rect width="60" height="13" fill="#1eb2fc"/>
              <rect y="13" width="60" height="2" fill="#ffffff"/>
              <rect y="15" width="60" height="10" fill="#ffffff"/>
              <rect y="25" width="60" height="2" fill="#ffffff"/>
              <rect y="27" width="60" height="13" fill="#1dbf57"/>
            </svg>
            <span className="text-xs text-on-surface-variant">{t.footer.location}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
