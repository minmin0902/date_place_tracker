import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { isVideoUrl } from "@/lib/utils";

// Full-screen viewer for a SINGLE media item OR a gallery of items.
// Pass `src` for the old single-image behavior or `srcs` + `initial`
// for a swipe-able gallery. The two modes coexist so existing
// callers don't need to refactor unless they want the gallery.
//
// Gestures:
//   - horizontal swipe → next / prev slide (only when not zoomed)
//   - double-tap on image → toggle 2.5× zoom centered on the tap point
//   - single-finger drag when zoomed → pan
//   - two-finger pinch → smooth zoom
//   - arrow keys / on-screen chevrons → next / prev
//   - Esc / tap backdrop → close
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
const SWIPE_THRESHOLD_PX = 60;

export function MediaLightbox(props: Props) {
  useBodyScrollLock();
  const items = props.srcs ?? (props.src ? [props.src] : []);
  const [index, setIndex] = useState(props.initial ?? 0);
  const [scale, setScale] = useState(1);
  // tx/ty translate the image when zoomed. Pinch + drag both write here.
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Swipe-in-progress horizontal offset (only when scale === 1) — used
  // to animate the slide following the finger before commit.
  const [dragX, setDragX] = useState(0);
  const [committing, setCommitting] = useState(false);

  // Touch bookkeeping — we discriminate single-finger (swipe / pan)
  // from two-finger (pinch) by counting active touches at start.
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

  // Reset transform whenever the active slide changes — otherwise a
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
    setIndex(clamped);
    setDragX(0);
  }

  // React's synthetic Touch differs from the DOM Touch type by a few
  // optional fields we don't read; widening to the structural shape we
  // actually need keeps both happy.
  type PointLike = { clientX: number; clientY: number };
  function distance(a: PointLike, b: PointLike) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch start
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
    // Double-tap: <300ms gap between two single-finger taps.
    if (since < 300 && since > 0) {
      // Toggle zoom around the tap point.
      if (scale === 1) {
        setScale(ZOOM_DOUBLE_TAP);
        // Center the zoom on the tap relative to the viewport.
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
    // Single-finger: swipe between slides if not zoomed, else pan.
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
      setDragX(t.clientX - ref.startX);
      return;
    }
  }

  function onTouchEnd() {
    const ref = touchRef.current;
    if (ref.mode === "swipe") {
      // Commit the swipe if past the threshold; else snap back.
      if (Math.abs(dragX) > SWIPE_THRESHOLD_PX && items.length > 1) {
        setCommitting(true);
        // Animate to the edge of the viewport before swapping the
        // src — gives a satisfying slide-out instead of a jump cut.
        const direction = dragX > 0 ? -1 : 1;
        setDragX(direction > 0 ? -window.innerWidth : window.innerWidth);
        window.setTimeout(() => {
          goTo(index + direction);
          setCommitting(false);
        }, 180);
      } else {
        setDragX(0);
      }
    }
    touchRef.current.mode = "idle";
  }

  if (items.length === 0) return null;
  const current = items[index];
  const isVideo = isVideoUrl(current);
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/95 animate-fade select-none"
      onClick={(e) => {
        // Only close on direct backdrop tap, not bubble from img.
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <button
        type="button"
        onClick={props.onClose}
        className="absolute right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-20"
        aria-label="close"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Index pill — "3 / 7", only meaningful when gallery has 2+. */}
      {items.length > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-[12px] font-bold font-number tracking-wide z-20"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.1rem)" }}
        >
          {index + 1} / {items.length}
        </div>
      )}

      {/* Prev/next chevrons — visible on desktop, lightly visible on
          mobile as a fallback when swipe feels sticky. Hidden when at
          the edge of the gallery. */}
      {items.length > 1 && hasPrev && (
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          className="hidden sm:flex absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-20"
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
          className="hidden sm:flex absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-20"
          aria-label="next"
          style={{ top: "50%", transform: "translateY(-50%)" }}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div
        className="relative max-w-full max-h-full px-4 touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={current}
            className="max-w-full max-h-[85dvh] rounded-xl"
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={current}
            alt=""
            draggable={false}
            className="max-w-full max-h-[85dvh] rounded-xl object-contain"
            style={{
              transform: `translate(${tx + dragX}px, ${ty}px) scale(${scale})`,
              // Snap-back / next-slide commit uses a short transition;
              // active drag is 1:1 with the finger (no transition).
              transition:
                committing || touchRef.current.mode === "idle"
                  ? "transform 0.18s ease-out"
                  : "none",
              transformOrigin: "center center",
              willChange: "transform",
            }}
          />
        )}
      </div>
    </div>
  );
}
