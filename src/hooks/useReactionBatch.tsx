import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  getReactions as getLocalReactions,
} from "@/lib/localDb";
import type { Reaction, ReactionTarget } from "@/lib/database.types";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

// One bulk fetch of every reaction in a place's subtree (caption +
// food captions + every thread memo). This collapses the 30-40
// per-row useReactions queries the page used to fire into a single
// round trip — see migrations/20260513_reactions_for_place_rpc.sql
// for the SQL side.
function bulkKey(placeId: string) {
  return ["reactions-by-place", placeId] as const;
}

export function useReactionsByPlace(placeId: string | undefined) {
  return useQuery({
    queryKey: placeId
      ? bulkKey(placeId)
      : (["reactions-by-place", "disabled"] as const),
    enabled: !!placeId,
    queryFn: async (): Promise<Reaction[]> => {
      if (!placeId) return [];
      if (ALLOW_NO_AUTH) {
        // localDb has no concept of "the whole place subtree" so we
        // assemble it manually. Cheap because everything is in mem.
        // Place caption:
        const placeRx = getLocalReactions({ kind: "place", id: placeId });
        // Food captions + memo reactions — fall back to scanning the
        // local reactions table for anything tied to this place via
        // the memos / foods we know about. We don't have direct
        // access to those tables here without an extra import, so
        // just return the place reactions and let any food/memo
        // reactions fall through to the per-target query path. The
        // production code path uses the RPC and gets everything.
        return placeRx;
      }
      const { data, error } = await supabase.rpc("reactions_for_place", {
        p_place_id: placeId,
      });
      if (error) throw error;
      return (data ?? []) as Reaction[];
    },
  });
}

// Provider exposes a stable `getFor(target)` that slices the bulk
// list by target. Memoized at every level so ReactionRow consumers
// only re-render when THEIR slice actually changes.
type ReactionContextValue = {
  isReady: boolean;
  // The place this provider is rooted at — ReactionRow reads it so
  // a successful toggle can invalidate the bulk key in addition to
  // the per-target one.
  placeId: string;
  getFor: (target: ReactionTarget) => Reaction[];
};

const ReactionContext = createContext<ReactionContextValue | null>(null);

export function ReactionProvider({
  placeId,
  children,
}: {
  placeId: string;
  children: ReactNode;
}) {
  const bulk = useReactionsByPlace(placeId);

  // If the RPC isn't available yet (e.g. migration applied after this
  // bundle ships) drop the provider entirely — children fall back to
  // their per-target query path automatically. Otherwise reactions
  // would silently render as empty across the page until the SQL
  // migration runs.
  if (bulk.isError) {
    return <>{children}</>;
  }

  // Pre-bucket once per data change so per-row lookups are O(1).
  // useMemo guarantees the same array reference per (target.kind,
  // target.id) until the underlying data changes, which keeps the
  // memoized ReactionRow from re-rendering on unrelated invalidations.
  const buckets = useMemo(() => {
    const byMemo = new Map<string, Reaction[]>();
    const byPlace = new Map<string, Reaction[]>();
    const byFood = new Map<string, Reaction[]>();
    for (const r of bulk.data ?? []) {
      if (r.memo_id) {
        const arr = byMemo.get(r.memo_id) ?? [];
        arr.push(r);
        byMemo.set(r.memo_id, arr);
      } else if (r.place_id) {
        const arr = byPlace.get(r.place_id) ?? [];
        arr.push(r);
        byPlace.set(r.place_id, arr);
      } else if (r.food_id) {
        const arr = byFood.get(r.food_id) ?? [];
        arr.push(r);
        byFood.set(r.food_id, arr);
      }
    }
    return { byMemo, byPlace, byFood };
  }, [bulk.data]);

  const value = useMemo<ReactionContextValue>(
    () => ({
      isReady: bulk.isSuccess || !!bulk.data,
      placeId,
      getFor: (target) => {
        if (target.kind === "memo") return buckets.byMemo.get(target.id) ?? EMPTY;
        if (target.kind === "place") return buckets.byPlace.get(target.id) ?? EMPTY;
        return buckets.byFood.get(target.id) ?? EMPTY;
      },
    }),
    [buckets, bulk.isSuccess, bulk.data, placeId]
  );

  return (
    <ReactionContext.Provider value={value}>
      {children}
    </ReactionContext.Provider>
  );
}

// Frozen empty array — returned for any (target, target_id) that
// has no reactions yet so callers always get a stable reference.
// Without this, every getFor() miss would produce a fresh [] which
// breaks React.memo identity checks downstream.
const EMPTY = Object.freeze([] as Reaction[]) as readonly Reaction[] as Reaction[];

// Consumer-side hook. Returns null when there's no provider — that's
// the signal for ReactionRow to fall back to its own per-target
// query (e.g. when used outside the PlaceDetailPage tree).
export function useReactionBatch() {
  return useContext(ReactionContext);
}

// Helper that invalidates BOTH the per-target query cache (legacy
// fallback path) AND the place-tree bulk cache after a successful
// toggle. The toggle mutation already invalidates the per-target
// key; for places under a provider we also need to refresh the
// bulk fetch so the bucketed list updates.
//
// The mutation can't infer the place id from a memo reaction
// (memos point to place_id OR food_id; a food's place is one join
// away), so callers that have the place id pass it through. The
// provider invalidates its own subtree on every toggle via this.
export function useInvalidateReactionsForPlace() {
  const qc = useQueryClient();
  return (placeId: string | undefined) => {
    if (!placeId) return;
    void qc.invalidateQueries({ queryKey: bulkKey(placeId) });
  };
}
