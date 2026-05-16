import {
  Suspense,
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import {
  consumeHomeNavRestore,
  notifyHomeNavReselect,
  queueHomeNavRestore,
} from "@/lib/navEvents";

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

function isHomeRoute(key: string) {
  return key === "/" || key.startsWith("/?");
}

function isDetailRoute(key: string) {
  return key.startsWith("/places/");
}

function OutletLoadingToast() {
  return (
    <div className="flex min-h-[35vh] items-start justify-center pt-4">
      <div className="flex items-center gap-2 rounded-full border border-cream-200 bg-white/90 px-3 py-2 text-xs font-bold text-ink-500 shadow-soft backdrop-blur">
        <span className="h-3 w-3 rounded-full border-2 border-coral-300 border-t-transparent animate-spin" />
        加载中
      </div>
    </div>
  );
}

function leavingScrollY(existing: number, current: number) {
  // During route changes Safari/React Router can reset window.scrollY
  // to 0 before our layout effect gets a chance to persist the page
  // we're leaving. If we write that transient 0, every back navigation
  // lands at the top. Scroll/click/touch handlers keep `existing`
  // up-to-date while the user is actually on the page, so preserve it
  // whenever the route-change read suddenly reports top.
  if (current <= 2 && existing > 2) return existing;
  return current;
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
      const existing = getScrollMap()[previous] ?? 0;
      saveScroll(previous, leavingScrollY(existing, window.scrollY), true);
    }
    currentKey.current = routeKey;

    const target = getScrollMap()[routeKey] ?? 0;
    const shouldRestoreHomeNav =
      isHomeRoute(routeKey) && consumeHomeNavRestore();
    const shouldRestore =
      shouldRestoreHomeNav ||
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
        queueHomeNavRestore();
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
        <Suspense fallback={<OutletLoadingToast />}>
          <Outlet />
        </Suspense>
      </main>
      <AppScrollIndicator routeKey={routeKey} />
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

function AppScrollIndicator({ routeKey }: { routeKey: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const [state, setState] = useState({
    visible: false,
    active: false,
    thumbHeight: 0,
    thumbY: 0,
  });

  const update = useCallback((active = false) => {
    const track = trackRef.current;
    const doc = document.documentElement;
    const body = document.body;
    const viewportHeight = window.innerHeight || doc.clientHeight || 0;
    const scrollHeight = Math.max(
      doc.scrollHeight,
      body?.scrollHeight ?? 0,
      viewportHeight
    );
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);
    const trackHeight = track?.clientHeight ?? 0;
    const visible = maxScroll > 6 && trackHeight > 40;
    const minThumb = Math.min(72, Math.max(36, trackHeight * 0.18));
    const rawThumb = visible
      ? (viewportHeight / scrollHeight) * trackHeight
      : 0;
    const thumbHeight = visible
      ? Math.min(trackHeight, Math.max(minThumb, rawThumb))
      : 0;
    const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    const thumbY = visible
      ? Math.max(0, Math.min(1, progress)) * (trackHeight - thumbHeight)
      : 0;

    setState((prev) => {
      const next = {
        visible,
        active: visible && (active || prev.active),
        thumbHeight,
        thumbY,
      };
      if (
        prev.visible === next.visible &&
        prev.active === next.active &&
        Math.abs(prev.thumbHeight - next.thumbHeight) < 0.5 &&
        Math.abs(prev.thumbY - next.thumbY) < 0.5
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const scheduleUpdate = useCallback(
    (active = false) => {
      if (active) {
        if (idleTimerRef.current !== null) {
          window.clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = window.setTimeout(() => {
          idleTimerRef.current = null;
          setState((prev) => ({ ...prev, active: false }));
        }, 700);
      }
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        update(active);
      });
    },
    [update]
  );

  useEffect(() => {
    const onScroll = () => scheduleUpdate(true);
    const onResize = () => scheduleUpdate(false);
    let resizeObserver: ResizeObserver | null = null;

    scheduleUpdate(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate(false));
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      resizeObserver?.disconnect();
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [routeKey, scheduleUpdate]);

  return (
    <div
      ref={trackRef}
      className="app-scroll-indicator"
      data-visible={state.visible}
      data-active={state.active}
      aria-hidden="true"
      style={
        {
          "--app-scroll-thumb-height": `${state.thumbHeight}px`,
          "--app-scroll-thumb-y": `${state.thumbY}px`,
        } as CSSProperties
      }
    >
      <div className="app-scroll-indicator__thumb" />
    </div>
  );
}
