// admin/CategoriesTab.tsx — Kategoriyalar (yaratish/tahrirlash). Ma'lumot proplar
// orqali keladi (AdminPanel qobig'idan).
// #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState, useRef, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminCreateCategory, adminUpdateCategory } from '../../api/endpoints';
import { extractErrorMessage } from './shared';
import type { AdminCategory } from './shared';

export const CategoriesTab = ({
  categories,
  onDelete,
}: {
  categories: AdminCategory[];
  onDelete: (id: number) => void;
}) => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', parent: '', is_popular: false });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setForm({ name: '', parent: '', is_popular: false });
    setImageFile(null);
    setEditingId(null);
  };

  // "Kategoriya qo'shish" tugmasi — yaratish rejimini ochadi/yopadi.
  const openCreate = () => {
    if (showForm && editingId === null) {
      setShowForm(false);
      return;
    }
    resetForm();
    setShowForm(true);
  };

  // Tahrirlash — formani to'ldirib, formaga scroll qiladi.
  const openEdit = (cat: AdminCategory) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      parent: cat.parent ? String(cat.parent) : '',
      is_popular: !!cat.is_popular,
    });
    setImageFile(null);
    setShowForm(true);
    setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60,
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('parent', form.parent || '');
      fd.append('is_active', 'true');
      fd.append('is_popular', String(form.is_popular));
      if (imageFile) fd.append('image', imageFile);
      if (editingId !== null) {
        await adminUpdateCategory(editingId, fd);
      } else {
        await adminCreateCategory(fd);
      }
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      setShowForm(false);
      resetForm();
    } catch (err) {
      alert(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };
  const flat = Array.isArray(categories) ? categories : [];
  return (
    <div>
      <div className='mb-4 flex justify-between'>
        <div>
          <h2 className='font-h3 text-h3 text-on-surface'>Kategoriyalar ({flat.length})</h2>
        </div>
        <button
          onClick={openCreate}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary hover:opacity-90'
        >
          <span className='material-symbols-outlined text-[18px]'>
            {showForm && editingId === null ? 'close' : 'add'}
          </span>
          {showForm && editingId === null ? 'Yopish' : "Kategoriya qo'shish"}
        </button>
      </div>
      {showForm && (
        <div
          ref={formRef}
          className='mb-6 scroll-mt-4 rounded-xl border-2 border-primary/50 bg-surface-container-lowest p-6 shadow-md ring-2 ring-primary/10'
        >
          <h3 className='mb-4 font-h3 text-h3 text-on-surface'>
            {editingId !== null ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'}
          </h3>
          <form onSubmit={handleSubmit} className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div>
              <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                Kategoriya nomi *
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
                placeholder='Elektronika'
              />
            </div>
            <div>
              <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                Asosiy katalog
              </label>
              <select
                value={form.parent}
                onChange={(e) => setForm({ ...form, parent: e.target.value })}
                className='w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 outline-none focus:border-primary'
              >
                <option value=''>-- Asosiy katalog --</option>
                {flat
                  .filter((c) => !c.parent && c.id !== editingId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className='mb-1 block text-label-md font-label-md text-on-surface-variant'>
                Kategoriya rasmi
              </label>
              <input
                type='file'
                accept='image/*'
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                className='w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-bright px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:text-on-primary'
              />
              {editingId !== null && !imageFile && (
                <p className='mt-1 text-[11px] text-on-surface-variant'>
                  Yangi rasm tanlamasangiz, avvalgi rasm saqlanib qoladi.
                </p>
              )}
            </div>
            <div className='flex items-center gap-6 pt-4'>
              <label className='flex cursor-pointer items-center gap-2'>
                <input
                  type='checkbox'
                  checked={form.is_popular}
                  onChange={(e) => setForm({ ...form, is_popular: e.target.checked })}
                  className='rounded text-primary'
                />
                <span className='text-body-sm text-on-surface'>
                  Home sahifada ommabop bo'lib ko'rinsin
                </span>
              </label>
            </div>
            <div className='md:col-span-2 flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => { setShowForm(false); resetForm(); }}
                className='rounded-lg border border-outline-variant px-4 py-2 font-label-md text-on-surface hover:bg-surface-container'
              >
                Bekor
              </button>
              <button
                type='submit'
                disabled={submitting}
                className='flex items-center gap-2 rounded-lg bg-primary px-6 py-2 font-label-md text-on-primary hover:opacity-90 disabled:opacity-60'
              >
                {submitting && (
                  <span className='material-symbols-outlined animate-spin text-[16px]'>
                    progress_activity
                  </span>
                )}
                {editingId !== null ? "O'zgarishlarni saqlash" : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}
      {flat.length === 0 ? (
        <div className='rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center'>
          <span className='material-symbols-outlined mb-3 block text-5xl text-outline'>
            category
          </span>
          <p className='font-h3 text-on-surface-variant'>Kategoriyalar yo'q</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm'>
          {/* ── MOBIL KARTALAR (telefon) ── */}
          <div className='divide-y divide-outline-variant md:hidden'>
            {flat.map((cat, i) => (
              <div key={cat.id} className='flex items-center gap-3 p-3'>
                <span className='w-5 shrink-0 text-xs text-on-surface-variant'>{i + 1}</span>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    {cat.parent && (
                      <span className='inline-block h-2.5 w-2.5 shrink-0 border-b-2 border-l-2 border-outline' />
                    )}
                    <span className='truncate text-sm font-semibold text-on-surface'>{cat.name}</span>
                  </div>
                  <div className='mt-1 flex items-center gap-2'>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.parent ? 'bg-surface-container text-on-surface-variant' : 'bg-primary-container text-on-primary-container'}`}>
                      {cat.parent ? 'Kategoriya' : 'Katalog'}
                    </span>
                    <span className='truncate font-mono text-[11px] text-outline'>{cat.slug}</span>
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-1'>
                  <button onClick={() => openEdit(cat)} className='rounded p-1.5 text-primary hover:bg-primary-container/20' title='Tahrirlash'>
                    <span className='material-symbols-outlined text-[20px]'>edit</span>
                  </button>
                  <button onClick={() => onDelete(cat.id)} className='rounded p-1.5 text-error hover:bg-error-container/20' title="O'chirish">
                    <span className='material-symbols-outlined text-[20px]'>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* ── DESKTOP JADVAL ── */}
          <table className='hidden w-full text-left md:table'>
            <thead className='border-b border-outline-variant bg-surface-container'>
              <tr>
                {['#', 'Nomi', 'Turi', 'Slug', 'Amal'].map((h) => (
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
              {flat.map((cat, i) => (
                <tr key={cat.id} className='hover:bg-surface-container-low/50'>
                  <td className='px-4 py-3 text-body-sm text-on-surface-variant'>{i + 1}</td>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      {cat.parent ? (
                        <span className='ml-2 inline-block h-3 w-3 border-b-2 border-l-2 border-outline' />
                      ) : null}
                      <span className='font-body-md text-on-surface'>{cat.name}</span>
                    </div>
                  </td>
                  <td className='px-4 py-3'>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cat.parent ? 'bg-surface-container text-on-surface-variant' : 'bg-primary-container text-on-primary-container'}`}
                    >
                      {cat.parent ? 'Kategoriya' : 'Katalog'}
                    </span>
                  </td>
                  <td className='px-4 py-3 font-mono text-body-sm text-outline'>{cat.slug}</td>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-1'>
                      <button
                        onClick={() => openEdit(cat)}
                        className='rounded p-1 text-primary hover:bg-primary-container/20'
                        title='Tahrirlash'
                      >
                        <span className='material-symbols-outlined text-[20px]'>edit</span>
                      </button>
                      <button
                        onClick={() => onDelete(cat.id)}
                        className='rounded p-1 text-error hover:bg-error-container/20'
                        title="O'chirish"
                      >
                        <span className='material-symbols-outlined text-[20px]'>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
