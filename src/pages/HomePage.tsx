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
import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { LocationPicker } from "@/components/LocationPicker";

type Tab = "timeline" | "wishlist";
type RouletteSource = "revisit" | "wishlist" | "both";
type RouletteEntry = {
  kind: "revisit" | "wishlist";
  id: string;
  name: string;
  category: string | null;
  avgScore: number | null;
  memo: string | null;
  linkTo: string;
};

const CATEGORY_ICONS: Record<string, string> = {
  korean: "🍚",
  japanese: "🍣",
  chinese: "🥟",
  italian: "🍝",
  western: "🍔",
  cafe: "☕",
  dessert: "🍰",
  bar: "🍷",
  other: "🍽️",
};

function categoryIcon(cat: string | null | undefined) {
  return (cat && CATEGORY_ICONS[cat]) || "🍽️";
}

function avgTotal(p: PlaceWithFoods): number | null {
  const scores = (p.foods ?? [])
    .map((f) => (f.my_rating ?? 0) + (f.partner_rating ?? 0))
    .filter((n) => n > 0);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: couple } = useCouple();
  const { data: places, isLoading: placesLoading } = usePlaces(couple?.id);
  const { data: wishlist } = useWishlist(couple?.id);

  const [tab, setTab] = useState<Tab>("timeline");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [addWishlistOpen, setAddWishlistOpen] = useState(false);

  const sortedPlaces = useMemo(() => {
    if (!places) return [];
    return [...places].sort((a, b) =>
      a.date_visited < b.date_visited ? 1 : -1
    );
  }, [places]);

  const filteredPlaces = useMemo(() => {
    let list = sortedPlaces;
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
  }, [sortedPlaces, query, revisitOnly]);

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
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-cream-200 px-5 pt-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-peach-400 to-rose-400 truncate">
              {t("app.title")}
            </h1>
            <p className="text-[11px] text-ink-400 font-medium tracking-wider">
              COUPLE FOOD DIARY
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="p-2 bg-cream-100 rounded-full text-ink-700 hover:bg-cream-200 transition"
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
              placeholder={t("common.search")}
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
            label="발자취 · 足迹 👣"
          />
          <TabButton
            active={tab === "wishlist"}
            accent="peach"
            onClick={() => setTab("wishlist")}
            label="가고파 · 心愿单 📝"
            count={wishlist?.length}
          />
        </div>
      </header>

      <main className="px-5 py-5">
        {tab === "timeline" && (
          <>
            <StatsDashboard stats={stats} />

            <div className="flex items-center justify-between mt-7 mb-4 px-1 gap-2">
              <h2 className="font-display font-bold text-base text-ink-900 flex items-center gap-2">
                <span>다녀온 곳 · 去过的地方</span>
                <span className="text-rose-500 text-xs font-black bg-rose-50 px-2 py-0.5 rounded-full">
                  {filteredPlaces.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setRevisitOnly((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                  revisitOnly
                    ? "bg-rose-50 text-rose-500 border-rose-200 shadow-sm"
                    : "bg-white text-ink-500 border-cream-200"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${revisitOnly ? "fill-rose-500" : ""}`}
                />
                또 갈래만 · 只看想再去
              </button>
            </div>

            {placesLoading && (
              <p className="text-ink-500 py-8 text-center text-sm">
                {t("common.loading")}
              </p>
            )}
            {!placesLoading && filteredPlaces.length === 0 && (
              <EmptyState
                emoji={revisitOnly ? "💖" : "🍽️"}
                text={
                  revisitOnly
                    ? "아직 ‘또 갈래’ 표시한 곳이 없어요 · 还没有想再去的地方"
                    : t("common.empty")
                }
              />
            )}

            <div className="mt-2">
              {filteredPlaces.map((p, idx) => (
                <TimelineItem
                  key={p.id}
                  place={p}
                  locale={i18n.language}
                  isLast={idx === filteredPlaces.length - 1}
                  tKey={t}
                />
              ))}
            </div>
          </>
        )}

        {tab === "wishlist" && (
          <WishlistView items={filteredWishlist} couple_id={couple?.id} />
        )}
      </main>

      {/* Floating action cluster */}
      <div className="fixed bottom-24 left-0 right-0 z-30 pointer-events-none px-5">
        <div className="max-w-md mx-auto flex justify-between items-end">
          <button
            type="button"
            onClick={() => setRouletteOpen(true)}
            className="pointer-events-auto w-14 h-14 rounded-full bg-white border-2 border-peach-100 text-peach-500 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center justify-center active:scale-90 transition hover:border-peach-200"
            aria-label="random pick"
          >
            <Dice5 className="w-7 h-7" />
          </button>
          {tab === "timeline" ? (
            <Link
              to="/places/new"
              className="pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-br from-peach-400 to-rose-400 text-white shadow-[0_8px_30px_rgba(249,168,212,0.5)] flex items-center justify-center active:scale-90 transition"
              aria-label="add place"
            >
              <Plus className="w-7 h-7" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setAddWishlistOpen(true)}
              className="pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-peach-400 text-white shadow-[0_8px_30px_rgba(249,168,212,0.5)] flex items-center justify-center active:scale-90 transition"
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
      className={`relative pb-3 text-[13px] font-semibold transition whitespace-nowrap text-center flex-1 ${
        active ? activeText : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span className="ml-1 text-[10px] text-ink-400 font-medium">
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
    <div className="bg-gradient-to-r from-peach-100 to-rose-100 rounded-3xl p-5 border border-rose-200 shadow-soft flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[11px] font-bold text-rose-500 tracking-widest uppercase">
          우리의 기록 · 我们的记录
        </span>
        <span className="text-2xl font-display font-black text-ink-900">
          {stats.total}곳 · {stats.total} 个地方
        </span>
      </div>
      <div className="h-10 w-px bg-rose-200 flex-shrink-0" />
      <div className="flex flex-col gap-1 items-end min-w-0">
        <span className="text-[11px] font-bold text-peach-500 tracking-widest uppercase">
          제일 자주 · 最多吃的
        </span>
        <span className="text-base font-display font-black text-ink-900 truncate">
          {stats.topCategory
            ? `${categoryIcon(stats.topCategory)} ${t(`category.${stats.topCategory}`)} (${stats.topCount})`
            : "-"}
        </span>
      </div>
    </div>
  );
}

// ---------- timeline card ----------

function TimelineItem({
  place,
  locale,
  isLast,
  tKey,
}: {
  place: PlaceWithFoods;
  locale: string;
  isLast: boolean;
  tKey: (k: string) => string;
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
            <div className="flex items-center gap-2 mt-2">
              {avg !== null ? (
                <span className="bg-peach-50 text-peach-500 px-2 py-0.5 rounded-md text-xs font-bold border border-peach-100">
                  ⭐ {avg.toFixed(1)}
                </span>
              ) : (
                <span className="text-[11px] text-ink-400">
                  아직 평가 전 · 还没评分
                </span>
              )}
              <span className="text-[11px] text-ink-400">
                {tKey("place.foods")} {(place.foods ?? []).length}
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
        text="가고 싶은 곳을 추가해봐요 · 加几个想去的地方吧"
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
              {busy ? "옮기는 중… · 收藏中…" : "다녀왔어요 · 我们去过了"}
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
  const [category, setCategory] = useState<PlaceCategory | null>(null);
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
          <h2 className="font-display font-bold text-lg">
            가고 싶은 곳 · 加进心愿单
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
            <div className="flex flex-wrap gap-1.5">
              {PLACE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setCategory(category === c ? null : (c as PlaceCategory))
                  }
                  className={`chip gap-1 ${category === c ? "chip-active" : ""}`}
                >
                  <span>{categoryIcon(c)}</span>
                  {t(`category.${c}`)}
                </button>
              ))}
            </div>
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
        avgScore: null,
        memo: w.memo,
        linkTo: `/places/new?fromWishlist=${w.id}`,
      })),
    [wishlist]
  );

  // Union of categories present in whichever source(s) are active.
  const availableCategories = useMemo(() => {
    const pool: RouletteEntry[] = [];
    if (source === "revisit" || source === "both") pool.push(...revisitEntries);
    if (source === "wishlist" || source === "both") pool.push(...wishlistEntries);
    const cats = new Set<string>();
    for (const e of pool) {
      if (e.category) cats.add(e.category);
    }
    return Array.from(cats);
  }, [source, revisitEntries, wishlistEntries]);

  const pool = useMemo(() => {
    const out: RouletteEntry[] = [];
    if (source === "revisit" || source === "both") out.push(...revisitEntries);
    if (source === "wishlist" || source === "both") out.push(...wishlistEntries);
    if (categoryFilter) return out.filter((e) => e.category === categoryFilter);
    return out;
  }, [source, revisitEntries, wishlistEntries, categoryFilter]);

  // If the selected category is no longer in the active source, drop the filter.
  useEffect(() => {
    if (categoryFilter && !availableCategories.includes(categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [categoryFilter, availableCategories]);

  // Reset on open/close, and seed a teaser pick when the pool changes.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setSpinning(false);
      return;
    }
    if (pool.length > 0) {
      setPicked(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      setPicked(null);
    }
  }, [open, source, categoryFilter, pool.length]);

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

  const sourceButton = (key: RouletteSource, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      key={key}
      onClick={() => setSource(key)}
      className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
        source === key
          ? "bg-white shadow-sm text-ink-900"
          : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-cream-100 rounded-full text-ink-500 hover:bg-cream-200 transition"
          aria-label="close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-4 mt-2">
          <div className="text-4xl mb-2">🤔</div>
          <h2 className="text-xl font-display font-bold text-ink-900">
            오늘 뭐 먹지? · 今天吃啥？
          </h2>
        </div>

        {/* source tabs */}
        <div className="flex bg-cream-100 p-1 rounded-xl mb-3">
          {sourceButton(
            "revisit",
            "또 갈래 · 又想去",
            <Heart
              className={`w-3.5 h-3.5 ${source === "revisit" ? "fill-rose-400 text-rose-400" : ""}`}
            />
          )}
          {sourceButton(
            "wishlist",
            "가볼래 · 想去",
            <BookmarkPlus className="w-3.5 h-3.5" />
          )}
          {sourceButton("both", "다 · 都来", <Dice5 className="w-3.5 h-3.5" />)}
        </div>

        {/* category chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={`chip ${categoryFilter === null ? "chip-active" : ""}`}
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
              className={`chip gap-1 ${categoryFilter === c ? "chip-active" : ""}`}
            >
              <span>{categoryIcon(c)}</span>
              {t(`category.${c}`)}
            </button>
          ))}
        </div>

        {/* display */}
        <div className="rounded-2xl h-40 flex items-center justify-center border-2 border-dashed border-rose-200 bg-rose-50 mb-5 relative overflow-hidden">
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
              <h3 className="font-display font-bold text-lg text-ink-900 px-2 truncate">
                {picked.name}
              </h3>
              <p className="text-[11px] text-rose-500 mt-1 font-medium">
                {picked.kind === "revisit"
                  ? picked.avgScore !== null
                    ? `⭐ ${picked.avgScore.toFixed(1)} / 10 · 又想去`
                    : "또 갈래 · 又想去"
                  : "가볼래 · 想去看看"}
              </p>
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
              这个条件下没东西可挑
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {picked && !spinning && pool.length > 0 && (
            <Link
              to={picked.linkTo}
              onClick={onClose}
              className="flex-1 text-center font-semibold py-3 rounded-xl border border-cream-200 text-ink-700 hover:bg-cream-50 transition"
            >
              보러가기 · 去看看
            </Link>
          )}
          <button
            type="button"
            onClick={spin}
            disabled={spinning || pool.length === 0}
            className="flex-[2] text-white font-bold text-base py-3 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-peach-400 to-rose-400 shadow-md"
          >
            {spinning ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Dice5 className="w-5 h-5" />
            )}
            {spinning ? "고르는 중… · 转一下…" : "랜덤 뽑기 · 随便来一个"}
          </button>
        </div>
      </div>
    </div>
  );
}
