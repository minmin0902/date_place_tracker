import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useDeleteFood,
  useDeletePlace,
  usePlace,
} from "@/hooks/usePlaces";
import { PageHeader } from "@/components/PageHeader";
import { RatingReadonly } from "@/components/RatingPicker";
import { formatDate } from "@/lib/utils";

export default function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data: place, isLoading } = usePlace(id);
  const deletePlace = useDeletePlace();
  const deleteFood = useDeleteFood();

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

      <div className="px-5 space-y-4">
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

        <div className="flex flex-wrap gap-2 text-sm text-ink-700">
          {place.category && (
            <span className="chip">{t(`category.${place.category}`)}</span>
          )}
          {place.want_to_revisit && (
            <span className="chip bg-rose-100 border-rose-200 text-rose-500">
              <Heart className="w-3 h-3 fill-current mr-1" />
              {t("place.wantRevisit")}
            </span>
          )}
          {avg && (
            <span className="chip bg-peach-100 border-peach-200 text-peach-500">
              {t("place.avgScore")} {avg} / 10
            </span>
          )}
        </div>

        {place.address && (
          <div className="card p-4 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-peach-400 mt-0.5" />
            <p className="text-sm text-ink-700 flex-1">{place.address}</p>
          </div>
        )}

        {place.memo && (
          <div className="card p-4 whitespace-pre-wrap text-sm text-ink-700">
            {place.memo}
          </div>
        )}

        {/* Foods */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="font-display font-bold text-lg">{t("place.foods")}</h2>
          <Link
            to={`/places/${place.id}/foods/new`}
            className="btn-ghost !px-3 text-peach-500"
          >
            <Plus className="w-4 h-4" />
            {t("place.addFood")}
          </Link>
        </div>

        {!foods.length && (
          <p className="text-ink-500 text-center py-6">{t("place.noFoods")}</p>
        )}

        <div className="space-y-3">
          {foods.map((f) => {
            const total = (f.my_rating ?? 0) + (f.partner_rating ?? 0);
            return (
              <div key={f.id} className="card p-4">
                <div className="flex gap-3">
                  {f.photo_url ? (
                    <img
                      src={f.photo_url}
                      className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                      alt=""
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-cream-100 flex items-center justify-center text-2xl flex-shrink-0">
                      🍜
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{f.name}</h3>
                        {f.category && (
                          <span className="text-xs text-ink-500">
                            {t(`category.${f.category}`)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Link
                          to={`/places/${place.id}/foods/${f.id}/edit`}
                          className="btn-ghost !p-1.5"
                          aria-label="edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => void onDeleteFood(f.id)}
                          className="btn-ghost !p-1.5 text-rose-400"
                          aria-label="delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-500">{t("food.myRating")}</span>
                        <RatingReadonly value={f.my_rating} color="peach" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-500">
                          {t("food.partnerRating")}
                        </span>
                        <RatingReadonly value={f.partner_rating} color="rose" />
                      </div>
                      {total > 0 && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-cream-100">
                          <span className="text-ink-500">
                            {t("food.totalScore")}
                          </span>
                          <span className="font-semibold text-peach-500">
                            {total} / 10
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {f.memo && (
                  <p className="text-sm text-ink-700 mt-3 whitespace-pre-wrap">
                    {f.memo}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
