import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlace, useUpsertFood } from "@/hooks/usePlaces";
import { useFormDraft } from "@/hooks/useDraft";
import { useDisplayNames } from "@/hooks/useProfile";
import { PageHeader } from "@/components/PageHeader";
import {
  GroupedMultiSelect,
  type GroupedMultiSelectEntry,
} from "@/components/GroupedMultiSelect";
import { RatingPicker } from "@/components/RatingPicker";
import { PhotoUploader } from "@/components/PhotoUploader";
import { MemoAuthorPicker } from "@/components/MemoAuthorPicker";
import {
  FOOD_CATEGORIES,
  HOME_FOOD_AUTHOR_CATEGORIES,
  PREMADE_FOOD_CATEGORIES,
  categoryEmojiOf,
} from "@/lib/constants";
import { ChefHat, User, Users } from "lucide-react";
import type { ChefRole } from "@/lib/database.types";

import { getCategories, ratingsForViewer } from "@/lib/utils";
import type { EaterRole } from "@/lib/database.types";

// Viewer-relative eater used by the form UI. Translated back to the
// storage-relative `EaterRole` ('creator' / 'partner') when saving.
type ViewerEater = "both" | "me" | "partner";

function viewerEaterFromStorage(
  stored: EaterRole | null | undefined,
  isCreator: boolean
): ViewerEater {
  if (!stored || stored === "both") return "both";
  if (stored === "creator") return isCreator ? "me" : "partner";
  // stored === "partner"
  return isCreator ? "partner" : "me";
}

function storageEaterFromViewer(
  v: ViewerEater,
  isCreator: boolean
): EaterRole {
  if (v === "both") return "both";
  // "me" from the viewer means whichever role the viewer occupies.
  if (v === "me") return isCreator ? "creator" : "partner";
  // "partner" from the viewer means the role the OTHER partner occupies.
  return isCreator ? "partner" : "creator";
}

export default function FoodFormPage() {
  const { id: placeId, foodId } = useParams();
  const isEdit = !!foodId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: place } = usePlace(placeId);
  const upsert = useUpsertFood();
  const { myDisplay, partnerDisplay } = useDisplayNames();
  const { t } = useTranslation();

  // Food categories: the regular 5-item list lives at the top
  // (메인 / 사이드 / 디저트 / 드링크 / 기타). For foods on a home-cooked
  // place we surface two extra clusters — 누가 만들었어 + 완제품 —
  // matching the picker shown on the home-mode form. Restaurant foods
  // skip them (no chef, no frozen/bread/etc concept).
  const isHomeCookedPlace = !!place?.is_home_cooked;
  const foodCategoryOptions = useMemo<GroupedMultiSelectEntry[]>(() => {
    const base: GroupedMultiSelectEntry[] = FOOD_CATEGORIES.map((c) => ({
      value: c,
      label: t(`category.${c}`),
      emoji: categoryEmojiOf(c),
    }));
    if (!isHomeCookedPlace) return base;
    return [
      ...base,
      {
        groupLabel: "🧑‍🍳 누가 만들었어 · 谁做的",
        options: HOME_FOOD_AUTHOR_CATEGORIES.map((c) => ({
          value: c,
          label: t(`category.${c}`),
          emoji: categoryEmojiOf(c),
        })),
      },
      {
        groupLabel: "📦 완제품 · 成品",
        options: PREMADE_FOOD_CATEGORIES.map((c) => ({
          value: c,
          label: t(`category.${c}`),
          emoji: categoryEmojiOf(c),
        })),
      },
    ];
  }, [t, isHomeCookedPlace]);

  const existing = place?.foods.find((f) => f.id === foodId);

  const [name, setName] = useState("");
  const [myRating, setMyRating] = useState<number | null>(null);
  const [partnerRating, setPartnerRating] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [memoAuthorId, setMemoAuthorId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  // Chef toggle — only meaningful for home-cooked places. Stored
  // from the row creator's perspective; the form is filled BY the
  // creator (or by the partner editing later — same swap rules as
  // PlaceFormPage's HomeFoodCard).
  // Nullable so the user can deselect the active chef ("아무도 안
  // 만든" — useful when re-editing a 완제품 dish to clear chef).
  const [chef, setChef] = useState<ChefRole | null>("together");
  // Eater (viewer perspective): 'both' / 'me' / 'partner'. Drives the
  // segmented toggle. Translated to storage-relative EaterRole on save.
  const [viewerEater, setViewerEater] = useState<ViewerEater>("both");

  // Whether the current viewer is the food's creator. Drives the
  // viewer ↔ storage translation for both ratings and the eater enum.
  const viewerIsCreator =
    !existing || existing.created_by == null
      ? true
      : existing.created_by === user?.id;

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    // Hydrate ratings from the *viewer's* perspective so each partner
    // sees their own rating in the "내 별점" slot when editing.
    const view = ratingsForViewer(existing, user?.id);
    setMyRating(view.myRating);
    setPartnerRating(view.partnerRating);
    setCategories(getCategories(existing));
    setMemo(existing.memo ?? "");
    setMemoAuthorId(existing.memo_author_id ?? null);
    // Hydrate chef in the viewer's perspective. Same swap rule as
    // ratingsForViewer: stored 'me' refers to created_by; if the
    // viewer isn't the creator we flip me↔partner so the form's
    // "내가/짝꿍" toggle reads correctly from each user's seat.
    // null in storage → null here so the toggle starts deselected
    // (e.g. premade dishes saved without a chef).
    if (existing.chef == null) {
      setChef(null);
    } else if (existing.chef === "together") {
      setChef("together");
    } else {
      const flipped =
        existing.chef === "me"
          ? viewerIsCreator
            ? "me"
            : "partner"
          : viewerIsCreator
            ? "partner"
            : "me";
      setChef(flipped);
    }
    // Prefer the new `eater` enum; fall back to the legacy is_solo
    // boolean ('me' if true, 'both' if false) so older rows hydrate.
    const eaterStored: EaterRole = existing.eater
      ? (existing.eater as EaterRole)
      : existing.is_solo
        ? "creator"
        : "both";
    setViewerEater(viewerEaterFromStorage(eaterStored, viewerIsCreator));
    // Prefer the new photo_urls array, fall back to the legacy single-photo
    // column for foods saved before the migration.
    if (existing.photo_urls && existing.photo_urls.length > 0) {
      setPhotos(existing.photo_urls);
    } else if (existing.photo_url) {
      setPhotos([existing.photo_url]);
    }
  }, [existing, user?.id, viewerIsCreator]);

  // Draft: so if the user taps off mid-entry their typed rating / name
  // is still there when they come back.
  const draftKey = placeId ? `draft:food:new:${placeId}` : "draft:food:new";
  const draftSnapshot = useMemo(
    () => ({
      name,
      myRating,
      partnerRating,
      categories,
      memo,
      memoAuthorId,
      photos,
      viewerEater,
      chef,
    }),
    [
      name,
      myRating,
      partnerRating,
      categories,
      memo,
      memoAuthorId,
      photos,
      viewerEater,
      chef,
    ]
  );
  const draft = useFormDraft({
    key: draftKey,
    enabled: !isEdit,
    snapshot: draftSnapshot,
    restore: (saved) => {
      if (saved.name != null) setName(saved.name as string);
      if (saved.myRating !== undefined)
        setMyRating(saved.myRating as number | null);
      if (saved.partnerRating !== undefined)
        setPartnerRating(saved.partnerRating as number | null);
      if (Array.isArray(saved.categories))
        setCategories(saved.categories as string[]);
      if (saved.memo != null) setMemo(saved.memo as string);
      if (saved.memoAuthorId !== undefined)
        setMemoAuthorId(
          saved.memoAuthorId === null ? null : (saved.memoAuthorId as string)
        );
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
      if (
        saved.viewerEater === "both" ||
        saved.viewerEater === "me" ||
        saved.viewerEater === "partner"
      ) {
        setViewerEater(saved.viewerEater);
      }
      if (
        saved.chef === "me" ||
        saved.chef === "partner" ||
        saved.chef === "together"
      ) {
        setChef(saved.chef);
      }
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placeId) return;

    // Inline validation: scroll to the first invalid section + focus it
    // instead of leaving the user with a dead disabled save button.
    // Per-field error text already renders below each invalid field;
    // this just makes "what did I miss?" obvious.
    const firstErrorEl = document.querySelector<HTMLElement>(
      "[data-form-error='true']"
    );
    if (firstErrorEl) {
      firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusTarget = firstErrorEl.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
      >("input, textarea, button[type='button']");
      focusTarget?.focus({ preventScroll: true });
      return;
    }

    // Storage convention: my_rating belongs to created_by, partner_rating
    // belongs to the other partner. If the current viewer is NOT the
    // creator (editing someone else's food), swap the form values so the
    // server's "my_rating" column still tracks the original author.
    const ownerId = existing?.created_by ?? user?.id ?? null;
    const isOwner = viewerIsCreator;
    let my_rating_to_save = isOwner ? myRating : partnerRating;
    let partner_rating_to_save = isOwner ? partnerRating : myRating;
    const eaterStored = storageEaterFromViewer(viewerEater, isOwner);
    // Solo modes force the non-eater's slot to null so display + compare
    // filters can rely on a single hard rule.
    if (eaterStored === "creator") {
      partner_rating_to_save = null;
    } else if (eaterStored === "partner") {
      my_rating_to_save = null;
    }
    await upsert.mutateAsync({
      id: foodId,
      place_id: placeId,
      values: {
        name: name.trim(),
        my_rating: my_rating_to_save,
        partner_rating: partner_rating_to_save,
        // Keep `category` synced with first picked category for older
        // client builds; `categories` carries the full multi-select.
        category: categories[0] ?? null,
        categories: categories.length ? categories : null,
        memo: memo.trim() || null,
        memo_author_id: memo.trim() ? memoAuthorId ?? user?.id ?? null : null,
        // Bump memo_updated_at only when the text actually changed —
        // unrelated edits (rating tweak, photo swap) shouldn't push
        // the comment timestamp forward.
        memo_updated_at: !memo.trim()
          ? null
          : memo.trim() === (existing?.memo ?? "")
            ? existing?.memo_updated_at ?? new Date().toISOString()
            : new Date().toISOString(),
        // Keep the legacy scalar column populated too so any older build
        // still reading photo_url sees something.
        photo_url: photos[0] ?? null,
        photo_urls: photos.length ? photos : null,
        // On insert: stamp the current user. On update: preserve the
        // existing author so swap math stays consistent forever.
        created_by: ownerId,
        // Chef: home-cooked places only. The viewer-perspective
        // toggle gets translated back into storage convention
        // (creator perspective) on save. null = explicitly
        // deselected — propagated as null so the food drops out
        // of both partners' chef rankings. Restaurant places omit
        // the field entirely.
        ...(place?.is_home_cooked
          ? {
              chef:
                chef == null
                  ? null
                  : chef === "together"
                    ? "together"
                    : chef === "me"
                      ? viewerIsCreator
                        ? "me"
                        : "partner"
                      : viewerIsCreator
                        ? "partner"
                        : "me",
            }
          : {}),
        eater: eaterStored,
        // Keep the legacy boolean in sync for older client builds.
        is_solo: eaterStored !== "both",
      },
    });
    draft.clear();
    // navigate(-1) instead of navigate(target, replace) so the form
    // entry is popped off history instead of being replaced with a
    // duplicate /places/:id entry. Without this, hitting back from
    // the place page after each save needed an extra press per edit.
    navigate(-1);
  }

  // Total: 'both' = my + partner; otherwise eater × 2.
  // For viewer perspective: when 'me' eats alone, total = myRating × 2;
  // when 'partner' eats alone, total = partnerRating × 2.
  const total =
    viewerEater === "me"
      ? (myRating ?? 0) * 2
      : viewerEater === "partner"
        ? (partnerRating ?? 0) * 2
        : (myRating ?? 0) + (partnerRating ?? 0);

  return (
    <div>
      <PageHeader
        title={isEdit ? "메뉴 수정 · 修改记录" : "새로운 메뉴 · 记下新菜品"}
        back
      />
      <form onSubmit={onSubmit} className="px-5 space-y-5 pb-6">
        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            메뉴 이름 · 菜名 *
          </label>
          <input
            className="input-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 봉골레 파스타 · 例：蛤蜊意面"
            required
          />
        </div>

        <div data-form-error={categories.length === 0 ? "true" : undefined}>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            카테고리 · 种类 *
          </label>
          <GroupedMultiSelect
            title="카테고리 · 种类"
            placeholder="종류 선택 · 选择种类"
            options={foodCategoryOptions}
            value={categories}
            onChange={setCategories}
          />
          {categories.length === 0 && (
            <p className="text-[11px] text-rose-500 mt-1.5 font-medium">
              카테고리를 하나 이상 골라주세요 · 请至少选择一个类别
            </p>
          )}
          {categories.length > 0 && (
            <p className="text-[11px] text-ink-400 mt-1.5">
              여러 개 골라도 돼요 · 可以选多个 ({categories.length}개 선택됨)
            </p>
          )}
        </div>

        {/* Eater toggle — three options. Both partners can flip it
            (translation handles the perspective swap on save). */}
        <div className="flex bg-cream-100/80 p-1 rounded-xl border border-cream-200/60">
          <EaterSegment
            active={viewerEater === "both"}
            onClick={() => setViewerEater("both")}
            label="둘이 같이"
            sub="一起吃"
          />
          <EaterSegment
            active={viewerEater === "me"}
            onClick={() => setViewerEater("me")}
            label={`${myDisplay}만`}
            sub={`${myDisplay}独享`}
          />
          <EaterSegment
            active={viewerEater === "partner"}
            onClick={() => setViewerEater("partner")}
            label={`${partnerDisplay}만`}
            sub={`${partnerDisplay}独享`}
          />
        </div>

        {/* Chef toggle — shown for every home-cooked place, including
            완제품 (frozen / bread / etc) so the user can optionally
            credit a chef even on bought items. Tapping the active
            option deselects it (chef=null), which removes the food
            from both partners' chef rankings. */}
        {place?.is_home_cooked && (
          <div>
            <p className="text-[12px] font-bold text-ink-700 mb-2 flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-teal-500" />
              누가 요리했나요? · 谁掌勺？
              <span className="text-[10px] font-medium text-ink-400 ml-auto">
                선택 안 해도 돼요 · 可不选
              </span>
            </p>
            <div className="flex gap-1 bg-cream-50 p-1 rounded-xl border border-cream-100">
              <FoodChefButton
                active={chef === "me"}
                onClick={() => setChef(chef === "me" ? null : "me")}
                tone="peach"
                icon={<User className="w-3.5 h-3.5" />}
                labelKo={`${myDisplay}!`}
                labelZh={`${myDisplay}做的`}
              />
              <FoodChefButton
                active={chef === "partner"}
                onClick={() =>
                  setChef(chef === "partner" ? null : "partner")
                }
                tone="rose"
                icon={<User className="w-3.5 h-3.5" />}
                labelKo={`${partnerDisplay}!`}
                labelZh={`${partnerDisplay}做的`}
              />
              <FoodChefButton
                active={chef === "together"}
                onClick={() =>
                  setChef(chef === "together" ? null : "together")
                }
                tone="amber"
                icon={<Users className="w-3.5 h-3.5" />}
                labelKo="같이!"
                labelZh="一起做"
              />
            </div>
          </div>
        )}

        <div className="card p-4 space-y-4">
          {/* My rating slot — visible when I ate ('both' or 'me'). */}
          {viewerEater !== "partner" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-ink-700">
                  {myDisplay}의 별점 · {myDisplay}的评分
                </span>
                <span className="text-xs font-bold text-ink-400 font-number">
                  {myRating ?? "-"} / 5
                </span>
              </div>
              <RatingPicker
                value={myRating}
                onChange={setMyRating}
                color="peach"
              />
            </div>
          )}
          {/* Partner slot — visible when partner ate ('both' or 'partner').
              Always read-only here; partner picks the value from their
              own session. */}
          {viewerEater !== "me" && (
            <div
              className={`${viewerEater === "both" ? "border-t border-cream-100 pt-4" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-ink-700">
                  {partnerDisplay} 별점 · {partnerDisplay}的评分
                </span>
                <span className="text-xs font-bold text-ink-400 font-number">
                  {partnerRating ?? "-"} / 5
                </span>
              </div>
              {viewerEater === "partner" ? (
                <p className="text-[11px] text-ink-400 mt-1">
                  {partnerDisplay}이 혼자 먹은 메뉴 — 별점은 본인이 매겨요
                  · {partnerDisplay}自己吃的，分数等TA来打
                </p>
              ) : partnerRating != null ? (
                <p className="text-[11px] text-ink-400 mt-1">
                  {partnerDisplay}이 직접 평가했어요 · {partnerDisplay}亲自打的分
                </p>
              ) : (
                <p className="text-[11px] text-rose-400 mt-1">
                  {partnerDisplay}이 아직 평가 전이에요. 자기 계정에서
                  평가하면 자동으로 떠요. · {partnerDisplay}还没打分，等TA登录后自己打。
                </p>
              )}
            </div>
          )}
          {total > 0 && (
            <div className="pt-3 border-t border-cream-100 flex items-center justify-between">
              <span className="text-sm font-bold text-ink-700">
                합계 · 总分{" "}
                {viewerEater !== "both" && (
                  <span className="text-[10px] font-medium text-ink-400 ml-1">
                    (혼자 먹어서 ×2)
                  </span>
                )}
              </span>
              <span className="text-xl font-number font-bold text-peach-500">
                {total} / 10
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            사진 · 绝美返图
          </label>
          {couple && (
            <PhotoUploader
              coupleId={couple.id}
              photos={photos}
              onChange={setPhotos}
              max={6}
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="block text-sm font-bold text-ink-700">
              메모 · 备注
            </label>
            {memo.trim().length > 0 && (
              <MemoAuthorPicker
                value={memoAuthorId}
                onChange={setMemoAuthorId}
              />
            )}
          </div>
          <textarea
            className="input-base min-h-[80px]"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        {/* Always-active save: onSubmit validates + scrolls to first
            offending field. Only disabled while a mutation is mid-flight
            so we never double-submit. */}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={upsert.isPending}
        >
          저장 · 保存
        </button>
      </form>
    </div>
  );
}

// 3-state eater segment: 둘이 같이 / 나만 / 짝꿍만. Stacks Korean
// label + Chinese subtitle so the option fits without truncating on
// narrow screens.
function EaterSegment({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 px-1 rounded-lg transition-all min-w-0 flex flex-col items-center justify-center leading-tight ${
        active
          ? "bg-white shadow-sm border border-peach-100 text-peach-500"
          : "text-ink-500 hover:text-ink-700"
      }`}
    >
      <span className="text-[12px] font-bold">{label}</span>
      <span className="text-[10px] opacity-70 font-medium mt-0.5">{sub}</span>
    </button>
  );
}

// Mirrors HomeFoodCard's chef segment in PlaceFormPage so the visual
// language is consistent between the two home-food entry surfaces.
function FoodChefButton({
  active,
  onClick,
  tone,
  icon,
  labelKo,
  labelZh,
}: {
  active: boolean;
  onClick: () => void;
  tone: "peach" | "rose" | "amber";
  icon: React.ReactNode;
  labelKo: string;
  labelZh: string;
}) {
  const activeCls =
    tone === "peach"
      ? "bg-peach-50 border-peach-200 text-peach-600"
      : tone === "rose"
        ? "bg-rose-50 border-rose-200 text-rose-600"
        : "bg-amber-50 border-amber-200 text-amber-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-1.5 px-1 rounded-lg border text-[11px] font-bold flex flex-col items-center gap-0.5 leading-tight transition-all min-w-0 ${
        active
          ? `${activeCls} shadow-sm`
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      <span className="inline-flex items-center gap-1 truncate">
        {icon}
        <span className="truncate">{labelKo}</span>
      </span>
      <span className="text-[9px] opacity-70 font-medium truncate">
        {labelZh}
      </span>
    </button>
  );
}
