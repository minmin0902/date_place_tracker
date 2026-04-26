import { Check, RefreshCw } from "lucide-react";
import { PULL_THRESHOLD } from "@/hooks/useRefreshControls";

// Floating refresh indicator at the top of the page. Fades in as the
// pull gesture progresses, swaps to the spinning state once the data
// invalidation kicks in, then briefly shows ✓ on completion. Shared
// between HomePage / MapPage / ComparePage so all three behave
// identically.
//
// `released` flips true on touchend — that's our cue to ease the
// indicator back up smoothly. During active drag we stay snappy
// (no transition) so the puck tracks the finger 1:1.
export function PullIndicator({
  pull,
  refreshing,
  released,
  justFinished,
}: {
  pull: number;
  refreshing: boolean;
  released?: boolean;
  justFinished?: boolean;
}) {
  if (pull <= 0 && !refreshing && !justFinished) return null;
  const ready = pull >= PULL_THRESHOLD;
  return (
    <div
      className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none"
      style={{
        top: justFinished
          ? `calc(env(safe-area-inset-top, 0px) + 14px)`
          : `calc(env(safe-area-inset-top, 0px) + ${Math.max(8, pull * 0.4)}px)`,
        opacity: justFinished
          ? 1
          : Math.min(1, pull / PULL_THRESHOLD || (refreshing ? 1 : 0)),
        // Live drag → snap to finger; release / completion → ease.
        transition:
          released || refreshing || justFinished
            ? "top 280ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms"
            : "none",
      }}
    >
      <div
        className={`bg-white/95 backdrop-blur rounded-full shadow-airy border w-10 h-10 flex items-center justify-center transition-colors ${
          justFinished
            ? "border-sage-300 text-sage-400"
            : ready
              ? "border-rose-200 text-rose-500"
              : "border-cream-200 text-rose-400"
        }`}
      >
        {justFinished ? (
          <Check className="w-5 h-5 animate-fade" />
        ) : (
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
            style={{
              transform: refreshing
                ? undefined
                : `rotate(${Math.min(360, (pull / PULL_THRESHOLD) * 280)}deg)`,
              transition: released && !refreshing ? "transform 200ms" : "none",
            }}
          />
        )}
      </div>
    </div>
  );
}
