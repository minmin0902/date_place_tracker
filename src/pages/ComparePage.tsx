import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { PageHeader } from "@/components/PageHeader";
import { RatingReadonly } from "@/components/RatingPicker";

type Row = {
  foodId: string;
  placeId: string;
  placeName: string;
  foodName: string;
  mine: number | null;
  partner: number | null;
  diff: number;
};

export default function ComparePage() {
  const { t } = useTranslation();
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);

  const rows: Row[] = useMemo(() => {
    if (!places) return [];
    const out: Row[] = [];
    for (const p of places) {
      for (const f of p.foods) {
        if (f.my_rating == null && f.partner_rating == null) continue;
        out.push({
          foodId: f.id,
          placeId: p.id,
          placeName: p.name,
          foodName: f.name,
          mine: f.my_rating,
          partner: f.partner_rating,
          diff: Math.abs((f.my_rating ?? 0) - (f.partner_rating ?? 0)),
        });
      }
    }
    return out;
  }, [places]);

  const agree = [...rows]
    .filter((r) => r.mine != null && r.partner != null)
    .sort(
      (a, b) =>
        a.diff - b.diff ||
        ((b.mine ?? 0) + (b.partner ?? 0)) - ((a.mine ?? 0) + (a.partner ?? 0))
    )
    .slice(0, 5);

  const disagree = [...rows]
    .filter((r) => r.mine != null && r.partner != null)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  const topTotal = [...rows]
    .map((r) => ({ ...r, total: (r.mine ?? 0) + (r.partner ?? 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div>
      <PageHeader title={t("nav.compare")} />
      <div className="px-5 space-y-6 pb-6">
        <Section title={`🏆 Top ${topTotal.length}`}>
          {topTotal.map((r) => (
            <RowCard key={r.foodId} r={r} />
          ))}
        </Section>

        <Section title="💕 취향 일치 / 口味一致">
          {agree.map((r) => (
            <RowCard key={r.foodId} r={r} />
          ))}
        </Section>

        <Section title="🤔 의견 달라요 / 意见不同">
          {disagree.map((r) => (
            <RowCard key={r.foodId} r={r} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display font-bold text-lg mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RowCard({ r }: { r: Row }) {
  const total = (r.mine ?? 0) + (r.partner ?? 0);
  return (
    <Link to={`/places/${r.placeId}`} className="card p-3 block">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{r.foodName}</p>
          <p className="text-xs text-ink-500 truncate">@ {r.placeName}</p>
        </div>
        <span className="text-lg font-display font-bold text-peach-500 flex-shrink-0">
          {total}
        </span>
      </div>
      <div className="mt-2 flex gap-4">
        <div className="flex-1">
          <RatingReadonly value={r.mine} color="peach" />
        </div>
        <div className="flex-1">
          <RatingReadonly value={r.partner} color="rose" />
        </div>
      </div>
    </Link>
  );
}
