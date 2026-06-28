/**
 * CourierConfirmDialog — Kuryer DELIVERED → RECEIVED tasdiqlash modali.
 *
 * NIMA UCHUN BU DIALOG:
 *   "Xaridorga topshirildi" (RECEIVED) holatiga o'tish faqat mijoz telefoniga
 *   SMS bilan kelgan 6 xonali QABUL KODI orqali bo'ladi. Oddiy "status update"
 *   endpoint'i bu o'tishni 400 (`courier_confirm_required`) bilan rad etadi
 *   (XAVFSIZLIK GUARDRAIL — [orders/views.py:AdminOrderStatusUpdateView]).
 *   Yagona to'g'ri yo'l — POST /api/orders/<id>/courier-confirm/ kod bilan.
 *
 * UX OQIMI (kuryer ko'zi bilan):
 *   1) Eshikda mijoz bilan — telefonidagi SMS kodni o'qiyapti
 *   2) Kuryer "Xaridorga topshirildi" tugmani bosadi → bu dialog ochiladi
 *   3) 6 ta segment input — kod tutiladi (auto-fokus, auto-advance, paste qo'llaydi)
 *   4) Tasdiqlash → submit → muvaffaqiyat: status RECEIVED, dialog yopiladi
 *
 * RASM / GPS YO'Q:
 *   Biznes qarori — kuryer eshikda ortiqcha amal qilmasin. Tasdiqlash uchun
 *   faqat kod yetarli. Xavfsizlik to'liq kod tomonida (backend 6 qatlam:
 *   status guard, brute-force lockout, one-time-use, 24 soat TTL, code presence,
 *   constant-time taqqoslash).
 *
 * XATO BOSHQARUVI — backend `code` bo'yicha aniq xabar:
 *     wrong_status        → "Buyurtma DELIVERED holatida emas"  (race, sahifa eski)
 *     no_code             → "Buyurtma uchun kod yaratilmagan"
 *     wrong_code          → "Kod noto'g'ri" + qolgan urinishlar (5→4→3→...)
 *     too_many_attempts   → "5 ta noto'g'ri urinish — 1 soatga bloklandi"
 *     code_used           → "Kod allaqachon ishlatilgan"  (one-time-use)
 *     code_expired        → "Kod muddati o'tdi (24 soat)"
 *   Faqat `wrong_code` — kuryer qayta urina oladi (kod tozalanadi, fokus 1-ga).
 *   Boshqa xatolar — kuryer hech narsa qila olmaydi, 1.5s'dan keyin yopiladi.
 *
 * NIMA YO'Q:
 *   • Kod localStorage'ga saqlanmaydi (xotirada qoladi, dialog yopilsa o'chadi)
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { courierConfirmDelivery } from '../api/endpoints';
import { toast } from '../utils/toast';

interface Props {
  /** Buyurtma ID — dialog ochilganda raqam, yopilganda null */
  orderId: number | null;
  /** Buyurtma raqamini header'da ko'rsatish uchun (UX) */
  orderLabel?: string;
  onClose: () => void;
}

type ApiErrorCode =
  | 'wrong_status'
  | 'no_code'
  | 'wrong_code'
  | 'too_many_attempts'
  | 'code_used'
  | 'code_expired';

interface ApiError {
  error?: string;
  code?: ApiErrorCode;
  attempts_left?: number | string;
}

const CODE_LENGTH = 6;

/**
 * Backend xato kodi → foydalanuvchi uchun aniq xabar.
 * `attempts_left` mavjud bo'lsa, qolgan urinishlar soni ham ko'rsatiladi.
 */
function formatBackendError(err: ApiError | null): string {
  if (!err) return "Tasdiqlab bo'lmadi. Internet aloqasini tekshiring.";
  const left = err.attempts_left != null ? Number(err.attempts_left) : null;
  switch (err.code) {
    case 'wrong_code':
      return left != null
        ? `Kod noto'g'ri. Qolgan urinishlar: ${left}/5`
        : "Kod noto'g'ri. Qayta kiriting.";
    case 'too_many_attempts':
      return "5 ta noto'g'ri urinish. Buyurtma 1 soatga bloklandi — admin bilan bog'laning.";
    case 'code_expired':
      return "Qabul kodi muddati o'tdi (24 soat). Yangi kod uchun admin bilan bog'laning.";
    case 'code_used':
      return 'Bu kod allaqachon ishlatilgan. Buyurtma yopiq.';
    case 'no_code':
      return "Buyurtma uchun qabul kodi yaratilmagan. Admin bilan bog'laning.";
    case 'wrong_status':
      return 'Buyurtma DELIVERED holatida emas. Sahifani yangilang.';
    default:
      return err.error || "Tasdiqlab bo'lmadi. Qayta urining.";
  }
}

export const CourierConfirmDialog = ({ orderId, orderLabel, onClose }: Props) => {
  const qc = useQueryClient();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs har bir input maydoni uchun — auto-fokus va paste boshqaruvi
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LENGTH).fill(null));

  const isOpen = orderId !== null;

  // Dialog ochilganda — state'ni tozalash + 1-input fokus
  useEffect(() => {
    if (!isOpen) return;
    setDigits(Array(CODE_LENGTH).fill(''));
    setErrorMsg(null);

    // 1-input'ga fokus (modal animatsiyasi tugagach)
    const focusTimer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(focusTimer);
  }, [isOpen, orderId]);

  const handleDigitChange = (idx: number, raw: string) => {
    // Faqat raqam qoldiramiz
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigits((cur) => {
      const next = [...cur];
      next[idx] = digit;
      return next;
    });
    // Yangi raqam kiritilganda — keyingi input'ga avtomatik o'tish
    if (digit && idx < CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    setErrorMsg(null);
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      // Bo'sh input'da Backspace — oldingisiga qaytish
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < CODE_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Bitta inputga 6 xonali kod yopishtirilsa — to'liq taqsimlash
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (text.length === 0) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    const focusIdx = Math.min(text.length, CODE_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  const code = digits.join('');
  const isCodeReady = code.length === CODE_LENGTH;

  const mutation = useMutation({
    mutationFn: () => {
      if (!orderId) throw new Error('invalid state');
      return courierConfirmDelivery(orderId, { received_code: code });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-orders'] }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      toast.success('Buyurtma xaridorga muvaffaqiyatli topshirildi.');
      onClose();
    },
    onError: (e: any) => {
      const apiErr: ApiError = e?.response?.data ?? {};
      const msg = formatBackendError(apiErr);
      setErrorMsg(msg);
      // Faqat wrong_code — qayta urinish mumkin. Boshqa xatolarda kuryer
      // hech narsa qila olmaydi (lockout / used / expired / status) — toast
      // ko'rsatib, 1.5s'dan keyin dialog yopiladi.
      const errCode = apiErr.code;
      const isUserRecoverable = errCode === 'wrong_code' || errCode == null;
      if (!isUserRecoverable) {
        toast.error(msg);
        setTimeout(() => onClose(), 1500);
      }
      if (errCode === 'wrong_code') {
        setDigits(Array(CODE_LENGTH).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
    },
  });

  const handleSubmit = () => {
    if (!isCodeReady || mutation.isPending) return;
    setErrorMsg(null);
    mutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
      onClick={(e) => {
        // Tashqi qatlamga bossa yopish — mutation ishlayotganda yopilmaydi
        if (e.target === e.currentTarget && !mutation.isPending) onClose();
      }}
      role='dialog'
      aria-modal='true'
      aria-labelledby='courier-confirm-title'
    >
      <div className='w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-outline-variant'>
        {/* Header */}
        <div className='flex items-start justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4'>
          <div>
            <h2
              id='courier-confirm-title'
              className='font-h3 text-h3 text-on-surface'
            >
              Xaridorga topshirish
            </h2>
            <p className='mt-0.5 text-body-sm text-on-surface-variant'>
              {orderLabel ? `Buyurtma ${orderLabel}` : `Buyurtma #${orderId}`}
            </p>
          </div>
          <button
            type='button'
            onClick={() => !mutation.isPending && onClose()}
            disabled={mutation.isPending}
            className='rounded-full p-1 text-on-surface-variant hover:bg-surface-container disabled:opacity-50'
            aria-label='Yopish'
          >
            <span className='material-symbols-outlined'>close</span>
          </button>
        </div>

        {/* Body */}
        <div className='space-y-5 p-5'>
          <div>
            <label className='mb-2 block text-body-sm font-medium text-on-surface'>
              Mijozdan olgan 6 xonali qabul kodi
            </label>
            <div className='flex justify-center gap-2'>
              {digits.map((d, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type='text'
                  inputMode='numeric'
                  pattern='[0-9]*'
                  autoComplete='one-time-code'
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  disabled={mutation.isPending}
                  className={`h-14 w-12 rounded-lg border bg-surface-bright text-center text-h2 font-h3 outline-none transition-colors ${
                    errorMsg
                      ? 'border-red-500 focus:border-red-600'
                      : d
                        ? 'border-primary text-on-surface'
                        : 'border-outline-variant focus:border-primary'
                  } disabled:opacity-50`}
                  aria-label={`Kod ${idx + 1}-raqami`}
                />
              ))}
            </div>
            <p className='mt-2 text-center text-xs text-on-surface-variant'>
              Kod mijoz telefoniga SMS orqali yuborilgan.
            </p>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div
              role='alert'
              className='flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-body-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300'
            >
              <span className='material-symbols-outlined text-[18px]'>error</span>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='flex items-center justify-end gap-2 border-t border-outline-variant bg-surface-container-low px-5 py-4'>
          <button
            type='button'
            onClick={() => !mutation.isPending && onClose()}
            disabled={mutation.isPending}
            className='rounded-lg border border-outline-variant px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-50'
          >
            Bekor qilish
          </button>
          <button
            type='button'
            onClick={handleSubmit}
            disabled={!isCodeReady || mutation.isPending}
            className='flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {mutation.isPending ? (
              <>
                <span className='material-symbols-outlined animate-spin text-[18px]'>progress_activity</span>
                Tasdiqlanmoqda...
              </>
            ) : (
              <>
                <span className='material-symbols-outlined text-[18px]'>verified</span>
                Tasdiqlash
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
