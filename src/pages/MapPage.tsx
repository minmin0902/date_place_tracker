/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useApiIsLoaded,
} from "@vis.gl/react-google-maps";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PullIndicator } from "@/components/PullIndicator";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces, type PlaceWithFoods } from "@/hooks/usePlaces";
import { useRefreshControls } from "@/hooks/useRefreshControls";
import { supabase } from "@/lib/supabase";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = "date-place-map";
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // Seoul fallback

type LatLng = { lat: number; lng: number };

// House-shaped pin for the couple's home address. Stands out from the
// food markers via a different gradient + roof silhouette so users can
// orient relative to home at a glance.
function HomePin() {
  return (
    <div className="relative drop-shadow-md">
      <svg
        width="38"
        height="46"
        viewBox="0 0 38 46"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="home pin"
      >
        <defs>
          <linearGradient id="homePinFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7DD3C0" />
            <stop offset="1" stopColor="#3EB7A0" />
          </linearGradient>
        </defs>
        {/* Outer teardrop body */}
        <path
          d="M19 0 C9 0 1 8 1 18 C1 29 14 38 18 45 C18.4 45.7 19.6 45.7 20 45 C24 38 37 29 37 18 C37 8 29 0 19 0 Z"
          fill="url(#homePinFill)"
          stroke="white"
          strokeWidth="2"
        />
        {/* Roof + house body */}
        <path
          d="M19 8 L11 16 L11 24 L27 24 L27 16 Z"
          fill="white"
        />
        {/* Door */}
        <rect x="17" y="18" width="4" height="6" fill="#3EB7A0" />
      </svg>
    </div>
  );
}

// Teardrop-shaped pin with a heart, rendered as SVG so the tail points at
// the exact lat/lng (no emoji-font quirks across platforms).
function RevisitPin() {
  return (
    <div className="relative -translate-y-1 drop-shadow-md">
      <svg
        width="34"
        height="44"
        viewBox="0 0 34 44"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="revisit pin"
      >
        <defs>
          <linearGradient id="revisitPinFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F89570" />
            <stop offset="1" stopColor="#E47C88" />
          </linearGradient>
        </defs>
        <path
          d="M17 0 C8 0 1 7 1 16 C1 26 12 35 16 42 C16.4 42.7 17.6 42.7 18 42 C22 35 33 26 33 16 C33 7 26 0 17 0 Z"
          fill="url(#revisitPinFill)"
          stroke="white"
          strokeWidth="2"
        />
        <path
          d="M17 24 C14.5 21.5 10 19 10 14.5 C10 12 12 10 14.3 10 C15.6 10 16.5 10.6 17 11.4 C17.5 10.6 18.4 10 19.7 10 C22 10 24 12 24 14.5 C24 19 19.5 21.5 17 24 Z"
          fill="white"
        />
      </svg>
    </div>
  );
}

// Backfill missing coordinates: any place that has an address but no
// lat/lng gets geocoded once via google.maps.Geocoder, written back to
// Supabase, and the places query is invalidated so the new marker appears.
// Lives inside <APIProvider> so the Maps script is guaranteed to be loaded.
function GeocodeBackfill({ places }: { places: PlaceWithFoods[] }) {
  const apiLoaded = useApiIsLoaded();
  const qc = useQueryClient();
  // Track ids we've already attempted this session so we don't loop on
  // permanent geocode failures (e.g. "South side of mountain, no address").
  const tried = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!apiLoaded) return;
    const missing = places.filter(
      (p) =>
        (p.latitude == null || p.longitude == null) &&
        p.address &&
        p.address.trim().length > 0 &&
        !tried.current.has(p.id)
    );
    if (missing.length === 0) return;
    console.log(
      `[GeocodeBackfill] ${missing.length} 곳 좌표 채우기 시작 ·`,
      missing.map((p) => p.name)
    );

    let cancelled = false;
    const geocoder = new google.maps.Geocoder();

    async function run() {
      let didUpdate = 0;
      let geocodeFail = 0;
      let writeFail = 0;
      for (const p of missing) {
        if (cancelled) break;
        tried.current.add(p.id);
        try {
          const res = await geocoder.geocode({ address: p.address! });
          const top = res.results?.[0];
          if (!top) {
            console.warn(`[GeocodeBackfill] no result · ${p.name} · ${p.address}`);
            geocodeFail++;
            continue;
          }
          const loc = top.geometry?.location;
          if (!loc) {
            geocodeFail++;
            continue;
          }
          const lat = loc.lat();
          const lng = loc.lng();
          const { error } = await supabase
            .from("places")
            .update({ latitude: lat, longitude: lng })
            .eq("id", p.id);
          if (error) {
            console.error(
              `[GeocodeBackfill] DB update 실패 · ${p.name}`,
              error
            );
            writeFail++;
          } else {
            didUpdate++;
            console.log(
              `[GeocodeBackfill] ✓ ${p.name} → ${lat.toFixed(4)}, ${lng.toFixed(4)}`
            );
          }
        } catch (e) {
          console.warn(`[GeocodeBackfill] geocode 예외 · ${p.name}`, e);
          geocodeFail++;
        }
        // Throttle: stay polite to the API and avoid OVER_QUERY_LIMIT.
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(
        `[GeocodeBackfill] 끝 · 성공 ${didUpdate} / geocode 실패 ${geocodeFail} / DB 실패 ${writeFail}`
      );
      if (didUpdate > 0 && !cancelled) {
        qc.invalidateQueries({ queryKey: ["places"] });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiLoaded, places, qc]);

  return null;
}

export default function MapPage() {
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();
  // Map cares about places (markers) + couple (home pin), so refresh
  // invalidates both. Wrapped in useRefreshControls so the same
  // pull-to-refresh + manual button UX as HomePage applies here.
  const { pull, refreshing, manualRefreshing, onManualRefresh } =
    useRefreshControls(() =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["places"] }),
        qc.invalidateQueries({ queryKey: ["couple"] }),
      ])
    );

  // Breakdown for the debug panel: how many places are on the map vs
  // how many are stuck without coordinates and why.
  const breakdown = useMemo(() => {
    const total = places?.length ?? 0;
    let onMap = 0;
    let backfillable = 0; // address present but no lat/lng — Geocoder can fix
    let noAddress = 0; // can't be located at all
    for (const p of places ?? []) {
      const hasCoords = p.latitude != null && p.longitude != null;
      const hasAddress = !!p.address && p.address.trim().length > 0;
      if (hasCoords) onMap++;
      else if (hasAddress) backfillable++;
      else noAddress++;
    }
    return { total, onMap, backfillable, noAddress };
  }, [places]);

  // Tri-state: null = asking, LatLng = resolved, "denied" = failed/denied.
  const [userLoc, setUserLoc] = useState<LatLng | "denied" | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLoc("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLoc("denied"),
      { timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  const markers = useMemo(
    () =>
      (places ?? []).filter(
        (p) => p.latitude != null && p.longitude != null
      ),
    [places]
  );

  // Pick an initial center: user location first, else markers average, else Seoul.
  const initialCenter: LatLng | null = useMemo(() => {
    if (userLoc === null) return null; // still waiting for geolocation
    if (userLoc !== "denied") return userLoc;
    if (markers.length) {
      const avgLat =
        markers.reduce((s, p) => s + (p.latitude ?? 0), 0) / markers.length;
      const avgLng =
        markers.reduce((s, p) => s + (p.longitude ?? 0), 0) / markers.length;
      return { lat: avgLat, lng: avgLng };
    }
    return DEFAULT_CENTER;
  }, [userLoc, markers]);

  const selected = markers.find((m) => m.id === selectedId);

  if (!KEY) {
    return (
      <div>
        <PageHeader title="우리의 맛집 지도 · 咱俩的美食宝藏图" />
        <div className="px-5">
          <div className="card p-4 text-sm text-ink-500">
            Google Maps API key가 설정되지 않았어요. <code>.env.local</code>의{" "}
            <code>VITE_GOOGLE_MAPS_API_KEY</code>를 채워주세요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <PageHeader
        title="우리의 맛집 지도 · 咱俩的美食宝藏图"
        right={
          <button
            type="button"
            onClick={() => void onManualRefresh()}
            disabled={manualRefreshing || refreshing}
            className="p-3 bg-cream-100/70 rounded-full text-ink-700 hover:bg-cream-200 transition border border-cream-200/50 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="refresh"
            title="새로고침 · 刷新"
          >
            <RefreshCw
              className={`w-5 h-5 ${manualRefreshing || refreshing ? "animate-spin text-rose-400" : ""}`}
            />
          </button>
        }
      />
      <div className="flex-1 mx-5 mb-4 rounded-2xl overflow-hidden card !p-0 relative">
        {/* Legend overlay — lives on top of the map */}
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow-soft border border-cream-200 text-[11px] font-bold text-ink-700 flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="inline-block text-base leading-none">📍</span>
            다녀온 곳 · 去过
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3.5 h-4 rounded-t-full bg-gradient-to-b from-peach-400 to-rose-400" />
            또 갈래 · 必须二刷
          </span>
          {couple?.home_latitude != null && couple?.home_longitude != null && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-4 rounded-t-full bg-gradient-to-b from-teal-300 to-teal-500" />
              우리집 · 我们家
            </span>
          )}
        </div>
        {/* Debug breakdown — total places vs how many made it to the map.
            Yellow when there are gaps, green when 100%. Helps diagnose
            "왜 어떤 곳은 안 떠?" at a glance. */}
        <div
          className={`absolute top-3 right-3 z-10 backdrop-blur rounded-xl px-3 py-2 shadow-soft border text-[11px] font-bold max-w-[200px] ${
            breakdown.onMap === breakdown.total && breakdown.total > 0
              ? "bg-emerald-50/95 border-emerald-200 text-emerald-700"
              : "bg-amber-50/95 border-amber-200 text-amber-700"
          }`}
        >
          <div>
            지도 · 地图{" "}
            <span className="font-number">
              {breakdown.onMap}/{breakdown.total}
            </span>
          </div>
          {breakdown.backfillable > 0 && (
            <div className="text-[10px] opacity-80 mt-0.5">
              좌표 채우는 중 · {breakdown.backfillable}곳
            </div>
          )}
          {breakdown.noAddress > 0 && (
            <div className="text-[10px] opacity-80 mt-0.5">
              주소 없음 · 无地址 {breakdown.noAddress}곳
            </div>
          )}
        </div>
        {initialCenter ? (
          <APIProvider apiKey={KEY}>
            <GeocodeBackfill places={places ?? []} />
            <Map
              mapId={MAP_ID}
              defaultCenter={initialCenter}
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI={false}
            >
              {userLoc !== "denied" && userLoc && (
                <AdvancedMarker position={userLoc} title="현재 위치 · 当前位置">
                  <div className="relative w-4 h-4">
                    <div className="absolute inset-0 bg-sky-400 rounded-full opacity-60 animate-ping" />
                    <div className="absolute inset-0 bg-sky-500 rounded-full border-2 border-white shadow-md" />
                  </div>
                </AdvancedMarker>
              )}
              {couple?.home_latitude != null &&
                couple?.home_longitude != null && (
                  <AdvancedMarker
                    position={{
                      lat: couple.home_latitude,
                      lng: couple.home_longitude,
                    }}
                    title="우리집 · 我们家"
                  >
                    <HomePin />
                  </AdvancedMarker>
                )}
              {markers.map((p) => (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.latitude!, lng: p.longitude! }}
                  onClick={() => setSelectedId(p.id)}
                  title={
                    p.is_home_cooked
                      ? `${p.name} · 집밥 · 在家做`
                      : p.want_to_revisit
                        ? `${p.name} · 또 갈래 · 想再去`
                        : p.name
                  }
                >
                  {p.is_home_cooked ? (
                    // Home-cooked entries get a small chef-hat marker so
                    // they read as "we cooked this" instead of "we went here".
                    <div className="text-2xl drop-shadow leading-none">
                      🍳
                    </div>
                  ) : p.want_to_revisit ? (
                    <RevisitPin />
                  ) : (
                    <div className="text-3xl drop-shadow">📍</div>
                  )}
                </AdvancedMarker>
              ))}
              {selected &&
                selected.latitude != null &&
                selected.longitude != null && (
                  <InfoWindow
                    position={{
                      lat: selected.latitude,
                      lng: selected.longitude,
                    }}
                    onCloseClick={() => setSelectedId(null)}
                  >
                    <Link
                      to={`/places/${selected.id}`}
                      className="block min-w-[140px]"
                    >
                      <p className="font-semibold">{selected.name}</p>
                      {selected.address && (
                        <p className="text-xs text-gray-500">
                          {selected.address}
                        </p>
                      )}
                    </Link>
                  </InfoWindow>
                )}
            </Map>
          </APIProvider>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-ink-500">
            로딩 중... · 加载中...
          </div>
        )}
      </div>
    </div>
  );
}
