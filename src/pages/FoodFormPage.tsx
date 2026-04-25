import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlace, useUpsertFood } from "@/hooks/usePlaces";
import { useFormDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/PageHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { RatingPicker } from "@/components/RatingPicker";
import { PhotoUploader } from "@/components/PhotoUploader";
import { FOOD_CATEGORIES } from "@/lib/constants";
import { ratingsForViewer } from "@/lib/utils";

export default function FoodFormPage() {
  const { id: placeId, foodId } = useParams();
  const isEdit = !!foodId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: place } = usePlace(placeId);
  const upsert = useUpsertFood();

  const existing = place?.foods.find((f) => f.id === foodId);

  const [name, setName] = useState("");
  const [myRating, setMyRating] = useState<number | null>(null);
  const [partnerRating, setPartnerRating] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  // Solo flag — when true, only the food's creator ate this dish, so
  // the partner rating slot is suppressed and the total is doubled.
  const [isSolo, setIsSolo] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    // Hydrate ratings from the *viewer's* perspective so each partner
    // sees their own rating in the "내 별점" slot when editing.
    const view = ratingsForViewer(existing, user?.id);
    setMyRating(view.myRating);
    setPartnerRating(view.partnerRating);
    setCategory(existing.category ?? null);
    setMemo(existing.memo ?? "");
    setIsSolo(existing.is_solo ?? false);
    // Prefer the new photo_urls array, fall back to the legacy single-photo
    // column for foods saved before the migration.
    if (existing.photo_urls && existing.photo_urls.length > 0) {
      setPhotos(existing.photo_urls);
    } else if (existing.photo_url) {
      setPhotos([existing.photo_url]);
    }
  }, [existing, user?.id]);

  // Whether the current viewer is the food's creator. Solo foods are
  // ALWAYS authored by the eater, so this also tells us whether the
  // viewer is the one who ate it (= the only one who can rate).
  const viewerIsCreator =
    !existing || existing.created_by == null
      ? true
      : existing.created_by === user?.id;

  // Draft: so if the user taps off mid-entry their typed rating / name
  // is still there when they come back.
  const draftKey = placeId ? `draft:food:new:${placeId}` : "draft:food:new";
  const draftSnapshot = useMemo(
    () => ({ name, myRating, partnerRating, category, memo, photos, isSolo }),
    [name, myRating, partnerRating, category, memo, photos, isSolo]
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
      if (saved.category !== undefined)
        setCategory(saved.category as string | null);
      if (saved.memo != null) setMemo(saved.memo as string);
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
      if (typeof saved.isSolo === "boolean") setIsSolo(saved.isSolo);
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
    // Solo: only the eater's slot keeps a value, the other side is
    // forced null so the display logic + comparison filters can rely
    // on "non-eater rating is null" being a hard rule.
    if (isSolo) {
      partner_rating_to_save = null;
    }
    await upsert.mutateAsync({
      id: foodId,
      place_id: placeId,
      values: {
        name: name.trim(),
        my_rating: my_rating_to_save,
        partner_rating: partner_rating_to_save,
        category,
        memo: memo.trim() || null,
        // Keep the legacy scalar column populated too so any older build
        // still reading photo_url sees something.
        photo_url: photos[0] ?? null,
        photo_urls: photos.length ? photos : null,
        // On insert: stamp the current user. On update: preserve the
        // existing author so swap math stays consistent forever.
        created_by: ownerId,
        is_solo: isSolo,
      },
    });
    draft.clear();
    navigate(`/places/${placeId}`, { replace: true });
  }

  // Total = solo ? eaterRating × 2 : myRating + partnerRating.
  // For solo, the "eater" is whichever side has the value from the
  // viewer's perspective (myRating if I'm the creator, partnerRating
  // otherwise).
  const eaterRating = isSolo
    ? viewerIsCreator
      ? myRating
      : partnerRating
    : null;
  const total = isSolo
    ? (eaterRating ?? 0) * 2
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
          <CategoryChips
            options={FOOD_CATEGORIES}
            value={category}
            onChange={setCategory}
            scope="category"
            customKey="other"
          />
          {!category && (
            <p className="text-[11px] text-rose-500 mt-1.5 font-medium">
              카테고리를 골라주세요 · 请选择类别
            </p>
          )}
        </div>

        {/* Solo / together toggle — gates the rating UI below.
            New entries default to "together"; editing a solo entry
            keeps it solo. Only the creator can flip the flag (it's
            their meal record). */}
        <div className="flex bg-cream-100/80 p-1 rounded-xl border border-cream-200/60">
          <SoloSegment
            active={!isSolo}
            disabled={!viewerIsCreator}
            onClick={() => setIsSolo(false)}
            label="둘이 같이 먹었어 · 我们都吃了"
          />
          <SoloSegment
            active={isSolo}
            disabled={!viewerIsCreator}
            onClick={() => setIsSolo(true)}
            label="혼자 먹었어 · 自己吃的"
          />
        </div>

        <div className="card p-4 space-y-4">
          {/* My rating slot — visible whenever:
              · couple food (always)
              · solo + I'm the creator (the eater) */}
          {(!isSolo || viewerIsCreator) && (
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
          {/* Partner slot — read-only display:
              · couple food: show partner's rating, with "still pending"
                copy when null
              · solo where I'm NOT the creator: show partner's rating
                (the eater's score), since I didn't eat */}
          {!isSolo && (
            <div className={`${viewerIsCreator ? "border-t border-cream-100 pt-4" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-ink-700">
                  짝꿍 별점 · 宝宝的评分
                </span>
                <span className="text-xs font-bold text-ink-400 font-number">
                  {partnerRating ?? "-"} / 5
                </span>
              </div>
              {partnerRating != null ? (
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
          {/* Solo + I'm not the creator → show the eater's score read-only */}
          {isSolo && !viewerIsCreator && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-ink-700">
                  짝꿍 별점 · 宝宝的评分
                </span>
                <span className="text-xs font-bold text-ink-400 font-number">
                  {partnerRating ?? "-"} / 5
                </span>
              </div>
              <p className="text-[11px] text-ink-400 mt-1">
                짝꿍이 혼자 먹은 메뉴라 별점은 짝꿍 거예요 ·
                宝宝自己吃的，分数也是宝宝打的
              </p>
            </div>
          )}
          {total > 0 && (
            <div className="pt-3 border-t border-cream-100 flex items-center justify-between">
              <span className="text-sm font-bold text-ink-700">
                합계 · 总分{" "}
                {isSolo && (
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
          disabled={upsert.isPending || !name.trim() || !category}
        >
          저장 · 保存
        </button>
      </form>
    </div>
  );
}

// Compact 2-button segment used by the solo/together toggle. Disabled
// state is for non-creators editing a solo food — the flag is locked
// because flipping it would require swapping which slot the rating
// lives in, which is the creator's call to make.
function SoloSegment({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all min-w-0 truncate ${
        active
          ? "bg-white shadow-sm border border-peach-100 text-peach-500"
          : "text-ink-500 hover:text-ink-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}
