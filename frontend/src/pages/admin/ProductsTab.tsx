// admin/ProductsTab.tsx — Mahsulotlar ro'yxati: VARIANT-LEVEL qatorlar
//
// Phase 4.2 — kuchli UX yaxshilash (sizning so'rovingiz asosida):
//
//   • Variantli mahsulot: GROUP header qator + har variant alohida qator.
//     Variant qatori to'liq nomi bilan: "Samsung S26 ultra • Original • 512/12 • Kulrang".
//     Har variant alohida stok, narx, polka ko'rsatadi — chalkash "0 dona" yo'q.
//   • Variantsiz mahsulot: 1 ta yagona qator (mavjud xulq saqlanadi).
//   • Edit (variant qatorida) → product editor ochiladi va AYNAN o'sha variantga
//     scroll + halqa highlight. `window.__bozorScrollVariantId` orqali.
//   • Klonlash/o'chirish — faqat butun mahsulot uchun (product header'da yoki
//     variantsiz qatorda). Variant qatorida bu tugmalar YO'Q (chunki variant
//     alohida mavjudlikka ega emas — product editori ichida boshqariladi).
//   • Polka badge — Phase 4.2 fallback bilan:
//       variant.effective_shelf yoki product.shelf_location. UI faqat
//       `effective_shelf`'ga tayanadi (backend hisoblab beradi).
//
// XAVFSIZLIK: bu fayl faqat admin paneliga import qilinadi (lazy chunk).
// Public sahifalar (catalog, home, productDetail) bunga TEGMAYDI.

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ProductEditor } from './ProductEditor';
import AdminProductImport from '../../components/AdminProductImport';
import {
  categoryLabel,
  formatDate,
  formatMoney,
  MiniBadge,
  StatusBadge,
} from './shared';
import type {
  AdminProduct,
  AdminProductVariant,
  AdminCategory,
  ProductEditorState,
} from './shared';

// ── HELPER: variantning to'liq nomi (mahsulot nomi bilan birga) ─────────────
//
// Format: "Samsung S26 ultra • Original • 512/12 • Kulrang"
// Bo'sh atributlar avtomat o'tkazib yuboriladi. Bu sayt va POS'da ishlatiladigan
// "buildPosName" mantig'i bilan IZCHIL — admin har joyda bir xil nom ko'radi.
const buildVariantFullName = (
  productName: string,
  variant: AdminProductVariant,
): string => {
  const parts = [
    productName,
    variant.quality,
    variant.model,
    variant.size,
    variant.color,
  ]
    .map((s) => (s || '').trim())
    .filter((s) => s.length > 0);
  return parts.join(' • ');
};

// ── HELPER: variantning effektiv polka qiymati (fallback bilan) ─────────────
//
// Backend `effective_shelf` field qaytaradi (variant'niki yoki product fallback).
// Eski admin so'rovlar bu field'siz kelishi mumkin — defensive fallback:
//   variant.shelf_location -> variant.effective_shelf -> product.shelf_location
const resolveVariantShelf = (
  product: AdminProduct,
  variant: AdminProductVariant,
): string => {
  const own = (variant.shelf_location || '').trim();
  if (own) return own;
  const eff = (variant.effective_shelf || '').trim();
  if (eff) return eff;
  return (product.shelf_location || '').trim();
};

// ── HELPER: variant tahrirlash uchun editor ochish + scroll signal ──────────
//
// Ish printsipi: window'ga vaqtinchalik signal yozamiz, ProductEditor mount
// vaqtida uni o'qib o'sha variantga scroll qiladi va halqa highlight ko'rsatadi.
// Bu — props orqali variant ID'ni butun komponentlar daraxti orqali uzatishdan
// ko'ra ANCHA SODDA va mavjud arxitekturani buzmaydi.
const openEditorForVariant = (
  setEditor: Dispatch<SetStateAction<ProductEditorState | null>>,
  product: AdminProduct,
  variantId: number | undefined,
) => {
  (window as unknown as { __bozorScrollVariantId?: number | null })
    .__bozorScrollVariantId = variantId ?? null;
  setEditor({ mode: 'edit', product });
};

// ── HELPER: polka badge — rangli, kalin, ko'zga tashlanadigan ──────────────
const ShelfBadge = ({ shelf }: { shelf: string }) => {
  if (!shelf) return null;
  return (
    <span
      className='inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-extrabold text-primary ring-1 ring-primary/30'
      title="Do'kondagi polka manzili (faqat admin va POS'da ko'rinadi)"
    >
      <span className='material-symbols-outlined text-[14px]'>pin_drop</span>
      {shelf}
    </span>
  );
};

// ── HELPER: variantning "min narx" — variantli mahsulot uchun ──────────────
const minVariantPrice = (variants: AdminProductVariant[]): string => {
  const nums = variants
    .map((v) => Number(v.price ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return '0';
  return String(Math.min(...nums));
};

// ── HELPER: barcha variant stoklari yig'indisi ─────────────────────────────
const totalVariantStock = (variants: AdminProductVariant[]): number =>
  variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);

export const ProductsTab = ({
  products,
  totalCount,
  loading,
  categories,
  filters,
  onFiltersChange,
  hasPrevPage,
  hasNextPage,
  onDelete,
}: {
  products: AdminProduct[];
  totalCount: number;
  loading: boolean;
  categories: AdminCategory[];
  filters: {
    q: string;
    category: string;
    status: string;
    tag: string;
    page: number;
    page_size: number;
  };
  onFiltersChange: Dispatch<
    SetStateAction<{
      q: string;
      category: string;
      status: string;
      tag: string;
      page: number;
      page_size: number;
    }>
  >;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  onDelete: (id: number) => void;
}) => {
  const [editorState, setEditorState] = useState<ProductEditorState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const qcProducts = useQueryClient();

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Mahsulotlar ({totalCount})</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Tovar ma'lumotlari, rasm va variantlarni shu yerdan to'liq boshqaring.
            Variantli mahsulotlar har variantni alohida qator bo'lib chiqaradi —
            qaysi sotuvga foydaliroq, qaysi polkada turgani aniq ko'rinadi.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            onClick={() => setImportOpen(true)}
            className='flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 font-label-md text-primary hover:bg-primary/20'
          >
            <span className='material-symbols-outlined text-[18px]'>upload_file</span>
            Excel / CSV import
          </button>
          <button
            onClick={() => setEditorState({ mode: 'create' })}
            className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
          >
            <span className='material-symbols-outlined text-[18px]'>add</span>
            Mahsulot qo'shish
          </button>
        </div>
      </div>

      {importOpen && (
        <AdminProductImport
          categories={categories}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            qcProducts.invalidateQueries({ queryKey: ['admin-products'] });
            qcProducts.invalidateQueries({ queryKey: ['products'] });
            qcProducts.invalidateQueries({ queryKey: ['mainPage'] });
          }}
        />
      )}

      {editorState && (
        <ProductEditor
          categories={categories}
          mode={editorState.mode}
          product={editorState.product}
          onClose={() => setEditorState(null)}
        />
      )}

      <div className='rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm'>
        <div className='grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_220px_180px_180px_140px_auto]'>
          <input
            value={filters.q}
            onChange={(e) =>
              onFiltersChange((c) => ({ ...c, q: e.target.value, page: 1 }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            placeholder="Nomi, slug, SKU, barcode, rang yoki sifat bo'yicha qidiring"
          />
          <select
            value={filters.category}
            onChange={(e) =>
              onFiltersChange((c) => ({ ...c, category: e.target.value, page: 1 }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha kategoriyalar</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) =>
              onFiltersChange((c) => ({ ...c, status: e.target.value, page: 1 }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha statuslar</option>
            <option value='active'>Faol</option>
            <option value='inactive'>Noaktiv</option>
          </select>
          <select
            value={filters.tag}
            onChange={(e) =>
              onFiltersChange((c) => ({ ...c, tag: e.target.value, page: 1 }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value=''>Barcha belgilar</option>
            <option value='discount'>Chegirmadagi</option>
            <option value='new'>Yangi</option>
            <option value='popular'>Ommabop</option>
          </select>
          <select
            value={filters.page_size}
            onChange={(e) =>
              onFiltersChange((c) => ({
                ...c,
                page_size: Number(e.target.value),
                page: 1,
              }))
            }
            className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
          >
            <option value={20}>20 ta</option>
            <option value={50}>50 ta</option>
            <option value={100}>100 ta</option>
          </select>
          <button
            type='button'
            onClick={() =>
              onFiltersChange({
                q: '',
                category: '',
                status: '',
                tag: '',
                page: 1,
                page_size: filters.page_size,
              })
            }
            className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
          >
            Tozalash
          </button>
        </div>
      </div>

      {loading ? (
        <div className='py-12 text-center text-on-surface-variant'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
            progress_activity
          </span>
          Yuklanmoqda...
        </div>
      ) : products.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            inventory_2
          </span>
          <p className='font-h3 text-on-surface-variant'>Mahsulotlar yo'q</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
          {/* ── MOBIL KARTALAR (telefon) — jadval o'rniga ── */}
          <div className='divide-y divide-outline-variant md:hidden'>
            {products.map((product) => {
              const variants = product.variants || [];
              const hasVariants = variants.length > 0;
              const productShelf = (product.shelf_location || '').trim();

              return (
                <div key={product.id} className='p-3'>
                  {/* PRODUCT HEADER */}
                  <div className='flex gap-3'>
                    <div className='h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
                      {product.main_image ? (
                        <img
                          src={product.main_image}
                          alt={product.name}
                          className='h-full w-full object-cover'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center text-outline'>
                          <span className='material-symbols-outlined'>image</span>
                        </div>
                      )}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='text-sm font-bold text-on-surface'>
                        {product.name}
                      </div>
                      <div className='mt-0.5 text-xs text-on-surface-variant'>
                        {product.category_name || 'Biriktirilmagan'}
                      </div>
                      <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
                        {!hasVariants && (
                          <>
                            <span className='font-bold text-primary'>
                              {formatMoney(product.price)} so'm
                            </span>
                            {product.optom_price && (
                              <span className='text-secondary' title='Optom narx — faqat admin'>
                                Optom: {formatMoney(product.optom_price)}
                              </span>
                            )}
                            <span className='text-on-surface-variant'>
                              {product.stock} dona
                            </span>
                            {productShelf && <ShelfBadge shelf={productShelf} />}
                          </>
                        )}
                        {hasVariants && (
                          <span className='rounded-full bg-primary-container/50 px-2 py-0.5 font-semibold text-on-primary-container'>
                            {variants.length} variant
                          </span>
                        )}
                      </div>
                      <div className='mt-1.5 flex flex-wrap gap-1'>
                        <StatusBadge
                          active={product.is_active}
                          activeLabel='Faol'
                          inactiveLabel='Yopiq'
                        />
                        {product.is_new && <MiniBadge tone='primary'>Yangi</MiniBadge>}
                        {product.is_popular && (
                          <MiniBadge tone='secondary'>Ommabop</MiniBadge>
                        )}
                        {product.is_discount && (
                          <MiniBadge tone='tertiary'>Chegirma</MiniBadge>
                        )}
                      </div>
                    </div>
                    <div className='flex shrink-0 flex-col gap-1'>
                      <button
                        onClick={() => setEditorState({ mode: 'edit', product })}
                        className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
                        title='Tahrirlash'
                      >
                        <span className='material-symbols-outlined text-[20px]'>
                          edit
                        </span>
                      </button>
                      <button
                        onClick={() => setEditorState({ mode: 'create', product })}
                        className='rounded-lg p-2 text-on-surface-variant hover:bg-surface-container'
                        title='Nusxa olish (klonlash)'
                      >
                        <span className='material-symbols-outlined text-[20px]'>
                          content_copy
                        </span>
                      </button>
                      <button
                        onClick={() => onDelete(product.id)}
                        className='rounded-lg p-2 text-error hover:bg-error-container/20'
                        title="O'chirish"
                      >
                        <span className='material-symbols-outlined text-[20px]'>
                          delete
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* VARIANT-LEVEL CARDS (variantli mahsulot uchun) */}
                  {hasVariants && (
                    <div className='mt-2 space-y-1.5 border-l-2 border-primary/30 pl-3'>
                      {variants.map((v) => {
                        const shelf = resolveVariantShelf(product, v);
                        const fullName = buildVariantFullName(product.name, v);
                        return (
                          <div
                            key={v.id ?? `${product.id}-${v.color}-${v.sku}`}
                            className='flex items-start gap-2 rounded-lg bg-surface-container/40 p-2'
                          >
                            <div className='min-w-0 flex-1'>
                              <div className='text-xs font-semibold text-on-surface'>
                                {fullName}
                              </div>
                              <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]'>
                                <span className='font-bold text-primary'>
                                  {formatMoney(v.price ?? product.price)} so'm
                                </span>
                                {v.optom_price && (
                                  <span className='text-secondary' title='Optom narx — faqat admin'>
                                    Optom: {formatMoney(v.optom_price)}
                                  </span>
                                )}
                                <span className='text-on-surface-variant'>
                                  {v.stock ?? 0} dona
                                </span>
                                {shelf && <ShelfBadge shelf={shelf} />}
                                {v.sku && (
                                  <span className='font-mono text-[10px] text-on-surface-variant/70'>
                                    {v.sku}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                openEditorForVariant(setEditorState, product, v.id)
                              }
                              className='rounded-lg p-1.5 text-primary hover:bg-primary-container/20'
                              title='Bu variantni tahrirlash'
                            >
                              <span className='material-symbols-outlined text-[16px]'>
                                edit
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── DESKTOP JADVAL ── */}
          <div className='hidden overflow-x-auto md:block'>
            <table className='w-full min-w-[1080px] text-left'>
              <thead className='border-b border-outline-variant bg-surface-container'>
                <tr>
                  {[
                    'Mahsulot',
                    'Kategoriya',
                    'Narx',
                    'Ombor',
                    'Polka',
                    'Holat',
                    'Yangilangan',
                    'Amal',
                  ].map((h) => (
                    <th
                      key={h}
                      className='px-4 py-3 text-label-md font-label-md uppercase text-on-surface-variant'
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-outline-variant'>
                {products.map((product) => {
                  const variants = product.variants || [];
                  const hasVariants = variants.length > 0;
                  const productShelf = (product.shelf_location || '').trim();
                  const totalStock = hasVariants
                    ? totalVariantStock(variants)
                    : product.stock;
                  const minPrice = hasVariants
                    ? minVariantPrice(variants)
                    : product.price;

                  return (
                    <ProductRowGroup
                      key={product.id}
                      product={product}
                      variants={variants}
                      hasVariants={hasVariants}
                      productShelf={productShelf}
                      totalStock={totalStock}
                      minPrice={minPrice}
                      onEdit={() => setEditorState({ mode: 'edit', product })}
                      onClone={() => setEditorState({ mode: 'create', product })}
                      onDeleteProduct={() => onDelete(product.id)}
                      onEditVariant={(vid) =>
                        openEditorForVariant(setEditorState, product, vid)
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className='flex flex-col gap-3 border-t border-outline-variant px-4 py-3 md:flex-row md:items-center md:justify-between'>
            <div className='text-sm text-on-surface-variant'>
              Sahifa: {filters.page} • Ko'rsatilmoqda: {products.length} ta mahsulot
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                disabled={!hasPrevPage}
                onClick={() =>
                  onFiltersChange((c) => ({ ...c, page: Math.max(1, c.page - 1) }))
                }
                className='rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface hover:bg-surface-container disabled:opacity-45'
              >
                Oldingi
              </button>
              <button
                type='button'
                disabled={!hasNextPage}
                onClick={() =>
                  onFiltersChange((c) => ({ ...c, page: c.page + 1 }))
                }
                className='rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface hover:bg-surface-container disabled:opacity-45'
              >
                Keyingi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── ProductRowGroup ──────────────────────────────────────────────────────────
// Bitta mahsulot uchun jadvalda 1 yoki N+1 qator chiqaradi:
//   • Variantsiz mahsulot: 1 qator (mavjud xulq saqlanadi)
//   • Variantli mahsulot: 1 ta product header + har variant uchun alohida qator
//
// React.Fragment ishlatamiz — bitta `key={product.id}` ostida bir nechta qator.
const ProductRowGroup = ({
  product,
  variants,
  hasVariants,
  productShelf,
  totalStock,
  minPrice,
  onEdit,
  onClone,
  onDeleteProduct,
  onEditVariant,
}: {
  product: AdminProduct;
  variants: AdminProductVariant[];
  hasVariants: boolean;
  productShelf: string;
  totalStock: number;
  minPrice: string | number;
  onEdit: () => void;
  onClone: () => void;
  onDeleteProduct: () => void;
  onEditVariant: (variantId: number | undefined) => void;
}) => {
  return (
    <>
      {/* PRODUCT HEADER — variantli mahsulotda umumiy ma'lumot, variantsizda to'liq */}
      <tr
        className={`transition-colors hover:bg-surface-container-low/50 ${
          hasVariants ? 'bg-surface-container/30' : ''
        }`}
      >
        <td className='px-4 py-4'>
          <div className='flex items-center gap-3'>
            <div className='h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
              {product.main_image ? (
                <img
                  src={product.main_image}
                  alt={product.name}
                  className='h-full w-full object-cover'
                />
              ) : (
                <div className='flex h-full w-full items-center justify-center text-outline'>
                  <span className='material-symbols-outlined'>image</span>
                </div>
              )}
            </div>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-body-md font-semibold text-on-surface'>
                  {product.name}
                </span>
                {hasVariants && (
                  <span
                    className='rounded-full bg-primary-container/60 px-2 py-0.5 text-xs font-bold text-on-primary-container'
                    title='Variantli mahsulot'
                  >
                    {variants.length} variant
                  </span>
                )}
              </div>
              <div className='mt-1 text-xs text-on-surface-variant'>
                slug: {product.slug}
              </div>
            </div>
          </div>
        </td>
        <td className='px-4 py-4 text-body-sm text-on-surface'>
          {product.category_name || (
            <span className='text-on-surface-variant'>Biriktirilmagan</span>
          )}
        </td>
        <td className='px-4 py-4'>
          <div className='font-semibold text-on-surface'>
            {formatMoney(minPrice)} so'm
            {hasVariants && (
              <span className='ml-1 text-[10px] font-normal text-on-surface-variant'>
                (min)
              </span>
            )}
          </div>
          {!hasVariants && product.discount_price && (
            <div className='text-xs text-secondary-container'>
              Chegirma: {formatMoney(product.discount_price)} so'm
            </div>
          )}
          {!hasVariants && product.optom_price && (
            <div className='text-xs text-secondary' title='Optom (ulgurji) narx — faqat admin'>
              Optom: {formatMoney(product.optom_price)} so'm
            </div>
          )}
        </td>
        <td className='px-4 py-4 text-body-sm text-on-surface'>
          {totalStock} dona
          {hasVariants && (
            <span className='ml-1 text-[10px] text-on-surface-variant'>(jami)</span>
          )}
        </td>
        <td className='px-4 py-4'>
          {!hasVariants && <ShelfBadge shelf={productShelf} />}
          {hasVariants && productShelf && (
            <span
              className='text-[10px] text-on-surface-variant/70'
              title='Bu mahsulotning umumiy polka manzili (variant polkalarida fallback)'
            >
              <ShelfBadge shelf={productShelf} />
              <span className='ml-1'>(default)</span>
            </span>
          )}
        </td>
        <td className='px-4 py-4'>
          <div className='flex flex-wrap gap-1'>
            <StatusBadge
              active={product.is_active}
              activeLabel='Faol'
              inactiveLabel='Ochiq emas'
            />
            {product.is_new && <MiniBadge tone='primary'>Yangi</MiniBadge>}
            {product.is_popular && <MiniBadge tone='secondary'>Ommabop</MiniBadge>}
            {product.is_discount && <MiniBadge tone='tertiary'>Chegirma</MiniBadge>}
          </div>
        </td>
        <td className='px-4 py-4 text-body-sm text-on-surface-variant'>
          {formatDate(product.updated_at)}
        </td>
        <td className='px-4 py-4'>
          <div className='flex items-center gap-1'>
            <button
              onClick={onEdit}
              className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
              title='Mahsulotni tahrirlash'
            >
              <span className='material-symbols-outlined text-[20px]'>edit</span>
            </button>
            <button
              onClick={onClone}
              className='rounded-lg p-2 text-on-surface-variant hover:bg-surface-container'
              title='Nusxa olish (klonlash)'
            >
              <span className='material-symbols-outlined text-[20px]'>
                content_copy
              </span>
            </button>
            <button
              onClick={onDeleteProduct}
              className='rounded-lg p-2 text-error hover:bg-error-container/20'
              title="O'chirish (butun mahsulot)"
            >
              <span className='material-symbols-outlined text-[20px]'>delete</span>
            </button>
          </div>
        </td>
      </tr>

      {/* VARIANT QATORLARI — variantli mahsulotda har variant alohida qator */}
      {hasVariants &&
        variants.map((v) => {
          const shelf = resolveVariantShelf(product, v);
          const fullName = buildVariantFullName(product.name, v);
          return (
            <tr
              key={`v-${product.id}-${v.id ?? v.sku ?? v.color ?? Math.random()}`}
              className='transition-colors hover:bg-primary/5'
            >
              <td className='px-4 py-3'>
                <div className='flex items-center gap-3 pl-6'>
                  {/* Vertical line — sub-row visual indicator */}
                  <div className='h-12 w-1 shrink-0 rounded-full bg-primary/30' />
                  <div className='h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
                    {(v.images?.[0]?.url || v.image_url) ? (
                      <img
                        src={v.images?.[0]?.url || v.image_url || ''}
                        alt={fullName}
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      <div className='flex h-full w-full items-center justify-center text-outline'>
                        <span className='material-symbols-outlined text-[18px]'>
                          image
                        </span>
                      </div>
                    )}
                  </div>
                  <div className='min-w-0'>
                    <div className='text-sm font-semibold text-on-surface'>
                      {fullName}
                    </div>
                    {v.sku && (
                      <div className='mt-0.5 font-mono text-[11px] text-on-surface-variant'>
                        SKU: {v.sku}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className='px-4 py-3 text-xs text-on-surface-variant'>—</td>
              <td className='px-4 py-3'>
                <div className='font-semibold text-on-surface'>
                  {formatMoney(v.price ?? product.price)} so'm
                </div>
                {v.discount_price && (
                  <div className='text-xs text-secondary-container'>
                    Chegirma: {formatMoney(v.discount_price)} so'm
                  </div>
                )}
                {v.optom_price && (
                  <div className='text-xs text-secondary' title='Optom (ulgurji) narx — faqat admin'>
                    Optom: {formatMoney(v.optom_price)} so'm
                  </div>
                )}
              </td>
              <td className='px-4 py-3 text-body-sm text-on-surface'>
                {v.stock ?? 0} dona
              </td>
              <td className='px-4 py-3'>
                <ShelfBadge shelf={shelf} />
              </td>
              <td className='px-4 py-3'>
                {v.is_active === false ? (
                  <StatusBadge
                    active={false}
                    activeLabel='Faol'
                    inactiveLabel='Yopiq'
                  />
                ) : (
                  <span className='text-xs text-on-surface-variant'>—</span>
                )}
              </td>
              <td className='px-4 py-3 text-xs text-on-surface-variant'>—</td>
              <td className='px-4 py-3'>
                <button
                  onClick={() => onEditVariant(v.id)}
                  className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
                  title="Bu variantni tahrirlash (forma o'sha variantga ochiladi)"
                >
                  <span className='material-symbols-outlined text-[20px]'>edit</span>
                </button>
              </td>
            </tr>
          );
        })}
    </>
  );
};
