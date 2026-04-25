import { useEffect } from "react";
import { useUnreadCount } from "./useNotifications";

// Mirror unread notification count to the OS app icon badge while
// the app is open. The Service Worker handles badge updates that
// arrive via push when the app is closed; this hook covers the
// "user opened the app and read some notifications" case so the
// badge clears in real time.
//
// Web Badging API quirks:
//   - iOS 16.4+ PWAs (added to Home Screen) — supported.
//   - Regular Safari tab — silently no-op (which is fine; users
//     looking at the page already see the bell badge).
//   - setAppBadge(0) is allowed but clearAppBadge is the canonical
//     "no badge" call — we use it for the zero case.
export function useAppBadge() {
  const { data: count = 0 } = useUnreadCount();
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // Cast through unknown — TypeScript DOM lib doesn't model the
    // Badging API on Navigator yet across all targets.
    const nav = navigator as unknown as {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && nav.setAppBadge) {
      nav.setAppBadge(count).catch(() => {});
    } else if (count === 0 && nav.clearAppBadge) {
      nav.clearAppBadge().catch(() => {});
    }
  }, [count]);
}
