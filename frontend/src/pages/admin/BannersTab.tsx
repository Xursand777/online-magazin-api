// admin/BannersTab.tsx — Bosh sahifa bannerlari ro'yxati + BannerEditor (ichki).
// Ma'lumot proplar orqali keladi (AdminPanel qobig'idan).
// #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCreateBanner, adminUpdateBanner } from '../../api/endpoints';
import {
  formatMoney, formatPriceInput, stripNumberFormatting, mapBannerToForm,
  dateTimeLocalToIso, extractErrorMessage, StatusBadge, MiniBadge,
} from './shared';
import type { AdminBanner, AdminProduct, BannerFormState, BannerEditorState } from './shared';
import { ProductSelect } from './ProductSelect';

export const BannersTab = ({
  banners,
  products,
  loading,
  onDelete,
}: {
  banners: AdminBanner[];
  products: AdminProduct[];
  loading: boolean;
  onDelete: (id: number) => void;
}) => {
  const [editorState, setEditorState] = useState<BannerEditorState | null>(null);
  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Bannerlar ({banners.length})</h2>
          <p className='mt-1 text-body-sm text-on-surface-variant'>
            Home sahifadagi reklama bannerlari shu yerdan boshqariladi.
          </p>
        </div>
        <button
          onClick={() => setEditorState({ mode: 'create' })}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
        >
          <span className='material-symbols-outlined text-[18px]'>add</span>Banner qo'shish
        </button>
      </div>
      {editorState && (
        <BannerEditor
          banner={editorState.banner}
          mode={editorState.mode}
          onClose={() => setEditorState(null)}
          products={products}
        />
      )}
      {loading ? (
        <div className='py-12 text-center text-on-surface-variant'>
          <span className='material-symbols-outlined mb-2 block animate-spin text-4xl'>
            progress_activity
          </span>
          Yuklanmoqda...
        </div>
      ) : banners.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            view_carousel
          </span>
          <p className='font-h3 text-on-surface-variant'>Bannerlar yo'q</p>
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          {banners.map((banner) => (
            <article
              key={banner.id}
              className='overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm'
            >
              <div
                className='relative min-h-[180px] overflow-hidden p-5 text-white'
                style={{
                  backgroundColor: banner.background_color || '#111827',
                  backgroundImage: banner.background_image_url
                    ? `linear-gradient(90deg,${banner.background_color || '#111827'}e6 0%,${banner.background_color || '#111827'}bf 46%,${banner.accent_color || '#007a4d'}8c 100%),url(${banner.background_image_url})`
                    : `linear-gradient(105deg,${banner.background_color || '#111827'} 0%,${banner.background_color || '#111827'} 52%,${banner.accent_color || '#007a4d'} 100%)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div className='relative z-10 max-w-[70%]'>
                  <span className='rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm'>
                    Reklama
                  </span>
                  <h3 className='mt-4 text-2xl font-black leading-tight'>{banner.title}</h3>
                  {banner.subtitle && (
                    <p className='mt-2 line-clamp-2 text-sm text-white/80'>{banner.subtitle}</p>
                  )}
                  <div className='mt-4 flex flex-wrap items-end gap-2'>
                    {banner.original_price && banner.discount_price && (
                      <span className='text-sm text-white/60 line-through'>
                        {formatMoney(banner.original_price)} so'm
                      </span>
                    )}
                    {(banner.discount_price || banner.original_price) && (
                      <span className='text-xl font-black'>
                        {formatMoney(banner.discount_price || banner.original_price)} so'm
                      </span>
                    )}
                  </div>
                </div>
                {banner.product_image_url && (
                  <img
                    src={banner.product_image_url}
                    alt={banner.title}
                    className='absolute bottom-0 right-3 h-[88%] max-w-[46%] object-contain drop-shadow-[0_22px_34px_rgba(0,0,0,0.32)]'
                  />
                )}
              </div>
              <div className='space-y-4 p-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge
                    active={banner.is_active}
                    activeLabel='Faol'
                    inactiveLabel='Ochiq emas'
                  />
                  <MiniBadge tone='primary'>Tartib: {String(banner.order)}</MiniBadge>
                  {banner.product_name && (
                    <MiniBadge tone='secondary'>{banner.product_name}</MiniBadge>
                  )}
                </div>
                <div className='flex justify-end gap-2 border-t border-outline-variant pt-3'>
                  <button
                    onClick={() => setEditorState({ mode: 'edit', banner })}
                    className='rounded-lg p-2 text-primary hover:bg-primary-container/20'
                  >
                    <span className='material-symbols-outlined text-[20px]'>edit</span>
                  </button>
                  <button
                    onClick={() => onDelete(banner.id)}
                    className='rounded-lg p-2 text-error hover:bg-error-container/20'
                  >
                    <span className='material-symbols-outlined text-[20px]'>delete</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

const BannerEditor = ({
  mode,
  banner,
  products,
  onClose,
}: {
  mode: 'create' | 'edit';
  banner?: AdminBanner;
  products: AdminProduct[];
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const [form, setForm] = useState<BannerFormState>(() => mapBannerToForm(banner));
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [removeProductImage, setRemoveProductImage] = useState(false);
  const [removeBackgroundImage, setRemoveBackgroundImage] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setForm(mapBannerToForm(banner));
    setProductImageFile(null);
    setBackgroundImageFile(null);
    setRemoveProductImage(false);
    setRemoveBackgroundImage(false);
    setFormError('');
  }, [banner, mode]);

  const saveMutation = useMutation({
    mutationFn: (payload: FormData) =>
      mode === 'edit' && banner
        ? adminUpdateBanner(banner.id, payload)
        : adminCreateBanner(payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-banners'] }),
        qc.invalidateQueries({ queryKey: ['mainPage'] }),
      ]);
      onClose();
    },
    onError: (error) => setFormError(extractErrorMessage(error)),
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    const payload = new FormData();
    payload.append('title', form.title.trim());
    payload.append('subtitle', form.subtitle.trim());
    payload.append('product', form.product);
    payload.append('original_price', stripNumberFormatting(form.original_price.trim()));
    payload.append('discount_price', stripNumberFormatting(form.discount_price.trim()));
    payload.append('background_color', form.background_color || '#111827');
    payload.append('accent_color', form.accent_color || '#007a4d');
    payload.append('button_label', form.button_label.trim() || "Mahsulotni ko'rish");
    payload.append('button_url', form.button_url.trim());
    payload.append('order', form.order || '0');
    payload.append('is_active', String(form.is_active));
    payload.append('start_date', dateTimeLocalToIso(form.start_date));
    payload.append('end_date', dateTimeLocalToIso(form.end_date));
    payload.append('remove_product_image', String(removeProductImage));
    payload.append('remove_background_image', String(removeBackgroundImage));
    if (productImageFile) payload.append('product_image', productImageFile);
    if (backgroundImageFile) payload.append('background_image', backgroundImageFile);
    await saveMutation.mutateAsync(payload);
  };

  return (
    <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
      <div className='mb-6 flex flex-col gap-2 border-b border-outline-variant pb-4 md:flex-row md:items-center md:justify-between'>
        <h3 className='font-h3 text-h3 text-on-surface'>
          {mode === 'edit' ? 'Bannerni tahrirlash' : 'Yangi banner'}
        </h3>
      </div>
      {formError && (
        <div className='mb-4 flex gap-2 rounded-lg bg-error-container p-3 text-body-sm text-on-error-container'>
          <span className='material-symbols-outlined text-[16px]'>error</span>
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} className='space-y-6'>
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <div className='xl:col-span-5'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tovar nomi *
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='Tovar nomini kiriting'
            />
          </div>
          <div className='xl:col-span-4'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Bog'langan tovar
            </label>
            <ProductSelect
              products={products}
              value={form.product}
              onChange={(v) => setForm((c) => ({ ...c, product: v }))}
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tartib
            </label>
            <input
              min='0'
              type='number'
              value={form.order}
              onChange={(e) => setForm((c) => ({ ...c, order: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            />
          </div>
          <div className='xl:col-span-12'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Kichik sharh
            </label>
            <textarea
              rows={3}
              value={form.subtitle}
              onChange={(e) => setForm((c) => ({ ...c, subtitle: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='Reklama ostida chiqadigan qisqa sharh'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Asl narx
            </label>
            <input
              type='text'
              inputMode='decimal'
              value={form.original_price}
              onChange={(e) =>
                setForm((c) => ({ ...c, original_price: formatPriceInput(e.target.value) }))
              }
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='3 200 000'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Chegirma narxi
            </label>
            <input
              type='text'
              inputMode='decimal'
              value={form.discount_price}
              onChange={(e) =>
                setForm((c) => ({ ...c, discount_price: formatPriceInput(e.target.value) }))
              }
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              placeholder='3 099 994'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Orqa fon rangi
            </label>
            <div className='flex overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
              <input
                type='color'
                value={form.background_color}
                onChange={(e) => setForm((c) => ({ ...c, background_color: e.target.value }))}
                className='h-10 w-12 cursor-pointer border-0 bg-transparent p-1'
              />
              <input
                value={form.background_color}
                onChange={(e) => setForm((c) => ({ ...c, background_color: e.target.value }))}
                className='min-w-0 flex-1 bg-transparent px-3 outline-none'
              />
            </div>
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Accent rangi
            </label>
            <div className='flex overflow-hidden rounded-lg border border-outline-variant bg-surface-bright'>
              <input
                type='color'
                value={form.accent_color}
                onChange={(e) => setForm((c) => ({ ...c, accent_color: e.target.value }))}
                className='h-10 w-12 cursor-pointer border-0 bg-transparent p-1'
              />
              <input
                value={form.accent_color}
                onChange={(e) => setForm((c) => ({ ...c, accent_color: e.target.value }))}
                className='min-w-0 flex-1 bg-transparent px-3 outline-none'
              />
            </div>
          </div>
          <div className='xl:col-span-6'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tovar rasmi
            </label>
            <input
              type='file'
              accept='image/*'
              onChange={(e) => {
                setProductImageFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveProductImage(false);
              }}
              className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
            />
          </div>
          <div className='xl:col-span-6'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Orqa fon rasmi
            </label>
            <input
              type='file'
              accept='image/*'
              onChange={(e) => {
                setBackgroundImageFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveBackgroundImage(false);
              }}
              className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Boshlanish vaqti
            </label>
            <input
              type='datetime-local'
              value={form.start_date}
              onChange={(e) => setForm((c) => ({ ...c, start_date: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            />
          </div>
          <div className='xl:col-span-3'>
            <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
              Tugash vaqti
            </label>
            <input
              type='datetime-local'
              value={form.end_date}
              onChange={(e) => setForm((c) => ({ ...c, end_date: e.target.value }))}
              className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
            />
          </div>
          <div className='flex items-center xl:col-span-6'>
            <label className='flex w-full items-center gap-2 rounded-lg border border-outline-variant bg-surface-bright px-3 py-3'>
              <input
                type='checkbox'
                checked={form.is_active}
                onChange={(e) => setForm((c) => ({ ...c, is_active: e.target.checked }))}
                className='rounded text-primary'
              />
              <span className='text-body-sm text-on-surface'>
                Faol banner sifatida home sahifada ko'rsatish
              </span>
            </label>
          </div>
        </div>
        <div className='flex flex-col gap-3 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='text-body-sm text-on-surface-variant'>
            Banner saqlangach home sahifadagi reklama slideri avtomatik yangilanadi.
          </div>
          <div className='flex gap-3'>
            <button
              type='button'
              onClick={onClose}
              className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
            >
              Bekor
            </button>
            <button
              type='submit'
              disabled={saveMutation.isPending}
              className='flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary hover:opacity-90 disabled:opacity-60'
            >
              {saveMutation.isPending && (
                <span className='material-symbols-outlined animate-spin text-[16px]'>
                  progress_activity
                </span>
              )}
              {mode === 'edit' ? "O'zgarishlarni saqlash" : 'Saqlash'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
