import { NavLink, Outlet } from "react-router-dom";
import { Home, Map, Scale, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppBadge } from "@/hooks/useAppBadge";

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
      {/* pb reserves room for the fixed bottom nav (~64px) PLUS the device
          safe-area inset (~34px on iPhone X+), otherwise the last row gets
          hidden behind the nav. */}
      <main
        className="flex-1"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
        }}
      >
        <Outlet />
      </main>
      {/* z-20 sits ABOVE the timeline dots (z-[1]) so they don't peek
          through the nav, and BELOW the floating dice/add cluster
          (z-30) so the FAB still floats above the nav. bg-white/95
          plus the existing backdrop-blur kills the see-through bleed
          while keeping the soft frosted feel. */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur-md border-t border-cream-200/60 safe-bottom shadow-[0_-4px_20px_rgb(0,0,0,0.03)]">
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
