import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookmarkPlus,
  CheckCircle2,
  Dice5,
  Heart,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import {
  usePlaces,
  useUpsertPlace,
  type PlaceWithFoods,
} from "@/hooks/usePlaces";
import {
  useAddWishlist,
  useDeleteWishlist,
  useWishlist,
} from "@/hooks/useWishlist";
import type { WishlistPlace } from "@/lib/database.types";
import {
  PLACE_CATEGORIES,
  categoryEmojiOf,
  isKnownPlaceCategory,
} from "@/lib/constants";
import { CategoryChips } from "@/components/CategoryChips";
import { formatDate } from "@/lib/utils";
import { LocationPicker } from "@/components/LocationPicker";

type Tab = "timeline" | "wishlist";
type ViewMode = "date" | "scoreDesc" | "scoreAsc" | "city";

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

export default function HomePage() {
  const { i18n } = useTranslation();
  const { data: couple } = useCouple();
  const { data: places, isLoading: placesLoading } = usePlaces(couple?.id);
  const { data: wishlist } = useWishlist(couple?.id);

  const [tab, setTab] = useState<Tab>("timeline");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [addWishlistOpen, setAddWishlistOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("date");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Base list: filter first, then sort per viewMode below.
  const baseList = useMemo(() => {
    if (!places) return [];
    let list = places;
    if (revisitOnly) list = list.filter((p) => p.want_to_revisit);
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
  }, [places, query, revisitOnly]);

  const filteredPlaces = useMemo(() => {
    const list = [...baseList];
    if (viewMode === "scoreDesc") {
      list.sort((a, b) => (avgTotal(b) ?? -1) - (avgTotal(a) ?? -1));
    } else if (viewMode === "scoreAsc") {
      list.sort((a, b) => (avgTotal(a) ?? Infinity) - (avgTotal(b) ?? Infinity));
    } else {
      // Default "date" and "city" both sort by date first; "city" also
      // groups downstream so order inside a group is date-desc.
      list.sort((a, b) => (a.date_visited < b.date_visited ? 1 : -1));
    }
    return list;
  }, [baseList, viewMode]);

  // All cities present in the current (filtered) timeline — feeds the
  // multi-select chip row when "도시별" is active.
  const allCities = useMemo(() => {
    if (viewMode !== "city") return [] as string[];
    const byCount = new Map<string, number>();
    for (const p of filteredPlaces) {
      const city = inferCity(p.address) ?? "기타 · 其他";
      byCount.set(city, (byCount.get(city) ?? 0) + 1);
    }
    return [...byCount.entries()]
      .sort((a, b) =>
        b[1] - a[1] !== 0 ? b[1] - a[1] : a[0].localeCompare(b[0])
      )
      .map(([c]) => c);
  }, [filteredPlaces, viewMode]);

  // Drop the selected city if it no longer exists in the current filter set.
  useEffect(() => {
    if (viewMode !== "city" || !selectedCity) return;
    if (!allCities.includes(selectedCity)) setSelectedCity(null);
  }, [allCities, viewMode, selectedCity]);

  // Group by inferred city for the city view. A selected city narrows the
  // groups to just that one; null means "show all".
  const cityGroups = useMemo(() => {
    if (viewMode !== "city") return null;
    const bucket = new Map<string, PlaceWithFoods[]>();
    for (const p of filteredPlaces) {
      const city = inferCity(p.address) ?? "기타 · 其他";
      if (selectedCity && selectedCity !== city) continue;
      if (!bucket.has(city)) bucket.set(city, []);
      bucket.get(city)!.push(p);
    }
    return [...bucket.entries()].sort((a, b) => {
      const byCount = b[1].length - a[1].length;
      return byCount !== 0 ? byCount : a[0].localeCompare(b[0]);
    });
  }, [filteredPlaces, viewMode, selectedCity]);

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
      if (!p.category) continue;
      byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
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
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="p-3 bg-cream-100/70 rounded-full text-ink-700 hover:bg-cream-200 transition border border-cream-200/50"
            aria-label="search"
          >
            <Search className="w-5 h-5" />
          </button>
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
              <button
                type="button"
                onClick={() => setRevisitOnly((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-semibold transition-all border whitespace-nowrap ${
                  revisitOnly
                    ? "bg-rose-50 text-rose-500 border-rose-200/60 shadow-[0_2px_10px_rgba(244,114,182,0.15)]"
                    : "bg-white text-ink-500 border-cream-200/60 shadow-sm hover:bg-cream-50"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${revisitOnly ? "fill-rose-500" : ""}`}
                />
                또 갈래! 맛집 · 必须二刷
              </button>
            </div>

            {/* View mode selector: date / score / city */}
            <div className="flex flex-wrap gap-1.5 mb-5 px-1">
              <ViewChip
                active={viewMode === "date"}
                onClick={() => setViewMode("date")}
                label="최근순 · 时间顺"
              />
              <ViewChip
                active={viewMode === "scoreDesc"}
                onClick={() => setViewMode("scoreDesc")}
                label="별점 높은순 · 评分高到低"
              />
              <ViewChip
                active={viewMode === "scoreAsc"}
                onClick={() => setViewMode("scoreAsc")}
                label="별점 낮은순 · 评分低到高"
              />
              <ViewChip
                active={viewMode === "city"}
                onClick={() => setViewMode("city")}
                label="도시별 · 按城市"
              />
            </div>

            {/* City single-select — only when 도시별 view is active.
                Null means "show all"; picking a city narrows to that one.
                Tapping the same city again clears the selection. */}
            {viewMode === "city" && allCities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5 px-1">
                <button
                  type="button"
                  onClick={() => setSelectedCity(null)}
                  className={`px-2.5 py-1 rounded-full text-[11px] sm:text-[12px] font-semibold transition border whitespace-nowrap ${
                    selectedCity === null
                      ? "bg-ink-900 text-white border-ink-900"
                      : "bg-white text-ink-500 border-cream-200/60 hover:bg-cream-50"
                  }`}
                >
                  전체 · 全部
                </button>
                {allCities.map((c) => {
                  const active = selectedCity === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setSelectedCity(active ? null : c)
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] sm:text-[12px] font-semibold transition border whitespace-nowrap flex items-center gap-1 ${
                        active
                          ? "bg-peach-100 text-peach-500 border-peach-200/70 shadow-sm"
                          : "bg-white text-ink-500 border-cream-200/60 hover:bg-cream-50"
                      }`}
                    >
                      📍 {c}
                    </button>
                  );
                })}
              </div>
            )}

            {placesLoading && (
              <p className="text-ink-500 py-8 text-center text-sm">
                로딩 중... · 加载中...
              </p>
            )}
            {!placesLoading && filteredPlaces.length === 0 && (
              <EmptyState
                emoji={revisitOnly ? "💖" : "🍽️"}
                text={
                  revisitOnly
                    ? "아직 ‘또 갈래’ 표시한 곳이 없어요 · 还没攒下想再去的神仙店铺"
                    : "아직 다녀온 곳이 없어요 · 还没有干饭记录"
                }
              />
            )}

            {viewMode === "city" && cityGroups ? (
              <div className="mt-2 space-y-6">
                {cityGroups.length === 0 && selectedCity && (
                  <EmptyState
                    emoji="📍"
                    text="선택한 도시에 기록이 없어요 · 这个城市还没有记录"
                  />
                )}
                {cityGroups.map(([city, list]) => (
                  <div key={city}>
                    <h3 className="font-sans font-bold text-sm text-ink-700 mb-2 px-1 flex items-center gap-2">
                      <span>{city}</span>
                      <span className="text-ink-400 text-xs font-number font-bold">
                        {list.length}
                      </span>
                    </h3>
                    <div>
                      {list.map((p, idx) => (
                        <TimelineItem
                          key={p.id}
                          place={p}
                          locale={i18n.language}
                          isLast={idx === list.length - 1}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2">
                {filteredPlaces.map((p, idx) => (
                  <TimelineItem
                    key={p.id}
                    place={p}
                    locale={i18n.language}
                    isLast={idx === filteredPlaces.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "wishlist" && (
          <WishlistView items={filteredWishlist} couple_id={couple?.id} />
        )}
      </main>

      {/* Floating action cluster — sits above bottom nav + device safe area */}
      <div
        className="fixed left-0 right-0 z-30 pointer-events-none px-5"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)",
        }}
      >
        <div className="max-w-md mx-auto flex justify-between items-end">
          <button
            type="button"
            onClick={() => setRouletteOpen(true)}
            className="pointer-events-auto w-16 h-16 rounded-full bg-white/95 backdrop-blur border border-peach-100 text-peach-500 shadow-airy flex items-center justify-center active:scale-90 transition hover:scale-105 hover:border-peach-200"
            aria-label="random pick"
          >
            <Dice5 className="w-7 h-7" />
          </button>
          {tab === "timeline" ? (
            <Link
              to="/places/new"
              className="pointer-events-auto w-16 h-16 rounded-full bg-gradient-to-br from-peach-400 to-rose-400 text-white shadow-lift flex items-center justify-center active:scale-90 transition hover:scale-105"
              aria-label="add place"
            >
              <Plus className="w-7 h-7" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setAddWishlistOpen(true)}
              className="pointer-events-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-peach-400 text-white shadow-lift flex items-center justify-center active:scale-90 transition hover:scale-105"
              aria-label="add wishlist"
            >
              <BookmarkPlus className="w-7 h-7" />
            </button>
          )}
        </div>
      </div>

      <RouletteModal
        open={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        places={places ?? []}
        wishlist={wishlist ?? []}
      />

      {addWishlistOpen && couple && (
        <WishlistAddSheet
          coupleId={couple.id}
          onClose={() => setAddWishlistOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- tab button ----------

function ViewChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] sm:text-[12px] font-semibold transition border whitespace-nowrap ${
        active
          ? "bg-peach-100 text-peach-500 border-peach-200/70 shadow-sm"
          : "bg-white text-ink-500 border-cream-200/60 hover:bg-cream-50"
      }`}
    >
      {label}
    </button>
  );
}

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
      className={`relative pb-3 text-[12px] sm:text-[13px] font-semibold transition whitespace-nowrap text-center flex-1 min-w-0 truncate ${
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

function TimelineItem({
  place,
  locale,
  isLast,
}: {
  place: PlaceWithFoods;
  locale: string;
  isLast: boolean;
}) {
  const avg = avgTotal(place);
  return (
    <div className="relative pl-6 pb-6">
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-rose-200" />
      )}
      <div className="absolute left-0 top-2 w-6 h-6 rounded-full bg-white border-[3px] border-rose-400 z-[1]" />

      <div className="mb-1.5 pl-2">
        <span className="text-[11px] font-semibold text-ink-400 tracking-wide">
          {formatDate(place.date_visited, locale)}
        </span>
      </div>

      <Link
        to={`/places/${place.id}`}
        className="block bg-white rounded-2xl p-4 ml-2 border border-cream-200 shadow-soft active:scale-[0.98] transition"
      >
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-cream-50 border border-cream-100 flex items-center justify-center text-3xl">
            {place.photo_urls?.[0] ? (
              <img
                src={place.photo_urls[0]}
                alt={place.name}
                className="w-full h-full object-cover"
              />
            ) : (
              categoryIcon(place.category)
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-ink-900 truncate">
                {place.name}
              </h3>
              {place.want_to_revisit && (
                <Heart className="w-4 h-4 fill-rose-400 text-rose-400 flex-shrink-0" />
              )}
            </div>
            {place.address && (
              <p className="text-[11px] text-ink-500 mt-1 flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{place.address}</span>
              </p>
            )}
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              {avg !== null ? (
                <span className="inline-flex items-center bg-peach-50 text-peach-500 px-2 py-0.5 rounded-lg text-xs font-bold border border-peach-100">
                  <span className="mr-1">⭐</span>
                  <span className="font-number">{avg.toFixed(1)}</span>
                </span>
              ) : (
                <span className="text-[11px] text-ink-400">
                  아직 평가 전 · 等待打分
                </span>
              )}
              <span className="text-[11px] text-ink-500 bg-cream-50 border border-cream-200 px-2 py-0.5 rounded-lg">
                🍽️ <span className="font-number font-bold">{(place.foods ?? []).length}</span> <span className="opacity-70">개 · 道</span>
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const del = useDeleteWishlist();
  const upsertPlace = useUpsertPlace();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm(t("common.confirmDelete"))) return;
    await del.mutateAsync(id);
  }

  async function onMarkVisited(item: WishlistPlace) {
    if (!couple_id || !user) return;
    setBusyId(item.id);
    setErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const place = await upsertPlace.mutateAsync({
        coupleId: couple_id,
        userId: user.id,
        values: {
          name: item.name,
          date_visited: today,
          address: item.address,
          category: item.category,
          memo: item.memo,
          want_to_revisit: false,
          latitude: item.latitude,
          longitude: item.longitude,
          photo_urls: null,
        },
      });
      await del.mutateAsync(item.id);
      // Jump straight to the new place so the user can log foods / photos.
      if (place && typeof place === "object" && "id" in place) {
        navigate(`/places/${(place as { id: string }).id}`);
      }
    } catch (e: unknown) {
      console.error("[WishlistView] mark visited failed:", e);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!couple_id) return null;

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📝"
        text="위시리스트를 채워봐요 · 赶紧种种草吧"
      />
    );
  }

  return (
    <>
      {err && (
        <p className="text-xs text-rose-500 mb-3 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {err}
        </p>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <WishlistCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onDelete={() => void onDelete(item.id)}
            onMarkVisited={() => void onMarkVisited(item)}
          />
        ))}
      </div>
    </>
  );
}

function WishlistCard({
  item,
  busy,
  onDelete,
  onMarkVisited,
}: {
  item: WishlistPlace;
  busy: boolean;
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
              disabled={busy}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-500 text-xs font-bold rounded-lg border border-rose-100 hover:bg-rose-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              {busy ? "옮기는 중… · 记录中…" : "다녀왔어요! · 拔草成功"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- wishlist add sheet ----------

function WishlistAddSheet({
  coupleId,
  onClose,
}: {
  coupleId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const add = useAddWishlist();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("");
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    try {
      await add.mutateAsync({
        coupleId,
        name: name.trim(),
        category,
        memo: memo.trim() || null,
        address: address.trim() || null,
        latitude: coord?.lat ?? null,
        longitude: coord?.lng ?? null,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-sans font-bold text-lg">
            위시리스트 · 种草清单
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-cream-100 rounded-full text-ink-500"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-ink-700">
              {t("place.location")}
            </label>
            <LocationPicker
              value={coord}
              label={placeLabel}
              onChange={(v) => {
                setCoord(v);
                if (!v) setPlaceLabel(null);
              }}
              onPlaceSelected={(p) => {
                setPlaceLabel(p.name || null);
                if (!name) setName(p.name);
                if (!address) setAddress(p.address);
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-ink-700">
              이름 · 店名 *
            </label>
            <input
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예) 남산 뷰 카페 / 例：南山景观咖啡"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-ink-700">
              {t("place.address")}
            </label>
            <input
              className="input-base"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("place.addressPh")}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-ink-700">
              {t("place.category")}
            </label>
            <CategoryChips
              options={PLACE_CATEGORIES}
              value={category}
              onChange={setCategory}
              scope="category"
              customKey="other"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-ink-700">
              메모 · 备注
            </label>
            <textarea
              className="input-base min-h-[70px]"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="인스타에서 봤음! · 在小红书上看到的"
            />
          </div>

          {err && <p className="text-xs text-rose-500">{err}</p>}

          <button
            type="submit"
            disabled={!name.trim() || add.isPending}
            className="btn-primary w-full"
          >
            <BookmarkPlus className="w-5 h-5" />
            저장 · 存起来
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- generic empty ----------

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="py-14 text-center bg-white rounded-3xl border border-dashed border-cream-200">
      <div className="text-5xl mb-3">{emoji}</div>
      <p className="text-ink-500 text-sm">{text}</p>
    </div>
  );
}

// ---------- roulette ----------

function RouletteModal({
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 sm:p-6 shadow-2xl overflow-y-auto"
        style={{
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 1rem)",
          paddingBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 bg-cream-100 rounded-full text-ink-500 hover:bg-cream-200 transition"
          aria-label="close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-3 mt-1">
          <div className="text-3xl sm:text-4xl mb-1.5">🤔</div>
          <h2 className="text-lg sm:text-xl font-sans font-bold text-ink-900 tracking-tight">
            오늘 뭐 먹지? · 今天吃啥？
          </h2>
        </div>

        {/* source tabs */}
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
            "다 돌려! · 全都要",
            <Dice5 className="w-3.5 h-3.5" />
          )}
        </div>

        {/* category chips */}
        <div className="mb-2">
          <p className="text-[10px] font-bold text-ink-400 tracking-wider uppercase mb-1 px-0.5">
            종류 · 种类
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={`chip text-[11px] px-2.5 py-0.5 ${categoryFilter === null ? "chip-active" : ""}`}
            >
              전부 · 全部
            </button>
            {availableCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setCategoryFilter(categoryFilter === c ? null : c)
                }
                className={`chip gap-1 text-[11px] px-2.5 py-0.5 ${categoryFilter === c ? "chip-active" : ""}`}
              >
                <span>{categoryIcon(c)}</span>
                {t(`category.${c}`)}
              </button>
            ))}
          </div>
        </div>

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

        <div className="flex gap-2">
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
