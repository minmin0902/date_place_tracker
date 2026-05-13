import { createContext, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  MessageCircle,
  MapPin,
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
import { useGlobalRefresh } from "@/hooks/useGlobalRefresh";
import { useRefreshControls } from "@/hooks/useRefreshControls";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/useNotifications";
import { useActorDisplay } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import type { NotificationRow } from "@/lib/database.types";

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
};
const RowContext = createContext<ContextResolver>({
  placeNameOf: () => null,
  foodNameOf: () => null,
  placeMemoOf: () => null,
  foodMemoOf: () => null,
});
function useRowContext() {
  return useContext(RowContext);
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

// Compose a breadcrumb-style preview line that surfaces the parent
// context (which place / which food) along with the kind-specific
// payload (memo body, emoji, etc.). The raw `notifications.preview`
// only carries the most-recent payload — for "메뉴 추가" it's the
// food name, for memo it's the body, for reaction it's the emoji.
// The user wants to see "added a menu to WHICH place" without
// opening it, so we resolve names from the loaded places map and
// stitch them in.
function composeContextLine(
  item: NotificationRow,
  ctx: ContextResolver
): string {
  const placeName = ctx.placeNameOf(item.place_id);
  const foodName = ctx.foodNameOf(item.food_id);
  const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

  // place / revisit: preview is already the place name. For a new
  // place, surface the primary memo (if any) on the same line so
  // "Day2 jd宝宝 left 早饭 — '처음 와봤어'" reads at a glance.
  if (item.kind === "place") {
    const base = item.preview ?? placeName ?? "";
    const memo = ctx.placeMemoOf(item.place_id);
    return memo ? `${base} — "${clip(memo)}"` : base;
  }
  if (item.kind === "revisit") {
    return item.preview ?? placeName ?? "";
  }
  // food / rating: place name → food name → food's memo (if any).
  if (item.kind === "food" || item.kind === "rating") {
    const parts = [placeName, item.preview ?? foodName].filter(Boolean) as string[];
    const memo = ctx.foodMemoOf(item.food_id);
    const base = parts.join(" · ");
    return memo ? `${base} — "${clip(memo)}"` : base;
  }
  // memo_thread / memo_reply / memo edit: show parent place (+ food
  // if the memo lives on a specific dish), then the memo body in
  // quotes so it reads as "Day2 · Fried土豆 · "맛있었어"".
  if (
    item.kind === "memo" ||
    item.kind === "memo_thread" ||
    item.kind === "memo_reply"
  ) {
    const parts: string[] = [];
    if (placeName) parts.push(placeName);
    if (foodName) parts.push(foodName);
    if (item.preview) parts.push(`"${item.preview}"`);
    return parts.join(" · ");
  }
  // reaction: parent + sub-target + the emoji itself.
  if (item.kind === "reaction") {
    const parts: string[] = [];
    if (placeName) parts.push(placeName);
    if (foodName) parts.push(foodName);
    if (item.preview) parts.push(item.preview);
    return parts.join(" · ");
  }
  return item.preview ?? "";
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
// the sub-activities (menus, memos, replies, reactions, rating,
// revisit) as indented sub-rows. The user's mental model is "what
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
  reactions: NotificationRow[];
  // Distinct emojis across all reactions in this bundle — used to
  // render the reaction sub-row as "❤️😘 3" without surfacing every
  // duplicate emoji.
  reactionEmojis: string[];
  revisit: NotificationRow | null;
  // Flat union of every member, used for mark-all-read + total count.
  allItems: NotificationRow[];
  // Newest member — drives the displayed timestamp + read state.
  latest: NotificationRow;
  actorId: string;
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
  | ActivityBundle;

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
  const { data: items, isLoading } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const refreshAll = useGlobalRefresh();
  const {
    pull,
    refreshing,
    manualRefreshing,
    released,
    justFinished,
    onManualRefresh,
  } = useRefreshControls(refreshAll);
  const [filter, setFilter] = useState<FilterKey>("all");

  // Resolve parent context (which place / which food) for each
  // notification. Loaded once; react-query dedupes against the home
  // page's usePlaces call so this is free for any user who's already
  // visited home this session. Cached → memoized maps keep per-row
  // lookups O(1).
  useAuth();
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const rowContext = useMemo<ContextResolver>(() => {
    const placeNameById = new Map<string, string>();
    const foodNameById = new Map<string, string>();
    const placeMemoById = new Map<string, string>();
    const foodMemoById = new Map<string, string>();
    for (const p of places ?? []) {
      placeNameById.set(p.id, p.name);
      if (p.memo && p.memo.trim()) placeMemoById.set(p.id, p.memo.trim());
      for (const f of p.foods ?? []) {
        foodNameById.set(f.id, f.name);
        if (f.memo && f.memo.trim())
          foodMemoById.set(f.id, f.memo.trim());
      }
    }
    return {
      placeNameOf: (id) => (id ? (placeNameById.get(id) ?? null) : null),
      foodNameOf: (id) => (id ? (foodNameById.get(id) ?? null) : null),
      placeMemoOf: (id) => (id ? (placeMemoById.get(id) ?? null) : null),
      foodMemoOf: (id) => (id ? (foodMemoById.get(id) ?? null) : null),
    };
  }, [places]);

  const unreadCount = (items ?? []).filter((n) => !n.read_at).length;

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
    for (const n of items ?? []) {
      out.all += 1;
      for (const c of FILTER_CHIPS) {
        if (c.key !== "all" && matchesFilter(n.kind, c.key)) out[c.key] += 1;
      }
    }
    return out;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (!items) return [];
    if (filter === "all") return items;
    return items.filter((n) => matchesFilter(n.kind, filter));
  }, [items, filter]);

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
      }

      if (!shouldBundle || !n.place_id) {
        // Filter is narrowed (the user is looking at one surface),
        // OR this item has no place_id to bundle on — render as a
        // detailed single row.
        out.push({ kind: "single", item: n });
        continue;
      }

      const k = `${n.place_id}|${n.actor_id}`;
      let b = bundles.get(k);
      if (!b) {
        b = {
          kind: "activity-bundle",
          placeId: n.place_id,
          placeEvent: null,
          foods: [],
          memos: [],
          replies: [],
          ratings: [],
          reactions: [],
          reactionEmojis: [],
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
        case "memo":
        case "memo_thread":
          b.memos.push(n);
          break;
        case "memo_reply":
          b.replies.push(n);
          break;
        case "rating":
          b.ratings.push(n);
          break;
        case "revisit":
          b.revisit = n;
          break;
        case "reaction":
          b.reactions.push(n);
          if (n.preview && !b.reactionEmojis.includes(n.preview)) {
            b.reactionEmojis.push(n.preview);
          }
          break;
      }
    }

    // Bundles with exactly one event read better as flat single rows
    // — the card chrome around a single sub-row felt heavy.
    return out.map((row): DisplayRow => {
      if (row.kind === "activity-bundle" && row.allItems.length === 1) {
        return { kind: "single", item: row.allItems[0] };
      }
      return row;
    });
  }, [visibleItems, filter]);

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
            ? `안 읽은 ${unreadCount}개 · 未读 ${unreadCount} 条`
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

      {/* Category filter — horizontal-scrollable chip row so adding a
          new kind later doesn't crowd the bar. Active chip pops with
          peach tint; counts beside the label give a quick at-a-glance
          read of what's piled up. */}
      <div className="px-5 pb-3">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
          {FILTER_CHIPS.map(({ key, ko, zh, icon: Icon }) => {
            const active = filter === key;
            const count = filterCounts[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
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
        {!isLoading && (!items || items.length === 0) && <EmptyState />}
        {!isLoading && items && items.length > 0 && visibleItems.length === 0 && (
          <FilteredEmptyState />
        )}
        {!isLoading && displayRows.length > 0 && (
          <ul className="space-y-1.5">
            {displayRows.map((row) => {
              if (row.kind === "date-header") {
                return (
                  <DateSectionHeader
                    key={`hdr-${row.key}`}
                    ko={row.ko}
                    zh={row.zh}
                  />
                );
              }
              if (row.kind === "single") {
                return <NotificationItem key={row.item.id} item={row.item} />;
              }
              return (
                <ActivityBundleItem key={row.latest.id} bundle={row} />
              );
            })}
          </ul>
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

// Distinct from EmptyState: there ARE notifications, just none in
// the currently selected filter. Hint at clearing the filter so the
// user doesn't think the inbox is empty.
function FilteredEmptyState() {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-2">🔍</div>
      <p className="text-sm font-bold text-ink-700 mb-1">
        이 카테고리엔 알림이 없어요 · 该分类暂无通知
      </p>
      <p className="text-xs text-ink-400">
        다른 카테고리 / 전체로 바꿔보세요 · 试试其他分类或「全部」
      </p>
    </div>
  );
}

// One card per (place, day, actor) bundle. Header = avatar + place
// name (verb flips to "새 장소" when the place itself was created
// in this bundle). Below the header, nested sub-rows for every
// activity kind that has at least one member: 메뉴 N, 메모 N, 답글 N,
// 이모지 N (with emoji bag), 별점 N, 또갈래. Tap anywhere on the card
// → mark every member read + navigate to the place.
function ActivityBundleItem({ bundle }: { bundle: ActivityBundle }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const { name, avatarUrl } = useActorDisplay(bundle.actorId);
  const rowCtx = useRowContext();
  const placeName = rowCtx.placeNameOf(bundle.placeId);
  // Primary memo on the place itself — if the partner wrote a note
  // when they created it ("처음 와봤어!"), surface it in the header.
  const placeMemo = bundle.placeEvent
    ? rowCtx.placeMemoOf(bundle.placeId)
    : null;

  const isUnread = bundle.allItems.some((i) => !i.read_at);
  const unreadIds = bundle.allItems
    .filter((i) => !i.read_at)
    .map((i) => i.id);

  function onTap() {
    if (unreadIds.length && !markRead.isPending) {
      for (const id of unreadIds) void markRead.mutateAsync(id);
    }
    navigate(`/places/${bundle.placeId}`);
  }

  const stamp = relativeKo(bundle.latest.created_at);
  const initial = Array.from(name)[0] ?? "·";
  const toneCls = "bg-rose-100 text-rose-500";

  // Primary kind drives the avatar-corner badge. A bundle that
  // includes the place-creation event treats "place" as primary so
  // the user sees "새 장소" treatment first. Otherwise, pick the
  // kind with the most members (food > memo > reply > reaction >
  // rating > revisit), breaking ties by what feels most visible.
  const primaryKind: NotificationRow["kind"] = bundle.placeEvent
    ? "place"
    : bundle.foods.length > 0
      ? "food"
      : bundle.memos.length > 0
        ? "memo_thread"
        : bundle.replies.length > 0
          ? "memo_reply"
          : bundle.reactions.length > 0
            ? "reaction"
            : bundle.ratings.length > 0
              ? "rating"
              : "revisit";

  const headerVerb = bundle.placeEvent
    ? { ko: "새 장소 등록", zh: "添加了新地点", color: "text-emerald-600" }
    : { ko: "활동", zh: "动态", color: "text-ink-500" };

  // Build the body — one sub-row per non-empty kind. Order matches
  // the rough sequence of a recording session: place → menus →
  // ratings → memos → replies → reactions → revisit.
  type SubRow = {
    key: string;
    Icon: typeof Bell;
    color: string;
    label: string;
    preview: string | null;
  };
  const subRows: SubRow[] = [];
  if (bundle.foods.length > 0) {
    // Enrich each food name with its memo when one exists, so the
    // sub-row reads like "Fried土豆 — "바삭", 牛排, 鸡腿 — "최고"".
    // Memo is clipped to a short excerpt so the row stays one line.
    const clip = (s: string, n = 24) =>
      s.length > n ? s.slice(0, n) + "…" : s;
    const parts: string[] = [];
    for (const f of bundle.foods) {
      if (!f.preview) continue;
      const memo = rowCtx.foodMemoOf(f.food_id);
      parts.push(memo ? `${f.preview} — "${clip(memo)}"` : f.preview);
    }
    const visible = parts.slice(0, 3).join(", ");
    const more = parts.length > 3 ? ` 외 ${parts.length - 3}개` : "";
    subRows.push({
      key: "food",
      Icon: Utensils,
      color: "text-amber-600",
      label: `메뉴 ${bundle.foods.length}개 · 菜品 ${bundle.foods.length}`,
      preview: parts.length ? `${visible}${more}` : null,
    });
  }
  if (bundle.ratings.length > 0) {
    const names = bundle.ratings.map((r) => r.preview).filter(Boolean) as string[];
    subRows.push({
      key: "rating",
      Icon: Star,
      color: "text-yellow-600",
      label: `별점 ${bundle.ratings.length}개 · 打分 ${bundle.ratings.length}`,
      preview: names.length ? names.slice(0, 3).join(", ") : null,
    });
  }
  // Memos + replies share a single sub-row — visually they're both
  // "comments" from the user's point of view, and splitting them
  // doubled the bundle's row count without adding scannable info.
  // Replies get a small ↪ prefix inline so they're still
  // distinguishable from top-level memos.
  if (bundle.memos.length + bundle.replies.length > 0) {
    const parts: string[] = [];
    for (const m of bundle.memos) {
      if (m.preview) parts.push(`"${m.preview}"`);
    }
    for (const r of bundle.replies) {
      if (r.preview) parts.push(`↪ "${r.preview}"`);
    }
    const total = bundle.memos.length + bundle.replies.length;
    const visible = parts.slice(0, 2).join(" · ");
    const more = parts.length > 2 ? ` 외 ${parts.length - 2}개` : "";
    subRows.push({
      key: "memo",
      Icon: MessageCircle,
      color: "text-sky-600",
      label: `메모/답글 ${total}개 · 留言 ${total}`,
      preview: parts.length ? `${visible}${more}` : null,
    });
  }
  if (bundle.reactions.length > 0) {
    subRows.push({
      key: "reaction",
      Icon: Smile,
      color: "text-rose-600",
      label: `이모지 ${bundle.reactions.length} · 表情 ${bundle.reactions.length}`,
      // Distinct emojis surface inline so the user sees ❤️😘🥹 at a
      // glance without opening anything.
      preview: bundle.reactionEmojis.length
        ? bundle.reactionEmojis.join(" ")
        : null,
    });
  }
  if (bundle.revisit) {
    subRows.push({
      key: "revisit",
      Icon: Heart,
      color: "text-pink-600",
      label: "또 갈래 · 想再去",
      preview: null,
    });
  }

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-2xl transition active:scale-[0.99] border ${
          isUnread
            ? "bg-peach-50/60 border-peach-200/60"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
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
          <KindBadge kind={primaryKind} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] leading-snug">
            <span className="font-bold text-ink-900">{name}</span>
            <span className="text-ink-400 mx-1">·</span>
            <span className={`font-bold ${headerVerb.color}`}>
              {headerVerb.ko} · {headerVerb.zh}
            </span>
          </p>
          {placeName && (
            <p className="text-[12px] text-ink-700 font-bold mt-0.5 line-clamp-1 break-keep truncate">
              {placeName}
            </p>
          )}
          {/* Place's primary memo — shown only when this bundle is
              ABOUT a new place AND that place was created with a
              memo. Reads as a small italic quote under the place
              name, separate from the activity sub-rows below. */}
          {placeMemo && (
            <p className="text-[11px] text-ink-500 italic mt-0.5 line-clamp-2 break-keep">
              "{placeMemo}"
            </p>
          )}
          {/* Indented sub-rows — visual hierarchy under the place
              header. Each row is one kind: icon + label + preview. */}
          {subRows.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 border-l-2 border-cream-200 pl-2 ml-0.5">
              {subRows.map((s) => {
                const Icon = s.Icon;
                return (
                  <li
                    key={s.key}
                    className="flex items-start gap-1.5 text-[11px] leading-snug"
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
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[10px] text-ink-400 font-medium font-number mt-1">
            {stamp}
          </p>
        </div>
        {isUnread && (
          <span
            className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 flex-shrink-0"
            aria-label="unread"
          />
        )}
      </button>
    </li>
  );
}

// Day-bucket section header. Sits between groups of notifications
// in the feed so the user can scan "오늘 · 어제 · 5월 12일" without
// hunting through timestamps. Plain <li> so it integrates with the
// surrounding <ul> stacking without breaking the bullet-list semantics.
function DateSectionHeader({ ko, zh }: { ko: string; zh: string }) {
  return (
    <li className="pt-3 first:pt-0 pb-0.5 px-1 select-none">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-ink-400 tracking-wide">
          {ko} <span className="text-ink-300 font-medium">· {zh}</span>
        </span>
        <div className="h-px flex-1 bg-cream-100" />
      </div>
    </li>
  );
}

function NotificationItem({ item }: { item: NotificationRow }) {
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
    if (!item.place_id) return null;
    const base = `/places/${item.place_id}`;
    if (item.memo_id) return `${base}#memo-${item.memo_id}`;
    if (item.food_id) return `${base}#food-${item.food_id}`;
    return base;
  })();

  // On row tap: mark as read + navigate. Mark first (fire-and-forget)
  // so the unread badge updates immediately even if navigation happens
  // before the network round-trip finishes. Guard against rapid taps
  // firing the mutation twice while the first round-trip is in flight.
  function onTap() {
    if (!item.read_at && !markRead.isPending) {
      void markRead.mutateAsync(item.id);
    }
    if (linkTo) navigate(linkTo);
  }

  const isUnread = !item.read_at;
  const spec = kindSpec(item.kind);
  const stamp = relativeKo(item.created_at);
  const initial = Array.from(name)[0] ?? "·";
  // Actor on a notification is always the partner (the trigger
  // excludes the recipient's own actions), so the colored fallback
  // bubble can lock to rose without computing a per-row tone.
  const toneCls = "bg-rose-100 text-rose-500";

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-2xl transition active:scale-[0.99] border ${
          isUnread
            ? "bg-peach-50/60 border-peach-200/60"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
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
            <span className={`font-bold ${spec.textColor}`}>{spec.verb}</span>
          </p>
          {(() => {
            const contextLine = composeContextLine(item, rowCtx);
            if (!contextLine) return null;
            return (
              <p className="text-[12px] text-ink-700 mt-0.5 line-clamp-1 break-keep">
                <span className="truncate">{contextLine}</span>
              </p>
            );
          })()}
          <p className="text-[10px] text-ink-400 font-medium font-number mt-0.5">
            {stamp}
          </p>
        </div>
        {isUnread && (
          <span
            className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 flex-shrink-0"
            aria-label="unread"
          />
        )}
      </button>
    </li>
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
