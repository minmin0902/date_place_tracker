import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChefHat, Heart, Plus, Trash2, User, Users, Utensils } from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { useAuth } from "@/hooks/useAuth";
import { usePlace, useUpsertFood, useUpsertPlace } from "@/hooks/usePlaces";
import { fetchWishlistItem, useDeleteWishlist } from "@/hooks/useWishlist";
import { useFormDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/PageHeader";
import {
  GroupedMultiSelect,
  type GroupedMultiSelectEntry,
} from "@/components/GroupedMultiSelect";
import { PhotoUploader } from "@/components/PhotoUploader";
import { MemoAuthorPicker } from "@/components/MemoAuthorPicker";
import { LocationPicker } from "@/components/LocationPicker";
import {
  CATEGORY_GROUPS,
  categoryEmojiOf,
  FOOD_CATEGORIES,
  PREMADE_FOOD_CATEGORIES,
} from "@/lib/constants";
import type { ChefRole } from "@/lib/database.types";
import { useTranslation } from "react-i18next";
import { getCategories } from "@/lib/utils";

type HomeFoodDraft = {
  // local-only id so we can key + remove items before they hit the server
  uid: string;
  name: string;
  // Nullable so the user can deselect the chef ("아무도 안 만든" — for
  // 완제품 the field stays empty until they explicitly tag a chef).
  chef: ChefRole | null;
  categories: string[];
  // Per-menu memo + media. The bulk-insert that happens on form
  // submit forwards these into the foods row, so home meals end up
  // as fully-rated entries instead of bare names.
  memo: string;
  // Who wrote `memo`. Only persisted when memo is non-empty.
  memo_author_id: string | null;
  photo_urls: string[];
};

function newHomeFood(): HomeFoodDraft {
  return {
    uid: crypto.randomUUID(),
    name: "",
    chef: "together",
    categories: [],
    memo: "",
    memo_author_id: null,
    photo_urls: [],
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
  const { t } = useTranslation();

  // Pre-built grouped picker options. Same shape as the homepage filter
  // so the picker UI is identical — just multi-select with no "all"
  // sentinel since this is form data, not a filter.
  const builtinCategoryOptions = useMemo<GroupedMultiSelectEntry[]>(() => {
    return CATEGORY_GROUPS.map((g) => ({
      groupLabel: `${g.ko} · ${g.zh}`,
      options: g.keys.map((c) => ({
        value: c,
        label: t(`category.${c}`),
        emoji: categoryEmojiOf(c),
      })),
    }));
  }, [t]);

  // 'out' = 외식 (locationpicker + address) / 'home' = 집밥 (multi-food + chef)
  const [mode, setMode] = useState<"out" | "home">("out");
  const [name, setName] = useState("");
  const [dateVisited, setDateVisited] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [address, setAddress] = useState("");
  // Multi-select categories — store as array. Backward-compatible:
  // hydrate from `categories` first, fall back to legacy `category`.
  const [categories, setCategories] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  // Tracks the toggle in the memo input so we know which partner
  // wrote it. Defaults to the current user once they're known.
  const [memoAuthorId, setMemoAuthorId] = useState<string | null>(null);
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
    setCategories(getCategories(existing));
    setMemo(existing.memo ?? "");
    setMemoAuthorId(existing.memo_author_id ?? null);
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
      categories,
      memo,
      memoAuthorId,
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
      categories,
      memo,
      memoAuthorId,
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
      if (Array.isArray(saved.categories))
        setCategories(saved.categories as string[]);
      if (saved.memo != null) setMemo(saved.memo as string);
      if (saved.memoAuthorId !== undefined)
        setMemoAuthorId(
          saved.memoAuthorId === null ? null : (saved.memoAuthorId as string)
        );
      if (saved.wantRevisit != null)
        setWantRevisit(saved.wantRevisit as boolean);
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
      if (saved.coord != null)
        setCoord(saved.coord as { lat: number; lng: number } | null);
      if (saved.placeLabel != null)
        setPlaceLabel(saved.placeLabel as string | null);
      if (Array.isArray(saved.homeFoods) && saved.homeFoods.length > 0) {
        // v1 drafts didn't persist memo/photo_urls — fill defaults
        // so the new fields don't break on restore.
        setHomeFoods(
          (saved.homeFoods as Array<Partial<HomeFoodDraft>>).map((f) => ({
            uid: f.uid ?? crypto.randomUUID(),
            name: f.name ?? "",
            chef: (f.chef as ChefRole | null | undefined) ?? "together",
            categories: f.categories ?? [],
            memo: f.memo ?? "",
            memo_author_id: f.memo_author_id ?? null,
            photo_urls: f.photo_urls ?? [],
          }))
        );
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
      if (w.category) setCategories([w.category]);
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

    // Inline validation: instead of a dead disabled button (forcing the
    // user to hunt for the missing field), we let the user submit, find
    // the first invalid section, and scroll/focus it. The per-field
    // error text already renders inline; this just adds the discovery.
    const firstErrorEl = document.querySelector<HTMLElement>(
      "[data-form-error='true']"
    );
    if (firstErrorEl) {
      firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      // Try to focus an interactive descendant if there's one (text
      // input most useful) — otherwise the scroll-into-view alone is
      // a clear-enough nudge.
      const focusTarget = firstErrorEl.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
      >("input, textarea, button[type='button']");
      focusTarget?.focus({ preventScroll: true });
      return;
    }

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
        // Keep `category` synced with the first picked category so
        // older client builds + the singleton-based UI surfaces still
        // see something. The full multi-select lives in `categories`.
        category: categories[0] ?? null,
        categories: categories.length ? categories : null,
        memo: memo.trim() || null,
        // Stamp author only when there's actually a memo. If the user
        // clears the textarea, drop the author too so the row can fall
        // back to the legacy renderer if anyone re-adds a memo later.
        memo_author_id: memo.trim() ? memoAuthorId ?? user.id : null,
        // Bump memo_updated_at only when the text actually changed,
        // so unrelated re-saves (toggling revisit, swapping a photo)
        // don't push the timestamp forward. Empty memo → null.
        memo_updated_at: !memo.trim()
          ? null
          : memo.trim() === (existing?.memo ?? "")
            ? existing?.memo_updated_at ?? new Date().toISOString()
            : new Date().toISOString(),
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
              category: f.categories[0] ?? null,
              categories: f.categories.length ? f.categories : null,
              memo: f.memo.trim() || null,
              memo_author_id: f.memo.trim()
                ? f.memo_author_id ?? user.id
                : null,
              // Home-mode foods are always brand-new inserts, so a
              // non-empty memo is by definition just-written.
              memo_updated_at: f.memo.trim()
                ? new Date().toISOString()
                : null,
              // photo_url is the legacy single-photo column; keep it
              // populated with the first media so older clients still
              // see something.
              photo_url: f.photo_urls[0] ?? null,
              photo_urls: f.photo_urls.length ? f.photo_urls : null,
              // Forward whatever chef the toggle currently shows (or
              // null if the user explicitly deselected). Premade
              // dishes are no longer auto-null'd — letting users
              // tag a chef on bought-and-served items if they want.
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
    if (isEdit) {
      // Edit case: pop the form off history so back doesn't land on a
      // duplicate /places/:id entry (the replace target).
      navigate(-1);
    } else {
      // Brand-new place: take the user straight to the new detail
      // page (replacing the form entry). Back from there goes home.
      const targetId =
        place && typeof place === "object" && "id" in place
          ? (place as { id: string }).id
          : id;
      navigate(`/places/${targetId}`, { replace: true });
    }
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

        <div data-form-error={categories.length === 0 ? "true" : undefined}>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            카테고리 · 种类 *
          </label>
          <PlaceCategoryPicker
            value={categories}
            onChange={setCategories}
            options={builtinCategoryOptions}
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
            happen on the detail page.
            Gated on categories — restaurants force you to pick a place
            category before adding foods, so home mode follows the same
            rule for symmetry. Empty state shows a hint instead of the
            full card so the form still tells the user what's missing. */}
        {mode === "home" && !isEdit && (
          categories.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-rose-200/70 bg-rose-50/30 p-6 text-center">
              <span className="text-3xl block mb-1.5">🍳</span>
              <p className="text-sm font-bold text-rose-500">
                먼저 카테고리를 골라주세요 · 先选个种类吧
              </p>
              <p className="text-[11px] text-rose-400/80 mt-1">
                카테고리를 정하면 메뉴를 추가할 수 있어요 · 选好种类才能加菜单哦
              </p>
            </div>
          ) : (
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
                    coupleId={couple?.id ?? ""}
                    onRemove={() => removeHomeFood(food.uid)}
                    onChangeName={(v) => updateHomeFood(food.uid, "name", v)}
                    onChangeChef={(v) => updateHomeFood(food.uid, "chef", v)}
                    onChangeCategories={(v) =>
                      updateHomeFood(food.uid, "categories", v)
                    }
                    onChangeMemo={(v) => updateHomeFood(food.uid, "memo", v)}
                    onChangeMemoAuthor={(v) =>
                      updateHomeFood(food.uid, "memo_author_id", v)
                    }
                    onChangePhotos={(v) =>
                      updateHomeFood(food.uid, "photo_urls", v)
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
          )
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

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="block text-sm font-bold text-ink-700">
              메모 · 备注
            </label>
            {/* Tag the memo with whichever partner is typing, so detail
                pages render it as a comment from the right person.
                Always mounted (just faded) so IME composition isn't
                disrupted by DOM mutations near the textarea. */}
            <div
              className={`transition-opacity ${memo.trim().length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              <MemoAuthorPicker
                value={memoAuthorId}
                onChange={setMemoAuthorId}
              />
            </div>
          </div>
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

        {/* Save button stays active for valid + invalid alike — onSubmit
            does the validation up front and scrolls to the first
            offending field. The only reason to disable is an in-flight
            mutation, which we want to gate to prevent double-submits. */}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={upsert.isPending || upsertFood.isPending}
        >
          저장 · 保存
        </button>
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
  coupleId,
  onRemove,
  onChangeName,
  onChangeChef,
  onChangeCategories,
  onChangeMemo,
  onChangeMemoAuthor,
  onChangePhotos,
}: {
  index: number;
  food: HomeFoodDraft;
  removable: boolean;
  // PhotoUploader needs the couple id to scope storage paths; passed
  // down because HomeFoodCard is rendered inside the place form
  // before the place row exists.
  coupleId: string;
  onRemove: () => void;
  onChangeName: (v: string) => void;
  // null = "deselected" (user tapped active button to clear). Lets
  // 완제품 dishes be saved with no chef at all.
  onChangeChef: (v: ChefRole | null) => void;
  onChangeCategories: (v: string[]) => void;
  onChangeMemo: (v: string) => void;
  onChangeMemoAuthor: (v: string) => void;
  onChangePhotos: (v: string[]) => void;
}) {
  // A row-level error: the food has a name typed in but no category
  // picked, which would land it in 미분류 on the bulk-insert.
  const incomplete =
    food.name.trim().length > 0 && food.categories.length === 0;
  return (
    <div
      data-form-error={incomplete ? "true" : undefined}
      className="bg-white rounded-2xl p-4 border border-rose-100/70 shadow-soft relative space-y-3"
    >
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
          "❓ 미분류" bucket later. Same dropdown as the standalone food
          form so the picker UX is consistent. */}
      <div>
        <p className="text-[11px] font-bold text-ink-400 mb-1.5">
          종류 · 种类 *
        </p>
        <FoodCategoryDropdown
          value={food.categories}
          onChange={onChangeCategories}
        />
        {incomplete && (
          <p className="text-[11px] text-rose-500 mt-1.5 font-medium">
            종류를 하나 이상 골라주세요 · 请至少选择一个种类
          </p>
        )}
      </div>

      {/* Chef picker — always shown for home foods (including 완제품)
          so the user can optionally credit a chef even on bought
          items. Tapping the active option deselects it (chef=null →
          food has no chef and isn't credited to either side). */}
      <div>
        <p className="text-[11px] font-bold text-ink-400 mb-1.5">
          누가 요리했나요? · 谁掌勺？{" "}
          <span className="font-medium text-ink-300">
            (선택 안 해도 돼요 · 可不选)
          </span>
        </p>
        <div className="flex gap-1 bg-cream-50 p-1 rounded-xl border border-cream-100">
          <ChefButton
            active={food.chef === "me"}
            onClick={() =>
              onChangeChef(food.chef === "me" ? null : "me")
            }
            tone="peach"
            icon={<User className="w-3.5 h-3.5" />}
            labelKo="내가!"
            labelZh="本大厨"
          />
          <ChefButton
            active={food.chef === "partner"}
            onClick={() =>
              onChangeChef(food.chef === "partner" ? null : "partner")
            }
            tone="rose"
            icon={<User className="w-3.5 h-3.5" />}
            labelKo="짝꿍!"
            labelZh="宝宝"
          />
          <ChefButton
            active={food.chef === "together"}
            onClick={() =>
              onChangeChef(food.chef === "together" ? null : "together")
            }
            tone="amber"
            icon={<Users className="w-3.5 h-3.5" />}
            labelKo="같이!"
            labelZh="一起做"
          />
        </div>
      </div>

      {/* Per-menu memo. Optional — short note about how it turned out
          ("육수 좀 더 줄였어야"). Submitted to the foods row alongside
          the bulk-insert.
          The author picker stays mounted even when the memo is empty
          so iOS Safari's Chinese/Korean IME doesn't see the DOM near
          the textarea mutate mid-composition (which used to clobber
          the in-progress input — felt like a sudden refresh). */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <p className="text-[11px] font-bold text-ink-400">메모 · 备注</p>
          <div
            className={`transition-opacity ${food.memo.trim().length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <MemoAuthorPicker
              value={food.memo_author_id}
              onChange={onChangeMemoAuthor}
            />
          </div>
        </div>
        <textarea
          className="input-base min-h-[60px] text-[13px]"
          value={food.memo}
          onChange={(e) => onChangeMemo(e.target.value)}
          placeholder="간 좀 더 강하게 · 下次咸点"
        />
      </div>

      {/* Per-menu photos / videos. Up to 3 to keep the home-mode card
          from getting tall — full gallery still lives on the place
          detail page after submit. */}
      <div>
        <p className="text-[11px] font-bold text-ink-400 mb-1.5">
          사진 · 동영상 · 照片视频
        </p>
        {coupleId ? (
          <PhotoUploader
            coupleId={coupleId}
            photos={food.photo_urls}
            onChange={onChangePhotos}
            max={3}
          />
        ) : (
          <p className="text-[11px] text-ink-400">
            저장 후 사진을 올릴 수 있어요 · 保存后再添加照片
          </p>
        )}
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

// Composed category picker: GroupedMultiSelect for built-in cuisine
// types + a separate text input for freeform "직접 입력" tags. Kept
// here instead of in components/ because the freeform-text wrinkle is
// specific to forms — the timeline filter doesn't allow freeform.
function PlaceCategoryPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: GroupedMultiSelectEntry[];
}) {
  const builtInSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of options) {
      if ("groupLabel" in e) {
        for (const o of e.options) set.add(o.value);
      } else {
        set.add(e.value);
      }
    }
    return set;
  }, [options]);

  const builtIns = value.filter((v) => builtInSet.has(v));
  const customs = value.filter((v) => !builtInSet.has(v));

  const [draft, setDraft] = useState("");

  function handleBuiltInChange(next: string[]) {
    // Preserve any custom entries the user typed earlier so dropdown
    // changes don't wipe them.
    onChange([...next, ...customs]);
  }

  function addCustom() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function removeCustom(c: string) {
    onChange(value.filter((v) => v !== c));
  }

  return (
    <div className="space-y-2">
      <GroupedMultiSelect
        title="카테고리 · 种类"
        placeholder="카테고리 선택 · 选择类别"
        options={options}
        value={builtIns}
        onChange={handleBuiltInChange}
      />

      {builtIns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {builtIns.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-peach-100 text-peach-500 text-[11px] font-bold border border-peach-200/70"
            >
              <CategoryChipLabel value={v} options={options} />
              <span className="text-ink-400 hover:text-rose-500">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          maxLength={40}
          placeholder="✏️ 직접 입력 · 自定义"
          className="input-base flex-1 text-[12px] py-2"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!draft.trim()}
          className="px-3 py-2 rounded-xl bg-cream-100 text-ink-700 text-[12px] font-bold hover:bg-cream-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          추가 · 添加
        </button>
      </div>

      {customs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customs.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => removeCustom(c)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cream-100 text-ink-700 text-[11px] font-bold border border-cream-200"
            >
              ✏️ {c}
              <span className="text-ink-400 hover:text-rose-500">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChipLabel({
  value,
  options,
}: {
  value: string;
  options: GroupedMultiSelectEntry[];
}) {
  for (const e of options) {
    if ("groupLabel" in e) {
      const hit = e.options.find((o) => o.value === value);
      if (hit) {
        return (
          <span>
            {hit.emoji ? `${hit.emoji} ` : ""}
            {hit.label}
          </span>
        );
      }
    } else if (e.value === value) {
      return (
        <span>
          {e.emoji ? `${e.emoji} ` : ""}
          {e.label}
        </span>
      );
    }
  }
  return <span>{value}</span>;
}

// Inline food-category dropdown used by the home-mode HomeFoodCard.
// Shares the same widget as the standalone FoodFormPage so the picker
// looks identical wherever the user is logging a dish.
//
// Home mode adds the 완제품 cluster on top of the default food types.
// (We used to also expose "by_me / by_partner" here, but those
// duplicated the chef toggle and confusingly didn't actually populate
// foods.chef — pulled out in favor of the toggle being the single
// source of truth for "who cooked this".)
function FoodCategoryDropdown({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const options = useMemo<GroupedMultiSelectEntry[]>(
    () => [
      // Default food types render flat at the top so the most common
      // taps (메인 / 사이드 / 디저트…) stay one click away.
      ...FOOD_CATEGORIES.map((c) => ({
        value: c,
        label: t(`category.${c}`),
        emoji: categoryEmojiOf(c),
      })),
      {
        groupLabel: "📦 완제품 · 成品",
        options: PREMADE_FOOD_CATEGORIES.map((c) => ({
          value: c,
          label: t(`category.${c}`),
          emoji: categoryEmojiOf(c),
        })),
      },
    ],
    [t]
  );
  return (
    <GroupedMultiSelect
      title="카테고리 · 种类"
      placeholder="종류 선택 · 选择种类"
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
