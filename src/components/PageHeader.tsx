import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export function PageHeader({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  // React Router stamps the very first entry with key "default" — that
  // means we got here as a fresh navigation (cold start, deep link from
  // a push notification, etc) with no prior history. navigate(-1) on
  // that stack is a no-op (just sits there or, in PWA mode, exits the
  // app), which is what made tapping a notification feel like the back
  // button was broken. Fall back to a hard navigate to home so users
  // always have a way out.
  const handleBack = () => {
    if (location.key === "default") {
      navigate("/");
    } else {
      navigate(-1);
    }
  };
  return (
    <header className="px-5 pt-5 pb-4 flex items-start gap-3">
      {back && (
        <button
          onClick={handleBack}
          className="btn-ghost -ml-2 !px-2 !py-2"
          aria-label="back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {/* Matches the HomePage hero so all top-level pages share the
            same brand wordmark. break-keep prevents Korean from
            mid-word breaking; allowing wrap (instead of truncate) is
            what keeps long bilingual titles from getting clipped on
            narrow phones. */}
        <h1 className="text-[20px] sm:text-[24px] font-sans font-black text-transparent bg-clip-text bg-gradient-to-r from-peach-400 to-rose-400 tracking-tight leading-tight break-keep mb-1">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] sm:text-xs text-ink-400 font-bold leading-snug break-keep">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </header>
  );
}
