import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

// Single source of truth for "what does refresh mean across the app".
// Both pull-to-refresh and the manual button on every page hit this,
// so adding a new user-data query → register it once here and every
// surface picks it up. Previously each page hand-rolled a slightly
// different invalidation list (HomePage had wishlist, ComparePage
// didn't, etc) so a refresh in one tab could leave another stale.
//
// The callback returns a Promise that resolves once the relevant
// queries finish refetching — useRefreshControls awaits it to know
// when to drop the spinner.
export function useGlobalRefresh() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useCallback(() => {
    const userId = user?.id;
    // refetchType: 'active' — only currently-mounted queries actually
    // re-fetch. Stale queries (e.g. memos for places the user has
    // visited but isn't looking at now) get marked stale and refetch
    // lazily on next mount. Without this, a user who'd browsed 8
    // places would fire 8 parallel SELECT memos on every refresh
    // — nobody was waiting on those results and they thrashed the
    // network + ran a render wave on resolve. Single biggest cause
    // of pull-to-refresh jank.
    const opts = { refetchType: "active" as const };
    return Promise.all([
      // Place + food list — drives the timeline, map, compare card.
      qc.invalidateQueries({ queryKey: ["places"], ...opts }),
      // Couple metadata (home address, partner connection).
      qc.invalidateQueries({ queryKey: ["couple"], ...opts }),
      // Wishlist for "또 갈래" / "가볼래" entries.
      qc.invalidateQueries({ queryKey: ["wishlist"], ...opts }),
      // Comment threads attached to places / foods.
      qc.invalidateQueries({ queryKey: ["memos"], ...opts }),
      // Reactions — per-target keys and the per-place bulk batch.
      qc.invalidateQueries({ queryKey: ["reactions"], ...opts }),
      qc.invalidateQueries({ queryKey: ["reactions-by-place"], ...opts }),
      // Profile data — partner might have updated their avatar /
      // nickname while we were idle.
      qc.invalidateQueries({ queryKey: ["profile"], ...opts }),
      // Inbox + unread count for the bell.
      qc.invalidateQueries({ queryKey: ["notifications", userId], ...opts }),
      qc.invalidateQueries({
        queryKey: ["notifications", "unread-count", userId],
        ...opts,
      }),
    ]);
  }, [qc, user?.id]);
}
