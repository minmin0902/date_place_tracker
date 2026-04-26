import { useEffect } from "react";

// Lightweight bilingual confirm dialog. Fixed overlay + centered card
// with two buttons. Locks body scroll while open so iOS Safari doesn't
// fight the user trying to read the prompt. The "no" path is meant to
// feel reassuring (e.g. "先看看 / 좀 더 볼게") rather than scary, so
// callers control both labels per use case.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "peach",
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  // Visual hint for the confirm button — peach for "yes do it",
  // rose for destructive actions.
  tone?: "peach" | "rose";
  onConfirm: () => void;
  onCancel: () => void;
  // Lock the confirm button while the underlying mutation is mid-flight
  // so the user can't double-fire.
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc key closes — keyboard users + desktop testing get an out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls =
    tone === "rose"
      ? "bg-rose-400 hover:bg-rose-500 text-white"
      : "bg-peach-400 hover:bg-peach-500 text-white";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm animate-fade"
        onClick={busy ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 bg-white w-full max-w-sm rounded-3xl shadow-lift border border-cream-200 p-5 animate-fade-up overflow-hidden"
      >
        {/* Prominent universal heading at the top — sets the tone
            ("are you sure?") before the specific question lands so
            the user mentally braces for a confirm regardless of how
            long the per-call title is. */}
        <p className="text-[22px] font-black text-ink-900 leading-tight mb-2 break-words">
          정말요? · 你确定吗？
        </p>
        <h2 className="text-[14px] font-bold text-ink-700 leading-snug mb-1 break-words [overflow-wrap:anywhere]">
          {title}
        </h2>
        {body && (
          <p className="text-[12px] text-ink-500 leading-snug break-words [overflow-wrap:anywhere]">
            {body}
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-2xl border border-cream-200 bg-cream-50 text-ink-700 font-bold text-[13px] active:scale-95 hover:bg-cream-100 transition disabled:opacity-50 break-words"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-2xl font-bold text-[13px] shadow-soft active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed break-words ${confirmCls}`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
