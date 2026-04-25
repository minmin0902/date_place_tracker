import { Play } from "lucide-react";
import { isVideoUrl } from "@/lib/utils";

// Drop-in replacement for `<img>` that flips to a `<video>` when the
// URL extension is a video format. Kept tiny on purpose so it can
// stand in for img tags scattered across timeline items, place hero
// photos, menu rows, etc., without each call site reimplementing
// the branch.
//
//   className: applies to the rendered <img> or <video> 1:1.
//   showPlayBadge: small ▶ chip overlay so users know the thumbnail
//     is a clip, not a still. Omit for tiny thumbs where the badge
//     would crowd the frame.
export function MediaThumb({
  src,
  alt,
  className = "",
  showPlayBadge = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  showPlayBadge?: boolean;
}) {
  if (isVideoUrl(src)) {
    return (
      <span className="relative inline-block w-full h-full">
        {/* preload="metadata" gives us the first frame as a poster
            without downloading the whole clip; muted + playsInline
            keep iOS Safari from auto-fullscreen on tap and let the
            preview render inline. */}
        <video
          src={src}
          className={className}
          preload="metadata"
          muted
          playsInline
        />
        {showPlayBadge && (
          <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 bg-ink-900/70 text-white text-[9px] font-bold px-1 py-0.5 rounded">
            <Play className="w-2.5 h-2.5" /> VIDEO
          </span>
        )}
      </span>
    );
  }
  return <img src={src} alt={alt ?? ""} className={className} />;
}
