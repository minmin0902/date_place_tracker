import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookmarkPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCouple } from "@/hooks/useCouple";
import { useAddWishlist } from "@/hooks/useWishlist";
import { PageHeader } from "@/components/PageHeader";
import { LocationPicker } from "@/components/LocationPicker";
import {
  GroupedMultiSelect,
  type GroupedMultiSelectEntry,
} from "@/components/GroupedMultiSelect";
import { CATEGORY_GROUPS, categoryEmojiOf } from "@/lib/constants";

export default function WishlistFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: couple } = useCouple();
  const add = useAddWishlist();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
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
        name: name.trim(),
        category,
        memo: memo.trim() || null,
        address: address.trim() || null,
        latitude: coord?.lat ?? null,
        longitude: coord?.lng ?? null,
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

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            이름 · 店名 *
          </label>
          <input
            className="input-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 남산 뷰 카페 / 例：南山景观咖啡"
            required
          />
        </div>

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

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            {t("place.category")}
          </label>
          <GroupedMultiSelect
            title="카테고리 · 种类"
            placeholder="종류 선택 · 选择种类"
            options={categoryOptions}
            value={category ? [category] : []}
            onChange={(next) => setCategory(next[0] ?? null)}
            singleSelect
            allowEmpty
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1.5 text-ink-700">
            메모 · 备注
          </label>
          <textarea
            className="input-base min-h-[70px]"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="인스타에서 봤음! · 在小红书上看到的"
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
