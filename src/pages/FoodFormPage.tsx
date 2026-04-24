import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCouple } from "@/hooks/useCouple";
import {
  uploadPhoto,
  usePlace,
  useUpsertFood,
} from "@/hooks/usePlaces";
import { PageHeader } from "@/components/PageHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { RatingPicker } from "@/components/RatingPicker";
import { FOOD_CATEGORIES, type FoodCategory } from "@/lib/constants";
import { X } from "lucide-react";

export default function FoodFormPage() {
  const { id: placeId, foodId } = useParams();
  const isEdit = !!foodId;
  const navigate = useNavigate();
  const { data: couple } = useCouple();
  const { data: place } = usePlace(placeId);
  const upsert = useUpsertFood();

  const existing = place?.foods.find((f) => f.id === foodId);

  const [name, setName] = useState("");
  const [myRating, setMyRating] = useState<number | null>(null);
  const [partnerRating, setPartnerRating] = useState<number | null>(null);
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [memo, setMemo] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setMyRating(existing.my_rating);
    setPartnerRating(existing.partner_rating);
    setCategory((existing.category as FoodCategory) ?? null);
    setMemo(existing.memo ?? "");
    setPhotoUrl(existing.photo_url);
  }, [existing]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !couple) return;
    setBusy(true);
    setPhotoError(null);
    try {
      const url = await uploadPhoto(f, couple.id);
      setPhotoUrl(url);
    } catch (err) {
      console.error("[FoodFormPage] photo upload failed:", err);
      setPhotoError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placeId) return;
    await upsert.mutateAsync({
      id: foodId,
      place_id: placeId,
      values: {
        name: name.trim(),
        my_rating: myRating,
        partner_rating: partnerRating,
        category,
        memo: memo.trim() || null,
        photo_url: photoUrl,
      },
    });
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
            카테고리 · 种类
          </label>
          <CategoryChips
            options={FOOD_CATEGORIES}
            value={category}
            onChange={setCategory}
            scope="category"
          />
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
          <div className="border-t border-cream-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-ink-700">
                짝꿍 별점 · 宝宝的评分
              </span>
              <span className="text-xs font-bold text-ink-400 font-number">
                {partnerRating ?? "-"} / 5
              </span>
            </div>
            <RatingPicker
              value={partnerRating}
              onChange={setPartnerRating}
              color="rose"
            />
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
            사진 · 美照
          </label>
          {photoUrl ? (
            <div className="relative w-32 h-32">
              <img
                src={photoUrl}
                className="w-full h-full object-cover rounded-xl"
                alt=""
              />
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow-soft flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className="w-32 h-32 rounded-xl border-2 border-dashed border-cream-200 flex items-center justify-center text-ink-500 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onFile(e)}
              />
              {busy ? "로딩 중... · 上传中..." : "+"}
            </label>
          )}
          {photoError && (
            <p className="text-xs text-rose-500 mt-2 break-words">
              {photoError}
            </p>
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
          disabled={upsert.isPending || !name.trim()}
        >
          저장 · 保存
        </button>
      </form>
    </div>
  );
}
