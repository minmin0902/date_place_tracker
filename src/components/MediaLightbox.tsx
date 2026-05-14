import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { isVideoUrl } from "@/lib/utils";

// Full-screen viewer for a SINGLE media item OR a gallery of items.
// Pass `src` for the old single-image behavior or `srcs` + `initial`
// for a swipe-able gallery.
//
// Architecture is a classic carousel: a strip of every item flexes
// side by side at 100% viewport width each, and the strip is
// translated by `translateX(-index * 100% + dragX)`. During a drag
// the next/previous slide is already visible coming in from the
// edge — that's what makes the swipe feel buttery instead of the
// current → snap → swap sequence the old implementation did.
//
// Gestures:
//   - 1-finger horizontal swipe (not zoomed) → next/prev slide
//   - double-tap → toggle 2.5× zoom on the active slide
//   - 2-finger pinch → smooth 1..4× zoom
//   - 1-finger drag when zoomed → pan the active slide
//   - arrow keys / chevron buttons → next/prev
//   - tap backdrop / X / Esc → close
type Props =
  | { src: string; onClose: () => void; srcs?: undefined; initial?: undefined }
  | {
      srcs: string[];
      initial?: number;
      onClose: () => void;
      src?: undefined;
    };

const ZOOM_MAX = 4;
const ZOOM_DOUBLE_TAP = 2.5;
// Threshold = 18% of viewport. Below this, snap back; above, commit
// to the next slide. Feels right on phones from 360-430px wide.
const SWIPE_THRESHOLD_RATIO = 0.18;

export function MediaLightbox(props: Props) {
  useBodyScrollLock();
  const items = props.srcs ?? (props.src ? [props.src] : []);
  const [index, setIndex] = useState(props.initial ?? 0);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Horizontal pixel offset applied to the carousel strip during an
  // active swipe. Reset to 0 once the gesture either commits to a
  // neighbor (index advances) or snaps back.
  const [dragX, setDragX] = useState(0);
  // While true, the strip animates between positions instead of
  // tracking the finger 1:1. Used for commit transitions and the
  // index→position snap after the gesture ends.
  const [animating, setAnimating] = useState(false);

  const touchRef = useRef<{
    mode: "idle" | "swipe" | "pan" | "pinch";
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    pinchStartDist: number;
    pinchStartScale: number;
    lastTapAt: number;
  }>({
    mode: "idle",
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    pinchStartDist: 0,
    pinchStartScale: 1,
    lastTapAt: 0,
  });

  // Reset zoom + pan whenever the active slide changes. Otherwise a
  // user that zoomed slide A and swiped to B would land mid-pan on B.
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function goTo(next: number) {
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    setAnimating(true);
    setIndex(clamped);
    setDragX(0);
  }

  type PointLike = { clientX: number; clientY: number };
  function distance(a: PointLike, b: PointLike) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: React.TouchEvent) {
    setAnimating(false);
    if (e.touches.length === 2) {
      const d = distance(e.touches[0], e.touches[1]);
      touchRef.current = {
        ...touchRef.current,
        mode: "pinch",
        pinchStartDist: d,
        pinchStartScale: scale,
        startTx: tx,
        startTy: ty,
      };
      return;
    }
    const t = e.touches[0];
    const now = Date.now();
    const since = now - touchRef.current.lastTapAt;
    touchRef.current.lastTapAt = now;
    // Double-tap (<300ms gap) → toggle zoom around the tap location.
    if (since < 300 && since > 0) {
      if (scale === 1) {
        setScale(ZOOM_DOUBLE_TAP);
        const offsetX = window.innerWidth / 2 - t.clientX;
        const offsetY = window.innerHeight / 2 - t.clientY;
        setTx(offsetX);
        setTy(offsetY);
      } else {
        setScale(1);
        setTx(0);
        setTy(0);
      }
      touchRef.current.mode = "idle";
      return;
    }
    touchRef.current = {
      ...touchRef.current,
      mode: scale > 1 ? "pan" : "swipe",
      startX: t.clientX,
      startY: t.clientY,
      startTx: tx,
      startTy: ty,
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    const ref = touchRef.current;
    if (ref.mode === "pinch" && e.touches.length === 2) {
      const d = distance(e.touches[0], e.touches[1]);
      const ratio = d / (ref.pinchStartDist || 1);
      const nextScale = Math.max(
        1,
        Math.min(ZOOM_MAX, ref.pinchStartScale * ratio)
      );
      setScale(nextScale);
      if (nextScale === 1) {
        setTx(0);
        setTy(0);
      }
      return;
    }
    if (ref.mode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      setTx(ref.startTx + (t.clientX - ref.startX));
      setTy(ref.startTy + (t.clientY - ref.startY));
      return;
    }
    if (ref.mode === "swipe" && e.touches.length === 1) {
      const t = e.touches[0];
      let raw = t.clientX - ref.startX;
      // Rubber band at the edges — feel of "I tried but there's
      // nothing there" without permitting a full off-screen drag.
      if ((index === 0 && raw > 0) || (index === items.length - 1 && raw < 0)) {
        raw = raw / 3;
      }
      setDragX(raw);
      return;
    }
  }

  function onTouchEnd() {
    const ref = touchRef.current;
    if (ref.mode === "swipe") {
      const threshold = window.innerWidth * SWIPE_THRESHOLD_RATIO;
      setAnimating(true);
      if (dragX < -threshold && index < items.length - 1) {
        // Animate the strip to the next slot, then advance index.
        // We let the slot offset (index * 100%) catch up to the
        // current visible position by zeroing dragX simultaneously,
        // so the transition is a single coherent slide.
        setIndex(index + 1);
        setDragX(0);
      } else if (dragX > threshold && index > 0) {
        setIndex(index - 1);
        setDragX(0);
      } else {
        // Snap back to current position.
        setDragX(0);
      }
    }
    touchRef.current.mode = "idle";
  }

  // After the snap-to transition finishes, disable transitions again
  // so the next drag is 1:1 with the finger.
  function onStripTransitionEnd() {
    setAnimating(false);
  }

  if (items.length === 0) return null;
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink-900/95 animate-fade select-none touch-none"
      onClick={(e) => {
        // Only close on direct backdrop tap (not bubble from img).
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <button
        type="button"
        onClick={props.onClose}
        className="absolute right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-30"
        aria-label="close"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <X className="w-5 h-5" />
      </button>

      {items.length > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-[12px] font-bold font-number tracking-wide z-30 pointer-events-none"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.1rem)" }}
        >
          {index + 1} / {items.length}
        </div>
      )}

      {items.length > 1 && hasPrev && (
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          className="hidden sm:flex absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-30"
          aria-label="prev"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {items.length > 1 && hasNext && (
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          className="hidden sm:flex absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-30"
          aria-label="next"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Strip — every slide laid out side by side at 100% width. We
          translate the WHOLE strip by `-index * 100% + dragX` so the
          neighbor is already coming in as the finger moves. iOS GPU
          composites the transform smoothly without re-laying-out. */}
      <div
        className="absolute inset-0 flex overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
            transition: animating ? "transform 0.22s ease-out" : "none",
            willChange: "transform",
          }}
          onTransitionEnd={onStripTransitionEnd}
        >
          {items.map((url, i) => {
            const isVideo = isVideoUrl(url);
            const isActive = i === index;
            // Render media for current + adjacent slides only. Others
            // get a placeholder div so the strip's width is still
            // index * 100% — keeps translate math simple while saving
            // bandwidth on long galleries.
            const eager = Math.abs(i - index) <= 1;
            return (
              <div
                key={url}
                className="w-full h-full flex-shrink-0 flex items-center justify-center px-3"
                onClick={(e) => e.stopPropagation()}
              >
                {!eager ? (
                  <div className="w-full h-full" aria-hidden />
                ) : isVideo ? (
                  <video
                    src={url}
                    className="max-w-full max-h-[85dvh] rounded-xl"
                    controls={isActive}
                    playsInline
                    autoPlay={isActive}
                  />
                ) : (
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="max-w-full max-h-[85dvh] rounded-xl object-contain"
                    style={
                      isActive
                        ? {
                            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
                            transition:
                              touchRef.current.mode === "idle"
                                ? "transform 0.18s ease-out"
                                : "none",
                            transformOrigin: "center center",
                            willChange: "transform",
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
