import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  getReactions as getLocalReactions,
  toggleReaction as toggleLocalReaction,
} from "@/lib/localDb";
import type { Reaction, ReactionTarget } from "@/lib/database.types";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

// Quick-react set shown under every memo / caption. Five is the sweet
// spot — wide enough to cover the common reactions on a couples diary
// (love / yum / aww / fire / agree) without being so many that the row
// wraps on a 360px phone. Keep emoji-only (no labels) so it works
// without translation between Korean + Chinese viewers.
export const QUICK_REACTIONS = ["❤️", "😋", "🥹", "🔥", "👍"] as const;

// Query key scope is the target itself — flat reactions list per
// (memo|place|food) id, so a successful toggle invalidates exactly
// the one row's bubble.
function reactionsKey(target: ReactionTarget) {
  return ["reactions", target.kind, target.id] as const;
}

// Aggregate {emoji → {count, userIds}} for rendering. The full row
// is rarely useful raw — every caller wants "which emojis appear,
// how many, did I tap it?" so we precompute that here.
export type ReactionSummary = {
  emoji: string;
  count: number;
  userIds: string[];
  mineId: string | null;
};

export function summarize(
  rows: Reaction[],
  myUserId: string | null | undefined
): ReactionSummary[] {
  const byEmoji = new Map<string, ReactionSummary>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji);
    const mineId = myUserId && r.user_id === myUserId ? r.id : null;
    if (cur) {
      cur.count += 1;
      cur.userIds.push(r.user_id);
      cur.mineId = cur.mineId ?? mineId;
    } else {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        userIds: [r.user_id],
        mineId,
      });
    }
  }
  return Array.from(byEmoji.values());
}

// Read all reactions on a target. Enabled requires a target id —
// `undefined` short-circuits, useful for callers that conditionally
// render reactions only when the parent row has loaded.
export function useReactions(target: ReactionTarget | null | undefined) {
  const enabled = !!target?.id;
  return useQuery({
    queryKey: target
      ? reactionsKey(target)
      : (["reactions", "disabled"] as const),
    enabled,
    queryFn: async (): Promise<Reaction[]> => {
      if (!target) return [];
      if (ALLOW_NO_AUTH) return getLocalReactions(target);
      let q = supabase
        .from("reactions")
        .select("*")
        .order("created_at", { ascending: true });
      if (target.kind === "memo") q = q.eq("memo_id", target.id);
      else if (target.kind === "place") q = q.eq("place_id", target.id);
      else q = q.eq("food_id", target.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Reaction[];
    },
  });
}

// Toggle a single emoji on a target. Optimistic so the bubble flips
// instantly even on a slow network. On success we invalidate so the
// real row id replaces our temporary one (used later for delete).
export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      coupleId: string;
      userId: string;
      target: ReactionTarget;
      emoji: string;
      // If the caller already knows the user has reacted with this
      // emoji (from a prior summarize() call), they can pass the id
      // so we can DELETE without a round-trip to find it. Optional —
      // we fall back to a SELECT when missing.
      existingId?: string | null;
      // When the row lives inside a ReactionProvider tree, the
      // bulk query at ["reactions-by-place", placeId] also needs
      // invalidating after a toggle. Caller (ReactionRow) reads
      // placeId from the provider context and passes it through.
      placeId?: string | null;
    }): Promise<{ added: Reaction | null; removedId: string | null }> => {
      if (ALLOW_NO_AUTH) {
        return toggleLocalReaction(input);
      }
      // Resolve existingId if caller didn't pre-load it. Cheaper than
      // racing an insert against the unique constraint and recovering.
      let toRemove = input.existingId ?? null;
      if (!toRemove) {
        let probe = supabase
          .from("reactions")
          .select("id")
          .eq("user_id", input.userId)
          .eq("emoji", input.emoji)
          .limit(1);
        if (input.target.kind === "memo")
          probe = probe.eq("memo_id", input.target.id);
        else if (input.target.kind === "place")
          probe = probe.eq("place_id", input.target.id);
        else probe = probe.eq("food_id", input.target.id);
        const { data: existing, error: probeErr } = await probe;
        if (probeErr) throw probeErr;
        toRemove = existing?.[0]?.id ?? null;
      }
      if (toRemove) {
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("id", toRemove);
        if (error) throw error;
        return { added: null, removedId: toRemove };
      }
      const { data, error } = await supabase
        .from("reactions")
        .insert({
          couple_id: input.coupleId,
          user_id: input.userId,
          emoji: input.emoji,
          memo_id: input.target.kind === "memo" ? input.target.id : null,
          place_id: input.target.kind === "place" ? input.target.id : null,
          food_id: input.target.kind === "food" ? input.target.id : null,
        })
        .select()
        .single();
      if (error) throw error;
      return { added: data as Reaction, removedId: null };
    },
    onMutate: async (input) => {
      // Optimistic update so the bubble flips on tap — couples like
      // the instant feedback, and the trigger-driven notification
      // still fires authoritatively after the server insert lands.
      // Touches BOTH the per-target cache and (if inside a provider)
      // the bulk place-tree cache, otherwise the bubble would un-flip
      // on the next render while waiting for the bulk refetch.
      const key = reactionsKey(input.target);
      const bulkKey: readonly unknown[] | null = input.placeId
        ? (["reactions-by-place", input.placeId] as const)
        : null;
      await qc.cancelQueries({ queryKey: key });
      if (bulkKey) await qc.cancelQueries({ queryKey: bulkKey });
      const prev = qc.getQueryData<Reaction[]>(key) ?? [];
      const prevBulk = bulkKey
        ? (qc.getQueryData<Reaction[]>(bulkKey) ?? [])
        : null;
      const mine = prev.find(
        (r) => r.user_id === input.userId && r.emoji === input.emoji
      );
      const matchesTarget = (r: Reaction) => {
        if (input.target.kind === "memo") return r.memo_id === input.target.id;
        if (input.target.kind === "place") return r.place_id === input.target.id;
        return r.food_id === input.target.id;
      };
      if (mine) {
        qc.setQueryData<Reaction[]>(
          key,
          prev.filter((r) => r.id !== mine.id)
        );
        if (bulkKey && prevBulk) {
          qc.setQueryData<Reaction[]>(
            bulkKey,
            prevBulk.filter(
              (r) =>
                !(
                  matchesTarget(r) &&
                  r.user_id === input.userId &&
                  r.emoji === input.emoji
                )
            )
          );
        }
      } else {
        const optimistic: Reaction = {
          id: `optimistic-${crypto.randomUUID()}`,
          couple_id: input.coupleId,
          user_id: input.userId,
          emoji: input.emoji,
          memo_id: input.target.kind === "memo" ? input.target.id : null,
          place_id: input.target.kind === "place" ? input.target.id : null,
          food_id: input.target.kind === "food" ? input.target.id : null,
          created_at: new Date().toISOString(),
        };
        qc.setQueryData<Reaction[]>(key, [...prev, optimistic]);
        if (bulkKey && prevBulk) {
          qc.setQueryData<Reaction[]>(bulkKey, [...prevBulk, optimistic]);
        }
      }
      return { prev, key, prevBulk, bulkKey };
    },
    onError: (_err, _input, ctx) => {
      if (ctx) {
        qc.setQueryData(ctx.key, ctx.prev);
        if (ctx.bulkKey && ctx.prevBulk !== null) {
          qc.setQueryData(ctx.bulkKey, ctx.prevBulk);
        }
      }
    },
    onSettled: (_data, _err, input) => {
      void qc.invalidateQueries({ queryKey: reactionsKey(input.target) });
      // Also refresh the bulk place-tree fetch if the row is inside
      // a ReactionProvider — otherwise the batched buckets stay stale
      // and the just-flipped emoji would snap back on the next render.
      if (input.placeId) {
        void qc.invalidateQueries({
          queryKey: ["reactions-by-place", input.placeId],
        });
      }
    },
  });
}
