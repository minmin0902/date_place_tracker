import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, PHOTO_BUCKET } from "@/lib/supabase";
import type { Food, Place } from "@/lib/database.types";
import {
  getPlaces as getLocalPlaces,
  getPlace as getLocalPlace,
  upsertPlace as upsertLocalPlace,
  deletePlace as deleteLocalPlace,
  upsertFood as upsertLocalFood,
  deleteFood as deleteLocalFood,
  uploadPhoto as uploadLocalPhoto,
} from "@/lib/localDb";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

export type PlaceWithFoods = Place & { foods: Food[] };

export function usePlaces(coupleId: string | undefined) {
  return useQuery({
    queryKey: ["places", coupleId],
    enabled: !!coupleId,
    queryFn: async (): Promise<PlaceWithFoods[]> => {
      if (ALLOW_NO_AUTH) {
        const places = getLocalPlaces(coupleId!);
        // attach foods from local DB is omitted for brevity (UI expects foods array)
        // The local DB stores foods separately; consumer should query them via place endpoint.
        return (places as unknown as PlaceWithFoods[]) ?? [];
      }
      const { data, error } = await supabase
        .from("places")
        .select("*, foods(*)")
        .eq("couple_id", coupleId!)
        .order("date_visited", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlaceWithFoods[];
    },
  });
}

export function usePlace(id: string | undefined) {
  return useQuery({
    queryKey: ["place", id],
    enabled: !!id,
    queryFn: async (): Promise<PlaceWithFoods | null> => {
      if (ALLOW_NO_AUTH) {
        const p = getLocalPlace(id!);
        if (!p) return null;
        return p as unknown as PlaceWithFoods;
      }
      const { data, error } = await supabase
        .from("places")
        .select("*, foods(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as PlaceWithFoods | null;
    },
  });
}

export function useUpsertPlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      coupleId: string;
      userId: string;
      values: {
        name: string;
        date_visited: string;
        address: string | null;
        category: string | null;
        memo: string | null;
        want_to_revisit: boolean;
        is_home_cooked?: boolean;
        latitude: number | null;
        longitude: number | null;
        photo_urls: string[] | null;
      };
    }) => {
      if (ALLOW_NO_AUTH) {
        return upsertLocalPlace(input);
      }
      if (input.id) {
        const { data, error } = await supabase
          .from("places")
          .update(input.values)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("places")
        .insert({
          ...input.values,
          couple_id: input.coupleId,
          created_by: input.userId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["places"] });
      qc.invalidateQueries({ queryKey: ["place"] });
    },
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (ALLOW_NO_AUTH) return deleteLocalPlace(id);
      const { error } = await supabase.from("places").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["places"] }),
  });
}

export function useUpsertFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      place_id: string;
      values: {
        name: string;
        my_rating: number | null;
        partner_rating: number | null;
        category: string | null;
        memo: string | null;
        photo_url: string | null;
        photo_urls: string[] | null;
        chef?: "me" | "partner" | "together" | null;
        // Set on insert so we know which partner authored this food
        // for the per-viewer rating swap. Left out of updates so we
        // never accidentally rewrite the original author.
        created_by?: string | null;
        is_solo?: boolean;
        eater?: "both" | "creator" | "partner";
      };
    }) => {
      if (ALLOW_NO_AUTH) return upsertLocalFood(input);
      if (input.id) {
        const { data, error } = await supabase
          .from("foods")
          .update(input.values)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("foods")
        .insert({ ...input.values, place_id: input.place_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["place"] });
      qc.invalidateQueries({ queryKey: ["places"] });
    },
  });
}

export function useDeleteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (ALLOW_NO_AUTH) return deleteLocalFood(id);
      const { error } = await supabase.from("foods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["place"] });
      qc.invalidateQueries({ queryKey: ["places"] });
    },
  });
}

export async function uploadPhoto(file: File, coupleId: string): Promise<string> {
  if (ALLOW_NO_AUTH) {
    return uploadLocalPhoto(file, coupleId);
  }
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${coupleId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
