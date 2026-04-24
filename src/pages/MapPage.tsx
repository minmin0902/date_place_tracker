import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
} from "@vis.gl/react-google-maps";
import { Heart } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = "date-place-map";
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // Seoul fallback

type LatLng = { lat: number; lng: number };

export default function MapPage() {
  const { t } = useTranslation();
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
        <PageHeader title={t("nav.map")} />
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
      <PageHeader title={t("nav.map")} />
      <div className="flex-1 mx-5 mb-4 rounded-2xl overflow-hidden card !p-0 relative">
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
                >
                  {p.want_to_revisit ? (
                    <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-rose-400 border-2 border-white shadow-lg text-white">
                      <Heart className="w-5 h-5 fill-current" />
                    </div>
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
            {t("common.loading")}
          </div>
        )}
      </div>
    </div>
  );
}
