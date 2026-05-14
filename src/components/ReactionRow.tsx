import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import {
  QUICK_REACTIONS,
  summarize,
  useReactions,
  useToggleReaction,
} from "@/hooks/useReactions";
import { useReactionBatch } from "@/hooks/useReactionBatch";
import type { ReactionTarget } from "@/lib/database.types";

// Instagram-style reaction strip that lives directly under a memo /
// caption. Shows existing reactions as pill bubbles ("❤️ 2") and a
// trailing "+" button that pops the quick-react palette so adding a
// new emoji is one extra tap. Tapping a bubble you've already used
// removes your reaction.
//
// Two data paths:
//   - Inside a <ReactionProvider> (PlaceDetailPage tree): reads the
//     pre-bucketed slice from context. One bulk fetch covers every
//     reaction on the page → no per-row HTTP.
//   - Outside any provider: falls back to a per-target useReactions
//     query. Used by surfaces that don't have the place context yet
//     (e.g. compare/list pages that may surface a single memo).
//
// Wrapped in React.memo so an unrelated parent re-render (a sibling
// memo posting, a profile refetch, etc.) doesn't cascade through
// every reaction strip on the page.
function ReactionRowImpl({
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
  const batch = useReactionBatch();
  // Per-target query is enabled only when no batch provider exists.
  // Passing null short-circuits the hook so we don't fire duplicate
  // HTTP for rows already covered by the bulk fetch.
  const fallback = useReactions(batch ? null : target);
  const toggle = useToggleReaction();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Anchor + palette refs. paletteAnchorRef is the wrapper around the
  // "+" button; paletteRef is the popover itself. Used by the
  // outside-tap effect to dismiss the picker when the user taps
  // anywhere else (most users won't pointer-leave on touch).
  const paletteAnchorRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const keyboardEmojiInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (
        paletteAnchorRef.current?.contains(t) ||
        paletteRef.current?.contains(t)
      ) {
        return;
      }
      setPaletteOpen(false);
    }
    // pointerdown over click — fires before the next tap can register
    // anything else (e.g. a thread memo button below). Capture phase
    // so React's bubble-phase handlers on inner elements still run.
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [paletteOpen]);

  const rows = batch ? batch.getFor(target) : (fallback.data ?? []);
  const summary = useMemo(() => summarize(rows, user?.id), [rows, user?.id]);

  if (!user || !couple) return null;

  const isSm = size === "sm";
  const pillBase = isSm
    ? "px-1.5 py-0.5 text-[11px] gap-1"
    : "px-2 py-0.5 text-[12px] gap-1";
  const quickButton = isSm ? "w-7 h-7 text-base" : "w-8 h-8 text-lg";
  const justify = align === "end" ? "justify-end" : "justify-start";

  function closePalette() {
    setPaletteOpen(false);
  }

  function onTapEmoji(emoji: string, existingId: string | null) {
    if (!couple || !user) return;
    if (toggle.isPending) return;
    closePalette();
    void toggle.mutateAsync({
      coupleId: couple.id,
      userId: user.id,
      target,
      emoji,
      existingId,
      // When the provider is mounted we pass placeId through so the
      // mutation can keep the bulk cache in sync optimistically.
      placeId: batch?.placeId ?? null,
    });
  }

  function isEmojiSegment(segment: string) {
    return /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}]|\p{Emoji}\uFE0F/u.test(
      segment
    );
  }

  function firstEmojiGrapheme(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const segmenter = (
      Intl as typeof Intl & {
        Segmenter?: new (
          locale?: string,
          options?: { granularity: "grapheme" }
        ) => {
          segment(input: string): Iterable<{ segment: string }>;
        };
      }
    ).Segmenter;
    if (segmenter) {
      for (const { segment } of new segmenter(undefined, {
        granularity: "grapheme",
      }).segment(trimmed)) {
        if (isEmojiSegment(segment)) return segment;
      }
      return null;
    }
    return Array.from(trimmed).find(isEmojiSegment) ?? null;
  }

  function onKeyboardEmojiBeforeInput(e: FormEvent<HTMLInputElement>) {
    const inputEvent = e.nativeEvent as InputEvent;
    const data = inputEvent.data;
    if (data && !firstEmojiGrapheme(data)) e.preventDefault();
  }

  function onKeyboardEmojiChange(input: HTMLInputElement) {
    const emoji = firstEmojiGrapheme(input.value);
    if (!emoji) {
      input.value = "";
      return;
    }
    input.value = "";
    const cur = summary.find((s) => s.emoji === emoji);
    onTapEmoji(emoji, cur?.mineId ?? null);
  }

  function onKeyboardEmojiPaste(e: ClipboardEvent<HTMLInputElement>) {
    const emoji = firstEmojiGrapheme(e.clipboardData.getData("text"));
    if (!emoji) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const cur = summary.find((s) => s.emoji === emoji);
    onTapEmoji(emoji, cur?.mineId ?? null);
  }

  function onKeyboardEmojiCompositionEnd(
    e: CompositionEvent<HTMLInputElement>
  ) {
    onKeyboardEmojiChange(e.currentTarget);
  }

  function onKeyboardEmojiInput(e: ChangeEvent<HTMLInputElement>) {
    onKeyboardEmojiChange(e.currentTarget);
  }

  function onKeyboardEmojiDrop(e: DragEvent<HTMLInputElement>) {
    e.preventDefault();
  }

  function onKeyboardEmojiKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (
      e.key.length === 1 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !firstEmojiGrapheme(e.key)
    ) {
      e.preventDefault();
    }
  }

  function openKeyboardEmojiInput() {
    const input = keyboardEmojiInputRef.current;
    if (!input) return;
    input.value = "";
    input.focus({ preventScroll: true });
  }

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
      <div className="relative" ref={paletteAnchorRef}>
        <button
          type="button"
          onClick={() => {
            setPaletteOpen((v) => !v);
          }}
          disabled={toggle.isPending}
          className={`inline-flex items-center rounded-full border border-cream-200 bg-white text-ink-400 hover:text-peach-500 hover:bg-cream-50 transition active:scale-95 ${
            isSm ? "px-1.5 py-0.5" : "px-2 py-0.5"
          }`}
          aria-label="add reaction"
          aria-expanded={paletteOpen}
        >
          <Plus className={isSm ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
        {paletteOpen && (
          <div
            ref={paletteRef}
            className={`absolute z-30 mt-1 ${
              align === "end" ? "right-0" : "left-0"
            } rounded-full bg-white border border-cream-200 p-1 shadow-lg`}
          >
            <div className="flex items-center gap-0.5">
              {QUICK_REACTIONS.map((emoji) => {
                const cur = summary.find((s) => s.emoji === emoji);
                const mineId = cur?.mineId ?? null;
                const mine = !!mineId;
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onTapEmoji(emoji, mineId)}
                    className={`${quickButton} rounded-full flex items-center justify-center transition active:scale-90 ${
                      mine ? "bg-peach-100" : "hover:bg-cream-50"
                    }`}
                    aria-label={emoji}
                    aria-pressed={mine}
                  >
                    <span className="leading-none">{emoji}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={openKeyboardEmojiInput}
                className={`${quickButton} rounded-full flex items-center justify-center text-ink-400 hover:text-peach-500 hover:bg-cream-50 transition active:scale-90`}
                aria-label="keyboard emoji"
              >
                <Plus className={isSm ? "w-4 h-4" : "w-5 h-5"} />
              </button>
            </div>
            <input
              ref={keyboardEmojiInputRef}
              onBeforeInput={onKeyboardEmojiBeforeInput}
              onChange={onKeyboardEmojiInput}
              onCompositionEnd={onKeyboardEmojiCompositionEnd}
              onPaste={onKeyboardEmojiPaste}
              onDrop={onKeyboardEmojiDrop}
              onKeyDown={onKeyboardEmojiKeyDown}
              inputMode="text"
              maxLength={16}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="emoji reaction input"
              className="fixed bottom-0 left-0 h-px w-px opacity-0"
              style={{ fontSize: 16 }}
              tabIndex={-1}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// memo with a custom comparator: target objects come in fresh per
// render at the call sites (we build {kind, id} inline), so a
// reference-equality memo would never hit. Compare on (kind, id, size,
// align) — everything that visibly affects render.
export const ReactionRow = memo(
  ReactionRowImpl,
  (prev, next) =>
    prev.target.kind === next.target.kind &&
    prev.target.id === next.target.id &&
    prev.size === next.size &&
    prev.align === next.align
);
