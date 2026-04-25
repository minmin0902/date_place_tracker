import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dna,
  Frown,
  HeartHandshake,
  Scale,
  Swords,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { PageHeader } from "@/components/PageHeader";
import { ratingsForViewer } from "@/lib/utils";

type DiningFilter = "all" | "out" | "home";

type Row = {
  foodId: string;
  placeId: string;
  placeName: string;
  foodName: string;
  isHomeCooked: boolean;
  placeCategory: string | null;
  mine: number;
  partner: number;
};

// ---------- 푸드 BTI ----------
//
// We don't have a free-form tag column on foods, so the BTI is derived
// from each parent place's category. Every place feeds 1+ BTI buckets;
// the bucket with the highest avg couple score becomes the couple's
// "type" and the rest get listed as a percentage breakdown.

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
    titleKo: "뼛속까지 국밥충",
    titleZh: "韩食胃",
    descKo: "결국 돌고 돌아 든든한 한식이 최고!",
    descZh: "走到哪都忘不了那一碗汤饭！",
    gradient: "from-teal-500 to-emerald-500",
    bar: "bg-teal-500",
  },
  western: {
    emoji: "🍝",
    titleKo: "분위기 킬러 커플",
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
    titleKo: "카페 죽돌이",
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

const CATEGORY_TO_BTI: Record<string, BtiKey[]> = {
  korean: ["korean"],
  // Japanese feeds both the broad asian bucket AND its own dedicated
  // BTI so couples who lean specifically Japanese (sushi, ramen, etc.)
  // can surface that taste profile without losing the asian aggregate.
  japanese: ["asian", "japanese"],
  chinese: ["asian"],
  italian: ["western"],
  western: ["western"],
  mexican: ["western", "exotic"],
  thai: ["asian", "exotic"],
  vietnamese: ["asian"],
  indian: ["exotic", "asian"],
  // Cafe contributes to both the dessert-y "sweet" bucket and a
  // dedicated "cafe lover" bucket, so coffee-only crawlers (no
  // dessert) still get a profile that fits.
  cafe: ["sweet", "cafe"],
  bakery: ["sweet"],
  brunch: ["sweet", "western"],
  dessert: ["sweet"],
  bar: ["drinker"],
  // other → no inference
};

const YYDS = 4.5; // both ≥ 4.5  → 명예의 전당
const HIGH = 4; // both ≥ 4    → 천생연분
const LOW = 2; // both ≤ 2    → 여긴 패스
const WAR = 2; // diff ≥ 2    → 입맛 격돌

export default function ComparePage() {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);

  const [diningFilter, setDiningFilter] = useState<DiningFilter>("all");

  const rows: Row[] = useMemo(() => {
    if (!places) return [];
    const out: Row[] = [];
    for (const p of places) {
      for (const f of p.foods ?? []) {
        if (f.my_rating == null || f.partner_rating == null) continue;
        // mine / partner are bound to the current viewer so the
        // "내 원픽" badge + bar always reads right whichever partner
        // is logged in.
        const view = ratingsForViewer(f, user?.id);
        out.push({
          foodId: f.id,
          placeId: p.id,
          placeName: p.name,
          foodName: f.name,
          isHomeCooked: !!p.is_home_cooked,
          placeCategory: p.category,
          mine: view.myRating ?? 0,
          partner: view.partnerRating ?? 0,
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

  // YYDS — 둘 다 ≥4.5. Caps at top 3 so the trophy section stays focused.
  const yyds = [...filteredRows]
    .filter((r) => r.mine >= YYDS && r.partner >= YYDS)
    .sort((a, b) => b.mine + b.partner - (a.mine + a.partner))
    .slice(0, 3);
  const yydsIds = new Set(yyds.map((r) => r.foodId));

  // 천생연분 — 둘 다 ≥4 but not already in YYDS (so the same dish doesn't
  // appear in both sections).
  const soulmates = [...filteredRows]
    .filter(
      (r) => r.mine >= HIGH && r.partner >= HIGH && !yydsIds.has(r.foodId)
    )
    .sort((a, b) => b.mine + b.partner - (a.mine + a.partner));

  const neverAgain = [...filteredRows]
    .filter((r) => r.mine <= LOW && r.partner <= LOW)
    .sort((a, b) => a.mine + a.partner - (b.mine + b.partner));

  const tasteWar = [...filteredRows]
    .filter(
      (r) =>
        Math.abs(r.mine - r.partner) >= WAR &&
        // exclude rows that are already in the extreme-agreement buckets
        !(r.mine >= HIGH && r.partner >= HIGH) &&
        !(r.mine <= LOW && r.partner <= LOW)
    )
    .sort(
      (a, b) => Math.abs(b.mine - b.partner) - Math.abs(a.mine - a.partner)
    );

  return (
    <div>
      <PageHeader
        title="우리의 취향 지도 · 我们的口味地图"
        subtitle="서로의 입맛을 한눈에 비교해봐요 · 一秒看懂咱俩的口味默契"
      />

      {/* 외식/집밥 필터 — HomePage 와 같은 톤으로 통일 */}
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

      <div className="px-5 space-y-8 pt-5 pb-8">
        {filteredRows.length > 0 && <FoodBtiCard rows={filteredRows} />}

        {filteredRows.length > 0 && <RatingStats rows={filteredRows} />}

        {/* 명예의 전당 — 둘 다 4.5+ 준 메뉴 TOP 3 */}
        {yyds.length > 0 && (
          <Section
            icon={<Trophy className="w-5 h-5" />}
            iconBg="bg-amber-100"
            iconColor="text-amber-500"
            titleKo="🏆 명예의 전당 TOP 3"
            titleZh="封神榜 YYDS"
            descKo="둘 다 만점급 준 레전드 메뉴!"
            descZh="俩人都给了神级评分！"
          >
            {yyds.map((r, idx) => (
              <FoodCard
                key={r.foodId}
                r={r}
                showTotal
                yyds
                badge={`🏆 TOP ${idx + 1}`}
              />
            ))}
          </Section>
        )}

        <Section
          icon={<HeartHandshake className="w-5 h-5" />}
          iconBg="bg-rose-100"
          iconColor="text-rose-500"
          titleKo="💕 천생연분 맛집"
          titleZh="双向奔赴"
          descKo="우리 둘 다 푹 빠진 곳"
          descZh="俩人都爱惨了！"
          empty={soulmates.length === 0}
          emptyText="아직 없어요 · 还没有"
        >
          {soulmates.map((r) => (
            <FoodCard key={r.foodId} r={r} showTotal />
          ))}
        </Section>

        <Section
          icon={<Swords className="w-5 h-5" />}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-500"
          titleKo="🥊 입맛 격돌"
          titleZh="口味大PK"
          descKo="서로 취향이 확 갈린 메뉴"
          descZh="评价两极分化"
          empty={tasteWar.length === 0}
          emptyText="아직 없어요 · 还没有"
        >
          {tasteWar.map((r) => {
            const myFav = r.mine > r.partner;
            const badge = myFav
              ? "🙋‍♂️ 내 원픽! · 我的本命"
              : "🙋‍♀️ 짝꿍 원픽! · 宝宝的本命";
            return <FoodCard key={r.foodId} r={r} badge={badge} showBalance />;
          })}
        </Section>

        {neverAgain.length > 0 && (
          <Section
            icon={<Frown className="w-5 h-5" />}
            iconBg="bg-cream-200"
            iconColor="text-ink-500"
            titleKo="🙅 여긴 패스!"
            titleZh="踩雷预警"
            descKo="우리 스타일은 아니었던 곳"
            descZh="绝对的黑名单"
          >
            {neverAgain.map((r) => (
              <FoodCard key={r.foodId} r={r} />
            ))}
          </Section>
        )}

        {filteredRows.length === 0 && (
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
        )}
      </div>
    </div>
  );
}

// ---------- 푸드 BTI 카드 ----------
//
// Aggregates couple-average scores per BTI bucket using the parent
// place's category. Top bucket → big "current type" hero. Other
// non-zero buckets → percentage breakdown bars under it.

function FoodBtiCard({ rows }: { rows: Row[] }) {
  const stats = useMemo(() => {
    const totals = new Map<BtiKey, { sum: number; count: number }>();
    for (const r of rows) {
      const cat = r.placeCategory;
      if (!cat) continue;
      const buckets = CATEGORY_TO_BTI[cat];
      if (!buckets) continue;
      const coupleAvg = (r.mine + r.partner) / 2;
      for (const k of buckets) {
        const t = totals.get(k) ?? { sum: 0, count: 0 };
        t.sum += coupleAvg;
        t.count += 1;
        totals.set(k, t);
      }
    }
    const out: { key: BtiKey; avg: number; percent: number; count: number }[] =
      [];
    for (const [key, t] of totals) {
      if (t.count === 0) continue;
      const avg = t.sum / t.count;
      out.push({ key, avg, percent: (avg / 5) * 100, count: t.count });
    }
    out.sort((a, b) => b.avg - a.avg);
    return out;
  }, [rows]);

  if (stats.length === 0) return null;

  const top = stats[0];
  const topProfile = BTI_PROFILES[top.key];

  return (
    <div className="relative bg-white rounded-3xl p-6 border border-cream-200 shadow-airy overflow-hidden">
      {/* Soft tint blob in the top-right matching the top profile so the
          card visually leans toward the diagnosed type without
          overpowering the content. */}
      <div
        className={`absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gradient-to-br ${topProfile.gradient} opacity-[0.08] blur-2xl`}
      />

      <div className="relative z-10 flex flex-col items-center text-center border-b border-cream-100 pb-5 mb-5">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-ink-900 text-white rounded-full text-[10px] font-bold tracking-wider mb-4 shadow-sm font-number">
          <Dna className="w-3.5 h-3.5" /> FOOD BTI
        </div>
        <div className="text-6xl drop-shadow-md mb-2">{topProfile.emoji}</div>
        <h2
          className={`text-[22px] font-sans font-black text-transparent bg-clip-text bg-gradient-to-r ${topProfile.gradient} tracking-tight mb-1.5`}
        >
          {topProfile.titleKo}
        </h2>
        <p className="text-[12px] font-bold text-ink-400">
          {topProfile.titleZh}
        </p>
        <p className="text-[13px] font-medium text-ink-700 mt-3 bg-cream-50 px-4 py-2 rounded-xl">
          “{topProfile.descKo} · {topProfile.descZh}”
        </p>
      </div>

      {/* Section breakdown — top 4 buckets so the card stays compact */}
      <div className="relative z-10 space-y-3.5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[12px] font-bold text-ink-900">
            섹션별 입맛 분석
          </p>
          <p className="text-[10px] text-ink-400 font-medium">
            各口味契合度
          </p>
        </div>
        {stats.slice(0, 4).map((s) => {
          const pf = BTI_PROFILES[s.key];
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className="w-8 flex-shrink-0 text-xl text-center">
                {pf.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[11px] font-bold text-ink-700 mb-1.5 gap-2">
                  <span className="truncate">{pf.titleKo}</span>
                  <span className="font-number flex-shrink-0">
                    {Math.round(s.percent)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-cream-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${pf.bar} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${s.percent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 별점 요정 vs 깐깐징어 통계 카드 ----------

function RatingStats({ rows }: { rows: Row[] }) {
  const avgMine = rows.reduce((s, r) => s + r.mine, 0) / rows.length;
  const avgPartner = rows.reduce((s, r) => s + r.partner, 0) / rows.length;
  const diff = Math.abs(avgMine - avgPartner);
  // Tolerance: differences smaller than 0.1 are noise, treat as a tie.
  const isTie = diff < 0.1;
  // Fixed columns: 나 on the left, 짝꿍 on the right. The role badge
  // (별점 요정 / 깐깐징어) flips to whichever person fits, so the
  // "who is who" reading is left = me, right = partner, no exception.
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
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-5 border border-indigo-100 shadow-airy">
      <h3 className="font-sans font-bold text-ink-900 text-[15px] flex items-center gap-1.5 mb-4">
        <Scale className="w-4 h-4 text-indigo-500" />
        누가 더 후할까? · 谁是打分小天使？
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <PersonStatTile
          person="나 · 我"
          tone="peach"
          avg={avgMine}
          role={myRole}
        />
        <PersonStatTile
          person="짝꿍 · 宝宝"
          tone="rose"
          avg={avgPartner}
          role={partnerRole}
        />
      </div>

      <p className="text-[11px] text-center text-indigo-600 font-medium mt-3">
        {isTie ? (
          "비슷비슷 · 不分上下"
        ) : (
          <>
            평균{" "}
            <span className="font-number font-bold text-[12px] mx-0.5">
              {diff.toFixed(2)}
            </span>
            점 차이
          </>
        )}
      </p>
      <p className="text-[11px] text-ink-500 font-medium mt-1 px-1 text-center">
        총{" "}
        <span className="font-number font-bold text-ink-700">
          {rows.length}
        </span>{" "}
        개 메뉴 기준 · 共{" "}
        <span className="font-number font-bold text-ink-700">{rows.length}</span>{" "}
        道菜
      </p>
    </div>
  );
}

function PersonStatTile({
  person,
  tone,
  avg,
  role,
}: {
  person: string;
  tone: "peach" | "rose";
  avg: number;
  role: "fairy" | "strict" | "tie";
}) {
  const personCls =
    tone === "peach" ? "text-peach-500" : "text-rose-500";
  const accentCls =
    tone === "peach"
      ? "bg-peach-50 border-peach-200"
      : "bg-rose-50 border-rose-200";
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
  return (
    <div
      className={`rounded-2xl p-3 border ${accentCls} flex flex-col items-center text-center shadow-sm`}
    >
      <div className={`text-[12px] font-bold ${personCls} mb-1`}>{person}</div>
      <div className="text-3xl font-number font-bold text-ink-900 leading-none my-1">
        {avg.toFixed(2)}
      </div>
      <div className="text-[9px] text-ink-400 font-bold font-number mb-1.5 tracking-wider">
        / 5.00
      </div>
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleBadgeCls}`}
      >
        <span>{roleEmoji}</span>
        <span>
          {roleKo} · {roleZh}
        </span>
      </div>
    </div>
  );
}

// ---------- segmented 버튼 ----------

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

// ---------- Section + FoodCard ----------

function Section({
  icon,
  iconBg,
  iconColor,
  titleKo,
  titleZh,
  descKo,
  descZh,
  empty,
  emptyText,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  titleKo: string;
  titleZh: string;
  descKo: string;
  descZh: string;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-full ${iconBg} ${iconColor}`}>{icon}</div>
        <div>
          <h2 className="font-sans font-bold text-lg leading-tight">
            {titleKo}
            <span className="ml-2 text-ink-400 text-base font-medium">
              · {titleZh}
            </span>
          </h2>
          <p className="text-xs text-ink-500">
            {descKo} · {descZh}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {empty ? (
          <div className="text-center py-6 bg-white rounded-2xl border border-dashed border-cream-200 text-sm text-ink-400">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function FoodCard({
  r,
  showTotal,
  showBalance,
  badge,
  yyds,
}: {
  r: Row;
  showTotal?: boolean;
  showBalance?: boolean;
  badge?: string;
  yyds?: boolean;
}) {
  const total = r.mine + r.partner;
  // YYDS cards get a warm gold gradient + amber badge so the trophy
  // section visually reads as "premium" without changing the layout.
  const cardCls = yyds
    ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-[0_4px_15px_rgba(251,191,36,0.18)]"
    : "bg-white border-cream-200 shadow-soft";
  const badgeCls = yyds
    ? "bg-amber-500 text-white"
    : "bg-ink-900 text-white";
  return (
    <Link
      to={`/places/${r.placeId}`}
      className={`block rounded-2xl p-4 border relative overflow-hidden ${cardCls}`}
    >
      {badge && (
        <div
          className={`absolute top-0 right-0 text-[10px] font-semibold px-3 py-1 rounded-bl-xl ${badgeCls}`}
        >
          {badge}
        </div>
      )}
      <div className="flex items-start justify-between gap-3 pr-1">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-900 text-base truncate flex items-center gap-1.5 flex-wrap">
            {r.foodName}
            {r.isHomeCooked && (
              <span className="bg-teal-50 text-teal-600 border border-teal-100 px-1 py-0.5 rounded text-[9px] font-bold leading-none shrink-0 whitespace-nowrap">
                🍳 집밥
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
        <BalanceBar mine={r.mine} partner={r.partner} />
      ) : (
        <div className="flex gap-3 mt-3">
          <RatingTile
            label="나 · 我"
            value={r.mine}
            tone="peach"
            leading={r.mine >= r.partner}
          />
          <RatingTile
            label="짝꿍 · 宝宝"
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

function BalanceBar({ mine, partner }: { mine: number; partner: number }) {
  const total = mine + partner;
  const myPct = total === 0 ? 50 : (mine / total) * 100;
  const partnerPct = total === 0 ? 50 : (partner / total) * 100;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs font-medium mb-1.5 px-1">
        <span
          className={mine > partner ? "text-peach-500" : "text-ink-400"}
        >
          나 · 我 (<span className="font-number font-bold">{mine.toFixed(1)}</span>)
        </span>
        <span
          className={partner > mine ? "text-rose-500" : "text-ink-400"}
        >
          짝꿍 · 宝宝 (<span className="font-number font-bold">{partner.toFixed(1)}</span>)
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
