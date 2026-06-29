// admin/MastersTab.tsx — Ustalar (master) boshqaruvi va master chegirma foizi.
// #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminGetMasters, adminGetMasterDiscount, adminSetMasterDiscount,
  adminAssignMaster, adminRemoveMaster,
} from '../../api/endpoints';
import { toast } from '../../utils/toast';

interface MasterUser {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_master: boolean;
  is_active: boolean;
  date_joined: string;
}

export const MastersTab = () => {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [removeTarget, setRemoveTarget] = useState<MasterUser | null>(null);
  const [discountInput, setDiscountInput] = useState('');

  const { data: masterList = [], isLoading } = useQuery<MasterUser[]>({
    queryKey: ['admin-masters'],
    queryFn: () => adminGetMasters().then(r => r.data.results ?? r.data),
  });

  const { data: discountPct = 5 } = useQuery<number>({
    queryKey: ['admin-master-discount'],
    queryFn: () => adminGetMasterDiscount().then(r => r.data.percent),
  });

  // Saqlangan foiz o'zgarsa, input maydonini sinxronlaymiz (faqat foydalanuvchi
  // hali tahrir qilmagan bo'lsa).
  useEffect(() => {
    setDiscountInput(String(discountPct));
  }, [discountPct]);

  const assignMut = useMutation({
    mutationFn: (data: { phone: string }) => adminAssignMaster(data),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Usta qo\'shildi');
      setPhone('');
      qc.invalidateQueries({ queryKey: ['admin-masters'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => adminRemoveMaster(id),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Usta olib tashlandi');
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-masters'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
      setRemoveTarget(null);
    },
  });

  const discountMut = useMutation({
    mutationFn: (percent: number) => adminSetMasterDiscount(percent),
    onSuccess: (res) => {
      toast.success(res.data.detail || 'Optom ustiga ustama foizi saqlandi');
      qc.invalidateQueries({ queryKey: ['admin-master-discount'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Xato yuz berdi');
    },
  });

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) { toast.error('Telefon raqam kiriting'); return; }
    assignMut.mutate({ phone: phone.trim() });
  };

  const handleSaveDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    const pct = Number(discountInput);
    if (Number.isNaN(pct) || pct < 0 || pct > 90) {
      toast.error("Foiz 0 va 90 oralig'ida bo'lishi kerak");
      return;
    }
    discountMut.mutate(pct);
  };

  const dirty = String(discountPct) !== discountInput.trim();

  // Foizni chiroyli ko'rsatish: 4 → "4", 3.75 → "3.75", 2.5 → "2.5"
  const fmtPct = (n: number) => String(Math.round(n * 100) / 100);

  return (
    <div className='flex flex-col gap-xl'>
      <div>
        <h2 className='text-h2 font-h2 text-on-surface'>Ustalar boshqaruvi</h2>
        <p className='text-body-sm text-on-surface-variant mt-1'>
          Ustalar mahsulotni <span className='font-semibold text-primary'>optom narxiga {discountPct}% ustama</span> bilan
          oladi (eng faol bo'lganda). Faollik pasaysa narx asta oddiy sotuv narxiga yaqinlashadi.
          Optom narx kiritilmagan mahsulotda usta oddiy narxni ko'radi.
        </p>
      </div>

      {/* Optom ustiga ustama foizini sozlash */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant p-6'>
        <div className='flex items-center gap-2 mb-1'>
          <span className='material-symbols-outlined text-primary text-[20px]'>percent</span>
          <h3 className='text-label-lg font-semibold text-on-surface'>Optom ustiga ustama (%)</h3>
        </div>
        <p className='text-body-sm text-on-surface-variant mb-4'>
          Usta to'liq faol bo'lganda <span className='font-semibold text-on-surface'>optom narx × (1 + ustama/100)</span> to'laydi.
          Barcha ustalarga qo'llaniladi; o'zgartirilsa darhol kuchga kiradi.
        </p>
        <form onSubmit={handleSaveDiscount} className='flex flex-col sm:flex-row gap-3 sm:items-center'>
          <div className='relative flex-1 max-w-[200px]'>
            <input
              type='number'
              min={0}
              max={90}
              step='0.1'
              value={discountInput}
              onChange={e => setDiscountInput(e.target.value)}
              className='w-full rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 pr-10 text-sm text-on-surface focus:border-primary focus:outline-none'
            />
            <span className='absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm font-semibold'>%</span>
          </div>
          <button
            type='submit'
            disabled={discountMut.isPending || !dirty}
            className='rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 flex items-center gap-2 w-fit'
          >
            {discountMut.isPending
              ? <><span className='w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin' /> Saqlanmoqda...</>
              : <><span className='material-symbols-outlined text-[16px]'>save</span> Saqlash</>
            }
          </button>
        </form>
      </div>

      {/* Usta qo'shish */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant p-6'>
        <h3 className='text-label-lg font-semibold text-on-surface mb-4'>Usta qo'shish</h3>
        <form onSubmit={handleAssign} className='flex flex-col sm:flex-row gap-3'>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder='+998901234567'
            className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none'
          />
          <button
            type='submit'
            disabled={assignMut.isPending}
            className='rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 flex items-center gap-2'
          >
            {assignMut.isPending
              ? <><span className='w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin' /> Qo'shilmoqda...</>
              : <><span className='material-symbols-outlined text-[16px]'>construction</span> Usta qilish</>
            }
          </button>
        </form>
      </div>

      {/* Faollikka asoslangan chegirma izohi */}
      <div className='bg-primary/8 rounded-2xl border border-primary/20 p-5'>
        <div className='flex items-start gap-4 mb-4'>
          <div className='w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0'>
            <span className='material-symbols-outlined text-primary text-[20px]'>insights</span>
          </div>
          <div>
            <p className='text-sm font-semibold text-on-surface mb-1'>Faollikka asoslangan optom imtiyozi (4 pog'onali)</p>
            <p className='text-xs text-on-surface-variant leading-relaxed'>
              To'liq faol usta optom narxiga <span className='font-medium text-on-surface'>{fmtPct(discountPct)}% ustama</span> bilan
              oladi (eng arzon). Faollik pasaysa narx <span className='font-medium text-on-surface'>oddiy sotuv narxi</span> tomon
              ko'tariladi (har daraja imtiyozning level/4 ulushini beradi). Quyidagi jadval
              imtiyoz <span className='font-medium text-on-surface'>kuchini</span> ko'rsatadi.
            </p>
          </div>
        </div>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs'>
          {[
            ['Har kuni (0–1 kun)', `optom + ${fmtPct(discountPct)}%`, '100%'],
            ['2 kunda bir', "optom↔oddiy oralig'i", '¾'],
            ['3–4 kunda bir', "optom↔oddiy oralig'i", '½'],
            ['5–6 kun sust', "optom↔oddiy oralig'i", '¼'],
            ['Haftada bir / 10 kun', 'oddiy narx', '0'],
            ['Yangi usta', `optom + ${fmtPct(discountPct)}%`, 'xush kelibsiz'],
          ].map(([label, val, ratio]) => (
            <div key={label} className='flex items-center justify-between gap-2 bg-surface-container-lowest/60 rounded-lg px-3 py-2 border border-outline-variant/40'>
              <span className='text-on-surface-variant'>{label}</span>
              <span className='flex items-center gap-1.5'>
                <span className='text-[10px] text-on-surface-variant/70'>{ratio}</span>
                <span className='font-semibold text-on-surface'>{val}</span>
              </span>
            </div>
          ))}
        </div>
        {/* Adolatli tiklanish + yumshoq qo'nish */}
        <div className='mt-3 flex items-start gap-2 text-xs text-on-surface-variant bg-surface-container-lowest/60 rounded-lg px-3 py-2.5 border border-outline-variant/40'>
          <span className='material-symbols-outlined text-[16px] text-primary mt-px'>trending_up</span>
          <p className='leading-relaxed'>
            <span className='font-medium text-on-surface'>Adolatli tiklanish:</span> sustlikda imtiyoz
            tez pasayadi (narx oddiy narxga yaqinlashadi), lekin <span className='font-medium text-on-surface'>bir zumda qaytmaydi</span> —
            har kungi xarid darajani bittadan ko'taradi.
            <br />
            <span className='font-medium text-on-surface'>Yumshoq qo'nish:</span> ilgari sodiq bo'lgan usta
            hafta/10 kun tanaffusdan keyin <span className='font-medium text-on-surface'>0 ga emas, avvalgi darajasining yarmidan</span> qaytadi
            (≤14 kun → ½, 15–28 kun → ¼, keyin noldan). Tasodifiy (¾ darajaga chiqmagan) xaridor esa
            oddiy narxdan tiklanadi.
            <br />
            <span className='font-medium text-on-surface'>Eslatma:</span> imtiyoz faqat <span className='font-medium text-on-surface'>optom narx kiritilgan</span> mahsulotlarga
            tegishli — aks holda usta oddiy narxni ko'radi.
          </p>
        </div>
      </div>

      {/* Ustalar ro'yxati */}
      <div className='bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden'>
        <div className='px-6 py-4 border-b border-outline-variant flex items-center justify-between'>
          <h3 className='text-label-lg font-semibold text-on-surface'>Joriy ustalar</h3>
          <span className='text-body-sm text-on-surface-variant'>{masterList.length} ta usta</span>
        </div>

        {isLoading ? (
          <div className='p-6 flex flex-col gap-3'>
            {[1, 2, 3].map(i => <div key={i} className='h-14 bg-surface-container rounded-xl animate-pulse' />)}
          </div>
        ) : masterList.length === 0 ? (
          <div className='p-10 text-center text-on-surface-variant text-body-sm'>
            Hali usta yo'q. Yuqoridagi forma orqali qo'shing.
          </div>
        ) : (
          <div className='divide-y divide-outline-variant'>
            {masterList.map(master => (
              <div key={master.id} className='flex flex-col gap-2 px-6 py-4 hover:bg-surface-container/50 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex min-w-0 items-center gap-3'>
                  <div className='w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center'>
                    <span className='material-symbols-outlined text-[20px] text-primary'>construction</span>
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold text-on-surface'>
                      {master.full_name !== master.phone ? master.full_name : master.phone}
                    </p>
                    <p className='text-xs text-on-surface-variant'>{master.phone}</p>
                  </div>
                </div>
                <div className='flex items-center gap-3'>
                  <span className='rounded-full px-3 py-1 text-xs font-semibold bg-primary/15 text-primary border border-primary/20'>
                    {discountPct}% chegirma
                  </span>
                  <button
                    onClick={() => setRemoveTarget(master)}
                    className='flex items-center gap-1 rounded-lg border border-error/30 bg-error/10 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/20 transition-colors'
                    title="Ustadan olib tashlash"
                  >
                    <span className='material-symbols-outlined text-[14px]'>person_off</span>
                    Olib tashlash
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Olib tashlash confirmation dialog */}
      {removeTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'>
          <div className='bg-surface rounded-3xl border border-outline-variant p-6 max-w-sm w-full shadow-2xl'>
            <div className='flex items-center gap-3 mb-4'>
              <div className='w-12 h-12 rounded-full bg-error/15 flex items-center justify-center flex-shrink-0'>
                <span className='material-symbols-outlined text-error text-[24px]'>warning</span>
              </div>
              <div>
                <h3 className='text-label-lg font-bold text-on-surface'>Ustadan olib tashlash</h3>
                <p className='text-xs text-on-surface-variant mt-0.5'>Chegirma huquqi bekor qilinadi</p>
              </div>
            </div>
            <p className='text-body-md text-on-surface mb-6'>
              <span className='font-semibold'>{removeTarget.phone}</span> ni usta ro'yxatidan olib tashlaysizmi?
              Keyingi xaridlarida <span className='font-semibold'>{discountPct}%</span> chegirma qo'llanilmaydi.
            </p>
            <div className='flex gap-3'>
              <button
                onClick={() => setRemoveTarget(null)}
                disabled={removeMut.isPending}
                className='flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50'
              >
                Bekor qilish
              </button>
              <button
                onClick={() => removeMut.mutate(removeTarget.id)}
                disabled={removeMut.isPending}
                className='flex-1 rounded-xl bg-error px-4 py-2.5 text-sm font-semibold text-on-error hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2'
              >
                {removeMut.isPending
                  ? <><span className='w-4 h-4 border-2 border-on-error/30 border-t-on-error rounded-full animate-spin' /> Olib tashlanmoqda...</>
                  : <><span className='material-symbols-outlined text-[16px]'>person_off</span> Ha, olib tashlash</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
