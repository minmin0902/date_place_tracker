import { useEffect, useState } from "react";

// Track the visual viewport rectangle (height + offsetTop). iOS Safari's
// `100dvh` (and even `100svh`) only react to the URL bar — they do NOT
// shrink when the on-screen keyboard appears. That, combined with
// `fixed inset-0` wrappers covering the LAYOUT viewport (which extends
// behind the keyboard), is why our modal's save button kept getting
// hidden: `items-end` was aligning the card flush against the keyboard
// edge, not the visible viewport bottom.
//
// `window.visualViewport` is the only reliable signal: `.height` is the
// visible area, `.offsetTop` is how far down the visible area starts
// from the layout viewport top (non-zero when iOS pinches/zooms or
// when the keyboard pushes content up). When the API is unavailable
// (old Safari, headless tests) we fall back to innerHeight.
export type VisualViewportRect = { height: number; offsetTop: number };

export function useVisualViewport(active: boolean = true): VisualViewportRect | null {
  const [rect, setRect] = useState<VisualViewportRect | null>(() => {
    if (typeof window === "undefined") return null;
    const vv = window.visualViewport;
    if (vv) return { height: vv.height, offsetTop: vv.offsetTop };
    if (window.innerHeight) return { height: window.innerHeight, offsetTop: 0 };
    return null;
  });

  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () => {
      if (vv) setRect({ height: vv.height, offsetTop: vv.offsetTop });
      else if (window.innerHeight) setRect({ height: window.innerHeight, offsetTop: 0 });
    };
    update();
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
    };
  }, [active]);

  return rect;
}

// Convenience wrapper that returns just the height (most callers).
export function useVisualViewportHeight(active: boolean = true): number | null {
  const r = useVisualViewport(active);
  return r ? r.height : null;
}
