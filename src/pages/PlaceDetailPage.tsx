import { memo, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookmarkPlus,
  Heart,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useDeleteFood,
  useDeletePlace,
  usePlace,
  useUpsertPlace,
} from "@/hooks/usePlaces";
import { useMovePlaceToWishlist } from "@/hooks/useWishlist";
import { useMemos } from "@/hooks/useMemos";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { useDisplayNames } from "@/hooks/useProfile";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  chefForViewer,
  formatDate,
  getCategories,
  ratingsForViewer,
} from "@/lib/utils";
import { CATEGORY_EMOJI, categoryEmojiOf } from "@/lib/constants";
import { MediaThumb } from "@/components/MediaThumb";
import { MemoComment } from "@/components/MemoComment";
import { MemoThread } from "@/components/MemoThread";
import { ReactionRow } from "@/components/ReactionRow";
import { ReactionProvider } from "@/hooks/useReactionBatch";
import type { Food } from "@/lib/database.types";

const DIFF_THRESHOLD = 1;

export default function PlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { data: place, isLoading, isError, error } = usePlace(id);
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const deletePlace = useDeletePlace();
  const deleteFood = useDeleteFood();
  const upsertPlace = useUpsertPlace();
  const moveToWishlist = useMovePlaceToWishlist();
  // Two-step gate for "send back to wishlist" — destructive op (drops
  // the place + its foods + memos) so the confirm dialog is required.
  const [confirmMoveBack, setConfirmMoveBack] = useState(false);
  // PlaceFormPage hands us state.justCreated=true on the post-save
  // redirect, so the place-level memo composer stays hidden on a
  // brand-new record. Subsequent visits (different navigation) drop
  // the flag and the composer reappears like a comment input.
  const justCreated =
    !!(location.state as { justCreated?: boolean } | null)?.justCreated;
  // Peek the place-level thread so we can drop the entire memo card
  // when the record is fresh and nothing has been written yet —
  // otherwise an empty card hangs there with no content.
  const placeMemos = useMemos({ placeId: id });
  const placeThreadCount = placeMemos.data?.length ?? 0;

  // Hash-anchor deep link. Two sources hit this:
  //   - RecipesPage: /places/<id>#food-<foodId>
  //   - NotificationsPage: /places/<id>#memo-<memoId> (memo edits,
  //                        threads, replies, reactions on a memo)
  //                        or #food-<foodId> for food-level events
  //
  // Consume each anchor once per navigation. Keeping the hash around
  // made later memo/reply updates re-run this effect and drag the user
  // back to the notification target after they had scrolled elsewhere.
  const consumedAnchorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!place) return;
    const hash = location.hash;
    if (!hash || hash.length <= 1) return;
    const anchorKey = `${location.key}:${hash}`;
    if (consumedAnchorRef.current === anchorKey) return;

    const elId = hash.slice(1);
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;
    const tryScroll = () => {
      const el = document.getElementById(elId);
      if (el) {
        consumedAnchorRef.current = anchorKey;
        // Instant jump feels cleaner than visibly sliding through the
        // whole page from the top. The highlight still confirms the
        // deep-link target without leaving the hash active forever.
        el.scrollIntoView({ behavior: "auto", block: "center" });
        window.history.replaceState(
          window.history.state,
          "",
          `${location.pathname}${location.search}`
        );
        el.classList.add(
          "ring-2",
          "ring-peach-400",
          "ring-offset-2",
          "transition-shadow",
          "rounded-2xl"
        );
        pulseTimer = setTimeout(() => {
          el.classList.remove(
            "ring-2",
            "ring-peach-400",
            "ring-offset-2",
            "transition-shadow",
            "rounded-2xl"
          );
        }, 1400);
        return;
      }
      attempts += 1;
      if (attempts < 20) {
        // 100ms × 20 = 2s window. Memos usually arrive within the
        // first 200-500ms after place loads; the long ceiling
        // handles slow networks gracefully without a visible spinner.
        timer = setTimeout(tryScroll, 100);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    return () => {
      if (timer !== null) clearTimeout(timer);
      if (pulseTimer !== null) clearTimeout(pulseTimer);
    };
  }, [place, location.hash, location.key, location.pathname, location.search]);

  async function toggleRevisit() {
    if (!place || !user || !couple) return;
    // Guard against rapid double-taps which used to fire two mutations
    // in flight (sometimes flipping the value back to where it started).
    if (upsertPlace.isPending) return;
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
  // Whether the food is fully solo (one eater only). Reads `eater`
  // when present, falls back to the legacy is_solo boolean.
  const isFoodSolo = (f: Food) => {
    const eater = f.eater ?? (f.is_solo ? "creator" : "both");
    return eater !== "both";
  };
  // Per-food /10 total: solo foods double the eater's single rating,
  // couple foods sum both partners. Keeps the place average comparable
  // across both modes.
  const totals = foods
    .map((f) => {
      if (isFoodSolo(f)) {
        const r = f.my_rating ?? f.partner_rating ?? 0;
        return r * 2;
      }
      return (f.my_rating ?? 0) + (f.partner_rating ?? 0);
    })
    .filter((n) => n > 0);
  const avg = totals.length
    ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)
    : null;

  // Group foods by opinion spread.
  // Solo foods skip the disagree/agree classification (no second opinion
  // to compare against) and live in their own section below.
  const soloFoods = foods.filter(isFoodSolo);
  const coupleFoods = foods.filter((f) => !isFoodSolo(f));
  const rated = coupleFoods.filter(
    (f) => f.my_rating != null && f.partner_rating != null
  );
  const unrated = coupleFoods.filter(
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
    if (deletePlace.isPending) return;
    if (!confirm(t("common.confirmDelete"))) return;
    await deletePlace.mutateAsync(place.id);
    navigate("/", { replace: true });
  }

  async function onDeleteFood(fid: string) {
    if (deleteFood.isPending) return;
    if (!confirm(t("common.confirmDelete"))) return;
    await deleteFood.mutateAsync(fid);
  }

  async function onConfirmMoveToWishlist() {
    if (!place || !couple) return;
    if (moveToWishlist.isPending) return;
    try {
      await moveToWishlist.mutateAsync({
        placeId: place.id,
        coupleId: couple.id,
        name: place.name,
        category: place.category,
        categories: place.categories,
        memo: place.memo,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      setConfirmMoveBack(false);
      navigate("/?tab=wishlist", { replace: true });
    } catch (e) {
      console.error("[PlaceDetailPage] move to wishlist failed:", e);
      setConfirmMoveBack(false);
    }
  }

  return (
    // ReactionProvider does ONE bulk fetch of every reaction in this
    // place's subtree (caption + every food caption + every thread
    // memo). All ReactionRow children read their slice from the
    // provider via context — collapses ~30-40 per-row HTTP calls
    // into one. See src/hooks/useReactionBatch.tsx for the bucket
    // shape and the SQL RPC in
    // supabase/migrations/20260513_reactions_for_place_rpc.sql.
    <ReactionProvider placeId={place.id}>
    <div>
      <PageHeader
        title={place.name}
        subtitle={formatDate(place.date_visited, i18n.language)}
        back
        right={
          <div className="flex gap-1">
            {/* "Send back to wishlist" — only on non-home places.
                Useful when the user tapped 다녀왔어요 too early or
                changed their mind and wants the entry back in the
                planning bucket. Destructive (drops the place +
                foods + memos) so two-step via ConfirmDialog. */}
            {!place.is_home_cooked && (
              <button
                type="button"
                onClick={() => setConfirmMoveBack(true)}
                className="btn-ghost !p-2.5 text-amber-500 active:scale-90 transition-transform"
                aria-label="move back to wishlist"
                title="위시리스트로 다시 · 移回种草"
              >
                <BookmarkPlus className="w-5 h-5" />
              </button>
            )}
            <Link
              to={`/places/${place.id}/edit`}
              className="btn-ghost !p-2.5 active:scale-90 transition-transform"
              aria-label="edit"
            >
              <Pencil className="w-5 h-5" />
            </Link>
            <button
              onClick={() => void onDeletePlace()}
              className="btn-ghost !p-2.5 text-rose-400 active:scale-90 transition-transform"
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
        {/* Photos / videos — videos auto-render via MediaThumb.
            gallery + index lets the lightbox swipe between siblings. */}
        {place.photo_urls && place.photo_urls.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
            {place.photo_urls.map((url, i) => (
              <div
                key={url}
                className="h-40 w-40 rounded-2xl overflow-hidden flex-shrink-0 bg-ink-900"
              >
                <MediaThumb
                  src={url}
                  className="w-full h-full object-cover"
                  showPlayBadge
                  controls
                  gallery={place.photo_urls ?? undefined}
                  index={i}
                />
              </div>
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

          {/* Category tile — shows up to 3 emojis for multi-cat places.
              Empty list collapses into an amber "❓ 미분류" CTA linking
              to the edit form so tagging is one tap away. */}
          {(() => {
            const cats = getCategories(place);
            if (cats.length === 0) {
              return (
                <Link
                  to={`/places/${place.id}/edit`}
                  className="p-4 rounded-3xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center gap-1 shadow-soft active:scale-[0.98] transition"
                >
                  <span className="text-3xl">❓</span>
                  <span className="text-[12px] font-bold text-amber-700 text-center leading-tight">
                    미분류 · 未分类
                    <br />
                    <span className="text-[10px] opacity-70 font-medium">
                      탭해서 태그하기 · 点击分类
                    </span>
                  </span>
                </Link>
              );
            }
            // Show stacked emojis (capped at 3) + comma-joined labels
            // so 2-3 categories don't overflow the bento tile.
            const displayCats = cats.slice(0, 3);
            return (
              <div className="p-4 rounded-3xl bg-white border border-cream-200 flex flex-col items-center justify-center gap-2 shadow-soft">
                <div className="flex items-center gap-0.5 text-2xl leading-none">
                  {displayCats.map((c) => (
                    <span key={c}>{categoryEmojiOf(c)}</span>
                  ))}
                </div>
                <span className="text-[13px] font-medium text-ink-700 text-center leading-tight">
                  {cats
                    .map((c) => t(`category.${c}`, { defaultValue: c }))
                    .join(" · ")}
                </span>
              </div>
            );
          })()}

          <button
            type="button"
            onClick={() => void toggleRevisit()}
            disabled={upsertPlace.isPending}
            className={`p-4 rounded-3xl border flex flex-col items-center justify-center gap-2 shadow-soft transition-colors active:scale-[0.98] disabled:opacity-60 ${
              place.want_to_revisit
                ? "bg-rose-100 border-rose-200 text-rose-500"
                : "bg-white border-cream-200 text-ink-400 hover:border-rose-200 hover:text-rose-400"
            }`}
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

        {/* Address + memo thread. The section is always rendered so
            either partner can drop a memo via the inline composer
            below, even on places that started out with no memo. */}
        <section className="space-y-3">
          {place.address && (
            <div className="card p-4 flex items-start gap-3">
              <MapPin className="w-5 h-5 text-peach-400 mt-0.5" />
              <p className="text-sm text-ink-700">{place.address}</p>
            </div>
          )}
          {/* Show the memo card only when it has actual content to host
              — primary memo, thread memos, OR the live composer. After
              a fresh create the composer is hidden + no memos exist
              yet, so the whole card collapses instead of leaving an
              empty bubble.

              When a primary memo exists it reads as an Instagram-style
              caption: the MemoComment up top, an emoji reaction row
              directly beneath, then a soft divider with the "댓글 N"
              label that hands off into the existing MemoThread. */}
          {(place.memo || placeThreadCount > 0 || !justCreated) && (
            <div className="card p-4 space-y-3">
              {place.memo && (
                <div className="space-y-2">
                  <MemoComment
                    memo={place.memo}
                    authorId={place.memo_author_id}
                    // memo_updated_at tracks ONLY memo edits — unrelated
                    // saves (revisit toggle, photo add) leave it alone.
                    // Falls back to created_at on legacy rows the
                    // backfill migration may have missed.
                    createdAt={place.memo_updated_at ?? place.created_at}
                  />
                  {/* Reactions on the caption itself — scope='place'
                      so they attach to places.memo (which isn't a
                      memos row, hence the polymorphic shape). Indented
                      to align with the caption body, not the avatar. */}
                  <div className="ml-11">
                    <ReactionRow
                      target={{ kind: "place", id: place.id }}
                      size="md"
                    />
                  </div>
                </div>
              )}
              {/* "댓글" label only appears when there's a caption to
                  separate FROM. On a memo-less place the thread reads
                  as standalone memos — no need for the divider. */}
              {place.memo && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-px flex-1 bg-cream-100" />
                  <span className="text-[11px] font-bold text-ink-400 tracking-wide">
                    댓글 <span className="font-number">{placeThreadCount}</span> · 评论{" "}
                    <span className="font-number">{placeThreadCount}</span>
                  </span>
                  <div className="h-px flex-1 bg-cream-100" />
                </div>
              )}
              <MemoThread placeId={place.id} hideComposer={justCreated} />
            </div>
          )}
        </section>

        {/* Foods */}
        <section>
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-sans font-bold text-lg flex items-baseline gap-2 min-w-0 flex-1 break-keep">
              우리가 먹은 메뉴 · 我们吃过的
              <span className="text-peach-400 text-sm font-number flex-shrink-0">
                {foods.length}
              </span>
            </h2>
            <Link
              to={`/places/${place.id}/foods/new`}
              className="flex items-center gap-1 px-3 py-1.5 bg-peach-100 text-peach-500 rounded-full text-xs sm:text-sm font-medium hover:bg-peach-200 transition flex-shrink-0 whitespace-nowrap"
              aria-label="메뉴 추가 · 添加"
            >
              <Plus className="w-4 h-4" />
              추가 · 添加
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

          {soloFoods.length > 0 && (
            <FoodGroup
              title="🍽️ 혼자 먹은 메뉴 · 自己吃的"
              tone="neutral"
              foods={soloFoods}
              placeId={place.id}
              onDelete={(fid) => void onDeleteFood(fid)}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmMoveBack}
        title={`${place.name}, 위시리스트로 다시 보낼까요? · 移回种草清单？`}
        body="이 기록과 메뉴, 별점, 사진, 메모 댓글이 같이 사라져요. 위시리스트엔 이름·주소·카테고리·메모만 남아요. · 这条记录连同菜品、评分、照片和留言会一起删除。种草清单只保留名字、地址、类别和备注。"
        confirmLabel="응, 보내자 · 嗯，移回吧"
        cancelLabel="先看看 · 좀 더 둘게"
        tone="rose"
        busy={moveToWishlist.isPending}
        onCancel={() => setConfirmMoveBack(false)}
        onConfirm={() => void onConfirmMoveToWishlist()}
      />
    </div>
    </ReactionProvider>
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
  const { myDisplay, partnerDisplay } = useDisplayNames();
  // Swap "my" / "partner" so the current viewer always sees their own
  // score in the myDisplay slot. Diff and total are perspective-free
  // (|a-b|, a+b), so the section header classification still works
  // off the raw fields upstream.
  const view = ratingsForViewer(food, user?.id);
  const my = view.myRating ?? 0;
  const partner = view.partnerRating ?? 0;
  // Resolve eater (storage convention) with a fallback to the legacy
  // is_solo boolean for foods saved before the migration.
  const eaterStored: "both" | "creator" | "partner" =
    food.eater
      ? (food.eater as "both" | "creator" | "partner")
      : food.is_solo
        ? "creator"
        : "both";
  const viewerIsCreator =
    !food.created_by || food.created_by === user?.id;
  // Translate to viewer perspective for display.
  const eaterView: "both" | "me" | "partner" =
    eaterStored === "both"
      ? "both"
      : eaterStored === "creator"
        ? viewerIsCreator
          ? "me"
          : "partner"
        : viewerIsCreator
          ? "partner"
          : "me";
  const isSolo = eaterView !== "both";
  const viewerIsEater = eaterView === "me";
  const eaterRating = viewerIsEater ? my : partner;
  const total = isSolo ? eaterRating * 2 : my + partner;
  const diff = isSolo ? 0 : Math.abs(my - partner);
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
    // id="food-<id>" anchor so deep links from the recipes page
    // (e.g. /places/abc#food-xyz) can scrollIntoView this card. The
    // hash-scroll effect at the top of PlaceDetailPage handles the
    // highlight pulse.
    <div
      id={`food-${food.id}`}
      className="render-smooth-panel card p-4 relative scroll-mt-24"
    >
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
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {/* Food-level category chip — built-in keys go through i18n,
                custom strings render as-is, missing → amber CTA Link
                pointing at the edit form so the user can tag it. */}
            <FoodCategoryChip food={food} placeId={placeId} />
            {/* Always go through chefForViewer — stored value is from
                the creator's perspective, so binding food.chef directly
                to a 내가/짝꿍 label would render wrong for the other
                partner. */}
            {(() => {
              const chefView = chefForViewer(food, user?.id);
              if (!chefView) return null;
              return (
                <ChefBadge
                  chef={chefView}
                  myDisplay={myDisplay}
                  partnerDisplay={partnerDisplay}
                />
              );
            })()}
            {/* Solo-eat badge — surfaces who ate alone so you don't
                wonder why one rating is missing. */}
            {isSolo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-600">
                {viewerIsEater
                  ? `🍽️ ${myDisplay}이 혼자 먹음 · ${myDisplay}自己吃的`
                  : `🍽️ ${partnerDisplay}이 혼자 먹음 · ${partnerDisplay}自己吃的`}
              </span>
            )}
            {/* "Rate this" CTA — only when the viewer is the eater
                (or it's a couple food they can rate). Solo foods the
                viewer didn't eat aren't theirs to rate. */}
            {!isSolo && !myWasGiven && (
              <Link
                to={`/places/${placeId}/foods/${food.id}/edit`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
              >
                ✏️ {myDisplay} 별점 아직 안 줬어요 · 还没打分
              </Link>
            )}
            {isSolo && viewerIsEater && view.myRating == null && (
              <Link
                to={`/places/${placeId}/foods/${food.id}/edit`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
              >
                ✏️ {myDisplay} 별점 아직 안 줬어요 · 还没打分
              </Link>
            )}
          </div>
        </div>
        {total > 0 && (
          <div className="text-2xl font-number font-bold text-peach-400 leading-none">
            {total.toFixed(1)}
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 mb-3 pb-1">
          {photos.map((url, i) => (
            <div
              key={url}
              className="h-24 w-24 rounded-xl overflow-hidden flex-shrink-0 border border-cream-100 bg-ink-900"
            >
              <MediaThumb
                src={url}
                className="w-full h-full object-cover"
                showPlayBadge
                controls
                gallery={photos}
                index={i}
              />
            </div>
          ))}
        </div>
      )}

      {/* Solo: single eater label + a one-sided bar. */}
      {isSolo && (myWasGiven || partnerWasGiven) && (
        <>
          <div className="flex justify-between text-xs text-ink-500 mb-1 px-0.5">
            <span className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${viewerIsEater ? "bg-peach-400" : "bg-rose-400"}`}
              />
              {viewerIsEater ? myDisplay : partnerDisplay}{" "}
              <span className="font-number font-bold">
                {eaterRating.toFixed(1)}
              </span>
            </span>
            <span className="text-[10px] text-ink-400 font-medium">
              혼자 먹어서 ×2 = {total.toFixed(1)} / 10
            </span>
          </div>
          <SoloBar value={eaterRating} tone={viewerIsEater ? "peach" : "rose"} />
        </>
      )}
      {!isSolo && (myWasGiven || partnerWasGiven) && (
        <>
          <div className="flex justify-between text-xs text-ink-500 mb-1 px-0.5">
            <span className="flex items-center gap-1 truncate max-w-[45%]">
              <span className="w-1.5 h-1.5 rounded-full bg-peach-400 flex-shrink-0" />
              <span className="truncate">{myDisplay}</span>{" "}
              <span className="font-number font-bold flex-shrink-0">
                {myWasGiven ? my.toFixed(1) : "-"}
              </span>
            </span>
            <span className="flex items-center gap-1 truncate max-w-[45%]">
              <span className="truncate">{partnerDisplay}</span>{" "}
              <span className="font-number font-bold flex-shrink-0">
                {partnerWasGiven ? partner.toFixed(1) : "-"}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
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

      {/* Recipe block — home-cooked menus only. Renders typed-out
          instructions + any saved screenshots. Hidden entirely when
          both fields are empty so restaurant cards stay clean. */}
      {(food.recipe_text ||
        (food.recipe_photo_urls && food.recipe_photo_urls.length > 0)) && (
        <div className="mt-3 rounded-2xl bg-rose-50/40 border border-rose-100/70 px-3 py-3 space-y-2">
          <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1.5">
            📒 레시피 · 食谱
          </p>
          {food.recipe_text && (
            <p className="text-[13px] text-ink-700 whitespace-pre-wrap break-words">
              {food.recipe_text}
            </p>
          )}
          {food.recipe_photo_urls && food.recipe_photo_urls.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {food.recipe_photo_urls.map((url, i) => (
                <div
                  key={url}
                  className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-cream-200 bg-ink-900"
                >
                  <MediaThumb
                    src={url}
                    className="w-full h-full object-cover"
                    showPlayBadge
                    gallery={food.recipe_photo_urls ?? undefined}
                    index={i}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Memo block — primary memo (typed in the create form) plus
          the thread of any extra memos either partner has added since.
          Rendered together inside a tinted box so the conversation
          reads as a unit, separate from the rating bars above.

          Caption-style framing: the primary memo reads as a caption
          with its own reactions row, then a "댓글 N" divider hands
          off into the thread below. Same pattern as the place card,
          scaled down via size="sm". */}
      <FoodMemoBlock food={food} />
    </div>
  );
}

// Caption + reactions + thread for a single food card. Pulled out as
// a sub-component so it can call useMemos() to know how many thread
// rows exist — the parent FoodCard would otherwise have to thread the
// count down manually. React-query dedupes the call against any other
// useMemos with the same (foodId) key, so no extra network.
//
// memo wrapper at the bottom keeps this from re-rendering when a
// sibling food card updates — props are just `food` (stable ref
// from usePlace cache) so default shallow equality suffices.
function FoodMemoBlockImpl({ food }: { food: Food }) {
  const thread = useMemos({ foodId: food.id });
  const count = thread.data?.length ?? 0;
  return (
    <div className="mt-3 rounded-2xl bg-cream-50/60 border border-cream-100 px-3 py-3 space-y-2.5">
      {food.memo && (
        <div className="space-y-1.5">
          <MemoComment
            memo={food.memo}
            authorId={food.memo_author_id}
            createdAt={food.memo_updated_at ?? food.created_at}
            size="sm"
          />
          <div className="ml-10">
            <ReactionRow
              target={{ kind: "food", id: food.id }}
              size="sm"
            />
          </div>
        </div>
      )}
      {food.memo && (
        <div className="flex items-center gap-2 pt-0.5">
          <div className="h-px flex-1 bg-cream-100" />
          <span className="text-[10px] font-bold text-ink-400 tracking-wide">
            댓글 <span className="font-number">{count}</span> · 评论{" "}
            <span className="font-number">{count}</span>
          </span>
          <div className="h-px flex-1 bg-cream-100" />
        </div>
      )}
      <MemoThread foodId={food.id} size="sm" />
    </div>
  );
}

const FoodMemoBlock = memo(FoodMemoBlockImpl);

// Compact chef-credit badge under the food name. Tone matches the
// home-cooking color cue used elsewhere (peach=me, rose=partner,
// amber=both) for visual continuity.
function ChefBadge({
  chef,
  myDisplay,
  partnerDisplay,
}: {
  chef: "me" | "partner" | "together";
  myDisplay: string;
  partnerDisplay: string;
}) {
  // Gendered 🙋‍♀️ / 🙋‍♂️ swapped for the neutral 🙋; together swapped
  // for 🍳 (cooking together) so no gendered chef pictograms remain.
  const map = {
    me: {
      label: `🍳 ${myDisplay}이 만들었어! · ${myDisplay}做的`,
      cls: "bg-peach-50 text-peach-500 border-peach-100",
    },
    partner: {
      label: `🍳 ${partnerDisplay}이 만들었어! · ${partnerDisplay}做的`,
      cls: "bg-rose-50 text-rose-500 border-rose-100",
    },
    together: {
      label: "🍳 같이 만들었어! · 一起做的",
      cls: "bg-amber-50 text-amber-600 border-amber-100",
    },
  } as const;
  const m = map[chef];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

// Food category chip — built-in keys go through i18n, custom strings
// render as-is, missing categories become an amber CTA Link to the
// edit form so the user can fill them in inline.
function FoodCategoryChip({
  food,
  placeId,
}: {
  food: Food;
  placeId: string;
}) {
  const { t } = useTranslation();
  const cats = getCategories(food);
  if (cats.length === 0) {
    return (
      <Link
        to={`/places/${placeId}/foods/${food.id}/edit`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
      >
        ❓ 종류 미분류 · 未分类
      </Link>
    );
  }
  // Multi-category: render one chip per assigned category. Built-in
  // keys go through i18n; custom strings render as-is.
  return (
    <>
      {cats.map((c) => {
        const known = c in CATEGORY_EMOJI;
        const label = known
          ? t(`category.${c}`, { defaultValue: c })
          : c;
        return (
          <span
            key={c}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-cream-200 bg-cream-50 text-ink-600"
          >
            {categoryEmojiOf(c)} {label}
          </span>
        );
      })}
    </>
  );
}

// Single-eater rating bar — used for solo foods so the layout doesn't
// look broken with one half of CoupleBar empty.
function SoloBar({ value, tone }: { value: number; tone: "peach" | "rose" }) {
  const w = Math.min((value / 5) * 100, 100);
  const fill = tone === "peach" ? "bg-peach-400" : "bg-rose-400";
  return (
    <div className="w-full h-3 bg-cream-100 rounded-full overflow-hidden border border-cream-200">
      <div
        className={`h-full ${fill} transition-all duration-500`}
        style={{ width: `${w}%` }}
      />
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
