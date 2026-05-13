import { useMemo, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import {
  QUICK_REACTIONS,
  summarize,
  useReactions,
  useToggleReaction,
} from "@/hooks/useReactions";
import type { ReactionTarget } from "@/lib/database.types";

// Instagram-style reaction strip that lives directly under a memo /
// caption. Shows existing reactions as pill bubbles ("❤️ 2") and a
// trailing "+" button that pops the quick-react palette so adding a
// new emoji is one extra tap. Tapping a bubble you've already used
// removes your reaction.
//
// Polymorphic — `target` is one of memo / place caption / food caption.
// The hook resolves which FK column to write.
export function ReactionRow({
  target,
  size = "md",
  align = "start",
}: {
  target: ReactionTarget;
  size?: "sm" | "md";
  // Whether to align the row to the start or end of its parent. Memo
  // captions read left-aligned; some compact callers may prefer end.
  align?: "start" | "end";
}) {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const reactionsQ = useReactions(target);
  const toggle = useToggleReaction();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Close-on-outside-click ref. We don't use a portal — the palette
  // is small enough to live inline next to the "+" button without
  // running off the screen edge in any realistic layout.
  const paletteRef = useRef<HTMLDivElement | null>(null);

  const rows = reactionsQ.data ?? [];
  const summary = useMemo(() => summarize(rows, user?.id), [rows, user?.id]);

  if (!user || !couple) return null;

  const isSm = size === "sm";
  const pillBase = isSm
    ? "px-1.5 py-0.5 text-[11px] gap-1"
    : "px-2 py-0.5 text-[12px] gap-1";
  const justify = align === "end" ? "justify-end" : "justify-start";

  function onTapEmoji(emoji: string, existingId: string | null) {
    if (!couple || !user) return;
    if (toggle.isPending) return;
    setPaletteOpen(false);
    void toggle.mutateAsync({
      coupleId: couple.id,
      userId: user.id,
      target,
      emoji,
      existingId,
    });
  }

  // Hide a fully empty row's "+" trigger on tiny sm layouts so a memo
  // with zero reactions doesn't grow taller than it has to. Tapping
  // the parent comment's [😀] icon (added in MemoThread) will surface
  // the palette via paletteOpen there if needed; for the standalone
  // case we always show the small smile button.
  const hasAny = summary.length > 0;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${justify}`}>
      {summary.map((s) => {
        const mine = !!s.mineId;
        return (
          <button
            key={s.emoji}
            type="button"
            onClick={() => onTapEmoji(s.emoji, s.mineId)}
            disabled={toggle.isPending}
            className={`inline-flex items-center rounded-full border transition active:scale-95 ${pillBase} ${
              mine
                ? "bg-peach-50 border-peach-200 text-peach-700"
                : "bg-white border-cream-200 text-ink-600 hover:bg-cream-50"
            }`}
            aria-pressed={mine}
            aria-label={`${s.emoji} ${s.count}`}
          >
            <span className="leading-none">{s.emoji}</span>
            <span className="font-number font-bold">{s.count}</span>
          </button>
        );
      })}
      <div className="relative" ref={paletteRef}>
        <button
          type="button"
          onClick={() => setPaletteOpen((v) => !v)}
          disabled={toggle.isPending}
          className={`inline-flex items-center rounded-full border border-cream-200 bg-white text-ink-400 hover:text-peach-500 hover:bg-cream-50 transition active:scale-95 ${
            isSm ? "px-1.5 py-0.5" : "px-2 py-0.5"
          }`}
          aria-label="add reaction"
          aria-expanded={paletteOpen}
        >
          {hasAny ? (
            <span className={`leading-none ${isSm ? "text-[11px]" : "text-[12px]"}`}>+</span>
          ) : (
            <Smile className={isSm ? "w-3 h-3" : "w-3.5 h-3.5"} />
          )}
        </button>
        {paletteOpen && (
          <div
            className={`absolute z-30 mt-1 ${align === "end" ? "right-0" : "left-0"} bg-white border border-cream-200 rounded-full shadow-lg flex items-center gap-0.5 p-1`}
            // Click-outside on the next render cycle would need a
            // useEffect listener — for this transient palette we just
            // close after a pick or when the user re-taps the +.
            onPointerLeave={() => setPaletteOpen(false)}
          >
            {QUICK_REACTIONS.map((emoji) => {
              const cur = summary.find((s) => s.emoji === emoji);
              const mineId = cur?.mineId ?? null;
              const mine = !!mineId;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onTapEmoji(emoji, mineId)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition active:scale-90 ${
                    mine ? "bg-peach-100" : "hover:bg-cream-50"
                  }`}
                  aria-label={emoji}
                  aria-pressed={mine}
                >
                  <span className="leading-none">{emoji}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
