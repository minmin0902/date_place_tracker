import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  addMemo as addLocalMemo,
  deleteMemo as deleteLocalMemo,
  getMemos as getLocalMemos,
} from "@/lib/localDb";
import type { Memo } from "@/lib/database.types";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

// Cache key the detail page uses so a successful add/delete refreshes
// the right thread without invalidating every memo query in the app.
function memoKey(target: { placeId?: string; foodId?: string }) {
  return ["memos", target.placeId ?? null, target.foodId ?? null] as const;
}

// Read the thread for a given place OR food. Pass exactly one — the
// XOR is enforced at the DB layer, but the hook accepts both as
// optional so call sites can branch on which detail row they're on.
export function useMemos(target: { placeId?: string; foodId?: string }) {
  const enabled = !!(target.placeId || target.foodId);
  return useQuery({
    queryKey: memoKey(target),
    enabled,
    queryFn: async (): Promise<Memo[]> => {
      if (ALLOW_NO_AUTH) {
        return getLocalMemos(target);
      }
      let q = supabase
        .from("memos")
        .select("*")
        .order("created_at", { ascending: true });
      if (target.placeId) q = q.eq("place_id", target.placeId);
      else if (target.foodId) q = q.eq("food_id", target.foodId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Memo[];
    },
  });
}

export function useAddMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      coupleId: string;
      placeId?: string | null;
      foodId?: string | null;
      authorId: string;
      body: string;
    }): Promise<Memo> => {
      const body = input.body.trim();
      if (!body) throw new Error("empty memo");
      if (ALLOW_NO_AUTH) {
        return addLocalMemo({ ...input, body });
      }
      const { data, error } = await supabase
        .from("memos")
        .insert({
          couple_id: input.coupleId,
          place_id: input.placeId ?? null,
          food_id: input.foodId ?? null,
          author_id: input.authorId,
          body,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Memo;
    },
    onSuccess: (memo) => {
      qc.invalidateQueries({
        queryKey: memoKey({
          placeId: memo.place_id ?? undefined,
          foodId: memo.food_id ?? undefined,
        }),
      });
    },
  });
}

export function useDeleteMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memo: Memo): Promise<Memo> => {
      if (ALLOW_NO_AUTH) {
        deleteLocalMemo(memo.id);
        return memo;
      }
      const { error } = await supabase.from("memos").delete().eq("id", memo.id);
      if (error) throw error;
      return memo;
    },
    onSuccess: (memo) => {
      qc.invalidateQueries({
        queryKey: memoKey({
          placeId: memo.place_id ?? undefined,
          foodId: memo.food_id ?? undefined,
        }),
      });
    },
  });
}
