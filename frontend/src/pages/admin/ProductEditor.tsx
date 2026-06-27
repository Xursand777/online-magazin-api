// ─────────────────────────────────────────────────────────────────────────────
//  admin/ProductEditor.tsx — Mahsulot yaratish/tahrirlash formasi va variant
//  muharrirlari (ColorGroupVariantEditor, BulkVariantGenerator).
//
//  #N3: AdminPanel.tsx monolitidan AYNAN ko'chirildi — mantiq O'ZGARMAGAN.
//  Tashqi bog'liqliklar: shared (tip/yordamchi), API endpoint'lar, toast, hooks.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCreateProduct, adminUpdateProduct, adminGetExchangeRate } from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { compressImage, compressImages } from '../../utils/imageCompress';
import {
  COLOR_PRESETS, QUALITY_PRESETS, categoryLabel, emptyProductForm, emptyVariant,
  extractErrorMessage, formatPriceInput, generateVariantSku, hasVariantContent,
  mapProductToForm, mapVariantsForEditor, stripNumberFormatting,
} from './shared';
import type { AdminProduct, AdminCategory, ProductFormState, VariantFormState } from './shared';

// Variant uchun maksimal rasm soni — UX'ga ko'ra. 6 yetarli: birinchi = asosiy,
// qolganlari ekspander/karusel uchun. Yetib qolsa server hech qachon kesmaydi
// (har biri alohida yuklanadi), bu — UX yo'l-yo'rig'i. Foydalanuvchi bir
// vaqtning o'zida ko'p rasmni boshqarsa interfeys to'lib ketadi.
const MAX_VARIANT_IMAGES = 6;

// Variant rasm strip uchun bir element. `kind` mavjud yoki yangi rasm
// ekanligini va manbai (legacy single thumbnail yoki gallery) ekanligini
// belgilaydi — bu olib tashlash uchun zarur.
type VariantImageEntry =
  | { kind: 'existing-main'; url: string }
  | { kind: 'existing-gallery'; id: number; url: string }
  | { kind: 'new-main'; url: string }
  | { kind: 'new-gallery'; index: number; url: string };

const buildVariantImageList = (
  variant: VariantFormState,
  variantImageFiles: Record<string, File | null>,
  variantImagePreviews: Record<string, string>,
  variantGalleryPreviews: Record<string, string[]>,
): VariantImageEntry[] => {
  const out: VariantImageEntry[] = [];
  // 1) Mavjud "main" rasm (variant.image_url) — agar remove_image bo'lmasa
  if (variant.image_url && !variant.remove_image) {
    out.push({ kind: 'existing-main', url: variant.image_url });
  }
  // 2) Mavjud gallery rasmlari (deleteImageIds dan tashqari hammasi)
  variant.existingImages.forEach((img) => {
    out.push({ kind: 'existing-gallery', id: img.id, url: img.url });
  });
  // 3) Yangi yuklangan "main" (variant.image o'rnini bosadigan)
  if (variantImageFiles[variant.client_id]) {
    const u = variantImagePreviews[variant.client_id];
    if (u) out.push({ kind: 'new-main', url: u });
  }
  // 4) Yangi yuklangan qo'shimcha rasmlar (gallery)
  (variantGalleryPreviews[variant.client_id] || []).forEach((url, idx) => {
    out.push({ kind: 'new-gallery', url, index: idx });
  });
  return out;
};

// ── #N6: Qoralama (draft) avtosave ───────────────────────────────────────────
// Yangi mahsulot kiritayotganda forma localStorage'ga avtomat saqlanadi. Admin
// tasodifan tab'ni yopsa / sahifani yangilasa, matn/narx/variantlar yo'qolmaydi.
// FAQAT toza "create"da (tahrirlash yoki klonlashda emas). Rasm fayllari
// serializatsiya qilinmaydi — qoralama tiklanganda admin rasmlarni qayta tanlaydi.
const DRAFT_KEY = 'admin:product-draft';
interface ProductDraft {
  form: ProductFormState;
  variants: VariantFormState[];
  savedAt: number;
}

// ── #N8: Tannarxdan past sotuv validatsiyasi (POS bilan bir xil qoida) ────────
// Samarali sotuv narxi = chegirma narxi (>0 bo'lsa) yoki oddiy narx. Agar u
// tannarxdan (kirim) PAST bo'lsa — zararga sotuv. Tannarx 0/bo'sh bo'lsa pol
// yo'q (tekshirilmaydi). Narxlar formatli ("15 000 000") bo'lgani uchun
// stripNumberFormatting bilan tozalanadi.
const sellBelowCost = (priceStr: string, discountStr: string, costStr: string): boolean => {
  const cost = Number(stripNumberFormatting(costStr || '0'));
  if (!(cost > 0)) return false;
  const price = Number(stripNumberFormatting(priceStr || '0'));
  const disc = Number(stripNumberFormatting(discountStr || '0'));
  const sell = disc > 0 ? disc : price;
  return sell > 0 && sell < cost;
};

export const ProductEditor = ({
  mode,
  product,
  categories,
  onClose,
}: {
  mode: 'create' | 'edit';
  product?: AdminProduct;
  categories: AdminCategory[];
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  // Klonlash: "create" mode'da manba mahsulot berilsa — uning ma'lumotlaridan
  // YANGI mahsulot to'ldiriladi (id'siz). Oddiy "create"da product berilmaydi.
  const isClone = mode === 'create' && !!product;
  const [form, setForm] = useState<ProductFormState>(() => mapProductToForm(product));
  const [variants, setVariants] = useState<VariantFormState[]>(() => mapVariantsForEditor(product, mode));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [variantImageFiles, setVariantImageFiles] = useState<Record<string, File | null>>({});
  const [variantImagePreviews, setVariantImagePreviews] = useState<Record<string, string>>({});
  const [variantGalleryFiles, setVariantGalleryFiles] = useState<Record<string, File[]>>({});
  const [variantGalleryPreviews, setVariantGalleryPreviews] = useState<Record<string, string[]>>({});
  const [removeImage, setRemoveImage] = useState(false);
  const [formError, setFormError] = useState('');
  const [showBulkGenerator, setShowBulkGenerator] = useState(false);

  // ── #N6: Qoralama avtosave + tiklash ──────────────────────────────────────
  // Toza "create" (tahrir/klon emas) — faqat shu holatda qoralama saqlanadi.
  const isPureCreate = mode === 'create' && !product;
  // Ochilganda topilgan saqlanmagan qoralama (foydalanuvchi Tiklash/O'chirish
  // tugmasini bosguncha kutib turadi). null bo'lsa banner ko'rsatilmaydi.
  const [pendingDraft, setPendingDraft] = useState<ProductDraft | null>(null);

  // Ochilishda — mavjud qoralamani tekshiramiz (avtomat QO'LLAMAYMIZ, banner
  // orqali admin o'zi qaror qiladi — kutilmagan ma'lumot almashinuvi bo'lmaydi).
  useEffect(() => {
    if (!isPureCreate) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as ProductDraft;
      const hasContent = draft.form?.name?.trim() || (draft.variants?.length ?? 0) > 0;
      if (hasContent) setPendingDraft(draft);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avtosave — debounce (700ms). Qoralama banner ochiq turganda (pendingDraft)
  // YOZMAYMIZ — eski qoralamani admin qarorigacha saqlaymiz.
  useEffect(() => {
    if (!isPureCreate || pendingDraft) return;
    const hasContent = form.name.trim() || variants.length > 0;
    if (!hasContent) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ form, variants, savedAt: Date.now() } as ProductDraft),
        );
      } catch { /* kvota to'lgan bo'lsa jim o'tamiz */ }
    }, 700);
    return () => window.clearTimeout(t);
  }, [form, variants, isPureCreate, pendingDraft]);

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  };
  const restoreDraft = () => {
    if (!pendingDraft) return;
    setForm(pendingDraft.form);
    setVariants(pendingDraft.variants);
    setPendingDraft(null);
  };
  const discardDraft = () => {
    clearDraft();
    setPendingDraft(null);
  };

  // ── #N6: Enter → keyingi maydon (tasodifiy erta submit'ni ham oldini oladi)
  // Matn/raqam input'ida Enter bosilsa, forma yuborilmaydi — fokus keyingi
  // maydonga o'tadi. Saqlash faqat tugma bilan. Textarea (ko'p qatorli) va
  // tugmalar tegmaydi. Variant qatorlari ham shu rootRef ichida — birga ishlaydi.
  const handleFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const el = e.target as HTMLElement;
    if (el.tagName === 'TEXTAREA' || el.tagName !== 'INPUT') return;
    const type = (el as HTMLInputElement).type;
    if (['submit', 'button', 'file', 'checkbox', 'radio', 'color', 'range'].includes(type)) return;
    e.preventDefault();
    const focusables = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        'input:not([type=hidden]), select, textarea',
      ) ?? [],
    ).filter(
      (n) => !(n as HTMLInputElement).disabled && n.tabIndex !== -1 && n.offsetParent !== null,
    );
    const idx = focusables.indexOf(el);
    const next = focusables[idx + 1];
    if (next) next.focus();
  };

  const { data: rateData } = useQuery({
    queryKey: ['admin-exchange-rate'],
    queryFn: () => adminGetExchangeRate().then((r) => r.data),
    staleTime: 60_000,
  });
  const usdRate = rateData?.usd_rate || 0;

  const handlePriceChange = (
    field: 'price' | 'discount_price' | 'cost_price',
    value: string,
    isUsd: boolean,
  ) => {
    const numericValue = Number(stripNumberFormatting(value));
    setForm((prev) => {
      const next = { ...prev };
      // ── TANNARX (cost_price) kursdan MUSTAQIL ─────────────────────────────
      // Tannarx HECH QACHON avtomatik konvertatsiya qilinmaydi: SuperAdmin
      // tovarni qancha so'mga olganini kiritadi va dollar kursi o'zgarsa ham
      // bu qiymat o'zgarmaydi. Backend ham (Product.save + bulk_update) shu
      // qoidani himoyalaydi.
      if (field === 'cost_price') {
        if (isUsd) (next as any).cost_price_usd = value;
        else next.cost_price = formatPriceInput(value);
        return next;
      }
      if (isUsd) {
        (next as any)[`${field}_usd`] = value;
        if (usdRate > 0) {
          next[field] = formatPriceInput(String(Math.round(numericValue * usdRate)));
        }
      } else {
        next[field] = formatPriceInput(value);
        if (usdRate > 0) {
          const uv = (numericValue / usdRate).toFixed(2);
          (next as any)[`${field}_usd`] = uv === '0.00' || isNaN(Number(uv)) ? '' : uv;
        }
      }
      return next;
    });
  };

  useEffect(() => {
    Object.values(variantImagePreviews).forEach((url) => URL.revokeObjectURL(url));
    Object.values(variantGalleryPreviews).forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
    setForm(mapProductToForm(product));
    setVariants(mapVariantsForEditor(product, mode));
    setImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews({});
    setVariantGalleryFiles({});
    setVariantGalleryPreviews({});
    setRemoveImage(false);
    setFormError('');
  }, [product, mode]);

  // ── Tahrirlash bosilganda formaga AVTOMAT SCROLL ───────────────────────────
  // Forma jadval tepasida ochiladi. Admin pastdagi mahsulotni tahrirlasa, forma
  // yuqorida ochilib, ko'rinmay qoladi — "ochildimi yo'qmi?" degan shubha tug'iladi.
  // Shuning uchun forma ochilganda unga silliq scroll qilamiz (block:'start').
  // Kichik timeout — forma DOM'da to'liq joylashgandan keyin scroll bo'lishi uchun.
  //
  // Phase 4.2 — agar admin mahsulot ro'yxatidan AYNAN bir variantni tahrirlash
  // tugmasini bosgan bo'lsa, sahifa pastiga scroll qilib o'sha variantga keladi
  // (DOM elementi `data-variant-id` atributiga ega). Bu URL hash o'rniga
  // global state orqali qilinadi: `window.__bozorScrollVariantId` (props bilan
  // uzatish o'rniga oddiy, mavjud arxitekturani buzmaydi).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      // 1) Avval butun formaga scroll
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 2) Variant'ga aniq scroll — agar so'rovda tanlangan bo'lsa
      const targetVid: number | null =
        (window as unknown as { __bozorScrollVariantId?: number | null })
          .__bozorScrollVariantId ?? null;
      if (targetVid) {
        window.setTimeout(() => {
          const el = rootRef.current?.querySelector<HTMLElement>(
            `[data-variant-id="${targetVid}"]`,
          );
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Visual highlight 2 soniya
            el.classList.add('ring-4', 'ring-primary/60', 'rounded-xl');
            window.setTimeout(() => {
              el.classList.remove('ring-4', 'ring-primary/60', 'rounded-xl');
            }, 2000);
          }
          // Bir martalik ishlatish — keyingi tahrirlash uchun tozalaymiz
          (window as unknown as { __bozorScrollVariantId?: number | null })
            .__bozorScrollVariantId = null;
        }, 200);
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [product, mode]);

  const hasVariants = variants.length > 0;

  // ── #N8: tannarxdan past sotuv tekshiruvi ─────────────────────────────────
  // Variantli holatda HAR variant alohida, variatsiz holatda mahsulot narxi
  // tannarxiga qarshi tekshiriladi. Biror joyda zararga sotuv bo'lsa — Saqlash
  // bloklanadi (POS bilan bir xil qoida).
  const belowCostVariants = useMemo(
    () => variants.filter((v) => sellBelowCost(v.price, v.discount_price, v.cost_price)),
    [variants],
  );
  const productBelowCost =
    !hasVariants && sellBelowCost(form.price, form.discount_price, form.cost_price);
  const hasBelowCost = productBelowCost || belowCostVariants.length > 0;

  // ── Chegirma ≥ narx tekshiruvi (backend bilan bir xil qoida) ─────────────
  // Backend `_normalize_variant_payload` ham, `AdminProductSerializer.validate`
  // ham `discount >= price` bo'lsa 400 qaytaradi. Bunday holda admin Saqlash
  // bossa server xato qaytaradi, generik "Xatolik yuz berdi" ko'rinardi.
  // Endi forma darrov darrov ko'rsatadi — admin tushuntirish kutmay tuzatadi.
  const discountGePriceVariants = useMemo(() => {
    return variants.filter((v) => {
      const p = Number(stripNumberFormatting(v.price || '0'));
      const d = Number(stripNumberFormatting(v.discount_price || '0'));
      return p > 0 && d > 0 && d >= p;
    });
  }, [variants]);
  const productDiscountGePrice =
    !hasVariants &&
    (() => {
      const p = Number(stripNumberFormatting(form.price || '0'));
      const d = Number(stripNumberFormatting(form.discount_price || '0'));
      return p > 0 && d > 0 && d >= p;
    })();
  const hasDiscountGePrice = productDiscountGePrice || discountGePriceVariants.length > 0;

  useEffect(() => {
    if (!hasVariants) return;
    const validPrices = variants
      .map((v) => Number(stripNumberFormatting(v.price)))
      .filter((p) => p > 0);
    if (validPrices.length === 0) return;
    const minPrice = Math.min(...validPrices);
    // Chegirma faqat HAQIQIY bo'lganda hisobga olinadi: kiritilgan (>0) VA
    // o'sha variantning o'z narxidan KICHIK. Aks holda bu chegirma emas —
    // umuman kiritilmagan yoki xato — shuning uchun e'tiborga olinmaydi.
    const validDiscounts = variants
      .map((v) => ({
        price: Number(stripNumberFormatting(v.price)),
        disc: Number(stripNumberFormatting(v.discount_price)),
      }))
      .filter((x) => x.disc > 0 && x.disc < x.price)
      .map((x) => x.disc);
    const minDiscount = validDiscounts.length > 0 ? Math.min(...validDiscounts) : 0;
    const validCosts = variants
      .map((v) => Number(stripNumberFormatting(v.cost_price)))
      .filter((p) => p > 0);
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;
    setForm((prev) => ({
      ...prev,
      price: formatPriceInput(String(minPrice)),
      price_usd: usdRate > 0 ? (minPrice / usdRate).toFixed(2) : prev.price_usd,
      // Haqiqiy chegirma yo'q bo'lsa — maydon BO'SH qoladi (avtomatik to'ldirilmaydi).
      discount_price: minDiscount > 0 ? formatPriceInput(String(minDiscount)) : '',
      discount_price_usd:
        minDiscount > 0 && usdRate > 0 ? (minDiscount / usdRate).toFixed(2) : '',
      cost_price: minCost > 0 ? formatPriceInput(String(minCost)) : prev.cost_price,
      // Tannarx kursdan mustaqil — cost_price_usd kursdan QAYTA hisoblanmaydi.
      cost_price_usd: prev.cost_price_usd,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, hasVariants]);

  // "Saqlab, yana qo'shish" — submitda true bo'lsa, saqlangach forma yopilmasdan
  // tozalanadi (ketma-ket ko'p mahsulot kiritishni tezlashtiradi).
  const saveAndNewRef = useRef(false);
  const resetEditorForm = () => {
    Object.values(variantImagePreviews).forEach((url) => URL.revokeObjectURL(url));
    Object.values(variantGalleryPreviews).forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
    setForm(emptyProductForm());
    setVariants([]);
    setImageFile(null);
    setVariantImageFiles({});
    setVariantImagePreviews({});
    setVariantGalleryFiles({});
    setVariantGalleryPreviews({});
    setRemoveImage(false);
    setFormError('');
  };

  const saveMutation = useMutation({
    mutationFn: (payload: FormData) =>
      mode === 'edit' && product
        ? adminUpdateProduct(product.id, payload)
        : adminCreateProduct(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-products'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['product'] }),
        qc.invalidateQueries({ queryKey: ['mainPage'] }),
      ]);
      // Saqlangan ma'lumot endi qoralama bo'lib qolmasligi kerak.
      clearDraft();
      // "Saqlab, yana qo'shish" — forma tozalanadi, ochiq qoladi (faqat yaratish).
      if (saveAndNewRef.current && mode !== 'edit') {
        saveAndNewRef.current = false;
        resetEditorForm();
        toast.success("Saqlandi! Endi yangi mahsulot kiriting.");
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      onClose();
    },
    onError: (error) => {
      saveAndNewRef.current = false;
      setFormError(extractErrorMessage(error));
    },
  });

  const handleVariantChange = (index: number, field: keyof VariantFormState, value: string) =>
    setVariants((c) => c.map((v, i) => (i === index ? { ...v, [field]: value } : v)));

  const handleVariantPriceChange = (
    index: number,
    field: 'price' | 'discount_price' | 'cost_price',
    value: string,
    isUsd: boolean,
  ) => {
    const numericValue = Number(stripNumberFormatting(value));
    setVariants((c) =>
      c.map((v, i) => {
        if (i !== index) return v;
        const next = { ...v };
        // Tannarx kursdan mustaqil (mahsulot darajasidagi qoida bilan bir xil)
        if (field === 'cost_price') {
          if (isUsd) (next as any).cost_price_usd = value;
          else next.cost_price = formatPriceInput(value);
          return next;
        }
        if (isUsd) {
          (next as any)[`${field}_usd`] = value;
          if (usdRate > 0)
            next[field] = formatPriceInput(String(Math.round(numericValue * usdRate)));
        } else {
          next[field] = formatPriceInput(value);
          if (usdRate > 0) {
            const uv = (numericValue / usdRate).toFixed(2);
            (next as any)[`${field}_usd`] = uv === '0.00' || isNaN(Number(uv)) ? '' : uv;
          }
        }
        return next;
      }),
    );
  };

  const handleVariantImageChange = async (variant: VariantFormState, file: File | null) => {
    // Brauzerda siqamiz (max 1600px, WebP). Bu tarmoqni va server CPU'ni tejaydi.
    // null — admin rasmni olib tashlamoqchi (legacy "remove" tugmasi orqali).
    const finalFile = file ? await compressImage(file) : null;
    setVariantImageFiles((c) => ({ ...c, [variant.client_id]: finalFile }));
    setVariantImagePreviews((c) => {
      if (c[variant.client_id]) URL.revokeObjectURL(c[variant.client_id]);
      const n = { ...c };
      if (finalFile) n[variant.client_id] = URL.createObjectURL(finalFile);
      else delete n[variant.client_id];
      return n;
    });
    if (finalFile)
      setVariants((c) =>
        c.map((item) =>
          item.client_id === variant.client_id ? { ...item, remove_image: false } : item,
        ),
      );
  };

  const handleVariantGalleryAdd = async (clientId: string, files: File[]) => {
    // Parallel siqish — har bir fayl alohida ishlanadi, hammasini birga kutamiz.
    const compressed = await compressImages(files);
    setVariantGalleryFiles((c) => ({ ...c, [clientId]: [...(c[clientId] || []), ...compressed] }));
    setVariantGalleryPreviews((c) => ({
      ...c,
      [clientId]: [...(c[clientId] || []), ...compressed.map((f) => URL.createObjectURL(f))],
    }));
  };

  const handleVariantGalleryRemoveNew = (clientId: string, idx: number) => {
    setVariantGalleryFiles((c) => {
      const next = [...(c[clientId] || [])];
      next.splice(idx, 1);
      return { ...c, [clientId]: next };
    });
    setVariantGalleryPreviews((c) => {
      const next = [...(c[clientId] || [])];
      if (next[idx]) URL.revokeObjectURL(next[idx]);
      next.splice(idx, 1);
      return { ...c, [clientId]: next };
    });
  };

  const handleVariantGalleryDeleteExisting = (clientId: string, imageId: number | null) => {
    // imageId xavfsizligi: faqat real (musbat butun) ID o'chirish ro'yxatiga
    // qo'shiladi. null/0/NaN — backend `ListField(IntegerField())` rad etadi va
    // "may not be null" xatosi tushadi. Legacy fallback (id=null) holatida esa
    // variantning `remove_image` bayrog'i o'rnatiladi.
    const isRealId = Number.isInteger(imageId) && (imageId as number) > 0;
    setVariants((c) =>
      c.map((v) =>
        v.client_id === clientId
          ? {
              ...v,
              existingImages: v.existingImages.filter((img) => img.id !== imageId),
              deleteImageIds: isRealId
                ? Array.from(new Set([...v.deleteImageIds, imageId as number]))
                : v.deleteImageIds,
              remove_image: isRealId ? v.remove_image : true,
            }
          : v,
      ),
    );
  };

  const removeVariantAt = (index: number) => {
    setVariants((c) => {
      const removed = c[index];
      if (removed) {
        setVariantImageFiles((f) => {
          const n = { ...f };
          delete n[removed.client_id];
          return n;
        });
        setVariantImagePreviews((p) => {
          if (p[removed.client_id]) URL.revokeObjectURL(p[removed.client_id]);
          const n = { ...p };
          delete n[removed.client_id];
          return n;
        });
      }
      return c.filter((_, i) => i !== index);
    });
  };

  const handleGenerateAllSkus = () =>
    setVariants((c) => c.map((v) => ({ ...v, sku: generateVariantSku(form.name, v) })));
  const handleGenerateVariantSku = (index: number) =>
    setVariants((c) =>
      c.map((v, i) => (i === index ? { ...v, sku: generateVariantSku(form.name, v) } : v)),
    );

  const handleBulkGenerate = (config: {
    colors: string;
    qualities: string;
    models: string;
    sizes: string;
    baseStock: string;
    basePrice: string;
    baseDiscountPrice: string;
    baseCostPrice: string;
  }) => {
    const colors = config.colors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const qualities = config.qualities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const models = config.models
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const sizes = config.sizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      colors.length === 0 &&
      qualities.length === 0 &&
      models.length === 0 &&
      sizes.length === 0
    ) {
      toast.error("Hech bo'lmasa rang yoki sifat kiriting");
      return;
    }
    const cList = colors.length > 0 ? colors : [''],
      qList = qualities.length > 0 ? qualities : [''],
      mList = models.length > 0 ? models : [''],
      sList = sizes.length > 0 ? sizes : [''];
    const newVariants: VariantFormState[] = [];
    cList.forEach((c) =>
      qList.forEach((q) =>
        mList.forEach((m) =>
          sList.forEach((s) => {
            const v = emptyVariant();
            v.color = c;
            v.quality = q;
            v.model = m;
            v.size = s;
            v.stock = config.baseStock || '0';
            v.price = formatPriceInput(config.basePrice || form.price || '');
            v.discount_price = formatPriceInput(
              config.baseDiscountPrice || form.discount_price || '',
            );
            v.cost_price = formatPriceInput(config.baseCostPrice || form.cost_price || '');
            v.position = String(newVariants.length);
            v.sku = generateVariantSku(form.name, v);
            newVariants.push(v);
          }),
        ),
      ),
    );
    setVariants((prev) => [...prev, ...newVariants]);
    setShowBulkGenerator(false);
    toast.success(`${newVariants.length} ta variant generatsiya qilindi!`);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    // #N8: tannarxdan past sotuvni bloklaymiz (tugmalar ham disabled, bu — himoya)
    if (hasBelowCost) {
      saveAndNewRef.current = false;
      setFormError('Sotuv narxi tannarxdan past — narxni tuzating (zararga sotuv).');
      return;
    }
    // Chegirma ≥ narx bo'lsa backend 400 qaytaradi — oldindan bloklaymiz.
    if (hasDiscountGePrice) {
      saveAndNewRef.current = false;
      const detail = discountGePriceVariants.length > 0
        ? `${discountGePriceVariants.length} ta variantda chegirma narxi asosiy narxdan KICHIK bo'lishi kerak.`
        : 'Chegirma narxi asosiy narxdan KICHIK bo\'lishi kerak.';
      setFormError(detail + " Chegirmani tuzating yoki bo'sh qoldiring.");
      return;
    }
    const payload = new FormData();
    payload.append('name', form.name.trim());
    payload.append('description', form.description.trim());
    payload.append('price', stripNumberFormatting(form.price) || '0');
    payload.append('price_usd', stripNumberFormatting(form.price_usd) || '0');
    payload.append('discount_price', stripNumberFormatting(form.discount_price.trim()));
    payload.append('discount_price_usd', stripNumberFormatting(form.discount_price_usd.trim()));
    payload.append('cost_price', stripNumberFormatting(form.cost_price.trim()) || '0');
    payload.append('cost_price_usd', stripNumberFormatting(form.cost_price_usd.trim()) || '0');
    payload.append('stock', form.stock || '0');
    payload.append('category', form.category);
    payload.append('is_active', String(form.is_active));
    payload.append('is_new', String(form.is_new));
    payload.append('is_popular', String(form.is_popular));
    // Phase 4.2 — product-level polka (variantsiz mahsulot uchun yoki
    // barcha variantlar uchun default). Max 20 belgi backend cheklov.
    payload.append('shelf_location', (form.shelf_location || '').trim().slice(0, 20));
    payload.append('remove_image', String(removeImage));
    if (imageFile) payload.append('image', imageFile);
    // ── PAYLOAD QURISH — backend "may not be null" xatosini OLDINI olamiz ────
    // safeInt: NaN/null/undefined ham, foydalanuvchi yozgan kir matn ham
    // xavfsiz raqamga aylanadi (JSON.stringify(NaN) → "null" muammosi yo'q).
    // boolish: agar qiymat undefined/null bo'lsa default qaytadi, aks holda
    // booleanga aylantirilaadi — `is_active`/`remove_image` hech qachon
    // serverga null ko'rinishida ketmaydi.
    const safeInt = (val: unknown, def = 0) => {
      const n = Number(typeof val === 'string' ? stripNumberFormatting(val) : val);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : def;
    };
    const boolish = (val: unknown, def: boolean) =>
      val === undefined || val === null ? def : Boolean(val);
    const variantsPayload = variants
      .map((v) => ({
        client_id: v.client_id,
        ...(v.id ? { id: v.id } : {}),
        color: v.color.trim(),
        color_hex: v.color_hex.trim(),
        remove_image: boolish(v.remove_image, false),
        quality: v.quality.trim(),
        model: v.model.trim(),
        size: v.size.trim(),
        price: stripNumberFormatting(v.price) || null,
        price_usd: stripNumberFormatting(v.price_usd) || null,
        discount_price: stripNumberFormatting(v.discount_price) || null,
        discount_price_usd: stripNumberFormatting(v.discount_price_usd) || null,
        cost_price: stripNumberFormatting(v.cost_price) || null,
        cost_price_usd: stripNumberFormatting(v.cost_price_usd) || null,
        stock: safeInt(v.stock, 0),
        sku: v.sku.trim(),
        barcode: v.barcode.trim(),
        is_active: boolish(v.is_active, true),
        position: safeInt(v.position, 0),
        // Phase 4.0 — do'kondagi polka manzili (max 20). Backend `default=''`,
        // shu sababli bo'sh stringni jim qabul qiladi.
        shelf_location: v.shelf_location.trim().slice(0, 20),
      }))
      .filter((v) =>
        hasVariantContent({
          ...v,
          price: v.price ? String(v.price) : '',
          price_usd: v.price_usd ? String(v.price_usd) : '',
          discount_price: v.discount_price ? String(v.discount_price) : '',
          discount_price_usd: v.discount_price_usd ? String(v.discount_price_usd) : '',
          cost_price: v.cost_price ? String(v.cost_price) : '',
          cost_price_usd: v.cost_price_usd ? String(v.cost_price_usd) : '',
          stock: String(v.stock),
          position: String(v.position),
        } as VariantFormState),
      );
    variantsPayload.forEach((v, i) => {
      const swatchFile = variantImageFiles[v.client_id];
      if (swatchFile) payload.append(`variant_image_${i}`, swatchFile);
      const galleryFiles = variantGalleryFiles[v.client_id] || [];
      galleryFiles.forEach((f, j) => payload.append(`variant_images_${i}_${j}`, f));
    });
    payload.append(
      'variants_data',
      JSON.stringify(
        variantsPayload.map(({ client_id, ...v }) => {
          // delete_image_ids: faqat haqiqiy musbat raqamlar — null/NaN/0 emas.
          // Backend `ListField(child=IntegerField())` null elementni qabul qilmaydi.
          const rawIds = variants.find((vv) => vv.client_id === client_id)?.deleteImageIds || [];
          const deleteIds = Array.from(
            new Set(
              rawIds
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0),
            ),
          );
          return { ...v, delete_image_ids: deleteIds };
        }),
      ),
    );
    await saveMutation.mutateAsync(payload);
  };

  return (
    <div
      ref={rootRef}
      className='scroll-mt-4 rounded-2xl border-2 border-primary/50 bg-surface-container-lowest p-6 shadow-md ring-2 ring-primary/10'
    >
      <div className='mb-6 flex flex-col gap-2 border-b border-outline-variant pb-4 md:flex-row md:items-center md:justify-between'>
        <div>
          <h3 className='font-h3 text-h3 text-on-surface'>
            {mode === 'edit' ? 'Mahsulotni tahrirlash' : isClone ? 'Mahsulotdan nusxa' : 'Yangi mahsulot'}
          </h3>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            {isClone
              ? "Manba mahsulot ma'lumotlari to'ldirildi — rasm va SKU'ni qayta bering, so'ng saqlang."
              : 'Narx, tavsif, rasm va variantlar bir joydan boshqariladi.'}
          </p>
        </div>
        {mode === 'edit' && product && (
          <div className='rounded-xl bg-surface-container px-4 py-2 text-sm text-on-surface-variant'>
            ID: {product.id} | Slug: {product.slug}
          </div>
        )}
      </div>
      {/* #N6: Saqlanmagan qoralama topildi — tiklash/o'chirish banneri */}
      {pendingDraft && (
        <div className='mb-4 flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-start gap-2 text-body-sm text-on-surface'>
            <span className='material-symbols-outlined text-[18px] text-primary'>history</span>
            <span>
              Saqlanmagan qoralama topildi
              {pendingDraft.form?.name ? (
                <b> — “{pendingDraft.form.name}”</b>
              ) : null}.
              Tiklaysizmi? <span className='text-on-surface-variant'>(rasmlar saqlanmaydi)</span>
            </span>
          </div>
          <div className='flex shrink-0 gap-2'>
            <button
              type='button'
              onClick={restoreDraft}
              className='flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90'
            >
              <span className='material-symbols-outlined text-[15px]'>restore</span>Tiklash
            </button>
            <button
              type='button'
              onClick={discardDraft}
              className='rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container'
            >
              O'chirish
            </button>
          </div>
        </div>
      )}
      {formError && (
        <div className='mb-4 flex gap-2 rounded-lg bg-error-container p-3 text-body-sm text-on-error-container'>
          <span className='material-symbols-outlined text-[16px]'>error</span>
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className='space-y-6'>
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <div className='xl:col-span-8'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Mahsulot nomi *
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary'
              placeholder='iPhone 17 Pro Max'
            />
          </div>
          <div className='xl:col-span-4'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Kategoriya
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            >
              <option value=''>-- Kategoriya tanlanmagan --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>

          <div className='xl:col-span-12'>
            {hasVariants ? (
              <div className='rounded-xl border border-primary/20 bg-primary/5 px-4 py-3'>
                <div className='mb-3 flex items-center gap-2'>
                  <span className='material-symbols-outlined text-[18px] text-primary'>
                    auto_fix_high
                  </span>
                  <span className='text-sm font-semibold text-primary'>
                    Asosiy narxlar variantlardan avtomatik to'ldirildi
                  </span>
                  <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary'>
                    AUTO
                  </span>
                </div>
                <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
                  {[
                    {
                      label: "Min. narx (so'm)",
                      value: form.price,
                      color: 'text-on-surface font-bold',
                    },
                    {
                      label: 'Min. narx (USD)',
                      value: form.price_usd ? `$${form.price_usd}` : '—',
                      color: 'text-primary font-bold',
                    },
                    {
                      label: "Min. chegirma (so'm)",
                      value: form.discount_price || '—',
                      color: 'text-tertiary font-semibold',
                    },
                    {
                      label: 'Min. chegirma (USD)',
                      value: form.discount_price_usd ? `$${form.discount_price_usd}` : '—',
                      color: 'text-[#f59e0b] font-semibold',
                    },
                    {
                      label: "Min. kirim (so'm)",
                      value: form.cost_price || '—',
                      color: 'text-on-surface-variant font-semibold',
                    },
                    {
                      label: 'Min. kirim (USD)',
                      value: form.cost_price_usd ? `$${form.cost_price_usd}` : '—',
                      color: 'text-on-surface-variant font-semibold',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className='rounded-lg border border-outline-variant bg-surface-bright px-3 py-2'
                    >
                      <div className='text-[10px] font-bold uppercase text-on-surface-variant'>
                        {item.label}
                      </div>
                      <div className={`mt-1 text-sm ${item.color}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <p className='mt-2 text-[11px] text-on-surface-variant'>
                  💡 Hisobotda har bir variant o'z narxida ko'rinadi. Bu qatorlar faqat saytda
                  "boshlanish narxi" uchun.
                </p>
              </div>
            ) : (
              <>
              <div className='grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'>
                <div>
                  <label className='mb-1 flex items-center gap-1 text-label-md font-label-md text-on-surface-variant'>
                    Narx (so'm)<span className='text-error'>*</span>
                  </label>
                  <input
                    required={!hasVariants}
                    type='text'
                    inputMode='decimal'
                    value={form.price}
                    onChange={(e) => handlePriceChange('price', e.target.value, false)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                    placeholder='15 000 000'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Narx (USD)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.price_usd}
                    onChange={(e) => handlePriceChange('price', e.target.value, true)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-primary outline-none focus:border-primary'
                    placeholder='1200'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Chegirma (so'm)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.discount_price}
                    onChange={(e) => handlePriceChange('discount_price', e.target.value, false)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-tertiary outline-none focus:border-primary'
                    placeholder='13 500 000'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Chegirma (USD)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.discount_price_usd}
                    onChange={(e) => handlePriceChange('discount_price', e.target.value, true)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-[#f59e0b] outline-none focus:border-primary'
                    placeholder='1100'
                  />
                </div>
                <div>
                  <label className='mb-1 flex items-center gap-1 text-label-md font-label-md text-on-surface-variant'>
                    Kirim (so'm)<span className='text-error'>*</span>
                  </label>
                  <input
                    required={!hasVariants}
                    type='text'
                    inputMode='decimal'
                    value={form.cost_price}
                    onChange={(e) => handlePriceChange('cost_price', e.target.value, false)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                    placeholder='10 000 000'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                    Kirim (USD)
                  </label>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={form.cost_price_usd}
                    onChange={(e) => handlePriceChange('cost_price', e.target.value, true)}
                    className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                    placeholder='800'
                  />
                </div>
              </div>
              {productBelowCost && (
                <p className='mt-2 flex items-center gap-1 text-xs font-semibold text-error'>
                  <span className='material-symbols-outlined text-[15px]'>warning</span>
                  Sotuv narxi tannarxdan (kirim) past — zararga sotuv. Narxni tuzating.
                </p>
              )}
              </>
            )}
          </div>

          <div className='xl:col-span-2'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Jami soni
            </label>
            <input
              min='0'
              type='number'
              value={form.stock}
              onChange={(e) => setForm((c) => ({ ...c, stock: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='10'
            />
          </div>
          {/* Phase 4.2 — Polka maydoni mahsulot darajasida. Variantsiz mahsulot
              uchun asosiy, variantli mahsulot uchun default (variant polkasi
              bo'sh bo'lsa backend bu yerdan fallback qiladi). Faqat admin/POS
              ko'radi — public API'da hech qachon chiqmaydi. */}
          <div className='xl:col-span-2'>
            <label
              className='mb-1 flex items-center gap-1 text-label-md font-label-md text-primary'
              title="Do'kondagi polka manzili (faqat admin va POS'da ko'rinadi)"
            >
              <span className='material-symbols-outlined text-[16px]'>pin_drop</span>
              Polka
            </label>
            <input
              type='text'
              maxLength={20}
              value={form.shelf_location}
              onChange={(e) =>
                setForm((c) => ({ ...c, shelf_location: e.target.value.slice(0, 20) }))
              }
              className='w-full rounded-lg border border-primary/40 bg-surface-bright px-3 py-2 font-bold text-primary outline-none placeholder:font-normal placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-2 focus:ring-primary/30'
              placeholder='001'
              title="Variantsiz mahsulot uchun asosiy polka. Variantli mahsulotda variant'da polka yozilmasa bu qiymat ishlatiladi."
            />
          </div>
          <div className='xl:col-span-4'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Asosiy rasm
            </label>
            <input
              type='file'
              accept='image/*'
              onChange={async (e) => {
                const raw = e.target.files?.[0] || null;
                if (!raw) { setImageFile(null); return; }
                // Yuklashdan oldin brauzerda siqamiz (max 1600px, WebP ~88%).
                // Server hali ham yakuniy Pillow WebP qiladi (yagona avtoritar manba),
                // bu — tarmoqni va server CPU'ni tejaydi.
                const compressed = await compressImage(raw);
                setImageFile(compressed);
                setRemoveImage(false);
              }}
              className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
            />
          </div>
          <div className='xl:col-span-12'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tavsif
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='Mahsulotning asosiy afzalliklari...'
            />
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]'>
          <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
            <div className='mb-3 flex items-center justify-between'>
              <h4 className='font-h3 text-lg text-on-surface'>Ko\'rinish va status</h4>
            </div>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              {[
                {
                  checked: form.is_active,
                  onChange: (v: boolean) => setForm((c) => ({ ...c, is_active: v })),
                  label: 'Faol mahsulot',
                },
                {
                  checked: form.is_new,
                  onChange: (v: boolean) => setForm((c) => ({ ...c, is_new: v })),
                  label: 'Yangi belgi',
                },
                {
                  checked: form.is_popular,
                  onChange: (v: boolean) => setForm((c) => ({ ...c, is_popular: v })),
                  label: 'Ommabop belgi',
                },
              ].map((item) => (
                <label
                  key={item.label}
                  className='flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-bright px-3 py-3'
                >
                  <input
                    type='checkbox'
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.target.checked)}
                    className='rounded text-primary'
                  />
                  <span className='text-body-sm text-on-surface'>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
            <h4 className='mb-3 font-h3 text-lg text-on-surface'>Rasm holati</h4>
            <div className='space-y-3'>
              {product?.main_image && !removeImage && !imageFile && (
                <div className='flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-bright p-3'>
                  <img
                    src={product.main_image}
                    alt={product.name}
                    className='h-16 w-16 rounded-lg object-cover'
                  />
                  <div className='min-w-0'>
                    <div className='font-body-md text-on-surface'>Joriy asosiy rasm</div>
                  </div>
                </div>
              )}
              {product?.main_image && (
                <label className='flex items-center gap-2 text-body-sm text-on-surface'>
                  <input
                    type='checkbox'
                    checked={removeImage}
                    onChange={(e) => setRemoveImage(e.target.checked)}
                    className='rounded text-primary'
                  />
                  Joriy rasmni olib tashlash
                </label>
              )}
            </div>
          </div>
        </div>

        <div className='rounded-xl border border-outline-variant bg-surface-container p-4'>
          <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <div>
              <h4 className='font-h3 text-lg text-on-surface'>Variantlar</h4>
              <p className='mt-1 text-body-sm text-on-surface-variant'>
                Rang guruhlari bo'yicha — har sifat/hajm uchun alohida narx, stok va rasm.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              {variants.length > 0 && (
                <button
                  type='button'
                  onClick={handleGenerateAllSkus}
                  className='flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-xs text-tertiary hover:bg-surface-container'
                >
                  <span className='material-symbols-outlined text-[15px]'>magic_button</span>SKU
                  generatsiya
                </button>
              )}
              <button
                type='button'
                onClick={() => setShowBulkGenerator(!showBulkGenerator)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${showBulkGenerator ? 'bg-error-container text-on-error-container' : 'bg-primary text-on-primary hover:opacity-90'}`}
              >
                <span className='material-symbols-outlined text-[15px]'>
                  {showBulkGenerator ? 'cancel' : 'auto_fix_high'}
                </span>
                {showBulkGenerator ? 'Generatorni yopish' : '⚡ Tez Generator'}
              </button>
              <button
                type='button'
                onClick={() => setVariants((c) => [...c, emptyVariant()])}
                className='flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary-container/10'
              >
                <span className='material-symbols-outlined text-[15px]'>add_circle</span>Qo\'lda
                qo'shish
              </button>
            </div>
          </div>
          {showBulkGenerator && (
            <BulkVariantGenerator
              defaults={{
                basePrice: form.price,
                baseDiscountPrice: form.discount_price,
                baseCostPrice: form.cost_price,
                baseStock: form.stock,
              }}
              onGenerate={handleBulkGenerate}
            />
          )}
          {variants.length > 0 ? (
            <ColorGroupVariantEditor
              variants={variants}
              variantImageFiles={variantImageFiles}
              variantImagePreviews={variantImagePreviews}
              variantGalleryPreviews={variantGalleryPreviews}
              onVariantChange={handleVariantChange}
              onVariantPriceChange={handleVariantPriceChange}
              onVariantImageChange={handleVariantImageChange}
              onRemoveVariant={removeVariantAt}
              onGenerateSku={handleGenerateVariantSku}
              onGalleryAdd={handleVariantGalleryAdd}
              onGalleryRemoveNew={handleVariantGalleryRemoveNew}
              onGalleryDeleteExisting={handleVariantGalleryDeleteExisting}
              onAddVariantToGroup={(baseVariant) => {
                // Yangi qator faqat rang/narx/kirim qiymatlarini "rang-darajasidagi"
                // sukut bo'yicha meros qilib oladi. image_url MEROS QILINMAYDI —
                // har sifat uchun alohida rasm yuklash yangi UX qoidasi
                // (eski "rang-darajasidagi swatch" konsepti olib tashlandi).
                const newVar = emptyVariant(baseVariant.group_id);
                newVar.color = baseVariant.color;
                newVar.color_hex = baseVariant.color_hex;
                newVar.price = baseVariant.price;
                newVar.price_usd = baseVariant.price_usd;
                newVar.cost_price = baseVariant.cost_price;
                newVar.cost_price_usd = baseVariant.cost_price_usd;
                setVariants((c) => [...c, newVar]);
              }}
            />
          ) : (
            <div className='rounded-xl border-2 border-dashed border-outline-variant bg-surface-bright p-8 text-center'>
              <span className='material-symbols-outlined mb-2 block text-4xl text-outline'>
                inventory_2
              </span>
              <p className='font-semibold text-on-surface-variant'>Hozircha variant yo'q</p>
              <p className='mt-1 text-sm text-on-surface-variant'>
                ⚡ Tez Generator yoki "Qo\'lda qo'shish" tugmasidan foydalaning
              </p>
            </div>
          )}
        </div>

        {/* #N8: tannarxdan past sotuv — umumiy ogohlantirish (Saqlash bloklangan) */}
        {hasBelowCost && (
          <div className='flex items-start gap-2 rounded-lg border border-error/40 bg-error-container/30 p-3 text-body-sm font-semibold text-error'>
            <span className='material-symbols-outlined text-[18px]'>error</span>
            <span>
              {belowCostVariants.length > 0
                ? `${belowCostVariants.length} ta variant tannarxdan past narxda — `
                : 'Sotuv narxi tannarxdan past — '}
              narxni tuzating, aks holda saqlab bo'lmaydi (zararga sotuv).
            </span>
          </div>
        )}
        {/* Chegirma ≥ narx — backend ham rad qiladi (400). Saqlash bloklanadi. */}
        {hasDiscountGePrice && (
          <div className='flex items-start gap-2 rounded-lg border border-error/40 bg-error-container/30 p-3 text-body-sm font-semibold text-error'>
            <span className='material-symbols-outlined text-[18px]'>error</span>
            <span>
              {discountGePriceVariants.length > 0
                ? `${discountGePriceVariants.length} ta variantda chegirma narxi asosiy narxdan KICHIK bo'lishi kerak.`
                : "Chegirma narxi asosiy narxdan KICHIK bo'lishi kerak."}
              {' '}Chegirmani tuzating yoki bo'sh qoldiring.
            </span>
          </div>
        )}
        <div className='flex flex-col gap-3 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='text-body-sm text-on-surface-variant'>
            {mode === 'edit'
              ? "O'zgartirishlar saqlansa frontenddagi ko\'rinish ham yangilanadi."
              : "Yangi mahsulot saqlangach darhol katalogda ishlatish mumkin bo'ladi."}
          </div>
          <div className='flex flex-wrap gap-3'>
            <button
              type='button'
              onClick={onClose}
              className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
            >
              Bekor
            </button>
            {mode !== 'edit' && (
              <button
                type='submit'
                disabled={saveMutation.isPending || hasBelowCost || hasDiscountGePrice}
                onClick={() => { saveAndNewRef.current = true; }}
                className='flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 font-label-md text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50'
              >
                <span className='material-symbols-outlined text-[16px]'>library_add</span>
                Saqlab, yana qo'shish
              </button>
            )}
            <button
              type='submit'
              disabled={saveMutation.isPending || hasBelowCost || hasDiscountGePrice}
              onClick={() => { saveAndNewRef.current = false; }}
              className='flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {saveMutation.isPending && (
                <span className='material-symbols-outlined animate-spin text-[16px]'>
                  progress_activity
                </span>
              )}
              {mode === 'edit' ? "O\'zgarishlarni saqlash" : 'Saqlash'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

// ─── ColorGroupVariantEditor ─────────────────────────────────────────────────
//
// Variantlar rang bo'yicha guruhlanadi (Qora / Oq / Ko'k …). Har guruh ichida
// — bir nechta variant qatori (sifat × model × o'lcham kombinatsiyalari).
//
// HAR BIR VARIANT QATORI alohida karta — 2 qator chiroyli layout:
//   1-qator: Sifat | Model/Hajm | Narx (so'm/$) | Chegirma | Kirim | Stock | SKU | Faol | Del
//   2-qator: Rasm strip — 1..N kichik thumbnail (birinchisi "asosiy" sifatida belgilanadi).
//
// Bu yondashuv "rang-darajasidagi" eski rasm modelini "variant-darajasiga"
// ko'chiradi: foydalanuvchi (mijoz) saytda har sifat uchun aniq rasmni
// ko'radi (128GB ko'k, 256GB ko'k boshqa rakurslar, …).
//
// Backend: variant_image_<i> = variant.image (asosiy thumbnail),
//          variant_images_<i>_<j> = ProductVariantImage gallery.
// Server avtomatik fallback qiladi: gallery birinchi rasmni ko'rsatadi, agar
// gallery bo'sh bo'lsa — variant.image, undan keyin esa "bir xil rangdagi
// boshqa variant" rasmiga tushadi (Wildberries-stil color-grouping).
// ─────────────────────────────────────────────────────────────────────────────

const ColorGroupVariantEditor = ({
  variants,
  variantImageFiles,
  variantImagePreviews,
  variantGalleryPreviews,
  onVariantChange,
  onVariantPriceChange,
  onVariantImageChange,
  onRemoveVariant,
  onGenerateSku,
  onGalleryAdd,
  onGalleryRemoveNew,
  onGalleryDeleteExisting,
  onAddVariantToGroup,
}: {
  variants: VariantFormState[];
  variantImageFiles: Record<string, File | null>;
  variantImagePreviews: Record<string, string>;
  variantGalleryPreviews: Record<string, string[]>;
  onVariantChange: (index: number, field: keyof VariantFormState, value: string) => void;
  onVariantPriceChange: (
    index: number,
    field: 'price' | 'discount_price' | 'cost_price',
    value: string,
    isUsd: boolean,
  ) => void;
  onVariantImageChange: (variant: VariantFormState, file: File | null) => void;
  onRemoveVariant: (index: number) => void;
  onGenerateSku: (index: number) => void;
  onGalleryAdd: (clientId: string, files: File[]) => void;
  onGalleryRemoveNew: (clientId: string, idx: number) => void;
  onGalleryDeleteExisting: (clientId: string, imageId: number) => void;
  onAddVariantToGroup: (baseVariant: VariantFormState) => void;
}) => {
  // Rang bo'yicha guruhlash (group_id — bir xil ranga ega variantlar uchun bir xil)
  const groups = useMemo(() => {
    const g = new Map<string, VariantFormState[]>();
    variants.forEach((v) => {
      const key = v.group_id;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(v);
    });
    return Array.from(g.values());
  }, [variants]);

  const [openItems, setOpenItems] = useState<Set<string>>(
    () => new Set(groups.map((g) => g[0].client_id)),
  );
  const toggleItem = (clientId: string) =>
    setOpenItems((prev) => {
      const n = new Set(prev);
      n.has(clientId) ? n.delete(clientId) : n.add(clientId);
      return n;
    });

  // Variant uchun rasmlar tanlangan paytda — birinchi yangi fayl "asosiy"
  // bo'ladi (variant.image o'rnini bosadi), qolganlari gallery'ga ketadi.
  // Agar variantda allaqachon asosiy rasm bor — hammasi gallery'ga ketadi.
  const handleVariantImagesPick = async (variant: VariantFormState, files: File[]) => {
    if (files.length === 0) return;
    const hasMain =
      (variant.image_url && !variant.remove_image) || !!variantImageFiles[variant.client_id];
    if (hasMain) {
      await onGalleryAdd(variant.client_id, files);
    } else {
      await onVariantImageChange(variant, files[0]);
      if (files.length > 1) await onGalleryAdd(variant.client_id, files.slice(1));
    }
  };

  // Variant rasm strip'idan bitta rasmni olib tashlash — kind'ga qarab to'g'ri
  // handler chaqiriladi (eski-yangi, asosiy-gallery farqi shu yerda hal bo'ladi).
  const handleVariantImageRemove = (
    variant: VariantFormState,
    img: VariantImageEntry,
  ) => {
    const idx = variants.indexOf(variant);
    switch (img.kind) {
      case 'existing-main':
        onVariantChange(idx, 'remove_image', 'true');
        break;
      case 'existing-gallery':
        onGalleryDeleteExisting(variant.client_id, img.id);
        break;
      case 'new-main':
        onVariantImageChange(variant, null);
        break;
      case 'new-gallery':
        onGalleryRemoveNew(variant.client_id, img.index);
        break;
    }
  };

  return (
    <div className='space-y-6'>
      {groups.map((group, groupIndex) => {
        const baseVariant = group[0];
        const isOpen = openItems.has(baseVariant.client_id);
        const groupLabel = baseVariant.color || `Yangi rang #${groupIndex + 1}`;
        const totalStock = group.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        return (
          <div
            key={baseVariant.client_id}
            className='overflow-hidden rounded-xl border border-outline-variant bg-surface-bright shadow-sm'
          >
            {/* GROUP HEADER — rang nomi + statistika + accordion toggle */}
            <div
              className='flex items-center gap-3 px-4 py-3 cursor-pointer select-none bg-surface-container-lowest'
              onClick={() => toggleItem(baseVariant.client_id)}
            >
              {baseVariant.color_hex && (
                <span
                  className='h-5 w-5 flex-shrink-0 rounded-full border border-outline-variant shadow-sm'
                  style={{ backgroundColor: baseVariant.color_hex }}
                />
              )}
              <span className='flex-1 font-bold text-on-surface'>{groupLabel}</span>
              <div className='flex items-center gap-4' onClick={(e) => e.stopPropagation()}>
                <span className='text-xs font-medium text-on-surface-variant'>
                  {group.length} xil sifat
                </span>
                <span className='text-xs font-medium text-primary'>{totalStock} dona stok</span>
                <span className='material-symbols-outlined text-[20px] text-on-surface-variant'>
                  {isOpen ? 'expand_less' : 'expand_more'}
                </span>
              </div>
            </div>

            {isOpen && (
              <div className='border-t border-outline-variant p-5 space-y-5'>
                {/* 1. Rang sozlamalari — faqat nom + HEX (rasm endi har variantda) */}
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <div>
                    <label className='mb-2 block text-[11px] font-bold uppercase text-on-surface-variant'>
                      Rang nomi
                    </label>
                    <input
                      value={baseVariant.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        group.forEach((v) => onVariantChange(variants.indexOf(v), 'color', val));
                      }}
                      className='w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                      placeholder="Qora, Ko'k, Kumush..."
                    />
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.hex}
                          type='button'
                          title={preset.name}
                          onClick={() => {
                            group.forEach((v) => {
                              const idx = variants.indexOf(v);
                              onVariantChange(idx, 'color', preset.name);
                              onVariantChange(idx, 'color_hex', preset.hex);
                            });
                          }}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all hover:scale-105 ${baseVariant.color === preset.name ? 'border-primary bg-primary-container/20 text-primary' : 'border-outline-variant text-on-surface-variant hover:border-outline'}`}
                        >
                          <span
                            className='h-3 w-3 rounded-full border shadow-sm'
                            style={{ backgroundColor: preset.hex }}
                          />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className='mb-2 block text-[11px] font-bold uppercase text-on-surface-variant'>
                      Rang kodi (HEX)
                    </label>
                    <div className='flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden'>
                      <input
                        type='color'
                        value={baseVariant.color_hex || '#000000'}
                        onChange={(e) => {
                          const val = e.target.value;
                          group.forEach((v) =>
                            onVariantChange(variants.indexOf(v), 'color_hex', val),
                          );
                        }}
                        className='h-[38px] w-12 cursor-pointer border-0 bg-transparent p-1'
                      />
                      <input
                        value={baseVariant.color_hex}
                        onChange={(e) => {
                          const val = e.target.value;
                          group.forEach((v) =>
                            onVariantChange(variants.indexOf(v), 'color_hex', val),
                          );
                        }}
                        className='min-w-0 flex-1 bg-transparent px-2 text-sm font-mono outline-none'
                        placeholder='#111827'
                      />
                    </div>
                    <p className='mt-2 text-[11px] text-on-surface-variant'>
                      💡 Saytda foydalanuvchi rang tugmasini shu HEX kodi bilan ko'radi.
                      Rasm — har bir variant qatorida alohida yuklanadi.
                    </p>
                  </div>
                </div>

                {/* 2. Variant qatorlari — har biri 2 qatorli card */}
                <div className='space-y-3'>
                  {group.map((variant) => {
                    const idx = variants.indexOf(variant);
                    const below = sellBelowCost(
                      variant.price,
                      variant.discount_price,
                      variant.cost_price,
                    );
                    const images = buildVariantImageList(
                      variant,
                      variantImageFiles,
                      variantImagePreviews,
                      variantGalleryPreviews,
                    );
                    const canAddMore = images.length < MAX_VARIANT_IMAGES;

                    return (
                      <div
                        key={variant.client_id}
                        // Phase 4.2 — variant qatoriga tahrirlash uchun anchor
                        // (mahsulotlar ro'yxatidan "Edit" bossa shu yerga scroll).
                        data-variant-id={variant.id ?? undefined}
                        className={`rounded-xl border p-3 transition-colors ${
                          below
                            ? 'border-error bg-error-container/15'
                            : 'border-outline-variant bg-surface-container-lowest hover:border-outline'
                        }`}
                        title={below ? 'Sotuv narxi tannarxdan past!' : undefined}
                      >
                        {/* ROW 1 — TEXT FIELDS: Sifat | Model | Hajm | (Stock + Actions)
                            Maqsad: text uchun KENG joy berish (kichik input'lar emas).
                            Har bir text maydoni 3 ustunni egallaydi → admin uzun
                            sifat/model nomlarini bemalol kiritadi. */}
                        <div className='grid grid-cols-12 gap-3 mb-3'>
                          <div className='col-span-12 sm:col-span-6 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant'>
                              Sifat
                            </label>
                            <input
                              value={variant.quality}
                              onChange={(e) => onVariantChange(idx, 'quality', e.target.value)}
                              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-medium outline-none focus:border-primary'
                              placeholder='Original, OEM, Copy A...'
                            />
                          </div>
                          <div className='col-span-6 sm:col-span-3 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant'>
                              Model
                            </label>
                            <input
                              value={variant.model}
                              onChange={(e) => onVariantChange(idx, 'model', e.target.value)}
                              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-medium outline-none focus:border-primary'
                              placeholder='Pro, Ultra, Max...'
                            />
                          </div>
                          <div className='col-span-6 sm:col-span-3 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant'>
                              Hajm
                            </label>
                            <input
                              value={variant.size}
                              onChange={(e) => onVariantChange(idx, 'size', e.target.value)}
                              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-medium outline-none focus:border-primary'
                              placeholder='128GB, 256/8...'
                            />
                          </div>
                          {/* Stock + Faol + Delete — yig'iq blok (lg+ da o'ng tomonda) */}
                          <div className='col-span-12 lg:col-span-3 flex items-end gap-2'>
                            <div className='flex-1 min-w-0'>
                              <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant'>
                                Stock
                              </label>
                              <input
                                value={variant.stock}
                                onChange={(e) => onVariantChange(idx, 'stock', e.target.value)}
                                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold outline-none focus:border-primary'
                                placeholder='0'
                              />
                            </div>
                            <button
                              type='button'
                              onClick={() =>
                                onVariantChange(idx, 'is_active', String(!variant.is_active))
                              }
                              className={`shrink-0 flex h-[40px] w-[40px] items-center justify-center rounded-lg transition-colors ${
                                variant.is_active
                                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                                  : 'bg-surface-container text-on-surface-variant hover:bg-outline-variant'
                              }`}
                              title={
                                variant.is_active
                                  ? 'Faol — bosing o\'chirish uchun'
                                  : 'Faol emas — bosing yoqish uchun'
                              }
                            >
                              <span className='material-symbols-outlined text-[20px]'>
                                {variant.is_active ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                            </button>
                            <button
                              type='button'
                              onClick={() => onRemoveVariant(idx)}
                              className='shrink-0 flex h-[40px] w-[40px] items-center justify-center rounded-lg bg-error-container/30 text-error transition-all hover:bg-error hover:text-on-error'
                              title="Variantni o'chirish"
                            >
                              <span className='material-symbols-outlined text-[20px]'>delete</span>
                            </button>
                          </div>
                        </div>

                        {/* ROW 2 — NARX/CHEGIRMA/KIRIM + SKU
                            Har bir narx bloki 3 ustun: keng so'm input + ixcham $ input. */}
                        <div className='grid grid-cols-12 gap-3 mb-3'>
                          <div className='col-span-12 sm:col-span-6 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-primary'>
                              Narx (so'm / $)
                            </label>
                            <div className='flex gap-1.5'>
                              <input
                                value={variant.price}
                                onChange={(e) =>
                                  onVariantPriceChange(idx, 'price', e.target.value, false)
                                }
                                className='min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-bold text-primary outline-none focus:border-primary'
                                placeholder="so'm"
                              />
                              <input
                                value={variant.price_usd}
                                onChange={(e) =>
                                  onVariantPriceChange(idx, 'price', e.target.value, true)
                                }
                                className='w-20 rounded-lg border border-outline-variant bg-surface-bright px-2 py-2 text-sm font-bold text-[#10b981] outline-none focus:border-primary'
                                placeholder='$'
                              />
                            </div>
                          </div>
                          <div className='col-span-12 sm:col-span-6 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-tertiary'>
                              Chegirma (so'm / $)
                            </label>
                            <div className='flex gap-1.5'>
                              <input
                                value={variant.discount_price}
                                onChange={(e) =>
                                  onVariantPriceChange(idx, 'discount_price', e.target.value, false)
                                }
                                className='min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-medium text-tertiary outline-none focus:border-primary'
                                placeholder="so'm"
                              />
                              <input
                                value={variant.discount_price_usd}
                                onChange={(e) =>
                                  onVariantPriceChange(idx, 'discount_price', e.target.value, true)
                                }
                                className='w-20 rounded-lg border border-outline-variant bg-surface-bright px-2 py-2 text-sm font-medium text-[#f59e0b] outline-none focus:border-primary'
                                placeholder='$'
                              />
                            </div>
                          </div>
                          <div className='col-span-12 sm:col-span-6 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant'>
                              Kirim (so'm / $)
                            </label>
                            <div className='flex gap-1.5'>
                              <input
                                value={variant.cost_price}
                                onChange={(e) =>
                                  onVariantPriceChange(idx, 'cost_price', e.target.value, false)
                                }
                                className='min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-medium outline-none focus:border-primary'
                                placeholder="so'm"
                              />
                              <input
                                value={variant.cost_price_usd}
                                onChange={(e) =>
                                  onVariantPriceChange(idx, 'cost_price', e.target.value, true)
                                }
                                className='w-20 rounded-lg border border-outline-variant bg-surface-bright px-2 py-2 text-sm font-medium outline-none focus:border-primary'
                                placeholder='$'
                              />
                            </div>
                          </div>
                          <div className='col-span-12 sm:col-span-6 lg:col-span-3'>
                            <label className='mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant'>
                              SKU
                            </label>
                            <div className='flex items-stretch gap-1.5'>
                              <input
                                value={variant.sku}
                                onChange={(e) => onVariantChange(idx, 'sku', e.target.value)}
                                className='min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 text-sm font-mono outline-none focus:border-primary'
                                placeholder='SKU...'
                              />
                              <button
                                type='button'
                                onClick={() => onGenerateSku(idx)}
                                className='shrink-0 flex items-center justify-center w-[40px] rounded-lg bg-primary/10 text-primary hover:bg-primary/20'
                                title='Avtomatik SKU yaratish'
                              >
                                <span className='material-symbols-outlined text-[18px]'>
                                  magic_button
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* ROW 2 — IMAGE STRIP (per-variant) + POLKA (rasm yonida) */}
                        <div className='mt-3 rounded-lg border border-dashed border-outline-variant/60 bg-surface/40 p-2.5'>
                          <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                            <div className='flex items-center gap-1.5'>
                              <span className='material-symbols-outlined text-[16px] text-on-surface-variant'>
                                image
                              </span>
                              <span className='text-[11px] font-bold uppercase text-on-surface-variant'>
                                Rasmlar
                              </span>
                              <span className='text-[11px] text-on-surface-variant'>
                                {images.length}/{MAX_VARIANT_IMAGES}
                              </span>
                              {images.length > 0 && (
                                <span className='ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary'>
                                  1-rasm = asosiy
                                </span>
                              )}
                              {images.length === 0 && (
                                <span className='ml-1 text-[10px] text-error/80'>
                                  ⚠ Rasm yo'q — boshqa variantning rasmi ko'rinadi
                                </span>
                              )}
                            </div>
                            {/* Phase 4.0 — POLKA (do'kondagi joy). RASM YONIDA — admin
                                qaysi polkaga qo'yganini rasm tanlash payti yozadi.
                                FAQAT admin tomonida ko'rinadi — backend public API
                                bu maydonni qaytarmaydi. */}
                            <div className='flex items-center gap-1.5'>
                              <span
                                className='material-symbols-outlined text-[14px] text-primary'
                                title="Do'kondagi polka manzili (faqat admin)"
                              >
                                pin_drop
                              </span>
                              <span className='text-[11px] font-bold uppercase tracking-wide text-primary'>
                                Polka
                              </span>
                              <input
                                value={variant.shelf_location}
                                onChange={(e) =>
                                  onVariantChange(
                                    idx,
                                    'shelf_location',
                                    e.target.value.slice(0, 20),
                                  )
                                }
                                placeholder='001'
                                maxLength={20}
                                title="Do'kondagi jismoniy polka (faqat admin va POS'da ko'rinadi)"
                                className='w-24 rounded-lg border border-primary/40 bg-surface-bright px-2 py-1 text-sm font-bold text-primary outline-none placeholder:font-normal placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-2 focus:ring-primary/30'
                              />
                            </div>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            {images.map((img, i) => {
                              const isMain = i === 0;
                              const key =
                                img.kind === 'existing-gallery'
                                  ? `eg-${img.id}`
                                  : img.kind === 'new-gallery'
                                    ? `ng-${img.index}`
                                    : `${img.kind}-${i}`;
                              return (
                                <div key={key} className='relative group/img'>
                                  <img
                                    src={img.url}
                                    alt=''
                                    className={`h-16 w-16 rounded-lg object-cover ring-1 transition-all ${
                                      isMain
                                        ? 'ring-2 ring-primary shadow-md'
                                        : 'ring-outline-variant'
                                    } ${
                                      img.kind.startsWith('new-')
                                        ? 'border-2 border-primary/50'
                                        : ''
                                    }`}
                                  />
                                  {isMain && (
                                    <span className='absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-primary px-1 py-px text-[8px] font-bold text-on-primary whitespace-nowrap shadow'>
                                      ASOSIY
                                    </span>
                                  )}
                                  <button
                                    type='button'
                                    onClick={() => handleVariantImageRemove(variant, img)}
                                    className='absolute -top-1.5 -right-1.5 hidden group-hover/img:flex h-5 w-5 items-center justify-center rounded-full bg-error text-on-error text-[11px] shadow'
                                    title="Olib tashlash"
                                  >
                                    <span className='material-symbols-outlined text-[13px]'>
                                      close
                                    </span>
                                  </button>
                                </div>
                              );
                            })}
                            {canAddMore && (
                              <label className='flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-outline-variant bg-surface text-on-surface-variant hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors'>
                                <span className='material-symbols-outlined text-xl'>
                                  add_photo_alternate
                                </span>
                                <span className='text-[9px] mt-0.5 font-medium'>Yuklash</span>
                                <input
                                  type='file'
                                  accept='image/*'
                                  multiple
                                  className='hidden'
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    const remaining = MAX_VARIANT_IMAGES - images.length;
                                    const slice = files.slice(0, remaining);
                                    if (slice.length) handleVariantImagesPick(variant, slice);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 3. Add new spec row to this color */}
                <div className='flex'>
                  <button
                    type='button'
                    onClick={() => onAddVariantToGroup(baseVariant)}
                    className='flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary-container/10'
                  >
                    <span className='material-symbols-outlined text-[16px]'>add_circle</span>
                    Bu rangga yangi sifat/hajm qo'shish
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BulkVariantGenerator = ({
  defaults,
  onGenerate,
}: {
  defaults: {
    basePrice: string;
    baseDiscountPrice: string;
    baseCostPrice: string;
    baseStock: string;
  };
  onGenerate: (config: any) => void;
}) => {
  const [config, setConfig] = useState({
    colors: '',
    qualities: '',
    models: '',
    sizes: '',
    baseStock: defaults.baseStock || '0',
    basePrice: defaults.basePrice || '',
    baseDiscountPrice: defaults.baseDiscountPrice || '',
    baseCostPrice: defaults.baseCostPrice || '',
  });
  const preview = useMemo(() => {
    const c = config.colors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const q = config.qualities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const m = config.models
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const s = config.sizes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      Math.max(1, c.length || 1) *
      Math.max(1, q.length || 1) *
      Math.max(1, m.length || 1) *
      Math.max(1, s.length || 1)
    );
  }, [config]);
  return (
    <div className='mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5'>
      <div className='mb-4 flex items-center gap-2'>
        <span className='material-symbols-outlined text-[20px] text-primary'>auto_fix_high</span>
        <h5 className='font-semibold text-primary'>⚡ Tez Variant Generator</h5>
        <span className='ml-auto rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary'>
          {preview} ta variant generatsiya qilinadi
        </span>
      </div>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Ranglar (vergul bilan)
          </label>
          <input
            value={config.colors}
            onChange={(e) => setConfig((c) => ({ ...c, colors: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder="Qora, Oq, Ko'k"
          />
          <div className='mt-1 flex flex-wrap gap-1'>
            {COLOR_PRESETS.slice(0, 8).map((p) => (
              <button
                key={p.hex}
                type='button'
                onClick={() =>
                  setConfig((c) => ({ ...c, colors: c.colors ? `${c.colors}, ${p.name}` : p.name }))
                }
                className='flex items-center gap-1 rounded-md border border-outline-variant px-1.5 py-0.5 text-[10px] hover:bg-surface-container'
              >
                <span className='h-2.5 w-2.5 rounded-full' style={{ backgroundColor: p.hex }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Sifatlar (vergul bilan)
          </label>
          <input
            value={config.qualities}
            onChange={(e) => setConfig((c) => ({ ...c, qualities: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='Original, OEM, Copy A'
          />
          <div className='mt-1 flex flex-wrap gap-1'>
            {QUALITY_PRESETS.map((q) => (
              <button
                key={q}
                type='button'
                onClick={() =>
                  setConfig((c) => ({ ...c, qualities: c.qualities ? `${c.qualities}, ${q}` : q }))
                }
                className='rounded-md border border-outline-variant px-1.5 py-0.5 text-[10px] hover:bg-surface-container'
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Modellar (vergul bilan)
          </label>
          <input
            value={config.models}
            onChange={(e) => setConfig((c) => ({ ...c, models: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='Pro, Ultra, Max'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            O\'lchamlar (vergul bilan)
          </label>
          <input
            value={config.sizes}
            onChange={(e) => setConfig((c) => ({ ...c, sizes: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='128GB, 256GB, 512GB'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Asosiy narx (so'm)
          </label>
          <input
            type='text'
            inputMode='decimal'
            value={config.basePrice}
            onChange={(e) =>
              setConfig((c) => ({ ...c, basePrice: formatPriceInput(e.target.value) }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary'
            placeholder='15 000 000'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Chegirma narxi (so'm)
          </label>
          <input
            type='text'
            inputMode='decimal'
            value={config.baseDiscountPrice}
            onChange={(e) =>
              setConfig((c) => ({ ...c, baseDiscountPrice: formatPriceInput(e.target.value) }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold text-tertiary outline-none focus:border-primary'
            placeholder='13 500 000'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Kirim narxi (so'm)
          </label>
          <input
            type='text'
            inputMode='decimal'
            value={config.baseCostPrice}
            onChange={(e) =>
              setConfig((c) => ({ ...c, baseCostPrice: formatPriceInput(e.target.value) }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold outline-none focus:border-primary'
            placeholder='10 000 000'
          />
        </div>
        <div>
          <label className='mb-1 block text-[11px] font-bold uppercase text-on-surface-variant'>
            Ombor soni
          </label>
          <input
            type='number'
            min='0'
            value={config.baseStock}
            onChange={(e) => setConfig((c) => ({ ...c, baseStock: e.target.value }))}
            className='w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary'
            placeholder='10'
          />
        </div>
      </div>
      <div className='mt-4 flex justify-end'>
        <button
          type='button'
          onClick={() => onGenerate(config)}
          className='flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-semibold text-on-primary hover:opacity-90 shadow-lg shadow-primary/20'
        >
          <span className='material-symbols-outlined text-[18px]'>auto_fix_high</span>
          {preview} ta Variant Generatsiya Qilish
        </button>
      </div>
    </div>
  );
};
