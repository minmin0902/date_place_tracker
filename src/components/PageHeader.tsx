import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  return (
    <header className="px-5 pt-5 pb-4 flex items-start gap-3">
      {back && (
        <button
          onClick={() => navigate(-1)}
          className="btn-ghost -ml-2 !px-2 !py-2"
          aria-label="back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-sans font-black text-ink-900 truncate tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-ink-500 mt-0.5 font-medium">{subtitle}</p>
        )}
      </div>
      {right}
    </header>
  );
}
