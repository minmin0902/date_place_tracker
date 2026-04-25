import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/hooks/useNotifications";

// Bell icon + unread badge → /notifications. Sized to match the other
// circular icon buttons in the home-page header (refresh, search) so
// the action row stays visually consistent.
export function NotificationBell() {
  const { data: count = 0 } = useUnreadCount();
  return (
    <Link
      to="/notifications"
      className="relative p-3 bg-cream-100/70 rounded-full text-ink-700 hover:bg-cream-200 transition border border-cream-200/50"
      aria-label={`알림 ${count}개 · 通知 ${count} 条`}
      title="알림 · 通知"
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span
          className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center font-number leading-none"
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
