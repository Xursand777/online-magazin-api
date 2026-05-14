import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { registerUser, requestLoginOtp, verifyLoginOtp } from '../api/endpoints';
import { toast } from '../utils/toast';

const OTP_LENGTH = 6;

type LoginStep = 'phone' | 'otp';

const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  const tail = digits.slice(-4);
  return `+998 ** *** ${tail.slice(0, 2)} ${tail.slice(2)}`;
};

const Auth = () => {
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

  const [loginForm, setLoginForm] = useState({ phone: '' });
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [regForm, setRegForm] = useState({
    phone: '', password: '', confirm_password: '', terms_accepted: false,
  });

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSeconds((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (loginStep !== 'otp') return;
    const firstEmptyIndex = otpDigits.findIndex((digit) => !digit);
    const targetIndex = firstEmptyIndex === -1 ? OTP_LENGTH - 1 : firstEmptyIndex;
    otpRefs.current[targetIndex]?.focus();
  }, [loginStep, otpDigits]);

  const resetOtpState = () => {
    setOtpDigits(Array(OTP_LENGTH).fill(''));
    setOtpDebugCode('');
    setResendSeconds(0);
  };

  const startOtpStep = (phone: string, debugCode?: string) => {
    setLoginForm({ phone });
    setOtpDigits(Array(OTP_LENGTH).fill(''));
    setOtpDebugCode(debugCode || '');
    setLoginStep('otp');
    setResendSeconds(60);
  };

  const completeSession = async (payload: { user: any; access: string; refresh: string }) => {
    login(payload.user, payload.access, payload.refresh);
    const syncResult = await useCartStore.getState().syncLocalCartToBackend();
    await useCartStore.getState().fetchCart();
    if (syncResult.syncedCount > 0) {
      toast.success(`Savat akkauntga ko'chirildi (${syncResult.syncedCount} ta).`);
    }
    navigate(payload.user.is_admin && redirectTarget === '/' ? '/admin' : redirectTarget);
  };

  const handleRequestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await requestLoginOtp({ phone: loginForm.phone });
      startOtpStep(loginForm.phone, response.data?.debug_code);
      if (response.data?.debug_code) {
        toast.info('Test kodi sahifada ko\'rsatildi.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || "Kod yuborishda xatolik yuz berdi.");
      } else {
        setError("Ulanishda muammo. Server ishlab turibdimi?");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const code = otpDigits.join('');
    if (code.length !== OTP_LENGTH) {
      setError('6 xonali kodni to\'liq kiriting.');
      return;
    }

    setLoading(true);
    try {
      const response = await verifyLoginOtp({ phone: loginForm.phone, code });
      await completeSession(response.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Kod noto\'g\'ri yoki eskirgan.');
      } else {
        setError('Ulanishda muammo. Qayta urinib ko\'ring.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0) return;
    setError('');
    setLoading(true);
    try {
      const response = await requestLoginOtp({ phone: loginForm.phone });
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setOtpDebugCode(response.data?.debug_code || '');
      setResendSeconds(60);
      if (response.data?.debug_code) {
        toast.info('Yangi test kodi chiqarildi.');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || "Kod qayta yuborilmadi.");
      } else {
        setError("Ulanishda muammo. Qayta urinib ko'ring.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (regForm.password !== regForm.confirm_password) {
      setError("Parollar mos kelmadi.");
      return;
    }
    if (!regForm.terms_accepted) {
      setError("Shartlarga roziligingizni bildiring.");
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        phone: regForm.phone,
        password: regForm.password,
        confirm_password: regForm.confirm_password,
        terms_accepted: regForm.terms_accepted,
      });
      const response = await requestLoginOtp({ phone: regForm.phone });
      setIsLogin(true);
      startOtpStep(regForm.phone, response.data?.debug_code);
      toast.success("Ro'yxatdan o'tildi. Endi kodni tasdiqlang.");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        const msg = data?.phone?.[0] || data?.password?.[0] || data?.terms_accepted?.[0] || data?.error || "Ro'yxatdan o'tishda xatolik.";
        setError(msg);
      } else {
        setError("Ulanishda muammo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const updateOtpDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH).fill('').map((_, index) => pasted[index] || '');
    setOtpDigits(next);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH) - 1]?.focus();
  };

  const renderError = error ? (
    <div className="mb-5 flex items-center gap-2 rounded-xl border border-error/30 bg-error-container/60 px-4 py-3 text-sm text-on-error-container">
      <span className="material-symbols-outlined text-[18px]">error</span>
      <span>{error}</span>
    </div>
  ) : null;

  return (
    <div className="flex min-h-[calc(100vh-200px)] flex-grow items-center justify-center bg-surface-container-low px-4 py-8">
      <div className="w-full max-w-[460px]">
        <div className="mb-10 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-h1 font-h1 text-primary">Bozor</h1>
          </Link>
          <p className="mt-3 text-body-md text-on-surface-variant">Ishonchli bozor platformasi</p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-outline-variant bg-surface-container-lowest p-5 shadow-[0_16px_48px_rgba(15,23,42,0.10)] md:p-6">
          <div className="mb-6 flex rounded-2xl border border-outline-variant bg-surface-container-low p-1">
            <button
              onClick={() => {
                setIsLogin(true);
                setLoginStep('phone');
                setError('');
                resetOtpState();
              }}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                isLogin ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              Kirish
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError('');
                resetOtpState();
              }}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                !isLogin ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              Ro'yxatdan o'tish
            </button>
          </div>

          {renderError}

          {isLogin ? (
            loginStep === 'phone' ? (
              <form className="space-y-6" onSubmit={handleRequestOtp}>
                <div>
                  <div className="mb-2 text-xl font-bold text-on-surface">Telefon orqali kirish</div>
                  <p className="text-sm leading-6 text-on-surface-variant">
                    Telefon raqamingizni kiriting. Tasdiqlash kodi yuboriladi.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="phone-login">
                    Telefon raqam
                  </label>
                  <div className="flex items-center overflow-hidden rounded-2xl border border-outline-variant bg-surface-bright transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                    <span className="border-r border-outline-variant bg-surface-container px-4 py-4 text-lg text-on-surface-variant">+998</span>
                    <input
                      id="phone-login"
                      type="tel"
                      placeholder="90 123 45 67"
                      required
                      value={loginForm.phone}
                      onChange={(event) => setLoginForm({ phone: event.target.value })}
                      className="flex-1 bg-transparent px-4 py-4 text-lg text-on-surface outline-none placeholder:text-outline/60"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-60"
                >
                  {loading ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : null}
                  Kodni yuborish
                </button>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleVerifyOtp}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 text-xl font-bold text-on-surface">Tasdiqlash kodi</div>
                    <p className="text-sm leading-6 text-on-surface-variant">
                      {maskPhone(loginForm.phone)} raqamiga yuborilgan 6 xonali kodni kiriting.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep('phone');
                      setOtpDigits(Array(OTP_LENGTH).fill(''));
                      setOtpDebugCode('');
                      setResendSeconds(0);
                      setError('');
                    }}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    O'zgartirish
                  </button>
                </div>

                {otpDebugCode ? (
                  <div className="rounded-2xl border border-primary/30 bg-primary-container/10 px-4 py-3 text-sm text-primary">
                    Test kodi: <span className="font-bold tracking-[0.3em]">{otpDebugCode}</span>. SMS integratsiyasi hozircha yo'q, kod backend konsoliga ham chiqadi.
                  </div>
                ) : null}

                <div onPaste={handleOtpPaste}>
                  <div className="mb-2 block text-sm font-semibold text-on-surface">Kod</div>
                  <div className="grid grid-cols-6 gap-2 md:gap-3">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          otpRefs.current[index] = element;
                        }}
                        value={digit}
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => updateOtpDigit(index, event.target.value)}
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        className="h-14 rounded-2xl border border-outline-variant bg-surface-bright text-center text-xl font-bold text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 md:h-16 md:text-2xl"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-on-surface-variant">
                    {resendSeconds > 0 ? `Kodni qayta yuborish: 00:${String(resendSeconds).padStart(2, '0')}` : 'Kod kelmadimi?'}
                  </span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading || resendSeconds > 0}
                    className="font-semibold text-primary disabled:text-on-surface-variant"
                  >
                    Qayta yuborish
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-60"
                >
                  {loading ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : null}
                  Kirishni tasdiqlash
                </button>
              </form>
            )
          ) : (
            <form className="space-y-5" onSubmit={handleRegister}>
              <div>
                <div className="mb-2 text-xl font-bold text-on-surface">Akkaunt yaratish</div>
                <p className="text-sm leading-6 text-on-surface-variant">
                  Ro'yxatdan o'tgandan keyin telefon orqali kod bilan tasdiqlaysiz.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="phone-register">
                  Telefon raqam
                </label>
                <div className="flex items-center overflow-hidden rounded-2xl border border-outline-variant bg-surface-bright transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <span className="border-r border-outline-variant bg-surface-container px-4 py-4 text-lg text-on-surface-variant">+998</span>
                  <input
                    id="phone-register"
                    type="tel"
                    placeholder="90 123 45 67"
                    required
                    value={regForm.phone}
                    onChange={(event) => setRegForm({ ...regForm, phone: event.target.value })}
                    className="flex-1 bg-transparent px-4 py-4 text-lg text-on-surface outline-none placeholder:text-outline/60"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="password-reg">
                  Parol
                </label>
                <input
                  id="password-reg"
                  type="password"
                  placeholder="Kamida 8 ta belgi"
                  required
                  value={regForm.password}
                  onChange={(event) => setRegForm({ ...regForm, password: event.target.value })}
                  className="w-full rounded-2xl border border-outline-variant bg-surface-bright px-4 py-4 text-base text-on-surface outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="confirm-password">
                  Parolni tasdiqlang
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={regForm.confirm_password}
                  onChange={(event) => setRegForm({ ...regForm, confirm_password: event.target.value })}
                  className="w-full rounded-2xl border border-outline-variant bg-surface-bright px-4 py-4 text-base text-on-surface outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3">
                <input
                  id="terms"
                  type="checkbox"
                  checked={regForm.terms_accepted}
                  onChange={(event) => setRegForm({ ...regForm, terms_accepted: event.target.checked })}
                  className="mt-1 rounded border-outline-variant text-primary focus:ring-primary"
                />
                <span className="text-sm leading-6 text-on-surface-variant">
                  <a className="font-semibold text-primary hover:underline" href="#">
                    Shartlar va qoidalar
                  </a>
                  ga roziman.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-semibold text-on-primary transition-opacity hover:opacity-92 disabled:opacity-60"
              >
                {loading ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : null}
                Ro'yxatdan o'tish
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
