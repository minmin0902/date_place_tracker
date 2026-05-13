import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { NotificationRow } from "@/lib/database.types";
import { useAuth } from "./useAuth";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

// Read the current user's inbox — last 14 days, newest first.
// Time-window instead of a hard 50-row cap so a busy day doesn't
// truncate the same day's activity mid-stream. 500-row safety
// ceiling is just a guardrail against pathological scenarios; in
// practice a couple's inbox rarely exceeds ~100 events / two weeks.
const INBOX_DAYS = 14;
export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user && !ALLOW_NO_AUTH,
    queryFn: async (): Promise<NotificationRow[]> => {
      const since = new Date(
        Date.now() - INBOX_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
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
