/// <reference types="google.maps" />
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useApiIsLoaded,
  useMap,
} from "@vis.gl/react-google-maps";
import { useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PullIndicator } from "@/components/PullIndicator";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces, type PlaceWithFoods } from "@/hooks/usePlaces";
import { useWishlist } from "@/hooks/useWishlist";
import { useRefreshControls } from "@/hooks/useRefreshControls";
import { useSessionState } from "@/hooks/useSessionState";
import { supabase } from "@/lib/supabase";
import type { WishlistPlace } from "@/lib/database.types";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = "date-place-map";
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // Seoul fallback

type LatLng = { lat: number; lng: number };
type MapBreakdown = {
  total: number;
  onMap: number;
  backfillable: number;
  noAddress: number;
};
type GeocodeCandidate = Pick<
  PlaceWithFoods,
  "id" | "name" | "address" | "latitude" | "longitude"
>;
type PlaceMapMarker = Pick<
  PlaceWithFoods,
  | "id"
  | "name"
  | "address"
  | "latitude"
  | "longitude"
  | "is_home_cooked"
  | "want_to_revisit"
>;
type WishlistMapMarker = Pick<
  WishlistPlace,
  "id" | "name" | "address" | "latitude" | "longitude"
>;
type HomeLocation = LatLng | null;
type MapType = "roadmap" | "satellite";
type MapFocus = "visited" | "revisit" | "wishlist" | "home";

function useStableBySignature<T>(value: T, signature: string): T {
  const ref = useRef<{ signature: string; value: T }>({ signature, value });
  if (ref.current.signature !== signature) {
    ref.current = { signature, value };
  }
  return ref.current.value;
}

function markerSignature(
  items: readonly {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    is_home_cooked?: boolean | null;
    want_to_revisit?: boolean | null;
  }[]
) {
  return items
    .map((i) =>
      [
        i.id,
        i.name,
        i.address ?? "",
        i.latitude ?? "",
        i.longitude ?? "",
        i.is_home_cooked ? "1" : "0",
        i.want_to_revisit ? "1" : "0",
      ].join("~")
    )
    .join("|");
}

function googleMapsLocale(appLanguage?: string) {
  if (appLanguage === "zh") return { language: "zh-CN", region: "CN" };
  if (appLanguage === "ko") return { language: "ko", region: "KR" };
  if (typeof navigator === "undefined") {
    return { language: "ko", region: "KR" };
  }
  const raw =
    navigator.languages?.find(Boolean) ?? navigator.language ?? "ko-KR";
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("zh")) {
    const traditional =
      normalized.includes("tw") ||
      normalized.includes("hk") ||
      normalized.includes("mo") ||
      normalized.includes("hant");
    return {
      language: traditional ? "zh-TW" : "zh-CN",
      region: traditional ? "TW" : "CN",
    };
  }
  if (normalized.startsWith("ko")) return { language: "ko", region: "KR" };
  if (normalized.startsWith("ja")) return { language: "ja", region: "JP" };
  const [language, region] = raw.split("-");
  return {
    language: language || "en",
    region: region?.toUpperCase() || "US",
  };
}

// House-shaped pin for the couple's home address. Stands out from the
// food markers via a different gradient + roof silhouette so users can
// orient relative to home at a glance.
// Mini variants — same path data as the full pins below, just sized
// down so they match the in-map markers 1:1 inside the legend chip.
function HomePinMini() {
  return (
    <svg
      width="14"
      height="17"
      viewBox="0 0 38 46"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="homePinFillMini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DD3C0" />
          <stop offset="1" stopColor="#3EB7A0" />
        </linearGradient>
      </defs>
      <path
        d="M19 0 C9 0 1 8 1 18 C1 29 14 38 18 45 C18.4 45.7 19.6 45.7 20 45 C24 38 37 29 37 18 C37 8 29 0 19 0 Z"
        fill="url(#homePinFillMini)"
        stroke="white"
        strokeWidth="2"
      />
      <path d="M19 8 L11 16 L11 24 L27 24 L27 16 Z" fill="white" />
      <rect x="17" y="18" width="4" height="6" fill="#3EB7A0" />
    </svg>
  );
}

function RevisitPinMini() {
  return (
    <svg
      width="13"
      height="17"
      viewBox="0 0 34 44"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="revisitPinFillMini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F89570" />
          <stop offset="1" stopColor="#E47C88" />
        </linearGradient>
      </defs>
      <path
        d="M17 0 C8 0 1 7 1 16 C1 26 12 35 16 42 C16.4 42.7 17.6 42.7 18 42 C22 35 33 26 33 16 C33 7 26 0 17 0 Z"
        fill="url(#revisitPinFillMini)"
        stroke="white"
        strokeWidth="2"
      />
      <path
        d="M17 24 C14.5 21.5 10 19 10 14.5 C10 12 12 10 14.3 10 C15.6 10 16.5 10.6 17 11.4 C17.5 10.6 18.4 10 19.7 10 C22 10 24 12 24 14.5 C24 19 19.5 21.5 17 24 Z"
        fill="white"
      />
    </svg>
  );
}

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

// Wishlist pin — same teardrop silhouette as the place pins so the
// map reads as a single visual family, but amber/gold gradient + a
// bookmark glyph differentiates "곳 가고싶다" from "곳 갔다 / 또 갈래"
// at a glance.
function WishlistPinMini() {
  return (
    <svg
      width="13"
      height="17"
      viewBox="0 0 34 44"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="wishlistPinFillMini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBBF24" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path
        d="M17 0 C8 0 1 7 1 16 C1 26 12 35 16 42 C16.4 42.7 17.6 42.7 18 42 C22 35 33 26 33 16 C33 7 26 0 17 0 Z"
        fill="url(#wishlistPinFillMini)"
        stroke="white"
        strokeWidth="2"
      />
      <path
        d="M12 9 L22 9 L22 22 L17 19 L12 22 Z"
        fill="white"
      />
    </svg>
  );
}

function WishlistPin() {
  return (
    <div className="relative -translate-y-1 drop-shadow-md">
      <svg
        width="34"
        height="44"
        viewBox="0 0 34 44"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="wishlist pin"
      >
        <defs>
          <linearGradient id="wishlistPinFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FBBF24" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <path
          d="M17 0 C8 0 1 7 1 16 C1 26 12 35 16 42 C16.4 42.7 17.6 42.7 18 42 C22 35 33 26 33 16 C33 7 26 0 17 0 Z"
          fill="url(#wishlistPinFill)"
          stroke="white"
          strokeWidth="2"
        />
        <path
          d="M12 9 L22 9 L22 22 L17 19 L12 22 Z"
          fill="white"
        />
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
function GeocodeBackfill({ places }: { places: GeocodeCandidate[] }) {
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

const MapRefreshControls = memo(function MapRefreshControls({
  breakdown,
  refreshAll,
}: {
  breakdown: MapBreakdown;
  refreshAll: () => Promise<unknown>;
}) {
  const {
    pull,
    refreshing,
    manualRefreshing,
    released,
    justFinished,
    onManualRefresh,
  } = useRefreshControls(refreshAll);

  return (
    <>
      <PullIndicator
        pull={pull}
        refreshing={refreshing}
        released={released}
        justFinished={justFinished}
      />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* MAP N/N counter rides up here (instead of below the
            legend) so the legend row owns its full width and can
            fit 다녀온/또 갈래/우리집 without truncating on a
            360px phone. */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1.5 border text-[10px] font-bold flex-shrink-0 ${
            breakdown.onMap === breakdown.total && breakdown.total > 0
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
        >
          <span className="tracking-wider">MAP</span>
          <span className="font-number">
            {breakdown.onMap}/{breakdown.total}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void onManualRefresh()}
          disabled={manualRefreshing || refreshing}
          className={`smooth-touch p-3 rounded-full border ${
            justFinished
              ? "bg-sage-100/70 border-sage-200 text-sage-400"
              : "bg-cream-100/70 border-cream-200/50 text-ink-700 hover:bg-cream-200"
          }`}
          aria-label="refresh"
          title="새로고침 · 刷新"
        >
          {justFinished ? (
            <Check className="w-5 h-5 animate-fade" />
          ) : (
            <RefreshCw
              className={`w-5 h-5 ${
                manualRefreshing || refreshing ? "animate-spin text-rose-400" : ""
              }`}
            />
          )}
        </button>
      </div>
    </>
  );
});

function MapLegendItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`smooth-touch inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold leading-none transition ${
        active
          ? "bg-peach-100 text-peach-700 shadow-sm"
          : "bg-cream-50/80 text-ink-700 hover:bg-cream-100"
      }`}
      aria-pressed={active}
    >
      <span className="grid h-5 w-5 flex-shrink-0 place-items-center leading-none">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function MapViewportController({
  focus,
  markers,
  wishlistMarkers,
  homeLocation,
}: {
  focus: MapFocus | null;
  markers: PlaceMapMarker[];
  wishlistMarkers: WishlistMapMarker[];
  homeLocation: HomeLocation;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focus) return;
    const positions: LatLng[] = (() => {
      if (focus === "visited") {
        return markers
          .filter((m) => !m.want_to_revisit && !m.is_home_cooked)
          .map((m) => ({ lat: m.latitude!, lng: m.longitude! }));
      }
      if (focus === "revisit") {
        return markers
          .filter((m) => m.want_to_revisit)
          .map((m) => ({ lat: m.latitude!, lng: m.longitude! }));
      }
      if (focus === "wishlist") {
        return wishlistMarkers.map((m) => ({
          lat: m.latitude!,
          lng: m.longitude!,
        }));
      }
      const homeCooked = markers
        .filter((m) => m.is_home_cooked)
        .map((m) => ({ lat: m.latitude!, lng: m.longitude! }));
      return homeLocation ? [homeLocation, ...homeCooked] : homeCooked;
    })();
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.panTo(positions[0]);
      map.setZoom(Math.max(map.getZoom() ?? 14, 15));
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of positions) bounds.extend(p);
    map.fitBounds(bounds, {
      top: 72,
      right: 48,
      bottom: 72,
      left: 48,
    });
  }, [focus, homeLocation, map, markers, wishlistMarkers]);

  return null;
}

export default function MapPage() {
  const { i18n } = useTranslation();
  const { data: couple } = useCouple();
  const qc = useQueryClient();
  const { data: places } = usePlaces(couple?.id);
  const { data: wishlist } = useWishlist(couple?.id);
  const mapsLocale = useMemo(
    () => googleMapsLocale(i18n.language),
    [i18n.language]
  );
  const mapTypeLabels = useMemo(() => {
    if (mapsLocale.language.startsWith("zh")) {
      return { roadmap: "地图", satellite: "卫星" };
    }
    if (mapsLocale.language.startsWith("ko")) {
      return { roadmap: "지도", satellite: "위성" };
    }
    if (mapsLocale.language.startsWith("ja")) {
      return { roadmap: "地図", satellite: "航空写真" };
    }
    return { roadmap: "Map", satellite: "Satellite" };
  }, [mapsLocale.language]);
  // selectedId can identify either a place ("place:<id>") or a
  // wishlist entry ("wish:<id>") so the InfoWindow knows which dataset
  // to look up. Plain id was unambiguous when only places existed.
  const [selectedId, setSelectedId] = useSessionState<string | null>(
    "route-ui:map:selected:v1",
    null
  );
  const [mapType, setMapType] = useSessionState<MapType>(
    "route-ui:map:type:v1",
    "roadmap"
  );
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  // Tri-state: null = asking, LatLng = resolved, "denied" = failed/denied.
  const [userLoc, setUserLoc] = useState<LatLng | "denied" | null>(null);
  const refreshLocation = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!navigator.geolocation) {
          setUserLoc("denied");
          resolve();
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLoc({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            resolve();
          },
          () => {
            setUserLoc("denied");
            resolve();
          },
          { timeout: 4000, maximumAge: 30_000 }
        );
      }),
    []
  );
  const refreshAll = useCallback(() => {
    const opts = { refetchType: "active" as const };
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["places"], ...opts }),
      qc.invalidateQueries({ queryKey: ["wishlist"], ...opts }),
      qc.invalidateQueries({ queryKey: ["couple"], ...opts }),
    ]);
  }, [qc]);

  // Breakdown for the debug panel: how many places are on the map vs
  // how many are stuck without coordinates and why.
  const rawBreakdown = useMemo(() => {
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
  const breakdown = useStableBySignature(
    rawBreakdown,
    `${rawBreakdown.total}|${rawBreakdown.onMap}|${rawBreakdown.backfillable}|${rawBreakdown.noAddress}`
  );

  useEffect(() => {
    void refreshLocation();
  }, [refreshLocation]);

  const geocodeCandidatesRaw = useMemo<GeocodeCandidate[]>(
    () =>
      (places ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    [places]
  );
  const geocodeCandidates = useStableBySignature(
    geocodeCandidatesRaw,
    markerSignature(geocodeCandidatesRaw)
  );

  const rawMarkers = useMemo<PlaceMapMarker[]>(
    () =>
      (places ?? [])
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          is_home_cooked: p.is_home_cooked,
          want_to_revisit: p.want_to_revisit,
        })),
    [places]
  );
  const markers = useStableBySignature(
    rawMarkers,
    markerSignature(rawMarkers)
  );

  // Wishlist markers — only restaurant-kind entries with coords. Recipe
  // wishlist items are location-less by definition (kind === 'recipe'
  // doesn't carry latitude/longitude), so they're filtered out by the
  // coord check anyway, but explicit `kind` filter keeps the count
  // meaningful when we later add other kinds.
  const rawWishlistMarkers = useMemo<WishlistMapMarker[]>(
    () =>
      (wishlist ?? [])
        .filter(
          (w) =>
            w.kind !== "recipe" &&
            w.latitude != null &&
            w.longitude != null
        )
        .map((w) => ({
          id: w.id,
          name: w.name,
          address: w.address,
          latitude: w.latitude,
          longitude: w.longitude,
        })),
    [wishlist]
  );
  const wishlistMarkers = useStableBySignature(
    rawWishlistMarkers,
    markerSignature(rawWishlistMarkers)
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

  // selectedId is namespaced (place: / wish:) so the same numeric id
  // colliding across the two datasets doesn't pick the wrong card.
  const selectedPlace = selectedId?.startsWith("place:")
    ? markers.find((m) => `place:${m.id}` === selectedId) ?? null
    : null;
  const selectedWish = selectedId?.startsWith("wish:")
    ? wishlistMarkers.find((w) => `wish:${w.id}` === selectedId) ?? null
    : null;
  const homeLocation = useMemo<HomeLocation>(
    () =>
      couple?.home_latitude != null && couple?.home_longitude != null
        ? {
            lat: couple.home_latitude,
            lng: couple.home_longitude,
          }
        : null,
    [couple?.home_latitude, couple?.home_longitude]
  );

  const mapCanvas = useMemo(() => {
    if (!KEY) return null;
    if (!initialCenter) {
      return (
        <div className="h-full flex items-center justify-center text-sm text-ink-500">
          로딩 중... · 加载中...
        </div>
      );
    }
    return (
      <APIProvider
        apiKey={KEY}
        language={mapsLocale.language}
        region={mapsLocale.region}
      >
        <GeocodeBackfill places={geocodeCandidates} />
        <Map
          mapId={MAP_ID}
          defaultCenter={initialCenter}
          defaultZoom={14}
          gestureHandling="greedy"
          // Now that the legend + counter graduated out of the
          // map canvas, Google's default top-right controls
          // (mapType / camera-tilt / rotate) have empty corner
          // space again — keep them ON so users can flip 2D/3D.
          // Fullscreen + keyboard-shortcut links stay off because
          // they're not useful here and the keyboard-shortcuts
          // link in particular bloats the bottom chrome.
          disableDefaultUI={false}
          controlSize={24}
          reuseMaps
          mapTypeControl={false}
          mapTypeId={mapType}
          fullscreenControl={false}
          keyboardShortcuts={false}
        >
          <MapViewportController
            focus={mapFocus}
            markers={markers}
            wishlistMarkers={wishlistMarkers}
            homeLocation={homeLocation}
          />
          {userLoc !== "denied" && userLoc && (
            <AdvancedMarker position={userLoc} title="현재 위치 · 当前位置">
              <div className="relative w-4 h-4">
                <div className="absolute inset-0 bg-sky-400 rounded-full opacity-60 animate-ping" />
                <div className="absolute inset-0 bg-sky-500 rounded-full border-2 border-white shadow-md" />
              </div>
            </AdvancedMarker>
          )}
          {homeLocation && (
            <AdvancedMarker position={homeLocation} title="우리집 · 我们家">
              <HomePin />
            </AdvancedMarker>
          )}
          {markers.map((p) => (
            <AdvancedMarker
              key={`place-${p.id}`}
              position={{ lat: p.latitude!, lng: p.longitude! }}
              onClick={() => setSelectedId(`place:${p.id}`)}
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
                <div className="text-2xl drop-shadow leading-none">🍳</div>
              ) : p.want_to_revisit ? (
                <RevisitPin />
              ) : (
                <div className="text-3xl drop-shadow">📍</div>
              )}
            </AdvancedMarker>
          ))}
          {wishlistMarkers.map((w) => (
            <AdvancedMarker
              key={`wish-${w.id}`}
              position={{ lat: w.latitude!, lng: w.longitude! }}
              onClick={() => setSelectedId(`wish:${w.id}`)}
              title={`${w.name} · 가고싶다 · 想去`}
            >
              <WishlistPin />
            </AdvancedMarker>
          ))}
          {selectedPlace &&
            selectedPlace.latitude != null &&
            selectedPlace.longitude != null && (
              <InfoWindow
                position={{
                  lat: selectedPlace.latitude,
                  lng: selectedPlace.longitude,
                }}
                onCloseClick={() => setSelectedId(null)}
              >
                <Link
                  to={`/places/${selectedPlace.id}`}
                  className="block min-w-[140px]"
                >
                  <p className="font-semibold">{selectedPlace.name}</p>
                  {selectedPlace.address && (
                    <p className="text-xs text-gray-500">
                      {selectedPlace.address}
                    </p>
                  )}
                </Link>
              </InfoWindow>
            )}
          {selectedWish &&
            selectedWish.latitude != null &&
            selectedWish.longitude != null && (
              <InfoWindow
                position={{
                  lat: selectedWish.latitude,
                  lng: selectedWish.longitude,
                }}
                onCloseClick={() => setSelectedId(null)}
              >
                <Link to="/?tab=wishlist" className="block min-w-[140px]">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span className="text-amber-600 text-[10px] font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      가고싶다
                    </span>
                    {selectedWish.name}
                  </p>
                  {selectedWish.address && (
                    <p className="text-xs text-gray-500">
                      {selectedWish.address}
                    </p>
                  )}
                </Link>
              </InfoWindow>
            )}
        </Map>
      </APIProvider>
    );
  }, [
    geocodeCandidates,
    homeLocation,
    initialCenter,
    markers,
    mapsLocale.language,
    mapsLocale.region,
    mapType,
    mapFocus,
    selectedPlace,
    selectedWish,
    userLoc,
    wishlistMarkers,
  ]);

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
    <div
      className="flex flex-col min-h-0 overflow-hidden"
      style={{
        height: "calc(100dvh - env(safe-area-inset-bottom, 0px) - 5.5rem)",
      }}
    >
      <PageHeader
        title="우리의 맛집 지도 · 咱俩的美食宝藏图"
        right={
          <MapRefreshControls breakdown={breakdown} refreshAll={refreshAll} />
        }
      />
      {/* Legend chip — Chinese-only labels, equal item sizing, and a
          fixed icon box so the text + marker glyphs read as one unit. */}
      <div className="px-5 mb-2 flex-shrink-0">
        <div className="flex w-full items-center gap-1.5 overflow-hidden rounded-xl border border-cream-200 bg-white p-1.5 shadow-soft whitespace-nowrap">
          <MapLegendItem
            icon={<span className="text-[14px] leading-none">📍</span>}
            label="去过"
            active={mapFocus === "visited"}
            onClick={() =>
              setMapFocus((cur) => (cur === "visited" ? null : "visited"))
            }
          />
          <MapLegendItem
            icon={<RevisitPinMini />}
            label="二刷"
            active={mapFocus === "revisit"}
            onClick={() =>
              setMapFocus((cur) => (cur === "revisit" ? null : "revisit"))
            }
          />
          {wishlistMarkers.length > 0 && (
            <MapLegendItem
              icon={<WishlistPinMini />}
              label="想去"
              active={mapFocus === "wishlist"}
              onClick={() =>
                setMapFocus((cur) =>
                  cur === "wishlist" ? null : "wishlist"
                )
              }
            />
          )}
          {couple?.home_latitude != null && couple?.home_longitude != null && (
            <MapLegendItem
              icon={<HomePinMini />}
              label="我家"
              active={mapFocus === "home"}
              onClick={() =>
                setMapFocus((cur) => (cur === "home" ? null : "home"))
              }
            />
          )}
        </div>
      </div>
      {(breakdown.backfillable > 0 || breakdown.noAddress > 0) && (
        <div className="px-5 mb-2 flex flex-wrap flex-shrink-0 gap-x-3 gap-y-0.5 text-[10px] font-bold text-amber-700 break-keep">
          {breakdown.backfillable > 0 && (
            <span>补坐标中 {breakdown.backfillable}处</span>
          )}
          {breakdown.noAddress > 0 && (
            <span>无地址 {breakdown.noAddress}处</span>
          )}
        </div>
      )}

      <div
        className="flex-1 min-h-0 mx-5 mb-4 rounded-2xl overflow-hidden card !p-0 relative"
        data-no-pull-refresh
      >
        <div className="absolute top-3 left-3 z-10 inline-flex overflow-hidden rounded-xl bg-white border border-cream-200 shadow-soft">
          <button
            type="button"
            onClick={() => setMapType("roadmap")}
            className={`px-3 py-2 text-[12px] font-bold transition ${
              mapType === "roadmap"
                ? "bg-white text-ink-900"
                : "bg-cream-50 text-ink-500"
            }`}
          >
            {mapTypeLabels.roadmap}
          </button>
          <button
            type="button"
            onClick={() => setMapType("satellite")}
            className={`px-3 py-2 text-[12px] font-bold transition border-l border-cream-200 ${
              mapType === "satellite"
                ? "bg-white text-ink-900"
                : "bg-cream-50 text-ink-500"
            }`}
          >
            {mapTypeLabels.satellite}
          </button>
        </div>
        {mapCanvas}
      </div>
    </div>
  );
}
