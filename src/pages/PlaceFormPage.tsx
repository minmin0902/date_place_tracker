import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChefHat, Heart, Plus, Trash2, User, Users, Utensils } from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { useAuth } from "@/hooks/useAuth";
import { usePlace, useUpsertFood, useUpsertPlace } from "@/hooks/usePlaces";
import { fetchWishlistItem, useDeleteWishlist } from "@/hooks/useWishlist";
import { useFormDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/PageHeader";
import { CategoryChips } from "@/components/CategoryChips";
import { PhotoUploader } from "@/components/PhotoUploader";
import { LocationPicker } from "@/components/LocationPicker";
import { PLACE_CATEGORIES } from "@/lib/constants";
import type { ChefRole } from "@/lib/database.types";
import { FOOD_CATEGORIES } from "@/lib/constants";

type HomeFoodDraft = {
  // local-only id so we can key + remove items before they hit the server
  uid: string;
  name: string;
  chef: ChefRole;
  category: string | null;
};

function newHomeFood(): HomeFoodDraft {
  return {
    uid: crypto.randomUUID(),
    name: "",
    chef: "together",
    category: null,
  };
}

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
  const upsertFood = useUpsertFood();
  const deleteWishlist = useDeleteWishlist();

  // 'out' = 외식 (locationpicker + address) / 'home' = 집밥 (multi-food + chef)
  const [mode, setMode] = useState<"out" | "home">("out");
  const [name, setName] = useState("");
  const [dateVisited, setDateVisited] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [wantRevisit, setWantRevisit] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [homeFoods, setHomeFoods] = useState<HomeFoodDraft[]>(() => [
    newHomeFood(),
  ]);

  useEffect(() => {
    if (!existing) return;
    setMode(existing.is_home_cooked ? "home" : "out");
    setName(existing.name);
    setDateVisited(existing.date_visited);
    setAddress(existing.address ?? "");
    setCategory(existing.category ?? null);
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
      mode,
      name,
      dateVisited,
      address,
      category,
      memo,
      wantRevisit,
      photos,
      coord,
      placeLabel,
      homeFoods,
    }),
    [
      mode,
      name,
      dateVisited,
      address,
      category,
      memo,
      wantRevisit,
      photos,
      coord,
      placeLabel,
      homeFoods,
    ]
  );
  const draft = useFormDraft({
    key: draftKey,
    enabled: !isEdit,
    snapshot: draftSnapshot,
    restore: (saved) => {
      if (saved.mode === "home" || saved.mode === "out") setMode(saved.mode);
      if (saved.name != null) setName(saved.name as string);
      if (saved.dateVisited != null)
        setDateVisited(saved.dateVisited as string);
      if (saved.address != null) setAddress(saved.address as string);
      if (saved.category != null)
        setCategory(saved.category as string | null);
      if (saved.memo != null) setMemo(saved.memo as string);
      if (saved.wantRevisit != null)
        setWantRevisit(saved.wantRevisit as boolean);
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
      if (saved.coord != null)
        setCoord(saved.coord as { lat: number; lng: number } | null);
      if (saved.placeLabel != null)
        setPlaceLabel(saved.placeLabel as string | null);
      if (Array.isArray(saved.homeFoods) && saved.homeFoods.length > 0) {
        setHomeFoods(saved.homeFoods as HomeFoodDraft[]);
      }
    },
  });

  // Prefill from a wishlist item when user clicked "다녀왔어요".
  useEffect(() => {
    if (isEdit || !fromWishlistId) return;
    let cancelled = false;
    void fetchWishlistItem(fromWishlistId).then((w) => {
      if (cancelled || !w) return;
      setName(w.name);
      if (w.category) setCategory(w.category);
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

  function addHomeFood() {
    setHomeFoods((prev) => [...prev, newHomeFood()]);
  }
  function removeHomeFood(uid: string) {
    setHomeFoods((prev) =>
      prev.length === 1 ? prev : prev.filter((f) => f.uid !== uid)
    );
  }
  function updateHomeFood<K extends keyof HomeFoodDraft>(
    uid: string,
    field: K,
    value: HomeFoodDraft[K]
  ) {
    setHomeFoods((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, [field]: value } : f))
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!couple || !user) return;
    const isHome = mode === "home";
    // In home mode the place inherits the couple's saved home address /
    // coordinates so the entry shows up at the right spot on the map.
    const placeAddress = isHome
      ? couple.home_address ?? null
      : address.trim() || null;
    const placeLat = isHome ? couple.home_latitude ?? null : coord?.lat ?? null;
    const placeLng = isHome
      ? couple.home_longitude ?? null
      : coord?.lng ?? null;

    const place = await upsert.mutateAsync({
      id,
      coupleId: couple.id,
      userId: user.id,
      values: {
        name: name.trim(),
        date_visited: dateVisited,
        address: placeAddress,
        category,
        memo: memo.trim() || null,
        want_to_revisit: wantRevisit,
        is_home_cooked: isHome,
        latitude: placeLat,
        longitude: placeLng,
        photo_urls: photos.length ? photos : null,
      },
    });

    // Bulk-create the home-mode foods (only on new entries; edit form
    // doesn't expose the multi-menu UI). Skip empty names.
    if (!isEdit && isHome && place && typeof place === "object" && "id" in place) {
      const placeId = (place as { id: string }).id;
      const toCreate = homeFoods.filter((f) => f.name.trim().length > 0);
      // Run sequentially — most home meals are 2-4 dishes, parallel
      // bursts trip Supabase's per-second insert quota at the free tier.
      for (const f of toCreate) {
        try {
          await upsertFood.mutateAsync({
            place_id: placeId,
            values: {
              name: f.name.trim(),
              my_rating: null,
              partner_rating: null,
              category: f.category,
              memo: null,
              photo_url: null,
              photo_urls: null,
              chef: f.chef,
              created_by: user?.id ?? null,
            },
          });
        } catch (err) {
          console.error("[PlaceFormPage] home food insert failed:", err);
        }
      }
    }

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
    const targetId =
      place && typeof place === "object" && "id" in place
        ? (place as { id: string }).id
        : id;
    navigate(isEdit ? `/places/${id}` : `/places/${targetId}`, {
      replace: true,
    });
  }

  const homeReady = !!couple?.home_address;

  return (
    <div>
      <PageHeader
        title={
          isEdit
            ? "기록 수정 · 修改记录"
            : mode === "home"
              ? "오늘의 식탁 · 今天的家宴"
              : "새로운 맛집 · 记下新地方"
        }
        back
      />
      <form onSubmit={onSubmit} className="px-5 space-y-5 pb-6">
        {/* Mode toggle — only visible on new entries; the existing record
            already knows whether it was out or home. */}
        {!isEdit && (
          <div className="flex bg-white rounded-2xl border border-cream-200 p-1.5 shadow-soft">
            <ModeButton
              active={mode === "out"}
              onClick={() => setMode("out")}
              tone="peach"
              icon={<Utensils className="w-4 h-4" />}
              labelKo="밖에서 냠냠"
              labelZh="出门干饭"
            />
            <ModeButton
              active={mode === "home"}
              onClick={() => setMode("home")}
              tone="rose"
              icon={<ChefHat className="w-4 h-4" />}
              labelKo="집밥 요리사"
              labelZh="变身小厨神"
            />
          </div>
        )}

        {/* Out mode — keep the existing flow */}
        {mode === "out" && (
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
        )}

        {/* Home mode — show couple's home address (read-only here). If not
            set, nudge the user to fill it in via Settings first. */}
        {mode === "home" && (
          <div className="card p-4 bg-rose-50/40 border-rose-100/70">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl leading-none">🏠</span>
              <span className="text-sm font-bold text-rose-500">
                우리집 · 我们家
              </span>
            </div>
            {homeReady ? (
              <p className="text-xs text-ink-500 break-words">
                {couple?.home_address}
              </p>
            ) : (
              <p className="text-xs text-rose-500">
                아직 집 주소가 없어요. 설정에서 먼저 등록해주세요.
                <br />
                还没有家庭住址，请先在设置里登记。
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            {mode === "home"
              ? "오늘의 식탁 이름 · 给这顿饭起个名 *"
              : "상호명 · 店名 *"}
          </label>
          <input
            className="input-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              mode === "home"
                ? "예) 우리집 따뜻한 식탁 🏠 · 例：在家小聚"
                : "예) 블루보틀 · 例：蓝瓶咖啡"
            }
            required
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            {mode === "home"
              ? "요리한 날 · 下厨日期 *"
              : "방문 날짜 · 打卡日期 *"}
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
            카테고리 · 种类 *
          </label>
          <CategoryChips
            options={PLACE_CATEGORIES}
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

        {/* Address only matters for out mode; home mode uses the couple's
            saved address. */}
        {mode === "out" && (
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
        )}

        {/* Home-mode multi-menu: only on new entries. Editing a home
            place still lets you tweak the metadata, but per-food edits
            happen on the detail page. */}
        {mode === "home" && !isEdit && (
          <div className="space-y-3 bg-rose-50/40 rounded-3xl p-4 border border-rose-100/60">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-rose-500">
                오늘 차린 메뉴들 🍳 · 今天做了什么好吃的？
              </span>
              <span className="text-xs font-number font-bold text-rose-400">
                {homeFoods.length}
              </span>
            </div>
            <div className="space-y-3">
              {homeFoods.map((food, idx) => (
                <HomeFoodCard
                  key={food.uid}
                  index={idx}
                  food={food}
                  removable={homeFoods.length > 1}
                  onRemove={() => removeHomeFood(food.uid)}
                  onChangeName={(v) => updateHomeFood(food.uid, "name", v)}
                  onChangeChef={(v) => updateHomeFood(food.uid, "chef", v)}
                  onChangeCategory={(v) =>
                    updateHomeFood(food.uid, "category", v)
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addHomeFood}
              className="w-full py-3 rounded-xl border-2 border-dashed border-rose-200/80 text-rose-400 font-bold text-[13px] flex items-center justify-center gap-1.5 hover:bg-rose-50 active:scale-[0.98] transition"
            >
              <Plus className="w-4 h-4" />
              메뉴 추가하기 · 加个菜
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            사진 · 绝美返图
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
            placeholder={
              mode === "home"
                ? "오늘 분위기는… · 今晚的心情…"
                : "기념일에 다녀옴! · 纪念日打卡！"
            }
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
            {mode === "home"
              ? "또 해먹을래! · 封神菜谱"
              : "또 올래! 맛집으로 찜하기 · 必须二刷"}
          </span>
          <span
            className={`w-11 h-6 rounded-full transition relative ${wantRevisit ? "bg-rose-400" : "bg-cream-200"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${wantRevisit ? "left-5" : "left-0.5"}`}
            />
          </span>
        </button>

        {(() => {
          // Home-mode requires every non-empty inline food to have a
          // category picked too — otherwise the bulk insert below would
          // create rows that go straight into the "❓ 미분류" bucket.
          const homeFoodsIncomplete =
            mode === "home" &&
            !isEdit &&
            homeFoods.some(
              (f) => f.name.trim().length > 0 && !f.category
            );
          const cantSave =
            upsert.isPending ||
            upsertFood.isPending ||
            !category ||
            homeFoodsIncomplete;
          return (
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={cantSave}
            >
              저장 · 保存
            </button>
          );
        })()}
      </form>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  tone,
  icon,
  labelKo,
  labelZh,
}: {
  active: boolean;
  onClick: () => void;
  tone: "peach" | "rose";
  icon: React.ReactNode;
  labelKo: string;
  labelZh: string;
}) {
  const activeClass =
    tone === "peach"
      ? "bg-peach-100 text-peach-500 shadow-sm"
      : "bg-rose-100 text-rose-500 shadow-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[13px] font-bold transition ${
        active ? activeClass : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {icon}
      <span>
        {labelKo} · {labelZh}
      </span>
    </button>
  );
}

function HomeFoodCard({
  index,
  food,
  removable,
  onRemove,
  onChangeName,
  onChangeChef,
  onChangeCategory,
}: {
  index: number;
  food: HomeFoodDraft;
  removable: boolean;
  onRemove: () => void;
  onChangeName: (v: string) => void;
  onChangeChef: (v: ChefRole) => void;
  onChangeCategory: (v: string | null) => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-rose-100/70 shadow-soft relative space-y-3">
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-ink-300 hover:text-rose-400 hover:bg-rose-50 transition"
          aria-label="remove menu"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      <div className="pr-8">
        <input
          className="w-full bg-transparent text-[15px] font-bold text-ink-900 placeholder:text-ink-300 focus:outline-none border-b border-cream-200 focus:border-rose-300 pb-1.5 transition-colors"
          value={food.name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder={`메뉴 ${index + 1} 이름 · 第 ${index + 1} 道菜`}
        />
      </div>

      {/* Per-food category — required so the menu doesn't end up in the
          "❓ 미분류" bucket later. Compact chip row keeps the home-mode
          card from getting tall. */}
      <div>
        <p className="text-[11px] font-bold text-ink-400 mb-1.5">
          종류 · 种类 *
        </p>
        <CategoryChips
          options={FOOD_CATEGORIES}
          value={food.category}
          onChange={onChangeCategory}
          scope="category"
          customKey="other"
        />
      </div>

      <div>
        <p className="text-[11px] font-bold text-ink-400 mb-1.5">
          누가 요리했나요? · 谁掌勺？
        </p>
        <div className="flex gap-1 bg-cream-50 p-1 rounded-xl border border-cream-100">
          <ChefButton
            active={food.chef === "me"}
            onClick={() => onChangeChef("me")}
            tone="peach"
            icon={<User className="w-3.5 h-3.5" />}
            labelKo="내가!"
            labelZh="本大厨"
          />
          <ChefButton
            active={food.chef === "partner"}
            onClick={() => onChangeChef("partner")}
            tone="rose"
            icon={<User className="w-3.5 h-3.5" />}
            labelKo="짝꿍!"
            labelZh="宝宝"
          />
          <ChefButton
            active={food.chef === "together"}
            onClick={() => onChangeChef("together")}
            tone="amber"
            icon={<Users className="w-3.5 h-3.5" />}
            labelKo="같이!"
            labelZh="一起做"
          />
        </div>
      </div>
    </div>
  );
}

function ChefButton({
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
  const activeColor =
    tone === "peach"
      ? "text-peach-500"
      : tone === "rose"
        ? "text-rose-500"
        : "text-amber-500";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-[12px] font-bold transition ${
        active
          ? `bg-white shadow-soft ${activeColor}`
          : "text-ink-400 hover:text-ink-700"
      }`}
    >
      {icon}
      <span>
        {labelKo} · {labelZh}
      </span>
    </button>
  );
}
