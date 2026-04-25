import { useMemoAuthor } from "@/hooks/useProfile";

// Tight one-line attribution for places where the full chat-bubble
// would crowd the row. Renders "{author} · {memo}" as a single span;
// callers wrap it in their own truncating <p> tag.
export function MemoCommentInline({
  memo,
  authorId,
  className = "",
}: {
  memo: string;
  authorId: string | null | undefined;
  className?: string;
}) {
  const { name } = useMemoAuthor(authorId);
  return (
    <span className={className}>
      <span className="font-bold text-ink-700">{name}</span>
      <span className="text-ink-400 mx-1">·</span>
      <span>{memo}</span>
    </span>
  );
}

// Comment-style memo display — small avatar on the left, author name +
// memo text on the right, in a chat-bubble shape. Drop-in for the
// previous "<div className='card'>{memo}</div>" pattern, used wherever
// places.memo / foods.memo gets rendered.
//
// `authorId === null` means the row pre-dates the memo_author_id
// column. The hook surfaces the legacy fallback name ("주디") so those
// memos read correctly without any SQL backfill.
export function MemoComment({
  memo,
  authorId,
  className = "",
  size = "md",
}: {
  memo: string;
  authorId: string | null | undefined;
  className?: string;
  // 'sm' shrinks the avatar + padding for the per-food card render
  // where multiple memos can stack inside a tight place detail page.
  size?: "sm" | "md";
}) {
  const { name, avatarUrl } = useMemoAuthor(authorId);
  const isSm = size === "sm";
  const avatarPx = isSm ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  const padding = isSm ? "px-3 py-2" : "px-4 py-3";
  const initial = name.trim().slice(0, 1) || "·";
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <div
        className={`${avatarPx} rounded-full bg-peach-100 text-peach-500 font-bold flex-shrink-0 flex items-center justify-center overflow-hidden border border-cream-200`}
        aria-hidden
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      <div
        className={`flex-1 min-w-0 rounded-2xl rounded-tl-md bg-cream-50 border border-cream-200 ${padding}`}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`font-bold text-ink-900 ${isSm ? "text-[12px]" : "text-[13px]"}`}
          >
            {name}
          </span>
        </div>
        <p
          className={`text-ink-700 whitespace-pre-wrap break-words ${isSm ? "text-[12px]" : "text-sm"}`}
        >
          {memo}
        </p>
      </div>
    </div>
  );
}
