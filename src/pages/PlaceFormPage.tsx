import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Heart } from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { useAuth } from "@/hooks/useAuth";
import { usePlace, useUpsertPlace } from "@/hooks/usePlaces";
import { fetchWishlistItem, useDeleteWishlist } from "@/hooks/useWishlist";
import { useFormDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/PageHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { PhotoUploader } from "@/components/PhotoUploader";
import { LocationPicker } from "@/components/LocationPicker";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/constants";

export default function PlaceFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromWishlistId = searchParams.get("fromWishlist");
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: existing } = usePlace(id);
  const upsert = useUpsertPlace();
  const deleteWishlist = useDeleteWishlist();

  const [name, setName] = useState("");
  const [dateVisited, setDateVisited] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [memo, setMemo] = useState("");
  const [wantRevisit, setWantRevisit] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setDateVisited(existing.date_visited);
    setAddress(existing.address ?? "");
    setCategory((existing.category as PlaceCategory) ?? null);
    setMemo(existing.memo ?? "");
    setWantRevisit(existing.want_to_revisit);
    setPhotos(existing.photo_urls ?? []);
    if (existing.latitude != null && existing.longitude != null) {
      setCoord({ lat: existing.latitude, lng: existing.longitude });
      setPlaceLabel(existing.name);
    }
  }, [existing]);

  // Auto-save draft so form entries survive navigation / tab switches.
  // Editing existing places uses server data as source of truth, so we
  // only save drafts for new entries.
  const draftKey = fromWishlistId
    ? `draft:place:wishlist:${fromWishlistId}`
    : "draft:place:new";
  const draftSnapshot = useMemo(
    () => ({
      name,
      dateVisited,
      address,
      category,
      memo,
      wantRevisit,
      photos,
      coord,
      placeLabel,
    }),
    [
      name,
      dateVisited,
      address,
      category,
      memo,
      wantRevisit,
      photos,
      coord,
      placeLabel,
    ]
  );
  const draft = useFormDraft({
    key: draftKey,
    enabled: !isEdit,
    snapshot: draftSnapshot,
    restore: (saved) => {
      if (saved.name != null) setName(saved.name as string);
      if (saved.dateVisited != null)
        setDateVisited(saved.dateVisited as string);
      if (saved.address != null) setAddress(saved.address as string);
      if (saved.category != null)
        setCategory(saved.category as PlaceCategory | null);
      if (saved.memo != null) setMemo(saved.memo as string);
      if (saved.wantRevisit != null)
        setWantRevisit(saved.wantRevisit as boolean);
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
      if (saved.coord != null)
        setCoord(saved.coord as { lat: number; lng: number } | null);
      if (saved.placeLabel != null)
        setPlaceLabel(saved.placeLabel as string | null);
    },
  });

  // Prefill from a wishlist item when user clicked "다녀왔어요".
  useEffect(() => {
    if (isEdit || !fromWishlistId) return;
    let cancelled = false;
    void fetchWishlistItem(fromWishlistId).then((w) => {
      if (cancelled || !w) return;
      setName(w.name);
      if (w.category) setCategory(w.category as PlaceCategory);
      if (w.memo) setMemo(w.memo);
      if (w.address) setAddress(w.address);
      if (w.latitude != null && w.longitude != null) {
        setCoord({ lat: w.latitude, lng: w.longitude });
        setPlaceLabel(w.name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fromWishlistId, isEdit]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!couple || !user) return;
    await upsert.mutateAsync({
      id,
      coupleId: couple.id,
      userId: user.id,
      values: {
        name: name.trim(),
        date_visited: dateVisited,
        address: address.trim() || null,
        category,
        memo: memo.trim() || null,
        want_to_revisit: wantRevisit,
        latitude: coord?.lat ?? null,
        longitude: coord?.lng ?? null,
        photo_urls: photos.length ? photos : null,
      },
    });
    // If this place was promoted from a wishlist item, drop the wishlist
    // entry so it doesn't stay in "가고 싶은 곳" after we've been.
    if (!isEdit && fromWishlistId) {
      try {
        await deleteWishlist.mutateAsync(fromWishlistId);
      } catch (err) {
        console.error("[PlaceFormPage] failed to remove wishlist item:", err);
      }
    }
    // Draft succeeded → drop the saved snapshot so the next "new" form
    // doesn't rehydrate stale data.
    draft.clear();
    navigate(isEdit ? `/places/${id}` : "/", { replace: true });
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? "기록 수정 · 修改记录" : "새로운 맛집 · 记下新地方"}
        back
      />
      <form onSubmit={onSubmit} className="px-5 space-y-5 pb-6">
        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            위치 · 定位
          </label>
          <LocationPicker
            value={coord}
            label={placeLabel}
            onChange={(v) => {
              setCoord(v);
              if (!v) setPlaceLabel(null);
            }}
            onPlaceSelected={(p) => {
              setPlaceLabel(p.name || null);
              if (!name) setName(p.name);
              if (!address) setAddress(p.address);
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            상호명 · 店名 *
          </label>
          <input
            className="input-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 블루보틀 · 例：蓝瓶咖啡"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            방문 날짜 · 打卡日期 *
          </label>
          <input
            type="date"
            className="input-base"
            value={dateVisited}
            onChange={(e) => setDateVisited(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            카테고리 · 种类
          </label>
          <CategoryChips
            options={PLACE_CATEGORIES}
            value={category}
            onChange={setCategory}
            scope="category"
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            주소 · 地址
          </label>
          <input
            className="input-base"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예) 서울시 성동구... · 例：首尔市城东区..."
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            사진 · 美照
          </label>
          {couple && (
            <PhotoUploader
              coupleId={couple.id}
              photos={photos}
              onChange={setPhotos}
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            메모 · 备注
          </label>
          <textarea
            className="input-base min-h-[100px]"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="기념일에 다녀옴! · 纪念日打卡！"
          />
        </div>

        <button
          type="button"
          onClick={() => setWantRevisit((v) => !v)}
          className={`w-full card p-4 flex items-center justify-between ${
            wantRevisit ? "!bg-rose-100 !border-rose-200" : ""
          }`}
        >
          <span className="flex items-center gap-2 font-bold text-ink-700">
            <Heart
              className={`w-5 h-5 ${wantRevisit ? "fill-rose-400 text-rose-400" : "text-ink-500"}`}
            />
            또 올래! 맛집으로 찜하기 · 标记为“必须二刷”
          </span>
          <span
            className={`w-11 h-6 rounded-full transition relative ${wantRevisit ? "bg-rose-400" : "bg-cream-200"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${wantRevisit ? "left-5" : "left-0.5"}`}
            />
          </span>
        </button>

        <button type="submit" className="btn-primary w-full" disabled={upsert.isPending}>
          저장 · 保存
        </button>
      </form>
    </div>
  );
}
