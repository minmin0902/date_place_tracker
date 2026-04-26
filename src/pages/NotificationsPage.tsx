import { useMemo, useState } from "react";
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
import type { NotificationRow } from "@/lib/database.types";

// Filter buckets — collapse the six raw notification kinds into five
// user-facing categories so the chip row stays scannable. "메모" lumps
// both legacy single-memo edits and threaded comments since the user
// thinks of them as the same surface.
type FilterKey = "all" | "place" | "memo" | "rating" | "revisit";

const FILTER_CHIPS: { key: FilterKey; ko: string; zh: string; icon: typeof Bell }[] = [
  { key: "all", ko: "전체", zh: "全部", icon: Bell },
  { key: "place", ko: "새 기록", zh: "新记录", icon: Plus },
  { key: "memo", ko: "메모", zh: "留言", icon: MessageCircle },
  { key: "rating", ko: "평점", zh: "打分", icon: Star },
  { key: "revisit", ko: "또 갈래", zh: "想再去", icon: Heart },
];

function matchesFilter(kind: NotificationRow["kind"], filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "place") return kind === "place" || kind === "food";
  if (filter === "memo") return kind === "memo" || kind === "memo_thread";
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

  return (
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
        {!isLoading && visibleItems.length > 0 && (
          <ul className="space-y-2">
            {visibleItems.map((n) => (
              <NotificationItem key={n.id} item={n} />
            ))}
          </ul>
        )}
      </div>
    </div>
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

function NotificationItem({ item }: { item: NotificationRow }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  // Actor is rendered with their OWN profile nickname (whatever they
  // set for themselves) — not the pet name the recipient may have
  // assigned via partner_nickname.
  const { name, avatarUrl } = useActorDisplay(item.actor_id);

  // Resolve where to navigate based on the notification kind. Foods
  // and threaded memos still land on the parent place page — the food
  // detail / memo lives there, not on a separate route.
  const linkTo = (() => {
    if (item.place_id) return `/places/${item.place_id}`;
    return null;
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
  const icon = (() => {
    switch (item.kind) {
      case "place":
        return <MapPin className="w-4 h-4" />;
      case "food":
        return <Utensils className="w-4 h-4" />;
      case "revisit":
        return <Heart className="w-4 h-4" />;
      case "rating":
        return <Star className="w-4 h-4" />;
      case "memo":
      case "memo_thread":
      default:
        return <MessageCircle className="w-4 h-4" />;
    }
  })();
  const verb = (() => {
    switch (item.kind) {
      case "place":
        return "새 장소 등록 · 添加了新地点";
      case "food":
        return "메뉴 추가 · 记下了新菜品";
      case "memo":
        return "메모 수정 · 改了备注";
      case "memo_thread":
        return "메모 남김 · 留了言";
      case "revisit":
        return "또 갈래 · 想再去";
      case "rating":
        return "별점 줬어요 · 打了分";
      default:
        return "";
    }
  })();
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
        className={`w-full text-left flex items-start gap-3 p-3 rounded-2xl transition active:scale-[0.99] border ${
          isUnread
            ? "bg-peach-50/60 border-peach-200/60"
            : "bg-white border-cream-200 hover:bg-cream-50"
        }`}
      >
        <div
          className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-black text-[14px] border border-cream-200 ${avatarUrl ? "" : toneCls}`}
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
        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-snug">
            <span className="font-bold text-ink-900">{name}</span>
            <span className="text-ink-500 mx-1">·</span>
            <span className="text-ink-500 text-[12px]">{verb}</span>
          </p>
          {item.preview && (
            <p className="text-[12px] text-ink-700 mt-1 line-clamp-2 break-keep flex items-start gap-1.5">
              <span className="text-ink-400 mt-0.5 flex-shrink-0">{icon}</span>
              <span>{item.preview}</span>
            </p>
          )}
          <p className="text-[10px] text-ink-400 font-medium font-number mt-1.5">
            {stamp}
          </p>
        </div>
        {isUnread && (
          <span
            className="w-2 h-2 rounded-full bg-rose-400 mt-2 flex-shrink-0"
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
