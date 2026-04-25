import { useMemoAuthor } from "@/hooks/useProfile";
import { MediaThumb } from "./MediaThumb";

// Tight one-line attribution for places where the full caption layout
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

// Relative-time formatter: "방금 전 / 12분 전 / 3시간 전 / 5일 전 /
// 4월 12일". Korean only — the rest of the app pairs Korean labels
// with Chinese subtitles, but for a tiny comment timestamp we keep it
// to one short string. Threshold-based so we don't pull in dayjs/etc
// just for this.
function relativeKo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return "방금 전";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(t).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

// Instagram-style memo display — small avatar on the left, bold author
// name inline with the memo, and a tiny relative timestamp underneath.
// Used on the place detail page where users come back to read what
// they wrote about a date / dish.
//
// `authorId === null` is handled by the hook (renders as the partner)
// to keep legacy rows from blanking out before the SQL backfill runs.
export function MemoComment({
  memo,
  authorId,
  createdAt,
  photoUrls,
  className = "",
  size = "md",
}: {
  memo: string;
  authorId: string | null | undefined;
  // ISO string. Optional because some memo surfaces (e.g. legacy
  // imports) don't have a reliable timestamp; we just hide the row.
  createdAt?: string | null;
  // Optional small attachments — rendered as a horizontal thumb row
  // under the caption. Same MediaThumb the rest of the app uses, so
  // video URLs auto-flip to <video> with controls.
  photoUrls?: string[] | null;
  className?: string;
  // 'sm' shrinks the avatar + text for the per-food card render
  // where multiple memos can stack inside a tight place detail page.
  size?: "sm" | "md";
}) {
  const { name, avatarUrl, tone } = useMemoAuthor(authorId);
  const isSm = size === "sm";
  const avatarBox = isSm ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-[11px]";
  const textSize = isSm ? "text-[12px]" : "text-[13px]";
  const initial = Array.from(name)[0] ?? "·";
  const toneCls =
    tone === "peach"
      ? "bg-peach-100 text-peach-500"
      : "bg-rose-100 text-rose-500";
  const stamp = createdAt ? relativeKo(createdAt) : "";

  return (
    <div className={`flex gap-3 ${className}`}>
      {/* Avatar — uses the user's uploaded photo when available, else
          a colored bubble with the first character of their name. */}
      <div className="flex-shrink-0 mt-0.5">
        <div
          className={`${avatarBox} rounded-full overflow-hidden border border-cream-200 flex items-center justify-center font-black ${
            avatarUrl ? "" : toneCls
          }`}
          aria-hidden
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
      </div>

      {/* Caption — bold name flowing inline with the memo body, like
          an Instagram post caption / comment. break-keep so Korean
          words don't split awkwardly mid-character. */}
      <div className="flex-1 min-w-0">
        <p
          className={`leading-snug whitespace-pre-wrap break-words break-keep ${textSize}`}
        >
          <span className="font-bold text-ink-900 mr-1.5">{name}</span>
          <span className="text-ink-700">{memo}</span>
        </p>
        {photoUrls && photoUrls.length > 0 && (
          <div className="flex gap-1.5 mt-1.5">
            {photoUrls.map((url) => (
              <div
                key={url}
                className={`${isSm ? "w-14 h-14" : "w-20 h-20"} rounded-xl overflow-hidden border border-cream-200 bg-ink-900 flex-shrink-0`}
              >
                <MediaThumb
                  src={url}
                  className="w-full h-full object-cover"
                  showPlayBadge
                  controls
                />
              </div>
            ))}
          </div>
        )}
        {stamp && (
          <p className="text-[10px] text-ink-400 mt-1 font-medium font-number">
            {stamp}
          </p>
        )}
      </div>
    </div>
  );
}
