import { useMemo, useState } from "react";
import {
  GroupedMultiSelect,
  type GroupedMultiSelectEntry,
} from "@/components/GroupedMultiSelect";

// Composed category picker: GroupedMultiSelect for built-in cuisine
// types + a separate text input for freeform "직접 입력" tags. Shared
// by PlaceFormPage / WishlistFormPage so the picker UX matches across
// every "log a place / wishlist this" surface — multi-select with
// optional custom tags.
//
// The freeform-text wrinkle is form-only; the homepage timeline filter
// uses GroupedMultiSelect directly without this wrapper.
export function PlaceCategoryPicker({
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
        const ko = hit.label.split(" · ")[0];
        return (
          <span>
            {hit.emoji ? `${hit.emoji} ` : ""}
            {ko}
          </span>
        );
      }
    } else if (e.value === value) {
      const ko = e.label.split(" · ")[0];
      return (
        <span>
          {e.emoji ? `${e.emoji} ` : ""}
          {ko}
        </span>
      );
    }
  }
  return <span>{value}</span>;
}
