import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CATEGORY_GROUPS,
  categoryEmojiOf,
  isKnownPlaceCategory,
} from "@/lib/constants";
import {
  ChefHat,
  ChevronDown,
  Dice5,
  Dna,
  Frown,
  HeartHandshake,
  RefreshCw,
  Scale,
  Settings2,
  Swords,
  Trophy,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { useWishlist } from "@/hooks/useWishlist";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { PageHeader } from "@/components/PageHeader";
import { PullIndicator } from "@/components/PullIndicator";
import { useRefreshControls } from "@/hooks/useRefreshControls";
import { getCategories, ratingsForViewer } from "@/lib/utils";
import { RouletteModal } from "@/pages/HomePage";

type DiningFilter = "all" | "out" | "home";
// 명예의 전당 흡수 후 3-tab 구성: fame(명예의 전당, top 3 + 그 외 4.5+
// 메뉴 묶음) / clash / pass. 이전에는 명예의 전당 / 천생연분이 사실상
// 같은 4.5+ 풀에서 잘려 나가 두 탭이 겹쳐 보였음.
type TabId = "fame" | "clash" | "pass";

// Carousel cards are user-configurable: the user can reorder them and
// hide ones they don't care about. State lives in sessionStorage so
// it survives reloads within the session but doesn't bleed across
// devices/installs (intentionally lightweight — not worth a server
// round-trip).
type CardId = "diagnosis" | "rating" | "chef" | "roulette";

const DEFAULT_CARD_ORDER: CardId[] = [
  "diagnosis",
  "rating",
  "chef",
  "roulette",
];

const CARD_META: Record<
  CardId,
  { emoji: string; ko: string; zh: string }
> = {
  diagnosis: { emoji: "🧬", ko: "우리의 입맛 진단", zh: "口味诊断" },
  rating: {
    emoji: "🧚",
    ko: "별점 요정 vs 깐깐징어",
    zh: "打分天使 vs 严格考官",
  },
  chef: { emoji: "🍳", ko: "우리집 미슐랭", zh: "家庭米其林" },
  roulette: { emoji: "🎲", ko: "운명의 룰렛", zh: "听天由命" },
};

// Old configs (sessionStorage) saved before the merge had separate
// sync/battle/bti card ids; map any of those onto the new diagnosis
// card so a returning user sees one unified card instead of nothing.
const LEGACY_CARD_IDS = new Set(["sync", "battle", "bti"]);

const CARD_CONFIG_KEY = "compare:cardConfig:v1";

type CardConfig = { order: CardId[]; hidden: CardId[] };

const DEFAULT_CONFIG: CardConfig = {
  order: DEFAULT_CARD_ORDER,
  hidden: [],
};

// Load + sanitize: drop unknown ids, ensure every known id appears in
// order exactly once (so adding a new card later auto-shows for
// existing users).
function loadCardConfig(): CardConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.sessionStorage.getItem(CARD_CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<CardConfig>;
    const known = new Set<CardId>(DEFAULT_CARD_ORDER);
    const order: CardId[] = [];
    const seen = new Set<CardId>();
    let sawLegacyDiagnosis = false;
    for (const id of parsed.order ?? []) {
      // Legacy ids (sync/battle/bti) all collapse into the new
      // diagnosis card. We insert it once at the position of the
      // first legacy id so the user's relative ordering is preserved.
      if (LEGACY_CARD_IDS.has(id as string)) {
        if (!sawLegacyDiagnosis && !seen.has("diagnosis")) {
          order.push("diagnosis");
          seen.add("diagnosis");
          sawLegacyDiagnosis = true;
        }
        continue;
      }
      if (known.has(id as CardId) && !seen.has(id as CardId)) {
        order.push(id as CardId);
        seen.add(id as CardId);
      }
    }
    for (const id of DEFAULT_CARD_ORDER) {
      if (!seen.has(id)) order.push(id);
    }
    const hidden = (parsed.hidden ?? [])
      .map((id) => (LEGACY_CARD_IDS.has(id as string) ? "diagnosis" : id))
      .filter((id, idx, arr): id is CardId => {
        if (!known.has(id as CardId)) return false;
        // Dedupe (multiple legacy hidden ids → diagnosis once).
        return arr.indexOf(id) === idx;
      });
    return { order, hidden };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveCardConfig(cfg: CardConfig) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CARD_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    // sessionStorage can throw in private mode — config is non-critical
    // so silently skip persistence.
  }
}

type Row = {
  foodId: string;
  placeId: string;
  placeName: string;
  foodName: string;
  isHomeCooked: boolean;
  placeCategories: string[];
  mine: number;
  partner: number;
  // Stored from the food creator's perspective. ChefHat / chef-share
  // calculations swap to viewer perspective at render time.
  chef: "me" | "partner" | "together" | null;
  createdBy: string | null;
};

// ---------- 푸드 BTI ----------
//
// Categories alone don't carry tags like "spicy" or "meat", so the BTI
// is derived from the parent place's categories array. Each category
// feeds 1+ BTI buckets; the bucket with the highest average couple
// score becomes the couple's "type", with the rest listed as a
// percentage breakdown.

type BtiKey =
  | "korean"
  | "western"
  | "asian"
  | "sweet"
  | "exotic"
  | "drinker"
  | "cafe"
  | "japanese";

const BTI_PROFILES: Record<
  BtiKey,
  {
    emoji: string;
    titleKo: string;
    titleZh: string;
    descKo: string;
    descZh: string;
    gradient: string;
    bar: string;
  }
> = {
  korean: {
    emoji: "🥘",
    titleKo: "뼛속까지 국밥부장관",
    titleZh: "韩食胃",
    descKo: "결국 돌고 돌아 든든한 한식이 최고!",
    descZh: "走到哪都忘不了那一碗汤饭！",
    gradient: "from-teal-500 to-emerald-500",
    bar: "bg-teal-500",
  },
  western: {
    emoji: "🍝",
    titleKo: "감성 사냥꾼",
    titleZh: "西餐死忠粉",
    descKo: "기념일엔 무조건 양식 핫플!",
    descZh: "约会必吃西餐，氛围感拉满！",
    gradient: "from-amber-400 to-orange-400",
    bar: "bg-amber-400",
  },
  asian: {
    emoji: "🥟",
    titleKo: "아시아 미식가",
    titleZh: "亚洲菜达人",
    descKo: "젓가락 하나로 아시아를 정복!",
    descZh: "亚洲菜系全方位征服！",
    gradient: "from-rose-400 to-red-400",
    bar: "bg-rose-400",
  },
  sweet: {
    emoji: "🍰",
    titleKo: "달달구리 킬러들",
    titleZh: "甜品控",
    descKo: "밥 배랑 디저트 배는 따로 있다!",
    descZh: "吃再饱也要留肚子吃甜品！",
    gradient: "from-pink-400 to-rose-400",
    bar: "bg-pink-400",
  },
  exotic: {
    emoji: "🌮",
    titleKo: "글로벌 미식가 커플",
    titleZh: "环球美食家",
    descKo: "새로운 이국적인 맛 대환영!",
    descZh: "喜欢尝鲜，世界美食都要吃遍！",
    gradient: "from-indigo-400 to-purple-500",
    bar: "bg-indigo-400",
  },
  drinker: {
    emoji: "🍷",
    titleKo: "술꾼 커플",
    titleZh: "微醺二人组",
    descKo: "한 잔의 여유는 못 참지!",
    descZh: "小酒一杯，氛围感拉满！",
    gradient: "from-purple-500 to-fuchsia-500",
    bar: "bg-purple-500",
  },
  cafe: {
    emoji: "☕",
    titleKo: "프로 카페투어러",
    titleZh: "咖啡控",
    descKo: "카페 투어가 데이트의 정석!",
    descZh: "约会必须打卡咖啡店！",
    gradient: "from-amber-600 to-yellow-700",
    bar: "bg-amber-700",
  },
  japanese: {
    emoji: "🍣",
    titleKo: "일식 덕후",
    titleZh: "日料控",
    descKo: "초밥 한 조각이 인생의 낙!",
    descZh: "一口寿司就是幸福！",
    gradient: "from-rose-500 to-pink-600",
    bar: "bg-rose-500",
  },
};

// 1:1-ish mapping. Each category falls into a single "broad" BTI plus
// optionally its own dedicated BTI (japanese, korean, cafe). 양식 /
// 이국적 / 아시안 / 카페-디저트 / 술 BTI 들이 카테고리 그룹과 정확히
// 매칭되도록 정리.
const CATEGORY_TO_BTI: Record<string, BtiKey[]> = {
  // 아시안 그룹 — chinese / thai / vietnamese / indian 만 broad asian
  // BTI 에 들어감. 한·일 은 각자 전용 BTI 가 있어서 거기로만.
  korean: ["korean"],
  japanese: ["japanese"],
  chinese: ["asian"],
  thai: ["asian"],
  vietnamese: ["asian"],
  indian: ["asian"],
  // 양식 그룹
  italian: ["western"],
  western: ["western"],
  french: ["western"],
  spanish: ["western"],
  // 라틴/이국적 그룹
  mexican: ["exotic"],
  peruvian: ["exotic"],
  middle_eastern: ["exotic"],
  // 카페·디저트 그룹
  cafe: ["cafe", "sweet"],
  bakery: ["sweet"],
  brunch: ["sweet"],
  dessert: ["sweet"],
  // 술/패스트
  bar: ["drinker"],
  fastfood: ["western"],
};

// 명예의 전당 = both ≥ 4.5. 천생연분이 별도로 4.0+ 구간을 가져갔던
// 옛 구조에서는 두 탭이 4.5+ 메뉴를 두고 겹쳐 보였음 — 이제 4.5+ 풀
// 안에서 상위 3개만 트로피, 나머지를 같은 탭의 천생연분 서브섹션으로
// 모음.
const FAME = 4.5;
const LOW = 2; // both ≤ 2    → 여긴 패스
const WAR = 2; // diff ≥ 2    → 입맛 격돌

export default function ComparePage() {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const { data: wishlist } = useWishlist(couple?.id);
  // Resolved nicknames flow into every "나 / 我 / 짝꿍 / 宝宝" label
  // on this page (chef share, person stats, vs badges, etc.) so the
  // labels reflect whatever names the couple set in their profiles
  // instead of the generic placeholders. Both Korean and Chinese
  // sides of "·" get replaced with the same nickname.
  const { me: meProfileQuery, partner: partnerProfileQuery } =
    useCoupleProfiles();
  const myDisplay =
    meProfileQuery.data?.nickname?.trim() || "나";
  const partnerDisplay =
    meProfileQuery.data?.partner_nickname?.trim() ||
    partnerProfileQuery.data?.nickname?.trim() ||
    "짝꿍";
  const qc = useQueryClient();
  const { pull, refreshing, manualRefreshing, onManualRefresh } =
    useRefreshControls(() =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["places"] }),
        qc.invalidateQueries({ queryKey: ["couple"] }),
      ])
    );

  const [diningFilter, setDiningFilter] = useState<DiningFilter>("all");
  const [activeTab, setActiveTab] = useState<TabId>("fame");
  const [cardConfig, setCardConfig] = useState<CardConfig>(loadCardConfig);
  const [cardEditorOpen, setCardEditorOpen] = useState(false);
  // Tracks the carousel card the user is currently centered on so the
  // dot-pagination indicator below knows which dot to fill. We don't
  // ever read this from the cards themselves — it's purely an indicator.
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  // Roulette modal lives here (instead of HomePage) because the
  // entry-point card sits in this carousel. Definition is still in
  // HomePage and imported as a named export — see CardId === "roulette"
  // render branch below.
  const [rouletteOpen, setRouletteOpen] = useState(false);

  const updateCardConfig = (next: CardConfig) => {
    setCardConfig(next);
    saveCardConfig(next);
  };

  // Find the card whose center is closest to the carousel viewport
  // center on every scroll tick. More robust than slot-math because it
  // handles irregular card widths (e.g. when only one card is visible).
  const onCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLDivElement>(":scope > div");
    if (cards.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((card, i) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActiveCardIdx(best);
  };

  const rows: Row[] = useMemo(() => {
    if (!places) return [];
    const out: Row[] = [];
    for (const p of places) {
      for (const f of p.foods ?? []) {
        // Only foods both partners ate qualify for comparison —
        // solo foods (one eater) can't be diffed and would skew the
        // 별점 요정 stat. Skip them entirely from this page.
        const isBoth = f.eater ? f.eater === "both" : !f.is_solo;
        if (!isBoth) continue;
        if (f.my_rating == null || f.partner_rating == null) continue;
        const view = ratingsForViewer(f, user?.id);
        out.push({
          foodId: f.id,
          placeId: p.id,
          placeName: p.name,
          foodName: f.name,
          isHomeCooked: !!p.is_home_cooked,
          placeCategories: getCategories(p),
          mine: view.myRating ?? 0,
          partner: view.partnerRating ?? 0,
          chef: f.chef ?? null,
          createdBy: f.created_by ?? null,
        });
      }
    }
    return out;
  }, [places, user?.id]);

  // Apply the 외식/집밥 segmented filter before bucketing — keeps the
  // badge + stats aligned with whichever subset the user is viewing.
  const filteredRows = useMemo(() => {
    if (diningFilter === "out") return rows.filter((r) => !r.isHomeCooked);
    if (diningFilter === "home") return rows.filter((r) => r.isHomeCooked);
    return rows;
  }, [rows, diningFilter]);

  // Home-cooked subset for the "우리집 미슐랭" card. Lives outside the
  // dining filter so the card still works in "all" mode (since home
  // chef stats only make sense for home rows).
  const homeRows = useMemo(() => rows.filter((r) => r.isHomeCooked), [rows]);

  // 4.5+ 풀을 한 번에 정렬해두고 상위 3개를 트로피, 나머지를 천생연분
  // 서브섹션으로 분배. 임계값 통일로 두 섹션이 더 이상 겹치지 않음.
  const fameAll = [...filteredRows]
    .filter((r) => r.mine >= FAME && r.partner >= FAME)
    .sort((a, b) => b.mine + b.partner - (a.mine + a.partner));
  const fameTop = fameAll.slice(0, 3);
  const fameRest = fameAll.slice(3);

  const neverAgain = [...filteredRows]
    .filter((r) => r.mine <= LOW && r.partner <= LOW)
    .sort((a, b) => a.mine + a.partner - (b.mine + b.partner));

  const tasteWar = [...filteredRows]
    .filter(
      (r) =>
        Math.abs(r.mine - r.partner) >= WAR &&
        !(r.mine >= FAME && r.partner >= FAME) &&
        !(r.mine <= LOW && r.partner <= LOW)
    )
    .sort(
      (a, b) => Math.abs(b.mine - b.partner) - Math.abs(a.mine - a.partner)
    );

  return (
    <div>
      <PullIndicator pull={pull} refreshing={refreshing} />
      <PageHeader
        title="우리의 취향 지도 · 我们的口味地图"
        subtitle="서로의 입맛을 한눈에 · 一秒看懂咱俩的口味"
        right={
          <button
            type="button"
            onClick={() => void onManualRefresh()}
            disabled={manualRefreshing || refreshing}
            className="p-3 bg-cream-100/70 rounded-full text-ink-700 hover:bg-cream-200 transition border border-cream-200/50 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="refresh"
            title="새로고침 · 刷新"
          >
            <RefreshCw
              className={`w-5 h-5 ${manualRefreshing || refreshing ? "animate-spin text-rose-400" : ""}`}
            />
          </button>
        }
      />

      <div className="px-5 pt-2">
        <div className="flex bg-cream-100/80 p-1 rounded-xl border border-cream-200/60">
          <DiningSegment
            active={diningFilter === "all"}
            onClick={() => setDiningFilter("all")}
            label="모두 · 全部"
            activeText="text-ink-900"
            activeBorder="border-cream-100"
          />
          <DiningSegment
            active={diningFilter === "out"}
            onClick={() => setDiningFilter("out")}
            label="🍽️ 외식 · 探店"
            activeText="text-peach-500"
            activeBorder="border-peach-100"
          />
          <DiningSegment
            active={diningFilter === "home"}
            onClick={() => setDiningFilter("home")}
            label="🍳 집밥 · 私房菜"
            activeText="text-teal-600"
            activeBorder="border-teal-100"
          />
        </div>
      </div>

      {/* Stats carousel — cards swipe horizontally instead of stacking,
          saving a full screen of vertical space. CSS scroll snap handles
          the gesture. Card visibility + order is fully user-controlled
          via the ⚙️ button below the carousel. */}
      <div className="pt-3 pb-4">
        {/* Card-manager moved into the dots row below — keeps the
            carousel area clean. */}
        <div
          ref={carouselRef}
          onScroll={onCarouselScroll}
          className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-3 px-5 pb-2"
          style={{ scrollPaddingInline: "1.25rem" }}
        >
          {cardConfig.order
            .filter((id) => !cardConfig.hidden.includes(id))
            .map((id) => {
              // Chef card is home-only; under "외식" filter or with
              // zero home rows it has nothing meaningful to show, so
              // hide it from the carousel rather than render an empty
              // placeholder. The user can still un-hide it from the
              // editor — it just won't appear until rows exist.
              if (id === "chef") {
                if (diningFilter === "out" || homeRows.length === 0) {
                  return null;
                }
                return (
                  <div
                    key={id}
                    className="snap-center shrink-0 w-[85%] max-w-[24rem]"
                  >
                    <HomeChefCard
                      rows={homeRows}
                      viewerId={user?.id}
                      myDisplay={myDisplay}
                      partnerDisplay={partnerDisplay}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={id}
                  className="snap-center shrink-0 w-[85%] max-w-[24rem]"
                >
                  {id === "diagnosis" && (
                    <TasteDiagnosisCard
                      rows={filteredRows}
                      myDisplay={myDisplay}
                      partnerDisplay={partnerDisplay}
                    />
                  )}
                  {id === "rating" && (
                    <RatingStats
                      rows={filteredRows}
                      myDisplay={myDisplay}
                      partnerDisplay={partnerDisplay}
                    />
                  )}
                  {id === "roulette" && (
                    <RouletteCard
                      onSpin={() => setRouletteOpen(true)}
                      revisitCount={
                        (places ?? []).filter((p) => p.want_to_revisit)
                          .length
                      }
                      wishlistCount={(wishlist ?? []).length}
                    />
                  )}
                </div>
              );
            })}
        </div>

        {/* Pagination dots — replaces the old "👉 가로로 스와이프"
            text hint. Tells the user at a glance how many cards there
            are and which one they're on. Active dot expands to a small
            pill so the cue is visible without color alone. The card-
            manager ⚙️ rides on the right edge of the same row so it's
            present but doesn't distract from the dots. */}
        {(() => {
          const visible = cardConfig.order.filter(
            (id) => !cardConfig.hidden.includes(id)
          );
          // Mirror the same chef-card visibility check the carousel
          // applies so the dot count matches what's actually rendered.
          const renderedCount = visible.filter((id) => {
            if (id !== "chef") return true;
            return diningFilter !== "out" && homeRows.length > 0;
          }).length;
          return (
            <div className="relative flex items-center justify-center mt-1 px-5">
              {renderedCount > 1 && (
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: renderedCount }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        i === activeCardIdx
                          ? "w-5 bg-peach-400"
                          : "w-1.5 bg-cream-200"
                      }`}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setCardEditorOpen(true)}
                aria-label="card manager"
                title="카드 관리 · 卡片管理"
                className="absolute right-5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-cream-100/80 border border-cream-200/60 text-ink-500 hover:bg-cream-200 hover:text-ink-700 transition"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })()}
      </div>

      {cardEditorOpen && (
        <CardEditorModal
          config={cardConfig}
          onChange={updateCardConfig}
          onClose={() => setCardEditorOpen(false)}
        />
      )}

      <RouletteModal
        open={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        places={places ?? []}
        wishlist={wishlist ?? []}
      />

      {/* List section tabs — 4 categories collapse into one tab strip
          + one rendered list, instead of 4 vertically-stacked sections.
          Drops the page from "endless scroll" to a single screen of
          content per tab. */}
      <div className="px-5 pb-8">
        <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-4 pb-1">
          <SectionTab
            active={activeTab === "fame"}
            onClick={() => setActiveTab("fame")}
            icon={<Trophy className="w-3.5 h-3.5" />}
            labelKo="명예의 전당"
            labelZh="封神榜"
            count={fameAll.length}
            tone="amber"
          />
          <SectionTab
            active={activeTab === "clash"}
            onClick={() => setActiveTab("clash")}
            icon={<Swords className="w-3.5 h-3.5" />}
            labelKo="입맛 격돌"
            labelZh="口味PK"
            count={tasteWar.length}
            tone="indigo"
          />
          <SectionTab
            active={activeTab === "pass"}
            onClick={() => setActiveTab("pass")}
            icon={<Frown className="w-3.5 h-3.5" />}
            labelKo="여긴 패스"
            labelZh="踩雷"
            count={neverAgain.length}
            tone="ink"
          />
        </div>

        {filteredRows.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-cream-200">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-sm text-ink-500 font-medium">
              {diningFilter === "home"
                ? "집밥 평가가 아직 없어요 · 还没有家宴评分"
                : diningFilter === "out"
                  ? "외식 평가가 아직 없어요 · 还没有探店评分"
                  : "둘 다 평가한 메뉴가 아직 없어요 · 还没有共同评分的菜"}
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            {activeTab === "fame" && (
              <ListPanel
                titleKo="둘 다 4.5점 이상 — 우리의 레전드 메뉴"
                titleZh="俩人都给了4.5+，封神级！"
                empty={fameAll.length === 0}
                emptyText="아직 4.5점 이상 메뉴가 없어요 · 还没有4.5+的封神菜"
              >
                {fameTop.map((r, idx) => (
                  <FoodCard
                    key={r.foodId}
                    r={r}
                    showTotal
                    yyds
                    badge={`🏆 TOP ${idx + 1}`}
                    myDisplay={myDisplay}
                    partnerDisplay={partnerDisplay}
                  />
                ))}
                {fameRest.length > 0 && (
                  <div className="pt-2 mt-2">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <HeartHandshake className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-[12px] font-bold text-rose-500">
                        천생연분 · 双向奔赴
                      </span>
                      <span className="text-[10px] text-ink-400 font-number">
                        {fameRest.length}
                      </span>
                    </div>
                    <ExpandableList items={fameRest} initial={5}>
                      {(r) => (
                        <FoodCard
                          key={r.foodId}
                          r={r}
                          showTotal
                          myDisplay={myDisplay}
                          partnerDisplay={partnerDisplay}
                        />
                      )}
                    </ExpandableList>
                  </div>
                )}
              </ListPanel>
            )}
            {activeTab === "clash" && (
              <ListPanel
                titleKo="서로 취향이 확 갈린 메뉴"
                titleZh="评价两极分化"
                empty={tasteWar.length === 0}
                emptyText="아직 없어요 · 还没有"
              >
                <ExpandableList items={tasteWar} initial={5}>
                  {(r) => {
                    const myFav = r.mine > r.partner;
                    const badge = myFav
                      ? `⭐ ${myDisplay} 원픽! · ${myDisplay}的本命`
                      : `⭐ ${partnerDisplay} 원픽! · ${partnerDisplay}的本命`;
                    return (
                      <FoodCard
                        key={r.foodId}
                        r={r}
                        badge={badge}
                        showBalance
                        myDisplay={myDisplay}
                        partnerDisplay={partnerDisplay}
                      />
                    );
                  }}
                </ExpandableList>
              </ListPanel>
            )}
            {activeTab === "pass" && (
              <ListPanel
                titleKo="우리 스타일은 아니었던 곳"
                titleZh="绝对的黑名单"
                empty={neverAgain.length === 0}
                emptyText="다행히 둘 다 별로였던 곳은 없어요 · 还好没有共同踩雷的"
              >
                <ExpandableList items={neverAgain} initial={5}>
                  {(r) => (
                    <FoodCard
                      key={r.foodId}
                      r={r}
                      myDisplay={myDisplay}
                      partnerDisplay={partnerDisplay}
                    />
                  )}
                </ExpandableList>
              </ListPanel>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 입맛 진단 카드 (통합) ----------
//
// One card that answers three nested questions about the couple in
// order: WHO are we (BTI verdict at the top) → HOW aligned are we
// (sync %) → WHERE do we agree/disagree (segmented breakdown that
// switches between BTI buckets and category groups). Replaces the
// previous three separate cards (TasteSync / CategoryBattle / FoodBti)
// because they were really different views of the same data.

function TasteDiagnosisCard({
  rows,
  myDisplay,
  partnerDisplay,
}: {
  rows: Row[];
  myDisplay: string;
  partnerDisplay: string;
}) {
  const { t } = useTranslation();
  const [breakdownTab, setBreakdownTab] = useState<"bti" | "category">("bti");
  // One shared expanded-key for both tabs since only one row at a time
  // is open. Switching tabs clears the expansion implicitly because
  // the keys (BtiKey vs cat string) don't collide in practice.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // ----- sync % -----
  const syncPercent = useMemo(() => {
    if (!rows.length) return 0;
    const totalDiff = rows.reduce(
      (acc, r) => acc + Math.abs(r.mine - r.partner),
      0
    );
    const avgDiff = totalDiff / rows.length;
    return Math.max(0, 100 - (avgDiff / 5) * 100);
  }, [rows]);

  // ----- BTI buckets -----
  const btiStats = useMemo(() => {
    const totals = new Map<
      BtiKey,
      { sum: number; count: number; rows: Row[] }
    >();
    for (const r of rows) {
      if (r.placeCategories.length === 0) continue;
      const coupleAvg = (r.mine + r.partner) / 2;
      const fed = new Set<BtiKey>();
      for (const cat of r.placeCategories) {
        const buckets = CATEGORY_TO_BTI[cat];
        if (!buckets) continue;
        for (const k of buckets) {
          if (fed.has(k)) continue;
          fed.add(k);
          const tt = totals.get(k) ?? { sum: 0, count: 0, rows: [] };
          tt.sum += coupleAvg;
          tt.count += 1;
          tt.rows.push(r);
          totals.set(k, tt);
        }
      }
    }
    const out: {
      key: BtiKey;
      avg: number;
      percent: number;
      count: number;
      rows: Row[];
    }[] = [];
    for (const [key, tt] of totals) {
      if (tt.count === 0) continue;
      const avg = tt.sum / tt.count;
      const sortedRows = [...tt.rows].sort(
        (a, b) => b.mine + b.partner - (a.mine + a.partner)
      );
      out.push({
        key,
        avg,
        percent: (avg / 5) * 100,
        count: tt.count,
        rows: sortedRows,
      });
    }
    out.sort((a, b) => b.avg - a.avg);
    return out;
  }, [rows]);

  // ----- per-category battle (grouped by hierarchy) -----
  const categorySections = useMemo(() => {
    const map = new Map<
      string,
      { mine: number; partner: number; count: number; rows: Row[] }
    >();
    for (const r of rows) {
      if (r.placeCategories.length === 0) continue;
      for (const cat of r.placeCategories) {
        const cur = map.get(cat) ?? {
          mine: 0,
          partner: 0,
          count: 0,
          rows: [],
        };
        cur.mine += r.mine;
        cur.partner += r.partner;
        cur.count += 1;
        cur.rows.push(r);
        map.set(cat, cur);
      }
    }
    const battle = new Map<
      string,
      {
        myAvg: number;
        partnerAvg: number;
        diff: number;
        count: number;
        rows: Row[];
      }
    >();
    for (const [cat, v] of map) {
      const myAvg = v.mine / v.count;
      const partnerAvg = v.partner / v.count;
      const sortedRows = [...v.rows].sort(
        (a, b) =>
          Math.abs(b.mine - b.partner) - Math.abs(a.mine - a.partner)
      );
      battle.set(cat, {
        myAvg,
        partnerAvg,
        diff: Math.abs(myAvg - partnerAvg),
        count: v.count,
        rows: sortedRows,
      });
    }
    type Section = {
      headerKo: string;
      headerZh: string;
      rows: { cat: string; battle: NonNullable<ReturnType<typeof battle.get>> }[];
    };
    const sections: Section[] = [];
    const seen = new Set<string>();
    for (const g of CATEGORY_GROUPS) {
      const groupBattles: Section["rows"] = [];
      for (const c of g.keys) {
        const b = battle.get(c);
        if (b) {
          groupBattles.push({ cat: c, battle: b });
          seen.add(c);
        }
      }
      if (groupBattles.length > 0) {
        sections.push({
          headerKo: g.ko,
          headerZh: g.zh,
          rows: groupBattles,
        });
      }
    }
    const customRows: Section["rows"] = [];
    for (const [cat, b] of battle) {
      if (!seen.has(cat)) customRows.push({ cat, battle: b });
    }
    if (customRows.length > 0) {
      customRows.sort((a, b) => b.battle.diff - a.battle.diff);
      sections.push({
        headerKo: "✏️ 직접 입력",
        headerZh: "自定义",
        rows: customRows,
      });
    }
    return sections;
  }, [rows]);

  if (rows.length === 0 || btiStats.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-cream-200 shadow-airy h-full flex flex-col items-center justify-center text-center min-h-[180px]">
        <Dna className="w-8 h-8 text-ink-300 mb-3" />
        <h3 className="font-bold text-ink-700 text-[15px] mb-1 break-keep">
          입맛 진단 준비 중 · 口味诊断准备中
        </h3>
        <p className="text-xs text-ink-500 max-w-[220px] break-keep">
          둘 다 별점 매긴 메뉴가 모이면 우리 커플 입맛을 진단해드려요!
          <br />
          多打分就能看到你们的口味DNA啦！
        </p>
      </div>
    );
  }

  const top = btiStats[0];
  const topProfile = BTI_PROFILES[top.key];

  // Sync palette mirrors the old standalone card so the % still pops
  // at a glance. The thresholds (60/80) are tuned so most couples land
  // in the green zone with light banter copy.
  const syncTone =
    syncPercent < 60
      ? { gradient: "from-amber-400 to-orange-400", chip: "bg-amber-50 text-amber-600 border-amber-200" }
      : syncPercent < 80
        ? { gradient: "from-teal-400 to-emerald-500", chip: "bg-teal-50 text-teal-600 border-teal-200" }
        : { gradient: "from-rose-400 to-pink-500", chip: "bg-rose-50 text-rose-500 border-rose-200" };

  return (
    <div className="relative bg-white rounded-3xl p-4 border border-cream-200 shadow-airy overflow-hidden h-full flex flex-col">
      <div
        className={`absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gradient-to-br ${topProfile.gradient} opacity-[0.08] blur-2xl pointer-events-none`}
      />
      <h3 className="relative z-10 font-sans font-bold text-ink-900 text-[15px] flex items-center gap-1.5 mb-2 border-b border-cream-100 pb-2 break-keep">
        <Dna className="w-4 h-4 text-ink-700 flex-shrink-0" />
        우리의 입맛 진단 · 口味诊断
      </h3>

      {/* BTI verdict — 큰 이모지 + 그라데이션 타이틀 + 인용구. */}
      <div className="relative z-10 flex flex-col items-center text-center pb-2">
        <div className="text-4xl drop-shadow-sm leading-none mb-1">
          {topProfile.emoji}
        </div>
        <h2
          className={`text-[17px] font-sans font-black text-transparent bg-clip-text bg-gradient-to-r ${topProfile.gradient} tracking-tight break-keep leading-tight`}
        >
          {topProfile.titleKo}{" "}
          <span className="text-ink-400 text-[11px] font-bold align-middle">
            · {topProfile.titleZh}
          </span>
        </h2>
        <p className="text-[11px] font-medium text-ink-500 mt-1 break-keep leading-snug px-1">
          “{topProfile.descKo}”
        </p>
      </div>

      {/* Compact stat row: sync % + sample size. */}
      <div className="relative z-10 grid grid-cols-2 gap-2 mb-2">
        <div
          className={`rounded-xl px-2 py-1.5 border text-center ${syncTone.chip}`}
        >
          <div className="text-[9px] font-bold tracking-wider uppercase opacity-70">
            싱크 · 默契度
          </div>
          <div className="font-number font-black text-[18px] leading-none mt-0.5">
            {syncPercent.toFixed(0)}
            <span className="text-[12px]">%</span>
          </div>
        </div>
        <div className="rounded-xl px-2 py-1.5 border bg-cream-50 border-cream-200 text-ink-700 text-center">
          <div className="text-[9px] font-bold tracking-wider uppercase text-ink-400">
            메뉴 · 评价数
          </div>
          <div className="font-number font-black text-[18px] leading-none mt-0.5 text-ink-900">
            {rows.length}
          </div>
        </div>
      </div>

      {/* Tabs — switch between BTI bucket view (broad couple-type
          stripes) and category view (granular per-cuisine PK).
          Tabs are intentionally smaller / muted vs the BTI verdict
          above so the verdict stays the headline. */}
      <div className="relative z-10 flex bg-cream-100/80 p-0.5 rounded-lg border border-cream-200/60 mb-2">
        <button
          type="button"
          onClick={() => {
            setBreakdownTab("bti");
            setExpandedKey(null);
          }}
          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
            breakdownTab === "bti"
              ? "bg-white shadow-sm text-ink-900 border border-cream-100"
              : "text-ink-500"
          }`}
        >
          🧬 BTI별 · 类型
        </button>
        <button
          type="button"
          onClick={() => {
            setBreakdownTab("category");
            setExpandedKey(null);
          }}
          className={`flex-1 py-1 text-[10px] font-bold rounded-md transition ${
            breakdownTab === "category"
              ? "bg-white shadow-sm text-ink-900 border border-cream-100"
              : "text-ink-500"
          }`}
        >
          🔥 카테고리별 · 类别
        </button>
      </div>

      {/* Breakdown body — fixed-height "rectangle" that exposes ~2 rows
          and scrolls internally for the rest. Keeps the diagnosis card
          short while still letting the user dig into every bucket /
          category if they want. */}
      <div className="relative z-10 h-[88px] overflow-y-auto hide-scrollbar text-ink-500 border border-cream-100 rounded-lg bg-cream-50/40 px-2 py-1.5">
        {breakdownTab === "bti" ? (
          <div className="space-y-2">
            {btiStats.map((s) => {
              const pf = BTI_PROFILES[s.key];
              const isExpanded = expandedKey === s.key;
              return (
                <div key={s.key}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedKey(isExpanded ? null : s.key)
                    }
                    className="w-full flex items-center gap-1.5 text-left hover:bg-cream-50 -mx-1 px-1 py-0.5 rounded-lg transition"
                  >
                    <div className="w-5 flex-shrink-0 text-sm text-center">
                      {pf.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center text-[10px] font-bold text-ink-600 mb-0.5 gap-2">
                        <span className="truncate break-keep">
                          {pf.titleKo}{" "}
                          <span className="text-ink-400 font-medium">
                            · {pf.titleZh}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {/* Bilingual unit suffix — 곳 (Korean
                              place counter) + 家 (Chinese restaurant
                              counter) so the raw number doesn't read
                              as just "3". */}
                          <span className="text-[9px] text-ink-400 font-number">
                            {s.count}곳·家
                          </span>
                          <span className="font-number">
                            {Math.round(s.percent)}%
                          </span>
                          <ChevronDown
                            className={`w-3 h-3 text-ink-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-cream-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${pf.bar} rounded-full transition-all duration-700 ease-out`}
                          style={{ width: `${s.percent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-8 mt-2 mb-1 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      {s.rows.map((r) => (
                        <ContributingFoodRow key={r.foodId} r={r} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between text-[10px] font-bold px-1">
              <span className="text-peach-500 truncate max-w-[45%]">
                {myDisplay}
              </span>
              <span className="text-rose-500 truncate max-w-[45%]">
                {partnerDisplay}
              </span>
            </div>
            {categorySections.map((section) => (
              <div key={section.headerKo}>
                <p className="text-[10px] font-bold text-ink-400 tracking-wider mb-1.5 uppercase">
                  {section.headerKo} · {section.headerZh}
                </p>
                <div className="space-y-2">
                  {section.rows.map(({ cat, battle: b }) => {
                    const total = b.myAvg + b.partnerAvg || 1;
                    const myW = (b.myAvg / total) * 100;
                    const partnerW = (b.partnerAvg / total) * 100;
                    const label = isKnownPlaceCategory(cat)
                      ? t(`category.${cat}`)
                      : cat;
                    const isExpanded = expandedKey === cat;
                    return (
                      <div key={cat}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedKey(isExpanded ? null : cat)
                          }
                          className="w-full text-left hover:bg-cream-50 -mx-1 px-1 py-1 rounded-lg transition"
                        >
                          <div className="flex items-center justify-between mb-1 px-0.5 gap-2">
                            <span className="text-[11px] font-bold text-ink-700 flex items-center gap-1 min-w-0 truncate">
                              <span>{categoryEmojiOf(cat)}</span>
                              <span className="truncate">{label}</span>
                              <span className="text-[10px] text-ink-400 font-number ml-1 flex-shrink-0">
                                ({b.count}곳·家)
                              </span>
                            </span>
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-[10px] font-number font-bold text-ink-500 bg-cream-100 px-1.5 py-0.5 rounded-md">
                                Δ {b.diff.toFixed(1)}
                              </span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </span>
                          </div>
                          <div className="w-full h-4 flex rounded-full overflow-hidden border border-cream-200">
                            <div
                              className="bg-peach-400 flex items-center justify-start px-1.5 text-[9px] font-number font-bold text-white transition-all"
                              style={{ width: `${myW}%` }}
                            >
                              {b.myAvg.toFixed(1)}
                            </div>
                            <div className="w-px h-full bg-white" />
                            <div
                              className="bg-rose-400 flex items-center justify-end px-1.5 text-[9px] font-number font-bold text-white transition-all"
                              style={{ width: `${partnerW}%` }}
                            >
                              {b.partnerAvg.toFixed(1)}
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="ml-3 mt-2 mb-1 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                            {b.rows.map((r) => (
                              <ContributingFoodRow key={r.foodId} r={r} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact contributing-food row used by every card's drill-down.
// Shows food name + place + both partners' ratings, links to the
// place detail.
function ContributingFoodRow({ r }: { r: Row }) {
  return (
    <Link
      to={`/places/${r.placeId}`}
      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-cream-50 hover:bg-cream-100 border border-cream-200/60 text-[11px] transition"
    >
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink-900 truncate">{r.foodName}</p>
        <p className="text-ink-400 truncate text-[10px]">@ {r.placeName}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 text-[10px] font-number font-bold">
        <span className="text-peach-500">{r.mine.toFixed(1)}</span>
        <span className="text-ink-300">/</span>
        <span className="text-rose-500">{r.partner.toFixed(1)}</span>
      </div>
    </Link>
  );
}

// ---------- 우리집 미슐랭 카드 ----------
//
// Home-cooked-only stats: chef share (who cooked how often) +
// per-chef avg score (whose cooking scores higher overall).
// chef enum is stored from the food creator's perspective, so we
// swap to viewer perspective per row before tallying.

function HomeChefCard({
  rows,
  viewerId,
  myDisplay,
  partnerDisplay,
}: {
  rows: Row[];
  viewerId: string | undefined;
  // Resolved nicknames piped from ComparePage so chef share + tile
  // labels show the actual names instead of "나 · 我" / "짝꿍 · 宝宝".
  myDisplay: string;
  partnerDisplay: string;
}) {
  const [expanded, setExpanded] = useState<"me" | "partner" | null>(null);

  const stats = useMemo(() => {
    const myRows: Row[] = [];
    const partnerRows: Row[] = [];
    let togetherCount = 0;
    let myScoreSum = 0;
    let partnerScoreSum = 0;

    for (const r of rows) {
      // Storage→viewer chef swap. created_by null → fall back to
      // viewer-is-creator (for legacy rows).
      let chefViewer: "me" | "partner" | "together" = "together";
      if (r.chef === "me" || r.chef === "partner") {
        const viewerIsCreator = !r.createdBy || r.createdBy === viewerId;
        chefViewer =
          r.chef === "me"
            ? viewerIsCreator
              ? "me"
              : "partner"
            : viewerIsCreator
              ? "partner"
              : "me";
      }

      const coupleAvg = (r.mine + r.partner) / 2;
      if (chefViewer === "me") {
        myRows.push(r);
        myScoreSum += coupleAvg;
      } else if (chefViewer === "partner") {
        partnerRows.push(r);
        partnerScoreSum += coupleAvg;
      } else {
        togetherCount++;
      }
    }
    // Sort each chef's foods by couple-avg desc so when expanded the
    // user sees their chef's best dishes first.
    myRows.sort((a, b) => b.mine + b.partner - (a.mine + a.partner));
    partnerRows.sort((a, b) => b.mine + b.partner - (a.mine + a.partner));
    const myCount = myRows.length;
    const partnerCount = partnerRows.length;
    const total = myCount + partnerCount + togetherCount;
    return {
      myCount,
      partnerCount,
      togetherCount,
      total,
      myAvg: myCount > 0 ? myScoreSum / myCount : 0,
      partnerAvg: partnerCount > 0 ? partnerScoreSum / partnerCount : 0,
      myRows,
      partnerRows,
    };
  }, [rows, viewerId]);

  const {
    myCount,
    partnerCount,
    togetherCount,
    total,
    myAvg,
    partnerAvg,
    myRows,
    partnerRows,
  } = stats;
  const myShare = total ? (myCount / total) * 100 : 0;
  const partnerShare = total ? (partnerCount / total) * 100 : 0;
  const togetherShare = total ? (togetherCount / total) * 100 : 0;

  return (
    <div className="bg-gradient-to-br from-teal-50 to-emerald-100 rounded-3xl p-4 border border-teal-200 shadow-airy h-full flex flex-col">
      <h3 className="font-sans font-bold text-teal-900 text-[14px] flex items-center gap-1.5 mb-2.5 border-b border-teal-200/50 pb-2 break-keep">
        <ChefHat className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
        우리집 미슐랭 · 家庭米其林
      </h3>

      {/* Chef share — stacked horizontal bar + counts */}
      <div className="mb-2.5 bg-white/70 p-2.5 rounded-xl border border-teal-100/50 shadow-sm">
        <p className="text-[10px] font-bold text-teal-800 mb-1.5">
          요리 지분율 · 掌勺比例
        </p>
        <div className="w-full h-3.5 flex rounded-full overflow-hidden mb-2 border border-white shadow-inner">
          {myShare > 0 && (
            <div className="bg-peach-400" style={{ width: `${myShare}%` }} />
          )}
          {togetherShare > 0 && (
            <div
              className="bg-amber-400"
              style={{ width: `${togetherShare}%` }}
            />
          )}
          {partnerShare > 0 && (
            <div
              className="bg-rose-400"
              style={{ width: `${partnerShare}%` }}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-ink-700 text-center">
          <span className="inline-flex items-center justify-center gap-1 min-w-0">
            <span className="truncate">{myDisplay}</span>
            <span className="font-number bg-white px-1 py-0.5 rounded shadow-sm flex-shrink-0">
              {myCount}
            </span>
          </span>
          <span className="inline-flex items-center justify-center gap-1 min-w-0">
            <span>🤝</span>
            <span className="font-number bg-white px-1 py-0.5 rounded shadow-sm flex-shrink-0">
              {togetherCount}
            </span>
          </span>
          <span className="inline-flex items-center justify-center gap-1 min-w-0">
            <span className="truncate">{partnerDisplay}</span>
            <span className="font-number bg-white px-1 py-0.5 rounded shadow-sm flex-shrink-0">
              {partnerCount}
            </span>
          </span>
        </div>
      </div>

      {/* Whose cooking scores higher — per-chef avg of couple averages.
          Tiles vertically center until tapped, so the card never reads
          empty. Active tile pops forward with scale + ring; sibling
          fades back. Smooth transition-all so it feels like a single
          motion when toggling. */}
      <div
        className={`flex-1 flex flex-col ${
          expanded ? "" : "justify-center"
        }`}
      >
        <p className="text-[10px] font-bold text-teal-800 mb-1.5">
          누가 했을 때 더 맛있었지? · 谁做饭更好吃？
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setExpanded(expanded === "me" ? null : "me")
            }
            disabled={myCount === 0}
            className={`bg-white rounded-xl p-2 border flex flex-col items-center justify-center text-center shadow-sm transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed hover:shadow ${
              expanded === "me"
                ? "border-peach-300 ring-2 ring-peach-200 scale-[1.04] shadow-md z-10"
                : expanded === "partner"
                  ? "border-teal-100 scale-95 opacity-60"
                  : "border-teal-100"
            } ${
              expanded === null && myAvg < partnerAvg && myCount > 0
                ? "opacity-70"
                : ""
            }`}
          >
            <span className="text-[10px] font-bold text-peach-500 mb-0.5">
              {myDisplay} 요리 · {myDisplay}做的
            </span>
            <span className="text-xl font-number font-bold text-ink-900 leading-none">
              {myAvg > 0 ? myAvg.toFixed(2) : "-"}
            </span>
            <span className="text-[9px] text-ink-400 font-number font-bold mt-0.5">
              {myCount}개·道
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              setExpanded(expanded === "partner" ? null : "partner")
            }
            disabled={partnerCount === 0}
            className={`bg-white rounded-xl p-2 border flex flex-col items-center justify-center text-center shadow-sm transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed hover:shadow ${
              expanded === "partner"
                ? "border-rose-300 ring-2 ring-rose-200 scale-[1.04] shadow-md z-10"
                : expanded === "me"
                  ? "border-teal-100 scale-95 opacity-60"
                  : "border-teal-100"
            } ${
              expanded === null && partnerAvg < myAvg && partnerCount > 0
                ? "opacity-70"
                : ""
            }`}
          >
            <span className="text-[10px] font-bold text-rose-500 mb-0.5">
              {partnerDisplay} 요리 · {partnerDisplay}做的
            </span>
            <span className="text-xl font-number font-bold text-ink-900 leading-none">
              {partnerAvg > 0 ? partnerAvg.toFixed(2) : "-"}
            </span>
            <span className="text-[9px] text-ink-400 font-number font-bold mt-0.5">
              {partnerCount}개·道
            </span>
          </button>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-teal-200/50 space-y-1.5 max-h-[200px] overflow-y-auto hide-scrollbar animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[10px] font-bold text-teal-700 tracking-wider uppercase mb-1">
              {expanded === "me"
                ? `${myDisplay}이 한 메뉴 · ${myDisplay}掌勺的`
                : `${partnerDisplay}이 한 메뉴 · ${partnerDisplay}掌勺的`}
            </p>
            {(expanded === "me" ? myRows : partnerRows).map((r) => (
              <ContributingFoodRow key={r.foodId} r={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 별점 요정 vs 깐깐징어 통계 카드 ----------

function RatingStats({
  rows,
  myDisplay,
  partnerDisplay,
}: {
  rows: Row[];
  myDisplay: string;
  partnerDisplay: string;
}) {
  const [expanded, setExpanded] = useState<"me" | "partner" | null>(null);

  // Pre-sort once per side; toggling between tiles just flips which
  // ordering is shown.
  const sortedByMine = useMemo(
    () => [...rows].sort((a, b) => b.mine - a.mine),
    [rows]
  );
  const sortedByPartner = useMemo(
    () => [...rows].sort((a, b) => b.partner - a.partner),
    [rows]
  );

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-cream-200 shadow-airy h-full flex flex-col items-center justify-center text-center min-h-[180px]">
        <Scale className="w-8 h-8 text-ink-300 mb-3" />
        <h3 className="font-bold text-ink-700 text-[15px] mb-1 break-keep">
          별점 요정은 누구? · 谁是打分小天使？
        </h3>
        <p className="text-xs text-ink-500 max-w-[220px] break-keep">
          둘이 별점을 더 매겨주세요. 평균이 모이면 비교가 시작돼요!
          <br />
          多打分就知道谁更大方啦！
        </p>
      </div>
    );
  }
  const avgMine = rows.reduce((s, r) => s + r.mine, 0) / rows.length;
  const avgPartner = rows.reduce((s, r) => s + r.partner, 0) / rows.length;
  const diff = Math.abs(avgMine - avgPartner);
  const isTie = diff < 0.1;
  const myRole: "fairy" | "strict" | "tie" = isTie
    ? "tie"
    : avgMine > avgPartner
      ? "fairy"
      : "strict";
  const partnerRole: "fairy" | "strict" | "tie" = isTie
    ? "tie"
    : myRole === "fairy"
      ? "strict"
      : "fairy";

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-4 border border-indigo-100 shadow-airy h-full flex flex-col">
      <h3 className="font-sans font-bold text-ink-900 text-[14px] flex items-center gap-1.5 mb-2.5 border-b border-indigo-100 pb-2 break-keep">
        <Scale className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
        별점 요정 vs 깐깐징어 · 打分天使 vs 严格考官
      </h3>

      {/* Center the tiles vertically when nothing is expanded so the
          card never looks empty. When the user taps a tile we drop the
          centering so the expand list has room to flow downward. */}
      <div
        className={`flex-1 flex flex-col ${
          expanded ? "" : "justify-center"
        }`}
      >
        <div className="grid grid-cols-2 gap-2">
          <PersonStatTile
            person={myDisplay}
            tone="peach"
            avg={avgMine}
            role={myRole}
            expanded={expanded === "me"}
            dimmed={expanded === "partner"}
            onToggle={() => setExpanded(expanded === "me" ? null : "me")}
          />
          <PersonStatTile
            person={partnerDisplay}
            tone="rose"
            avg={avgPartner}
            role={partnerRole}
            expanded={expanded === "partner"}
            dimmed={expanded === "me"}
            onToggle={() =>
              setExpanded(expanded === "partner" ? null : "partner")
            }
          />
        </div>

        {/* Diff + sample-size on one row. Hidden when a tile is open
            because the expand list takes over the space. */}
        {!expanded && (
          <p className="text-[10px] text-center text-indigo-600 font-medium mt-2 break-keep">
            {isTie ? (
              <>
                비슷비슷 · 不分上下{" · "}
                <span className="text-ink-500">{rows.length}개·道</span>
              </>
            ) : (
              <>
                평균{" "}
                <span className="font-number font-bold mx-0.5">
                  {diff.toFixed(2)}
                </span>
                점 차이 · 相差 {diff.toFixed(2)} 分{" · "}
                <span className="text-ink-500">{rows.length}개·道</span>
              </>
            )}
          </p>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t border-indigo-100 space-y-1.5 max-h-[200px] overflow-y-auto hide-scrollbar animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[10px] font-bold text-indigo-500 tracking-wider uppercase mb-1">
              {expanded === "me"
                ? `${myDisplay}이 후하게 준 순 · ${myDisplay}打分高→低`
                : `${partnerDisplay}이 후하게 준 순 · ${partnerDisplay}打分高→低`}
            </p>
            {(expanded === "me" ? sortedByMine : sortedByPartner).map(
              (r) => (
                <ContributingFoodRow key={r.foodId} r={r} />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonStatTile({
  person,
  tone,
  avg,
  role,
  expanded,
  dimmed,
  onToggle,
}: {
  person: string;
  tone: "peach" | "rose";
  avg: number;
  role: "fairy" | "strict" | "tie";
  expanded: boolean;
  // Sibling tile is the one currently expanded — fade & shrink THIS
  // tile so the active tile reads as the foreground element.
  dimmed?: boolean;
  onToggle: () => void;
}) {
  const personCls = tone === "peach" ? "text-peach-500" : "text-rose-500";
  const accentCls =
    tone === "peach"
      ? "bg-peach-50 border-peach-200"
      : "bg-rose-50 border-rose-200";
  const ringCls =
    tone === "peach"
      ? "ring-2 ring-peach-300"
      : "ring-2 ring-rose-300";
  const roleEmoji =
    role === "fairy" ? "🧚‍♀️" : role === "strict" ? "🧐" : "🤝";
  const roleKo =
    role === "fairy" ? "별점 요정" : role === "strict" ? "깐깐징어" : "비등";
  const roleZh =
    role === "fairy" ? "打分小天使" : role === "strict" ? "严格的" : "平局";
  const roleBadgeCls =
    role === "fairy"
      ? "bg-amber-50 text-amber-600 border-amber-200"
      : role === "strict"
        ? "bg-indigo-50 text-indigo-600 border-indigo-200"
        : "bg-ink-100 text-ink-500 border-cream-200";
  // Tap interaction: active tile pops forward (scale up + ring),
  // sibling fades back (scale down + opacity). Smooth `transition-all`
  // so the swap reads as a single motion instead of a hard flip.
  const interactCls = expanded
    ? `${ringCls} scale-[1.04] shadow-md z-10`
    : dimmed
      ? "scale-95 opacity-60"
      : "";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-xl p-2 border ${accentCls} ${interactCls} flex flex-col items-center text-center shadow-sm hover:shadow transition-all duration-300 ease-out w-full`}
    >
      <div className={`text-[11px] font-bold ${personCls} mb-0.5`}>
        {person}
      </div>
      <div className="text-2xl font-number font-bold text-ink-900 leading-none">
        {avg.toFixed(2)}
        <span className="text-[9px] text-ink-400 font-bold ml-0.5 tracking-wider">
          /5
        </span>
      </div>
      <div
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded-full text-[9px] font-bold border ${roleBadgeCls}`}
      >
        <span>{roleEmoji}</span>
        <span className="break-keep">
          {roleKo} · {roleZh}
        </span>
      </div>
      <ChevronDown
        className={`w-3 h-3 mt-0.5 text-ink-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}

// ---------- segmented 버튼 + 가로 탭 ----------

function DiningSegment({
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

// 4-section list tab. Tone-coded so the active state hints at which
// list is showing without needing to read the label.
function SectionTab({
  active,
  onClick,
  icon,
  labelKo,
  labelZh,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  labelKo: string;
  labelZh: string;
  count: number;
  tone: "amber" | "rose" | "indigo" | "ink";
}) {
  const activeCls =
    tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : tone === "rose"
        ? "bg-rose-50 border-rose-200 text-rose-600"
        : tone === "indigo"
          ? "bg-indigo-50 border-indigo-200 text-indigo-600"
          : "bg-ink-900 border-ink-900 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-bold transition whitespace-nowrap shadow-sm ${
        active
          ? activeCls
          : "bg-white border-cream-200/80 text-ink-500 hover:bg-cream-50"
      }`}
    >
      {icon}
      <span>{labelKo}</span>
      <span className="text-[10px] opacity-70">· {labelZh}</span>
      <span
        className={`ml-1 font-number text-[10px] px-1.5 py-0.5 rounded-full ${
          active && tone !== "ink"
            ? "bg-white/60"
            : active
              ? "bg-white/20"
              : "bg-cream-100 text-ink-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ---------- expandable list ----------

// Generic "show first N → reveal rest" wrapper used by every results
// list. Keeps the page short by default while still letting the user
// pull up the full list if they want.
function ExpandableList<T>({
  items,
  initial = 5,
  children,
}: {
  items: T[];
  initial?: number;
  children: (item: T) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initial);
  const hiddenCount = items.length - initial;
  return (
    <>
      {visible.map(children)}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full mt-2 py-2.5 rounded-2xl border border-cream-200 bg-white text-[12px] font-bold text-ink-700 hover:bg-cream-50 transition flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>
              접기 · 收起
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </>
          ) : (
            <>
              더보기 · 还有 {hiddenCount}개
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </>
  );
}

// ---------- list panel ----------

function ListPanel({
  titleKo,
  titleZh,
  empty,
  emptyText,
  children,
}: {
  titleKo: string;
  titleZh: string;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-xs text-ink-500 mb-3 px-1">
        {titleKo} · {titleZh}
      </p>
      <div className="space-y-3">
        {empty ? (
          <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-cream-200 text-sm text-ink-400">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ---------- food card ----------

function FoodCard({
  r,
  showTotal,
  showBalance,
  badge,
  yyds,
  myDisplay,
  partnerDisplay,
}: {
  r: Row;
  showTotal?: boolean;
  showBalance?: boolean;
  badge?: string;
  yyds?: boolean;
  myDisplay: string;
  partnerDisplay: string;
}) {
  const total = r.mine + r.partner;
  const cardCls = yyds
    ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-[0_4px_15px_rgba(251,191,36,0.18)]"
    : "bg-white border-cream-200 shadow-soft";
  // YYDS badges live inline above the title because the absolute
  // corner badge collided with the right-aligned 10/10 score. The
  // taste-war "내 원픽" badge is shorter and stays in the corner.
  const inlineBadge = yyds && badge;
  const cornerBadge = !yyds && badge;
  const cornerBadgeCls = "bg-ink-900 text-white";
  return (
    <Link
      to={`/places/${r.placeId}`}
      className={`block rounded-2xl p-4 border relative overflow-hidden ${cardCls}`}
    >
      {cornerBadge && (
        <div
          className={`absolute top-0 right-0 text-[10px] font-semibold px-3 py-1 rounded-bl-xl ${cornerBadgeCls}`}
        >
          {badge}
        </div>
      )}
      {inlineBadge && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">
            {badge}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3 pr-1">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-900 text-base truncate flex items-center gap-1.5 flex-wrap">
            {r.foodName}
            {r.isHomeCooked && (
              <span className="bg-teal-50 text-teal-600 border border-teal-100 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none shrink-0 whitespace-nowrap">
                🍳 집밥 · 私房菜
              </span>
            )}
          </p>
          <p className="text-xs text-ink-500 truncate mt-0.5">
            @ {r.placeName}
          </p>
        </div>
        {showTotal && (
          <div className="flex-shrink-0 text-right">
            <span className="block text-2xl font-number font-bold text-transparent bg-clip-text bg-gradient-to-r from-peach-400 to-rose-400 leading-none">
              {total.toFixed(1)}
            </span>
            <span className="text-[10px] text-ink-400 font-number">/ 10</span>
          </div>
        )}
      </div>

      {showBalance ? (
        <BalanceBar
          mine={r.mine}
          partner={r.partner}
          myDisplay={myDisplay}
          partnerDisplay={partnerDisplay}
        />
      ) : (
        <div className="flex gap-3 mt-3">
          <RatingTile
            label={myDisplay}
            value={r.mine}
            tone="peach"
            leading={r.mine >= r.partner}
          />
          <RatingTile
            label={partnerDisplay}
            value={r.partner}
            tone="rose"
            leading={r.partner >= r.mine}
          />
        </div>
      )}
    </Link>
  );
}

function RatingTile({
  label,
  value,
  tone,
  leading,
}: {
  label: string;
  value: number;
  tone: "peach" | "rose";
  leading: boolean;
}) {
  const bg = tone === "peach" ? "bg-peach-100" : "bg-rose-100";
  const border =
    tone === "peach" ? "border-peach-200" : "border-rose-200";
  const text = tone === "peach" ? "text-peach-500" : "text-rose-500";
  return (
    <div
      className={`flex-1 rounded-xl p-2 text-center border ${bg} ${border} ${
        leading ? "" : "opacity-70"
      }`}
    >
      <span className={`text-[10px] font-semibold block mb-1 ${text}`}>
        {label}
      </span>
      <span className={`text-lg font-number font-bold ${text}`}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function BalanceBar({
  mine,
  partner,
  myDisplay,
  partnerDisplay,
}: {
  mine: number;
  partner: number;
  myDisplay: string;
  partnerDisplay: string;
}) {
  const total = mine + partner;
  const myPct = total === 0 ? 50 : (mine / total) * 100;
  const partnerPct = total === 0 ? 50 : (partner / total) * 100;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs font-medium mb-1.5 px-1 gap-2">
        <span
          className={`${mine > partner ? "text-peach-500" : "text-ink-400"} truncate`}
        >
          {myDisplay} (
          <span className="font-number font-bold">{mine.toFixed(1)}</span>)
        </span>
        <span
          className={`${partner > mine ? "text-rose-500" : "text-ink-400"} truncate`}
        >
          {partnerDisplay} (
          <span className="font-number font-bold">{partner.toFixed(1)}</span>)
        </span>
      </div>
      <div className="w-full h-4 bg-cream-100 rounded-full flex overflow-hidden border border-cream-200">
        <div
          className="h-full bg-peach-400 transition-all duration-700"
          style={{ width: `${myPct}%` }}
        />
        <div className="w-1 h-full bg-white z-10" />
        <div
          className="h-full bg-rose-400 transition-all duration-700"
          style={{ width: `${partnerPct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- card editor modal ----------
//
// Lets the user reorder + show/hide carousel cards. Renders cards in
// their current `order`, with checkbox for visibility and ↑/↓ buttons
// for swapping with neighbors. Changes flow up via `onChange`; parent
// owns the persistence so this stays purely presentational.

function CardEditorModal({
  config,
  onChange,
  onClose,
}: {
  config: CardConfig;
  onChange: (next: CardConfig) => void;
  onClose: () => void;
}) {
  const toggleHidden = (id: CardId) => {
    const isHidden = config.hidden.includes(id);
    onChange({
      ...config,
      hidden: isHidden
        ? config.hidden.filter((x) => x !== id)
        : [...config.hidden, id],
    });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...config.order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...config, order: next });
  };

  const reset = () => onChange(DEFAULT_CONFIG);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-cream-200 animate-in slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200">
          <div>
            <h3 className="font-bold text-ink-900 text-base">
              카드 관리 · 卡片管理
            </h3>
            <p className="text-[11px] text-ink-500 mt-0.5">
              순서 바꾸거나 숨길 카드를 골라요 · 调整顺序或隐藏卡片
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-cream-100 transition"
            aria-label="close"
          >
            <X className="w-4 h-4 text-ink-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {config.order.map((id, idx) => {
            const meta = CARD_META[id];
            const isHidden = config.hidden.includes(id);
            return (
              <div
                key={id}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition ${
                  isHidden
                    ? "bg-cream-50 border-cream-200 opacity-70"
                    : "bg-white border-cream-200"
                }`}
              >
                <span className="text-2xl flex-shrink-0">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13px] font-bold truncate ${
                      isHidden ? "text-ink-400 line-through" : "text-ink-900"
                    }`}
                  >
                    {meta.ko}
                  </p>
                  <p className="text-[10px] text-ink-400 truncate">
                    {meta.zh}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded-lg border border-cream-200 bg-white flex items-center justify-center text-ink-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cream-100 transition text-[13px] font-bold"
                    aria-label="move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === config.order.length - 1}
                    className="w-7 h-7 rounded-lg border border-cream-200 bg-white flex items-center justify-center text-ink-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cream-100 transition text-[13px] font-bold"
                    aria-label="move down"
                  >
                    ↓
                  </button>
                  <label className="ml-1 inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => toggleHidden(id)}
                      className="sr-only peer"
                    />
                    <span className="w-9 h-5 bg-cream-200 rounded-full relative peer-checked:bg-peach-400 transition">
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          !isHidden ? "translate-x-4" : ""
                        }`}
                      />
                    </span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-cream-200 px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-bold text-ink-500 hover:text-ink-700 transition"
          >
            기본값 복원 · 恢复默认
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-ink-900 text-white rounded-xl text-[12px] font-bold hover:bg-ink-700 transition"
          >
            완료 · 完成
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 운명의 룰렛 카드 ----------
//
// Action card for the carousel — entry-point to the RouletteModal that
// used to be triggered from a HomePage chip. Lives in ComparePage so
// the bottom of the home timeline doesn't sprout yet another floating
// button. Tone: peach→rose gradient since this is a "decide" moment,
// not a stat readout.
function RouletteCard({
  onSpin,
  revisitCount,
  wishlistCount,
}: {
  onSpin: () => void;
  revisitCount: number;
  wishlistCount: number;
}) {
  const total = revisitCount + wishlistCount;
  return (
    <div className="relative bg-gradient-to-br from-peach-50 to-rose-50 rounded-3xl p-5 border border-peach-200/70 shadow-airy h-full flex flex-col min-h-[240px] overflow-hidden">
      <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-peach-300 to-rose-300 opacity-25 blur-2xl pointer-events-none" />

      <h3 className="relative z-10 font-sans font-bold text-ink-900 text-[15px] flex items-center gap-1.5 mb-3 border-b border-peach-200/60 pb-3 break-keep">
        <Dice5 className="w-4 h-4 text-peach-500 flex-shrink-0" />
        운명의 룰렛 · 听天由命
      </h3>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center gap-3">
        <div className="text-5xl drop-shadow-sm">🎲</div>
        <p className="text-[13px] font-bold text-ink-900 break-keep">
          오늘 뭐 먹지? · 今天吃啥？
        </p>
        <p className="text-[11px] font-medium text-ink-500 break-keep px-2">
          또갈래·가볼래에서 한 곳을 운명이 골라드림 ·
          二刷·种草里随机抽一家
        </p>
      </div>

      <div className="relative z-10 mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl px-2 py-1.5 border border-rose-200/60 bg-white/70 text-center">
          <div className="text-[9px] font-bold tracking-wider uppercase text-rose-400">
            또 갈래 · 二刷
          </div>
          <div className="font-number font-black text-[16px] leading-none mt-0.5 text-ink-900">
            {revisitCount}
          </div>
        </div>
        <div className="rounded-xl px-2 py-1.5 border border-amber-200/60 bg-white/70 text-center">
          <div className="text-[9px] font-bold tracking-wider uppercase text-amber-500">
            가볼래 · 种草
          </div>
          <div className="font-number font-black text-[16px] leading-none mt-0.5 text-ink-900">
            {wishlistCount}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSpin}
        disabled={total === 0}
        className="relative z-10 mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-peach-400 to-rose-400 text-white text-[13px] font-bold shadow-soft hover:from-peach-500 hover:to-rose-500 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Dice5 className="w-4 h-4" />
        {total === 0 ? "후보가 없어요 · 暂无候选" : "룰렛 돌리기 · 抽签"}
      </button>
    </div>
  );
}
