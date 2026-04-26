import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRefreshControls } from "@/hooks/useRefreshControls";
import { useGlobalRefresh } from "@/hooks/useGlobalRefresh";
import { PullIndicator } from "@/components/PullIndicator";
import {
  BookmarkPlus,
  Check,
  CheckCircle2,
  Dice5,
  Grid3x3,
  Heart,
  List,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { useCoupleProfiles } from "@/hooks/useProfile";
import {
  usePlaces,
  type PlaceWithFoods,
} from "@/hooks/usePlaces";
import {
  useDeleteWishlist,
  useWishlist,
} from "@/hooks/useWishlist";
import type { WishlistPlace } from "@/lib/database.types";
import {
  CATEGORY_GROUPS,
  categoryEmojiOf,
  isKnownPlaceCategory,
} from "@/lib/constants";
import { FilterSheet, type SortValue } from "@/components/FilterSheet";
import {
  GroupedMultiSelect,
  type GroupedMultiSelectEntry,
} from "@/components/GroupedMultiSelect";
import { MediaThumb } from "@/components/MediaThumb";
import { MemoCommentInline } from "@/components/MemoComment";
import { NotificationBell } from "@/components/NotificationBell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useVisualViewport } from "@/hooks/useVisualViewportHeight";
import { formatDate, getCategories, ratingsForViewer } from "@/lib/utils";

type Tab = "timeline" | "wishlist";
// Sort modes only — "도시별" used to live here as a 5th option but
// graduated into the unified FilterSheet's standalone city section so
// this picker stays a clean "pick one of four orderings".
type ViewMode = SortValue;
// Type filter — works alongside ViewMode so users can combine
// "집밥만 보기" with "별점 높은순".
type DiningFilter = "all" | "out" | "home";

// Mutually-exclusive chip group above the 식사 모드 segments. Tapping
// a chip raises its filter; tapping the active chip clears (back to
// "none"). Replaces four independent boolean toggles so the row never
// shows more than one filter active.
type ListFilter =
  | "none"
  | "revisit"
  | "unrated"
  | "myOnly"
  | "partnerOnly";
// Visual layout for the timeline list. "list" is the original timeline
// card; "grid" is a 2-col photo-first feed. Independent from ViewMode.
// "menu" added so users can flip the timeline from "list of restaurants"
// to "list of menu items I rated" — same place-level filters apply,
// but the row is one card per food instead of per place.
type ListLayout = "list" | "grid" | "menu";

// Persist filter state across navigation in this tab session — so
// "내 별점 안 줬어요" + "외식" + "별점 높은순" is preserved when the
// user dives into a place to rate, then comes back via the bottom tab
// or the browser back button.
const FILTER_STORAGE_KEY = "homepage:filters:v1";

type StoredFilters = {
  tab?: Tab;
  // Legacy independent toggles (v1) — kept on the type so old saved
  // sessions can be migrated on read into the new unified listFilter.
  revisitOnly?: boolean;
  unratedOnly?: boolean;
  myOnlyEaten?: boolean;
  partnerOnlyEaten?: boolean;
  // v2: mutually exclusive single-pick chip group (또갈래 / 평가 안한
  // 메뉴 / 나만 먹음 / 짝꿍만 먹음). Default = "none".
  listFilter?: ListFilter;
  diningFilter?: DiningFilter;
  // string (not ViewMode) so legacy sessions with a now-removed
  // value like "city" don't widen the live ViewMode union.
  viewMode?: string;
  // v1 used a single string for category — kept here so old saved
  // sessions can be migrated on read. v2 switched to a string[] so
  // users can multi-select groups (e.g. tap "🌏 아시안" → all 6
  // children selected at once).
  categoryFilter?: string;
  categoryFilters?: string[];
  // v1: single string. v2: array. We migrate v1 transparently on read.
  selectedCity?: string | null;
  selectedCities?: string[];
  query?: string;
  showSearch?: boolean;
  listLayout?: ListLayout;
};

function loadFilters(): StoredFilters {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredFilters) : {};
  } catch {
    return {};
  }
}

function saveFilters(filters: StoredFilters) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // sessionStorage can throw if quota is exceeded or in private mode
    // — silently swallow. Filter persistence is a nice-to-have.
  }
}

// Extract a clean city label from a freeform address. Strips country,
// state+zip, bare state abbreviations, and street-address-looking tails
// so we get "Providence" instead of "214 Wickenden St" or "RI".

// Country names in several locales — Google Places localizes the last
// segment based on the viewer's language ("…, USA" / "…, 미국" / "…美国").
// Some locales even glue the country onto the zip token without a
// delimiter ("RI 02906美国"), which is why this pattern is used to
// strip a trailing country from *within* a token, not just as a whole.
const COUNTRY_SUFFIX =
  /\s*(USA|U\.S\.A\.?|US|United States|UK|United Kingdom|Korea|Republic of Korea|South Korea|Canada|Japan|China|Taiwan|Hong Kong|HK|미국|일본|한국|중국|대만|홍콩|영국|캐나다|美国|日本|韩国|韓国|中国|台湾|台灣|香港|英国|英國|加拿大)$/i;
// Whole-token country match (legacy/simple case).
const COUNTRY_TOKENS =
  /^(USA|U\.S\.A\.?|US|United States|UK|United Kingdom|Korea|Republic of Korea|South Korea|Canada|Japan|China|Taiwan|Hong Kong|HK|미국|일본|한국|중국|대만|홍콩|영국|캐나다|美国|日本|韩国|韓国|中国|台湾|台灣|香港|英国|英國|加拿大)$/i;
// "NY 11377", "CA 94103-1234", or a lone zip/postcode.
const STATE_ZIP =
  /^(?:[A-Z]{2}\s+)?\d{4,6}(?:-\d{3,4})?$|^[A-Z]{2}\s+\d{4,5}(?:-\d{4})?$/;
// "NY", "RI", "CA" — a bare two-letter upper-case segment (typically a
// US state) that slipped through because the zip wasn't attached.
const US_STATE_BARE = /^[A-Z]{2}$/;
// Common road-type suffix tokens — if a segment contains one of these,
// it's a street address, not a city.
const STREET_WORDS =
  /\b(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Place|Pl\.?|Square|Sq\.?|Highway|Hwy\.?|Parkway|Pkwy\.?|Way|Alley|Terrace|Ter\.?)\b/i;

function inferCity(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const s = addr.trim();
  if (!s) return null;

  // Korean: 시/도 suffix ("서울특별시", "제주도", "서울시", …).
  const ko = s.match(
    /([가-힣]{1,6}(?:특별시|광역시|특별자치시|특별자치도|시|도))/
  );
  if (ko) {
    return ko[1].replace(
      /(특별시|광역시|특별자치시|특별자치도)$/,
      ""
    );
  }

  // Korean fallback: Korean addresses conventionally start with the
  // city/district ("서울 강남구 …") even without the 시/도 suffix.
  // Grab the leading hangul token.
  if (/^[가-힣]/.test(s)) {
    const first = s.split(/\s+/)[0];
    if (/^[가-힣]{2,6}$/.test(first)) return first;
  }

  // Chinese: first X市 chunk.
  const zh = s.match(/([一-鿿]{2,6}市)/);
  if (zh) return zh[1];

  // English: split into comma-separated tokens, then clean each token
  // of a trailing localized country suffix that Google sometimes glues
  // onto the zip ("RI 02906美国", "NM 87501 미국").
  const originalParts = s
    .split(",")
    .map((p) => p.trim())
    .map((p) => p.replace(COUNTRY_SUFFIX, "").trim())
    .filter(Boolean);
  // Bare place name with no comma-delimited structure ("Amy's Restaurant",
  // "Wickenden St") is unreliable — refuse to guess a city from it.
  if (originalParts.length < 2) return null;

  // Peel off trailing noise: whole-token country → state+zip → bare state.
  let parts = [...originalParts];
  if (parts.length && COUNTRY_TOKENS.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  if (parts.length && STATE_ZIP.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  if (parts.length && US_STATE_BARE.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  if (!parts.length) return null;

  const candidate = parts[parts.length - 1];
  if (/^\d/.test(candidate)) return null; // begins with a number → street
  if (STREET_WORDS.test(candidate)) return null; // obvious street segment
  if (US_STATE_BARE.test(candidate)) return null; // "RI" etc fell through
  if (candidate.length > 40) return null; // almost always a full-address blob
  return candidate;
}
type RouletteSource = "revisit" | "wishlist" | "both";
type RouletteEntry = {
  kind: "revisit" | "wishlist";
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  avgScore: number | null;
  memo: string | null;
  linkTo: string;
};

const categoryIcon = categoryEmojiOf;

function avgTotal(p: PlaceWithFoods): number | null {
  const scores = (p.foods ?? [])
    .map((f) => (f.my_rating ?? 0) + (f.partner_rating ?? 0))
    .filter((n) => n > 0);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// Resolve a food's eater field into the *viewer's* perspective.
// Returns "both" / "me" / "partner" — used by the 나만/짝꿍만 toggle
// chips on the timeline. Mirrors the swap logic FoodFormPage uses on
// save, but simplified to a read-only one-way mapping.
type ViewerEater = "both" | "me" | "partner";
function viewerOnlyEater(
  f: PlaceWithFoods["foods"][number],
  viewerId: string | undefined
): ViewerEater {
  const stored = f.eater ?? (f.is_solo ? "creator" : "both");
  if (stored === "both") return "both";
  // No created_by → legacy row, treat viewer as the creator.
  const viewerIsCreator = !f.created_by || f.created_by === viewerId;
  if (stored === "creator") return viewerIsCreator ? "me" : "partner";
  // stored === "partner"
  return viewerIsCreator ? "partner" : "me";
}

export default function HomePage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: places, isLoading: placesLoading } = usePlaces(couple?.id);
  const { data: wishlist } = useWishlist(couple?.id);
  // Resolve display labels for "me" / "partner" once at the top of
  // the page. Priority for the partner side: my애칭 (partner_nickname
  // I set) → partner's own nickname → 짝꿍 fallback. For me: my own
  // nickname → 나 fallback. These flow into filter chips, the menu
  // row's solo-eater badges, etc.
  const { me: meProfileQuery, partner: partnerProfileQuery } =
    useCoupleProfiles();
  const myDisplay =
    meProfileQuery.data?.nickname?.trim() || "나";
  const partnerDisplay =
    meProfileQuery.data?.partner_nickname?.trim() ||
    partnerProfileQuery.data?.nickname?.trim() ||
    "짝꿍";
  // Single shared refresh covering every user-data query (places /
  // wishlist / couple / memos / profile / notifications). Pull
  // gesture and the header bell button drive the same callback.
  const refreshAll = useGlobalRefresh();
  const {
    pull,
    refreshing,
    manualRefreshing,
    released,
    justFinished,
    onManualRefresh,
  } = useRefreshControls(refreshAll);

  // Hydrate filters from sessionStorage exactly once. useRef so the
  // load happens before the first render and isn't re-evaluated on
  // every state change.
  const initialFilters = useRef<StoredFilters>(loadFilters());
  // URL param wins over the session-stored tab — that way deep-links
  // like /?tab=wishlist (e.g. after "place → wishlist 이동") land on
  // the correct tab instead of whatever the user last viewed.
  const initialTab: Tab = (() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("tab");
      if (param === "wishlist" || param === "timeline") return param;
    }
    return initialFilters.current.tab ?? "timeline";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState(initialFilters.current.query ?? "");
  const [showSearch, setShowSearch] = useState(
    initialFilters.current.showSearch ?? false
  );
  // Roulette state retired from HomePage — the dice card lives in
  // ComparePage's carousel now (it's analytics-flavored, fits the
  // "what should we eat" decision-helper bucket). Modal definition
  // stays in this file as a named export so ComparePage can mount it.
  // Single-pick filter for the chip row above the 식사 모드 segments.
  // Migrates v1 sessions that stored four independent booleans by
  // picking the first true one in priority order.
  const [listFilter, setListFilter] = useState<ListFilter>(() => {
    const stored = initialFilters.current;
    if (stored.listFilter) return stored.listFilter;
    if (stored.revisitOnly) return "revisit";
    if (stored.unratedOnly) return "unrated";
    if (stored.myOnlyEaten) return "myOnly";
    if (stored.partnerOnlyEaten) return "partnerOnly";
    return "none";
  });
  // Helper: pick a chip if not active, otherwise clear it.
  const toggleListFilter = (next: Exclude<ListFilter, "none">) =>
    setListFilter((prev) => (prev === next ? "none" : next));
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Migrate v1 saved "city" mode (when sort + 도시별 lived in the
    // same dropdown) to a plain date sort + leave city filtering to
    // the standalone dropdown.
    const stored = initialFilters.current.viewMode;
    if (stored === "date" || stored === "dateAsc" || stored === "scoreDesc" || stored === "scoreAsc") {
      return stored;
    }
    return "date";
  });
  const [diningFilter, setDiningFilter] = useState<DiningFilter>(
    initialFilters.current.diningFilter ?? "all"
  );
  // Multi-select category filter (modal popover). Empty array = no
  // filter. "__none__" = uncategorized only. Other values are built-in
  // PLACE_CATEGORIES keys or freeform "기타" strings. baseList ORs
  // across the selection. Group headers in the picker bulk-toggle all
  // children at once — that's the UX trade-off that warranted bringing
  // the modal back instead of a native <select>.
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() => {
    const stored = initialFilters.current;
    if (stored.categoryFilters && Array.isArray(stored.categoryFilters)) {
      return stored.categoryFilters;
    }
    const legacy = stored.categoryFilter;
    if (!legacy || legacy === "all") return [];
    return [legacy];
  });
  // Multi-select cities — empty array = all. Same modal UX as the
  // category filter so the two read consistently to the user.
  const [selectedCities, setSelectedCities] = useState<string[]>(() => {
    const stored = initialFilters.current;
    if (stored.selectedCities && Array.isArray(stored.selectedCities)) {
      return stored.selectedCities;
    }
    // Migrate v1 single-city: wrap in an array if present.
    if (stored.selectedCity) return [stored.selectedCity];
    return [];
  });
  const [listLayout, setListLayout] = useState<ListLayout>(
    initialFilters.current.listLayout ?? "list"
  );
  // Unified filter sheet — opens from the bottom and hosts every
  // filter (정렬·도시·카테고리) in one panel. Replaces the 3-up
  // dropdown grid that used to clip text and force three separate
  // open-then-close cycles.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Persist filters every time one changes — picked up on the next
  // mount of HomePage so users return to the same view after diving
  // into a place to rate.
  useEffect(() => {
    saveFilters({
      tab,
      query,
      showSearch,
      listFilter,
      viewMode,
      diningFilter,
      categoryFilters: categoryFilter,
      selectedCities,
      listLayout,
    });
  }, [
    tab,
    query,
    showSearch,
    listFilter,
    viewMode,
    diningFilter,
    categoryFilter,
    selectedCities,
    listLayout,
  ]);

  // A place is "needs categorizing" if either the place itself has no
  // category, or any of its foods is missing a category. That way the
  // 미분류 filter surfaces partially-tagged places too — users can
  // fix the missing food categories without combing through every
  // record.
  const isPlaceUncategorized = (p: PlaceWithFoods) =>
    getCategories(p).length === 0 ||
    (p.foods ?? []).some((f) => getCategories(f).length === 0);

  // Pieces FilterSheet needs: whether any place lacks a category (so
  // it can show the ❓ 미분류 chip), and the unique freeform user-typed
  // category strings (so prior custom selections stay visible /
  // deselectable inside the sheet).
  const hasUncategorized = useMemo(
    () => (places ?? []).some(isPlaceUncategorized),
    [places]
  );
  const customCategoryStrings = useMemo(() => {
    const set = new Set<string>();
    for (const p of places ?? []) {
      for (const c of getCategories(p)) {
        if (!c || isKnownPlaceCategory(c)) continue;
        set.add(c);
      }
    }
    return [...set].sort();
  }, [places]);

  // Drop any selected category that no longer exists (e.g. user
  // deleted every place tagged with a custom string). Otherwise the
  // hidden orphan would silently filter to zero rows.
  useEffect(() => {
    if (categoryFilter.length === 0) return;
    const known = new Set<string>();
    for (const g of CATEGORY_GROUPS) {
      for (const k of g.keys) known.add(k);
    }
    if (hasUncategorized) known.add("__none__");
    for (const c of customCategoryStrings) known.add(c);
    const cleaned = categoryFilter.filter((v) => known.has(v));
    if (cleaned.length !== categoryFilter.length) setCategoryFilter(cleaned);
  }, [hasUncategorized, customCategoryStrings, categoryFilter]);

  // Base list: filter first, then sort per viewMode below.
  const baseList = useMemo(() => {
    if (!places) return [];
    let list = places;
    // Single-pick chip group above the diningFilter — only one of the
    // four predicates ever applies.
    if (listFilter === "revisit") {
      list = list.filter((p) => p.want_to_revisit);
    } else if (listFilter === "unrated") {
      // Show only places that still need *my* rating somewhere — at
      // least one food whose viewer-side rating is null AND I'm
      // expected to rate. Foods marked as "partner only" or "creator
      // only" + I'm not the eater don't count against me.
      list = list.filter((p) =>
        (p.foods ?? []).some((f) => {
          const eater = f.eater ?? (f.is_solo ? "creator" : "both");
          if (eater !== "both") {
            const isEater =
              eater === "creator"
                ? !f.created_by || f.created_by === user?.id
                : f.created_by !== user?.id;
            if (!isEater) return false;
          }
          return ratingsForViewer(f, user?.id).myRating == null;
        })
      );
    } else if (listFilter === "myOnly") {
      list = list.filter((p) =>
        (p.foods ?? []).some(
          (f) => viewerOnlyEater(f, user?.id) === "me"
        )
      );
    } else if (listFilter === "partnerOnly") {
      list = list.filter((p) =>
        (p.foods ?? []).some(
          (f) => viewerOnlyEater(f, user?.id) === "partner"
        )
      );
    }
    if (diningFilter === "out") list = list.filter((p) => !p.is_home_cooked);
    else if (diningFilter === "home")
      list = list.filter((p) => p.is_home_cooked);
    if (categoryFilter.length > 0) {
      // Multi-select OR semantics: a place matches if any of its
      // categories appear in the selection, OR — when "__none__" is in
      // the selection — the place itself has no categories.
      const wantNone = categoryFilter.includes("__none__");
      const concrete = categoryFilter.filter((v) => v !== "__none__");
      list = list.filter((p) => {
        if (wantNone && isPlaceUncategorized(p)) return true;
        if (concrete.length === 0) return false;
        const cats = getCategories(p);
        return concrete.some((c) => cats.includes(c));
      });
    }
    if (selectedCities.length > 0) {
      // Multi-city OR semantics: show places whose inferred city is in
      // the selection. Mirrors the category filter's array shape.
      const citySet = new Set(selectedCities);
      list = list.filter((p) => {
        const city = inferCity(p.address);
        return city != null && citySet.has(city);
      });
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => {
        const hay = `${p.name} ${p.address ?? ""} ${p.memo ?? ""}`.toLowerCase();
        const foodHit = (p.foods ?? []).some((f) =>
          f.name.toLowerCase().includes(q)
        );
        return hay.includes(q) || foodHit;
      });
    }
    return list;
  }, [
    places,
    query,
    listFilter,
    diningFilter,
    categoryFilter,
    selectedCities,
    user?.id,
  ]);

  const filteredPlaces = useMemo(() => {
    const list = [...baseList];
    // Comparator for date-based sorts. date_visited is YYYY-MM-DD
    // (no time), so same-day entries tie at the primary key. Break
    // ties with created_at (insert order) so "most recently added"
    // wins inside a single day — matches "lunch then dinner" order.
    const byDateDesc = (a: PlaceWithFoods, b: PlaceWithFoods) => {
      if (a.date_visited !== b.date_visited)
        return a.date_visited < b.date_visited ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    };
    if (viewMode === "scoreDesc") {
      list.sort((a, b) => (avgTotal(b) ?? -1) - (avgTotal(a) ?? -1));
    } else if (viewMode === "scoreAsc") {
      list.sort((a, b) => (avgTotal(a) ?? Infinity) - (avgTotal(b) ?? Infinity));
    } else if (viewMode === "dateAsc") {
      list.sort((a, b) => -byDateDesc(a, b));
    } else {
      // Default "date" (최근순) and "city" both sort newest-first;
      // "city" also groups downstream so order inside a group is date-desc.
      list.sort(byDateDesc);
    }
    return list;
  }, [baseList, viewMode]);

  // Menu-view dataset — one entry per food across all baseList places.
  // listFilter is re-applied at the menu level so unrated/myOnly/
  // partnerOnly only show the actually-matching menus inside a place
  // (baseList just guarantees the place qualifies; the place might
  // still hold mixed-eater foods).
  type MenuEntry = {
    food: PlaceWithFoods["foods"][number];
    place: PlaceWithFoods;
  };
  const filteredMenus = useMemo<MenuEntry[]>(() => {
    if (listLayout !== "menu") return [];
    const out: MenuEntry[] = [];
    for (const p of baseList) {
      for (const f of p.foods ?? []) {
        if (listFilter === "unrated") {
          const eater = f.eater ?? (f.is_solo ? "creator" : "both");
          if (eater !== "both") {
            const isEater =
              eater === "creator"
                ? !f.created_by || f.created_by === user?.id
                : f.created_by !== user?.id;
            if (!isEater) continue;
          }
          if (ratingsForViewer(f, user?.id).myRating != null) continue;
        } else if (listFilter === "myOnly") {
          if (viewerOnlyEater(f, user?.id) !== "me") continue;
        } else if (listFilter === "partnerOnly") {
          if (viewerOnlyEater(f, user?.id) !== "partner") continue;
        }
        // 'revisit' is place-level so baseList already enforced it;
        // every food inside a revisit place qualifies.
        if (query.trim()) {
          // Make sure menu rows still match the search: the place
          // itself might match (name/address/memo) without this food
          // matching. In menu mode we want the matching FOODS only,
          // unless the user typed a place keyword that hits everything.
          const q = query.toLowerCase();
          const placeHay =
            `${p.name} ${p.address ?? ""} ${p.memo ?? ""}`.toLowerCase();
          const foodHit = f.name.toLowerCase().includes(q);
          if (!placeHay.includes(q) && !foodHit) continue;
        }
        out.push({ food: f, place: p });
      }
    }
    if (viewMode === "scoreDesc") {
      out.sort(
        (a, b) =>
          (b.food.my_rating ?? 0) +
          (b.food.partner_rating ?? 0) -
          ((a.food.my_rating ?? 0) + (a.food.partner_rating ?? 0))
      );
    } else if (viewMode === "scoreAsc") {
      out.sort(
        (a, b) =>
          (a.food.my_rating ?? 0) +
          (a.food.partner_rating ?? 0) -
          ((b.food.my_rating ?? 0) + (b.food.partner_rating ?? 0))
      );
    } else if (viewMode === "dateAsc") {
      // Same date_visited → fall back to place created_at ASC so
      // earlier-added wins on ties.
      out.sort((a, b) => {
        if (a.place.date_visited !== b.place.date_visited)
          return a.place.date_visited > b.place.date_visited ? 1 : -1;
        return a.place.created_at > b.place.created_at ? 1 : -1;
      });
    } else {
      out.sort((a, b) => {
        if (a.place.date_visited !== b.place.date_visited)
          return a.place.date_visited < b.place.date_visited ? 1 : -1;
        return a.place.created_at < b.place.created_at ? 1 : -1;
      });
    }
    return out;
  }, [baseList, listLayout, listFilter, viewMode, query, user?.id]);

  // All cities present across the user's full place list — derived
  // from raw `places`, NOT from baseList. Using baseList was a bug:
  // baseList already has selectedCities applied, so picking one city
  // shrunk the chip pool to just that city and made multi-select
  // impossible. We want the chip pool to stay constant so the user
  // can keep adding cities to the selection.
  const allCities = useMemo(() => {
    const byCount = new Map<string, number>();
    for (const p of places ?? []) {
      if (!p.address) continue;
      const city = inferCity(p.address);
      if (!city) continue;
      byCount.set(city, (byCount.get(city) ?? 0) + 1);
    }
    return [...byCount.entries()]
      .sort((a, b) =>
        b[1] - a[1] !== 0 ? b[1] - a[1] : a[0].localeCompare(b[0])
      )
      .map(([c]) => c);
  }, [places]);

  // Drop any selected city that no longer exists in the current filter
  // set (e.g. user removed every place in that city). Otherwise the
  // hidden orphan would silently filter to zero rows.
  useEffect(() => {
    if (selectedCities.length === 0) return;
    const known = new Set(allCities);
    const cleaned = selectedCities.filter((c) => known.has(c));
    if (cleaned.length !== selectedCities.length) setSelectedCities(cleaned);
  }, [allCities, selectedCities]);

  const filteredWishlist = useMemo(() => {
    if (!wishlist) return [];
    if (!query.trim()) return wishlist;
    const q = query.toLowerCase();
    return wishlist.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.memo ?? "").toLowerCase().includes(q)
    );
  }, [wishlist, query]);

  const stats = useMemo(() => {
    if (!places || places.length === 0) {
      return { total: 0, topCategory: null as string | null, topCount: 0 };
    }
    const byCat = new Map<string, number>();
    for (const p of places) {
      // Each category the place carries gets a tally — multi-cat
      // entries contribute to multiple buckets.
      for (const c of getCategories(p)) {
        byCat.set(c, (byCat.get(c) ?? 0) + 1);
      }
    }
    let topCategory: string | null = null;
    let topCount = 0;
    for (const [cat, count] of byCat) {
      if (count > topCount) {
        topCategory = cat;
        topCount = count;
      }
    }
    return { total: places.length, topCategory, topCount };
  }, [places]);

  return (
    <div className="relative">
      <PullIndicator
        pull={pull}
        refreshing={refreshing}
        released={released}
        justFinished={justFinished}
      />
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-cream-200/60 px-5 safe-top">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[26px] font-sans font-black text-transparent bg-clip-text bg-gradient-to-r from-peach-400 to-rose-400 truncate tracking-tight leading-none mb-1.5">
              우리의 식탁 · 我们的餐桌
            </h1>
            <p className="text-[11px] text-ink-400 font-bold truncate">
              둘이 함께 채우는 맛집 일기 · 咱俩的干饭日记
            </p>
          </div>
          {/* Top-right action cluster — only the high-frequency
              actions (알림 / 새로고침) live here so the gradient
              wordmark gets full breathing room. Search graduated down
              to the filter row alongside "상세 필터". */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <NotificationBell />
            <button
              type="button"
              onClick={() => void onManualRefresh()}
              disabled={manualRefreshing || refreshing}
              className={`p-3 rounded-full transition border active:scale-90 disabled:cursor-not-allowed ${
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
                  className={`w-5 h-5 ${manualRefreshing || refreshing ? "animate-spin text-rose-400" : ""}`}
                />
              )}
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="mb-3">
            <input
              autoFocus
              className="input-base"
              placeholder="이름이나 메모로 검색 · 搜索店名或备注"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {/* Main tabs */}
        <div className="flex justify-between gap-2 -mx-1">
          <TabButton
            active={tab === "timeline"}
            accent="ink"
            onClick={() => setTab("timeline")}
            label="발자취 · 我们的足迹 👣"
          />
          <TabButton
            active={tab === "wishlist"}
            accent="peach"
            onClick={() => setTab("wishlist")}
            label="위시리스트 · 种草清单 📝"
            count={wishlist?.length}
          />
        </div>
      </header>

      <main className="px-5 py-5">
        {tab === "timeline" && (
          <>
            <StatsDashboard stats={stats} />

            <div className="flex items-center justify-between mt-8 mb-3 px-1 gap-2">
              <h2 className="font-sans font-bold text-[18px] text-ink-900 flex items-center gap-2 tracking-tight">
                <span>다녀온 곳 · 干饭足迹</span>
                <span className="text-rose-500 text-xs font-number font-bold bg-rose-50 px-2.5 py-0.5 rounded-full">
                  {filteredPlaces.length}
                </span>
              </h2>
              {/* List ↔ grid ↔ menu layout toggle. Menu mode flattens
                  the timeline to one card per food instead of one per
                  place; same filters apply. */}
              <div className="flex bg-cream-100/80 p-0.5 rounded-lg border border-cream-200/60">
                <LayoutToggle
                  active={listLayout === "list"}
                  onClick={() => setListLayout("list")}
                  icon={<List className="w-4 h-4" />}
                  label="리스트 뷰 · 列表"
                />
                <LayoutToggle
                  active={listLayout === "grid"}
                  onClick={() => setListLayout("grid")}
                  icon={<Grid3x3 className="w-4 h-4" />}
                  label="그리드 뷰 · 网格"
                />
                <LayoutToggle
                  active={listLayout === "menu"}
                  onClick={() => setListLayout("menu")}
                  icon={<Utensils className="w-4 h-4" />}
                  label="메뉴 뷰 · 菜单"
                />
              </div>
            </div>
            {/* 1) 모두 / 외식 / 집밥 — 옛 큰 segment row 그대로 복원. */}
            <div className="flex bg-cream-100/80 p-1 rounded-xl border border-cream-200/60 mb-3">
              <SegmentButton
                active={diningFilter === "all"}
                onClick={() => setDiningFilter("all")}
                label="모두 · 全部"
                activeText="text-ink-900"
                activeBorder="border-cream-100"
              />
              <SegmentButton
                active={diningFilter === "out"}
                onClick={() => setDiningFilter("out")}
                label="🍽️ 외식 · 探店"
                activeText="text-peach-500"
                activeBorder="border-peach-100"
              />
              <SegmentButton
                active={diningFilter === "home"}
                onClick={() => setDiningFilter("home")}
                label="🍳 집밥 · 私房菜"
                activeText="text-teal-600"
                activeBorder="border-teal-100"
              />
            </div>

            {/* 2) 필터 + 검색 한 줄 — 검색은 헤더 우측에서 내려와서
                필터 버튼 옆 보조 위치를 차지. 토글식이라 평소엔
                아이콘만, 누르면 아래에 input 이 펼쳐짐. */}
            {(() => {
              const sortActive = viewMode !== "date";
              const sheetCount =
                (sortActive ? 1 : 0) +
                selectedCities.length +
                categoryFilter.length;
              const isActive = sheetCount > 0;
              return (
                <div className="flex items-stretch gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setFilterSheetOpen(true)}
                    className={`flex-1 min-w-0 inline-flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border text-[13px] font-bold transition active:scale-[0.98] shadow-sm break-keep ${
                      isActive
                        ? "bg-peach-50 border-peach-200 text-peach-700"
                        : "bg-white border-cream-200/80 text-ink-700 hover:bg-cream-50"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0 truncate">
                      <SlidersHorizontal className="w-4 h-4 flex-shrink-0" />
                      상세 필터 · 详细筛选
                    </span>
                    {isActive && (
                      <span className="bg-peach-400 text-white font-number text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">
                        {sheetCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSearch((v) => !v)}
                    className={`flex-shrink-0 px-4 rounded-2xl border text-[13px] font-bold transition active:scale-95 shadow-sm ${
                      showSearch
                        ? "bg-peach-50 border-peach-200 text-peach-700"
                        : "bg-white border-cream-200/80 text-ink-700 hover:bg-cream-50"
                    }`}
                    aria-label="search"
                    title="검색 · 搜索"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              );
            })()}

            {/* 3) Single-pick chip group: 또 갈래 / 평가 안 한 메뉴 /
                나만 먹음 / 짝꿍만 먹음. 옛 라벨 그대로, mutually
                exclusive 동작 유지. */}
            <div className="flex gap-1.5 mb-3 px-1 overflow-x-auto hide-scrollbar">
              <button
                type="button"
                onClick={() => toggleListFilter("revisit")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-all active:scale-95 border whitespace-nowrap ${
                  listFilter === "revisit"
                    ? "bg-rose-50 text-rose-500 border-rose-200/60 shadow-[0_2px_10px_rgba(244,114,182,0.15)]"
                    : "bg-white text-ink-500 border-cream-200/60 shadow-sm hover:bg-cream-50"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${listFilter === "revisit" ? "fill-rose-500" : ""}`}
                />
                또 갈래! · 必须二刷
              </button>
              <button
                type="button"
                onClick={() => toggleListFilter("unrated")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-all active:scale-95 border whitespace-nowrap ${
                  listFilter === "unrated"
                    ? "bg-amber-50 text-amber-700 border-amber-200/70 shadow-[0_2px_10px_rgba(217,119,6,0.15)]"
                    : "bg-white text-ink-500 border-cream-200/60 shadow-sm hover:bg-cream-50"
                }`}
              >
                <span className="text-[13px] leading-none">✏️</span>
                평가 안 한 메뉴 · 我还没打分
              </button>
              <button
                type="button"
                onClick={() => toggleListFilter("myOnly")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-all active:scale-95 border whitespace-nowrap ${
                  listFilter === "myOnly"
                    ? "bg-peach-50 text-peach-600 border-peach-200/70 shadow-[0_2px_10px_rgba(248,149,112,0.15)]"
                    : "bg-white text-ink-500 border-cream-200/60 shadow-sm hover:bg-cream-50"
                }`}
              >
                🍴{myDisplay}만 먹음 · {myDisplay}独享
              </button>
              <button
                type="button"
                onClick={() => toggleListFilter("partnerOnly")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-all active:scale-95 border whitespace-nowrap ${
                  listFilter === "partnerOnly"
                    ? "bg-rose-50 text-rose-500 border-rose-200/60 shadow-[0_2px_10px_rgba(244,114,182,0.15)]"
                    : "bg-white text-ink-500 border-cream-200/60 shadow-sm hover:bg-cream-50"
                }`}
              >
                🍴{partnerDisplay}만 먹음 · {partnerDisplay}独享
              </button>
            </div>

            {/* Active sheet-side selections shown as removable chips
                directly under the bar — gives the user a clear "you
                have X cities + Y categories selected" without opening
                the sheet, and lets them prune one at a time without
                re-opening it. Sort chip only renders when viewMode
                isn't the default ("date"); X resets it to default. */}
            {(viewMode !== "date" ||
              selectedCities.length > 0 ||
              categoryFilter.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 mb-4 px-1">
                {viewMode !== "date" &&
                  (() => {
                    const sortLabel =
                      viewMode === "dateAsc"
                        ? "📅 오래된순"
                        : viewMode === "scoreDesc"
                          ? "⭐ 별점 높은순"
                          : "🥄 별점 낮은순";
                    return (
                      <span
                        key="sort"
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-ink-100 text-ink-700 text-[11px] font-bold rounded-full border border-cream-200"
                      >
                        {sortLabel}
                        <button
                          type="button"
                          onClick={() => setViewMode("date")}
                          className="hover:text-rose-500"
                          aria-label="reset sort"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })()}
                {selectedCities.map((c) => (
                  <span
                    key={`city-${c}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-peach-100 text-peach-700 text-[11px] font-bold rounded-full border border-peach-200/60"
                  >
                    📍 {c}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCities(
                          selectedCities.filter((x) => x !== c)
                        )
                      }
                      className="hover:text-peach-900"
                      aria-label={`remove ${c}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {categoryFilter.map((c) => {
                  const label =
                    c === "__none__"
                      ? "❓ 미분류"
                      : isKnownPlaceCategory(c)
                        ? `${categoryEmojiOf(c)} ${t(`category.${c}`)}`
                        : `${categoryEmojiOf(c)} ${c}`;
                  return (
                    <span
                      key={`cat-${c}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200/60"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() =>
                          setCategoryFilter(
                            categoryFilter.filter((x) => x !== c)
                          )
                        }
                        className="hover:text-rose-900"
                        aria-label={`remove ${c}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("date");
                    setSelectedCities([]);
                    setCategoryFilter([]);
                  }}
                  className="text-[11px] text-ink-400 font-bold ml-1 hover:text-ink-600 underline underline-offset-2"
                >
                  모두 지우기 · 全部清除
                </button>
              </div>
            )}

            {placesLoading && <TimelineSkeleton />}
            {!placesLoading && filteredPlaces.length === 0 && (() => {
              const onlyUncategorized =
                categoryFilter.length === 1 &&
                categoryFilter[0] === "__none__";
              return (
                <EmptyState
                  emoji={
                    listFilter === "unrated"
                      ? "✏️"
                      : onlyUncategorized
                        ? "❓"
                        : listFilter === "revisit"
                          ? "💖"
                          : listFilter === "myOnly"
                            ? "🍴"
                            : listFilter === "partnerOnly"
                              ? "🍴"
                              : diningFilter === "home"
                                ? "🍳"
                                : "🍽️"
                  }
                  text={
                    listFilter === "unrated"
                      ? "모든 메뉴에 별점을 다 줬어요! · 所有菜都打过分啦！"
                      : onlyUncategorized
                        ? "카테고리 미설정 항목이 없어요 · 没有未分类的记录"
                        : listFilter === "revisit"
                          ? "아직 ‘또 갈래’ 표시한 곳이 없어요 · 还没攒下想再去的神仙店铺"
                          : listFilter === "myOnly"
                            ? `${myDisplay}만 먹은 메뉴가 아직 없어요 · 还没有${myDisplay}独享的菜`
                            : listFilter === "partnerOnly"
                              ? `${partnerDisplay}만 먹은 메뉴가 아직 없어요 · 还没有${partnerDisplay}独享的菜`
                              : diningFilter === "home"
                                ? "아직 집밥 기록이 없어요 · 还没有家宴记录"
                                : diningFilter === "out"
                                  ? "아직 외식 기록이 없어요 · 还没有探店记录"
                                  : "아직 다녀온 곳이 없어요 · 还没有干饭记录"
                  }
                />
              );
            })()}

            {listLayout === "grid" ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                {filteredPlaces.map((p) => (
                  <TimelineGridItem
                    key={p.id}
                    place={p}
                    locale={i18n.language}
                    viewerId={user?.id}
                  />
                ))}
              </div>
            ) : listLayout === "menu" ? (
              filteredMenus.length === 0 ? (
                <EmptyState
                  emoji="🍽️"
                  text="조건에 맞는 메뉴가 없어요 · 没有符合的菜"
                />
              ) : (
                <div className="mt-2 space-y-2.5">
                  {filteredMenus.map((m) => (
                    <MenuRow
                      key={`${m.place.id}-${m.food.id}`}
                      food={m.food}
                      place={m.place}
                      locale={i18n.language}
                      viewerId={user?.id}
                      myDisplay={myDisplay}
                      partnerDisplay={partnerDisplay}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="mt-2">
                {filteredPlaces.map((p, idx) => (
                  <TimelineItem
                    key={p.id}
                    place={p}
                    locale={i18n.language}
                    isLast={idx === filteredPlaces.length - 1}
                    viewerId={user?.id}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "wishlist" && (
          <WishlistView
            items={filteredWishlist}
            couple_id={couple?.id}
          />
        )}
      </main>

      {/* Floating action — single +/북마크 button on the right. The
          룰렛 button moved up to the header icon cluster so the bottom
          stays uncluttered and the timeline list isn't covered by two
          big circular buttons. */}
      <div
        className="fixed left-0 right-0 z-30 pointer-events-none px-5"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)",
        }}
      >
        <div className="max-w-md mx-auto flex justify-end items-end">
          {tab === "timeline" ? (
            <Link
              to="/places/new"
              className="pointer-events-auto w-16 h-16 rounded-full bg-gradient-to-br from-peach-400 to-rose-400 text-white shadow-lift flex items-center justify-center active:scale-90 transition hover:scale-105"
              aria-label="add place"
            >
              <Plus className="w-7 h-7" />
            </Link>
          ) : (
            <Link
              to="/wishlist/new"
              className="pointer-events-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-peach-400 text-white shadow-lift flex items-center justify-center active:scale-90 transition hover:scale-105"
              aria-label="add wishlist"
            >
              <BookmarkPlus className="w-7 h-7" />
            </Link>
          )}
        </div>
      </div>

      {/* RouletteModal moved to ComparePage carousel — see
          TasteDiagnosisCard / RouletteCard. The modal definition still
          lives below so ComparePage can import it. */}

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        allCities={allCities}
        selectedCities={selectedCities}
        onChangeSelectedCities={setSelectedCities}
        categoryFilter={categoryFilter}
        onChangeCategoryFilter={setCategoryFilter}
        customCategoryStrings={customCategoryStrings}
        hasUncategorized={hasUncategorized}
        // hasAnyActive includes the single-pick top-level chip too
        // so the sheet's "전체 초기화" knows there's something to
        // clear even when the user hasn't touched anything inside the
        // sheet.
        hasAnyActive={
          viewMode !== "date" ||
          selectedCities.length > 0 ||
          categoryFilter.length > 0 ||
          listFilter !== "none"
        }
        onResetAll={() => {
          setViewMode("date");
          setSelectedCities([]);
          setCategoryFilter([]);
          setListFilter("none");
        }}
      />

    </div>
  );
}

// ---------- segmented control + dropdown ----------

// Single button inside the 외식/집밥 segmented control. Active state
// hangs a tinted text color + a subtle outlined "chip-on-pill" effect
// (white bg + matching border) so the selected slot reads clearly.
function SegmentButton({
  active,
  onClick,
  label,
  activeText,
  activeBorder,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeText: string;
  activeBorder: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all min-w-0 truncate ${
        active
          ? `bg-white shadow-sm border ${activeText} ${activeBorder}`
          : "text-ink-500 hover:text-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

// Generic dropdown styled to look like the filter pills. Uses a real
// <select> for native picker UX (especially on iOS) and overlays our
// (FilterDropdown removed — replaced by GroupedMultiSelect for sort,
//  city, and category so all three filters share the same modal UX.)

function TabButton({
  active,
  accent,
  onClick,
  label,
  count,
}: {
  active: boolean;
  accent: "rose" | "peach" | "ink";
  onClick: () => void;
  label: string;
  count?: number;
}) {
  const underline =
    accent === "rose"
      ? "bg-rose-400"
      : accent === "peach"
        ? "bg-peach-400"
        : "bg-ink-900";
  const activeText =
    accent === "rose"
      ? "text-rose-500"
      : accent === "peach"
        ? "text-peach-500"
        : "text-ink-900";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative pb-3 text-[12px] sm:text-[13px] font-semibold transition whitespace-nowrap text-center flex-1 min-w-0 truncate active:scale-95 ${
        active ? activeText : "text-ink-400 hover:text-ink-700"
      }`}
    >
      <span className="inline-block max-w-full truncate align-middle">
        {label}
      </span>
      {count != null && count > 0 && (
        <span className="ml-1 text-[10px] text-ink-400 font-medium font-number">
          {count}
        </span>
      )}
      {active && (
        <span
          className={`absolute left-1/2 -translate-x-1/2 bottom-0 w-10 h-0.5 ${underline} rounded-t-full`}
        />
      )}
    </button>
  );
}

// ---------- stats ----------

function StatsDashboard({
  stats,
}: {
  stats: { total: number; topCategory: string | null; topCount: number };
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-gradient-to-br from-peach-100 to-rose-100 rounded-[1.75rem] p-5 sm:p-6 border border-rose-200/60 shadow-airy flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[10px] sm:text-[11px] font-bold text-rose-500 tracking-[0.15em] uppercase truncate">
          기록 · 干饭成就
        </span>
        <div className="mt-1">
          <span className="text-3xl font-number font-bold text-ink-900 tracking-tight">
            {stats.total}
          </span>
          <span className="text-sm font-bold text-ink-700 ml-1">
            곳 · 处
          </span>
        </div>
      </div>
      <div className="h-12 w-px bg-rose-200/50 flex-shrink-0" />
      <div className="flex flex-col gap-1 items-end min-w-0">
        <span className="text-[10px] sm:text-[11px] font-bold text-peach-500 tracking-[0.15em] uppercase truncate">
          자주 찾은 메뉴 · 最常翻牌
        </span>
        {stats.topCategory ? (
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <span className="text-lg sm:text-xl flex-shrink-0">
              {categoryIcon(stats.topCategory)}
            </span>
            <span className="text-sm sm:text-base font-bold text-ink-900 truncate">
              {isKnownPlaceCategory(stats.topCategory)
                ? t(`category.${stats.topCategory}`)
                : stats.topCategory}
            </span>
            <span className="text-xs sm:text-sm font-number font-bold text-ink-400 ml-1 flex-shrink-0">
              ({stats.topCount})
            </span>
          </div>
        ) : (
          <span className="text-base font-bold text-ink-400 mt-1">-</span>
        )}
      </div>
    </div>
  );
}

// ---------- timeline card ----------

// Theme bundle so the dot, connector line, card, and image well all
// pick up the right tone for 외식 vs 집밥 from a single source of truth.
function timelineTheme(isHomeCooked: boolean) {
  return isHomeCooked
    ? {
        line: "bg-teal-200",
        dot: "border-teal-400",
        card: "bg-gradient-to-br from-teal-100/60 to-white",
        cardBorder: "border-teal-200",
        img: "bg-teal-50 border-teal-200",
        tag: "bg-teal-500 text-white border-teal-600",
        addrIcon: "text-teal-500",
      }
    : {
        line: "bg-peach-200",
        dot: "border-peach-400",
        card: "bg-gradient-to-br from-peach-100/70 to-white",
        cardBorder: "border-peach-200",
        img: "bg-peach-50 border-peach-200",
        tag: "bg-peach-500 text-white border-peach-600",
        addrIcon: "text-peach-500",
      };
}

function TimelineItem({
  place,
  locale,
  isLast,
  viewerId,
}: {
  place: PlaceWithFoods;
  locale: string;
  isLast: boolean;
  viewerId: string | undefined;
}) {
  const { t } = useTranslation();
  const avg = avgTotal(place);
  const isHome = !!place.is_home_cooked;
  const theme = timelineTheme(isHome);
  // Count foods on this place where the *viewer* hasn't dropped a
  // rating yet — drives the small "✏️ N 개" CTA. Foods marked as
  // "creator only" / "partner only" where the viewer isn't the eater
  // don't count against the viewer.
  const unratedByMe = (place.foods ?? []).filter((f) => {
    const eater = f.eater ?? (f.is_solo ? "creator" : "both");
    if (eater !== "both") {
      const isEater =
        eater === "creator"
          ? !f.created_by || f.created_by === viewerId
          : f.created_by !== viewerId;
      if (!isEater) return false;
    }
    const view = ratingsForViewer(f, viewerId);
    return view.myRating == null;
  }).length;
  const uncategorizedFoods = (place.foods ?? []).filter(
    (f) => getCategories(f).length === 0
  ).length;
  // Resolve all category labels: built-in keys go through i18n,
  // custom strings render as-is. Empty array → render a single
  // "❓ 미분류" pill.
  const placeCategories = getCategories(place);
  const catLabels: string[] =
    placeCategories.length === 0
      ? []
      : placeCategories.map((c) =>
          isKnownPlaceCategory(c)
            ? `${categoryEmojiOf(c)} ${t(`category.${c}`)}`
            : `${categoryEmojiOf(c)} ${c}`
        );
  return (
    <div className="relative pl-6 pb-6">
      {!isLast && (
        <div
          className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${theme.line}`}
        />
      )}
      <div
        className={`absolute left-0 top-2 w-6 h-6 rounded-full bg-white border-[3px] ${theme.dot} z-[1]`}
      />

      <div className="mb-1.5 pl-2">
        <span className="text-[11px] font-semibold text-ink-400 tracking-wide font-number">
          {formatDate(place.date_visited, locale)}
        </span>
      </div>

      <Link
        to={`/places/${place.id}`}
        className={`block rounded-2xl p-4 ml-2 border shadow-soft active:scale-[0.98] transition ${theme.card} ${theme.cardBorder}`}
      >
        <div className="flex gap-4">
          <div
            className={`w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-3xl border ${theme.img}`}
          >
            {place.photo_urls?.[0] ? (
              <MediaThumb
                src={place.photo_urls[0]}
                alt={place.name}
                className="w-full h-full object-cover"
                clickable={false}
              />
            ) : isHome ? (
              "🍳"
            ) : (
              categoryIcon(place.category)
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-ink-900 text-[15px] truncate">
                  {place.name}
                </h3>
                <span
                  className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none border ${theme.tag}`}
                >
                  {isHome ? "🍳 집밥 · 私房菜" : "🍽️ 외식 · 探店"}
                </span>
              </div>
              {place.want_to_revisit && (
                <Heart className="w-4 h-4 fill-rose-500 text-rose-500 flex-shrink-0 mt-0.5 drop-shadow-sm" />
              )}
            </div>
            {place.address && (
              <p className="text-[11px] text-ink-500 mt-1.5 flex items-center gap-1 truncate">
                <MapPin
                  className={`w-3 h-3 flex-shrink-0 ${theme.addrIcon}`}
                />
                <span className="truncate">{place.address}</span>
              </p>
            )}
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              {/* Place-level category chips — one chip per assigned
                  category. Empty list collapses to a single amber
                  "❓ 미분류" pill so unclassified entries stand out. */}
              {catLabels.length === 0 ? (
                <span className="text-[11px] px-2 py-0.5 rounded-lg shadow-sm border bg-amber-50 text-amber-700 border-amber-200 font-bold">
                  ❓ 미분류 · 未分类
                </span>
              ) : (
                catLabels.map((label) => (
                  <span
                    key={label}
                    className="text-[11px] px-2 py-0.5 rounded-lg shadow-sm border bg-white/90 text-ink-700 border-cream-200/60"
                  >
                    {label}
                  </span>
                ))
              )}
              {avg !== null ? (
                <span className="inline-flex items-center bg-white/90 px-2 py-0.5 rounded-lg text-xs font-bold border border-peach-200/60 text-peach-500 shadow-sm">
                  <span className="mr-1">⭐</span>
                  <span className="font-number">{avg.toFixed(1)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-ink-400">
                  아직 평가 전 · 等待打分
                </span>
              )}
              <span className="text-[11px] text-ink-600 bg-white/90 border border-cream-200/60 px-2 py-0.5 rounded-lg shadow-sm">
                🍽️{" "}
                <span className="font-number font-bold">
                  {(place.foods ?? []).length}
                </span>{" "}
                <span className="opacity-70">개 · 道</span>
              </span>
              {/* Uncategorized foods badge — surfaces when at least
                  one food on this place is missing its category, so
                  the user can drill in and tag them. */}
              {uncategorizedFoods > 0 && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg shadow-sm">
                  ❓ 메뉴{" "}
                  <span className="font-number">{uncategorizedFoods}</span>개
                  미분류 · 菜未分类{" "}
                  <span className="font-number">{uncategorizedFoods}</span>
                </span>
              )}
              {/* "Need my rating" CTA — only shows when there's at least
                  one food on this place that the viewer hasn't scored yet. */}
              {unratedByMe > 0 && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg shadow-sm">
                  ✏️{" "}
                  <span className="font-number">{unratedByMe}</span>개
                  평가 안 함 · 还没打分{" "}
                  <span className="font-number">{unratedByMe}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

// ---------- list ↔ grid layout toggle ----------

function LayoutToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-1.5 rounded-md transition-all ${
        active
          ? "bg-white text-ink-900 shadow-sm border border-cream-200"
          : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {icon}
    </button>
  );
}

// ---------- menu row (one card per food in menu view) ----------

// Compact food-centric card: food name + the place it came from on
// the left, score on the right. Tap routes to the place detail since
// food editing/photos live there. Same theme treatment (peach for
// 외식 / teal for 집밥) as TimelineItem so the two views feel related.
function MenuRow({
  food,
  place,
  locale,
  viewerId,
  myDisplay,
  partnerDisplay,
}: {
  food: PlaceWithFoods["foods"][number];
  place: PlaceWithFoods;
  locale: string;
  viewerId: string | undefined;
  // Resolved nicknames piped down from HomePage so the solo-eater
  // badge reflects whatever the user named themselves and their
  // partner (e.g. "민쥬만 · 我独享" instead of "나만 · 我独享").
  myDisplay: string;
  partnerDisplay: string;
}) {
  const { t } = useTranslation();
  const isHome = !!place.is_home_cooked;
  const theme = timelineTheme(isHome);
  const view = ratingsForViewer(food, viewerId);
  // Score depends on who ate. For solo foods the non-eater isn't
  // supposed to rate, so don't double-count or surface a "평가 전"
  // nag when only one side is filled in.
  const eaterPre: "both" | "me" | "partner" = (() => {
    const stored = food.eater ?? (food.is_solo ? "creator" : "both");
    if (stored === "both") return "both";
    const viewerIsCreator =
      !food.created_by || food.created_by === viewerId;
    if (stored === "creator") return viewerIsCreator ? "me" : "partner";
    return viewerIsCreator ? "partner" : "me";
  })();
  const total: number | null = (() => {
    if (eaterPre === "both") {
      return food.my_rating != null && food.partner_rating != null
        ? food.my_rating + food.partner_rating
        : null;
    }
    // Solo: rating × 2 so the /10 scale stays consistent. Whichever
    // rating slot belongs to the eater.
    const soloRating =
      eaterPre === "me" ? view.myRating : view.partnerRating;
    return soloRating != null ? soloRating * 2 : null;
  })();
  // eaterPre (computed above for the score block) is reused for the
  // 단독 식사 badge so we only walk the eater logic once per row.
  const eaterRole = eaterPre;
  const photo = food.photo_urls?.[0] ?? food.photo_url ?? null;
  const foodCats = getCategories(food);
  return (
    <Link
      to={`/places/${place.id}`}
      className={`flex gap-3 items-center rounded-2xl p-3 border shadow-soft active:scale-[0.99] transition ${theme.card} ${theme.cardBorder}`}
    >
      <div
        className={`w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl border ${theme.img}`}
      >
        {photo ? (
          <MediaThumb
            src={photo}
            alt={food.name}
            className="w-full h-full object-cover"
            clickable={false}
          />
        ) : isHome ? (
          "🍳"
        ) : (
          categoryIcon(foodCats[0] ?? place.category)
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-ink-900 text-[14px] truncate">
          {food.name}
        </p>
        <p className="text-[11px] text-ink-500 truncate flex items-center gap-1">
          <MapPin className={`w-3 h-3 flex-shrink-0 ${theme.addrIcon}`} />
          <span className="truncate">{place.name}</span>
          <span className="text-ink-300 mx-0.5">·</span>
          <span className="font-number flex-shrink-0">
            {formatDate(place.date_visited, locale)}
          </span>
        </p>
        {food.memo && (
          // Menu memo as a tight one-liner under the place/date — long
          // memos truncate so the row height stays uniform across the
          // list. Tap-through still reaches the full memo on detail.
          <p className="text-[11px] text-ink-500 mt-0.5 line-clamp-1 break-keep">
            <MemoCommentInline
              memo={food.memo}
              authorId={food.memo_author_id}
            />
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {foodCats.slice(0, 2).map((c) => (
            <span
              key={c}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/90 text-ink-600 border border-cream-200/60 inline-flex items-center gap-0.5"
            >
              {/* i18n covers both place + food category keys
                  (main/side/drink/dessert/...). Fall back to raw value
                  only when the key really isn't translated (custom
                  freeform tags). Emoji prefixes the label so the chip
                  carries the same visual cue as the rest of the app. */}
              <span>{categoryEmojiOf(c)}</span>
              <span>{t(`category.${c}`, { defaultValue: c })}</span>
            </span>
          ))}
          {eaterRole === "me" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-peach-50 text-peach-600 border border-peach-200 font-bold">
              🍴{myDisplay}만 · {myDisplay}独享
            </span>
          )}
          {eaterRole === "partner" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200 font-bold">
              🍴{partnerDisplay}만 · {partnerDisplay}独享
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        {total !== null ? (
          <>
            <span className="block text-xl font-number font-bold text-transparent bg-clip-text bg-gradient-to-r from-peach-400 to-rose-400 leading-none">
              {total.toFixed(1)}
            </span>
            <span className="text-[9px] text-ink-400 font-number">/ 10</span>
          </>
        ) : eaterPre === "both" ? (
          // Both-eater food still missing a rating — surface the gap
          // so the user knows there's something to fill in.
          view.myRating == null ? (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              ✏️ 평가 전
            </span>
          ) : (
            <span className="text-[10px] text-ink-400">짝꿍 대기</span>
          )
        ) : (
          // Solo food (나만 / 짝꿍만) without a rating — eater simply
          // hasn't logged a score yet. No "평가해야 됨" nag, just a
          // light dash.
          <span className="text-[10px] text-ink-400 font-number">-</span>
        )}
      </div>
    </Link>
  );
}

// ---------- timeline grid item (2-col photo-first feed) ----------

function TimelineGridItem({
  place,
  locale,
  viewerId,
}: {
  place: PlaceWithFoods;
  locale: string;
  viewerId: string | undefined;
}) {
  const isHome = !!place.is_home_cooked;
  const theme = timelineTheme(isHome);
  const avg = avgTotal(place);
  const photo = place.photo_urls?.[0];
  const unratedByMe = (place.foods ?? []).filter((f) => {
    const eater = f.eater ?? (f.is_solo ? "creator" : "both");
    if (eater !== "both") {
      const isEater =
        eater === "creator"
          ? !f.created_by || f.created_by === viewerId
          : f.created_by !== viewerId;
      if (!isEater) return false;
    }
    const view = ratingsForViewer(f, viewerId);
    return view.myRating == null;
  }).length;

  return (
    <Link
      to={`/places/${place.id}`}
      className="block rounded-2xl overflow-hidden bg-white border border-cream-200/70 shadow-soft active:scale-[0.97] transition"
    >
      {/* Square photo well (Instagram-style hero). Photo fills the
          frame; emoji fallback uses the theme tint so the card still
          reads visually rich without an upload. */}
      <div
        className={`aspect-square relative ${
          photo ? "bg-cream-50" : `${theme.img} flex items-center justify-center`
        }`}
      >
        {photo ? (
          <MediaThumb
            src={photo}
            alt={place.name}
            className="w-full h-full object-cover"
            showPlayBadge
            clickable={false}
          />
        ) : (
          <span className="text-6xl drop-shadow-sm">
            {isHome ? "🍳" : categoryIcon(place.category)}
          </span>
        )}
        {/* Top-right corner badges */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {place.want_to_revisit && (
            <span className="bg-white/90 rounded-full p-1 shadow-sm">
              <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            </span>
          )}
          {unratedByMe > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-0.5">
              ✏️ <span className="font-number">{unratedByMe}</span>
            </span>
          )}
        </div>
        {/* Top-left: dining-type tag stays here so the photo bottom
            stays uncluttered for the IG-style caption below. */}
        <div className="absolute top-2 left-2">
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold leading-none border ${theme.tag}`}
          >
            {isHome ? "🍳 집밥 · 私房菜" : "🍽️ 외식 · 探店"}
          </span>
        </div>
      </div>

      {/* Caption block — Instagram-style: place name bold, memo as
          muted caption with line-clamp, date + score footer. */}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-ink-900 text-[14px] truncate flex-1 break-keep">
            {place.name}
          </h3>
          {avg !== null && (
            <span className="inline-flex items-center text-peach-500 font-bold font-number text-[11px] flex-shrink-0">
              ⭐ {avg.toFixed(1)}
            </span>
          )}
        </div>
        {place.memo && (
          <p className="text-[11px] text-ink-500 leading-snug whitespace-pre-wrap line-clamp-3 break-keep">
            <MemoCommentInline
              memo={place.memo}
              authorId={place.memo_author_id}
            />
          </p>
        )}
        <p className="text-[10px] text-ink-400 font-number truncate">
          {formatDate(place.date_visited, locale)}
        </p>
      </div>
    </Link>
  );
}

// ---------- wishlist view + card ----------

function WishlistView({
  items,
  couple_id,
}: {
  items: WishlistPlace[];
  couple_id: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const del = useDeleteWishlist();
  // The item the user is hovering on the "다녀왔어" confirm dialog —
  // null means no dialog open. Two-step so a stray tap doesn't yank
  // a wishlist entry into the timeline + delete it.
  const [confirmingVisit, setConfirmingVisit] =
    useState<WishlistPlace | null>(null);

  async function onDelete(id: string) {
    if (!confirm(t("common.confirmDelete"))) return;
    await del.mutateAsync(id);
  }

  // Move a wishlist item to the timeline by routing through the same
  // place-add form a fresh restaurant uses. PlaceFormPage prefills
  // from `?fromWishlist=<id>` and (on success) deletes the wishlist
  // row + jumps to /foods/new for the new place — the user picks up
  // the menu-logging step right after.
  function onMarkVisited(item: WishlistPlace) {
    navigate(`/places/new?fromWishlist=${item.id}`);
  }

  if (!couple_id) return null;

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📝"
        text="위시리스트를 채워봐요 · 赶紧种种草吧"
        hint="여기를 눌러서 추가 · 点这里添加"
        onClick={() => navigate("/wishlist/new")}
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((item) => (
          <WishlistCard
            key={item.id}
            item={item}
            onDelete={() => void onDelete(item.id)}
            // Two-step: tap → open confirm dialog. The actual navigation
            // only fires when the user picks "yes" in the dialog.
            onMarkVisited={() => setConfirmingVisit(item)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmingVisit}
        title={
          confirmingVisit
            ? `${confirmingVisit.name}, 다녀왔어요? · 真的去过这里了吗？`
            : ""
        }
        body="기록 추가 화면으로 넘어가요. 지나가는 중이면 취소해도 돼요. · 会跳到记录页面，路过的话先看看也行。"
        confirmLabel="응! 다녀왔어 · 嗯，去过了！"
        cancelLabel="先看看 · 좀 더 볼게"
        onCancel={() => setConfirmingVisit(null)}
        onConfirm={() => {
          const target = confirmingVisit;
          setConfirmingVisit(null);
          if (target) onMarkVisited(target);
        }}
      />
    </>
  );
}

function WishlistCard({
  item,
  onDelete,
  onMarkVisited,
}: {
  item: WishlistPlace;
  onDelete: () => void;
  onMarkVisited: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-2xl p-4 border border-peach-100 shadow-soft relative overflow-hidden">
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-rose-50 text-rose-400"
        aria-label="delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="w-12 h-12 rounded-xl bg-peach-50 flex items-center justify-center text-2xl flex-shrink-0">
          {categoryIcon(item.category)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-ink-900 text-base truncate">
            {item.name}
          </h3>
          {item.category && (
            <p className="text-[11px] text-peach-500 mt-0.5 font-medium">
              {t(`category.${item.category}`)}
            </p>
          )}
          {item.address && (
            <p className="text-[11px] text-ink-500 mt-1 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{item.address}</span>
            </p>
          )}
          {item.memo && (
            <p className="text-xs text-ink-500 mt-1 whitespace-pre-wrap">
              {item.memo}
            </p>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={onMarkVisited}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-500 text-xs font-bold rounded-lg border border-rose-100 hover:bg-rose-100 transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              다녀왔어요! · 种草成功
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- generic empty ----------

function EmptyState({
  emoji,
  text,
  onClick,
  hint,
}: {
  emoji: string;
  text: string;
  // When provided, the empty state renders as a tappable button so
  // users can act on it directly (e.g. tapping the empty wishlist
  // box opens the add sheet). Without onClick it stays a plain div.
  onClick?: () => void;
  // Optional secondary line — usually a CTA cue like "탭해서 추가".
  hint?: string;
}) {
  const className =
    "py-14 px-5 text-center bg-white rounded-3xl border border-dashed border-cream-200 w-full" +
    (onClick
      ? " cursor-pointer active:scale-[0.98] hover:border-peach-200 hover:bg-peach-50/30 transition"
      : "");
  const content = (
    <>
      <div className="text-5xl mb-3">{emoji}</div>
      <p className="text-ink-500 text-sm">{text}</p>
      {hint && (
        <p className="text-peach-500 text-[11px] font-bold mt-2">{hint}</p>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

// Timeline placeholder rendered while usePlaces is in-flight. Three
// rough card skeletons match the actual list silhouette so the layout
// doesn't pop in once the data lands.
function TimelineSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 bg-white rounded-3xl border border-cream-200 p-4"
        >
          <div className="w-20 h-20 rounded-2xl bg-cream-100 flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-2/3 rounded bg-cream-100" />
            <div className="h-3 w-1/2 rounded bg-cream-100" />
            <div className="h-3 w-1/3 rounded bg-cream-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- roulette ----------

// Named export so ComparePage can mount this modal without redefining
// it. Lives here because it depends on inferCity / avgTotal which are
// defined at the top of this file; moving everything to its own
// component file is a future refactor.
export function RouletteModal({
  open,
  onClose,
  places,
  wishlist,
}: {
  open: boolean;
  onClose: () => void;
  places: PlaceWithFoods[];
  wishlist: WishlistPlace[];
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<RouletteSource>("both");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // Roulette city filter is multi-select on purpose — picking 2 or 3 cities
  // and spinning across them is a common "where should we eat tonight"
  // workflow. Empty set means "all cities".
  const [cityFilter, setCityFilter] = useState<Set<string>>(() => new Set());
  const [picked, setPicked] = useState<RouletteEntry | null>(null);
  const [spinning, setSpinning] = useState(false);

  const revisitEntries: RouletteEntry[] = useMemo(
    () =>
      places
        .filter((p) => p.want_to_revisit)
        .map((p) => ({
          kind: "revisit" as const,
          id: p.id,
          name: p.name,
          category: p.category,
          city: inferCity(p.address),
          avgScore: avgTotal(p),
          memo: null,
          linkTo: `/places/${p.id}`,
        })),
    [places]
  );

  const wishlistEntries: RouletteEntry[] = useMemo(
    () =>
      wishlist.map((w) => ({
        kind: "wishlist" as const,
        id: w.id,
        name: w.name,
        category: w.category,
        city: inferCity(w.address),
        avgScore: null,
        memo: w.memo,
        linkTo: `/places/new?fromWishlist=${w.id}`,
      })),
    [wishlist]
  );

  // Pool from the active source(s), before any filter is applied —
  // drives the chip lists (categories + cities) and the final pool.
  const sourcePool = useMemo(() => {
    const out: RouletteEntry[] = [];
    if (source === "revisit" || source === "both") out.push(...revisitEntries);
    if (source === "wishlist" || source === "both") out.push(...wishlistEntries);
    return out;
  }, [source, revisitEntries, wishlistEntries]);

  // Categories shown in chips — only those in entries that survive the
  // *other* filter (city). That way picking a city also narrows the
  // category list, and vice versa, so users don't pick a combo with
  // zero results.
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const e of sourcePool) {
      if (cityFilter.size > 0 && (!e.city || !cityFilter.has(e.city))) continue;
      if (e.category) cats.add(e.category);
    }
    return Array.from(cats);
  }, [sourcePool, cityFilter]);

  // GroupedMultiSelect options for the category dropdown — same shape
  // as PlaceFormPage / FoodFormPage so the picker UI is identical.
  // Filters CATEGORY_GROUPS to only show keys present in the current
  // (source + city) pool, then appends any freeform / custom categories
  // as flat options at the end.
  const categoryDropdownOptions = useMemo<GroupedMultiSelectEntry[]>(() => {
    const available = new Set(availableCategories);
    const out: GroupedMultiSelectEntry[] = [];
    const known = new Set<string>();
    for (const g of CATEGORY_GROUPS) {
      const subset = g.keys.filter((k) => available.has(k));
      for (const k of g.keys) known.add(k);
      if (subset.length === 0) continue;
      out.push({
        groupLabel: `${g.ko} · ${g.zh}`,
        options: subset.map((c) => ({
          value: c,
          label: t(`category.${c}`),
          emoji: categoryEmojiOf(c),
        })),
      });
    }
    for (const c of availableCategories) {
      if (known.has(c)) continue;
      out.push({ value: c, label: c, emoji: "✏️" });
    }
    return out;
  }, [availableCategories, t]);

  const availableCities = useMemo(() => {
    const byCount = new Map<string, number>();
    for (const e of sourcePool) {
      if (categoryFilter && e.category !== categoryFilter) continue;
      if (!e.city) continue;
      byCount.set(e.city, (byCount.get(e.city) ?? 0) + 1);
    }
    return [...byCount.entries()]
      .sort((a, b) =>
        b[1] - a[1] !== 0 ? b[1] - a[1] : a[0].localeCompare(b[0])
      )
      .map(([c]) => c);
  }, [sourcePool, categoryFilter]);

  const pool = useMemo(() => {
    let out = sourcePool;
    if (categoryFilter) out = out.filter((e) => e.category === categoryFilter);
    if (cityFilter.size > 0) {
      out = out.filter((e) => e.city != null && cityFilter.has(e.city));
    }
    return out;
  }, [sourcePool, categoryFilter, cityFilter]);

  // If the selected category/city is no longer in the active source, drop it.
  useEffect(() => {
    if (categoryFilter && !availableCategories.includes(categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [categoryFilter, availableCategories]);
  useEffect(() => {
    if (cityFilter.size === 0) return;
    const present = new Set(availableCities);
    let changed = false;
    const next = new Set<string>();
    for (const c of cityFilter) {
      if (present.has(c)) next.add(c);
      else changed = true;
    }
    if (changed) setCityFilter(next);
  }, [cityFilter, availableCities]);

  // Lock the page underneath while the roulette is open, and track the
  // visible viewport so the spin button stays above the keyboard / URL
  // bar collapse on iOS — same fix as WishlistAddSheet.
  useBodyScrollLock(open);
  const vv = useVisualViewport(open);

  // Reset on open/close, and seed a teaser pick when the pool changes.
  // setCityFilter must use the functional form and bail out when the Set
  // is already empty — passing `new Set()` unconditionally creates a new
  // reference each render, the cityFilter dep then changes, the effect
  // re-runs, and we get "Maximum update depth exceeded".
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setSpinning(false);
      setCategoryFilter(null);
      setCityFilter((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    if (pool.length > 0) {
      setPicked(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      setPicked(null);
    }
  }, [open, source, categoryFilter, cityFilter, pool.length]);

  function spin() {
    if (pool.length === 0 || spinning) return;
    setSpinning(true);
    setPicked(null);
    let count = 0;
    const interval = window.setInterval(() => {
      setPicked(pool[count % pool.length]);
      count++;
      if (count > 15) {
        window.clearInterval(interval);
        setPicked(pool[Math.floor(Math.random() * pool.length)]);
        setSpinning(false);
      }
    }, 100);
  }

  if (!open) return null;

  const sourceButton = (
    key: RouletteSource,
    label: string,
    icon: React.ReactNode
  ) => (
    <button
      type="button"
      key={key}
      onClick={() => setSource(key)}
      className={`flex-1 min-w-0 py-2 text-[11px] sm:text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 whitespace-nowrap ${
        source === key
          ? "bg-white shadow-sm text-ink-900"
          : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );

  const wrapperStyle: React.CSSProperties = vv
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        top: vv.offsetTop,
        height: vv.height,
        zIndex: 50,
      }
    : { position: "fixed", inset: 0, zIndex: 50 };

  return (
    <div className="flex items-end sm:items-center justify-center p-0 sm:p-4" style={wrapperStyle}>
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Same explicit-height + flex-column pattern as WishlistAddSheet:
          card has a fixed slot for header / scroll body / sticky
          action footer so the spin button is always reachable no
          matter how many category / city chips render. */}
      <div
        className="relative z-10 bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden"
        style={{
          overscrollBehavior: "contain",
          height: vv ? `${Math.max(vv.height - 24, vv.height * 0.7)}px` : "90dvh",
          maxHeight: vv ? `${vv.height}px` : "90dvh",
        }}
      >
        {/* Header — fixed at top, never scrolls. */}
        <div className="flex-shrink-0 relative px-5 pt-5 pb-3 border-b border-cream-100 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-cream-100 rounded-full text-ink-500 hover:bg-cream-200 active:scale-90 transition"
            aria-label="close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="text-3xl mb-1">🤔</div>
            <h2 className="text-base sm:text-lg font-sans font-bold text-ink-900 tracking-tight">
              오늘 뭐 먹지? · 今天吃啥？
            </h2>
          </div>
        </div>

        {/* Scrollable middle — tabs + chips + display. min-h-0 lets
            this child actually shrink so inner overflow kicks in. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
        <div className="flex bg-cream-100 p-1 rounded-xl mb-2.5">
          {sourceButton(
            "revisit",
            "또 갈래 · 二刷",
            <Heart
              className={`w-3.5 h-3.5 ${source === "revisit" ? "fill-rose-400 text-rose-400" : ""}`}
            />
          )}
          {sourceButton(
            "wishlist",
            "가볼래 · 种草",
            <BookmarkPlus className="w-3.5 h-3.5" />
          )}
          {sourceButton(
            "both",
            "다 돌려! · 交给天意",
            <Dice5 className="w-3.5 h-3.5" />
          )}
        </div>

        {/* category dropdown — same picker the place / food forms use,
            in singleSelect mode (roulette filters by one category at a
            time). Empty selection = "전부 · 全部". */}
        {availableCategories.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] font-bold text-ink-400 tracking-wider uppercase mb-1 px-0.5">
              종류 · 种类
            </p>
            <GroupedMultiSelect
              title="카테고리 · 种类"
              placeholder="전부 · 全部"
              options={categoryDropdownOptions}
              value={categoryFilter ? [categoryFilter] : []}
              onChange={(next) => setCategoryFilter(next[0] ?? null)}
              singleSelect
              allowEmpty
            />
          </div>
        )}

        {/* city chips — multi-select. Empty set = "all cities". */}
        {availableCities.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold text-ink-400 tracking-wider uppercase mb-1 px-0.5">
              도시 · 城市
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCityFilter(new Set())}
                className={`chip text-[11px] px-2.5 py-0.5 ${cityFilter.size === 0 ? "chip-active" : ""}`}
              >
                전부 · 全部
              </button>
              {availableCities.map((c) => {
                const active = cityFilter.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setCityFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(c)) next.delete(c);
                        else next.add(c);
                        return next;
                      })
                    }
                    className={`chip gap-1 text-[11px] px-2.5 py-0.5 ${active ? "chip-active" : ""}`}
                  >
                    📍 {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* display */}
        <div className="rounded-2xl h-36 sm:h-40 flex items-center justify-center border-2 border-dashed border-rose-200 bg-rose-50 mb-4 relative overflow-hidden">
          {spinning && (
            <div className="absolute inset-0 flex items-center justify-center text-5xl animate-bounce">
              🎲
            </div>
          )}
          {!spinning && picked && (
            <div className="text-center p-4">
              <span className="text-3xl block mb-2">
                {categoryIcon(picked.category)}
              </span>
              <h3 className="font-sans font-bold text-lg text-ink-900 px-2 truncate">
                {picked.name}
              </h3>
              {picked.kind === "revisit" && picked.avgScore !== null ? (
                <p className="inline-flex items-center gap-1 text-xs text-rose-500 mt-2 font-medium bg-rose-100/60 px-3 py-1 rounded-full">
                  <span>⭐</span>
                  <span className="font-number font-bold">
                    {picked.avgScore.toFixed(1)}
                  </span>
                  <span className="opacity-70">/ 10</span>
                </p>
              ) : (
                <p className="text-[11px] text-rose-500 mt-1.5 font-medium">
                  {picked.kind === "revisit"
                    ? "또 올래! · 必须二刷"
                    : "위시리스트 · 种草清单"}
                </p>
              )}
              {picked.memo && (
                <p className="text-[11px] text-ink-500 mt-1 truncate max-w-[220px] mx-auto">
                  {picked.memo}
                </p>
              )}
            </div>
          )}
          {!spinning && pool.length === 0 && (
            <p className="text-sm text-ink-400 text-center px-4">
              조건에 맞는 곳이 없어요
              <br />
              没找到符合条件的
            </p>
          )}
        </div>
        </div>

        {/* Footer — pinned at bottom. Spin + go-to buttons always
            reachable regardless of how many chips render above. */}
        <div
          className="flex-shrink-0 border-t border-cream-100 bg-white px-5 pt-3 flex gap-2"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
          }}
        >
          {picked && !spinning && pool.length > 0 && (
            <Link
              to={picked.linkTo}
              onClick={onClose}
              className="flex-1 min-w-0 text-center font-semibold text-[13px] sm:text-sm py-2.5 rounded-xl border border-cream-200 text-ink-700 hover:bg-cream-50 transition truncate"
            >
              보러가기 · 去看看
            </Link>
          )}
          <button
            type="button"
            onClick={spin}
            disabled={spinning || pool.length === 0}
            className="flex-[2] min-w-0 text-white font-bold text-[14px] sm:text-base py-2.5 rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-peach-400 to-rose-400 shadow-md"
          >
            {spinning ? (
              <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
            ) : (
              <Dice5 className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="truncate">
              {spinning ? "고르는 중… · 抽取中…" : "운명의 룰렛 · 听天由命"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

