/**
 * Web Audio API orqali sintezatlangan "bing" tovush.
 *
 * NIMA UCHUN ASSETSIZ (mp3 emas):
 *   • Asset yuklab olish kechikadi (~5-20 KB)
 *   • Sayt birinchi marta ochilganda zarar bermaslik kerak
 *   • Web Audio API barcha zamonaviy brauzerlarda mavjud
 *   • Tovush parametrlarini code'da boshqarish mumkin (uzunlik, balandlik)
 *
 * BRAUZER CHEKLOVI:
 *   Foydalanuvchi sahifaga interactsiya qilmagunga qadar AudioContext
 *   bloklanadi (Chrome/Safari avtoplay xavfsizlik siyosati). Admin login
 *   knopkasini bosishi -> interactsiya hisoblanadi -> tovush ishlaydi.
 *
 * O'CHIRISH:
 *   localStorage 'admin:sound-muted' = '1' -> tovush chiqarmaydi.
 *   Kelajakda Sozlamalar tab'idan toggle qo'shilishi mumkin.
 */

const MUTE_KEY = 'admin:sound-muted';

export const isNotificationSoundMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

export const setNotificationSoundMuted = (muted: boolean): void => {
  try {
    if (muted) {
      localStorage.setItem(MUTE_KEY, '1');
    } else {
      localStorage.removeItem(MUTE_KEY);
    }
  } catch {
    // localStorage o'chirilgan rejim — ignore
  }
};

/**
 * Sun'iy "bing-bong" tovush — yangi buyurtma keldi belgisi.
 * 2 ta yumshoq sine to'lqin (A5 -> E5), 200ms ichida sodir bo'ladi.
 */
export const playNewOrderSound = (): void => {
  if (isNotificationSoundMuted()) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    // Sahifa hali interactsiyaga ega bo'lmasa, suspended state'da bo'ladi —
    // resume() bilan urinib ko'ramiz (xato bo'lsa silently ignore)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.12, now); // umumiy hajm (~12%)
    masterGain.connect(ctx.destination);

    // 1-tovush: A5 (880 Hz), 0–150ms
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(1, now + 0.01); // tez ataki
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1).connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // 2-tovush: E5 (659 Hz), 100–250ms (yumshoq tushuvchi)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659, now + 0.1);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(1, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2).connect(masterGain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.25);

    // AudioContext'ni 1 sekund keyin yopamiz — memory leak'dan saqlanish
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Web Audio yo'q yoki boshqa xato — silently ignore
  }
};
