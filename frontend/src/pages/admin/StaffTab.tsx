// admin/StaffTab.tsx — Xodimlar boshqaruvi (rol berish, ishdan bo'shatish) —
// faqat Super Admin. #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminGetStaff, adminAssignRole, adminFireStaff } from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { ROLE_LABELS, ROLE_COLORS, type StaffRole } from '../../store/authStore';

interface StaffMember {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  role: StaffRole;
  role_display: string;
  is_active: boolean;
  date_joined: string;
}

const ROLES_LIST: { value: StaffRole | ''; label: string }[] = [
  { value: 'admin',   label: 'Admin' },
  { value: 'seller',  label: 'Sotuvchi' },
  { value: 'courier', label: 'Kuryer' },
  { value: '',        label: '— Rolni olib tashlash —' },
];

export const StaffTab = () => {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'seller' | 'courier' | ''>('admin');
  const [fireTarget, setFireTarget] = useState<StaffMember | null>(null);

  const { data: staffList = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ['admin-staff'],
    queryFn: () => adminGetStaff().then(r => r.data.results ?? r.data),
  });

  const assignMut = useMutation({
    mutationFn: (data: { phone: string; role: string }) => adminAssignRole(data),
    onSuccess: (res) => {
      const d = res.data;
      const label = d.new_role ? (ROLE_LABELS[d.new_role] || d.new_role) : 'Rol olib tashlandi';
      toast.success(`${d.phone} → ${label}`);
      setPhone('');
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
    },
  });

  const fireMut = useMutation({
    mutationFn: (id: number) => adminFireStaff(id),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Xodim ishdan bo\'shatildi');
      setFireTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
      setFireTarget(null);
    },
  });

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { toast.error("Telefon raqam kiriting"); return; }
    assignMut.mutate({ phone: phone.trim(), role: selectedRole });
  };

  return (
    <div className='flex flex-col gap-xl'>
      <div>
        <h2 className='text-h2 font-h2 text-on-surface'>Xodimlar boshqaruvi</h2>
        <p className='text-body-sm text-on-surface-variant mt-1'>
          Foydalanuvchilarga rol bering yoki rolni olib tashlang.
        </p>
      </div>

      {/* Rol berish formasi */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant p-6'>
        <h3 className='text-label-lg font-semibold text-on-surface mb-4'>Rol berish / o'zgartirish</h3>
        <form onSubmit={handleAssign} className='flex flex-col sm:flex-row gap-3'>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder='+998901234567'
            className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none'
          />
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value as 'admin' | 'seller' | 'courier' | '')}
            className='rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none'
          >
            {ROLES_LIST.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            type='submit'
            disabled={assignMut.isPending}
            className='rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50'
          >
            {assignMut.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </form>
      </div>

      {/* Xodimlar ro'yxati */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden'>
        <div className='px-6 py-4 border-b border-outline-variant flex items-center justify-between'>
          <h3 className='text-label-lg font-semibold text-on-surface'>
            Joriy xodimlar
          </h3>
          <span className='text-body-sm text-on-surface-variant'>{staffList.length} ta xodim</span>
        </div>

        {isLoading ? (
          <div className='p-6 flex flex-col gap-3'>
            {[1,2,3].map(i => <div key={i} className='h-14 bg-surface-container rounded-xl animate-pulse' />)}
          </div>
        ) : staffList.length === 0 ? (
          <div className='p-10 text-center text-on-surface-variant text-body-sm'>
            Hali xodim yo'q. Yuqoridagi forma orqali rol bering.
          </div>
        ) : (
          <div className='divide-y divide-outline-variant'>
            {staffList.map(member => (
              <div key={member.id} className='flex flex-col gap-2 px-6 py-4 hover:bg-surface-container/50 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex min-w-0 items-center gap-3'>
                  <div className='w-10 h-10 shrink-0 rounded-full bg-surface-container flex items-center justify-center'>
                    <span className='material-symbols-outlined text-[20px] text-on-surface-variant'>person</span>
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold text-on-surface'>
                      {member.first_name || member.last_name
                        ? `${member.first_name} ${member.last_name}`.trim()
                        : member.phone}
                    </p>
                    <p className='text-xs text-on-surface-variant'>{member.phone}</p>
                  </div>
                </div>
                <div className='flex items-center gap-3'>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ROLE_COLORS[member.role] || 'bg-surface-container text-on-surface-variant'}`}>
                    {ROLE_LABELS[member.role] || member.role_display}
                  </span>
                  <button
                    onClick={() => setFireTarget(member)}
                    className='flex items-center gap-1 rounded-lg border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/20 transition-colors'
                    title="Ishdan bo'shatish"
                  >
                    <span className='material-symbols-outlined text-[14px]'>person_off</span>
                    Bo'shatish
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ishdan bo'shatish confirmation dialog */}
      {fireTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
          <div className='bg-surface rounded-3xl border border-outline-variant p-6 max-w-sm w-full shadow-2xl'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='w-12 h-12 rounded-full bg-error/15 flex items-center justify-center flex-shrink-0'>
                <span className='material-symbols-outlined text-error text-[24px]'>warning</span>
              </div>
              <div>
                <h3 className='text-label-lg font-bold text-on-surface'>Ishdan bo'shatish</h3>
                <p className='text-xs text-on-surface-variant mt-0.5'>Bu amalni ortga qaytarib bo'lmaydi</p>
              </div>
            </div>

            <p className='text-body-md text-on-surface mb-1'>
              <span className='font-semibold'>{fireTarget.phone}</span> ni ishdan bo'shatmoqchimisiz?
            </p>
            <p className='text-body-sm text-on-surface-variant mb-6'>
              Xodim <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${ROLE_COLORS[fireTarget.role]}`}>
                {ROLE_LABELS[fireTarget.role]}
              </span> rolidan mahrum bo'ladi va barcha aktiv tokenlari darhol bekor qilinadi.
            </p>

            <div className='flex gap-3'>
              <button
                onClick={() => setFireTarget(null)}
                disabled={fireMut.isPending}
                className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50'
              >
                Bekor qilish
              </button>
              <button
                onClick={() => fireMut.mutate(fireTarget.id)}
                disabled={fireMut.isPending}
                className='flex-1 rounded-xl bg-error px-4 py-2.5 text-sm font-semibold text-on-error hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2'
              >
                {fireMut.isPending
                  ? <><span className='w-4 h-4 border-2 border-on-error/30 border-t-on-error rounded-full animate-spin' /> Bo'shatilmoqda...</>
                  : <><span className='material-symbols-outlined text-[16px]'>person_off</span> Ha, bo'shatish</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rol izohlari */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        {/* Super Admin — tayinlab bo'lmaydi, ma'lumot sifatida ko'rsatiladi */}
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['super_admin']} opacity-60`}>
          <div className='flex items-center gap-2 mb-1'>
            <p className='text-sm font-bold'>Super Admin</p>
            <span className='text-[10px] bg-error/20 text-error rounded-full px-2 py-0.5'>Tayinlab bo'lmaydi</span>
          </div>
          <p className='text-xs opacity-70'>Barcha huquqlar. Tizim yaratuvchisi. Faqat 1 dona bo'ladi.</p>
        </div>
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['admin'] || ''}`}>
          <p className='text-sm font-bold mb-1'>Admin</p>
          <p className='text-xs opacity-70'>Mahsulot, kategoriya, buyurtma, kassa, hisobot, banner, moslik.</p>
        </div>
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['seller'] || ''}`}>
          <p className='text-sm font-bold mb-1'>Sotuvchi</p>
          <p className='text-xs opacity-70'>POS savdo, buyurtma tasdiqlash, ombor ko'rish.</p>
        </div>
        <div className={`rounded-xl p-4 border ${ROLE_COLORS['courier'] || ''}`}>
          <p className='text-sm font-bold mb-1'>Kuryer</p>
          <p className='text-xs opacity-70'>Buyurtmalarni ko'rish va yetkazib berildi deb belgilash.</p>
        </div>
      </div>
    </div>
  );
};
