/**
 * notificationSound.ts — yangi buyurtma "bing-bong" eslatma tovushi.
 *
 * Web Audio API orqali sintez qilingan tovush (mp3 asset yo'q).
 *
 * ── ISHONCHLILIK (eng muhim) ─────────────────────────────────────────────────
 * Brauzerlar avtoplay siyosati: AudioContext FAQAT foydalanuvchi sahifaga
 * interaksiya qilgandan keyin "running" holatga o'tadi. Avvalgi versiya HAR
 * chaqiruvda YANGI AudioContext yaratardi — bu (a) brauzer context limitiga
 * uriladi, (b) yangi context "suspended" bo'ladi va resume() async bo'lgani
 * uchun tovush ko'pincha CHIQMAYDI.
 *
 * YECHIM:
 *   • YAGONA, qayta ishlatiladigan AudioContext (sharedCtx).
 *   • primeNotificationSound(): birinchi bosish/teginish/klaviatura bilan
 *     kontekstni resume qiladi — shundan keyin barcha eslatmalar ishonchli
 *     ishlaydi (admin login tugmasini bosishi yetarli).
 *   • playNewOrderSound(): suspended bo'lsa avval resume, keyin tovushni
 *     joriy currentTime'ga nisbatan rejalashtiradi. Kontekst yopilmaydi.
 *
 * O'CHIRISH:
 *   localStorage 'admin:sound-muted' = '1' -> tovush chiqarmaydi.
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
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* localStorage o'chirilgan — ignore */
  }
};

// ── Yagona AudioContext (qayta ishlatiladi) ──────────────────────────────────
let sharedCtx: AudioContext | null = null;
let unlockInstalled = false;

const getCtx = (): AudioContext | null => {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedCtx;
};

/**
 * Tovushni "unlock" qilish — birinchi foydalanuvchi interaksiyasida AudioContext
 * resume qilinadi. Bir marta o'rnatiladi (App yoki Admin mount'da chaqiriladi).
 * Listenerlar olib tashlanmaydi: tab fonga ketib qaytsa, keyingi bosishda yana
 * resume bo'ladi (running bo'lsa resume — no-op, arzon).
 */
export const primeNotificationSound = (): void => {
  if (unlockInstalled) return;
  unlockInstalled = true;
  const unlock = () => {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  (['pointerdown', 'keydown', 'touchstart'] as const).forEach((evt) =>
    window.addEventListener(evt, unlock, { passive: true }),
  );
};

// "bing-bong" — 2 ta yumshoq sine (A5 -> E5), yangi buyurtma belgisi.
const scheduleDingDong = (ctx: AudioContext): void => {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.16, now); // umumiy hajm (~16%)
  master.connect(ctx.destination);

  // 1-tovush: A5 (880 Hz)
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0, now);
  g1.gain.linearRampToValueAtTime(1, now + 0.01);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc1.connect(g1).connect(master);
  osc1.start(now);
  osc1.stop(now + 0.16);

  // 2-tovush: E5 (659 Hz) — yumshoq tushuvchi
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659, now + 0.12);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, now + 0.12);
  g2.gain.linearRampToValueAtTime(1, now + 0.13);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
  osc2.connect(g2).connect(master);
  osc2.start(now + 0.12);
  osc2.stop(now + 0.32);
};

/**
 * Yangi buyurtma tovushi. Ishonchli: yagona kontekst, kerak bo'lsa resume.
 */
export const playNewOrderSound = (): void => {
  if (isNotificationSoundMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const play = () => {
    try {
      scheduleDingDong(ctx);
    } catch {
      /* ignore */
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(play).catch(() => {});
  } else {
    play();
  }
};
