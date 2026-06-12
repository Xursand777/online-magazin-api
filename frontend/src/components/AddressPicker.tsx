/**
 * AddressPicker — Yetkazib berish manzilini tanlash uchun YAGONA komponent.
 *
 * QAYERDA ISHLATILADI:
 *   • Profile.tsx — foydalanuvchi default manzilini saqlaydi
 *   • Checkout.tsx — buyurtma rasmiylashtirishda manzil
 *
 * IKKALA SAHIFADA HAM IDENTIK UX:
 *   • Bir xil 4 ta input maydoni
 *   • Bir xil "Kartadan tanlash" tugmasi (Leaflet xarita)
 *   • Bir xil "Joylashuvni aniqlash" tugmasi (Geolocation API + permission modal)
 *   • Bir xil reverse geocoding (Nominatim)
 *   • Bir xil custom marker (yashil pin_drop)
 *
 * "Avval saqlangan manzil avtomat to'ldiriladi" — parent komponent
 * `value` prop'ini Profile.delivery_address'dan oladi va shu pickerga uzatadi.
 * Pickerga kelgan har qanday o'zgarish onChange orqali parent'ga uzatiladi
 * (controlled component).
 *
 * CONTROLLED COMPONENT:
 *   Parent state'i — single source of truth. Picker faqat formatlash va
 *   visualizatsiya bilan shug'ullanadi. Bu Profile va Checkout o'rtasida
 *   manzilni sinxronlashtirish (auto-fill)ni soddalashtiradi.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { useLanguageStore } from '../store/languageStore';
import { toast } from '../utils/toast';
import {
  addressFromNominatim,
  formatStructuredAddress,
  parseStructuredAddress,
  reverseGeocode,
  type StructuredAddress,
} from '../utils/address';
import {
  createBozorMarkerIcon,
  loadLeaflet,
  UZ_DEFAULT_CENTER,
  UZ_DEFAULT_ZOOM,
} from '../utils/leaflet';
import {
  getCurrentPosition,
  queryGeolocationPermission,
  type GeolocationError,
} from '../utils/geolocation';
import GeoPermissionModal from './GeoPermissionModal';

interface AddressPickerProps {
  /** Joriy manzil — string yoki strukturalangan obyekt. */
  value: string | StructuredAddress;
  /** Manzil o'zgarganda chaqiriladi — strukturalangan + string. */
  onChange: (address: { structured: StructuredAddress; full: string }) => void;
  /** Inputlar majburiy belgilanishini ko'rsatadi. Default: true. */
  required?: boolean;
  /** Sarlavhani ko'rsatish (Profile uchun true, Checkout o'z sarlavhasi). */
  showHeading?: boolean;
  /** Yashil ramka rangi (Profile #22c55e, Checkout primary). */
  accentColor?: string;
}

const AddressPicker = ({
  value,
  onChange,
  required = true,
  showHeading = true,
  accentColor = '#22c55e',
}: AddressPickerProps) => {
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);

  // value string yoki obyektmi — ikkalasini ham qabul qilamiz
  const initial: StructuredAddress =
    typeof value === 'string' ? parseStructuredAddress(value) : value;

  const [viloyat, setViloyat] = useState(initial.viloyat);
  const [tumanShahar, setTumanShahar] = useState(initial.tumanShahar);
  const [mahalla, setMahalla] = useState(initial.mahalla);
  const [domUy, setDomUy] = useState(initial.domUy);

  const [showMap, setShowMap] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [geoModalOpen, setGeoModalOpen] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  // Map ichidagi handleMapClick uchun aktiv state qiymatlarini olish
  const setStateRef = useRef({ setViloyat, setTumanShahar, setMahalla, setDomUy });
  setStateRef.current = { setViloyat, setTumanShahar, setMahalla, setDomUy };
  const langRef = useRef<'uz' | 'ru' | 'en'>(language);
  langRef.current = language;

  // ── Parent value o'zgarganda local state sinxronlash ──────────────────────
  // Bu KRITIK: Profile saqlangan manzilni Checkout ochilganda avtomat ko'rsatadi.
  // Parent prop o'zgarganda (masalan, profile fetch keyin), local state ham
  // yangilanadi. Lekin foydalanuvchi inputni tahrir qilayotgan paytda
  // o'zgartirmaslik uchun, faqat string qiymat aniq farq qilsa.
  const lastSyncedRef = useRef<string>(formatStructuredAddress(initial));
  useEffect(() => {
    const incoming = typeof value === 'string' ? value : formatStructuredAddress(value);
    if (incoming && incoming !== lastSyncedRef.current) {
      const parsed = typeof value === 'string' ? parseStructuredAddress(value) : value;
      setViloyat(parsed.viloyat);
      setTumanShahar(parsed.tumanShahar);
      setMahalla(parsed.mahalla);
      setDomUy(parsed.domUy);
      lastSyncedRef.current = incoming;
    }
  }, [value]);

  // ── Local state o'zgarganda parent'ga xabar berish ────────────────────────
  // useEffect ichida onChange chaqirish — har bir typing'da parent state
  // yangilanadi. lastSyncedRef cyclic update'ni oldini oladi.
  useEffect(() => {
    const structured = { viloyat, tumanShahar, mahalla, domUy };
    const full = formatStructuredAddress(structured);
    if (full !== lastSyncedRef.current) {
      lastSyncedRef.current = full;
      onChange({ structured, full });
    }
    // onChange'ni dependency'ga qo'shsak, parent har render'da yangi reference
    // bersa cheksiz tsikl bo'ladi. Shuning uchun chetlatamiz (controlled
    // pattern'da xavfsiz).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viloyat, tumanShahar, mahalla, domUy]);

  // ── Xaritani yuklash (showMap=true bo'lganda) ─────────────────────────────
  useEffect(() => {
    if (!showMap || !mapContainerRef.current) return;
    let active = true;
    setIsMapLoading(true);

    loadLeaflet()
      .then((L) => {
        if (!active || !mapContainerRef.current) return;
        setIsMapLoading(false);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
        }

        const map = L.map(mapContainerRef.current, { zoomControl: true })
          .setView(UZ_DEFAULT_CENTER, UZ_DEFAULT_ZOOM);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const customMarkerIcon = createBozorMarkerIcon(L);
        let marker: any = null;

        const handleMapClick = async (lat: number, lng: number) => {
          if (!active) return;

          if (marker) {
            marker.setLatLng([lat, lng]);
          } else {
            marker = L.marker([lat, lng], { icon: customMarkerIcon }).addTo(map);
            markerRef.current = marker;
          }

          const addr = await reverseGeocode(lat, lng, langRef.current);
          if (!addr) {
            toast.error(t.profile.toastAddressError);
            return;
          }
          const structured = addressFromNominatim(addr);
          // setState ref orqali — useEffect dependency'larga qo'shmaslik uchun
          setStateRef.current.setViloyat(structured.viloyat);
          setStateRef.current.setTumanShahar(structured.tumanShahar);
          setStateRef.current.setMahalla(structured.mahalla);
          setStateRef.current.setDomUy(structured.domUy);
        };

        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          handleMapClick(lat, lng);
        });

        // Map ochilganda avtomat geolocate qilamiz — agar ruxsat bor bo'lsa
        // ('granted' yoki 'prompt'). Denied bo'lsa default ko'rinish saqlanadi.
        queryGeolocationPermission().then((perm) => {
          if (perm === 'denied' || perm === 'unsupported') return;
          // navigator.geolocation to'g'ridan-to'g'ri (modal kerakmas — map UX)
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!active) return;
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 15);
                marker = L.marker([latitude, longitude], { icon: customMarkerIcon }).addTo(map);
                markerRef.current = marker;
                handleMapClick(latitude, longitude);
              },
              () => {},
              { timeout: 5000 },
            );
          }
        });
      })
      .catch((err) => {
        console.error(err);
        if (active) {
          setIsMapLoading(false);
          toast.error(t.profile.toastMapError);
        }
      });

    return () => {
      active = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  // ── Joylashuvni aniqlash — Permissions API bilan ──────────────────────────
  const applyCoordinatesToForm = async (latitude: number, longitude: number) => {
    const addr = await reverseGeocode(latitude, longitude, language);
    if (!addr) {
      toast.warning(t.profile.toastGeoFailed);
      return false;
    }
    const structured = addressFromNominatim(addr);
    setViloyat(structured.viloyat);
    setTumanShahar(structured.tumanShahar);
    setMahalla(structured.mahalla);
    setDomUy(structured.domUy);
    toast.success(t.profile.toastGeoSuccess);
    return true;
  };

  const handleGeolocate = async () => {
    if (!navigator.geolocation) {
      toast.error(t.profile.toastGeoNotSupported);
      return;
    }

    setIsLocating(true);
    try {
      const permission = await queryGeolocationPermission();
      if (permission === 'denied') {
        setIsLocating(false);
        setGeoModalOpen(true);
        return;
      }
      try {
        const coords = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0,
        });
        await applyCoordinatesToForm(coords.latitude, coords.longitude);
      } catch (err) {
        const geoErr = err as GeolocationError;
        if (geoErr.kind === 'denied') {
          setGeoModalOpen(true);
        } else if (geoErr.kind === 'unsupported') {
          toast.error(t.profile.toastGeoNotSupported);
        } else {
          toast.error(t.profile.toastGeoLocationError);
        }
      }
    } finally {
      setIsLocating(false);
    }
  };

  const handleGeolocateRetry = async () => {
    setIsLocating(true);
    try {
      const coords = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      });
      await applyCoordinatesToForm(coords.latitude, coords.longitude);
    } catch (err) {
      const geoErr = err as GeolocationError;
      if (geoErr.kind === 'denied') throw err;
      toast.error(t.profile.toastGeoLocationError);
    } finally {
      setIsLocating(false);
    }
  };

  // ── Styled action buttons (Map + Geolocate) ──────────────────────────────
  const actionButtonClass = `flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border shrink-0`;
  const mapBtnStyle = showMap
    ? { background: accentColor, color: '#fff', borderColor: accentColor }
    : { background: `${accentColor}1a`, color: accentColor, borderColor: `${accentColor}33` };
  const geoBtnStyle = {
    background: `${accentColor}1a`,
    color: accentColor,
    borderColor: `${accentColor}33`,
  };

  return (
    <div>
      {showHeading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-on-surface">{t.profile.deliveryAddress}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">{t.profile.mapHint}</p>
          </div>
          <AddressActionButtons />
        </div>
      )}

      {!showHeading && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <AddressActionButtons />
        </div>
      )}

      {showMap && (
        <div className="mb-6 relative">
          <div className="text-xs text-on-surface-variant mb-2 flex items-center gap-1.5 bg-surface-container-low/50 p-2.5 rounded-lg border border-outline-variant/30">
            <span className="material-symbols-outlined text-[16px]" style={{ color: accentColor }}>info</span>
            <span>{t.profile.mapHint}</span>
          </div>
          <div className="relative w-full h-[320px] rounded-xl border border-outline-variant/60 shadow-[0_4px_20px_rgba(0,0,0,0.05)] overflow-hidden">
            {isMapLoading && (
              <div className="absolute inset-0 bg-surface-container-lowest/80 z-[1000] flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-3xl animate-spin" style={{ color: accentColor }}>progress_activity</span>
                <span className="text-xs font-semibold text-on-surface-variant">{t.profile.mapLoading}</span>
              </div>
            )}
            <div ref={mapContainerRef} className="w-full h-full z-10" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={t.profile.region}
          value={viloyat}
          onChange={setViloyat}
          placeholder={t.profile.regionPlaceholder}
          required={required}
          accentColor={accentColor}
        />
        <Field
          label={t.profile.district}
          value={tumanShahar}
          onChange={setTumanShahar}
          placeholder={t.profile.districtPlaceholder}
          required={required}
          accentColor={accentColor}
        />
        <Field
          label={t.profile.neighborhood}
          value={mahalla}
          onChange={setMahalla}
          placeholder={t.profile.neighborhoodPlaceholder}
          accentColor={accentColor}
        />
        <Field
          label={t.profile.house}
          value={domUy}
          onChange={setDomUy}
          placeholder={t.profile.housePlaceholder}
          required={required}
          accentColor={accentColor}
        />
      </div>

      <GeoPermissionModal
        open={geoModalOpen}
        onClose={() => setGeoModalOpen(false)}
        onManualEntry={() => {
          // Foydalanuvchi qo'lda kiritmoqchi — pickerda inputlar
          // allaqachon ko'rinib turadi, hech narsa qilmaymiz
        }}
        onRetry={handleGeolocateRetry}
      />
    </div>
  );

  function AddressActionButtons() {
    return (
      <div className="flex gap-2 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className={actionButtonClass}
          style={mapBtnStyle}
        >
          <span className="material-symbols-outlined text-[18px]">map</span>
          {showMap ? t.profile.closeMap : t.profile.selectFromMap}
        </button>

        <button
          type="button"
          onClick={handleGeolocate}
          disabled={isLocating}
          className={`${actionButtonClass} disabled:opacity-60`}
          style={geoBtnStyle}
        >
          {isLocating ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              {t.profile.detecting}
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">my_location</span>
              {t.profile.detectLocation}
            </>
          )}
        </button>
      </div>
    );
  }
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  accentColor: string;
}

const Field = ({ label, value, onChange, placeholder, required, accentColor }: FieldProps) => (
  <div>
    <label className="block text-sm font-semibold text-on-surface-variant mb-2">
      {label} {required && <span style={{ color: accentColor }}>*</span>}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low/50 p-3 outline-none transition-all text-sm font-medium focus:ring-1"
      style={{
        // CSS variable orqali focus rangi — accentColor
        // (Tailwind dynamic class'lar runtime'da yaratilmaydi)
        ['--tw-ring-color' as any]: accentColor,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = accentColor;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '';
      }}
    />
  </div>
);

export default AddressPicker;
