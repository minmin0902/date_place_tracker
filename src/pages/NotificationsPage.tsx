import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
import { isVideoUrl } from "@/lib/utils";
import type {
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

// Per-kind visual spec — drives both the avatar-corner badge and the
// verb text color so each row is instantly identifiable on first
// glance. Bilingual labels matter less when the icon + color already
// tell you "this is a menu add" / "this is a memo".
type KindSpec = {
  // lucide icon shown in the avatar-corner badge
  Icon: typeof Bell;
  // Tailwind bg-* for the badge fill
  bg: string;
  // Tailwind text-* for the verb line in the row body, matched to
  // the badge color so badge + verb pair visually
  textColor: string;
  // Verb label, bilingual ("동사 · 动词")
  verb: string;
};
function kindSpec(kind: NotificationRow["kind"]): KindSpec {
  switch (kind) {
    case "place":
      return {
        Icon: MapPin,
        bg: "bg-emerald-500",
        textColor: "text-emerald-600",
        verb: "새 장소 · 新地点",
      };
    case "food":
      return {
        Icon: Utensils,
        bg: "bg-amber-500",
        textColor: "text-amber-600",
        verb: "메뉴 추가 · 添加菜品",
      };
    case "memo":
      return {
        Icon: MessageCircle,
        bg: "bg-sky-500",
        textColor: "text-sky-600",
        verb: "메모 수정 · 改了备注",
      };
    case "memo_thread":
      return {
        Icon: MessageCircle,
        bg: "bg-sky-500",
        textColor: "text-sky-600",
        verb: "메모 남김 · 留了言",
      };
    case "memo_reply":
      return {
        Icon: CornerDownRight,
        bg: "bg-indigo-500",
        textColor: "text-indigo-600",
        verb: "답글 · 回复",
      };
    case "reaction":
      return {
        Icon: Smile,
        bg: "bg-rose-500",
        textColor: "text-rose-600",
        verb: "이모지 · 表情",
      };
    case "revisit":
      return {
        Icon: Heart,
        bg: "bg-pink-500",
        textColor: "text-pink-600",
        verb: "또 갈래 · 想再去",
      };
    case "rating":
      return {
        Icon: Star,
        bg: "bg-yellow-500",
        textColor: "text-yellow-600",
        verb: "별점 · 打分",
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

// Filter buckets — collapse the seven raw notification kinds into
// four user-facing categories so the chip row stays scannable. The
// "메모/이모지" bucket lumps every conversation-style event (memo
// edits, threaded comments, nested replies) AND reactions on those
// same targets — the user thinks of "짝꿍이 내 메모에 반응한 거"
// as one surface regardless of whether it was a text reply or an
// emoji tap.
type FilterKey = "all" | "place" | "memo" | "rating" | "revisit";
type InboxMode = "all" | "unread";

const FILTER_CHIPS: { key: FilterKey; ko: string; zh: string; icon: typeof Bell }[] = [
  { key: "all", ko: "전체", zh: "全部", icon: Bell },
  { key: "place", ko: "새 기록", zh: "新记录", icon: Plus },
  { key: "memo", ko: "메모/이모지", zh: "留言/表情", icon: MessageCircle },
  { key: "rating", ko: "평점", zh: "打分", icon: Star },
  { key: "revisit", ko: "또 갈래", zh: "想再去", icon: Heart },
];

// ActivityBundle — the headline grouping: every notification that
// targets the SAME place on the SAME day by the SAME actor collapses
// into ONE card whose header is the place name and whose body lists
// the sub-activities (menus, memos, replies, rating, revisit) as
// indented sub-rows. The user's mental model is "what
// did 짝꿍 do at THAT place today", so the place becomes the bucket
// and everything else nests underneath.
//
// Single-event bundles get downgraded to a flat single row so a lone
// memo doesn't look heavy inside a near-empty card.
type ActivityBundle = {
  kind: "activity-bundle";
  placeId: string;
  // The `place` kind notification itself, if it's part of this
  // bundle. Presence flips the header verb to "새 장소 · 新地点".
  placeEvent: NotificationRow | null;
  // Sub-buckets by kind. Order within each bucket = newest-first,
  // matching the walk direction.
  foods: NotificationRow[];
  memos: NotificationRow[]; // memo + memo_thread
  replies: NotificationRow[]; // memo_reply
  ratings: NotificationRow[];
  revisit: NotificationRow | null;
  // Flat union of every member, used for mark-all-read + total count.
  allItems: NotificationRow[];
  // Newest member — drives the displayed timestamp + read state.
  latest: NotificationRow;
  actorId: string;
};

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
  | ReactionBundle
  | ActivityBundle;

function displayRowKey(row: DisplayRow) {
  if (row.kind === "date-header") return `hdr-${row.key}`;
  if (row.kind === "single") return row.item.id;
  if (row.kind === "reaction-bundle") return row.key;
  return `bundle-${row.latest.id}`;
}

function estimateDisplayRowSize(row: DisplayRow | undefined) {
  if (!row) return 92;
  if (row.kind === "date-header") return 28;
  if (row.kind === "reaction-bundle") return 96;
  if (row.kind === "single") {
    return row.item.kind === "memo_reply" ? 104 : 88;
  }
  return 104 + row.allItems.length * 24;
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
  if (filter === "place") return kind === "place" || kind === "food";
  if (filter === "memo")
    return (
      kind === "memo" ||
      kind === "memo_thread" ||
      kind === "memo_reply" ||
      kind === "reaction"
    );
  if (filter === "rating") return kind === "rating";
  if (filter === "revisit") return kind === "revisit";
  return true;
}

// Inbox: every notification triggered for the current user. Tapping
// a row marks it read and deep-links to the source content. A "전부
// 읽음" footer button clears the badge in one shot.
export default function NotificationsPage() {
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [mode, setMode] = useState<InboxMode>("all");
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
      place: 0,
      memo: 0,
      rating: 0,
      revisit: 0,
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
    if (filter === "all") return sourceItems;
    return sourceItems.filter((n) => matchesFilter(n.kind, filter));
  }, [sourceItems, filter]);

  // Display rows = date headers interleaved with either:
  //   - "전체" filter (all): one ActivityBundle card per
  //     (place_id, day, actor) trio so a recording session
  //     collapses into one navigable card.
  //   - Any other filter (새기록 / 메모/이모지 / 평점 / 또갈래):
  //     no bundling at all — when the user has filtered to a
  //     specific surface they want to see every item in detail.
  // Walking newest-first lets bundles emit in latest-first order
  // since each bundle's first-encountered member is its newest.
  const displayRows = useMemo<DisplayRow[]>(() => {
    const out: DisplayRow[] = [];
    const bundles = new Map<string, ActivityBundle>();
    const reactionBundles = new Map<string, ReactionBundle>();
    let currentDateKey: string | null = null;
    const shouldBundle = filter === "all";

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
        // Bundles only span one date section. Clearing the map at
        // the boundary keeps a monday memo from joining a tuesday
        // bundle on the same place.
        bundles.clear();
        reactionBundles.clear();
      }

      // Notifications for food-scoped events carry food_id but
      // null place_id. Derive the bundle key from the food's parent
      // place so a memo on a food still joins its place's card
      // instead of orphaning as a flat single.
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

      if (
        n.kind === "memo" ||
        n.kind === "memo_thread" ||
        n.kind === "memo_reply" ||
        n.kind === "rating"
      ) {
        out.push({ kind: "single", item: n });
        continue;
      }

      if (!shouldBundle || !effectivePlaceId) {
        // Filter is narrowed (the user is looking at one surface),
        // OR we couldn't resolve a parent place — render as a
        // detailed single row.
        out.push({ kind: "single", item: n });
        continue;
      }

      const k = `${effectivePlaceId}|${n.actor_id}`;
      let b = bundles.get(k);
      if (!b) {
        b = {
          kind: "activity-bundle",
          placeId: effectivePlaceId,
          placeEvent: null,
          foods: [],
          memos: [],
          replies: [],
          ratings: [],
          revisit: null,
          allItems: [],
          latest: n,
          actorId: n.actor_id,
        };
        bundles.set(k, b);
        out.push(b);
      }
      b.allItems.push(n);
      switch (n.kind) {
        case "place":
          b.placeEvent = n;
          break;
        case "food":
          b.foods.push(n);
          break;
        case "revisit":
          b.revisit = n;
          break;
      }
    }

    // Keep bundles even at N=1 in the 전체 tab — the user wants
    // memo/reply notifications to ALWAYS show their parent place
    // as a bold header line, not a truncated breadcrumb. The card
    // layout enforces that "place at top, content underneath" shape
    // regardless of how many sub-events landed.
    return out;
  }, [visibleItems, filter, rowContext]);

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
  }, [displayRows.length, filter, mode]);

  const getVirtualKey = useCallback(
    (index: number) => {
      const row = displayRows[index];
      return row ? displayRowKey(row) : index;
    },
    [displayRows]
  );
  const rowVirtualizer = useWindowVirtualizer({
    count: displayRows.length,
    estimateSize: (index) => estimateDisplayRowSize(displayRows[index]),
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
        title="알림 · 通知"
        subtitle={
          unreadCount > 0
            ? `놓친 알림 ${unreadCount}개 · 未读 ${unreadCount} 条`
            : "전부 읽었어요 · 全部已读"
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
              className={`btn-ghost !p-2.5 active:scale-90 transition-transform ${
                justFinished ? "text-sage-400" : ""
              }`}
              aria-label="refresh"
              title="새로고침 · 刷新"
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
                className="btn-ghost !p-2.5 text-peach-500 disabled:opacity-50 active:scale-90 transition-transform"
                aria-label="mark all read"
                title="전부 읽음 · 全部已读"
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
                label: "전체 · 全部",
                count: allItems.length,
                Icon: Bell,
              },
              {
                key: "unread",
                label: "안 읽음 · 未读",
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
            const active = filter === key;
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
                  {ko} · {zh}
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
            불러오는 중… · 加载中…
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
              const row = displayRows[virtualRow.index];
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
              if (row.kind === "reaction-bundle") {
                return <ReactionBundleItem bundle={row} />;
              }
              return (
                <ActivityBundleItem bundle={row} />
              );
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
      </div>
    </div>
    </RowContext.Provider>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3">📭</div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        알림이 없어요 · 还没有通知
      </p>
      <p className="text-xs text-ink-400">
        짝꿍이 뭔가 올리면 여기에 떠요 · 宝宝有动静就会显示在这里
      </p>
    </div>
  );
}

function AllCaughtUpState() {
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 mx-auto rounded-full bg-sage-100 text-sage-400 flex items-center justify-center mb-3">
        <CheckCheck className="w-6 h-6" />
      </div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        놓친 알림은 없어요 · 没有未读通知
      </p>
      <p className="text-xs text-ink-400">
        전체 탭에서 지난 알림을 다시 볼 수 있어요 · 可在全部里回看
      </p>
    </div>
  );
}

// Distinct from EmptyState: there ARE notifications, just none in
// the currently selected filter. Hint at clearing the filter so the
// user doesn't think the inbox is empty.
function FilteredEmptyState({ unreadMode }: { unreadMode: boolean }) {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-2">🔍</div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        {unreadMode
          ? "이 카테고리엔 안 읽은 알림이 없어요 · 该分类暂无未读"
          : "이 카테고리엔 알림이 없어요 · 该分类暂无通知"}
      </p>
      <p className="text-xs text-ink-400">
        다른 카테고리 / 전체로 바꿔보세요 · 试试其他分类或「全部」
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
  const stamp = relativeKo(bundle.latest.created_at);
  const actorCount = bundle.actorIds.length;
  const actorLead =
    actorCount > 1 ? `${name} 외 ${actorCount - 1}명` : name;
  const emojiText = bundle.emojis.length ? bundle.emojis.join(" ") : "이모지";
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
        className={`relative w-full text-left flex items-start gap-2.5 p-2.5 rounded-2xl border active:scale-[0.99] transition-colors ${
          isUnread
            ? "bg-white border-rose-200/70 shadow-card"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
        {isUnread && (
          <span
            className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-rose-300"
            aria-hidden
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
            <span className="font-bold text-rose-600">이모지 · 表情</span>
          </p>
          <p className="text-[12px] leading-snug mt-0.5 min-w-0 truncate">
            <span className="font-bold text-rose-600">{emojiText}</span>
            <span className="text-ink-400 font-number">
              {" "}
              · {bundle.items.length}개 · {stamp}
            </span>
          </p>
          {reactedText && (
            <p className="text-[11px] leading-snug text-ink-500 mt-0.5 line-clamp-1 break-keep">
              ↪ {quoteText(reactedText, 52)}
            </p>
          )}
        </div>
        <NotificationThumb src={thumbSrc} label={targetName} />
      </button>
    </div>
  );
}

// One card per (place, day, actor) bundle. Header = avatar + place
// name (verb flips to "새 장소" when the place itself was created
// in this bundle). Below the header, nested sub-rows for every
// activity kind that has at least one member: 메뉴 N, 메모 N, 답글 N,
// 이모지 N (with emoji bag), 별점 N, 또갈래. Tap anywhere on the card
// → mark every member read + navigate to the place.
// Memoized so optimistic mark-read on ONE row (which still produces
// a new bundle object via the displayRows useMemo) doesn't re-render
// every OTHER card in the list. Custom comparator keys on bundle
// identity (latest.id) + size + the unread bit — the only things
// that change the visible output.
const ActivityBundleItem = memo(
  ActivityBundleItemImpl,
  (prev, next) => {
    const a = prev.bundle;
    const b = next.bundle;
    if (a.latest.id !== b.latest.id) return false;
    if (a.allItems.length !== b.allItems.length) return false;
    const aUnread = a.allItems.some((i) => !i.read_at);
    const bUnread = b.allItems.some((i) => !i.read_at);
    return aUnread === bUnread;
  }
);

function ActivityBundleItemImpl({ bundle }: { bundle: ActivityBundle }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const { name, avatarUrl } = useActorDisplay(bundle.actorId);
  const rowCtx = useRowContext();
  const placeName = rowCtx.placeNameOf(bundle.placeId);
  const thumbSrc = thumbnailFor(bundle.latest, rowCtx);

  const isUnread = bundle.allItems.some((i) => !i.read_at);
  const unreadIds = bundle.allItems
    .filter((i) => !i.read_at)
    .map((i) => i.id);

  // Header tap: mark every member in the bundle read, navigate to
  // the place (no anchor — the user wants the whole place context).
  function onHeaderTap() {
    navigate(`/places/${bundle.placeId}`);
    markReadAfterNavigation(markRead, unreadIds);
  }

  // Sub-row tap: mark JUST that sub-bucket's members read, and
  // navigate with the most specific anchor we can derive (memo /
  // food). Lets the user click into individual streams even when
  // they're bundled inside one card.
  function navigateScoped(target: string, items: NotificationRow[]) {
    const unread = items.filter((i) => !i.read_at).map((i) => i.id);
    navigate(target);
    markReadAfterNavigation(markRead, unread);
  }

  const stamp = relativeKo(bundle.latest.created_at);
  const initial = Array.from(name)[0] ?? "·";
  const toneCls = "bg-rose-100 text-rose-500";

  const primaryKind: NotificationRow["kind"] = bundle.placeEvent
    ? "place"
    : bundle.foods.length > 0
      ? "food"
      : bundle.memos.length > 0
        ? "memo_thread"
        : bundle.replies.length > 0
          ? "memo_reply"
          : bundle.ratings.length > 0
            ? "rating"
            : "revisit";
  // Bundle 안에 종류가 하나뿐이면 그 kind 의 specific verb 노출
  // (별점만 모인 카드는 "별점 · 打分", 메뉴만이면 "메뉴 추가 · 添加菜品"
  // 등). 여러 종류가 섞이면 catch-all "새 기록 · 新记录". placeEvent
  // 가 있는 카드는 항상 "새 장소" 로 잡힘.
  // 리액션은 ReactionBundle 로 따로 빠져있으므로 여기서 안 셈.
  const kindCount =
    (bundle.foods.length > 0 ? 1 : 0) +
    (bundle.memos.length + bundle.replies.length > 0 ? 1 : 0) +
    (bundle.ratings.length > 0 ? 1 : 0) +
    (bundle.revisit ? 1 : 0);
  const headerVerb = bundle.placeEvent
    ? { label: "새 장소 · 新地点", color: "text-emerald-600" }
    : kindCount === 1
      ? (() => {
          const spec = kindSpec(primaryKind);
          return { label: spec.verb, color: spec.textColor };
        })()
      : { label: "새 기록 · 新记录", color: "text-ink-700" };

  // Build the body — one sub-row per non-empty kind. Order matches
  // the rough sequence of a recording session, but comments/replies
  // sit above ratings because they are the most missable actions.
  // Each sub-row carries its own onTap so the user can drill into
  // a specific stream (a memo, a food) instead of always landing
  // at the top of the place page.
  type SubRow = {
    key: string;
    Icon: typeof Bell;
    color: string;
    label: string;
    preview: string | null;
    onTap: () => void;
  };
  const subRows: SubRow[] = [];
  const placeBase = `/places/${bundle.placeId}`;
  if (bundle.foods.length > 0) {
    const target = bundle.foods[0]?.food_id
      ? `${placeBase}#food-${bundle.foods[0].food_id}`
      : placeBase;
    subRows.push({
      key: "food",
      Icon: Utensils,
      color: "text-amber-600",
      label: `메뉴 ${bundle.foods.length}개 · 菜品 ${bundle.foods.length}`,
      preview: null,
      onTap: () => navigateScoped(target, bundle.foods),
    });
  }
  // Memos + replies share a single sub-row — visually they're both
  // "comments" from the user's point of view, and splitting them
  // doubled the bundle's row count without adding scannable info.
  // Replies get a small ↪ prefix inline so they're still
  // distinguishable from top-level memos.
  if (bundle.memos.length + bundle.replies.length > 0) {
    const total = bundle.memos.length + bundle.replies.length;
    const latestMemo = bundle.memos[0] ?? bundle.replies[0];
    const target = latestMemo?.memo_id
      ? `${placeBase}#memo-${latestMemo.memo_id}`
      : placeBase;
    subRows.push({
      key: "memo",
      Icon: MessageCircle,
      color: "text-sky-600",
      label: `메모/답글 ${total}개 · 留言 ${total}`,
      preview: null,
      onTap: () =>
        navigateScoped(target, [...bundle.memos, ...bundle.replies]),
    });
  }
  if (bundle.ratings.length > 0) {
    const target = bundle.ratings[0]?.food_id
      ? `${placeBase}#food-${bundle.ratings[0].food_id}`
      : placeBase;
    subRows.push({
      key: "rating",
      Icon: Star,
      color: "text-yellow-600",
      label: `별점 ${bundle.ratings.length}개 · 打分 ${bundle.ratings.length}`,
      preview: null,
      onTap: () => navigateScoped(target, bundle.ratings),
    });
  }
  if (bundle.revisit) {
    subRows.push({
      key: "revisit",
      Icon: Heart,
      color: "text-pink-600",
      label: "또 갈래 · 想再去",
      preview: null,
      onTap: () =>
        navigateScoped(placeBase, bundle.revisit ? [bundle.revisit] : []),
    });
  }

  return (
    <div role="listitem">
      {/* The card is an <article> rather than one big <button> so we
          can host MULTIPLE independent click targets inside it —
          one for the header (navigate to place + mark all read) and
          one per sub-row (navigate to that scoped anchor + mark
          just that sub-bucket read). HTML disallows nested buttons,
          so siblings inside a div container are the clean way. */}
      <article
        className={`relative rounded-2xl border transition-colors ${
          isUnread
            ? "bg-peach-50/60 border-peach-200/60 shadow-card"
            : "bg-white border-cream-200"
        }`}
      >
        {isUnread && (
          <span
            className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-peach-400"
            aria-hidden
          />
        )}
        {/* 헤더 button 이 avatar + verb 전체 폭을 덮을 때, avatar 가
            36px 인데 verb 한 줄은 ~16px 라 avatar 아래쪽에 dead space
            ~20px 가 남고 sub-row 가 그 아래에 떨어져서 시각적으로
            "verb 와 sub-row 사이에 큰 빈공간" 으로 보였음. 구조를
            바꿔서 avatar 를 왼쪽 컬럼으로 두고 verb + sub-row + stamp
            를 오른쪽 컬럼 안에 sibling 으로 흐르게 함. dead space 사라짐. */}
        <div className="flex items-start gap-2.5 p-2.5 pr-6">
          <button
            type="button"
            onClick={onHeaderTap}
            className="relative flex-shrink-0 rounded-full active:scale-95 transition-transform"
            aria-label="open place"
          >
            <span
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
            </span>
            <KindBadge kind={primaryKind} />
          </button>
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={onHeaderTap}
              className="w-full text-left rounded-md -mx-1 px-1 py-0.5 active:scale-[0.99] transition-colors hover:bg-cream-50/40"
            >
              <p className="text-[12px] leading-snug">
                <span className="font-bold text-ink-900">{name}</span>
                <span className="text-ink-400 mx-1">·</span>
                <span className={`font-bold ${headerVerb.color}`}>
                  {headerVerb.label}
                </span>
              </p>
              {/* 새 장소 추가 bundle 만 place 이름 노출. 나머지 종류는
                  이전에 너무 복잡해서 숨긴 거라 그대로 유지. */}
              {bundle.placeEvent && placeName && (
                <p className="text-[12px] text-ink-800 font-bold mt-0.5 line-clamp-1 break-keep">
                  {placeName}
                </p>
              )}
            </button>

            {subRows.length > 0 && (
              <ul className="mt-1 space-y-0.5 border-l-2 border-cream-200 pl-2">
                {subRows.map((s) => {
                  const Icon = s.Icon;
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={s.onTap}
                        className="w-full text-left flex items-start gap-1.5 text-[11px] leading-snug py-0.5 px-1 -mx-1 rounded-md active:scale-[0.99] transition-colors hover:bg-cream-100/60"
                      >
                        <Icon
                          className={`w-3 h-3 mt-0.5 flex-shrink-0 ${s.color}`}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          <span className={`font-bold ${s.color}`}>
                            {s.label}
                          </span>
                          {s.preview && (
                            <>
                              <span className="text-ink-400"> · </span>
                              <span className="text-ink-700">{s.preview}</span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-[10px] text-ink-400 font-medium font-number mt-1">
              {stamp}
            </p>
          </div>
          <NotificationThumb src={thumbSrc} label={placeName} />
        </div>

        {isUnread && (
          <span
            className="absolute top-3 right-3 w-2 h-2 rounded-full bg-rose-400"
            aria-label="unread"
          />
        )}
      </article>
    </div>
  );
}

// Day-bucket section header. Sits between groups of notifications
// in the feed so the user can scan "오늘 · 어제 · 5월 12일" without
// hunting through timestamps.
function DateSectionHeader({ ko, zh }: { ko: string; zh: string }) {
  return (
    <div
      role="listitem"
      className="pt-3 first:pt-0 pb-0.5 px-1 select-none"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-ink-400 tracking-wide">
          {ko} <span className="text-ink-300 font-medium">· {zh}</span>
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
  const stamp = relativeKo(item.created_at);
  const thumbSrc = thumbnailFor(item, rowCtx);
  const parentMemoText =
    item.kind === "memo_reply" ? rowCtx.parentMemoTextOf(item.memo_id) : null;
  const memoText = item.preview ?? rowCtx.memoTextOf(item.memo_id);
  const headline = (() => {
    switch (item.kind) {
      case "memo_reply":
        return {
          label: "답글 · 回复",
          color: "text-indigo-600",
        };
      case "memo_thread":
        return {
          label: "메모 · 留言",
          color: "text-sky-600",
        };
      case "memo":
        return {
          label: "메모 수정 · 改备注",
          color: "text-sky-600",
        };
      case "food":
        return {
          label: "메뉴 · 菜品",
          color: "text-amber-600",
        };
      case "place":
        return {
          label: "새 장소 · 新地点",
          color: "text-emerald-600",
        };
      case "rating":
        return {
          label: "별점 · 打分",
          color: "text-yellow-600",
        };
      case "revisit":
        return {
          label: "또 갈래 · 想再去",
          color: "text-pink-600",
        };
      case "reaction":
        return {
          label: "이모지 · 表情",
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
        className={`relative w-full text-left flex items-start gap-2.5 p-2.5 rounded-2xl transition-colors active:scale-[0.99] border ${
          isUnread
            ? "bg-peach-50/60 border-peach-200/60 shadow-card"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
        {isUnread && (
          <span
            className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-peach-400"
            aria-hidden
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
        {isUnread && (
          <span
            className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 flex-shrink-0"
            aria-label="unread"
          />
        )}
      </button>
    </div>
  );
}

// Match the relative-time formatter used by MemoComment so the inbox
// reads with the same vocabulary as the comment threads it links to.
function relativeKo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return "방금 전";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(t).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

// Re-export the bell icon as a small hook+component pair so the home
// page header can host it without importing the whole inbox page.
export { Bell as NotificationsBellIcon };
