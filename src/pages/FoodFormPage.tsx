import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlace, useUpsertFood } from "@/hooks/usePlaces";
import { useFormDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/PageHeader";
import {
  GroupedMultiSelect,
  type GroupedMultiSelectEntry,
} from "@/components/GroupedMultiSelect";
import { RatingPicker } from "@/components/RatingPicker";
import { PhotoUploader } from "@/components/PhotoUploader";
import { FOOD_CATEGORIES, categoryEmojiOf } from "@/lib/constants";
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
  const { t } = useTranslation();

  // Food categories are a flat 5-item list (메인 / 사이드 / 디저트 /
  // 드링크 / 기타) so the dropdown shows them as plain rows — no
  // groups needed. Same widget as the place form keeps the picker UX
  // consistent across the app.
  const foodCategoryOptions = useMemo<GroupedMultiSelectEntry[]>(
    () =>
      FOOD_CATEGORIES.map((c) => ({
        value: c,
        label: t(`category.${c}`),
        emoji: categoryEmojiOf(c),
      })),
    [t]
  );

  const existing = place?.foods.find((f) => f.id === foodId);

  const [name, setName] = useState("");
  const [myRating, setMyRating] = useState<number | null>(null);
  const [partnerRating, setPartnerRating] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
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
      photos,
      viewerEater,
    }),
    [name, myRating, partnerRating, categories, memo, photos, viewerEater]
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
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
      if (
        saved.viewerEater === "both" ||
        saved.viewerEater === "me" ||
        saved.viewerEater === "partner"
      ) {
        setViewerEater(saved.viewerEater);
      }
    },
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placeId) return;
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
        // Keep the legacy scalar column populated too so any older build
        // still reading photo_url sees something.
        photo_url: photos[0] ?? null,
        photo_urls: photos.length ? photos : null,
        // On insert: stamp the current user. On update: preserve the
        // existing author so swap math stays consistent forever.
        created_by: ownerId,
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

        <div>
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
            label="나만"
            sub="我独享"
          />
          <EaterSegment
            active={viewerEater === "partner"}
            onClick={() => setViewerEater("partner")}
            label="짝꿍만"
            sub="宝宝独享"
          />
        </div>

        <div className="card p-4 space-y-4">
          {/* My rating slot — visible when I ate ('both' or 'me'). */}
          {viewerEater !== "partner" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-ink-700">
                  나의 별점 · 我的评分
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
                  짝꿍 별점 · 宝宝的评分
                </span>
                <span className="text-xs font-bold text-ink-400 font-number">
                  {partnerRating ?? "-"} / 5
                </span>
              </div>
              {viewerEater === "partner" ? (
                <p className="text-[11px] text-ink-400 mt-1">
                  짝꿍이 혼자 먹은 메뉴 — 별점은 짝꿍 본인이 매겨요 ·
                  宝宝自己吃的，分数等TA来打
                </p>
              ) : partnerRating != null ? (
                <p className="text-[11px] text-ink-400 mt-1">
                  짝꿍이 직접 평가했어요 · 宝宝亲自打的分
                </p>
              ) : (
                <p className="text-[11px] text-rose-400 mt-1">
                  짝꿍이 아직 평가 전이에요. 짝꿍이 자기 계정에서 평가하면
                  자동으로 떠요. · 宝宝还没打分，等TA登录后自己打。
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

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            메모 · 备注
          </label>
          <textarea
            className="input-base min-h-[80px]"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={
            upsert.isPending || !name.trim() || categories.length === 0
          }
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
