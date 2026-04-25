import { useEffect, useRef, useState } from "react";

// Pull-to-refresh thresholds — exported so the floating indicator can
// match the active range exactly.
export const PULL_THRESHOLD = 70;
export const PULL_MAX = 110;

// Combined pull-to-refresh + manual-button refresh state. Pass the
// callback that does the actual data invalidation; the hook handles
// the gesture recognizer, button busy flag, and prevents double-fire.
export function useRefreshControls(refreshAll: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || e.touches.length !== 1) {
        startY.current = null;
        tracking.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    }
    function onTouchMove(e: TouchEvent) {
      if (!tracking.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        tracking.current = false;
        return;
      }
      const damped = Math.min(PULL_MAX, dy * 0.55);
      setPull(damped);
    }
    function onTouchEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      setPull((current) => {
        if (current >= PULL_THRESHOLD && !refreshing) {
          setRefreshing(true);
          Promise.resolve(refreshAll()).finally(() => {
            setRefreshing(false);
            setPull(0);
          });
          return PULL_THRESHOLD;
        }
        return 0;
      });
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [refreshAll, refreshing]);

  async function onManualRefresh() {
    if (manualRefreshing || refreshing) return;
    setManualRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setManualRefreshing(false);
    }
  }

  return { pull, refreshing, manualRefreshing, onManualRefresh };
}
