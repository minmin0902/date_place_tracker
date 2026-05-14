import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
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
//
// Optimistic: we patch the cached inbox row synchronously so the
// unread dot disappears the instant the user taps, and the page
// doesn't refetch the entire 14-day list. Without this, every tap
// triggered a full SELECT + render-wave on a 200+ row inbox, which
// was the main source of "click 시 끊김". The badge count still
// invalidates (cheap, count-only query).
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: string | string[]) => {
      const ids = Array.isArray(input) ? input : [input];
      if (ids.length === 0) return;
      const q = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() });
      const { error } =
        ids.length === 1 ? await q.eq("id", ids[0]) : await q.in("id", ids);
      if (error) throw error;
    },
    onMutate: async (input) => {
      const ids = Array.isArray(input) ? input : [input];
      const idSet = new Set(ids);
      const key = ["notifications", user?.id] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationRow[]>(key);
      if (prev) {
        const now = new Date().toISOString();
        qc.setQueryData<NotificationRow[]>(
          key,
          prev.map((n) =>
            idSet.has(n.id) && !n.read_at ? { ...n, read_at: now } : n
          )
        );
      }
      return { prev, key };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSuccess: () => {
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
    onMutate: async () => {
      const key = ["notifications", user?.id] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationRow[]>(key);
      if (prev) {
        const now = new Date().toISOString();
        qc.setQueryData<NotificationRow[]>(
          key,
          prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
        );
      }
      return { prev, key };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      qc.invalidateQueries({
        queryKey: ["notifications", "unread-count", user?.id],
      });
    },
  });
}
