import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

export default function MapPage() {
  const { t } = useTranslation();
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const markers = useMemo(
    () =>
      (places ?? []).filter(
        (p) => p.latitude != null && p.longitude != null
      ),
    [places]
  );

  const center = useMemo(() => {
    if (!markers.length) return DEFAULT_CENTER;
    const avgLat =
      markers.reduce((s, p) => s + (p.latitude ?? 0), 0) / markers.length;
    const avgLng =
      markers.reduce((s, p) => s + (p.longitude ?? 0), 0) / markers.length;
    return { lat: avgLat, lng: avgLng };
  }, [markers]);

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
      <div className="flex-1 mx-5 mb-4 rounded-2xl overflow-hidden card !p-0">
        <APIProvider apiKey={KEY}>
          <Map
            mapId={MAP_ID}
            defaultCenter={center}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            {markers.map((p) => (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.latitude!, lng: p.longitude! }}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="text-3xl drop-shadow">📍</div>
              </AdvancedMarker>
            ))}
            {selected && selected.latitude != null && selected.longitude != null && (
              <InfoWindow
                position={{ lat: selected.latitude, lng: selected.longitude }}
                onCloseClick={() => setSelectedId(null)}
              >
                <Link
                  to={`/places/${selected.id}`}
                  className="block min-w-[140px]"
                >
                  <p className="font-semibold">{selected.name}</p>
                  {selected.address && (
                    <p className="text-xs text-gray-500">{selected.address}</p>
                  )}
                </Link>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
