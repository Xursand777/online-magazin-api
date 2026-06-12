/**
 * GeoPermissionModal — Geolokatsiya ruxsati bloklangan holatda
 * foydalanuvchiga professional yo'l-yo'riq beradi.
 *
 * XULQ:
 *   • Brauzer aniqlanadi (Chrome, Safari, Firefox, Edge, Opera) va har
 *     biriga aniq qadamlar ko'rsatiladi (UI joyi, tugmalar nomi).
 *   • Mobile va Desktop alohida ko'rsatma — iOS va Android sozlamalari
 *     boshqa joyda.
 *   • Foydalanuvchi 3 ta variant tanlay oladi:
 *       1. "Qayta urinish" — brauzer holatini qayta tekshiradi
 *       2. "Qo'lda kiritish" — manual address kiritishga o'tadi
 *       3. "Bekor qilish" — modal yopiladi
 *   • Modal yopilganda parent componentga callback orqali xabar beradi.
 *
 * SAYTLAR ANALOGIYA:
 *   • Yandex.Eda: ruxsat berilmagan holatda xuddi shunday modal
 *   • Google Maps: brauzer aniqlanadi va aniq qadamlar ko'rsatiladi
 *   • Uber: video instructions
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import {
  detectBrowser,
  isIOS,
  isMobileDevice,
  queryGeolocationPermission,
  type BrowserKind,
} from '../utils/geolocation';

interface GeoPermissionModalProps {
  open: boolean;
  /** Modal yopilganda chaqiriladi (X tugmasi, ESC, backdrop). */
  onClose: () => void;
  /** Foydalanuvchi qo'lda kiritishni tanlasa chaqiriladi. */
  onManualEntry: () => void;
  /**
   * Foydalanuvchi "Qayta urinish" bossa chaqiriladi.
   * Async — async bo'lsa, tugma loading holatida bo'ladi.
   */
  onRetry: () => Promise<void> | void;
}

const GeoPermissionModal = ({ open, onClose, onManualEntry, onRetry }: GeoPermissionModalProps) => {
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);

  // Brauzer/qurilma aniqlash — render paytida (useMemo bilan yagona hisob).
  // navigator.userAgent xizmat davomida o'zgarmaydi, shuning uchun state shart emas.
  const browser = useMemo(() => detectBrowser(), []);
  const mobile = useMemo(() => isMobileDevice(), []);
  const ios = useMemo(() => isIOS(), []);

  // ESC tugmasi yoki backdrop click bilan yopish
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Body scroll'ni bloklash
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // Avval qayta tekshiramiz — foydalanuvchi sozlamalardan ruxsat berishi mumkin
      const state = await queryGeolocationPermission();
      if (state === 'denied') {
        // Hali ham denied — foydalanuvchi sozlamani o'zgartirmagan
        // toast emas — modal'da xabar
        setRetrying(false);
        return;
      }
      // granted yoki prompt — parent funksiyasi davom etadi
      await onRetry();
      onClose();
    } catch (err) {
      console.error('[GeoPermissionModal] retry xato:', err);
    } finally {
      setRetrying(false);
    }
  };

  // Brauzer aniq yo'l-yo'riqlari (translations'dan kalit hosil qilish)
  const instructionsKey = getInstructionsKey(browser, mobile, ios);
  const instructions = t.profile.geoModal.instructions[instructionsKey];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="geo-modal-title"
    >
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 border-b border-outline-variant">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-primary-container text-[26px]">
                location_off
              </span>
            </div>
            <div className="flex-1 pt-1">
              <h2
                id="geo-modal-title"
                className="text-lg font-bold text-on-surface mb-1"
              >
                {t.profile.geoModal.title}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t.profile.geoModal.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-surface-container transition-colors"
            aria-label={t.profile.geoModal.close}
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* Brauzerga qarab yo'l-yo'riq */}
        <div className="p-6">
          <div className="mb-4 flex items-center gap-2 text-xs text-on-surface-variant uppercase tracking-wide font-semibold">
            <span className="material-symbols-outlined text-[16px]">
              {getBrowserIcon(browser)}
            </span>
            {t.profile.geoModal.browserLabel}: {getBrowserName(browser)}
            {mobile && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">
                {ios ? 'iOS' : t.profile.geoModal.mobileTag}
              </span>
            )}
          </div>

          <ol className="space-y-3 mb-5">
            {instructions.map((step, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-sm text-on-surface flex-1 leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>

          {/* Yangilanish/Reload eslatmasi */}
          <div className="mb-4 p-3 rounded-xl bg-primary/8 border border-primary/15 flex gap-2.5">
            <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">
              info
            </span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {t.profile.geoModal.reloadHint}
            </p>
          </div>

          {/* Action tugmalari */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {retrying ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </span>
                  {t.profile.geoModal.checking}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  {t.profile.geoModal.retry}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                onManualEntry();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">edit_location</span>
              {t.profile.geoModal.manual}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Translations kaliti — brauzer + qurilma kombinatsiyasi. */
function getInstructionsKey(
  browser: BrowserKind,
  mobile: boolean,
  ios: boolean,
): keyof ReturnType<typeof useTranslation>['t']['profile']['geoModal']['instructions'] {
  if (ios) return 'safariMobile';
  if (mobile && (browser === 'chrome' || browser === 'edge')) return 'chromeMobile';
  if (mobile && browser === 'firefox') return 'firefoxMobile';
  if (browser === 'chrome' || browser === 'edge') return 'chromeDesktop';
  if (browser === 'safari') return 'safariDesktop';
  if (browser === 'firefox') return 'firefoxDesktop';
  if (browser === 'opera') return 'operaDesktop';
  return 'generic';
}

/** Brauzer ikonkasi (Material Symbols). */
function getBrowserIcon(browser: BrowserKind): string {
  switch (browser) {
    case 'chrome':
    case 'edge':
    case 'opera':
    case 'firefox':
    case 'safari':
      return 'public';
    default:
      return 'language';
  }
}

/** Brauzer ko'rinish nomi. */
function getBrowserName(browser: BrowserKind): string {
  switch (browser) {
    case 'chrome':
      return 'Chrome';
    case 'safari':
      return 'Safari';
    case 'firefox':
      return 'Firefox';
    case 'edge':
      return 'Microsoft Edge';
    case 'opera':
      return 'Opera';
    default:
      return 'Brauzer';
  }
}

export default GeoPermissionModal;
