import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookmarkPlus, ChefHat, Utensils } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCouple } from "@/hooks/useCouple";
import { useAddWishlist } from "@/hooks/useWishlist";
import { PageHeader } from "@/components/PageHeader";
import { LocationPicker } from "@/components/LocationPicker";
import { PhotoUploader } from "@/components/PhotoUploader";
import { type GroupedMultiSelectEntry } from "@/components/GroupedMultiSelect";
import { PlaceCategoryPicker } from "@/components/PlaceCategoryPicker";
import { CATEGORY_GROUPS, categoryEmojiOf } from "@/lib/constants";
import type { WishlistKind } from "@/lib/database.types";

export default function WishlistFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: couple } = useCouple();
  const add = useAddWishlist();

  // Top-level kind toggle. Restaurant = the existing location-anchored
  // wishlist; recipe = a "want to cook this later" entry that drops the
  // location fields and adds recipe text + screenshots.
  const [kind, setKind] = useState<WishlistKind>("restaurant");
  const isRecipe = kind === "recipe";

  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [recipeText, setRecipeText] = useState("");
  const [recipePhotos, setRecipePhotos] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Same grouped picker shape as PlaceFormPage so the dropdown looks
  // identical. Wishlist persists a single category, so we run the
  // multi-select in singleSelect mode and keep the wrapper data shape.
  const categoryOptions = useMemo<GroupedMultiSelectEntry[]>(() => {
    return CATEGORY_GROUPS.map((g) => ({
      groupLabel: `${g.ko} · ${g.zh}`,
      options: g.keys.map((c) => ({
        value: c,
        label: t(`category.${c}`),
        emoji: categoryEmojiOf(c),
      })),
    }));
  }, [t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!couple || !name.trim()) return;
    setErr(null);
    try {
      await add.mutateAsync({
        coupleId: couple.id,
        kind,
        name: name.trim(),
        categories,
        memo: memo.trim() || null,
        // Restaurant carries location/address; recipe leaves both null
        // so the columns stay clean rather than holding stale strings.
        address: isRecipe ? null : address.trim() || null,
        latitude: isRecipe ? null : coord?.lat ?? null,
        longitude: isRecipe ? null : coord?.lng ?? null,
        recipe_text: isRecipe ? recipeText.trim() || null : null,
        recipe_photo_urls:
          isRecipe && recipePhotos.length > 0 ? recipePhotos : null,
      });
      navigate(-1);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader title="위시리스트 · 种草清单" back />
      <form onSubmit={onSubmit} className="px-5 space-y-5 pb-6">
        {/* Kind toggle — same visual language as PlaceFormPage's
            외식/집밥 segmented control. Restaurant on the left
            (default), recipe on the right. */}
        <div className="flex bg-white rounded-2xl border border-cream-200 p-1.5 shadow-soft">
          <KindButton
            active={!isRecipe}
            onClick={() => setKind("restaurant")}
            tone="peach"
            icon={<Utensils className="w-4 h-4" />}
            labelKo="식당"
            labelZh="餐厅"
          />
          <KindButton
            active={isRecipe}
            onClick={() => setKind("recipe")}
            tone="rose"
            icon={<ChefHat className="w-4 h-4" />}
            labelKo="레시피"
            labelZh="食谱"
          />
        </div>

        {!isRecipe && (
          <div>
            <label className="block text-sm font-bold mb-1.5 text-ink-700">
              {t("place.location")}
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

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            {isRecipe ? "레시피 이름 · 食谱名 *" : "이름 · 店名 *"}
          </label>
          <input
            className="input-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              isRecipe
                ? "예) 할머니의 김치찌개 · 例：奶奶的泡菜汤"
                : "예) 남산 뷰 카페 · 例：南山景观咖啡"
            }
            required
          />
        </div>

        {!isRecipe && (
          <div>
            <label className="block text-sm font-bold mb-1.5 text-ink-700">
              {t("place.address")}
            </label>
            <input
              className="input-base"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("place.addressPh")}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            {t("place.category")}
          </label>
          <PlaceCategoryPicker
            value={categories}
            onChange={setCategories}
            options={categoryOptions}
          />
        </div>

        {/* Recipe-only fields — same shape FoodFormPage uses for its
            recipe section, so the wishlist→detail flow can carry the
            same data forward later. Both fields optional: text-only,
            screenshots-only, or both. */}
        {isRecipe && (
          <>
            <div>
              <label className="block text-sm font-bold mb-1.5 text-ink-700">
                📒 레시피 · 食谱
              </label>
              <textarea
                className="input-base min-h-[100px]"
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                placeholder="예) 양파 1개 다지고… · 例：洋葱切丁，热油爆香…"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5 text-ink-700">
                레시피 스크린샷 · 食谱截图
              </label>
              {couple ? (
                <PhotoUploader
                  coupleId={couple.id}
                  photos={recipePhotos}
                  onChange={setRecipePhotos}
                />
              ) : (
                <p className="text-[11px] text-ink-400">
                  잠시 후 다시 시도해주세요 · 请稍后重试
                </p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            메모 · 备注
          </label>
          <textarea
            className="input-base min-h-[70px]"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={
              isRecipe
                ? "어디서 봤는지 / 한 줄 평 · 哪儿看到的 / 一句话点评"
                : "인스타에서 봤음! · 在小红书上看到的"
            }
          />
        </div>

        {err && <p className="text-xs text-rose-500 break-words">{err}</p>}

        <button
          type="submit"
          disabled={!name.trim() || add.isPending}
          className="btn-primary w-full"
        >
          <BookmarkPlus className="w-5 h-5" />
          저장 · 存起来
        </button>
      </form>
    </div>
  );
}

// Same visual shape as PlaceFormPage's ModeButton — copied here
// instead of imported because the tone palette differs (peach/rose
// instead of peach/rose toggling for out/home) and the file lives
// next to a single consumer.
function KindButton({
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
