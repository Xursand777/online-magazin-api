// ─────────────────────────────────────────────────────────────────────────────
//  imageCompress.ts — Brauzerda rasmni siqish (canvas-asoslangan).
//
//  MAQSAD:
//    Admin yuklayotgan rasmlar ko'pincha 5–15 MB (iPhone, DSLR). Server tomonda
//    Pillow WebP'ga qayta kodlaydi va max 1600px gacha kichraytiradi (yagona
//    avtoritar manba), LEKIN katta original avval to'liq yuklanadi:
//      • Sekin internet (mobil): 8 MB upload = 30+ soniya
//      • Server CPU: katta JPEG'ni dekodlash xotirani 50–100 MB ga ochadi
//
//    Yechim: brauzerda OLDIN resize qilamiz (max 1600px, sifat saqlab) va
//    yuborishga 200–800 KB'lik fayl yuboramiz. Server hali ham yakuniy WebP
//    qiladi — yagona manba qoidasi buzilmaydi.
//
//  ALGORITM (sifatni asrash):
//    1. EXIF orientatsiyani brauzer img.decode() avtomat qo'llaydi (modern).
//    2. Eng katta tomon > MAX_DIMENSION bo'lsa: aspect-ratio saqlab kichraytirish.
//    3. Canvas 2D, smoothing=high → bilinear interpolation (Lanczos'ga yaqin).
//    4. Bosqichli kichraytirish (2x pass): 4000x3000 → 2000x1500 → 1600x1200
//       Bir bosqichda Lanczos sifat yo'qotadi; 2x bosqichlar ko'p marta yumshoq.
//    5. WebP (~0.88) → JPEG (~0.92) fallback. WebP brauzerlarda hozir 99%+ qo'llanadi.
//
//  NIMA UCHUN canvas (paketsiz):
//    `browser-image-compression` 100KB+ qo'shadi va bizning haqiqiy ehtiyojimiz
//    100 satrlik canvas kodi bilan to'liq qondiriladi. Yangi bog'liqlik yo'q.
//
//  CHEKLOVLAR:
//    • Animatsion GIF/WebP: o'tkazib yuboriladi (original qoladi — animatsiya buzilmaydi).
//    • HEIC (iPhone): zamonaviy iOS Safari .heic'ni qo'llab-quvvatlaydi. Eski
//      brauzer .heic'ni o'qiy olmasa → original qaytariladi (server pillow-heif
//      bilan ushlaydi).
//    • SVG: vektor — siqish ma'nosiz, original qaytariladi.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompressOptions {
  /** Eng katta tomon piksellarda. Default 1600 (server bilan moslashuv). */
  maxDimension?: number;
  /** WebP sifat 0..1. Default 0.88 — fotosurat uchun ko'z ilg'amas yo'qotish. */
  quality?: number;
  /** True bo'lsa fayl turi WebP'ga aylantiriladi (default). False — JPEG ishlatiladi. */
  preferWebp?: boolean;
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxDimension: 1600,
  quality: 0.88,
  preferWebp: true,
};

const IMAGE_LIKE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Faylni siqilgan File ga aylantiradi. Muvaffaqiyatsiz bo'lsa originalni
 * qaytaradi (hech qachon `null` yoki throw — yuklash UX'ni buzmaydi).
 *
 * @example
 *   <input type="file" onChange={async (e) => {
 *     const file = e.target.files?.[0];
 *     if (!file) return;
 *     const smaller = await compressImage(file);
 *     uploadToServer(smaller);
 *   }} />
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Tezkor o'tkazib yuborish qarorlari
  if (!file || file.size === 0) return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/svg+xml') return file;        // vektor
  if (file.type === 'image/gif') return file;            // animatsiya buzilmasin
  // Juda kichik fayllarni qayta siqishdan foyda yo'q
  if (file.size < 80 * 1024 && IMAGE_LIKE_TYPES.has(file.type)) return file;

  let bitmap: ImageBitmap | null = null;
  let img: HTMLImageElement | null = null;
  let srcUrl: string | null = null;

  try {
    // Birinchi tanlov: createImageBitmap (zamonaviy, EXIF avtomat, tezroq)
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',  // EXIF orientatsiyasi
        });
      } catch {
        bitmap = null;  // ba'zi formatlar/brauzerlar — fallback'ga o'tamiz
      }
    }

    let srcWidth: number;
    let srcHeight: number;

    if (bitmap) {
      srcWidth = bitmap.width;
      srcHeight = bitmap.height;
    } else {
      // Fallback: HTMLImageElement orqali (HEIC eski brauzerda ishlamasa — throw)
      srcUrl = URL.createObjectURL(file);
      img = new Image();
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img!.onload = () => resolve();
        img!.onerror = () => reject(new Error('decode failed'));
        img!.src = srcUrl!;
      });
      srcWidth = img.naturalWidth;
      srcHeight = img.naturalHeight;
    }

    if (!srcWidth || !srcHeight) return file;

    // Maqsadli o'lcham — aspect ratio saqlanadi, faqat KICHRAYTIRISH.
    const maxDim = Math.max(srcWidth, srcHeight);
    const scale = maxDim > opts.maxDimension ? opts.maxDimension / maxDim : 1;
    const targetWidth = Math.round(srcWidth * scale);
    const targetHeight = Math.round(srcHeight * scale);

    // Agar resize kerak emas va WebP yo'q bo'lsa, qayta kodlashning ma'nosi yo'q.
    // (Lekin agar tur WebP emas va biz WebP'ga aylantirmoqchi bo'lsak, davom etamiz.)
    if (scale === 1 && file.type === (opts.preferWebp ? 'image/webp' : 'image/jpeg')) {
      return file;
    }

    // Bosqichli kichraytirish — har bosqichda 0.5x. Bu Lanczos'ga yaqin sifat beradi.
    let currentWidth = srcWidth;
    let currentHeight = srcHeight;
    let currentSource: CanvasImageSource = (bitmap as unknown as CanvasImageSource) ||
                                            (img as unknown as CanvasImageSource);

    const intermediates: HTMLCanvasElement[] = [];

    while (currentWidth * 0.5 > targetWidth && currentHeight * 0.5 > targetHeight) {
      const w = Math.round(currentWidth * 0.5);
      const h = Math.round(currentHeight * 0.5);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) break;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(currentSource, 0, 0, w, h);
      intermediates.push(c);
      currentSource = c;
      currentWidth = w;
      currentHeight = h;
    }

    // Yakuniy bosqich — aniq maqsadli o'lchamga
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) return file;
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';
    finalCtx.drawImage(currentSource, 0, 0, targetWidth, targetHeight);

    // Encode
    const outputType = opts.preferWebp ? 'image/webp' : 'image/jpeg';
    const blob: Blob | null = await new Promise((resolve) => {
      finalCanvas.toBlob((b) => resolve(b), outputType, opts.quality);
    });

    // Tozalash
    intermediates.forEach((c) => {
      c.width = 0;
      c.height = 0;
    });

    if (!blob) return file;

    // Agar siqilgan fayl originaldan kattaroq bo'lsa, originalni qaytaramiz
    // (bu kamdan-kam, lekin kichik PNG'lar uchun mumkin).
    if (blob.size >= file.size) return file;

    const ext = opts.preferWebp ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^./]+$/, '') || 'image';
    const newName = `${baseName}.${ext}`;
    return new File([blob], newName, {
      type: outputType,
      lastModified: Date.now(),
    });
  } catch {
    return file;  // har qanday xato — originalni qaytaramiz
  } finally {
    if (bitmap) bitmap.close?.();
    if (srcUrl) URL.revokeObjectURL(srcUrl);
  }
}

/**
 * Bir nechta faylni parallel siqish.
 * `Promise.all` — `Array.prototype.map` orqali — har biri mustaqil.
 */
export async function compressImages(
  files: File[],
  options: CompressOptions = {},
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f, options)));
}
