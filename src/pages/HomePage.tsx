import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Heart, Search } from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces, type PlaceWithFoods } from "@/hooks/usePlaces";
import { PageHeader } from "@/components/PageHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { RatingReadonly } from "@/components/RatingPicker";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

function avgTotal(p: PlaceWithFoods): number | null {
  const scores = p.foods
    .map((f) => (f.my_rating ?? 0) + (f.partner_rating ?? 0))
    .filter((n) => n > 0);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: couple } = useCouple();
  const { data: places, isLoading } = usePlaces(couple?.id);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [revisitOnly, setRevisitOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "score">("date");

  const filtered = useMemo(() => {
    if (!places) return [];
    let list = places.filter((p) => {
      if (category && p.category !== category) return false;
      if (revisitOnly && !p.want_to_revisit) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${p.name} ${p.address ?? ""} ${p.memo ?? ""}`.toLowerCase();
        const foodHit = p.foods.some((f) =>
          f.name.toLowerCase().includes(q)
        );
        if (!hay.includes(q) && !foodHit) return false;
      }
      return true;
    });
    if (sortBy === "score") {
      list = [...list].sort((a, b) => (avgTotal(b) ?? -1) - (avgTotal(a) ?? -1));
    }
    return list;
  }, [places, query, category, revisitOnly, sortBy]);

  return (
    <div>
      <PageHeader
        title={t("app.title")}
        subtitle={t("app.tagline")}
        right={<LanguageToggle />}
      />

      <div className="px-5 space-y-4">
        {/* search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            className="input-base pl-10"
            placeholder={t("common.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* filters */}
        <div className="space-y-2">
          <CategoryChips
            options={PLACE_CATEGORIES}
            value={category}
            onChange={setCategory}
            scope="category"
            allowEmpty
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRevisitOnly((v) => !v)}
              className={`chip gap-1 ${revisitOnly ? "chip-active" : ""}`}
            >
              <Heart className="w-3 h-3" />
              {t("place.filterRevisit")}
            </button>
            <button
              type="button"
              onClick={() =>
                setSortBy(sortBy === "date" ? "score" : "date")
              }
              className="chip"
            >
              {sortBy === "date" ? t("place.sortByDate") : t("place.sortByScore")}
            </button>
          </div>
        </div>

        {/* list */}
        {isLoading && <p className="text-ink-500 py-8 text-center">{t("common.loading")}</p>}
        {!isLoading && !filtered.length && (
          <div className="py-16 text-center">
            <div className="text-5xl mb-3">🍽️</div>
            <p className="text-ink-500">{t("common.empty")}</p>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((p) => {
            const avg = avgTotal(p);
            return (
              <Link
                key={p.id}
                to={`/places/${p.id}`}
                className="card p-4 flex gap-3 active:scale-[0.99] transition"
              >
                {p.photo_urls?.[0] ? (
                  <img
                    src={p.photo_urls[0]}
                    className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
                    alt=""
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-cream-100 flex items-center justify-center text-3xl flex-shrink-0">
                    🍴
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    {p.want_to_revisit && (
                      <Heart className="w-4 h-4 fill-rose-400 text-rose-400 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {formatDate(p.date_visited, i18n.language)}
                    {p.category && ` · ${t(`category.${p.category}`)}`}
                  </p>
                  {p.address && (
                    <p className="text-xs text-ink-500 truncate">{p.address}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {avg !== null ? (
                      <>
                        <span className="text-sm font-semibold text-peach-500">
                          {avg.toFixed(1)}
                        </span>
                        <span className="text-xs text-ink-500">/ 10</span>
                      </>
                    ) : (
                      <RatingReadonly value={0} />
                    )}
                    <span className="text-xs text-ink-500">· {p.foods.length} {t("place.foods")}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <Link
        to="/places/new"
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-peach-400 text-white shadow-soft flex items-center justify-center active:scale-90 transition"
        aria-label="add place"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
