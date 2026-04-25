import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { NotificationRow } from "@/lib/database.types";
import { useAuth } from "./useAuth";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

// Read the current user's inbox. Newest first.
// Limited to 50 — enough for the inbox view, no infinite scroll yet
// (a couple's app generates a few notifications a day, not hundreds).
export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user && !ALLOW_NO_AUTH,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

// Lightweight count-only hook for the bell badge. Reads the unread
// pushdown count without pulling 50 rows. Fires more often (every
// page nav) than useNotifications, so we keep the payload small.
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", "unread-count", user?.id],
    enabled: !!user && !ALLOW_NO_AUTH,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    // Refresh whenever the inbox tab gets focus so the badge tracks
    // notifications that arrived via push while the user was away.
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

// Flip a single row's read_at. Use this when the user taps a row to
// open the linked content.
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      qc.invalidateQueries({
        queryKey: ["notifications", "unread-count", user?.id],
      });
    },
  });
}

// "Mark all read" — used by the inbox page footer button so users
// can clear the badge without opening every row.
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      qc.invalidateQueries({
        queryKey: ["notifications", "unread-count", user?.id],
      });
    },
  });
}
