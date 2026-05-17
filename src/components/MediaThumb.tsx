import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { isVideoUrl, videoPreviewUrl } from "@/lib/utils";
import { hasPreloadedImage, markImagePreloaded } from "@/lib/mediaPreload";
import { MediaLightbox } from "./MediaLightbox";

const paintedVideoCache = new Set<string>();

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
//   gallery: optional list of sibling media URLs (e.g. all place
//     photos). When provided, opening the lightbox lets the user
//     swipe between them. Caller also passes `index` for the
//     starting position.
export function MediaThumb({
  src,
  alt,
  className = "",
  showPlayBadge = false,
  controls = false,
  clickable = true,
  gallery,
  index,
  loading = "lazy",
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
  gallery?: string[];
  index?: number;
  loading?: "lazy" | "eager";
}) {
  const [open, setOpen] = useState(false);
  const isVideo = isVideoUrl(src);
  const [loaded, setLoaded] = useState(() =>
    isVideo ? paintedVideoCache.has(src) : hasPreloadedImage(src)
  );

  useEffect(() => {
    setLoaded(isVideo ? paintedVideoCache.has(src) : hasPreloadedImage(src));
  }, [isVideo, src]);

  const mediaClassName = `${className} transition-opacity duration-200 ease-out ${
    loaded ? "opacity-100" : "opacity-0"
  }`;
  // When clickable, the wrapper opens a lightbox — kill native
  // controls on the inline thumb (the lightbox provides them) and
  // surface a play badge so users know the clip is interactive.
  const inlineControls = clickable ? false : controls;
  const showBadge = isVideo && (clickable || showPlayBadge) && !inlineControls;

  const inner = isVideo ? (
    <span className="relative inline-block w-full h-full">
      {/* #t=0.001 + preload="auto" nudges mobile Safari/Chrome to paint
          a real first-frame preview instead of a blank video box. muted
          + playsInline keep iOS from auto-fullscreening the thumbnail. */}
      <video
        src={videoPreviewUrl(src)}
        className={mediaClassName}
        preload="auto"
        muted
        playsInline
        controls={inlineControls}
        onLoadedData={() => {
          paintedVideoCache.add(src);
          setLoaded(true);
        }}
        onError={() => setLoaded(true)}
      />
      {showBadge && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 bg-ink-900/70 text-white text-[9px] font-bold px-1 py-0.5 rounded pointer-events-none">
          <Play className="w-2.5 h-2.5" /> VIDEO
        </span>
      )}
    </span>
  ) : (
    // loading="lazy" — browser defers the GET until the img is
    // within ~viewport of being visible. On a busy place detail
    // page (8 foods × 5 photos + memo attachments) this turns 50+
    // concurrent requests at first paint into a steady stream as
    // the user scrolls, which is the single biggest first-paint
    // win on mobile networks.
    //
    // decoding="async" lets the decoder run off the main thread —
    // matters when many imgs land in the same paint frame.
    <img
      src={src}
      alt={alt ?? ""}
      className={mediaClassName}
      loading={loading}
      decoding="async"
      onLoad={() => {
        markImagePreloaded(src);
        setLoaded(true);
      }}
      onError={() => setLoaded(true)}
    />
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
      {open &&
        (gallery && gallery.length > 1 ? (
          <MediaLightbox
            srcs={gallery}
            initial={index ?? gallery.indexOf(src)}
            onClose={() => setOpen(false)}
          />
        ) : (
          <MediaLightbox src={src} onClose={() => setOpen(false)} />
        ))}
    </>
  );
}
