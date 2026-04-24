import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
} from "@vis.gl/react-google-maps";
import { PageHeader } from "@/components/PageHeader";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = "date-place-map";
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // Seoul fallback

type LatLng = { lat: number; lng: number };

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

export default function MapPage() {
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        <PageHeader title="우리의 맛집 지도 · 咱俩的美食地图" />
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
      <PageHeader title="우리의 맛집 지도 · 咱俩的美食地图" />
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
        </div>
        {initialCenter ? (
          <APIProvider apiKey={KEY}>
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
              {markers.map((p) => (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.latitude!, lng: p.longitude! }}
                  onClick={() => setSelectedId(p.id)}
                  title={
                    p.want_to_revisit
                      ? `${p.name} · 또 갈래 · 想再去`
                      : p.name
                  }
                >
                  {p.want_to_revisit ? (
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
