import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WishlistPlace } from "@/lib/database.types";
import { useAuth } from "./useAuth";
import {
  getWishlist as getLocalWishlist,
  addWishlist as addLocalWishlist,
  deleteWishlist as deleteLocalWishlist,
  getWishlistItem as getLocalWishlistItem,
} from "@/lib/localDb";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

export function useWishlist(coupleId: string | undefined) {
  return useQuery({
    queryKey: ["wishlist", coupleId],
    enabled: !!coupleId,
    queryFn: async (): Promise<WishlistPlace[]> => {
      if (ALLOW_NO_AUTH) return getLocalWishlist(coupleId!);
      const { data, error } = await supabase
        .from("wishlist_places")
        .select("*")
        .eq("couple_id", coupleId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WishlistPlace[];
    },
  });
}

export function useAddWishlist() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      coupleId: string;
      name: string;
      category: string | null;
      memo: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    }) => {
      if (!user) throw new Error("not authenticated");
      if (ALLOW_NO_AUTH) {
        return addLocalWishlist({
          coupleId: input.coupleId,
          userId: user.id,
          name: input.name,
          category: input.category,
          memo: input.memo,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
        });
      }
      const { data, error } = await supabase
        .from("wishlist_places")
        .insert({
          couple_id: input.coupleId,
          name: input.name,
          category: input.category,
          memo: input.memo,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WishlistPlace;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist"] }),
  });
}

export function useDeleteWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (ALLOW_NO_AUTH) return deleteLocalWishlist(id);
      const { error } = await supabase
        .from("wishlist_places")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlist"] }),
  });
}

// Move an existing place row back into the wishlist — for when a
// place was logged ("다녀왔어요") prematurely and the user actually
// wants it sitting in 가볼래 again. Inserts a wishlist row from the
// place's metadata, then deletes the place (cascades drop foods +
// memos + notifications by FK on delete cascade).
//
// We don't try to be clever here — the user has explicitly opted in
// via a confirm dialog, so destructive cleanup of the place row is
// the desired effect.
export function useMovePlaceToWishlist() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      placeId: string;
      coupleId: string;
      name: string;
      category: string | null;
      memo: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    }) => {
      if (!user) throw new Error("not authenticated");
      if (ALLOW_NO_AUTH) {
        // localDb mode: best-effort mirror — add to wishlist, drop
        // the place via the existing local helper.
        const { deletePlace } = await import("@/lib/localDb");
        addLocalWishlist({
          coupleId: input.coupleId,
          userId: user.id,
          name: input.name,
          category: input.category,
          memo: input.memo,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
        });
        deletePlace(input.placeId);
        return;
      }
      // Two-step: insert wishlist first, then delete place. Order
      // matters — if the place delete failed AFTER the wishlist
      // insert, we'd have a duplicate to clean up by hand, but the
      // user wouldn't lose data. The reverse order would risk losing
      // the place metadata if the wishlist insert later failed.
      const { error: insertErr } = await supabase
        .from("wishlist_places")
        .insert({
          couple_id: input.coupleId,
          name: input.name,
          category: input.category,
          memo: input.memo,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          created_by: user.id,
        });
      if (insertErr) throw insertErr;
      const { error: deleteErr } = await supabase
        .from("places")
        .delete()
        .eq("id", input.placeId);
      if (deleteErr) throw deleteErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      qc.invalidateQueries({ queryKey: ["places"] });
    },
  });
}

// Fetch a single wishlist item — used by PlaceFormPage to prefill when a
// user clicks "다녀왔어요" on a wishlist card.
export async function fetchWishlistItem(
  id: string
): Promise<WishlistPlace | null> {
  if (ALLOW_NO_AUTH) return getLocalWishlistItem(id);
  const { data, error } = await supabase
    .from("wishlist_places")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as WishlistPlace | null;
}
