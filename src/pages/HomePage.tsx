import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dice5,
  Heart,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces, type PlaceWithFoods } from "@/hooks/usePlaces";
import { formatDate } from "@/lib/utils";

function avgTotal(p: PlaceWithFoods): number | null {
  const scores = (p.foods ?? [])
    .map((f) => (f.my_rating ?? 0) + (f.partner_rating ?? 0))
    .filter((n) => n > 0);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

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

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: couple } = useCouple();
  const { data: places, isLoading } = usePlaces(couple?.id);
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);

  const sorted = useMemo(() => {
    if (!places) return [];
    return [...places].sort((a, b) =>
      a.date_visited < b.date_visited ? 1 : -1
    );
  }, [places]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((p) => {
      const hay = `${p.name} ${p.address ?? ""} ${p.memo ?? ""}`.toLowerCase();
      const foodHit = (p.foods ?? []).some((f) =>
        f.name.toLowerCase().includes(q)
      );
      return hay.includes(q) || foodHit;
    });
  }, [sorted, query]);

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

  const revisitList = useMemo(
    () => (places ?? []).filter((p) => p.want_to_revisit),
    [places]
  );

  return (
    <div className="relative">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-cream-200 px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
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
          <div className="mt-3">
            <input
              autoFocus
              className="input-base"
              placeholder={t("common.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </header>

      <main className="px-5 py-5">
        <StatsDashboard stats={stats} />

        <div className="flex items-center justify-between mt-8 mb-4 px-1">
          <h2 className="font-display font-bold text-base text-ink-900">
            우리의 발자취 · 我们的足迹 👣
          </h2>
          {filtered.length > 0 && (
            <span className="text-xs text-ink-400">{filtered.length}</span>
          )}
        </div>

        {isLoading && (
          <p className="text-ink-500 py-8 text-center text-sm">
            {t("common.loading")}
          </p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="py-14 text-center bg-white rounded-3xl border border-dashed border-cream-200">
            <div className="text-5xl mb-3">🍽️</div>
            <p className="text-ink-500 text-sm">{t("common.empty")}</p>
          </div>
        )}

        <div className="mt-2">
          {filtered.map((p, idx) => (
            <TimelineItem
              key={p.id}
              place={p}
              locale={i18n.language}
              isLast={idx === filtered.length - 1}
              tKey={t}
            />
          ))}
        </div>
      </main>

      {/* Floating action cluster — sits above the bottom nav (pb-20). */}
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
          <Link
            to="/places/new"
            className="pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-br from-peach-400 to-rose-400 text-white shadow-[0_8px_30px_rgba(249,168,212,0.5)] flex items-center justify-center active:scale-90 transition"
            aria-label="add place"
          >
            <Plus className="w-7 h-7" />
          </Link>
        </div>
      </div>

      <RouletteModal
        open={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        revisitList={revisitList}
      />
    </div>
  );
}

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
          총 {stats.total}곳 · 共 {stats.total} 处
        </span>
      </div>
      <div className="h-10 w-px bg-rose-200 flex-shrink-0" />
      <div className="flex flex-col gap-1 items-end min-w-0">
        <span className="text-[11px] font-bold text-peach-500 tracking-widest uppercase">
          가장 많이 · 最多
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
      {/* vertical connector line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-rose-200" />
      )}
      {/* dot */}
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
                <span className="text-[11px] text-ink-400">평가 전 · 未评</span>
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

function RouletteModal({
  open,
  onClose,
  revisitList,
}: {
  open: boolean;
  onClose: () => void;
  revisitList: PlaceWithFoods[];
}) {
  const [picked, setPicked] = useState<PlaceWithFoods | null>(null);
  const [spinning, setSpinning] = useState(false);

  // Reset state when opened / closed.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setSpinning(false);
      return;
    }
    if (revisitList.length > 0) {
      setPicked(revisitList[Math.floor(Math.random() * revisitList.length)]);
    } else {
      setPicked(null);
    }
  }, [open, revisitList]);

  function spin() {
    if (revisitList.length === 0 || spinning) return;
    setSpinning(true);
    setPicked(null);
    let count = 0;
    const interval = window.setInterval(() => {
      setPicked(revisitList[count % revisitList.length]);
      count++;
      if (count > 15) {
        window.clearInterval(interval);
        const winner =
          revisitList[Math.floor(Math.random() * revisitList.length)];
        setPicked(winner);
        setSpinning(false);
      }
    }, 100);
  }

  if (!open) return null;
  const avg = picked ? avgTotal(picked) : null;

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

        <div className="text-center mb-5 mt-2">
          <div className="text-4xl mb-2">🤔</div>
          <h2 className="text-xl font-display font-bold text-ink-900">
            오늘 뭐 먹지? · 今天吃什么？
          </h2>
          <p className="text-[11px] text-ink-400 mt-1">
            재방문 하트 찍은 곳 중 랜덤 · 从“想再去”里随机选一个
          </p>
        </div>

        <div className="rounded-2xl h-44 flex items-center justify-center border-2 border-dashed border-rose-200 bg-rose-50 mb-6 relative overflow-hidden">
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
              {avg !== null && (
                <p className="text-xs text-rose-500 mt-1 font-medium">
                  ⭐ {avg.toFixed(1)} / 10
                </p>
              )}
            </div>
          )}
          {!spinning && revisitList.length === 0 && (
            <p className="text-sm text-ink-400 text-center px-4">
              아직 재방문 체크한 곳이 없어요
              <br />
              还没有“想再去”的地方
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {picked && !spinning && revisitList.length > 0 && (
            <Link
              to={`/places/${picked.id}`}
              onClick={onClose}
              className="flex-1 text-center font-semibold py-3 rounded-xl border border-cream-200 text-ink-700 hover:bg-cream-50 transition"
            >
              보러가기 · 查看
            </Link>
          )}
          <button
            type="button"
            onClick={spin}
            disabled={spinning || revisitList.length === 0}
            className="flex-[2] text-white font-bold text-base py-3 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-peach-400 to-rose-400 shadow-md"
          >
            {spinning ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Dice5 className="w-5 h-5" />
            )}
            {spinning
              ? "고르는 중… · 选择中…"
              : "랜덤 뽑기 · 随机选"}
          </button>
        </div>
      </div>
    </div>
  );
}
