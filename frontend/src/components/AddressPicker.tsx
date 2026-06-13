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
  isSecureContext,
  queryGeolocationPermission,
  type GeolocationDenyReason,
  type GeolocationError,
} from '../utils/geolocation';
import GeoPermissionModal from './GeoPermissionModal';

/** Xarita pin koordinatasi — Phase 3.0 kuryer navigatsiyasi uchun. */
export interface AddressCoordinates {
  lat: number;
  lng: number;
}

/** AddressPicker onChange payload — to'liq holat. */
export interface AddressPickerChange {
  structured: StructuredAddress;
  full: string;
  /** Xarita yoki geolokatsiya orqali aniqlangan koordinata (null bo'lishi mumkin). */
  coordinates: AddressCoordinates | null;
  /** Kuryer uchun eslatma (domofon kodi, qavat va boshqalar). */
  notes: string;
}

interface AddressPickerProps {
  /** Joriy manzil — string yoki strukturalangan obyekt. */
  value: string | StructuredAddress;
  /** Boshlang'ich koordinata (Profile'dan kelganida) — ixtiyoriy. */
  initialCoordinates?: AddressCoordinates | null;
  /** Boshlang'ich eslatma — ixtiyoriy. */
  initialNotes?: string;
  /** Manzil o'zgarganda chaqiriladi — strukturalangan + string + coords + notes. */
  onChange: (address: AddressPickerChange) => void;
  /** Inputlar majburiy belgilanishini ko'rsatadi. Default: true. */
  required?: boolean;
  /** Sarlavhani ko'rsatish (Profile uchun true, Checkout o'z sarlavhasi). */
  showHeading?: boolean;
  /** Yashil ramka rangi (Profile #22c55e, Checkout primary). */
  accentColor?: string;
  /** Kuryer uchun eslatma maydonini ko'rsatish (Checkout uchun true). */
  showNotesField?: boolean;
}

const AddressPicker = ({
  value,
  initialCoordinates = null,
  initialNotes = '',
  onChange,
  required = true,
  showHeading = true,
  accentColor = '#22c55e',
  showNotesField = false,
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
  // ── Phase 3.0 — Xarita pin koordinatasi va kuryer eslatmasi ─────────────
  // Xaritada click / geolokatsiya orqali aniqlangan koordinata. Bu Order'ga
  // delivery_lat/lng sifatida saqlanadi va kuryer xaritasi shu nuqtaga
  // yo'l chizadi.
  const [coordinates, setCoordinates] = useState<AddressCoordinates | null>(initialCoordinates);
  const [notes, setNotes] = useState(initialNotes);

  const [showMap, setShowMap] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [geoModalOpen, setGeoModalOpen] = useState(false);
  // Modal'da nima sababdan ko'rsatilayotganini bildiradi — modal aniq matn
  // tanlaydi (avval bloklangan / endi bloklangan / HTTPS emas / system block).
  const [geoDenyReason, setGeoDenyReason] = useState<GeolocationDenyReason>('previously_denied');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  // Map ichidagi handleMapClick uchun aktiv state qiymatlarini olish
  // Phase 3.0: setCoordinates ham qo'shildi — xarita click koordinatani saqlash
  const setStateRef = useRef({
    setViloyat, setTumanShahar, setMahalla, setDomUy, setCoordinates,
  });
  setStateRef.current = {
    setViloyat, setTumanShahar, setMahalla, setDomUy, setCoordinates,
  };
  const langRef = useRef<'uz' | 'ru' | 'en'>(language);
  langRef.current = language;

  // ── Parent value o'zgarganda local state sinxronlash ──────────────────────
  // Bu KRITIK: Profile saqlangan manzilni Checkout ochilganda avtomat ko'rsatadi.
  // Parent prop o'zgarganda (masalan, profile fetch keyin), local state ham
  // yangilanadi. Lekin foydalanuvchi inputni tahrir qilayotgan paytda
  // o'zgartirmaslik uchun, faqat aniq farq bo'lsa.
  //
  // Phase 3.0: sync key endi structure + coords + notes ni o'z ichiga oladi.
  const initialSyncKey = JSON.stringify({
    full: formatStructuredAddress(initial),
    lat: initialCoordinates?.lat ?? null,
    lng: initialCoordinates?.lng ?? null,
    notes: initialNotes,
  });
  const lastSyncedRef = useRef<string>(initialSyncKey);
  useEffect(() => {
    const incoming = typeof value === 'string' ? value : formatStructuredAddress(value);
    if (incoming) {
      const newKey = JSON.stringify({
        full: incoming,
        lat: coordinates?.lat ?? null,
        lng: coordinates?.lng ?? null,
        notes,
      });
      if (newKey !== lastSyncedRef.current) {
        const parsed = typeof value === 'string' ? parseStructuredAddress(value) : value;
        setViloyat(parsed.viloyat);
        setTumanShahar(parsed.tumanShahar);
        setMahalla(parsed.mahalla);
        setDomUy(parsed.domUy);
        lastSyncedRef.current = newKey;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ── Local state o'zgarganda parent'ga xabar berish ────────────────────────
  // useEffect ichida onChange chaqirish — har bir typing'da parent state
  // yangilanadi. lastSyncedRef cyclic update'ni oldini oladi.
  //
  // Phase 3.0: onChange payload kengaytirilgan — structured + full + coords + notes.
  useEffect(() => {
    const structured = { viloyat, tumanShahar, mahalla, domUy };
    const full = formatStructuredAddress(structured);
    // Sync key: 4 maydon + coords + notes (har birining o'zgarishi onChange'ga sabab)
    const syncKey = JSON.stringify({
      full,
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      notes,
    });
    if (syncKey !== lastSyncedRef.current) {
      lastSyncedRef.current = syncKey;
      onChange({ structured, full, coordinates, notes });
    }
    // onChange'ni dependency'ga qo'shsak, parent har render'da yangi reference
    // bersa cheksiz tsikl bo'ladi. Shuning uchun chetlatamiz (controlled
    // pattern'da xavfsiz).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viloyat, tumanShahar, mahalla, domUy, coordinates, notes]);

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

          // ── Phase 3.0 — Xarita click koordinatasini SAQLASH ──────────────
          // Reverse geocode parallel ishlaydi, lekin koordinatani darhol
          // saqlaymiz — kuryer xaritasi shu nuqtaga yo'l chizadi. Nominatim
          // ba'zan xato bo'lsa ham, pin koordinatasi DOIM aniq.
          setStateRef.current.setCoordinates({ lat, lng });

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

        // Map ochilganda avtomat geolocate — brauzer native dialog ko'rsatadi.
        // Ruxsat berilsa → markerga ko'chiramiz. Rad etilsa → xato yo'q, sukut.
        // Bu avtomatik (foydalanuvchi bosmagan) — shuning uchun modal kerak emas.
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
            () => {
              // Ruxsat rad etilsa yoki xato — shunchaki sukut (modal kerakmas)
            },
            { timeout: 8000, enableHighAccuracy: true },
          );
        }
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

  // ── Joylashuvni aniqlash ───────────────────────────────────────────────────
  //
  // PROFESSIONAL 5 QATLAMLI TASHXIS (Yandex Maps, Google Maps, Uber pattern):
  //
  //   LAYER 1 — SECURE CONTEXT
  //     Sayt HTTPS yoki localhost'da bo'lishi shart. HTTP'da Geolocation
  //     API umuman ishlamaydi (brauzer hech qanday dialog ko'rsatmaydi).
  //     Bu — TEZ-TEZ uchraydigan muammo: dev server `http://192.168.x.x`.
  //
  //   LAYER 2 — API MAVJUDLIGI
  //     navigator.geolocation umuman bormi (juda eski brauzer, sandboxed
  //     iframe).
  //
  //   LAYER 3 — PERMISSION STATE (oldindan tekshirish)
  //     navigator.permissions.query() — brauzer dialog ko'rsatadimi?
  //       • granted → darhol koordinatani olamiz (silent)
  //       • prompt  → getCurrentPosition() chaqiramiz, brauzer dialog ko'rsatadi
  //       • denied  → BRAUZER DIALOG CHIQMAYDI, darhol modal ko'rsatamiz
  //
  //   LAYER 4 — getCurrentPosition() ishga tushadi
  //     'prompt' yoki 'granted' bo'lsa, koordinatani olamiz.
  //     Brauzer dialog ko'rsatishi mumkin (prompt holatida).
  //
  //   LAYER 5 — ERROR HANDLING
  //     Xato qaytarsa, ANIQ sababini aniqlaymiz:
  //       PERMISSION_DENIED → user hozir Block bosdi (just_denied)
  //       POSITION_UNAVAILABLE → GPS imkonsiz (system_block)
  //       TIMEOUT → tarmoq sekin yoki signal yo'q
  //
  // NIMA UCHUN HOZIR MUAMMO TUG'ILGAN EDI:
  //   Sizning brauzeringiz permission state'i allaqachon 'denied'. Brauzer
  //   bu holatda hech qanday dialog ko'rsatmaydi — to'g'ridan-to'g'ri
  //   PERMISSION_DENIED qaytaradi. Foydalanuvchi tugmani bosgani bilan
  //   "hech narsa bo'lmadi" deb tushundi. Yangi yondashuv: Layer 3'da
  //   buni aniqlab, modal'da "siz avval bloklagansiz" deb aniq ayttiramiz.

  const applyCoordinatesToForm = async (latitude: number, longitude: number) => {
    // Phase 3.0: Geolokatsiyadan kelgan koordinatani saqlaymiz
    setCoordinates({ lat: latitude, lng: longitude });

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

  /** Modal'ni aniq sabab bilan ochish. */
  const openDenyModal = (reason: GeolocationDenyReason) => {
    setGeoDenyReason(reason);
    setGeoModalOpen(true);
  };

  const handleGeolocate = async () => {
    // ── LAYER 1: SECURE CONTEXT ─────────────────────────────────────────────
    if (!isSecureContext()) {
      console.warn(
        '[Geolocation] Secure context yo\'q. Joriy URL:',
        window.location.href,
        '— Geolocation API faqat HTTPS yoki localhost da ishlaydi.',
      );
      openDenyModal('insecure_context');
      return;
    }

    // ── LAYER 2: API MAVJUDLIGI ──────────────────────────────────────────────
    if (!navigator.geolocation) {
      console.warn('[Geolocation] navigator.geolocation mavjud emas.');
      openDenyModal('unsupported');
      return;
    }

    setIsLocating(true);
    try {
      // ── LAYER 3: PERMISSION STATE (oldindan tekshirish) ────────────────────
      const permissionState = await queryGeolocationPermission();
      // Diagnostika — DevTools'da foydalanuvchi/dev tahlil qilishi mumkin
      console.info('[Geolocation] Permission state:', permissionState);

      if (permissionState === 'denied') {
        // Brauzer avval blok qilgan — DIALOG CHIQMAYDI.
        // Modal'da "siz avval bloklagansiz, sozlamalardan ruxsat bering" deymiz.
        setIsLocating(false);
        openDenyModal('previously_denied');
        return;
      }

      // ── LAYER 4: KOORDINATANI OLISH ─────────────────────────────────────────
      // 'granted' → darhol koordinata keladi
      // 'prompt'  → brauzer NATIVE dialog ko'rsatadi (Allow / Block / Allow once)
      // 'unsupported' → API'ni to'g'ridan-to'g'ri chaqiramiz, browser o'zi hal qiladi
      const coords = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15_000, // foydalanuvchi dialog'da "Allow" bosishini kutadi
        maximumAge: 0,
      });
      console.info(
        '[Geolocation] Olingan koordinatalar:',
        { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy },
      );
      await applyCoordinatesToForm(coords.latitude, coords.longitude);
    } catch (err) {
      // ── LAYER 5: ERROR HANDLING ─────────────────────────────────────────────
      const geoErr = err as GeolocationError;
      console.warn('[Geolocation] Xato:', geoErr.kind, geoErr.message);

      if (geoErr.kind === 'denied') {
        // 'prompt' holatda foydalanuvchi DIALOG'DA Block bosdi
        openDenyModal('just_denied');
      } else if (geoErr.kind === 'unsupported') {
        openDenyModal('unsupported');
      } else if (geoErr.kind === 'unavailable') {
        // POSITION_UNAVAILABLE — sistema GPS bermayapti (OS bloki, qurilma noqobil)
        openDenyModal('system_block');
      } else {
        // timeout — tarmoq sekin yoki signal yo'q
        toast.error(t.profile.toastGeoLocationError);
      }
    } finally {
      setIsLocating(false);
    }
  };

  // Modal'dagi "Qayta urinish" — foydalanuvchi brauzer sozlamalarida ruxsat
  // bergan deb taxmin qilamiz. Yangi permission state'ni tekshiramiz.
  const handleGeolocateRetry = async () => {
    // Insecure context retry foydasiz — sayt URL'i o'zgarmagan
    if (!isSecureContext()) throw new Error('insecure_context_retry_blocked');

    setIsLocating(true);
    try {
      const permissionState = await queryGeolocationPermission();
      console.info('[Geolocation] Retry permission state:', permissionState);
      if (permissionState === 'denied') {
        // Foydalanuvchi sozlamalardan ruxsat bermagan — qayta throw
        throw new Error('still_denied');
      }
      const coords = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      });
      await applyCoordinatesToForm(coords.latitude, coords.longitude);
    } catch (err) {
      const geoErr = err as GeolocationError;
      if (geoErr.kind === 'denied') throw err;
      // Boshqa xato — modal'da retry tugmasi qaytishi mumkin
      throw err;
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

      {/* ── Phase 3.0 — Kuryer uchun eslatma maydoni ────────────────────────
          Faqat Checkout'da ko'rsatiladi (showNotesField=true).
          Domofon kodi, qavat, alohida ko'rsatmalar — "oxirgi 50 metr muammosi"
          yechimi. Kuryer xaritada manzilni topgach, eshik oldida shu eslatmadan
          foydalanib mijozni tezroq topadi. */}
      {showNotesField && (
        <div className="mt-4">
          <label
            className="block text-sm font-semibold text-on-surface-variant mb-2 flex items-center gap-2"
            htmlFor="delivery_notes"
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: accentColor }}>
              sticky_note_2
            </span>
            Kuryer uchun eslatma
            <span className="text-xs text-on-surface-variant font-normal">(ixtiyoriy)</span>
          </label>
          <textarea
            id="delivery_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="Domofon kodi, qavat raqami, alohida ko'rsatmalar..."
            className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low/50 p-3 outline-none transition-all text-sm font-medium focus:ring-1 resize-none"
            style={{
              ['--tw-ring-color' as any]: accentColor,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentColor;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '';
            }}
            maxLength={500}
          />
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">info</span>
              Kuryerga manzilni topishga yordam beradi
            </p>
            <span className="text-[10px] text-on-surface-variant">{notes.length}/500</span>
          </div>
        </div>
      )}

      {/* ── Phase 3.0 — Xarita pin tasdiq belgisi ───────────────────────────
          Mijoz xaritadan koordinata tanlaganida ko'rinadi — buyurtmasi
          kuryer xaritasida aniq nuqtaga chiziladi degan ishonch beradi. */}
      {coordinates && (
        <div
          className="mt-3 p-2.5 rounded-lg flex items-center gap-2 border"
          style={{
            background: `${accentColor}0d`,
            borderColor: `${accentColor}33`,
          }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: accentColor }}>
            verified
          </span>
          <p className="text-xs text-on-surface flex-1">
            Xaritadan aniq joylashuv tanlangan. Kuryer xaritada to'g'ridan-to'g'ri shu nuqtaga keladi.
          </p>
        </div>
      )}

      <GeoPermissionModal
        open={geoModalOpen}
        onClose={() => setGeoModalOpen(false)}
        onManualEntry={() => {
          // Foydalanuvchi qo'lda kiritmoqchi — pickerda inputlar
          // allaqachon ko'rinib turadi, hech narsa qilmaymiz
        }}
        onRetry={handleGeolocateRetry}
        reason={geoDenyReason}
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
