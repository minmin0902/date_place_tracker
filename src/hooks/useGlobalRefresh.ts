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
    return Promise.all([
      // Place + food list — drives the timeline, map, compare card.
      qc.invalidateQueries({ queryKey: ["places"] }),
      // Couple metadata (home address, partner connection).
      qc.invalidateQueries({ queryKey: ["couple"] }),
      // Wishlist for "또 갈래" / "가볼래" entries.
      qc.invalidateQueries({ queryKey: ["wishlist"] }),
      // Comment threads attached to places / foods.
      qc.invalidateQueries({ queryKey: ["memos"] }),
      // Profile data — partner might have updated their avatar /
      // nickname while we were idle.
      qc.invalidateQueries({ queryKey: ["profile"] }),
      // Inbox + unread count for the bell.
      qc.invalidateQueries({ queryKey: ["notifications", userId] }),
      qc.invalidateQueries({
        queryKey: ["notifications", "unread-count", userId],
      }),
    ]);
  }, [qc, user?.id]);
}
