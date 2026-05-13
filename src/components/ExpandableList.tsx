import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Caps a long list at `initial` items and surfaces a "더보기" button
// to reveal the rest in-place. Used wherever rendering a full list
// up front would force every row to mount (and reconcile / paint) on
// initial entry — most notably HomePage's grid/menu layouts and
// ComparePage's fame/clash/pass sections.
//
// For lists that can grow unbounded (HomePage's timeline view), pair
// with virtualization instead — see VirtualTimeline in HomePage.tsx.
// This component is the simpler choice when the expected total is
// modest (~5-100 items) and the row is heavy enough that lazy-mount
// matters but virtual scrolling is overkill.
export function ExpandableList<T>({
  items,
  initial = 5,
  children,
  expandLabelZh,
}: {
  items: T[];
  initial?: number;
  children: (item: T, index: number) => ReactNode;
  // Optional override for the Chinese label suffix — most callers
  // want "还有 N개" but a couple of places want different wording.
  expandLabelZh?: (hidden: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initial);
  const hiddenCount = items.length - initial;
  return (
    <>
      {visible.map((item, idx) => children(item, idx))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full mt-2 py-2.5 rounded-2xl border border-cream-200 bg-white text-[12px] font-bold text-ink-700 hover:bg-cream-50 transition flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>
              접기 · 收起
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </>
          ) : (
            <>
              더보기 ·{" "}
              {expandLabelZh
                ? expandLabelZh(hiddenCount)
                : `还有 ${hiddenCount}개`}
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </>
  );
}
