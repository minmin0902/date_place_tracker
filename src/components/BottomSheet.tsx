import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/utils";

export function BottomSheet({
  open,
  onClose,
  children,
  title,
  className,
  bodyClassName,
  showClose = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
  bodyClassName?: string;
  showClose?: boolean;
}) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink-900/35 animate-fade"
        onClick={onClose}
        aria-label="close"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-md rounded-t-[1.5rem] border border-cream-200 bg-white shadow-2xl animate-sheet-up overflow-hidden",
          className
        )}
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
        }}
      >
        <div className="relative flex items-center justify-center px-3 py-2">
          <div className="h-1 w-10 rounded-full bg-cream-200" aria-hidden />
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              className="smooth-touch absolute right-3 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:bg-cream-50 hover:text-ink-700"
              aria-label="close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className={cn("px-3 pb-1", bodyClassName)}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
