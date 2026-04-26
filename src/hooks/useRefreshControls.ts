import { useCallback, useEffect, useRef, useState } from "react";

// Pull-to-refresh thresholds — exported so the floating indicator
// can match the active range exactly.
export const PULL_THRESHOLD = 70;
export const PULL_MAX = 110;

// Asymptotic damping. As the user pulls further past PULL_MAX the
// indicator slows to a near-halt instead of clipping abruptly — same
// rubber-band feel iOS Safari uses on overscroll. `dy * 0.55` was the
// old linear curve; replacing with a saturating function avoids the
// "wall" the user used to hit at exactly PULL_MAX.
function dampedPull(rawDy: number): number {
  if (rawDy <= 0) return 0;
  const linearPart = Math.min(rawDy, PULL_MAX);
  const overshoot = Math.max(0, rawDy - PULL_MAX);
  // Diminishing-returns curve — every extra px of drag adds less
  // visible movement, asymptotically approaching PULL_MAX + 30.
  const tail = 30 * (1 - Math.exp(-overshoot / 80));
  return linearPart * 0.55 + tail;
}

// Best-effort haptic. iOS Safari ignores navigator.vibrate (Apple
// hasn't shipped it on iOS Safari), but Android Chrome + Desktop
// Chrome support it. Wrapped in feature-detect so the call no-ops
// on browsers without the API.
function hapticTap(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

// Combined pull-to-refresh + manual-button refresh state. Pass the
// callback that does the actual data invalidation; the hook handles
// the gesture recognizer, button busy flag, and prevents double-fire.
export function useRefreshControls(refreshAll: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  // True from touchend onward, false during active drag — drives the
  // CSS transition on the indicator so the snap-back/snap-to-threshold
  // animates smoothly while live drag stays 1:1 with the finger.
  const [released, setReleased] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);
  const crossedThreshold = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || e.touches.length !== 1) {
        startY.current = null;
        tracking.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      tracking.current = true;
      crossedThreshold.current = false;
      setReleased(false);
    }
    function onTouchMove(e: TouchEvent) {
      if (!tracking.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        tracking.current = false;
        return;
      }
      const damped = dampedPull(dy);
      // Light haptic the FIRST time the user crosses the trigger
      // threshold so they feel "ready to release".
      if (!crossedThreshold.current && damped >= PULL_THRESHOLD) {
        crossedThreshold.current = true;
        hapticTap(10);
      } else if (crossedThreshold.current && damped < PULL_THRESHOLD) {
        crossedThreshold.current = false;
      }
      setPull(damped);
    }
    function onTouchEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      startY.current = null;
      // Flip released so PullIndicator picks up the transition.
      setReleased(true);
      setPull((current) => {
        if (current >= PULL_THRESHOLD && !refreshing) {
          setRefreshing(true);
          Promise.resolve(refreshAll())
            .finally(() => {
              setRefreshing(false);
              setPull(0);
              setJustFinished(true);
              // Brief "done" pulse so the user gets confirmation
              // even if the data hasn't visibly changed.
              setTimeout(() => setJustFinished(false), 700);
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

  const onManualRefresh = useCallback(async () => {
    if (manualRefreshing || refreshing) return;
    setManualRefreshing(true);
    hapticTap(6);
    try {
      await refreshAll();
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 700);
    } finally {
      setManualRefreshing(false);
    }
  }, [manualRefreshing, refreshing, refreshAll]);

  return {
    pull,
    refreshing,
    manualRefreshing,
    released,
    justFinished,
    onManualRefresh,
  };
}
