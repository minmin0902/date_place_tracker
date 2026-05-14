import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { Home, Map, Scale, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppBadge } from "@/hooks/useAppBadge";
import { preloadAppRoutes, preloadRouteForPath } from "@/lib/routePreload";
import { notifyHomeNavReselect, queueHomeNavReselect } from "@/lib/navEvents";

// Scroll behavior across route changes:
//   - PUSH / REPLACE (forward nav): scroll to top, otherwise the new
//     route inherits the previous page's scrollY and feels "shifted
//     down". Also save the leaving page's scrollY so a later POP can
//     restore it.
//   - POP (browser back / forward button): restore the saved scrollY
//     for that path. Without this, hitting back lands you at the top
//     instead of where you were — exactly the "어디 갔다 오면 위로
//     올라가있다" complaint.
//
// State lives in sessionStorage so a hard refresh (or PWA app
// re-launch) drops it cleanly. Manual scrollRestoration so the
// browser doesn't fight us during the React re-render that follows
// a POP — we own the restore timing via rAF.
const SCROLL_KEY = "scroll-pos:v1";
type ScrollMap = Record<string, number>;

function readMap(): ScrollMap {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    return raw ? (JSON.parse(raw) as ScrollMap) : {};
  } catch {
    return {};
  }
}
function writeMap(map: ScrollMap) {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage full / disabled — scroll restore degrades to
    // "stays at current position", which is still better than the
    // old always-scroll-to-top behavior.
  }
}

function routeScrollKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function isListReturnRoute(key: string) {
  return (
    key === "/" ||
    key.startsWith("/?") ||
    key === "/notifications" ||
    key === "/map" ||
    key === "/compare"
  );
}

function isDetailRoute(key: string) {
  return key.startsWith("/places/");
}

function ScrollManager() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const routeKey = routeScrollKey(pathname, search);
  const prevKey = useRef<string | null>(null);
  const currentKey = useRef(routeKey);
  const scrollMap = useRef<ScrollMap | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRaf = useRef<number | null>(null);

  const getScrollMap = useCallback(() => {
    if (!scrollMap.current) scrollMap.current = readMap();
    return scrollMap.current;
  }, []);

  const flushScrollMap = useCallback(() => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    writeMap(getScrollMap());
  }, [getScrollMap]);

  const saveScroll = useCallback(
    (key: string, y = window.scrollY, flush = false) => {
      const map = getScrollMap();
      map[key] = Math.max(0, Math.round(y));
      if (flush) {
        flushScrollMap();
        return;
      }
      if (!writeTimer.current) {
        writeTimer.current = setTimeout(() => {
          writeTimer.current = null;
          writeMap(getScrollMap());
        }, 120);
      }
    },
    [flushScrollMap, getScrollMap]
  );

  // Take over scroll restoration once on mount. Default 'auto' lets
  // the browser race us; 'manual' lets us schedule the restore after
  // React has rendered the destination tree.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const saveCurrent = () =>
      saveScroll(currentKey.current, window.scrollY, true);
    const onScroll = () => {
      if (scrollRaf.current !== null) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null;
        saveScroll(currentKey.current, window.scrollY);
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveCurrent();
    };
    const touchOpts = { passive: true, capture: true } as const;

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveCurrent);
    window.addEventListener("beforeunload", saveCurrent);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("click", saveCurrent, true);
    document.addEventListener("touchstart", saveCurrent, touchOpts);
    return () => {
      saveCurrent();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", saveCurrent);
      window.removeEventListener("beforeunload", saveCurrent);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("click", saveCurrent, true);
      document.removeEventListener("touchstart", saveCurrent, touchOpts);
      if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
      flushScrollMap();
    };
  }, [flushScrollMap, saveScroll]);

  useLayoutEffect(() => {
    // Layout effect runs before PlaceDetailPage's hash scroll effect,
    // so the outgoing list route is saved before #food/#memo anchors
    // move the window on the incoming detail page.
    const previous = prevKey.current;
    if (previous && previous !== routeKey) {
      // Browser/React Router can reset scrollY to 0 before this route
      // effect runs on list -> detail navigation. The click/touch/scroll
      // handlers above already captured the real list position, so do
      // not let this late 0 overwrite it.
      const existing = getScrollMap()[previous] ?? 0;
      const y =
        isListReturnRoute(previous) && isDetailRoute(routeKey)
          ? Math.max(existing, window.scrollY)
          : window.scrollY;
      saveScroll(previous, y, true);
    }
    currentKey.current = routeKey;

    const target = getScrollMap()[routeKey] ?? 0;
    const shouldRestore =
      navType === "POP" ||
      (target > 0 &&
        !!previous &&
        isDetailRoute(previous) &&
        isListReturnRoute(routeKey));

    if (shouldRestore) {
      // Restore. Single-shot scrollTo isn't robust when the
      // destination is data-driven: react-query may render cached
      // data immediately, but late effects (avatar loads, image
      // height resolves, lazy chunks, etc.) keep the document
      // growing for tens to hundreds of ms after mount. Without
      // retry we scroll to N but then content reflows and we end
      // up at min(N, scrollHeight). Solution: keep nudging the
      // scroll back to target each frame for up to ~2.5s, bailing
      // immediately if the user starts interacting so we don't
      // fight their gesture.
      if (target === 0) {
        window.scrollTo(0, 0);
        prevKey.current = routeKey;
        return;
      }
      let cancelled = false;
      const stopAt = Date.now() + 2500;
      const bail = () => {
        cancelled = true;
      };
      // Any user gesture aborts our retry loop. Once-listener +
      // passive so we don't get in the way of native scroll.
      window.addEventListener("wheel", bail, { passive: true, once: true });
      window.addEventListener("touchstart", bail, {
        passive: true,
        once: true,
      });
      window.addEventListener("keydown", bail, { once: true });
      const tick = () => {
        if (cancelled) return;
        window.scrollTo(0, target);
        // Within a few pixels of target → done.
        if (Math.abs(window.scrollY - target) <= 3) return;
        if (Date.now() > stopAt) return;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(() => requestAnimationFrame(tick));
      // Cleanup if the route changes again before we finish.
      const cleanup = () => {
        cancelled = true;
        window.removeEventListener("wheel", bail);
        window.removeEventListener("touchstart", bail);
        window.removeEventListener("keydown", bail);
      };
      prevKey.current = routeKey;
      return cleanup;
    }
    // PUSH / REPLACE → go to top of the new route.
    window.scrollTo(0, 0);
    saveScroll(routeKey, 0);
    prevKey.current = routeKey;
  }, [getScrollMap, navType, routeKey, saveScroll]);

  return null;
}

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Home;
  label: string;
}) {
  const { pathname } = useLocation();
  const warmRoute = () => preloadRouteForPath(to);
  return (
    <NavLink
      to={to}
      end
      onClick={(event) => {
        if (to !== "/") return;
        if (pathname === "/") {
          event.preventDefault();
          notifyHomeNavReselect();
          return;
        }
        queueHomeNavReselect();
      }}
      onFocus={warmRoute}
      onPointerEnter={warmRoute}
      onTouchStart={warmRoute}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-xs",
          isActive ? "text-peach-500" : "text-ink-500"
        )
      }
    >
      <Icon className="w-6 h-6" strokeWidth={1.8} />
      <span>{label}</span>
    </NavLink>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const routeKey = `${pathname}${search}`;
  const [routeSettling, setRouteSettling] = useState(false);
  // Sync the OS home-screen icon badge with the unread count so the
  // red dot clears immediately when the user marks notifications read.
  useAppBadge();
  useEffect(() => {
    preloadAppRoutes();
  }, []);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setRouteSettling(true);
    const timer = window.setTimeout(() => setRouteSettling(false), 170);
    return () => window.clearTimeout(timer);
  }, [routeKey]);
  return (
    <div className="min-h-full flex flex-col bg-cream-50">
      <ScrollManager />
      {/* pb reserves room for the fixed bottom nav (~64px) PLUS the device
          safe-area inset (~34px on iPhone X+), otherwise the last row gets
          hidden behind the nav. */}
      <main
        className={`flex-1 ${routeSettling ? "route-soft-settle" : ""}`}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
        }}
      >
        {/* Outlet renders without a pathname key so back-navigation
            doesn't tear down + rebuild the previous page's DOM. The
            old keyed wrapper retriggered .animate-fade-up on every
            nav, which doubled as a "give every page a fresh remount"
            — felt nice on PUSH but on POP it killed the scroll
            position the ScrollManager just restored and forced every
            query subscription to re-establish. React Router naturally
            re-renders Outlet's children when the route changes; we
            don't need the explicit key. */}
        <Outlet />
      </main>
      {/* z-20 sits ABOVE the timeline dots (z-[1]) so they don't peek
          through the nav, and BELOW the floating dice/add cluster
          (z-30) so the FAB still floats above the nav.
          bg-white solid (was bg-white/95 + backdrop-blur-md) — the
          frosted glass cost iOS a re-rasterize of the nav strip on
          every scroll frame because content scrolls under it. With
          95% opacity we never really saw through it anyway, so the
          blur was paying GPU for an effect users couldn't perceive. */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-cream-200/60 safe-bottom shadow-[0_-4px_20px_rgb(0,0,0,0.03)]">
        <div className="max-w-md mx-auto flex">
          <NavItem to="/" icon={Home} label={t("nav.home")} />
          <NavItem to="/map" icon={Map} label={t("nav.map")} />
          <NavItem to="/compare" icon={Scale} label={t("nav.compare")} />
          <NavItem to="/settings" icon={Settings} label={t("nav.settings")} />
        </div>
      </nav>
    </div>
  );
}
