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
    // Prefer the new photo_urls array, fall back to the legacy single-photo
    // column for foods saved before the migration.
    if (existing.photo_urls && existing.photo_urls.length > 0) {
      setPhotos(existing.photo_urls);
    } else if (existing.photo_url) {
      setPhotos([existing.photo_url]);
    }
  }, [existing, user?.id]);

  // Draft: so if the user taps off mid-entry their typed rating / name
  // is still there when they come back.
  const draftKey = placeId ? `draft:food:new:${placeId}` : "draft:food:new";
  const draftSnapshot = useMemo(
    () => ({ name, myRating, partnerRating, category, memo, photos }),
    [name, myRating, partnerRating, category, memo, photos]
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
    const isOwner = !existing || existing.created_by == null
      ? true
      : existing.created_by === user?.id;
    const my_rating_to_save = isOwner ? myRating : partnerRating;
    const partner_rating_to_save = isOwner ? partnerRating : myRating;
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
      },
    });
    draft.clear();
    navigate(`/places/${placeId}`, { replace: true });
  }

  const total = (myRating ?? 0) + (partnerRating ?? 0);

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

        <div className="card p-4 space-y-4">
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
          {/* Partner's rating is read-only here — each user only edits
              their own slot, the other half lands when the partner logs
              in and rates from their own session. */}
          <div className="border-t border-cream-100 pt-4">
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
          {total > 0 && (
            <div className="pt-3 border-t border-cream-100 flex items-center justify-between">
              <span className="text-sm font-bold text-ink-700">
                합계 · 总分
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
