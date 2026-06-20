// admin/SozlamalarTab.tsx — Sozlamalar (USD kurs, do'kon ma'lumotlari/chek).
// #N3: AdminPanel'dan AYNAN ko'chirildi (mantiq o'zgarmas).
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { adminGetExchangeRate, adminUpdateExchangeRate, adminUpdateShopInfo } from '../../api/endpoints';
import { toast } from '../../utils/toast';
import { loadShopInfo, useShopInfo, updateShopInfoCache } from '../../utils/shopInfoCache';

export const SozlamalarTab = () => {
  const qc = useQueryClient();

  // Dollar kursi
  const [editingRate, setEditingRate] = useState(false);
  const [newRateValue, setNewRateValue] = useState('');
  const { data: rateData, refetch: refetchRate } = useQuery({
    queryKey: ['admin-exchange-rate'],
    queryFn: () => adminGetExchangeRate().then((r) => r.data),
  });
  const updateRateMutation = useMutation({
    mutationFn: (val: string) => adminUpdateExchangeRate({ usd_rate: val }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Dollar kursi yangilandi');
      setEditingRate(false);
      refetchRate();
      // Kurs o'zgardi → backend USD'dagi mahsulotlar narxi va chegirma narxini
      // qayta hisobladi. Saytdagi BARCHA narx ko'rsatadigan ekranlar yangi
      // qiymatni darrov ko'rsatishi uchun tegishli cache'larni invalidatsiya
      // qilamiz (admin ro'yxati, mijoz katalogi, bosh sahifa, kategoriya,
      // mahsulot sahifasi, hisobot).
      ['admin-products', 'products', 'product', 'mainPage', 'categories-home',
       'category-products', 'admin-report', 'search-products'].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      );
    },
    onError: () => toast.error('Kursni yangilashda xatolik'),
  });

  // Do'kon sozlamalari (server'da saqlanadi — faqat Super Admin tahrir qila oladi)
  const { user } = useAuthStore();
  const isSuper = !!(user?.is_admin && !user?.role);

  // Shared cache hook — modul cache'ini avtomat sinxronlashtiradi
  // (useShopInfo ichida useEffect bor)
  const shopInfoQuery = useShopInfo();

  const FIXED_STORE_NAME = shopInfoQuery.data?.shop_name || loadShopInfo().name;
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeSaved, setStoreSaved] = useState(false);

  // Server javobi kelganda formani to'ldiramiz (faqat foydalanuvchi tahrir
  // qilmagan bo'lsa)
  useEffect(() => {
    if (shopInfoQuery.data) {
      setStorePhone((cur) => (cur ? cur : shopInfoQuery.data!.shop_phone));
      setStoreAddress((cur) => (cur ? cur : shopInfoQuery.data!.shop_address));
    }
  }, [shopInfoQuery.data]);

  const updateShopInfoMutation = useMutation({
    mutationFn: () =>
      adminUpdateShopInfo({
        shop_phone: storePhone,
        shop_address: storeAddress,
      }),
    onSuccess: (res) => {
      // Shared cache + React Query store ikkalasi ham yangilanadi -> POS,
      // OrdersTab, har joy darhol yangi qiymatni ko'radi.
      updateShopInfoCache(res.data);
      qc.setQueryData(['shop-info'], res.data);
      setStoreSaved(true);
      toast.success("Do'kon ma'lumotlari saqlandi (server'da, barcha qurilmalarda mos)!");
      setTimeout(() => setStoreSaved(false), 2000);
    },
    onError: (e: any) => {
      // Backend validatsiyasi xatosini foydalanuvchi-do'st ko'rinishga aylantirish
      const data = e?.response?.data;
      const msg =
        data?.error ||
        data?.shop_phone?.[0] ||
        data?.shop_address?.[0] ||
        data?.shop_name?.[0] ||
        "Saqlashda xatolik yuz berdi.";
      toast.error(msg);
    },
  });

  const saveStoreInfo = () => {
    if (!isSuper) return;
    updateShopInfoMutation.mutate();
  };

  return (
    <div className='space-y-6 max-w-2xl'>
      <div>
        <h2 className='font-h3 text-h3 text-on-surface'>Sozlamalar</h2>
        <p className='mt-1 text-body-sm text-on-surface-variant'>
          Tizim sozlamalari, dollar kursi va do'kon ma'lumotlari
        </p>
      </div>

      {/* Dollar kursi */}
      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
        <h3 className='mb-1 flex items-center gap-2 font-semibold text-on-surface'>
          <span className='flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary/10 text-tertiary'>
            <span className='material-symbols-outlined text-[20px]'>currency_exchange</span>
          </span>
          Dollar kursi (USD → UZS)
        </h3>
        <p className='mb-5 ml-11 text-sm text-on-surface-variant'>
          Mahsulot narxlarini avtomatik hisoblash uchun ishlatiladi
        </p>

        <div className='flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container p-4'>
          <div className='flex-1'>
            <p className='text-xs font-semibold uppercase text-on-surface-variant mb-1'>Joriy kurs</p>
            <p className='text-2xl font-black text-on-surface'>
              {rateData?.usd_rate ? Number(rateData.usd_rate).toLocaleString('uz-UZ') : '...'}
              <span className='ml-1 text-base font-normal text-on-surface-variant'>so'm / $1</span>
            </p>
          </div>
          {editingRate ? (
            <div className='flex items-center gap-2'>
              <input
                type='number'
                value={newRateValue}
                onChange={(e) => setNewRateValue(e.target.value)}
                className='w-32 rounded-xl border-2 border-primary bg-surface px-3 py-2 text-sm font-bold focus:outline-none'
                placeholder='Yangi kurs'
                autoFocus
              />
              <button
                onClick={() => updateRateMutation.mutate(newRateValue)}
                disabled={updateRateMutation.isPending || !newRateValue}
                className='flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50'
              >
                {updateRateMutation.isPending ? (
                  <span className='material-symbols-outlined animate-spin text-[16px]'>progress_activity</span>
                ) : (
                  <span className='material-symbols-outlined text-[16px]'>check</span>
                )}
                Saqlash
              </button>
              <button
                onClick={() => setEditingRate(false)}
                className='rounded-xl border border-outline-variant px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container'
              >
                Bekor
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNewRateValue(String(rateData?.usd_rate || ''));
                setEditingRate(true);
              }}
              className='flex items-center gap-2 rounded-xl border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container hover:text-primary transition-colors'
            >
              <span className='material-symbols-outlined text-[18px]'>edit</span>
              O'zgartirish
            </button>
          )}
        </div>
      </div>

      {/* Do'kon sozlamalari */}
      <div className='rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm'>
        <h3 className='mb-1 flex items-center gap-2 font-semibold text-on-surface'>
          <span className='flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary'>
            <span className='material-symbols-outlined text-[20px]'>store</span>
          </span>
          Do'kon ma'lumotlari
        </h3>
        <p className='mb-3 ml-11 text-sm text-on-surface-variant'>
          Savdo cheki (receipt) da ko'rinadigan telefon raqam va manzil
        </p>

        {!isSuper && (
          <div className='mb-4 ml-11 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'>
            <span className='material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5'>lock</span>
            <span>Do'kon ma'lumotlarini faqat <strong>Super Admin</strong> tahrir qila oladi. Siz faqat ko'rib turibsiz.</span>
          </div>
        )}

        <div className='space-y-4'>
          <div>
            <label className='mb-1.5 block text-sm font-bold text-on-surface'>Telefon raqam</label>
            <input
              type='text'
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              placeholder="+998 71 000-00-00"
              disabled={!isSuper || shopInfoQuery.isLoading}
              className='w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            />
          </div>
          <div>
            <label className='mb-1.5 block text-sm font-bold text-on-surface'>Manzil</label>
            <input
              type='text'
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
              placeholder="Toshkent sh., ..."
              disabled={!isSuper || shopInfoQuery.isLoading}
              className='w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
            />
          </div>
          {isSuper && (
            <div className='flex items-center gap-3 pt-2'>
              <button
                onClick={saveStoreInfo}
                disabled={updateShopInfoMutation.isPending || shopInfoQuery.isLoading}
                className='flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50'
              >
                <span className='material-symbols-outlined text-[18px]'>
                  {updateShopInfoMutation.isPending ? 'progress_activity' : storeSaved ? 'check_circle' : 'save'}
                </span>
                {updateShopInfoMutation.isPending ? 'Saqlanmoqda...' : storeSaved ? 'Saqlandi!' : 'Saqlash'}
              </button>
              <p className='text-xs text-on-surface-variant'>
                Bu ma'lumotlar <strong>server'da</strong> saqlanadi (barcha qurilmalarda mos)
              </p>
            </div>
          )}
        </div>

        {/* Receipt preview */}
        <div className='mt-6 rounded-xl border border-outline-variant bg-surface-container p-4'>
          <p className='mb-2 text-xs font-semibold uppercase text-on-surface-variant'>Chek ko'rinishi:</p>
          <div className='rounded-lg border border-outline bg-surface p-3 font-mono text-xs text-on-surface'>
            <div className='text-center font-bold uppercase tracking-widest'>{FIXED_STORE_NAME}</div>
            {storePhone && <div className='text-center text-on-surface-variant'>{storePhone}</div>}
            {storeAddress && <div className='text-center text-on-surface-variant'>{storeAddress}</div>}
            <div className='my-1.5 border-t border-dashed border-outline-variant' />
            <div className='text-on-surface-variant'>CHEK #000001</div>
          </div>
        </div>
      </div>
    </div>
  );
};
