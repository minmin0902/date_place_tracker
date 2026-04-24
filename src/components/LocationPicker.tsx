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
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number } | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  usePlacesAutocomplete(KEY, inputRef, open, (lat, lng) => {
    onChange({ lat, lng });
    // keep UX simple: close modal after selection
    setOpen(false);
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
                <div className="p-3">
                  <input
                    ref={inputRef}
                    className="input-base w-full"
                    placeholder={t("place.searchPlaceholder")}
                  />
                </div>
              <APIProvider apiKey={KEY}>
                <Map
                  mapId={MAP_ID}
                  defaultCenter={value ?? DEFAULT_CENTER}
                  defaultZoom={value ? 16 : 13}
                  gestureHandling="greedy"
                  disableDefaultUI
                  onClick={(e) => {
                    if (!e.detail.latLng) return;
                    onChange({
                      lat: e.detail.latLng.lat,
                      lng: e.detail.latLng.lng,
                    });
                  }}
                >
                  {value && (
                    <AdvancedMarker position={value}>
                      <div className="text-3xl">📍</div>
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
