import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChefHat, Heart, Utensils } from "lucide-react";
import { useCouple } from "@/hooks/useCouple";
import { useAuth } from "@/hooks/useAuth";
import { usePlace, useUpsertPlace } from "@/hooks/usePlaces";
import { fetchWishlistItem, useDeleteWishlist } from "@/hooks/useWishlist";
import { useFormDraft } from "@/hooks/useDraft";
import { PageHeader } from "@/components/PageHeader";
import { type GroupedMultiSelectEntry } from "@/components/GroupedMultiSelect";
import { PlaceCategoryPicker } from "@/components/PlaceCategoryPicker";
import { PhotoUploader } from "@/components/PhotoUploader";
import { MemoAuthorPicker } from "@/components/MemoAuthorPicker";
import { LocationPicker } from "@/components/LocationPicker";
import { CATEGORY_GROUPS, categoryEmojiOf } from "@/lib/constants";
import { useTranslation } from "react-i18next";
import { getCategories } from "@/lib/utils";

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

  // 'out' = 외식 (locationpicker + address) / 'home' = 집밥. Both modes
  // save metadata only; per-menu entry goes through FoodFormPage from
  // the place detail page after save.
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
    },
  });

  // Prefill from a wishlist item when user clicked "다녀왔어요" /
  // "만들어봤어요". Recipe-kind wishlist promotions auto-flip to home
  // mode so the form lands on the right shape without an extra tap;
  // the recipe text + screenshots stay on the wishlist row until save
  // (where the wishlist gets deleted) — the user can copy them into
  // a food on the new place's detail page.
  useEffect(() => {
    if (isEdit || !fromWishlistId) return;
    let cancelled = false;
    void fetchWishlistItem(fromWishlistId).then((w) => {
      if (cancelled || !w) return;
      if (w.kind === "recipe") setMode("home");
      setName(w.name);
      if (w.categories && w.categories.length > 0) {
        setCategories(w.categories);
      } else if (w.category) {
        setCategories([w.category]);
      }
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
      // Wishlist-promoted out-mode entries land directly on the menu
      // add screen — the "다녀왔어요" flow continues straight into
      // logging what the couple ate. Home mode already bulk-creates
      // its menus above, so it skips this and goes to the detail
      // page. Edit mode also falls through.
      const goToFoodNew = !!fromWishlistId && !isHome;
      // state.justCreated suppresses the place-level memo composer on
      // arrival so a brand-new record doesn't open with an empty
      // "메모 달기…" box. Subsequent navigations to /places/<id>
      // (timeline taps, deep links) carry no state → composer back.
      navigate(
        goToFoodNew
          ? `/places/${targetId}/foods/new`
          : `/places/${targetId}`,
        { replace: true, state: { justCreated: true } }
      );
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

        <div data-form-error={!name.trim() ? "true" : undefined}>
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
          {!name.trim() && (
            <p className="text-[11px] text-rose-500 mt-1.5 font-medium">
              {mode === "home"
                ? "식탁 이름을 적어주세요 · 给这顿饭起个名吧"
                : "상호명을 적어주세요 · 请输入店名"}
            </p>
          )}
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
          disabled={upsert.isPending}
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


