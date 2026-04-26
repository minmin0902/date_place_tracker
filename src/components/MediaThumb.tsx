import { useState } from "react";
import { Play } from "lucide-react";
import { isVideoUrl } from "@/lib/utils";
import { MediaLightbox } from "./MediaLightbox";

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
//   clickable: when true (default) the thumb opens a fullscreen
//     lightbox on tap. Pass false for non-display contexts (uploader
//     previews, avatars) where zoom-in doesn't make sense.
export function MediaThumb({
  src,
  alt,
  className = "",
  showPlayBadge = false,
  controls = false,
  clickable = true,
}: {
  src: string;
  alt?: string;
  className?: string;
  showPlayBadge?: boolean;
  // Show native video controls so users can actually play the clip.
  // Tiny thumbnails leave this off (controls don't fit + tap-through
  // navigates to a detail page anyway); larger gallery slots turn it
  // on so the play button is visible. Ignored when `clickable` since
  // the lightbox provides controls.
  controls?: boolean;
  clickable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isVideo = isVideoUrl(src);
  // When clickable, the wrapper opens a lightbox — kill native
  // controls on the inline thumb (the lightbox provides them) and
  // surface a play badge so users know the clip is interactive.
  const inlineControls = clickable ? false : controls;
  const showBadge = isVideo && (clickable || showPlayBadge) && !inlineControls;

  const inner = isVideo ? (
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
        controls={inlineControls}
      />
      {showBadge && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 bg-ink-900/70 text-white text-[9px] font-bold px-1 py-0.5 rounded pointer-events-none">
          <Play className="w-2.5 h-2.5" /> VIDEO
        </span>
      )}
    </span>
  ) : (
    <img src={src} alt={alt ?? ""} className={className} />
  );

  if (!clickable) return inner;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full h-full p-0 m-0 border-0 bg-transparent cursor-zoom-in"
        aria-label="확대 · 放大"
      >
        {inner}
      </button>
      {open && <MediaLightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}
