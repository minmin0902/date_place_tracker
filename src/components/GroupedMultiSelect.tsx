import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

// Grouped multi-select with clickable group headers.
//
// Replaces the native <select>+<optgroup> dropdown the timeline filter
// used. The OS renders <optgroup> labels as non-tappable, so users had
// no way to "give me everything 아시안" without picking categories one
// by one. This widget lifts the group label into a tri-state checkbox
// (off / partial / all) so tapping the header bulk-toggles its
// children. Children themselves remain individually toggleable.
//
// Same component is reused on the place / food forms so the picker
// looks identical everywhere — keeps cognitive load low.

export type FlatOption = {
  value: string;
  label: string;
  emoji?: string;
};

export type GroupedOption = {
  groupLabel: string;
  options: FlatOption[];
};

export type GroupedMultiSelectEntry = FlatOption | GroupedOption;

function isGroup(e: GroupedMultiSelectEntry): e is GroupedOption {
  return (e as GroupedOption).groupLabel != null;
}

export function GroupedMultiSelect({
  options,
  value,
  onChange,
  placeholder = "전체 · 全部",
  triggerClassName,
  title,
  emptyHint,
}: {
  options: GroupedMultiSelectEntry[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  triggerClassName?: string;
  // Modal title; fall back to placeholder if unset.
  title?: string;
  // Helper line under the title (e.g. for forms requiring a pick).
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);

  // Lookup of value → label so the trigger summary doesn't have to
  // walk the grouped tree on every render.
  const labelByValue = useMemo(() => {
    const out = new Map<string, FlatOption>();
    for (const e of options) {
      if (isGroup(e)) {
        for (const o of e.options) out.set(o.value, o);
      } else {
        out.set(e.value, e);
      }
    }
    return out;
  }, [options]);

  // Lock body scroll while modal is open so the underlying page doesn't
  // jump when the user scrolls within the picker.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleOne(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  function setGroupAll(group: GroupedOption, on: boolean) {
    const groupValues = new Set(group.options.map((o) => o.value));
    if (on) {
      // Add any group children that aren't already selected.
      const merged = new Set(value);
      for (const v of groupValues) merged.add(v);
      onChange([...merged]);
    } else {
      // Remove every group child from the selection.
      onChange(value.filter((v) => !groupValues.has(v)));
    }
  }

  // Trigger summary: show a compact label that gives the user a sense
  // of the active selection without overflowing on narrow screens.
  let summary: string;
  if (value.length === 0) {
    summary = placeholder;
  } else {
    // Detect "entire group selected" case for a cleaner label.
    const groupHits: GroupedOption[] = [];
    for (const e of options) {
      if (!isGroup(e)) continue;
      const allIn = e.options.every((o) => value.includes(o.value));
      const anyExtra = value.some(
        (v) => !e.options.some((o) => o.value === v)
      );
      if (allIn && !anyExtra && value.length === e.options.length) {
        groupHits.push(e);
      }
    }
    if (groupHits.length === 1) {
      summary = groupHits[0].groupLabel;
    } else if (value.length === 1) {
      const o = labelByValue.get(value[0]);
      summary = o ? `${o.emoji ?? ""}${o.emoji ? " " : ""}${o.label}` : value[0];
    } else {
      const first = labelByValue.get(value[0]);
      const firstLabel = first
        ? `${first.emoji ?? ""}${first.emoji ? " " : ""}${first.label}`
        : value[0];
      summary = `${firstLabel} 외 ${value.length - 1}`;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "w-full bg-white border border-cream-200/80 rounded-xl pl-3 pr-8 py-2.5 text-[12px] font-bold text-ink-700 shadow-sm focus:outline-none transition appearance-none truncate text-left relative"
        }
      >
        <span className="block truncate">{summary}</span>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
        {value.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-peach-400 text-white font-number text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center shadow-sm">
            {value.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-cream-200 animate-in slide-in-from-bottom-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200">
              <div className="min-w-0">
                <h3 className="font-bold text-ink-900 text-base break-keep">
                  {title ?? placeholder}
                </h3>
                {emptyHint && (
                  <p className="text-[11px] text-ink-500 mt-0.5 break-keep">
                    {emptyHint}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-cream-100 transition flex-shrink-0"
                aria-label="close"
              >
                <X className="w-4 h-4 text-ink-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {options.map((entry, idx) => {
                if (!isGroup(entry)) {
                  // Top-level flat option (e.g. "미분류" sentinel).
                  const checked = value.includes(entry.value);
                  return (
                    <CheckboxRow
                      key={entry.value}
                      label={entry.label}
                      emoji={entry.emoji}
                      state={checked ? "on" : "off"}
                      onClick={() => toggleOne(entry.value)}
                      bold
                    />
                  );
                }
                const allOn = entry.options.every((o) =>
                  value.includes(o.value)
                );
                const anyOn = entry.options.some((o) =>
                  value.includes(o.value)
                );
                const headerState: "on" | "partial" | "off" = allOn
                  ? "on"
                  : anyOn
                    ? "partial"
                    : "off";
                return (
                  <div
                    key={`g-${idx}`}
                    className="rounded-2xl border border-cream-200 overflow-hidden"
                  >
                    <CheckboxRow
                      label={entry.groupLabel}
                      state={headerState}
                      onClick={() => setGroupAll(entry, !allOn)}
                      bold
                      tone="header"
                    />
                    <div className="bg-cream-50/40 border-t border-cream-100">
                      {entry.options.map((o) => {
                        const checked = value.includes(o.value);
                        return (
                          <CheckboxRow
                            key={o.value}
                            label={o.label}
                            emoji={o.emoji}
                            state={checked ? "on" : "off"}
                            onClick={() => toggleOne(o.value)}
                            indent
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-cream-200 px-4 py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={value.length === 0}
                className="text-[12px] font-bold text-ink-500 hover:text-ink-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                전체 해제 · 清空
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-ink-900 text-white rounded-xl text-[12px] font-bold hover:bg-ink-700 transition"
              >
                완료 · 完成 ({value.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Tri-state checkbox row. The "partial" state visualizes "some but not
// all children of this group are selected" — a hint that tapping the
// header will fill the rest.
function CheckboxRow({
  label,
  emoji,
  state,
  onClick,
  bold,
  indent,
  tone,
}: {
  label: string;
  emoji?: string;
  state: "on" | "off" | "partial";
  onClick: () => void;
  bold?: boolean;
  indent?: boolean;
  tone?: "header";
}) {
  const box =
    state === "on"
      ? "bg-peach-400 border-peach-400 text-white"
      : state === "partial"
        ? "bg-peach-100 border-peach-300 text-peach-500"
        : "bg-white border-cream-200 text-transparent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 ${
        indent ? "pl-7 pr-3" : "px-3"
      } py-2.5 text-left transition ${
        tone === "header" ? "bg-white hover:bg-cream-50" : "hover:bg-cream-50"
      }`}
    >
      <span
        className={`flex-shrink-0 w-4 h-4 rounded border-[1.5px] inline-flex items-center justify-center text-[10px] font-bold ${box}`}
      >
        {state === "on" ? "✓" : state === "partial" ? "—" : ""}
      </span>
      {emoji && <span className="text-base flex-shrink-0">{emoji}</span>}
      <span
        className={`text-[12px] break-keep min-w-0 truncate flex-1 ${
          bold ? "font-bold text-ink-900" : "font-medium text-ink-700"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
