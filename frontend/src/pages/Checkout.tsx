import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { createOrderFromCart, getProfile } from '../api/endpoints';
import { toast } from '../utils/toast';

const formatPrice = (v: string | number) =>
  Number(v).toLocaleString('uz-UZ') + ' UZS';

const getCheckoutErrorMessage = (err: any) => {
  const data = err?.response?.data;
  if (!data) return "Buyurtma berishda xatolik yuz berdi.";
  if (typeof data.error === 'string') return data.error;
  if (Array.isArray(data.error)) return data.error.join(' ');

  const firstValue = Object.values(data)[0];
  if (Array.isArray(firstValue)) return String(firstValue[0]);
  if (typeof firstValue === 'string') return firstValue;

  return "Buyurtma berishda xatolik yuz berdi.";
};

const Checkout = () => {
  const navigate = useNavigate();
  const { cart, fetchCart, loading: cartLoading } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  
  const [formData, setFormData] = useState({
    receiver_name: '',
    receiver_phone: '',
    delivery_address: '',
    payment_method: 'cash' as 'cash' | 'card',
  });

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error("Rasmiylashtirish uchun avval tizimga kiring.");
      navigate('/auth?redirect=/checkout', { replace: true });
      return;
    }

    let active = true;
    setCartReady(false);

    fetchCart().finally(() => {
      if (active) setCartReady(true);
    });

    getProfile()
      .then((res) => {
        const p = res.data;
        setFormData((prev) => ({
          ...prev,
          receiver_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || prev.receiver_name,
          receiver_phone: p.phone || prev.receiver_phone,
        }));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [fetchCart, isAuthenticated, navigate]);

  const items = cart?.items || [];
  const totalPrice = Number(cart?.total_price || 0);

  if (!isAuthenticated) {
    return null;
  }

  if (!cartReady || cartLoading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 gap-4">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
        <p className="text-on-surface-variant">Savat ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 gap-4">
        <span className="material-symbols-outlined text-6xl text-outline">shopping_cart_off</span>
        <h2 className="text-h2 font-h2">Savat bo'sh</h2>
        <p className="text-on-surface-variant">Buyurtma berish uchun avval savatga mahsulot qo'shing.</p>
        <Link to="/" className="text-primary hover:underline font-medium">Bosh sahifaga qaytish</Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.receiver_name || !formData.receiver_phone || !formData.delivery_address) {
      toast.error("Iltimos, barcha maydonlarni to'ldiring.");
      return;
    }

    setLoading(true);
    try {
      const res = await createOrderFromCart(formData);
      toast.success("Buyurtma qabul qilindi! ✅");
      await useCartStore.getState().fetchCart();
      navigate(`/profile`, { state: { newOrderId: res.data.id } });
    } catch (err: any) {
      toast.error(getCheckoutErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow w-full py-lg pb-3xl">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1 text-on-surface">Rasmiylashtirish</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-sm">Buyurtma tafsilotlarini to'ldiring.</p>
      </header>
      
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-lg lg:gap-xl">
        {/* Left Column: Forms */}
        <div className="lg:col-span-8 flex flex-col gap-lg">
          {/* 1. Delivery Information */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
            <h2 className="font-h3 text-h3 text-on-surface mb-md border-b border-outline-variant pb-sm">Yetkazib berish ma'lumotlari</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-md">
              <div className="flex flex-col md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface-variant mb-xs" htmlFor="receiver_name">Ism va Familiya *</label>
                <input 
                  className="border border-outline-variant rounded-lg px-sm py-sm focus:ring-primary focus:border-primary bg-surface-bright outline-none" 
                  id="receiver_name" 
                  placeholder="Eshmatov Toshmat" 
                  required
                  type="text"
                  value={formData.receiver_name}
                  onChange={(e) => setFormData({...formData, receiver_name: e.target.value})}
                />
              </div>
              <div className="flex flex-col md:col-span-2">
                <label className="font-label-md text-label-md text-on-surface-variant mb-xs" htmlFor="receiver_phone">Telefon raqam *</label>
                <input 
                  className="border border-outline-variant rounded-lg px-sm py-sm focus:ring-primary focus:border-primary bg-surface-bright outline-none" 
                  id="receiver_phone" 
                  placeholder="+998 90 123 45 67" 
                  required
                  type="tel"
                  value={formData.receiver_phone}
                  onChange={(e) => setFormData({...formData, receiver_phone: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex flex-col mb-md">
              <label className="font-label-md text-label-md text-on-surface-variant mb-xs" htmlFor="address">Manzil *</label>
              <textarea 
                className="border border-outline-variant rounded-lg px-sm py-sm focus:ring-primary focus:border-primary bg-surface-bright outline-none resize-none" 
                id="address"
                placeholder="Shahar, tuman, ko'cha, uy, xonadon" 
                rows={3}
                required
                value={formData.delivery_address}
                onChange={(e) => setFormData({...formData, delivery_address: e.target.value})}
              />
            </div>
          </section>

          {/* 2. Payment Methods */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
            <h2 className="font-h3 text-h3 text-on-surface mb-md border-b border-outline-variant pb-sm">To'lov turi</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <label className="cursor-pointer">
                <input 
                  className="peer sr-only" 
                  name="payment" 
                  type="radio" 
                  checked={formData.payment_method === 'cash'}
                  onChange={() => setFormData({...formData, payment_method: 'cash'})}
                />
                <div className="border border-outline-variant rounded-xl p-md flex flex-col items-center text-center gap-sm peer-checked:border-primary peer-checked:bg-primary-container/10 transition-colors h-full">
                  <span className="material-symbols-outlined text-on-surface-variant peer-checked:text-primary text-[32px]">payments</span>
                  <span className="font-label-md text-label-md text-on-surface">Naqd pulda</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">Yetkazilganda to'lash</span>
                </div>
              </label>
              
              <label className="cursor-pointer">
                <input 
                  className="peer sr-only" 
                  name="payment" 
                  type="radio"
                  checked={formData.payment_method === 'card'}
                  onChange={() => setFormData({...formData, payment_method: 'card'})}
                />
                <div className="border border-outline-variant rounded-xl p-md flex flex-col items-center text-center gap-sm peer-checked:border-primary peer-checked:bg-primary-container/10 transition-colors h-full">
                  <span className="material-symbols-outlined text-on-surface-variant peer-checked:text-primary text-[32px]">credit_card</span>
                  <span className="font-label-md text-label-md text-on-surface">Karta orqali</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">Click / Payme (Tez kunda)</span>
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-4">
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg sticky top-[80px]">
            <h2 className="font-h3 text-h3 text-on-surface mb-md">Buyurtma xulosasi</h2>
            <div className="space-y-sm mb-md pb-md border-b border-outline-variant">
              <div className="flex justify-between items-center">
                <span className="font-body-md text-body-md text-on-surface-variant">Mahsulotlar ({cart?.items.length})</span>
                <span className="font-body-md text-body-md text-on-surface">{formatPrice(totalPrice)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body-md text-body-md text-on-surface-variant">Yetkazib berish</span>
                <span className="font-body-md text-body-md text-primary font-medium">Bepul</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center mb-lg">
              <span className="font-h3 text-h3 text-on-surface">Jami</span>
              <span className="font-price text-price text-primary">{formatPrice(totalPrice)}</span>
            </div>
            
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary font-label-md text-label-md py-md rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center gap-sm disabled:opacity-60"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              ) : null}
              Buyurtma berish
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            
            <div className="mt-md flex items-center justify-center gap-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px]">verified_user</span>
              <span className="font-body-sm text-body-sm text-xs">Xavfsiz rasmiylashtirish</span>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
};

export default Checkout;
