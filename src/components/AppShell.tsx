import { useEffect, useRef } from "react";
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

function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef<string | null>(null);

  // Take over scroll restoration once on mount. Default 'auto' lets
  // the browser race us; 'manual' lets us schedule the restore after
  // React has rendered the destination tree.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    // Snapshot the OUTGOING route's scrollY so a future POP can
    // bring us back here. Skip the first effect run (no previous
    // path to snapshot).
    if (prevPath.current && prevPath.current !== pathname) {
      const map = readMap();
      map[prevPath.current] = window.scrollY;
      writeMap(map);
    }

    if (navType === "POP") {
      // Restore. Single-shot scrollTo isn't robust when the
      // destination is data-driven: react-query may render cached
      // data immediately, but late effects (avatar loads, image
      // height resolves, lazy chunks, etc.) keep the document
      // growing for tens to hundreds of ms after mount. Without
      // retry we scroll to N but then content reflows and we end
      // up at min(N, scrollHeight). Solution: keep nudging the
      // scroll back to target each frame for up to ~500ms, bailing
      // immediately if the user starts interacting so we don't
      // fight their gesture.
      const map = readMap();
      const target = map[pathname] ?? 0;
      if (target === 0) {
        window.scrollTo(0, 0);
        prevPath.current = pathname;
        return;
      }
      let cancelled = false;
      const stopAt = Date.now() + 600;
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
        if (Math.abs(window.scrollY - target) <= 2) return;
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
      prevPath.current = pathname;
      return cleanup;
    }
    // PUSH / REPLACE → go to top of the new route.
    window.scrollTo(0, 0);
    prevPath.current = pathname;
  }, [pathname, navType]);

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
  return (
    <NavLink
      to={to}
      end
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
  // Sync the OS home-screen icon badge with the unread count so the
  // red dot clears immediately when the user marks notifications read.
  useAppBadge();
  return (
    <div className="min-h-full flex flex-col bg-cream-50">
      <ScrollManager />
      {/* pb reserves room for the fixed bottom nav (~64px) PLUS the device
          safe-area inset (~34px on iPhone X+), otherwise the last row gets
          hidden behind the nav. */}
      <main
        className="flex-1"
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
