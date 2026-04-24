import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { generateInviteCode } from "@/lib/utils";
import type { Couple } from "@/lib/database.types";
import { useAuth } from "./useAuth";
import {
  getCoupleByUserId as getLocalCoupleByUserId,
  createCouple as createLocalCouple,
  joinCoupleByCode as joinLocalCoupleByCode,
} from "@/lib/localDb";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

export function useCouple() {
  const { user } = useAuth();
  if (ALLOW_NO_AUTH) {
    return useQuery({
      queryKey: ["couple", user?.id],
      enabled: !!user,
      queryFn: async (): Promise<Couple | null> => {
        return getLocalCoupleByUserId(user!.id) ?? null;
      },
    });
  }

  return useQuery({
    queryKey: ["couple", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Couple | null> => {
      const { data, error } = await supabase
        .from("couples")
        .select("*")
        .or(`user1_id.eq.${user!.id},user2_id.eq.${user!.id}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCouple() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not authenticated");
      if (ALLOW_NO_AUTH) {
        return createLocalCouple(user.id);
      }
      const invite_code = generateInviteCode(6);
      const { data, error } = await supabase
        .from("couples")
        .insert({ user1_id: user.id, invite_code })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couple"] }),
  });
}

export function useJoinCouple() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      if (ALLOW_NO_AUTH) {
        // in no-auth mode, use local join; grab user id from local storage
        const userId = localStorage.getItem("local_user_id");
        if (!userId) throw new Error("no local user");
        return joinLocalCoupleByCode(code.trim().toUpperCase(), userId);
      }
      const { data, error } = await supabase.rpc("join_couple", {
        p_invite_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couple"] }),
  });
}
