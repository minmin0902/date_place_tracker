import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Swords, HeartHandshake, Frown } from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { PageHeader } from "@/components/PageHeader";

type Row = {
  foodId: string;
  placeId: string;
  placeName: string;
  foodName: string;
  mine: number;
  partner: number;
};

const HIGH = 4; // both ≥ 4  → 천생연분 / 灵魂伴侣
const LOW = 2; // both ≤ 2  → 다신 안 가 / 再也不去
const WAR = 2; // diff ≥ 2  → 입맛 전쟁 / 口味之争

export default function ComparePage() {
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);

  const rows: Row[] = useMemo(() => {
    if (!places) return [];
    const out: Row[] = [];
    for (const p of places) {
      for (const f of p.foods ?? []) {
        if (f.my_rating == null || f.partner_rating == null) continue;
        out.push({
          foodId: f.id,
          placeId: p.id,
          placeName: p.name,
          foodName: f.name,
          mine: f.my_rating,
          partner: f.partner_rating,
        });
      }
    }
    return out;
  }, [places]);

  const soulmates = [...rows]
    .filter((r) => r.mine >= HIGH && r.partner >= HIGH)
    .sort((a, b) => b.mine + b.partner - (a.mine + a.partner));

  const neverAgain = [...rows]
    .filter((r) => r.mine <= LOW && r.partner <= LOW)
    .sort((a, b) => a.mine + a.partner - (b.mine + b.partner));

  const tasteWar = [...rows]
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
      <div className="px-5 space-y-8 pt-2 pb-8">
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
      </div>
    </div>
  );
}

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
}: {
  r: Row;
  showTotal?: boolean;
  showBalance?: boolean;
  badge?: string;
}) {
  const total = r.mine + r.partner;
  return (
    <Link
      to={`/places/${r.placeId}`}
      className="block bg-white rounded-2xl p-4 border border-cream-200 shadow-soft relative overflow-hidden"
    >
      {badge && (
        <div className="absolute top-0 right-0 bg-ink-900 text-white text-[10px] font-semibold px-3 py-1 rounded-bl-xl">
          {badge}
        </div>
      )}
      <div className="flex items-start justify-between gap-3 pr-1">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-900 text-base truncate">
            {r.foodName}
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
