import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useDeleteFood,
  useDeletePlace,
  usePlace,
  useUpsertPlace,
} from "@/hooks/usePlaces";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/utils";
import type { Food } from "@/lib/database.types";

const DIFF_THRESHOLD = 1;

export default function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data: place, isLoading } = usePlace(id);
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const deletePlace = useDeletePlace();
  const deleteFood = useDeleteFood();
  const upsertPlace = useUpsertPlace();

  async function toggleRevisit() {
    if (!place || !user || !couple) return;
    await upsertPlace.mutateAsync({
      id: place.id,
      coupleId: couple.id,
      userId: user.id,
      values: {
        name: place.name,
        date_visited: place.date_visited,
        address: place.address,
        category: place.category,
        memo: place.memo,
        want_to_revisit: !place.want_to_revisit,
        latitude: place.latitude,
        longitude: place.longitude,
        photo_urls: place.photo_urls,
      },
    });
  }

  if (isLoading) {
    return <p className="p-8 text-center text-ink-500">{t("common.loading")}</p>;
  }
  if (!place) {
    return <p className="p-8 text-center text-ink-500">{t("common.empty")}</p>;
  }

  const foods = place.foods ?? [];
  const totals = foods
    .map((f) => (f.my_rating ?? 0) + (f.partner_rating ?? 0))
    .filter((n) => n > 0);
  const avg = totals.length
    ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)
    : null;

  // Group foods by opinion spread.
  // Same:   |diff| <= 0.5
  // Diff:   |diff| >= 1 (sorted by diff desc)
  // (items with 0.5 < diff < 1 fall into "same" as close-enough)
  const rated = foods.filter(
    (f) => f.my_rating != null && f.partner_rating != null
  );
  const unrated = foods.filter(
    (f) => f.my_rating == null || f.partner_rating == null
  );
  const diffOf = (f: Food) =>
    Math.abs((f.my_rating ?? 0) - (f.partner_rating ?? 0));

  const agreeFoods = rated.filter((f) => diffOf(f) < DIFF_THRESHOLD);
  const disagreeFoods = rated
    .filter((f) => diffOf(f) >= DIFF_THRESHOLD)
    .sort((a, b) => diffOf(b) - diffOf(a));

  async function onDeletePlace() {
    if (!place) return;
    if (!confirm(t("common.confirmDelete"))) return;
    await deletePlace.mutateAsync(place.id);
    navigate("/", { replace: true });
  }

  async function onDeleteFood(fid: string) {
    if (!confirm(t("common.confirmDelete"))) return;
    await deleteFood.mutateAsync(fid);
  }

  return (
    <div>
      <PageHeader
        title={place.name}
        subtitle={formatDate(place.date_visited, i18n.language)}
        back
        right={
          <div className="flex gap-1">
            <Link
              to={`/places/${place.id}/edit`}
              className="btn-ghost !p-2"
              aria-label="edit"
            >
              <Pencil className="w-5 h-5" />
            </Link>
            <button
              onClick={() => void onDeletePlace()}
              className="btn-ghost !p-2 text-rose-400"
              aria-label="delete"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        }
      />

      <div className="px-5 py-2 space-y-5 pb-8">
        {/* Photos */}
        {place.photo_urls && place.photo_urls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
            {place.photo_urls.map((url) => (
              <img
                key={url}
                src={url}
                className="h-40 rounded-2xl object-cover flex-shrink-0"
                alt=""
              />
            ))}
          </div>
        )}

        {/* Bento summary */}
        <section className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex items-center justify-between p-6 rounded-[2rem] bg-gradient-to-br from-peach-100 to-rose-100 border border-rose-200/60 shadow-airy">
            <div>
              <p className="text-sm font-medium text-rose-500 mb-1">
                {t("place.avgScore")}
              </p>
              <div className="text-5xl font-number font-bold text-transparent bg-clip-text bg-gradient-to-r from-peach-400 to-rose-400 tracking-tight">
                {avg ?? "-"}
                <span className="text-xl font-bold text-rose-300 ml-1">/10</span>
              </div>
            </div>
            <div className="text-5xl drop-shadow-sm">🏆</div>
          </div>

          {place.category && (
            <div className="p-4 rounded-3xl bg-white border border-cream-200 flex flex-col items-center justify-center gap-2 shadow-soft">
              <span className="text-3xl">{categoryEmoji(place.category)}</span>
              <span className="text-sm font-medium text-ink-700">
                {t(`category.${place.category}`)}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void toggleRevisit()}
            disabled={upsertPlace.isPending}
            className={`p-4 rounded-3xl border flex flex-col items-center justify-center gap-2 shadow-soft transition-colors active:scale-[0.98] disabled:opacity-60 ${
              place.want_to_revisit
                ? "bg-rose-100 border-rose-200 text-rose-500"
                : "bg-white border-cream-200 text-ink-400 hover:border-rose-200 hover:text-rose-400"
            } ${!place.category ? "col-span-2" : ""}`}
            aria-pressed={place.want_to_revisit}
          >
            <Heart
              className={`w-7 h-7 transition ${
                place.want_to_revisit ? "fill-rose-400 text-rose-400" : ""
              }`}
            />
            <span className="text-sm font-medium">{t("place.wantRevisit")}</span>
          </button>
        </section>

        {/* Address + memo */}
        {(place.address || place.memo) && (
          <section className="space-y-3">
            {place.address && (
              <div className="card p-4 flex items-start gap-3">
                <MapPin className="w-5 h-5 text-peach-400 mt-0.5" />
                <p className="text-sm text-ink-700">{place.address}</p>
              </div>
            )}
            {place.memo && (
              <div className="card p-4 text-sm text-ink-700 whitespace-pre-wrap">
                {place.memo}
              </div>
            )}
          </section>
        )}

        {/* Foods */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg flex items-baseline gap-2">
              {t("place.foods")}
              <span className="text-peach-400 text-sm">{foods.length}</span>
            </h2>
            <Link
              to={`/places/${place.id}/foods/new`}
              className="flex items-center gap-1 px-3 py-1.5 bg-peach-100 text-peach-500 rounded-full text-sm font-medium hover:bg-peach-200 transition"
            >
              <Plus className="w-4 h-4" />
              {t("place.addFood")}
            </Link>
          </div>

          {!foods.length && (
            <div className="text-center py-10 bg-white rounded-3xl border border-cream-200 border-dashed">
              <span className="text-4xl mb-2 block">🍽️</span>
              <p className="text-ink-500 text-sm">{t("place.noFoods")}</p>
            </div>
          )}

          {disagreeFoods.length > 0 && (
            <FoodGroup
              title={t("place.disagreeFoods")}
              tone="rose"
              foods={disagreeFoods}
              placeId={place.id}
              onDelete={(fid) => void onDeleteFood(fid)}
            />
          )}

          {agreeFoods.length > 0 && (
            <FoodGroup
              title={t("place.agreeFoods")}
              tone="peach"
              foods={agreeFoods}
              placeId={place.id}
              onDelete={(fid) => void onDeleteFood(fid)}
            />
          )}

          {unrated.length > 0 && (
            <FoodGroup
              title="-"
              tone="neutral"
              foods={unrated}
              placeId={place.id}
              onDelete={(fid) => void onDeleteFood(fid)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function FoodGroup({
  title,
  tone,
  foods,
  placeId,
  onDelete,
}: {
  title: string;
  tone: "peach" | "rose" | "neutral";
  foods: Food[];
  placeId: string;
  onDelete: (id: string) => void;
}) {
  const dotClass =
    tone === "rose"
      ? "bg-rose-400"
      : tone === "peach"
        ? "bg-peach-400"
        : "bg-ink-300";
  return (
    <div className="mt-5 first:mt-0">
      {title !== "-" && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          <span className="text-sm font-semibold text-ink-700">{title}</span>
        </div>
      )}
      <div className="space-y-3">
        {foods.map((f) => (
          <FoodCard key={f.id} food={f} placeId={placeId} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function FoodCard({
  food,
  placeId,
  onDelete,
}: {
  food: Food;
  placeId: string;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const my = food.my_rating ?? 0;
  const partner = food.partner_rating ?? 0;
  const total = my + partner;
  const diff = Math.abs(my - partner);

  return (
    <div className="card p-4 relative">
      <div className="absolute top-3 right-3 flex gap-1">
        <Link
          to={`/places/${placeId}/foods/${food.id}/edit`}
          className="p-1.5 rounded-full hover:bg-cream-100 text-ink-400"
          aria-label="edit"
        >
          <Pencil className="w-4 h-4" />
        </Link>
        <button
          onClick={() => onDelete(food.id)}
          className="p-1.5 rounded-full hover:bg-rose-50 text-rose-400"
          aria-label="delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3 pr-16 mb-3">
        <h3 className="font-semibold text-ink-900 text-base truncate">
          {food.name}
        </h3>
        {total > 0 && (
          <div className="text-2xl font-number font-bold text-peach-400 leading-none">
            {total.toFixed(1)}
          </div>
        )}
      </div>

      {(food.my_rating != null || food.partner_rating != null) && (
        <>
          <div className="flex justify-between text-xs text-ink-500 mb-1 px-0.5">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-peach-400" />
              {t("food.myRating")}{" "}
              <span className="font-number font-bold">
                {food.my_rating != null ? my.toFixed(1) : "-"}
              </span>
            </span>
            <span className="flex items-center gap-1">
              {t("food.partnerRating")}{" "}
              <span className="font-number font-bold">
                {food.partner_rating != null ? partner.toFixed(1) : "-"}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            </span>
          </div>
          <CoupleBar mine={my} partner={partner} />
          {diff >= DIFF_THRESHOLD && (
            <p className="text-xs text-rose-400 mt-2 font-number">
              Δ {diff.toFixed(1)}
            </p>
          )}
        </>
      )}

      {food.memo && (
        <p className="text-sm text-ink-700 mt-3 whitespace-pre-wrap">
          {food.memo}
        </p>
      )}
    </div>
  );
}

function CoupleBar({ mine, partner }: { mine: number; partner: number }) {
  // Each side fills up to 50% of the bar, scaled from its 0-5 rating.
  const myW = Math.min((mine / 5) * 50, 50);
  const partnerW = Math.min((partner / 5) * 50, 50);
  return (
    <div className="w-full h-3 bg-cream-100 rounded-full flex overflow-hidden border border-cream-200">
      <div
        className="h-full bg-peach-400 transition-all duration-500"
        style={{ width: `${myW}%` }}
      />
      <div className="flex-1 bg-transparent" />
      <div
        className="h-full bg-rose-400 transition-all duration-500 ml-auto"
        style={{ width: `${partnerW}%` }}
      />
    </div>
  );
}

function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
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
  return map[cat] ?? "🍽️";
}
