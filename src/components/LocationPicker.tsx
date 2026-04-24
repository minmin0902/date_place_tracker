import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, X, Search } from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export type PickedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

// js-api-loader v2 uses a functional API: call setOptions() once, then
// importLibrary() per library. The SDK memoizes loads internally, so we just
// need to guard our setOptions() call and surface any rejection so retries work.
let optionsSet = false;
let placesPromise: Promise<any> | null = null;
function ensurePlacesLoaded(key: string): Promise<any> {
  if (!optionsSet) {
    setOptions({ key });
    optionsSet = true;
  }
  if (!placesPromise) {
    placesPromise = (importLibrary("places") as Promise<any>).catch((e) => {
      placesPromise = null;
      throw e;
    });
  }
  return placesPromise;
}

export function LocationPicker({
  value,
  label,
  onChange,
  onPlaceSelected,
}: {
  value: { lat: number; lng: number; name?: string; address?: string } | null;
  label?: string | null;
  onChange: (v: { lat: number; lng: number } | null) => void;
  onPlaceSelected?: (p: PickedPlace) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Using the legacy AutocompleteService + PlacesService. The new v1 Places
  // API (AutocompleteSuggestion.fetchAutocompleteSuggestions) requires the
  // separately-enabled "Places API (New)" product in Cloud Console, which
  // most existing keys don't have. The legacy calls still work and Google has
  // promised ≥12 months notice before discontinuing them.
  async function runSearch(q: string) {
    if (!KEY) return;
    if (!q.trim()) {
      setPredictions([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await ensurePlacesLoaded(KEY);
      const g = (window as any).google;
      if (!g?.maps?.places?.AutocompleteService) {
        throw new Error("google.maps.places unavailable after load");
      }
      const service = new g.maps.places.AutocompleteService();
      const { preds, status } = await new Promise<{
        preds: any[];
        status: string;
      }>((resolve) => {
        service.getPlacePredictions(
          { input: q },
          (r: any[], s: string) => resolve({ preds: r || [], status: s })
        );
      });
      const OK = g.maps.places.PlacesServiceStatus.OK;
      const ZERO = g.maps.places.PlacesServiceStatus.ZERO_RESULTS;
      if (status !== OK && status !== ZERO) {
        console.error("[LocationPicker] autocomplete status:", status);
        setError(`Places API: ${status}`);
        setPredictions([]);
      } else {
        setPredictions(preds);
        setOpen(true);
      }
    } catch (e) {
      console.error("[LocationPicker] search failed:", e);
      setError(e instanceof Error ? e.message : String(e));
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }

  async function pick(pred: any) {
    if (!KEY) return;
    try {
      await ensurePlacesLoaded(KEY);
      const g = (window as any).google;
      const dummy = document.createElement("div");
      const svc = new g.maps.places.PlacesService(dummy);
      svc.getDetails(
        {
          placeId: pred.place_id,
          fields: ["geometry", "name", "formatted_address"],
        },
        (res: any, status: any) => {
          const OK = g.maps.places.PlacesServiceStatus.OK;
          if (status !== OK || !res?.geometry?.location) {
            console.error("[LocationPicker] details status:", status);
            setError(`Places API: ${status}`);
            return;
          }
          const lat = res.geometry.location.lat();
          const lng = res.geometry.location.lng();
          onChange({ lat, lng });
          onPlaceSelected?.({
            name: res.name || "",
            address: res.formatted_address || "",
            lat,
            lng,
          });
          setQuery("");
          setPredictions([]);
          setOpen(false);
        }
      );
    } catch (e) {
      console.error("[LocationPicker] pick failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setPredictions([]);
  }

  if (!KEY) {
    return (
      <div className="card p-4 text-sm text-ink-500">
        Google Maps API key가 설정되지 않았어요. <code>.env.local</code>의{" "}
        <code>VITE_GOOGLE_MAPS_API_KEY</code>를 채워주세요.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        <div className="card p-4 flex items-start gap-3">
          <MapPin className="w-5 h-5 text-peach-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            {label ? (
              <p className="text-sm font-medium truncate">{label}</p>
            ) : (
              <p className="text-sm font-medium font-number">
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
              </p>
            )}
            <p className="text-xs text-ink-500 font-number">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="btn-ghost !p-2"
            aria-label="clear"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-ink-300 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              className="input-base pl-10"
              value={query}
              placeholder={t("place.searchPlaceholder")}
              onFocus={() => predictions.length > 0 && setOpen(true)}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                if (debounceRef.current) window.clearTimeout(debounceRef.current);
                debounceRef.current = window.setTimeout(() => runSearch(v), 250);
              }}
            />
          </div>
          {(open && (predictions.length > 0 || loading)) || error ? (
            <div className="absolute left-0 right-0 mt-2 z-40 bg-white rounded-xl border border-cream-200 shadow-lg overflow-hidden">
              {error && (
                <div className="p-3 text-sm text-rose-500 break-words">
                  {error}
                </div>
              )}
              {loading && predictions.length === 0 && !error && (
                <div className="p-3 text-sm text-ink-500">{t("common.loading")}</div>
              )}
              {predictions.map((p, i) => (
                <button
                  type="button"
                  key={p.place_id ?? i}
                  onClick={() => pick(p)}
                  className="w-full text-left px-4 py-3 hover:bg-cream-50 border-b border-cream-100 last:border-b-0"
                >
                  <div className="font-medium text-sm truncate">
                    {p.structured_formatting?.main_text || p.description}
                  </div>
                  <div className="text-xs text-ink-500 truncate">
                    {p.structured_formatting?.secondary_text || ""}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
