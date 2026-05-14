import {
  memo,
  useEffect,
  useMemo,
  useState,
} from "react";
import EmojiPicker, {
  EmojiStyle,
  Theme,
  type EmojiClickData,
} from "emoji-picker-react";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import {
  summarize,
  useReactions,
  useToggleReaction,
} from "@/hooks/useReactions";
import { useReactionBatch } from "@/hooks/useReactionBatch";
import type { ReactionTarget } from "@/lib/database.types";

// Instagram-style reaction strip that lives directly under a memo /
// caption. Shows existing reactions as pill bubbles ("❤️ 2") and a
// trailing "+" button that opens a bottom-sheet emoji picker sized
// to the viewport. Tapping a bubble you've already used removes
// your reaction.
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
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [pickerOpen]);

  const rows = batch ? batch.getFor(target) : (fallback.data ?? []);
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
    setPickerOpen(false);
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

  function onPickerEmoji(emojiData: EmojiClickData) {
    const emoji = emojiData.emoji;
    if (!emoji) return;
    const cur = summary.find((s) => s.emoji === emoji);
    onTapEmoji(emoji, cur?.mineId ?? null);
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
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={toggle.isPending}
          className={`inline-flex items-center rounded-full border border-cream-200 bg-white text-ink-400 hover:text-peach-500 hover:bg-cream-50 transition active:scale-95 ${
            isSm ? "px-1.5 py-0.5" : "px-2 py-0.5"
          }`}
          aria-label="add emoji reaction"
          aria-expanded={pickerOpen}
        >
          <Plus className={isSm ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
        {pickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-ink-900/25"
              onClick={() => setPickerOpen(false)}
              aria-label="close emoji picker"
            />
            <div
              className="relative w-full max-w-md rounded-t-3xl border border-cream-200 bg-white shadow-2xl"
              style={{
                paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
              }}
            >
              <div className="flex items-center justify-center px-3 py-2">
                <div
                  className="h-1 w-10 rounded-full bg-cream-200"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="absolute right-3 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-400 transition hover:bg-cream-50 hover:text-ink-700 active:scale-95"
                  aria-label="close emoji picker"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 pb-1">
                <div className="overflow-hidden rounded-2xl border border-cream-100 bg-white">
                  <EmojiPicker
                    width="100%"
                    height="min(66dvh, 30rem)"
                    autoFocusSearch={false}
                    searchDisabled
                    lazyLoadEmojis
                    emojiStyle={EmojiStyle.NATIVE}
                    theme={Theme.LIGHT}
                    previewConfig={{ showPreview: false }}
                    onEmojiClick={onPickerEmoji}
                  />
                </div>
              </div>
            </div>
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
