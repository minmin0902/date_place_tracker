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
import { formatDate, ratingsForViewer } from "@/lib/utils";
import { categoryEmojiOf, isKnownPlaceCategory } from "@/lib/constants";
import type { Food } from "@/lib/database.types";

const DIFF_THRESHOLD = 1;

export default function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data: place, isLoading, isError, error } = usePlace(id);
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
  // Surface any underlying Supabase / network error instead of falling
  // through to the silent "common.empty" copy — that made every failure
  // look like a missing record.
  if (isError) {
    console.error("[PlaceDetailPage] usePlace error:", error);
    const e = error as unknown;
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null
          ? JSON.stringify(e)
          : String(e);
    return (
      <div className="p-6">
        <PageHeader title="불러오기 실패 · 加载失败" back />
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 p-4 text-sm whitespace-pre-wrap break-words">
          {msg}
        </div>
        <p className="text-xs text-ink-400 mt-3">
          place id: <span className="font-number">{id}</span>
        </p>
      </div>
    );
  }
  if (!place) {
    return (
      <div className="p-6">
        <PageHeader title="찾을 수 없어요 · 找不到记录" back />
        <p className="mt-4 text-sm text-ink-500">{t("common.empty")}</p>
      </div>
    );
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
        {/* Home-cooked banner — small visual cue that this entry is
            "we made this at home" rather than a restaurant visit. */}
        {place.is_home_cooked && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-full px-3 py-1.5 w-fit text-xs font-bold text-rose-500">
            <span className="text-base leading-none">🍳</span>
            <span>집밥 · 在家做的</span>
          </div>
        )}
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
                우리의 별점 · 我们的评分
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
              <span className="text-3xl">{categoryEmojiOf(place.category)}</span>
              <span className="text-sm font-medium text-ink-700">
                {isKnownPlaceCategory(place.category)
                  ? t(`category.${place.category}`)
                  : place.category}
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
            <span className="text-sm font-medium">또 올래! · 必须二刷</span>
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
            <h2 className="font-sans font-bold text-lg flex items-baseline gap-2">
              우리가 먹은 메뉴 · 我们吃过的
              <span className="text-peach-400 text-sm font-number">
                {foods.length}
              </span>
            </h2>
            <Link
              to={`/places/${place.id}/foods/new`}
              className="flex items-center gap-1 px-3 py-1.5 bg-peach-100 text-peach-500 rounded-full text-sm font-medium hover:bg-peach-200 transition"
            >
              <Plus className="w-4 h-4" />
              메뉴 추가 · 记一笔
            </Link>
          </div>

          {!foods.length && (
            <div className="text-center py-10 bg-white rounded-3xl border border-cream-200 border-dashed">
              <span className="text-4xl mb-2 block">🍽️</span>
              <p className="text-ink-500 text-sm">
                아직 등록된 메뉴가 없어요 · 还没记下吃了啥
              </p>
            </div>
          )}

          {disagreeFoods.length > 0 && (
            <FoodGroup
              title="🧐 서로 입맛이 달랐어요 · 评价两极分化"
              tone="rose"
              foods={disagreeFoods}
              placeId={place.id}
              onDelete={(fid) => void onDeleteFood(fid)}
            />
          )}

          {agreeFoods.length > 0 && (
            <FoodGroup
              title="🥰 둘 다 만족했어요 · 疯狂打call"
              tone="peach"
              foods={agreeFoods}
              placeId={place.id}
              onDelete={(fid) => void onDeleteFood(fid)}
            />
          )}

          {unrated.length > 0 && (
            <FoodGroup
              title="💬 아직 평가 전 · 等待打分"
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
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="text-sm font-semibold text-ink-700">{title}</span>
      </div>
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
  const { user } = useAuth();
  // Swap "my" / "partner" so the current viewer always sees their own
  // score in the "나 · 我" slot. Diff and total are perspective-free
  // (|a-b|, a+b), so the section header classification still works
  // off the raw fields upstream.
  const view = ratingsForViewer(food, user?.id);
  const my = view.myRating ?? 0;
  const partner = view.partnerRating ?? 0;
  const total = my + partner;
  const diff = Math.abs(my - partner);
  const myWasGiven = view.myRating != null;
  const partnerWasGiven = view.partnerRating != null;

  // Normalize: prefer photo_urls, fall back to the legacy single column.
  const photos: string[] =
    food.photo_urls && food.photo_urls.length > 0
      ? food.photo_urls
      : food.photo_url
        ? [food.photo_url]
        : [];

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
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink-900 text-base truncate">
            {food.name}
          </h3>
          {food.chef && <ChefBadge chef={food.chef} />}
          {/* "Rate this" CTA — visible only to the partner who hasn't
              rated this dish yet. Tapping the badge jumps straight to
              the edit form so they can drop a score in one tap. */}
          {!myWasGiven && (
            <Link
              to={`/places/${placeId}/foods/${food.id}/edit`}
              className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
            >
              ✏️ 내 별점 아직 안 줬어요 · 还没打分
            </Link>
          )}
        </div>
        {total > 0 && (
          <div className="text-2xl font-number font-bold text-peach-400 leading-none">
            {total.toFixed(1)}
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 mb-3 pb-1">
          {photos.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-24 w-24 object-cover rounded-xl flex-shrink-0 border border-cream-100"
            />
          ))}
        </div>
      )}

      {(myWasGiven || partnerWasGiven) && (
        <>
          <div className="flex justify-between text-xs text-ink-500 mb-1 px-0.5">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-peach-400" />
              나 · 我{" "}
              <span className="font-number font-bold">
                {myWasGiven ? my.toFixed(1) : "-"}
              </span>
            </span>
            <span className="flex items-center gap-1">
              짝꿍 · 宝宝{" "}
              <span className="font-number font-bold">
                {partnerWasGiven ? partner.toFixed(1) : "-"}
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

// Compact chef-credit badge under the food name. Tone matches the
// home-cooking color cue used elsewhere (peach=me, rose=partner,
// amber=both) for visual continuity.
function ChefBadge({ chef }: { chef: "me" | "partner" | "together" }) {
  const map = {
    me: {
      label: "🙋‍♀️ 내가 만들었어! · 我做的",
      cls: "bg-peach-50 text-peach-500 border-peach-100",
    },
    partner: {
      label: "🙋‍♂️ 짝꿍이 만들었어! · 宝宝做的",
      cls: "bg-rose-50 text-rose-500 border-rose-100",
    },
    together: {
      label: "👩‍🍳👨‍🍳 같이 만들었어! · 一起做的",
      cls: "bg-amber-50 text-amber-600 border-amber-100",
    },
  } as const;
  const m = map[chef];
  return (
    <span
      className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}
    >
      {m.label}
    </span>
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

