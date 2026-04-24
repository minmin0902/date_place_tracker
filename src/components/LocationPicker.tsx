import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { useTranslation } from "react-i18next";
import { MapPin, X } from "lucide-react";
import { Loader } from "@googlemaps/js-api-loader";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = "date-place-map";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

export function LocationPicker({
  value,
  onChange,
  onPlaceSelected,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number } | null) => void;
  onPlaceSelected?: (p: { name?: string; address?: string; lat: number; lng: number }) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    value ?? null
  );
  const [mapZoom, setMapZoom] = useState<number>(value ? 16 : 13);
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  // loading indicator kept for future UX improvements
  const [, setLoadingPred] = useState(false);
  const predRef = useRef<any[]>([]);
  const debounceRef = useRef<number | null>(null);
  
  async function fetchPredictions(q: string) {
    if (!KEY) return;
    if (!q) {
      setPredictions([]);
      return;
    }
    setLoadingPred(true);
    const preds = await fetchPredictionsWithLoader(KEY, q);
    predRef.current = preds || [];
    setPredictions(predRef.current as any[]);
    setLoadingPred(false);
  }

  async function selectPrediction(pred: any) {
    // get details
    try {
      const details = await getPlaceDetails(KEY!, pred.place_id);
      const loc = details.geometry?.location;
      if (loc) {
        const lat = loc.lat();
        const lng = loc.lng();
        setMapCenter({ lat, lng });
        setMapZoom(16);
        setQuery(details.name || details.formatted_address || "");
        setPredictions([]);
        onChange({ lat, lng });
        if (onPlaceSelected) {
          onPlaceSelected({
            name: details.name,
            address: details.formatted_address,
            lat,
            lng,
          });
        }
      }
    } catch (e) {
      // ignore
    }
  }

  usePlacesAutocomplete(KEY, inputRef, open, (lat, lng) => {
    // pan map to selected place and set zoom
    setMapCenter({ lat, lng });
    setMapZoom(16);
    onChange({ lat, lng });
    // close modal shortly after to show the result
    setTimeout(() => setOpen(false), 300);
  });

  if (!KEY) {
    return (
      <div className="card p-4 text-sm text-ink-500">
        Google Maps API key가 설정되지 않았어요. <code>.env.local</code>의{" "}
        <code>VITE_GOOGLE_MAPS_API_KEY</code>를 채워주세요.
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card p-4 flex items-center gap-3 w-full text-left"
      >
        <MapPin className="w-5 h-5 text-peach-400" />
        <div className="flex-1">
          {value ? (
            <div>
              <p className="text-sm font-medium">
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
              </p>
              <p className="text-xs text-ink-500">{t("place.pickOnMap")}</p>
            </div>
          ) : (
            <p className="text-sm text-ink-500">{t("place.pickOnMap")}</p>
          )}
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-md h-[75vh] sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-cream-200">
              <span className="font-medium">{t("place.pickOnMap")}</span>
              <button onClick={() => setOpen(false)} className="btn-ghost !p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 relative">
                <div className="p-3 relative">
                  <input
                    ref={inputRef}
                    className="input-base w-full"
                    placeholder={t("place.searchPlaceholder")}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      // debounce predictions
                      if (debounceRef.current) window.clearTimeout(debounceRef.current);
                      debounceRef.current = window.setTimeout(() => {
                        fetchPredictions(e.target.value);
                      }, 250);
                    }}
                  />
                  {predictions.length > 0 && (
                    <div className="pac-container absolute left-3 right-3 mt-2">
                      {predictions.map((p, i) => (
                        <div
                          key={p.place_id || i}
                          className="pac-item cursor-pointer"
                          onClick={() => selectPrediction(p)}
                        >
                          <div className="font-semibold">{p.structured_formatting?.main_text || p.description}</div>
                          <div className="text-xs text-ink-500">{p.structured_formatting?.secondary_text || ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              <APIProvider apiKey={KEY}>
                <Map
                  key={open ? "map-open" : "map-closed"}
                  className="h-full w-full"
                  mapId={MAP_ID}
                  center={mapCenter ?? DEFAULT_CENTER}
                  zoom={mapZoom}
                  gestureHandling="greedy"
                  disableDefaultUI
                  onClick={(e) => {
                    if (!e.detail.latLng) return;
                    const lat = e.detail.latLng.lat;
                    const lng = e.detail.latLng.lng;
                    setMapCenter({ lat, lng });
                    onChange({ lat, lng });
                  }}
                >
                  {mapCenter && (
                    <AdvancedMarker position={mapCenter}>
                      <div className={`text-3xl animate-bounce`}>📍</div>
                    </AdvancedMarker>
                  )}
                </Map>
              </APIProvider>
            </div>
            <div className="p-3 border-t border-cream-200 flex gap-2">
              {value && (
                <button
                  type="button"
                  className="btn-ghost flex-1"
                  onClick={() => onChange(null)}
                >
                  {t("common.delete")}
                </button>
              )}
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => setOpen(false)}
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// load Places Autocomplete when modal opens
function usePlacesAutocomplete(
  key: string | undefined,
  inputRef: React.RefObject<HTMLInputElement | null>,
  enabled: boolean,
  onSelect: (lat: number, lng: number) => void
) {
  useEffect(() => {
    if (!enabled) return;
    if (!key) return;
    if (!inputRef.current) return;
    const loader: any = new Loader({ apiKey: key, libraries: ["places"] });
    let ac: any = null;
    let mounted = true;
    (loader as any).load().then(() => {
      if (!mounted || !inputRef.current) return;
      ac = new (window as any).google.maps.places.Autocomplete(inputRef.current, {
        fields: ["geometry", "name", "formatted_address", "place_id"],
      });
      ac.addListener("place_changed", () => {
        const place = ac?.getPlace();
        const loc = place?.geometry?.location;
        if (loc) onSelect(loc.lat(), loc.lng());
      });
    }).catch(() => {
      // loader failed; do nothing
    });
    return () => {
      mounted = false;
    };
  }, [key, inputRef, enabled, onSelect]);
}

// fetch predictions (custom UI) and place details
async function fetchPredictionsWithLoader(key: string, input: string) {
  if (!input) return [];
  const loader: any = new Loader({ apiKey: key, libraries: ["places"] });
  try {
    await (loader as any).load();
    const service = new (window as any).google.maps.places.AutocompleteService();
    return new Promise<any[]>((resolve) => {
      service.getPlacePredictions({ input }, (preds: any[], status: any) => {
        if (status !== (window as any).google.maps.places.PlacesServiceStatus.OK) {
          resolve([]);
        } else {
          resolve(preds || []);
        }
      });
    });
  } catch (e) {
    return [];
  }
}

async function getPlaceDetails(key: string, placeId: string) {
  const loader: any = new Loader({ apiKey: key, libraries: ["places"] });
  await (loader as any).load();
  const dummy = document.createElement("div");
  const svc = new (window as any).google.maps.places.PlacesService(dummy);
  return new Promise<any>((resolve, reject) => {
    svc.getDetails({ placeId, fields: ["geometry", "name", "formatted_address"] }, (res: any, status: any) => {
      if (status === (window as any).google.maps.places.PlacesServiceStatus.OK) resolve(res);
      else reject(res);
    });
  });
}

// expose small helper functions into module scope for use in component
// to avoid changing hook signatures
