import { RefreshCw } from "lucide-react";
import { PULL_THRESHOLD } from "@/hooks/useRefreshControls";

// Floating refresh indicator at the top of the page. Fades in as the
// pull gesture progresses, swaps to the spinning state once the data
// invalidation kicks in. Shared between HomePage / MapPage / ComparePage
// so all three behave identically.
export function PullIndicator({
  pull,
  refreshing,
}: {
  pull: number;
  refreshing: boolean;
}) {
  if (pull <= 0 && !refreshing) return null;
  return (
    <div
      className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none"
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${Math.max(8, pull * 0.4)}px)`,
        opacity: Math.min(1, pull / PULL_THRESHOLD),
      }}
    >
      <div className="bg-white/95 backdrop-blur rounded-full shadow-airy border border-cream-200 w-10 h-10 flex items-center justify-center">
        <RefreshCw
          className={`w-5 h-5 text-rose-400 ${refreshing ? "animate-spin" : ""}`}
          style={{
            transform: refreshing
              ? undefined
              : `rotate(${Math.min(360, (pull / PULL_THRESHOLD) * 280)}deg)`,
          }}
        />
      </div>
    </div>
  );
}
