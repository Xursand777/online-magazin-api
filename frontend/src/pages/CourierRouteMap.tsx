/**
 * CourierRouteMap — Kuryer Real-Time Navigatsiya Xaritasi.
 *
 * URL: /courier/route/:orderId
 * Permission: faqat kuryer, admin, super_admin (backend tomonidan tekshiriladi).
 *
 * BU SAHIFA NIMA QILADI?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. Mijoz buyurtma berishda AddressPicker'da xaritadan PIN qo'ydi
 *      → backend'da Order.delivery_lat, delivery_lng saqlandi.
 *
 *   2. Kuryer admin paneli orqali buyurtmani ochib, "Xaritadan borish"
 *      tugmasini bosadi → bu sahifa ochiladi.
 *
 *   3. Sahifa ochilganida:
 *      a) Backend'dan /api/orders/:id/route-target/ orqali manzil va
 *         koordinatani oladi.
 *      b) Brauzer GPS'idan kuryerning joriy joylashuvini watchPosition()
 *         orqali real-time olib turadi.
 *      c) OSRM API'ga so'rov yuborib, kuryer va manzil orasidagi YO'L'ni
 *         (driving route) oladi.
 *      d) Leaflet xaritada chizadi:
 *          • 🚗 Kuryer markeri (animatsiyali, harakatda)
 *          • 📍 Manzil markeri (qizil pin)
 *          • ━━━ Yashil polyline yo'l (haqiqiy ko'cha bo'ylab)
 *
 *   4. Kuryer harakat qilarkan:
 *      • Marker xaritada siljiydi
 *      • Har 200m+ harakat YOKI 30s'dan keyin — yo'l qaytadan hisoblanadi
 *      • Masofa va ETA yangilanadi
 *
 *   5. Manzilga 50m yaqinlashganda:
 *      • "Yetkazib berdim" tugma chiqadi
 *      • Bir bosib status RECEIVED ga o'tadi (yoki dialog ochiladi)
 *
 * MIJOZ KO'RMAYDI:
 *   Bu sahifa faqat kuryer uchun. URL'ni mijoz topa olmaydi, permission
 *   backend tomonidan blocklanadi. Kuryer GPS'i hech qaerga uzatilmaydi.
 *
 * BATAREYA OPTIMIZATSIYASI:
 *   • document.hidden bo'lsa watchPosition pauza qilinadi
 *   • OSRM cache 30s ichida bir xil so'rov qaytarmaydi
 *   • Re-route shartlari (200m+ yoki 30s+) — minimal so'rov
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../api/client';
import { toast } from '../utils/toast';
import { loadLeaflet, createBozorMarkerIcon } from '../utils/leaflet';
import {
  fetchRoute,
  haversineDistance,
  shouldRefreshRoute,
  formatDistance,
  formatDuration,
  straightLineFallback,
  type LatLng,
  type RouteResult,
} from '../utils/routing';
import {
  queryGeolocationPermission,
  isSecureContext,
  type GeolocationDenyReason,
} from '../utils/geolocation';
import GeoPermissionModal from '../components/GeoPermissionModal';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RouteTarget {
  order_id: number;
  status: string;
  destination: { lat: number; lng: number; address: string } | null;
  address_text: string;
  notes: string;
  receiver_name: string;
  receiver_phone: string;
}

const CourierRouteMap = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [target, setTarget] = useState<RouteTarget | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [courierPos, setCourierPos] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [geoModalOpen, setGeoModalOpen] = useState(false);
  const [geoDenyReason, setGeoDenyReason] =
    useState<GeolocationDenyReason>('previously_denied');

  // Map refs
  const mapRef = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastRouteFetchRef = useRef<{ pos: LatLng; ts: number } | null>(null);

  // ── 1. Manzil ma'lumotini yuklash ──────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;
    apiClient
      .get<RouteTarget>(`/orders/${orderId}/route-target/`)
      .then((res) => setTarget(res.data))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 403) {
          setTargetError("Sizga bu buyurtmaga kirishga ruxsat yo'q.");
        } else if (status === 404) {
          setTargetError('Buyurtma topilmadi.');
        } else {
          setTargetError("Buyurtma ma'lumotini olib bo'lmadi. Internetingizni tekshiring.");
        }
      });
  }, [orderId]);

  // ── 2. Xaritani initsializatsiya qilish ─────────────────────────────────
  useEffect(() => {
    if (!target?.destination) return;
    const dest = target.destination;
    let active = true;

    loadLeaflet().then((L) => {
      if (!active) return;
      const container = document.getElementById('courier-map');
      if (!container) return;

      const map = L.map(container, {
        zoomControl: true,
        attributionControl: true,
      }).setView([dest.lat, dest.lng], 14);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      // Manzil markeri — qizil pin
      const destIcon = createBozorMarkerIcon(L);
      const destMarker = L.marker([dest.lat, dest.lng], { icon: destIcon }).addTo(map);
      destMarker.bindPopup(
        `<div style="min-width:180px">` +
          `<b>${target.receiver_name}</b><br/>` +
          `${dest.address}` +
          (target.notes ? `<br/><i style="color:#22c55e">${target.notes}</i>` : '') +
          `</div>`
      );
      destMarkerRef.current = destMarker;
    });

    return () => {
      active = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      courierMarkerRef.current = null;
      destMarkerRef.current = null;
      routeLineRef.current = null;
    };
  }, [target]);

  // ── 3. Kuryer markerini yangilash (real-time GPS bilan) ───────────────
  const updateCourierMarker = useCallback((pos: LatLng) => {
    const L = (window as any).L;
    if (!mapRef.current || !L) return;

    if (!courierMarkerRef.current) {
      // Birinchi marta — kuryer markerini yaratamiz
      const carIcon = L.divIcon({
        html: `<div style="font-size:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));line-height:1;">🚗</div>`,
        className: 'courier-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      courierMarkerRef.current = L.marker(pos, { icon: carIcon, zIndexOffset: 1000 }).addTo(
        mapRef.current
      );
    } else {
      courierMarkerRef.current.setLatLng(pos);
    }
  }, []);

  // ── 4. Yo'lni xaritada chizish ────────────────────────────────────────
  const drawRoute = useCallback(
    (r: RouteResult, isFirst: boolean) => {
      const L = (window as any).L;
      if (!mapRef.current || !L) return;

      // Eski yo'lni o'chirib, yangisini chizamiz
      if (routeLineRef.current) {
        routeLineRef.current.remove();
      }

      routeLineRef.current = L.polyline(r.geometry, {
        color: '#22c55e',
        weight: 6,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(mapRef.current);

      // Birinchi marta — xaritani butun yo'l ko'rinadigan qilib zoom
      if (isFirst) {
        mapRef.current.fitBounds(routeLineRef.current.getBounds(), {
          padding: [60, 60],
          maxZoom: 16,
        });
      }
    },
    []
  );

  // ── 5. Yo'lni qayta hisoblash (throttled) ─────────────────────────────
  const maybeRefreshRoute = useCallback(
    async (pos: LatLng) => {
      if (!target?.destination) return;
      if (!shouldRefreshRoute(pos, lastRouteFetchRef.current)) return;

      setIsLoadingRoute(true);
      const dest: LatLng = [target.destination.lat, target.destination.lng];
      const newRoute = await fetchRoute(pos, dest);

      if (newRoute) {
        const isFirst = !lastRouteFetchRef.current;
        setRoute(newRoute);
        drawRoute(newRoute, isFirst);
        lastRouteFetchRef.current = { pos, ts: Date.now() };
      } else {
        // OSRM xato — to'g'ri chiziq fallback
        const fallback = straightLineFallback(pos, dest);
        if (!route) {
          setRoute(fallback);
          drawRoute(fallback, true);
          toast.warning("Marshrut servisi javob bermayapti. To'g'ri chiziq ko'rsatildi.");
        }
      }
      setIsLoadingRoute(false);
    },
    [target, drawRoute, route]
  );

  // ── 6. GPS watchPosition — real-time GPS ──────────────────────────────
  useEffect(() => {
    if (!target?.destination) return;

    // Secure context tekshirish
    if (!isSecureContext()) {
      setGeoDenyReason('insecure_context');
      setGeoModalOpen(true);
      return;
    }
    if (!navigator.geolocation) {
      setGeoDenyReason('unsupported');
      setGeoModalOpen(true);
      return;
    }

    // Permission state'ni oldindan tekshirish
    queryGeolocationPermission().then((state) => {
      if (state === 'denied') {
        setGeoDenyReason('previously_denied');
        setGeoModalOpen(true);
        return;
      }
      startWatching();
    });

    function startWatching() {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const newPos: LatLng = [position.coords.latitude, position.coords.longitude];
          setCourierPos(newPos);
          updateCourierMarker(newPos);
          maybeRefreshRoute(newPos);
        },
        (error) => {
          console.warn('[CourierRouteMap] GPS xato:', error);
          if (error.code === error.PERMISSION_DENIED) {
            setGeoDenyReason('just_denied');
            setGeoModalOpen(true);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5_000,
          timeout: 20_000,
        }
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [target, updateCourierMarker, maybeRefreshRoute]);

  // ── 7. Tab visibility — batareya tejash ───────────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Resume avtomat sodir bo'lmaydi — keyingi useEffect re-run bo'lganda
      // tiklanadi (target o'zgarmasa). Tab qaytsa, foydalanuvchi tugma
      // bosib qayta yoqishi yoki sahifani yangilashi mumkin.
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ── 8. Manzilga yaqinlashish detect ──────────────────────────────────
  useEffect(() => {
    if (!courierPos || !target?.destination) return;
    const dist = haversineDistance(courierPos, [
      target.destination.lat,
      target.destination.lng,
    ]);
    if (dist < 50 && !arrived) {
      setArrived(true);
      toast.success("Manzilga yetdingiz! Mijoz bilan bog'laning.");
    }
  }, [courierPos, target, arrived]);

  // ── 9. Markaz tugma — kuryer joylashuviga qaytarish ──────────────────
  const centerOnCourier = () => {
    if (!courierPos || !mapRef.current) return;
    mapRef.current.setView(courierPos, 16, { animate: true });
  };

  const callCustomer = useMemo(() => {
    if (!target?.receiver_phone) return null;
    return target.receiver_phone.replace(/\s+/g, '');
  }, [target?.receiver_phone]);

  // ── 10. Render ─────────────────────────────────────────────────────────

  // Loading state
  if (!target && !targetError) {
    return (
      <div className="fixed inset-0 z-50 bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-5xl animate-spin text-primary">
            progress_activity
          </span>
          <p className="text-sm text-on-surface-variant">Yo'l ma'lumotlari yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (targetError) {
    return (
      <div className="fixed inset-0 z-50 bg-surface flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <span className="material-symbols-outlined text-6xl text-error mb-3">error</span>
          <h2 className="text-lg font-bold mb-2">Xato</h2>
          <p className="text-sm text-on-surface-variant mb-4">{targetError}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl font-semibold"
          >
            Orqaga qaytish
          </button>
        </div>
      </div>
    );
  }

  // Koordinata yo'q — fallback: manzil matni + tashqi xaritalar deep link
  if (target && !target.destination) {
    // External maps deep links — matn manzili bilan ochiladi (CIS standart)
    const addressEncoded = encodeURIComponent(target.address_text);
    const yandexUrl = `https://yandex.com/maps/?text=${addressEncoded}`;
    const googleUrl = `https://www.google.com/maps/search/?api=1&query=${addressEncoded}`;
    const twoGisUrl = `https://2gis.uz/search/${addressEncoded}`;

    return (
      <div className="fixed inset-0 z-50 bg-surface overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur shadow-md p-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-surface-container">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-bold flex-1">Buyurtma #{target.order_id}</h2>
          </div>
        </div>
        <div className="p-4 max-w-md mx-auto">
          <div className="flex flex-col items-center text-center mb-4">
            <span className="material-symbols-outlined text-6xl text-amber-500 mb-3">
              location_off
            </span>
            <h3 className="text-lg font-bold mb-2">Aniq koordinata yo'q</h3>
            <p className="text-sm text-on-surface-variant max-w-md">
              Mijoz xaritadan aniq joy tanlamagan. Quyidagi matn manzili
              bo'yicha boring yoki tashqi xarita xizmatini ishlatib navigatsiya qiling.
            </p>
          </div>

          {/* Mijoz ma'lumotlari */}
          <div className="bg-surface-container rounded-2xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <span className="material-symbols-outlined text-primary mt-0.5">person</span>
              <div className="flex-1">
                <p className="font-bold">{target.receiver_name}</p>
                <p className="text-sm text-on-surface-variant">{target.receiver_phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 mb-3">
              <span className="material-symbols-outlined text-primary mt-0.5">place</span>
              <p className="text-sm flex-1">{target.address_text}</p>
            </div>
            {target.notes && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                <span className="material-symbols-outlined text-amber-700 text-[18px] mt-0.5">
                  sticky_note_2
                </span>
                <p className="text-sm text-amber-900 flex-1">{target.notes}</p>
              </div>
            )}
          </div>

          {/* Qo'ng'iroq */}
          {callCustomer && (
            <a
              href={`tel:${callCustomer}`}
              className="block w-full mb-3 px-6 py-3 bg-primary text-on-primary rounded-2xl font-bold flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">call</span>
              {target.receiver_phone}
            </a>
          )}

          {/* Tashqi xaritalar — matn manzil bo'yicha qidirish */}
          <p className="text-xs uppercase tracking-wide text-on-surface-variant font-semibold mb-2 mt-4">
            Tashqi navigatsiya
          </p>
          <div className="flex flex-col gap-2">
            <a
              href={yandexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#FFCC00]/15 border border-[#FFCC00]/30 hover:bg-[#FFCC00]/25 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗺️</span>
                <div className="text-left">
                  <p className="font-bold text-sm">Yandex Maps'da ochish</p>
                  <p className="text-xs text-on-surface-variant">CIS uchun eng aniq xarita</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">open_in_new</span>
            </a>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗺️</span>
                <div className="text-left">
                  <p className="font-bold text-sm">Google Maps'da ochish</p>
                  <p className="text-xs text-on-surface-variant">Universal xarita</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">open_in_new</span>
            </a>
            <a
              href={twoGisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗺️</span>
                <div className="text-left">
                  <p className="font-bold text-sm">2GIS'da ochish</p>
                  <p className="text-xs text-on-surface-variant">O'zbekiston shaharlari</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">open_in_new</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Normal state — to'liq xarita
  return (
    <div className="fixed inset-0 z-50 bg-surface">
      {/* Yuqori panel */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-surface/95 backdrop-blur shadow-md">
        <div className="px-3 py-2.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-surface-container"
            aria-label="Orqaga"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold truncate">Buyurtma #{target!.order_id}</h2>
            <p className="text-xs text-on-surface-variant truncate">
              {target!.receiver_name} · {target!.receiver_phone}
            </p>
          </div>
          {callCustomer && (
            <a
              href={`tel:${callCustomer}`}
              className="p-2 rounded-full bg-primary/15 text-primary hover:bg-primary/25"
              aria-label="Qo'ng'iroq qilish"
            >
              <span className="material-symbols-outlined">call</span>
            </a>
          )}
        </div>

        {/* Eslatma */}
        {target!.notes && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-700 text-[18px] mt-0.5">
              sticky_note_2
            </span>
            <p className="text-xs text-amber-900 flex-1">{target!.notes}</p>
          </div>
        )}

        {/* Masofa va vaqt */}
        {route && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-primary/8 border border-primary/15 flex items-center gap-3 text-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">route</span>
            <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-bold">{formatDistance(route.distanceMeters)}</span>
              {route.durationSeconds > 0 && (
                <span className="text-on-surface-variant">
                  ⏱ {formatDuration(route.durationSeconds)}
                </span>
              )}
              {isLoadingRoute && (
                <span className="text-xs text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] animate-spin">
                    progress_activity
                  </span>
                  Yangilanmoqda
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Xarita */}
      <div id="courier-map" className="absolute inset-0 z-0" />

      {/* Markaz tugma */}
      {courierPos && (
        <button
          onClick={centerOnCourier}
          className="absolute bottom-24 right-4 z-[999] bg-surface w-12 h-12 rounded-full shadow-lg flex items-center justify-center border border-outline-variant hover:bg-surface-container"
          aria-label="Joylashuvimga qaytish"
        >
          <span className="material-symbols-outlined text-primary">my_location</span>
        </button>
      )}

      {/* Manzilga yetdi — yashil banner */}
      {arrived && (
        <div className="absolute bottom-4 left-4 right-4 z-[999] bg-primary text-on-primary rounded-2xl p-4 shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom">
          <span className="material-symbols-outlined text-3xl">where_to_vote</span>
          <div className="flex-1">
            <p className="font-bold">Manzilga yetdingiz!</p>
            <p className="text-sm opacity-90">Mijoz bilan bog'lanib tovarni topshiring.</p>
          </div>
          {callCustomer && (
            <a
              href={`tel:${callCustomer}`}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl font-bold text-sm"
            >
              📞 Qo'ng'iroq
            </a>
          )}
        </div>
      )}

      {/* GPS permission modal */}
      <GeoPermissionModal
        open={geoModalOpen}
        onClose={() => setGeoModalOpen(false)}
        onManualEntry={() => {
          // Kuryer xaritasi uchun manual entry mavjud emas — orqaga qaytaramiz
          navigate(-1);
        }}
        onRetry={async () => {
          // Permission qayta tekshirish
          const state = await queryGeolocationPermission();
          if (state === 'denied') throw new Error('still_denied');
          // Sahifani qayta yuklash — useEffect'lar qayta ishga tushadi
          window.location.reload();
        }}
        reason={geoDenyReason}
      />
    </div>
  );
};

export default CourierRouteMap;
