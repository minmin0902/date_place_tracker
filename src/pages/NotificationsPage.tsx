import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle, MapPin, Utensils, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/useNotifications";
import { useMemoAuthor } from "@/hooks/useProfile";
import type { NotificationRow } from "@/lib/database.types";

// Inbox: every notification triggered for the current user. Tapping
// a row marks it read and deep-links to the source content. A "전부
// 읽음" footer button clears the badge in one shot.
export default function NotificationsPage() {
  const { data: items, isLoading } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const unreadCount = (items ?? []).filter((n) => !n.read_at).length;

  return (
    <div>
      <PageHeader
        title="알림 · 通知"
        subtitle={
          unreadCount > 0
            ? `안 읽은 ${unreadCount}개 · 未读 ${unreadCount} 条`
            : "전부 읽었어요 · 全部已读"
        }
        back
        right={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAll.mutateAsync()}
              disabled={markAll.isPending}
              className="btn-ghost !px-3 !py-2 text-[12px] font-bold text-peach-500 disabled:opacity-50"
              aria-label="mark all read"
              title="전부 읽음 · 全部已读"
            >
              <CheckCheck className="w-5 h-5" />
            </button>
          ) : undefined
        }
      />

      <div className="px-5 pb-8">
        {isLoading && (
          <p className="text-center text-ink-400 text-sm py-8">
            불러오는 중… · 加载中…
          </p>
        )}
        {!isLoading && (!items || items.length === 0) && <EmptyState />}
        {!isLoading && items && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((n) => (
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

function NotificationItem({ item }: { item: NotificationRow }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const { name, avatarUrl, tone } = useMemoAuthor(item.actor_id);

  // Resolve where to navigate based on the notification kind. Foods
  // and threaded memos still land on the parent place page — the food
  // detail / memo lives there, not on a separate route.
  const linkTo = (() => {
    if (item.place_id) return `/places/${item.place_id}`;
    return null;
  })();

  // On row tap: mark as read + navigate. Mark first (fire-and-forget)
  // so the unread badge updates immediately even if navigation happens
  // before the network round-trip finishes.
  function onTap() {
    if (!item.read_at) void markRead.mutateAsync(item.id);
    if (linkTo) navigate(linkTo);
  }

  const isUnread = !item.read_at;
  const icon = (() => {
    switch (item.kind) {
      case "place":
        return <MapPin className="w-4 h-4" />;
      case "food":
        return <Utensils className="w-4 h-4" />;
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
        return "메뉴 추가 · 添加了菜品";
      case "memo":
        return "메모 수정 · 修改了备注";
      case "memo_thread":
        return "메모 남김 · 留了言";
      default:
        return "";
    }
  })();
  const stamp = relativeKo(item.created_at);
  const initial = Array.from(name)[0] ?? "·";
  const toneCls =
    tone === "peach"
      ? "bg-peach-100 text-peach-500"
      : "bg-rose-100 text-rose-500";

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
