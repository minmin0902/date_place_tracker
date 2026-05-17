import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  MessageCircle,
  MapPin,
  Play,
  Utensils,
  CheckCheck,
  Heart,
  Star,
  Plus,
  RefreshCw,
  Check,
  Smile,
  CornerDownRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PullIndicator } from "@/components/PullIndicator";
import { useRefreshControls } from "@/hooks/useRefreshControls";
import { useSessionState } from "@/hooks/useSessionState";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import { useActorDisplay } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { supabase } from "@/lib/supabase";
import { pickLanguage } from "@/lib/language";
import { isVideoUrl, ratingsForViewer } from "@/lib/utils";
import type {
  Food,
  Memo as MemoRow,
  NotificationRow,
  Reaction,
} from "@/lib/database.types";

// Resolver for "what does this notification belong to?". Built once
// from the places list at the top of the page and made available to
// every row via context, so a 50-row inbox doesn't fire 50 lookups.
// Returns names AND the primary memo set at creation, so a "메뉴
// 추가 · Fried土豆" row can also surface "바삭바삭 맛있었어" right
// next to it without a separate fetch.
type ContextResolver = {
  placeNameOf: (placeId: string | null | undefined) => string | null;
  foodNameOf: (foodId: string | null | undefined) => string | null;
  placeMemoOf: (placeId: string | null | undefined) => string | null;
  foodMemoOf: (foodId: string | null | undefined) => string | null;
  placePhotoOf: (placeId: string | null | undefined) => string | null;
  foodPhotoOf: (foodId: string | null | undefined) => string | null;
  foodRatingOf: (
    foodId: string | null | undefined,
    actorId: string | null | undefined
  ) => number | null;
  memoTextOf: (memoId: string | null | undefined) => string | null;
  parentMemoTextOf: (memoId: string | null | undefined) => string | null;
  memoPhotoOf: (memoId: string | null | undefined) => string | null;
  // Back-derive the parent place from a food. Memo / reaction
  // notifications that target a food carry food_id but NULL
  // place_id (the underlying memos.place_id column is xor'd with
  // memos.food_id at the DB level). Without this lookup the
  // notification rows showed up without place context and bypassed
  // the place×day bundling.
  foodPlaceIdOf: (foodId: string | null | undefined) => string | null;
  foodPlaceNameOf: (foodId: string | null | undefined) => string | null;
};
const RowContext = createContext<ContextResolver>({
  placeNameOf: () => null,
  foodNameOf: () => null,
  placeMemoOf: () => null,
  foodMemoOf: () => null,
  placePhotoOf: () => null,
  foodPhotoOf: () => null,
  foodRatingOf: () => null,
  memoTextOf: () => null,
  parentMemoTextOf: () => null,
  memoPhotoOf: () => null,
  foodPlaceIdOf: () => null,
  foodPlaceNameOf: () => null,
});
function useRowContext() {
  return useContext(RowContext);
}

function useNotificationMemoLookup(items: NotificationRow[] | undefined) {
  const memoIds = useMemo(
    () =>
      Array.from(
        new Set(
          (items ?? [])
            .map((n) => n.memo_id)
            .filter((id): id is string => !!id)
        )
      ),
    [items]
  );

  return useQuery({
    queryKey: ["notifications", "memo-lookup", memoIds],
    enabled: memoIds.length > 0,
    queryFn: async (): Promise<Map<string, MemoRow>> => {
      const { data, error } = await supabase
        .from("memos")
        .select("*")
        .in("id", memoIds);
      if (error) throw error;
      const rows = (data ?? []) as MemoRow[];
      const parentIds = Array.from(
        new Set(rows.map((m) => m.parent_id).filter((id): id is string => !!id))
      );
      let parents: MemoRow[] = [];
      if (parentIds.length > 0) {
        const { data: parentData, error: parentError } = await supabase
          .from("memos")
          .select("*")
          .in("id", parentIds);
        if (parentError) throw parentError;
        parents = (parentData ?? []) as MemoRow[];
      }
      return new Map([...rows, ...parents].map((m) => [m.id, m]));
    },
    staleTime: 30_000,
  });
}

type ReactionLookupRow = Pick<
  Reaction,
  "user_id" | "emoji" | "memo_id" | "food_id" | "place_id"
>;

function reactionNotificationKey(n: NotificationRow): string | null {
  if (n.kind !== "reaction" || !n.preview) return null;
  if (n.memo_id) return `memo:${n.memo_id}|${n.actor_id}|${n.preview}`;
  if (n.food_id) return `food:${n.food_id}|${n.actor_id}|${n.preview}`;
  if (n.place_id) return `place:${n.place_id}|${n.actor_id}|${n.preview}`;
  return null;
}

function liveReactionKey(r: ReactionLookupRow): string | null {
  if (r.memo_id) return `memo:${r.memo_id}|${r.user_id}|${r.emoji}`;
  if (r.food_id) return `food:${r.food_id}|${r.user_id}|${r.emoji}`;
  if (r.place_id) return `place:${r.place_id}|${r.user_id}|${r.emoji}`;
  return null;
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function useLiveReactionLookup(items: NotificationRow[] | undefined) {
  const reactionItems = useMemo(
    () => (items ?? []).filter((n) => n.kind === "reaction"),
    [items]
  );
  const lookupKeys = useMemo(
    () =>
      reactionItems
        .map(reactionNotificationKey)
        .filter((k): k is string => !!k)
        .sort(),
    [reactionItems]
  );

  return useQuery({
    queryKey: ["notifications", "live-reactions", lookupKeys],
    enabled: lookupKeys.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const memoIds = uniq(
        reactionItems
          .map((n) => n.memo_id)
          .filter((id): id is string => !!id)
      );
      const foodIds = uniq(
        reactionItems
          .filter((n) => !n.memo_id)
          .map((n) => n.food_id)
          .filter((id): id is string => !!id)
      );
      const placeIds = uniq(
        reactionItems
          .filter((n) => !n.memo_id && !n.food_id)
          .map((n) => n.place_id)
          .filter((id): id is string => !!id)
      );

      const rows: ReactionLookupRow[] = [];
      if (memoIds.length > 0) {
        const { data, error } = await supabase
          .from("reactions")
          .select("user_id,emoji,memo_id,food_id,place_id")
          .in("memo_id", memoIds);
        if (error) throw error;
        rows.push(...((data ?? []) as ReactionLookupRow[]));
      }
      if (foodIds.length > 0) {
        const { data, error } = await supabase
          .from("reactions")
          .select("user_id,emoji,memo_id,food_id,place_id")
          .in("food_id", foodIds);
        if (error) throw error;
        rows.push(...((data ?? []) as ReactionLookupRow[]));
      }
      if (placeIds.length > 0) {
        const { data, error } = await supabase
          .from("reactions")
          .select("user_id,emoji,memo_id,food_id,place_id")
          .in("place_id", placeIds);
        if (error) throw error;
        rows.push(...((data ?? []) as ReactionLookupRow[]));
      }

      return new Set(
        rows.map(liveReactionKey).filter((k): k is string => !!k)
      );
    },
    staleTime: 10_000,
  });
}

function markReadAfterNavigation(
  markRead: ReturnType<typeof useMarkNotificationRead>,
  ids: string[]
) {
  if (ids.length === 0 || markRead.isPending) return;
  window.setTimeout(() => {
    void markRead.mutateAsync(ids);
  }, 0);
}

// Per-kind visual spec for the avatar-corner badge. The badge tells
// the user what happened before they read the short row headline.
type KindSpec = {
  // lucide icon shown in the avatar-corner badge
  Icon: typeof Bell;
  // Tailwind bg-* for the badge fill
  bg: string;
};
function kindSpec(kind: NotificationRow["kind"]): KindSpec {
  switch (kind) {
    case "place":
      return {
        Icon: MapPin,
        bg: "bg-emerald-500",
      };
    case "food":
      return {
        Icon: Utensils,
        bg: "bg-amber-500",
      };
    case "memo":
      return {
        Icon: MessageCircle,
        bg: "bg-sky-500",
      };
    case "memo_thread":
      return {
        Icon: MessageCircle,
        bg: "bg-sky-500",
      };
    case "memo_reply":
      return {
        Icon: CornerDownRight,
        bg: "bg-indigo-500",
      };
    case "reaction":
      return {
        Icon: Smile,
        bg: "bg-rose-500",
      };
    case "revisit":
      return {
        Icon: Heart,
        bg: "bg-pink-500",
      };
    case "rating":
      return {
        Icon: Star,
        bg: "bg-yellow-500",
      };
  }
}

function thumbnailFor(item: NotificationRow, ctx: ContextResolver): string | null {
  if (item.memo_id) {
    const memoPhoto = ctx.memoPhotoOf(item.memo_id);
    if (memoPhoto) return memoPhoto;
  }
  if (item.food_id) {
    const foodPhoto = ctx.foodPhotoOf(item.food_id);
    if (foodPhoto) return foodPhoto;
  }
  const placeId = item.place_id ?? ctx.foodPlaceIdOf(item.food_id);
  return ctx.placePhotoOf(placeId);
}

function clipText(s: string, n = 64) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function quoteText(s: string, n = 64) {
  return `"${clipText(s, n)}"`;
}

function formatRatingScore(score: number) {
  return Number.isInteger(score)
    ? String(score)
    : score.toFixed(1).replace(/\.0$/, "");
}

function ratingScoreFor(item: NotificationRow, ctx: ContextResolver) {
  if (item.kind !== "rating" || !item.food_id) return null;
  const score = ctx.foodRatingOf(item.food_id, item.actor_id);
  return score == null ? null : formatRatingScore(score);
}

function NotificationThumb({
  src,
  label,
}: {
  src: string | null;
  label?: string | null;
}) {
  if (!src) {
    return (
      <span
        className="w-12 h-12 rounded-xl bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-300 flex-shrink-0"
        aria-hidden
      >
        <MapPin className="w-5 h-5" />
      </span>
    );
  }
  if (isVideoUrl(src)) {
    return (
      <span
        className="w-12 h-12 rounded-xl bg-ink-900/80 border border-cream-200 flex items-center justify-center text-white flex-shrink-0"
        aria-label={label ?? "video"}
      >
        <Play className="w-4 h-4 fill-current" />
      </span>
    );
  }
  return (
    <span className="w-12 h-12 rounded-xl overflow-hidden border border-cream-200 bg-cream-100 flex-shrink-0">
      <img
        src={src}
        alt={label ?? ""}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

// Small circular badge anchored to the bottom-right corner of an
// avatar. Background color + icon together communicate WHAT happened
// (vs the avatar communicating WHO did it). ring-white separates the
// badge from the avatar edge so it doesn't bleed into the photo.
function KindBadge({ kind }: { kind: NotificationRow["kind"] }) {
  const spec = kindSpec(kind);
  const Icon = spec.Icon;
  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white text-white ${spec.bg}`}
      aria-hidden
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2.5} />
    </span>
  );
}

// Filter buckets — keep the chip row quiet: text conversations,
// emoji reactions, and record changes are different scanning jobs.
// Rating / revisit / place / menu changes live under "기록/记录";
// reactions stay separate so the low-priority noise can be skimmed
// without hiding replies.
type FilterKey = "all" | "memo" | "reaction" | "record";
type InboxMode = "all" | "unread";

const FILTER_CHIPS: { key: FilterKey; ko: string; zh: string; icon: typeof Bell }[] = [
  { key: "all", ko: "전체", zh: "全部", icon: Bell },
  { key: "memo", ko: "댓글", zh: "留言", icon: MessageCircle },
  { key: "reaction", ko: "이모지", zh: "表情", icon: Smile },
  { key: "record", ko: "기록", zh: "记录", icon: Plus },
];

function isFilterKey(value: string): value is FilterKey {
  return FILTER_CHIPS.some((c) => c.key === value);
}

// ReactionBundle — Instagram-style grouping for emoji taps. Several
// reaction rows against the same place / food / memo collapse into a
// single quiet row with one thumbnail on the right.
type ReactionBundle = {
  kind: "reaction-bundle";
  key: string;
  items: NotificationRow[];
  latest: NotificationRow;
  actorIds: string[];
  emojis: string[];
  placeId: string | null;
  foodId: string | null;
  memoId: string | null;
};

// Date section header — emitted whenever we cross a day boundary
// walking the (newest-first) feed. Same shape regardless of locale;
// the renderer picks ko/zh based on context.
type DateHeader = {
  kind: "date-header";
  key: string;
  ko: string;
  zh: string;
};

type DisplayRow =
  | DateHeader
  | { kind: "single"; item: NotificationRow }
  | ReactionBundle;

const NOTIFICATION_INITIAL_ROW_COUNT = 10;
const NOTIFICATION_ROW_BATCH = 10;
const NOTIFICATION_ROW_LIMIT_KEY_PREFIX =
  "route-ui:notifications:visible-row-limit:v1";

function displayRowKey(row: DisplayRow) {
  if (row.kind === "date-header") return `hdr-${row.key}`;
  if (row.kind === "single") return row.item.id;
  return row.key;
}

function estimateDisplayRowSize(row: DisplayRow | undefined) {
  if (!row) return 92;
  if (row.kind === "date-header") return 28;
  if (row.kind === "reaction-bundle") return 108;
  return row.item.kind === "memo_reply" ? 104 : 88;
}

// Resolve a date into a friendly day label. "오늘"/"어제" for the
// last two days (most-frequent case in a couple's inbox), absolute
// "M월 D일 · M月D日" for anything older. Uses local time so the
// boundary matches the user's clock, not UTC.
function dateLabelFor(iso: string): { key: string; ko: string; zh: string } {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 86400000;
  const itemDay = startOfDay(d);
  if (itemDay === today) return { key: "today", ko: "오늘", zh: "今天" };
  if (itemDay === yesterday) return { key: "yesterday", ko: "어제", zh: "昨天" };
  const mo = d.getMonth() + 1;
  const da = d.getDate();
  return {
    key: `${d.getFullYear()}-${mo}-${da}`,
    ko: `${mo}월 ${da}일`,
    zh: `${mo}月${da}日`,
  };
}

function matchesFilter(kind: NotificationRow["kind"], filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "memo") {
    return kind === "memo" || kind === "memo_thread" || kind === "memo_reply";
  }
  if (filter === "reaction") return kind === "reaction";
  if (filter === "record") {
    return (
      kind === "place" ||
      kind === "food" ||
      kind === "rating" ||
      kind === "revisit"
    );
  }
  return true;
}

function notificationRowLimitStorageKey(mode: InboxMode, filter: FilterKey) {
  return `${NOTIFICATION_ROW_LIMIT_KEY_PREFIX}:${mode}:${filter}`;
}

function readNotificationRowLimit(storageKey: string) {
  if (typeof window === "undefined") return NOTIFICATION_INITIAL_ROW_COUNT;
  const raw = window.sessionStorage.getItem(storageKey);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return NOTIFICATION_INITIAL_ROW_COUNT;
  return Math.max(NOTIFICATION_INITIAL_ROW_COUNT, parsed);
}

function writeNotificationRowLimit(storageKey: string, limit: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    storageKey,
    String(Math.max(NOTIFICATION_INITIAL_ROW_COUNT, limit))
  );
}

function useProgressiveNotificationRows(
  rows: DisplayRow[],
  storageKey: string
) {
  const [rowLimit, setRowLimit] = useState(() =>
    readNotificationRowLimit(storageKey)
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRowLimit(readNotificationRowLimit(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (rows.length === 0) return;
    const maxLimit = Math.max(rows.length, NOTIFICATION_INITIAL_ROW_COUNT);
    writeNotificationRowLimit(storageKey, Math.min(rowLimit, maxLimit));
  }, [rowLimit, rows.length, storageKey]);

  const revealMore = useCallback(() => {
    setRowLimit((current) =>
      Math.min(
        rows.length,
        Math.max(current, NOTIFICATION_INITIAL_ROW_COUNT) +
          NOTIFICATION_ROW_BATCH
      )
    );
  }, [rows.length]);

  useEffect(() => {
    if (rowLimit >= rows.length) return;
    const node = sentinelRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      const onScroll = () => {
        const remaining =
          document.documentElement.scrollHeight -
          (window.scrollY + window.innerHeight);
        if (remaining < 900) revealMore();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return () => window.removeEventListener("scroll", onScroll);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) revealMore();
      },
      { rootMargin: "800px 0px 1000px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [revealMore, rowLimit, rows.length]);

  const visibleRows = useMemo(
    () => rows.slice(0, Math.min(rowLimit, rows.length)),
    [rowLimit, rows]
  );

  return {
    visibleRows,
    visibleCount: visibleRows.length,
    hasMore: rowLimit < rows.length,
    sentinelRef,
  };
}

// Inbox: every notification triggered for the current user. Tapping
// a row marks it read and deep-links to the source content. A "전부
// 읽음" footer button clears the badge in one shot.
export default function NotificationsPage() {
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  const qc = useQueryClient();
  const { data: items, isLoading } = useNotifications();
  useUnreadCount();
  const markAll = useMarkAllNotificationsRead();
  const { user } = useAuth();
  const refreshAll = useCallback(() => {
    const opts = { refetchType: "active" as const };
    const userId = user?.id;
    return Promise.all([
      qc.invalidateQueries({ queryKey: ["notifications", userId], ...opts }),
      qc.invalidateQueries({
        queryKey: ["notifications", "unread-count", userId],
        ...opts,
      }),
      qc.invalidateQueries({
        queryKey: ["notifications", "memo-lookup"],
        ...opts,
      }),
      qc.invalidateQueries({
        queryKey: ["notifications", "live-reactions"],
        ...opts,
      }),
      qc.invalidateQueries({ queryKey: ["places"], ...opts }),
      qc.invalidateQueries({ queryKey: ["profile"], ...opts }),
    ]);
  }, [qc, user?.id]);
  const {
    pull,
    refreshing,
    manualRefreshing,
    released,
    justFinished,
    onManualRefresh,
  } = useRefreshControls(refreshAll);
  const [filter, setFilter] = useSessionState<FilterKey>(
    "route-ui:notifications:filter:v1",
    "all"
  );
  const [mode, setMode] = useSessionState<InboxMode>(
    "route-ui:notifications:mode:v1",
    "all"
  );
  const activeFilter = isFilterKey(filter) ? filter : "all";
  useEffect(() => {
    if (activeFilter !== filter) setFilter(activeFilter);
  }, [activeFilter, filter, setFilter]);
  // Filter chip taps re-bucket displayRows (Map-heavy useMemo) and
  // remount every row underneath. Marking the setFilter as a
  // transition lets React 18 yield to user input first, so the
  // active-chip highlight flips instantly while the list catches
  // up over the next frames instead of blocking the tap.
  const [, startTransition] = useTransition();

  // Resolve parent context (which place / which food) for each
  // notification. Loaded once; react-query dedupes against the home
  // page's usePlaces call so this is free for any user who's already
  // visited home this session. Cached → memoized maps keep per-row
  // lookups O(1).
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const { data: memoLookup } = useNotificationMemoLookup(items);
  const { data: liveReactionKeys } = useLiveReactionLookup(items);
  const rowContext = useMemo<ContextResolver>(() => {
    const placeNameById = new Map<string, string>();
    const foodNameById = new Map<string, string>();
    const placeMemoById = new Map<string, string>();
    const foodMemoById = new Map<string, string>();
    const placePhotoById = new Map<string, string>();
    const foodPhotoById = new Map<string, string>();
    const foodById = new Map<string, Food>();
    // Food → parent place reverse index so we can recover place
    // context for food-scoped memos / reactions whose notification
    // row has NULL place_id.
    const foodPlaceIdByFoodId = new Map<string, string>();
    for (const p of places ?? []) {
      placeNameById.set(p.id, p.name);
      if (p.memo && p.memo.trim()) placeMemoById.set(p.id, p.memo.trim());
      const placePhoto = p.photo_urls?.[0];
      if (placePhoto) placePhotoById.set(p.id, placePhoto);
      for (const f of p.foods ?? []) {
        foodById.set(f.id, f);
        foodNameById.set(f.id, f.name);
        foodPlaceIdByFoodId.set(f.id, p.id);
        if (f.memo && f.memo.trim())
          foodMemoById.set(f.id, f.memo.trim());
        const foodPhoto = f.photo_urls?.[0] ?? f.photo_url;
        if (foodPhoto) foodPhotoById.set(f.id, foodPhoto);
      }
    }
    return {
      placeNameOf: (id) => (id ? (placeNameById.get(id) ?? null) : null),
      foodNameOf: (id) => (id ? (foodNameById.get(id) ?? null) : null),
      placeMemoOf: (id) => (id ? (placeMemoById.get(id) ?? null) : null),
      foodMemoOf: (id) => (id ? (foodMemoById.get(id) ?? null) : null),
      placePhotoOf: (id) => (id ? (placePhotoById.get(id) ?? null) : null),
      foodPhotoOf: (id) => (id ? (foodPhotoById.get(id) ?? null) : null),
      foodRatingOf: (foodId, actorId) => {
        if (!foodId || !actorId) return null;
        const food = foodById.get(foodId);
        if (!food) return null;
        return ratingsForViewer(food, actorId).myRating;
      },
      memoTextOf: (id) => {
        if (!id) return null;
        return memoLookup?.get(id)?.body ?? null;
      },
      parentMemoTextOf: (id) => {
        if (!id) return null;
        const memo = memoLookup?.get(id);
        return memo?.parent_id ? (memoLookup?.get(memo.parent_id)?.body ?? null) : null;
      },
      memoPhotoOf: (id) => {
        if (!id) return null;
        return memoLookup?.get(id)?.photo_urls?.[0] ?? null;
      },
      foodPlaceIdOf: (id) =>
        id ? (foodPlaceIdByFoodId.get(id) ?? null) : null,
      foodPlaceNameOf: (id) => {
        if (!id) return null;
        const pid = foodPlaceIdByFoodId.get(id);
        return pid ? (placeNameById.get(pid) ?? null) : null;
      },
    };
  }, [places, memoLookup]);

  const allItems = useMemo(() => {
    const raw = items ?? [];
    if (!liveReactionKeys) return raw;
    return raw.filter((n) => {
      if (n.kind !== "reaction") return true;
      const key = reactionNotificationKey(n);
      return key ? liveReactionKeys.has(key) : false;
    });
  }, [items, liveReactionKeys]);
  const unreadItems = useMemo(
    () => allItems.filter((n) => !n.read_at),
    [allItems]
  );
  const unreadCount = unreadItems.length;
  const sourceItems = mode === "unread" ? unreadItems : allItems;

  // Counts per filter bucket so each chip can show "(n)" — gives the
  // user a quick read on what's piled up without tapping each chip.
  const filterCounts = useMemo(() => {
    const out: Record<FilterKey, number> = {
      all: 0,
      memo: 0,
      reaction: 0,
      record: 0,
    };
    for (const n of sourceItems) {
      out.all += 1;
      for (const c of FILTER_CHIPS) {
        if (c.key !== "all" && matchesFilter(n.kind, c.key)) out[c.key] += 1;
      }
    }
    return out;
  }, [sourceItems]);

  const visibleItems = useMemo(() => {
    if (activeFilter === "all") return sourceItems;
    return sourceItems.filter((n) => matchesFilter(n.kind, activeFilter));
  }, [sourceItems, activeFilter]);

  // Display rows = date headers + detailed event rows. Records
  // (new place, menu, rating, revisit) deliberately stay separate so
  // the feed reads "who did what" without a parent/child card shape.
  // Emoji reactions are the only bundled surface because repeated
  // taps are low-priority noise.
  const displayRows = useMemo<DisplayRow[]>(() => {
    const out: DisplayRow[] = [];
    const reactionBundles = new Map<string, ReactionBundle>();
    let currentDateKey: string | null = null;

    for (const n of visibleItems) {
      const label = dateLabelFor(n.created_at);
      if (label.key !== currentDateKey) {
        out.push({
          kind: "date-header",
          key: label.key,
          ko: label.ko,
          zh: label.zh,
        });
        currentDateKey = label.key;
        // Reaction bundles only span one date section. Clearing here
        // keeps yesterday's emoji taps separate from today's.
        reactionBundles.clear();
      }

      const effectivePlaceId =
        n.place_id ?? rowContext.foodPlaceIdOf(n.food_id);

      if (n.kind === "reaction") {
        const targetKey =
          n.memo_id ??
          (n.food_id ? `food:${n.food_id}` : null) ??
          (effectivePlaceId ? `place:${effectivePlaceId}` : n.id);
        const k = `${label.key}|reaction|${targetKey}`;
        let b = reactionBundles.get(k);
        if (!b) {
          b = {
            kind: "reaction-bundle",
            key: k,
            items: [],
            latest: n,
            actorIds: [],
            emojis: [],
            placeId: effectivePlaceId,
            foodId: n.food_id,
            memoId: n.memo_id,
          };
          reactionBundles.set(k, b);
          out.push(b);
        }
        b.items.push(n);
        if (n.actor_id && !b.actorIds.includes(n.actor_id)) {
          b.actorIds.push(n.actor_id);
        }
        if (n.preview && !b.emojis.includes(n.preview)) {
          b.emojis.push(n.preview);
        }
        continue;
      }

      out.push({ kind: "single", item: n });
    }

    return out;
  }, [visibleItems, rowContext]);

  const rowLimitStorageKey = useMemo(
    () => notificationRowLimitStorageKey(mode, activeFilter),
    [mode, activeFilter]
  );
  const progressiveRows = useProgressiveNotificationRows(
    displayRows,
    rowLimitStorageKey
  );
  const visibleDisplayRows = progressiveRows.visibleRows;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [listTop, setListTop] = useState(0);
  useLayoutEffect(() => {
    const measureTop = () => {
      const el = listRef.current;
      if (!el) return;
      setListTop(el.getBoundingClientRect().top + window.scrollY);
    };
    measureTop();
    window.addEventListener("resize", measureTop);
    return () => window.removeEventListener("resize", measureTop);
  }, [visibleDisplayRows.length, activeFilter, mode]);

  const getVirtualKey = useCallback(
    (index: number) => {
      const row = visibleDisplayRows[index];
      return row ? displayRowKey(row) : index;
    },
    [visibleDisplayRows]
  );
  const rowVirtualizer = useWindowVirtualizer({
    count: visibleDisplayRows.length,
    estimateSize: (index) => estimateDisplayRowSize(visibleDisplayRows[index]),
    overscan: 8,
    scrollMargin: listTop,
    getItemKey: getVirtualKey,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <RowContext.Provider value={rowContext}>
    <div className="relative">
      <PullIndicator
        pull={pull}
        refreshing={refreshing}
        released={released}
        justFinished={justFinished}
      />
      <PageHeader
        title={pick("알림", "通知")}
        subtitle={
          unreadCount > 0
            ? pick(`놓친 알림 ${unreadCount}개`, `未读 ${unreadCount} 条`)
            : pick("전부 읽었어요", "全部已读")
        }
        back
        right={
          <div className="flex items-center gap-1">
            {/* Manual refresh — same shared callback the pull gesture
                uses, so a button tap and a pull both invalidate the
                same scope (places / memos / notifications / etc). */}
            <button
              type="button"
              onClick={() => void onManualRefresh()}
              disabled={manualRefreshing || refreshing}
              className={`btn-ghost smooth-touch !p-2.5 ${
                justFinished ? "text-sage-400" : ""
              }`}
              aria-label="refresh"
              title={pick("새로고침", "刷新")}
            >
              {justFinished ? (
                <Check className="w-5 h-5 animate-fade" />
              ) : (
                <RefreshCw
                  className={`w-5 h-5 ${manualRefreshing || refreshing ? "animate-spin text-rose-400" : ""}`}
                />
              )}
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAll.mutateAsync()}
                disabled={markAll.isPending}
                className="btn-ghost smooth-touch !p-2.5 text-peach-500 disabled:opacity-50"
                aria-label="mark all read"
                title={pick("전부 읽음", "全部已读")}
              >
                <CheckCheck className="w-5 h-5" />
              </button>
            )}
          </div>
        }
      />

      <div className="px-5 pb-3 space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-cream-100/70 border border-cream-200/70 p-1">
          {(
            [
              {
                key: "all",
                label: pick("전체", "全部"),
                count: allItems.length,
                Icon: Bell,
              },
              {
                key: "unread",
                label: pick("안 읽음", "未读"),
                count: unreadCount,
                Icon: Check,
              },
            ] satisfies {
              key: InboxMode;
              label: string;
              count: number;
              Icon: typeof Bell;
            }[]
          ).map(({ key, label, count, Icon }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => startTransition(() => setMode(key))}
                className={`h-10 rounded-xl text-[12px] font-black inline-flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                  active
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:bg-white/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span
                  className={`font-number text-[10px] px-1.5 py-0.5 rounded-full ${
                    active
                      ? "bg-peach-100 text-peach-500"
                      : "bg-white/80 text-ink-400"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category filter — horizontal-scrollable chip row so adding a
            new kind later doesn't crowd the bar. Counts follow the
            current inbox mode, so "안 읽음" mode shows unread-by-kind. */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
          {FILTER_CHIPS.map(({ key, ko, zh, icon: Icon }) => {
            const active = activeFilter === key;
            const count = filterCounts[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => startTransition(() => setFilter(key))}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-95 border whitespace-nowrap ${
                  active
                    ? "bg-peach-50 text-peach-600 border-peach-200/80 shadow-[0_2px_10px_rgba(248,149,112,0.18)]"
                    : "bg-white text-ink-500 border-cream-200/60 shadow-sm hover:bg-cream-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>
                  {pick(ko, zh)}
                </span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-number font-bold px-1.5 py-0.5 rounded-full ${
                      active ? "bg-peach-200/70 text-peach-700" : "bg-cream-100 text-ink-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-8">
        {isLoading && (
          <p className="text-center text-ink-400 text-sm py-8">
            {pick("불러오는 중…", "加载中…")}
          </p>
        )}
        {!isLoading && allItems.length === 0 && <EmptyState />}
        {!isLoading && allItems.length > 0 && sourceItems.length === 0 && (
          <AllCaughtUpState />
        )}
        {!isLoading &&
          sourceItems.length > 0 &&
          visibleItems.length === 0 && (
            <FilteredEmptyState unreadMode={mode === "unread"} />
        )}
        {!isLoading && displayRows.length > 0 && (
          <div
            ref={listRef}
            role="list"
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualRows.map((virtualRow) => {
              const row = visibleDisplayRows[virtualRow.index];
              if (!row) return null;
              const top = virtualRow.start - rowVirtualizer.options.scrollMargin;
              const content = (() => {
              if (row.kind === "date-header") {
                return (
                  <DateSectionHeader
                    ko={row.ko}
                    zh={row.zh}
                  />
                );
              }
              if (row.kind === "single") {
                return <NotificationItem item={row.item} />;
              }
              return <ReactionBundleItem bundle={row} />;
              })();
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute inset-x-0 pb-1.5"
                  style={{ transform: `translateY(${top}px)` }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && displayRows.length > 0 && (
          <NotificationLoadMoreSentinel
            sentinelRef={progressiveRows.sentinelRef}
            hasMore={progressiveRows.hasMore}
            visibleCount={progressiveRows.visibleCount}
            totalCount={displayRows.length}
          />
        )}
      </div>
    </div>
    </RowContext.Provider>
  );
}

function NotificationLoadMoreSentinel({
  sentinelRef,
  hasMore,
  visibleCount,
  totalCount,
}: {
  sentinelRef: RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  visibleCount: number;
  totalCount: number;
}) {
  if (!hasMore) return null;
  return (
    <div
      ref={sentinelRef}
      className="h-16 flex items-center justify-center"
      aria-label={`loading more notifications ${visibleCount} of ${totalCount}`}
    >
      <span className="w-5 h-5 rounded-full border-2 border-cream-200 border-t-peach-400 animate-spin" />
    </div>
  );
}

function EmptyState() {
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3">📭</div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        {pick("알림이 없어요", "还没有通知")}
      </p>
      <p className="text-xs text-ink-400">
        {pick("짝꿍이 뭔가 올리면 여기에 떠요", "宝宝有动静就会显示在这里")}
      </p>
    </div>
  );
}

function AllCaughtUpState() {
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 mx-auto rounded-full bg-sage-100 text-sage-400 flex items-center justify-center mb-3">
        <CheckCheck className="w-6 h-6" />
      </div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        {pick("놓친 알림은 없어요", "没有未读通知")}
      </p>
      <p className="text-xs text-ink-400">
        {pick("전체 탭에서 지난 알림을 다시 볼 수 있어요", "可在全部里回看")}
      </p>
    </div>
  );
}

// Distinct from EmptyState: there ARE notifications, just none in
// the currently selected filter. Hint at clearing the filter so the
// user doesn't think the inbox is empty.
function FilteredEmptyState({ unreadMode }: { unreadMode: boolean }) {
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-2">🔍</div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        {unreadMode
          ? pick("이 카테고리엔 안 읽은 알림이 없어요", "该分类暂无未读")
          : pick("이 카테고리엔 알림이 없어요", "该分类暂无通知")}
      </p>
      <p className="text-xs text-ink-400">
        {pick("다른 카테고리 / 전체로 바꿔보세요", "试试其他分类或「全部」")}
      </p>
    </div>
  );
}

const ReactionBundleItem = memo(
  ReactionBundleItemImpl,
  (prev, next) => {
    const a = prev.bundle;
    const b = next.bundle;
    if (a.latest.id !== b.latest.id) return false;
    if (a.items.length !== b.items.length) return false;
    if (a.emojis.join("") !== b.emojis.join("")) return false;
    const aUnread = a.items.some((i) => !i.read_at);
    const bUnread = b.items.some((i) => !i.read_at);
    return aUnread === bUnread;
  }
);

function ReactionBundleItemImpl({ bundle }: { bundle: ReactionBundle }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const rowCtx = useRowContext();
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  const { name, avatarUrl } = useActorDisplay(bundle.latest.actor_id);
  const isUnread = bundle.items.some((i) => !i.read_at);
  const unreadIds = bundle.items.filter((i) => !i.read_at).map((i) => i.id);
  const effectivePlaceId =
    bundle.placeId ?? rowCtx.foodPlaceIdOf(bundle.foodId);
  const linkTo = (() => {
    if (!effectivePlaceId) return null;
    const base = `/places/${effectivePlaceId}`;
    if (bundle.memoId) return `${base}#memo-${bundle.memoId}`;
    if (bundle.foodId) return `${base}#food-${bundle.foodId}`;
    return base;
  })();
  const targetName =
    rowCtx.foodNameOf(bundle.foodId) ?? rowCtx.placeNameOf(effectivePlaceId);
  const thumbSrc = thumbnailFor(bundle.latest, rowCtx);
  const stamp = relativeTime(bundle.latest.created_at, i18n.language);
  const actorCount = bundle.actorIds.length;
  const actorLead =
    actorCount > 1
      ? pick(`${name} 외 ${actorCount - 1}명`, `${name} 等 ${actorCount}人`)
      : name;
  const emojiText = bundle.emojis.length
    ? bundle.emojis.join(" ")
    : pick("이모지", "表情");
  const reactedText =
    (bundle.memoId ? rowCtx.memoTextOf(bundle.memoId) : null) ??
    (bundle.foodId ? rowCtx.foodMemoOf(bundle.foodId) : null) ??
    (effectivePlaceId ? rowCtx.placeMemoOf(effectivePlaceId) : null);
  const initial = Array.from(name)[0] ?? "·";

  function onTap() {
    if (linkTo) navigate(linkTo);
    markReadAfterNavigation(markRead, unreadIds);
  }

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onTap}
        className={`relative w-full text-left grid grid-cols-[2.25rem_minmax(0,1fr)_3rem] items-start gap-2.5 p-2.5 rounded-2xl border active:scale-[0.99] transition-colors ${
          isUnread
            ? "bg-white border-rose-200/70 shadow-card"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
        {isUnread && (
          <span
            className="absolute right-2.5 top-2.5 w-2 h-2 rounded-full bg-peach-500 ring-2 ring-white"
            aria-label="unread"
          />
        )}
        <div className="relative flex-shrink-0">
          <div
            className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-black text-[13px] border border-cream-200 ${avatarUrl ? "" : "bg-rose-100 text-rose-500"}`}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <KindBadge kind="reaction" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-snug text-ink-700">
            <span className="font-bold text-ink-900">{actorLead}</span>
            <span className="text-ink-400 mx-1">·</span>
            <span className="font-bold text-rose-600">
              {pick("이모지", "表情")}
            </span>
          </p>
          <p className="text-[12px] leading-snug mt-0.5 min-w-0 truncate">
            <span className="font-bold text-rose-600">{emojiText}</span>
            <span className="text-ink-400 font-number">
              {" "}
              · {pick(`${bundle.items.length}개`, `${bundle.items.length}个`)}
            </span>
          </p>
          {reactedText && (
            <p className="text-[11px] leading-snug text-ink-500 mt-0.5 line-clamp-1 break-keep">
              ↪ {quoteText(reactedText, 52)}
            </p>
          )}
          <p className="text-[10px] text-ink-400 font-medium font-number mt-0.5">
            {stamp}
          </p>
        </div>
        <NotificationThumb src={thumbSrc} label={targetName} />
      </button>
    </div>
  );
}

// Day-bucket section header. Sits between groups of notifications
// in the feed so the user can scan "오늘 · 어제 · 5월 12일" without
// hunting through timestamps.
function DateSectionHeader({ ko, zh }: { ko: string; zh: string }) {
  const { i18n } = useTranslation();
  const label = pickLanguage(i18n.language, ko, zh);
  return (
    <div
      role="listitem"
      className="pt-3 first:pt-0 pb-0.5 px-1 select-none"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-ink-400 tracking-wide">
          {label}
        </span>
        <div className="h-px flex-1 bg-cream-100" />
      </div>
    </div>
  );
}

// Memoized — single rows render the same output as long as (id,
// read_at, preview) are stable. Identity check on those three
// covers every visible change without forcing a re-render on
// unrelated cache patches.
const NotificationItem = memo(
  NotificationItemImpl,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.read_at === next.item.read_at &&
    prev.item.preview === next.item.preview
);

function NotificationItemImpl({ item }: { item: NotificationRow }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const rowCtx = useRowContext();
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  // Actor is rendered with their OWN profile nickname (whatever they
  // set for themselves) — not the pet name the recipient may have
  // assigned via partner_nickname.
  const { name, avatarUrl } = useActorDisplay(item.actor_id);

  // Resolve where to navigate based on the notification kind. Foods
  // and threaded memos still land on the parent place page — the food
  // detail / memo lives there, not on a separate route.
  //
  // Hash anchor refinement so taps land on the EXACT row that
  // triggered the notification, not at the top of a long place page:
  //   memo_id present → #memo-<id>  (memo edits, threads, replies,
  //                                   reactions on a memo)
  //   food_id present → #food-<id>  (new food, rating fill,
  //                                   reactions on a food caption)
  //   otherwise       → no anchor   (place-level events, revisit)
  // PlaceDetailPage's hash effect resolves the element id and
  // scrollIntoView's it with a brief ring highlight pulse.
  const linkTo = (() => {
    const effectivePlaceId = item.place_id ?? rowCtx.foodPlaceIdOf(item.food_id);
    if (!effectivePlaceId) return null;
    const base = `/places/${effectivePlaceId}`;
    if (item.memo_id) return `${base}#memo-${item.memo_id}`;
    if (item.food_id) return `${base}#food-${item.food_id}`;
    return base;
  })();

  // On row tap: mark as read + navigate. Mark first (fire-and-forget)
  // so the unread badge updates immediately even if navigation happens
  // before the network round-trip finishes. Guard against rapid taps
  // firing the mutation twice while the first round-trip is in flight.
  function onTap() {
    if (linkTo) navigate(linkTo);
    markReadAfterNavigation(markRead, item.read_at ? [] : [item.id]);
  }

  const isUnread = !item.read_at;
  const stamp = relativeTime(item.created_at, i18n.language);
  const thumbSrc = thumbnailFor(item, rowCtx);
  const ratingScore = ratingScoreFor(item, rowCtx);
  const parentMemoText =
    item.kind === "memo_reply" ? rowCtx.parentMemoTextOf(item.memo_id) : null;
  const memoText = item.preview ?? rowCtx.memoTextOf(item.memo_id);
  const headline = (() => {
    switch (item.kind) {
      case "memo_reply":
        return {
          label: pick("답글", "回复"),
          color: "text-indigo-600",
        };
      case "memo_thread":
        return {
          label: pick("메모", "留言"),
          color: "text-sky-600",
        };
      case "memo":
        return {
          label: pick("메모 수정", "改备注"),
          color: "text-sky-600",
        };
      case "food":
        return {
          label: pick("메뉴", "菜品"),
          color: "text-amber-600",
        };
      case "place":
        return {
          label: pick("새 장소", "新地点"),
          color: "text-emerald-600",
        };
      case "rating":
        return {
          label: ratingScore
            ? pick(`별점 ${ratingScore}/5`, `打分 ${ratingScore}分`)
            : pick("별점", "打分"),
          color: "text-yellow-600",
        };
      case "revisit":
        return {
          label: pick("또 갈래", "想再去"),
          color: "text-pink-600",
        };
      case "reaction":
        return {
          label: pick("이모지", "表情"),
          color: "text-rose-600",
        };
    }
  })();
  const bodyLine = (() => {
    if (
      item.kind === "memo_reply" ||
      item.kind === "memo_thread" ||
      item.kind === "memo"
    ) {
      return memoText ? quoteText(memoText) : null;
    }
    if (item.kind === "food") return item.preview ? clipText(item.preview) : null;
    if (item.kind === "reaction") return item.preview ?? null;
    if (item.kind === "rating") {
      const foodName = rowCtx.foodNameOf(item.food_id);
      return foodName ? clipText(foodName) : null;
    }
    // 새 장소만 장소 이름을 본문으로 노출 — 다른 종류는 이전에 사용자가
    // 일부러 뺀 거라 그대로 두고 새 장소 케이스만 부활.
    if (item.kind === "place") return item.preview ?? null;
    return null;
  })();
  const initial = Array.from(name)[0] ?? "·";
  // Actor on a notification is always the partner (the trigger
  // excludes the recipient's own actions), so the colored fallback
  // bubble can lock to rose without computing a per-row tone.
  const toneCls = "bg-rose-100 text-rose-500";

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onTap}
        className={`relative w-full text-left grid grid-cols-[2.25rem_minmax(0,1fr)_3rem] items-start gap-2.5 p-2.5 rounded-2xl transition-colors active:scale-[0.99] border ${
          isUnread
            ? "bg-peach-50/60 border-peach-200/60 shadow-card"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
        {isUnread && (
          <span
            className="absolute right-2.5 top-2.5 w-2 h-2 rounded-full bg-peach-500 ring-2 ring-white"
            aria-label="unread"
          />
        )}
        <div className="relative flex-shrink-0">
          <div
            className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-black text-[13px] border border-cream-200 ${avatarUrl ? "" : toneCls}`}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <KindBadge kind={item.kind} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] leading-snug">
            <span className="font-bold text-ink-900">{name}</span>
            <span className="text-ink-400 mx-1">·</span>
            <span className={`font-bold ${headline.color}`}>
              {headline.label}
            </span>
          </p>
          {bodyLine && (
            <p className="text-[12px] text-ink-800 mt-0.5 line-clamp-1 break-keep">
              {bodyLine}
            </p>
          )}
          {parentMemoText && (
            <p className="text-[11px] text-ink-400 mt-0.5 line-clamp-1 break-keep">
              ↪ {quoteText(parentMemoText, 52)}
            </p>
          )}
          <p className="text-[10px] text-ink-400 font-medium font-number mt-0.5">
            {stamp}
          </p>
        </div>
        <NotificationThumb src={thumbSrc} label={bodyLine} />
      </button>
    </div>
  );
}

// Match the relative-time formatter used by MemoComment so the inbox
// reads with the same vocabulary as the comment threads it links to.
function relativeTime(iso: string, language: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return pickLanguage(language, "방금 전", "刚刚");
  const min = Math.floor(diffSec / 60);
  if (min < 60) return pickLanguage(language, `${min}분 전`, `${min}分钟前`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return pickLanguage(language, `${hr}시간 전`, `${hr}小时前`);
  const day = Math.floor(hr / 24);
  if (day < 7) return pickLanguage(language, `${day}일 전`, `${day}天前`);
  const koDate = new Date(t).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  const zhDate = new Date(t).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
  return pickLanguage(language, koDate, zhDate);
}

// Re-export the bell icon as a small hook+component pair so the home
// page header can host it without importing the whole inbox page.
export { Bell as NotificationsBellIcon };
