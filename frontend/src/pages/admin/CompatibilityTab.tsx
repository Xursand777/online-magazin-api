// admin/CompatibilityTab.tsx — Telefon mos kelish matritsasi (brendlar/seriyalar/
// modellar + mahsulot mosligi). PhoneTree, PhoneModelsManager,
// ProductCompatibilityManager — ichki komponentlar. #N3: AdminPanel'dan AYNAN
// ko'chirildi (mantiq o'zgarmas).
import { useState, useMemo, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminGetPhoneBrands, adminCreatePhoneBrand, adminDeletePhoneBrand,
  adminCreatePhoneSeries, adminDeletePhoneSeries,
  adminCreatePhoneModel, adminDeletePhoneModel,
  adminGetProducts, adminGetProductCompatibility, adminAddProductCompatibility,
  adminRemoveProductCompatibility, adminBulkAddCompatibilitySeries,
} from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { extractErrorMessage } from './shared';
import type { AdminProduct } from './shared';

interface CPhoneModel {
  id: number;
  slug: string;
  full_name: string;
  brand_name: string;
  series_name: string;
  year: number | null;
  is_popular: boolean;
}
interface CPhoneSeries {
  id: number;
  name: string;
  slug: string;
  order: number;
  models: CPhoneModel[];
}
interface CPhoneBrand {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  is_popular: boolean;
  order: number;
  series: CPhoneSeries[];
}
interface CCompatEntry {
  id: number;
  phone_model: CPhoneModel;
  notes: string;
}

type CompatSubTab = 'models' | 'products';

// ── Reusable: Brand / Series / Model tree viewer ──────────────────────────────
const PhoneTree = ({
  brands,
  renderModelExtra,
  renderSeriesExtra,
  renderBrandExtra,
  checkable,
  checkedIds,
  existingIds,
  onToggleModel,
}: {
  brands: CPhoneBrand[];
  renderModelExtra?: (m: CPhoneModel, series: CPhoneSeries) => ReactNode;
  renderSeriesExtra?: (s: CPhoneSeries, brand: CPhoneBrand) => ReactNode;
  renderBrandExtra?: (b: CPhoneBrand) => ReactNode;
  checkable?: boolean;
  checkedIds?: Set<number>;
  existingIds?: Set<number>;
  onToggleModel?: (id: number) => void;
}) => {
  const [openBrands, setOpenBrands] = useState<Set<number>>(new Set(brands.map((b) => b.id)));
  const [openSeries, setOpenSeries] = useState<Set<number>>(new Set());

  const toggleBrand = (id: number) =>
    setOpenBrands((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSeries = (id: number) =>
    setOpenSeries((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!brands.length)
    return <p className="py-8 text-center text-sm text-on-surface-variant">Brendlar yo'q</p>;

  return (
    <div className="space-y-2">
      {brands.map((brand) => (
        <div key={brand.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
          {/* Brand header */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button onClick={() => toggleBrand(brand.id)} className="flex flex-1 items-center gap-2 text-left">
              <span className="material-symbols-outlined text-[18px] text-primary transition-transform"
                style={{ transform: openBrands.has(brand.id) ? 'rotate(90deg)' : 'none' }}>
                chevron_right
              </span>
              <span className="font-medium text-on-surface">{brand.name}</span>
              {brand.is_popular && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Mashhur</span>
              )}
              <span className="ml-1 text-xs text-on-surface-variant">
                ({brand.series.reduce((s, sr) => s + sr.models.length, 0)} model)
              </span>
            </button>
            {renderBrandExtra?.(brand)}
          </div>

          {/* Series list */}
          {openBrands.has(brand.id) && (
            <div className="border-t border-outline-variant/50 bg-surface-container-low/30 px-4 py-2 space-y-2">
              {brand.series.length === 0 && (
                <p className="py-2 text-xs text-on-surface-variant">Seriyalar yo'q</p>
              )}
              {brand.series.map((series) => (
                <div key={series.id}>
                  <div className="flex items-center gap-2 py-1.5">
                    <button onClick={() => toggleSeries(series.id)} className="flex flex-1 items-center gap-1.5 text-left">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform"
                        style={{ transform: openSeries.has(series.id) ? 'rotate(90deg)' : 'none' }}>
                        chevron_right
                      </span>
                      <span className="text-sm font-medium text-on-surface">{series.name}</span>
                      <span className="text-xs text-on-surface-variant">({series.models.length})</span>
                    </button>
                    {renderSeriesExtra?.(series, brand)}
                  </div>
                  {openSeries.has(series.id) && (
                    <div className="ml-6 space-y-1 pb-1">
                      {series.models.map((m) => {
                        const isExisting = existingIds?.has(m.id);
                        const isChecked = checkedIds?.has(m.id);
                        return (
                          <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-container">
                            {checkable && (
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                disabled={isExisting}
                                checked={isExisting || isChecked}
                                onChange={() => onToggleModel?.(m.id)}
                              />
                            )}
                            <span className={`flex-1 text-sm ${isExisting ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                              {m.full_name}
                              {m.is_popular && <span className="ml-1 text-xs text-primary">★</span>}
                            </span>
                            {isExisting && (
                              <span className="text-xs text-secondary">qo'shilgan</span>
                            )}
                            {renderModelExtra?.(m, series)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Sub-tab 1: Phone Models Manager ──────────────────────────────────────────
const PhoneModelsManager = () => {
  const qc = useQueryClient();
  const [showBrandForm, setShowBrandForm]   = useState(false);
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [showModelForm, setShowModelForm]   = useState(false);
  const [brandForm, setBrandForm]   = useState({ name: '', is_popular: false, order: 0 });
  const [seriesForm, setSeriesForm] = useState({ brand: '', name: '', order: 0 });
  const [modelForm, setModelForm]   = useState({ series: '', name: '', year: '', is_popular: false, order: 0 });
  const [saving, setSaving] = useState(false);

  const { data: brands = [], isLoading } = useQuery<CPhoneBrand[]>({
    queryKey: ['admin-phone-brands'],
    queryFn: () => adminGetPhoneBrands().then((r) => r.data?.results ?? r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-phone-brands'] });

  const handleBrand = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await adminCreatePhoneBrand({ ...brandForm, order: Number(brandForm.order) });
      invalidate(); setShowBrandForm(false); setBrandForm({ name: '', is_popular: false, order: 0 });
      toast.success('Brend qo\'shildi');
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const handleSeries = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await adminCreatePhoneSeries({ brand: Number(seriesForm.brand), name: seriesForm.name, order: Number(seriesForm.order) });
      invalidate(); setShowSeriesForm(false); setSeriesForm({ brand: '', name: '', order: 0 });
      toast.success('Seriya qo\'shildi');
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const handleModel = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await adminCreatePhoneModel({
        series: Number(modelForm.series),
        name: modelForm.name,
        year: modelForm.year ? Number(modelForm.year) : null,
        is_popular: modelForm.is_popular,
        order: Number(modelForm.order),
      });
      invalidate(); setShowModelForm(false); setModelForm({ series: '', name: '', year: '', is_popular: false, order: 0 });
      toast.success('Model qo\'shildi');
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const deleteBrand = async (id: number, name: string) => {
    if (!confirm(`"${name}" brendini o'chirishni tasdiqlaysizmi? Barcha seriya va modellari ham o'chadi.`)) return;
    try { await adminDeletePhoneBrand(id); invalidate(); toast.success('Brend o\'chirildi'); }
    catch (err) { toast.error(extractErrorMessage(err)); }
  };
  const deleteSeries = async (id: number, name: string) => {
    if (!confirm(`"${name}" seriyasini o'chirishni tasdiqlaysizmi?`)) return;
    try { await adminDeletePhoneSeries(id); invalidate(); toast.success('Seriya o\'chirildi'); }
    catch (err) { toast.error(extractErrorMessage(err)); }
  };
  const deleteModel = async (id: number, name: string) => {
    if (!confirm(`"${name}" modelini o'chirishni tasdiqlaysizmi?`)) return;
    try { await adminDeletePhoneModel(id); invalidate(); toast.success('Model o\'chirildi'); }
    catch (err) { toast.error(extractErrorMessage(err)); }
  };

  const allSeries = brands.flatMap((b) => b.series.map((s) => ({ ...s, brandName: b.name })));

  if (isLoading) return <div className="py-16 text-center text-on-surface-variant">Yuklanmoqda…</div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowBrandForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Brend qo'shish
        </button>
        <button onClick={() => setShowSeriesForm(true)}
          className="flex items-center gap-1.5 rounded-xl border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Seriya qo'shish
        </button>
        <button onClick={() => setShowModelForm(true)}
          className="flex items-center gap-1.5 rounded-xl border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">smartphone</span>
          Model qo'shish
        </button>
      </div>

      {/* Brand Tree */}
      <PhoneTree
        brands={brands}
        renderBrandExtra={(b) => (
          <button onClick={() => deleteBrand(b.id, b.name)}
            className="rounded-lg p-1.5 text-error hover:bg-error/10" title="O'chirish">
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
        renderSeriesExtra={(s) => (
          <button onClick={() => deleteSeries(s.id, s.name)}
            className="rounded-lg p-1.5 text-error hover:bg-error/10" title="O'chirish">
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        )}
        renderModelExtra={(m) => (
          <button onClick={() => deleteModel(m.id, m.full_name)}
            className="rounded-lg p-1 text-error hover:bg-error/10" title="O'chirish">
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        )}
      />

      {/* ── Brand Form Modal ── */}
      {showBrandForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-on-surface">Yangi brend</h3>
            <form onSubmit={handleBrand} className="space-y-3">
              <input required placeholder="Brend nomi (Apple, Samsung…)" value={brandForm.name}
                onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="bp" checked={brandForm.is_popular}
                  onChange={(e) => setBrandForm({ ...brandForm, is_popular: e.target.checked })} />
                <label htmlFor="bp" className="text-sm text-on-surface">Mashhur brend</label>
              </div>
              <input type="number" placeholder="Tartib (0, 1, 2…)" value={brandForm.order}
                onChange={(e) => setBrandForm({ ...brandForm, order: Number(e.target.value) })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowBrandForm(false)}
                  className="flex-1 rounded-xl border border-outline py-2 text-sm text-on-surface hover:bg-surface-container">
                  Bekor
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Series Form Modal ── */}
      {showSeriesForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-on-surface">Yangi seriya</h3>
            <form onSubmit={handleSeries} className="space-y-3">
              <select required value={seriesForm.brand}
                onChange={(e) => setSeriesForm({ ...seriesForm, brand: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary">
                <option value="">Brendni tanlang</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input required placeholder="Seriya nomi (iPhone 15, Galaxy S24…)" value={seriesForm.name}
                onChange={(e) => setSeriesForm({ ...seriesForm, name: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <input type="number" placeholder="Tartib" value={seriesForm.order}
                onChange={(e) => setSeriesForm({ ...seriesForm, order: Number(e.target.value) })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowSeriesForm(false)}
                  className="flex-1 rounded-xl border border-outline py-2 text-sm text-on-surface hover:bg-surface-container">
                  Bekor
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Model Form Modal ── */}
      {showModelForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="mb-4 font-semibold text-on-surface">Yangi model</h3>
            <form onSubmit={handleModel} className="space-y-3">
              <select required value={modelForm.series}
                onChange={(e) => setModelForm({ ...modelForm, series: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary">
                <option value="">Seriyani tanlang</option>
                {allSeries.map((s) => (
                  <option key={s.id} value={s.id}>{s.brandName} — {s.name}</option>
                ))}
              </select>
              <input placeholder="Variant nomi (Pro, Pro Max, Ultra, bo'sh=standart)" value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <input type="number" placeholder="Chiqarilgan yil (2023, 2024…)" value={modelForm.year}
                onChange={(e) => setModelForm({ ...modelForm, year: e.target.value })}
                className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="mp" checked={modelForm.is_popular}
                  onChange={(e) => setModelForm({ ...modelForm, is_popular: e.target.checked })} />
                <label htmlFor="mp" className="text-sm text-on-surface">Mashhur model (★)</label>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowModelForm(false)}
                  className="flex-1 rounded-xl border border-outline py-2 text-sm text-on-surface hover:bg-surface-container">
                  Bekor
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : 'Qo\'shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-tab 2: Product Compatibility Manager ──────────────────────────────────
const ProductCompatibilityManager = () => {
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState('');
  const [bulkSeriesId, setBulkSeriesId] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Product search
  const { data: productData } = useQuery({
    queryKey: ['admin-products-compat-search', productSearch],
    queryFn: () =>
      adminGetProducts({ q: productSearch, page_size: 12 }).then((r) => r.data),
    enabled: productSearch.length >= 1,
  });
  const productResults: AdminProduct[] = productData?.results ?? [];

  // Phone brands
  const { data: brands = [] } = useQuery<CPhoneBrand[]>({
    queryKey: ['admin-phone-brands'],
    queryFn: () => adminGetPhoneBrands().then((r) => r.data?.results ?? r.data),
  });
  const allSeries = brands.flatMap((b) => b.series.map((s) => ({ ...s, brandName: b.name })));

  // Current compatibility for selected product
  const { data: compatList = [], refetch: refetchCompat } = useQuery<CCompatEntry[]>({
    queryKey: ['admin-product-compat', selectedProduct?.id],
    queryFn: () =>
      adminGetProductCompatibility(selectedProduct!.id).then((r) => r.data),
    enabled: !!selectedProduct,
  });
  const existingIds = useMemo(() => new Set(compatList.map((c) => c.phone_model.id)), [compatList]);

  const resetSelection = () => { setCheckedIds(new Set()); setNotes(''); };

  const toggleModel = (id: number) =>
    setCheckedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handleAdd = async () => {
    if (!selectedProduct || checkedIds.size === 0) return;
    setSaving(true);
    try {
      const res = await adminAddProductCompatibility(selectedProduct.id, {
        phone_model_ids: [...checkedIds],
        notes,
      });
      toast.success(`${res.data.added} ta model qo'shildi`);
      resetSelection();
      refetchCompat();
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const handleBulkSeries = async () => {
    if (!selectedProduct || !bulkSeriesId) return;
    setSaving(true);
    try {
      const res = await adminBulkAddCompatibilitySeries(selectedProduct.id, {
        series_id: Number(bulkSeriesId),
        notes: bulkNotes,
      });
      toast.success(`${res.data.added} ta model qo'shildi (${res.data.series})`);
      setBulkSeriesId(''); setBulkNotes('');
      refetchCompat();
    } catch (err) { toast.error(extractErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const handleRemove = async (entry: CCompatEntry) => {
    if (!selectedProduct) return;
    try {
      await adminRemoveProductCompatibility(selectedProduct.id, {
        phone_model_ids: [entry.phone_model.id],
      });
      toast.success(`${entry.phone_model.full_name} o'chirildi`);
      refetchCompat();
    } catch (err) { toast.error(extractErrorMessage(err)); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Left: Product selector ── */}
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-on-surface">
            Mahsulot tanlang
          </label>
          <input
            placeholder="Mahsulot nomi bo'yicha qidiring…"
            value={productSearch}
            onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); resetSelection(); }}
            className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
          />
        </div>

        {/* Search results */}
        {!selectedProduct && productResults.length > 0 && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest divide-y divide-outline-variant/40 max-h-72 overflow-y-auto">
            {productResults.map((p) => (
              <button key={p.id} onClick={() => { setSelectedProduct(p); setProductSearch(p.name); resetSelection(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-container">
                {p.main_image && (
                  <img src={p.main_image} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-on-surface">{p.name}</p>
                  <p className="text-xs text-on-surface-variant">{p.price?.toLocaleString()} so'm</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected product info */}
        {selectedProduct && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              {selectedProduct.main_image && (
                <img src={selectedProduct.main_image} alt="" className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-medium text-on-surface">{selectedProduct.name}</p>
                <p className="text-sm text-on-surface-variant">ID: {selectedProduct.id}</p>
              </div>
              <button onClick={() => { setSelectedProduct(null); setProductSearch(''); resetSelection(); }}
                className="rounded-lg p-1 hover:bg-error/10 text-on-surface-variant hover:text-error">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Current compatible models */}
        {selectedProduct && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-on-surface">
                Hozirgi mosliklar
                <span className="ml-2 rounded-full bg-secondary/10 px-2 py-0.5 text-xs text-secondary">
                  {compatList.length}
                </span>
              </h4>
            </div>
            {compatList.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant py-6 text-center text-sm text-on-surface-variant">
                Hech qanday moslik belgilanmagan
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {compatList.map((c) => (
                  <span key={c.id}
                    className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-3 py-1 text-xs text-on-surface">
                    {c.phone_model.full_name}
                    {c.notes && <span className="text-on-surface-variant">· {c.notes}</span>}
                    <button onClick={() => handleRemove(c)}
                      className="ml-0.5 text-error hover:text-error/70" title="O'chirish">
                      <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bulk add by series */}
        {selectedProduct && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
            <h4 className="text-sm font-medium text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">bolt</span>
              Seriya bo'yicha barchasini qo'shish
            </h4>
            <select value={bulkSeriesId} onChange={(e) => setBulkSeriesId(e.target.value)}
              className="w-full rounded-xl border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary">
              <option value="">Seriyani tanlang…</option>
              {allSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.brandName} — {s.name} ({s.models.length} model)
                </option>
              ))}
            </select>
            <input placeholder="Izoh (ixtiyoriy): 'Asl ekran', 'A tipli'…" value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              className="w-full rounded-xl border border-outline bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
            <button onClick={handleBulkSeries} disabled={!bulkSeriesId || saving}
              className="w-full rounded-xl bg-secondary py-2.5 text-sm font-medium text-on-secondary hover:bg-secondary/90 disabled:opacity-40">
              {saving ? 'Qo\'shilmoqda…' : 'Seriyani barchasini qo\'shish'}
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Model checkboxes ── */}
      <div className="space-y-4">
        {!selectedProduct ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-outline-variant">
            <div className="text-center">
              <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant/40">
                phonelink
              </span>
              <p className="text-sm text-on-surface-variant">
                Mahsulot tanlang, keyin<br />mos telefonlarni belgilang
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-on-surface">
                Moslik qo'shish
                {checkedIds.size > 0 && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {checkedIds.size} tanlandi
                  </span>
                )}
              </h4>
              {checkedIds.size > 0 && (
                <button onClick={resetSelection} className="text-xs text-on-surface-variant hover:text-on-surface">
                  Bekor
                </button>
              )}
            </div>

            <PhoneTree
              brands={brands}
              checkable
              checkedIds={checkedIds}
              existingIds={existingIds}
              onToggleModel={toggleModel}
            />

            {checkedIds.size > 0 && (
              <div className="sticky bottom-0 rounded-2xl border border-outline-variant bg-surface p-4 shadow-lg space-y-3">
                <input placeholder="Izoh (ixtiyoriy): 'Faqat eSIM versiyasi'…" value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-outline bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary" />
                <button onClick={handleAdd} disabled={saving}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Saqlanmoqda…' : `${checkedIds.size} ta modelga moslik qo'shish`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Main CompatibilityTab ─────────────────────────────────────────────────────
export const CompatibilityTab = () => {
  const [subTab, setSubTab] = useState<CompatSubTab>('models');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-h3 text-h3 text-on-surface">Moslik Matritsasi</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Telefon modellarini boshqaring va mahsulotlarga mos keladigan qurilmalarni belgilang.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-container-low p-1 w-fit">
        {([
          { key: 'models',   label: 'Telefon modellari', icon: 'smartphone' },
          { key: 'products', label: 'Mahsulot mosliqlari', icon: 'link' },
        ] as { key: CompatSubTab; label: string; icon: string }[]).map(({ key, label, icon }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              subTab === key
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {subTab === 'models'   && <PhoneModelsManager />}
      {subTab === 'products' && <ProductCompatibilityManager />}
    </div>
  );
};
