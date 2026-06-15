import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { useFavoritesStore } from '../store/favoritesStore';
import { registerUser, requestLoginOtp, verifyLoginOtp, loginWithPassword } from '../api/endpoints';
import { recordTokenIssued } from '../api/client';
import { toast } from '../utils/toast';
import { useTranslation } from '../i18n/useTranslation';

const OTP_LENGTH = 6;
type LoginStep = 'phone' | 'otp' | 'password';

// ─── Phone utils ─────────────────────────────────────────────────────────────

// ─── PhoneInput — MODULE LEVEL ──────────────────────────────────────────────
//
// MUHIM: Bu komponent Auth() ichida EMAS, modul darajasida e'lon qilingan.
// Auth ichida bo'lsa har render yangi funksiya referensi → React demount/remount
// → fokus yo'qoladi. Modul darajasida bo'lganda referens barqaror, fokus saqlanadi.
//
// UX yondashuvi: +998 prefix qo'shma blokda, input ichida faqat 9 ta xom raqam.
// maxLength YO'Q — onChange o'zi slice(0,9) bilan cheklaydi. Bu cursor jumping va
// maxLength/format konfliktini butunlay bartaraf etadi (Telegram, OLX, Uzum uslubi).

interface PhoneInputProps {
  id: string;
  digits: string;
  onChange: (val: string) => void;
  isComplete: boolean;
  autoFocus?: boolean;
}

const PhoneInput = ({ id, digits, onChange, isComplete, autoFocus }: PhoneInputProps) => {
  const len = digits.replace(/\D/g, '').length;
  return (
    <div
      className={`flex items-center overflow-hidden rounded-2xl border bg-surface-bright transition-all duration-150 ${
        isComplete
          ? 'border-primary ring-2 ring-primary/15'
          : 'border-outline-variant focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15'
      }`}
    >
      {/* Prefix — bosilmaydi, faqat ko'rsatish uchun */}
      <span className="flex shrink-0 select-none items-center gap-1.5 border-r border-outline-variant bg-surface-container px-4 py-4 font-mono text-base font-semibold text-on-surface-variant">
        🇺🇿 +998
      </span>

      {/* Faqat 9 ta raqam — formatsiz, cursor muammosiz */}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        placeholder="901234567"
        value={digits}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value.replace(/\D/g, '').slice(0, 9))
        }
        className="min-w-0 flex-1 bg-transparent px-4 py-4 font-mono text-lg tracking-widest text-on-surface outline-none placeholder:text-outline/40"
        autoComplete="tel-national"
        autoFocus={autoFocus}
      />

      {/* Holat indikatori */}
      <div className="shrink-0 pr-4">
        {isComplete ? (
          <span className="material-symbols-outlined text-[22px] text-primary">check_circle</span>
        ) : len > 0 ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-container text-[11px] font-bold text-on-surface-variant">
            {9 - len}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/** 9 ta raqamdan to'liq +998XXXXXXXXX telefon hosil qiladi */
const toFullPhone = (digits9: string) => `+998${digits9.replace(/\D/g, '')}`;

/** OTP ekranida ko'rinadigan qisman yashirilgan raqam */
const maskPhone = (digits9: string) => {
  const d = digits9.replace(/\D/g, '').slice(0, 9);
  if (d.length < 9) return `+998 ${d}`;
  // +998 XX *** ** XX — o'rta qismi yashiriladi
  return `+998 ${d.slice(0, 2)} *** ${d.slice(5, 7)} ${d.slice(7)}`;
};

// ─── Component ───────────────────────────────────────────────────────────────

const Auth = () => {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [loginStep, setLoginStep] = useState<LoginStep>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpDebugCode, setOtpDebugCode] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const redirectTarget = searchParams.get('redirect') || '/';
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Telefon: faqat 9 ta raqam saqlanadi (prefix +998 ko'rsatiladi, lekin saqlanmaydi)
  const [loginDigits, setLoginDigits] = useState('');
  // Parol bilan kirish (asosan super_admin/xodim uchun; Eskiz SMS tayyor
  // bo'lmagan vaqtinchalik davrda asosiy xavfsiz kirish yo'li)
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpPhone, setOtpPhone] = useState(''); // OTP yuborilgan 9-raqamli digits

  const [regDigits, setRegDigits] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regTerms, setRegTerms] = useState(false);

  // Password visibility toggles
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  // ─── Timers ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = window.setTimeout(() => setResendSeconds((s) => Math.max(s - 1, 0)), 1000);
    return () => window.clearTimeout(t);
  }, [resendSeconds]);

  useEffect(() => {
    if (loginStep !== 'otp') return;
    const idx = otpDigits.findIndex((d) => !d);
    otpRefs.current[idx === -1 ? OTP_LENGTH - 1 : idx]?.focus();
  }, [loginStep, otpDigits]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const resetOtp = () => {
    setOtpDigits(Array(OTP_LENGTH).fill(''));
    setOtpDebugCode('');
    setResendSeconds(0);
  };

  const switchTab = (toLogin: boolean) => {
    setIsLogin(toLogin);
    setLoginStep('phone');
    setError('');
    resetOtp();
  };

  const completeSession = async (payload: { user: any; access?: string; refresh?: string }) => {
    // local dev SameSite fallback: agar body'da tokenlar kelsa saqlab qo'yamiz
    if (payload.access) {
      localStorage.setItem('access_token', payload.access);
      if (payload.refresh) {
        localStorage.setItem('refresh_token', payload.refresh);
      }
    }
    // Token yangilanish vaqtini qayd etamiz — proaktiv refresh timer uchun.
    // Har ikkala holatda ham (cookie yoki localStorage) vaqtni saqlaymiz.
    recordTokenIssued();
    login(payload.user);
    
    // Sync cart and favorites parallel
    const syncCartPromise = useCartStore.getState().syncLocalCartToBackend()
      .then((syncResult) => {
        useCartStore.getState().fetchCart();
        if (syncResult.syncedCount > 0) {
          toast.success(`Savat akkauntga ko'chirildi (${syncResult.syncedCount} ta).`);
        }
      });

    const syncFavoritesPromise = useFavoritesStore.getState().syncLocalFavoritesToBackend()
      .then(() => {
        useFavoritesStore.getState().fetchFavorites();
      });

    Promise.all([syncCartPromise, syncFavoritesPromise]).catch(console.error);

    navigate(payload.user.is_admin && redirectTarget === '/' ? '/admin' : redirectTarget);
  };

  const extractError = (err: unknown): string => {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data;
      return (
        data?.phone?.[0] ||
        data?.password?.[0] ||
        data?.terms_accepted?.[0] ||
        data?.non_field_errors?.[0] ||
        data?.error ||
        data?.detail ||
        t.auth.errors.generic
      );
    }
    return t.auth.errors.connection;
  };

  // ─── Login handlers ───────────────────────────────────────────────────────

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    const digits = loginDigits.replace(/\D/g, '');
    if (digits.length !== 9) {
      setError(t.auth.errors.phoneRequired);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await requestLoginOtp({ phone: toFullPhone(digits) });
      setOtpPhone(digits);
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setOtpDebugCode(res.data?.debug_code || '');
      setLoginStep('otp');
      setResendSeconds(60);
      if (res.data?.debug_code) toast.info("Test kodi sahifada ko'rsatildi.");
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== OTP_LENGTH) {
      setError(t.auth.errors.otpRequired);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await verifyLoginOtp({ phone: toFullPhone(otpPhone), code });
      await completeSession(res.data);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    const digits = loginDigits.replace(/\D/g, '');
    if (digits.length !== 9) {
      setError(t.auth.errors.phoneRequired);
      return;
    }
    if (!loginPassword) {
      setError(t.auth.errors.passwordRequired);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await loginWithPassword({ phone: toFullPhone(digits), password: loginPassword });
      await completeSession(res.data);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0) return;
    setError('');
    setLoading(true);
    try {
      const res = await requestLoginOtp({ phone: toFullPhone(otpPhone) });
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setOtpDebugCode(res.data?.debug_code || '');
      setResendSeconds(60);
      if (res.data?.debug_code) toast.info('Yangi test kodi chiqarildi.');
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  // ─── Register handler ─────────────────────────────────────────────────────

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    const digits = regDigits.replace(/\D/g, '');
    if (digits.length !== 9) {
      setError(t.auth.errors.phoneRequired);
      return;
    }
    if (regPassword !== regConfirm) {
      setError(t.auth.errors.passwordMismatch);
      return;
    }
    if (!regTerms) {
      setError(t.auth.errors.termsRequired);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullPhone = toFullPhone(digits);
      await registerUser({
        phone: fullPhone,
        password: regPassword,
        confirm_password: regConfirm,
        terms_accepted: regTerms,
      });
      const res = await requestLoginOtp({ phone: fullPhone });
      setOtpPhone(digits);
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setOtpDebugCode(res.data?.debug_code || '');
      setIsLogin(true);
      setLoginStep('otp');
      setResendSeconds(60);
      toast.success("Ro'yxatdan o'tildi. Endi kodni tasdiqlang.");
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP input helpers ────────────────────────────────────────────────────

  const updateOtpDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits((cur) => {
      const next = [...cur];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setOtpDigits(Array(OTP_LENGTH).fill('').map((_, i) => pasted[i] || ''));
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH) - 1]?.focus();
  };


  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-[calc(100vh-200px)] flex-grow items-center justify-center bg-surface-container-low px-4 py-8">
      <div className="w-full max-w-[460px]">
        {/* Logo */}
        <div className="mb-10 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-h1 font-h1 text-primary">Bozor</h1>
          </Link>
          <p className="mt-3 text-body-md text-on-surface-variant">{t.auth.platformSlogan}</p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-lowest p-5 shadow-[0_16px_48px_rgba(15,23,42,0.10)] md:p-6">
          {/* Tab switcher */}
          <div className="mb-6 flex rounded-2xl border border-outline-variant bg-surface-container-low p-1">
            <button
              onClick={() => switchTab(true)}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                isLogin ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              {t.auth.login}
            </button>
            <button
              onClick={() => switchTab(false)}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                !isLogin ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              {t.auth.register}
            </button>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-error/30 bg-error-container/60 px-4 py-3 text-sm text-on-error-container">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── LOGIN FLOW ── */}
          {isLogin && loginStep === 'phone' && (
            <form className="space-y-6" onSubmit={handleRequestOtp}>
              <div>
                <p className="mb-1 text-xl font-bold text-on-surface">{t.auth.loginTitle}</p>
                <p className="text-sm leading-6 text-on-surface-variant">
                  {t.auth.loginSubtitle}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="phone-login">
                  {t.auth.phoneLabel}
                </label>
                <PhoneInput
                  id="phone-login"
                  digits={loginDigits}
                  onChange={setLoginDigits}
                  isComplete={loginDigits.replace(/\D/g, '').length === 9}
                />
                <p className="mt-1.5 text-xs text-on-surface-variant">
                  {t.auth.example}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || loginDigits.replace(/\D/g, '').length !== 9}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-50"
              >
                {loading && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
                {t.auth.sendCode}
              </button>

              <button
                type="button"
                onClick={() => { setError(''); setLoginStep('password'); }}
                className="w-full text-center text-sm font-semibold text-primary hover:underline"
              >
                {t.auth.passwordLoginCta}
              </button>
            </form>
          )}

          {/* ── PASSWORD LOGIN STEP ── */}
          {isLogin && loginStep === 'password' && (
            <form className="space-y-6" onSubmit={handlePasswordLogin}>
              <div>
                <p className="mb-1 text-xl font-bold text-on-surface">{t.auth.passwordLoginTitle}</p>
                <p className="text-sm leading-6 text-on-surface-variant">{t.auth.passwordLoginSubtitle}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="phone-pw-login">
                  {t.auth.phoneLabel}
                </label>
                <PhoneInput
                  id="phone-pw-login"
                  digits={loginDigits}
                  onChange={setLoginDigits}
                  isComplete={loginDigits.replace(/\D/g, '').length === 9}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="pw-login">
                  {t.auth.passwordLabel}
                </label>
                <div className="relative">
                  <input
                    id="pw-login"
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-outline-variant bg-surface-bright px-4 py-4 pr-12 text-base text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((s) => !s)}
                    aria-label={showLoginPassword ? t.auth.passwordHide : t.auth.passwordShow}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                  >
                    <span className="material-symbols-outlined text-[20px]">{showLoginPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || loginDigits.replace(/\D/g, '').length !== 9 || !loginPassword}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-50"
              >
                {loading && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
                {t.auth.passwordLoginButton}
              </button>

              <button
                type="button"
                onClick={() => { setError(''); setLoginPassword(''); setLoginStep('phone'); }}
                className="w-full text-center text-sm font-semibold text-primary hover:underline"
              >
                {t.auth.smsLoginCta}
              </button>
            </form>
          )}

          {/* ── OTP STEP ── */}
          {isLogin && loginStep === 'otp' && (
            <form className="space-y-6" onSubmit={handleVerifyOtp}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-xl font-bold text-on-surface">{t.auth.otpTitle}</p>
                  <p className="text-sm leading-6 text-on-surface-variant">
                    <span className="font-mono font-semibold text-on-surface">{maskPhone(otpPhone)}</span> {t.auth.otpSubtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep('phone');
                    resetOtp();
                    setError('');
                  }}
                  className="shrink-0 text-sm font-semibold text-primary hover:underline"
                >
                  {t.auth.changeNumber}
                </button>
              </div>

              {/* OTP debug code — faqat development rejimida ko'rinadi */}
              {import.meta.env.DEV && otpDebugCode && (
                <div className="rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-1">
                    <span className="material-symbols-outlined text-[16px]">developer_mode</span>
                    <span className="font-semibold text-xs uppercase tracking-wide">{t.auth.devMode}</span>
                  </div>
                  <span className="font-bold tracking-[0.35em] text-amber-800 dark:text-amber-300 text-lg">{otpDebugCode}</span>
                </div>
              )}

              <div>
                <p className="mb-2 block text-sm font-semibold text-on-surface">{t.auth.codeLabel}</p>
                <div className="grid grid-cols-6 gap-2 md:gap-3" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      value={digit}
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => updateOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="h-14 rounded-2xl border border-outline-variant bg-surface-bright text-center text-xl font-bold text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 md:h-16 md:text-2xl"
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface-variant">
                  {resendSeconds > 0
                    ? `${t.auth.resendTimer} 00:${String(resendSeconds).padStart(2, '0')}`
                    : t.auth.noCode}
                </span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resendSeconds > 0}
                  className="font-semibold text-primary disabled:text-on-surface-variant"
                >
                  {t.auth.resendCode}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-60"
              >
                {loading && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
                {t.auth.verifyCode}
              </button>
            </form>
          )}

          {/* ── REGISTER FORM ── */}
          {!isLogin && (
            <form className="space-y-5" onSubmit={handleRegister}>
              <div>
                <p className="mb-1 text-xl font-bold text-on-surface">{t.auth.registerTitle}</p>
                <p className="text-sm leading-6 text-on-surface-variant">
                  {t.auth.registerSubtitle}
                </p>
              </div>

              {/* Phone */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="phone-register">
                  {t.auth.phoneLabel}
                </label>
                <PhoneInput
                  id="phone-register"
                  digits={regDigits}
                  onChange={setRegDigits}
                  isComplete={regDigits.replace(/\D/g, '').length === 9}
                />
                <p className="mt-1.5 text-xs text-on-surface-variant">
                  {t.auth.example}
                </p>
              </div>

              {/* Password */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="password-reg">
                  {t.auth.password}
                </label>
                <div className="relative">
                  <input
                    id="password-reg"
                    type={showRegPassword ? 'text' : 'password'}
                    placeholder={t.auth.minChars}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full rounded-2xl border border-outline-variant bg-surface-bright px-4 pr-12 py-4 text-base text-on-surface outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowRegPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-lg"
                    aria-label={showRegPassword ? t.auth.passwordHide : t.auth.passwordShow}
                  >
                    <span className="material-symbols-outlined text-[22px]">
                      {showRegPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="confirm-password">
                  {t.auth.confirmPassword}
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showRegConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    required
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    className={`w-full rounded-2xl border bg-surface-bright px-4 pr-12 py-4 text-base text-on-surface outline-none transition-shadow focus:ring-2 focus:ring-primary/15 ${
                      regConfirm && regConfirm !== regPassword
                        ? 'border-error focus:border-error'
                        : 'border-outline-variant focus:border-primary'
                    }`}
                  />
                  {/* Show/hide icon — agar to'g'ri bo'lsa checkmark, aks holda visibility toggle */}
                  {regConfirm && regConfirm === regPassword ? (
                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-primary text-[20px] pointer-events-none">
                      check_circle
                    </span>
                  ) : (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowRegConfirm((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-lg"
                      aria-label={showRegConfirm ? t.auth.passwordHide : t.auth.passwordShow}
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {showRegConfirm ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  )}
                </div>
                {regConfirm && regConfirm !== regPassword && (
                  <p className="mt-1 text-xs text-error">{t.auth.errors.passwordMismatch}</p>
                )}
              </div>

              {/* Terms */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3">
                <input
                  type="checkbox"
                  checked={regTerms}
                  onChange={(e) => setRegTerms(e.target.checked)}
                  className="mt-1 rounded border-outline-variant accent-primary"
                />
                <span className="text-sm leading-6 text-on-surface-variant">
                  <a className="font-semibold text-primary hover:underline" href="#">
                    {t.auth.termsLink}
                  </a>
                  {' '}{t.auth.termsAgree}
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || regDigits.replace(/\D/g, '').length !== 9}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-50"
              >
                {loading && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
                {t.auth.register}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
