import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useId, useMemo, useState } from "react";

function starFillFor(value: number | null, index: number) {
  const v = value ?? 0;
  if (v >= index) return 1;
  if (v <= index - 1) return 0;
  return v - (index - 1);
}

export function RatingPicker({
  value,
  onChange,
  color = "peach",
}: {
  value: number | null;
  onChange: (n: number) => void;
  color?: "peach" | "rose" | "sage";
}) {
  const id = useId();
  const fillClass =
    color === "rose"
      ? "text-rose-400"
      : color === "sage"
        ? "text-sage-400"
        : "text-peach-400";
  const borderClass =
    color === "rose"
      ? "border-rose-200 focus:border-rose-400 focus:ring-rose-100"
      : color === "sage"
        ? "border-sage-200 focus:border-sage-400 focus:ring-sage-100"
        : "border-peach-200 focus:border-peach-400 focus:ring-peach-100";

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  // Track the typed string separately so a user can clear the field
  // mid-typing ("3." → "3.7") without the number coercing back.
  const [draft, setDraft] = useState<string>(
    value == null ? "" : value.toString()
  );
  useEffect(() => {
    // Keep the input display in sync when star / slider moves the value.
    setDraft(value == null ? "" : value.toString());
  }, [value]);

  function commitDraft(raw: string) {
    const t = raw.trim();
    if (t === "") return;
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(5, n));
    // Round to 0.1 to match the slider step.
    const rounded = Math.round(clamped * 10) / 10;
    onChange(rounded);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex gap-1">
          {stars.map((n) => {
            const partial = starFillFor(value, n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className="relative p-1 active:scale-95 transition"
                aria-label={`rate-${n}`}
              >
                <Star className="w-7 h-7 text-ink-300" strokeWidth={1.5} />
                <div
                  style={{ width: `${partial * 100}%` }}
                  className={`absolute left-0 top-0 overflow-hidden pointer-events-none ${fillClass}`}
                >
                  <Star className="w-7 h-7" strokeWidth={1.5} />
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              commitDraft(v);
            }}
            onBlur={(e) => {
              if (e.target.value.trim() === "") {
                // User emptied the field on purpose → reset to 0.
                onChange(0);
                setDraft("0");
              }
            }}
            placeholder="0.0"
            className={`w-14 px-2 py-1 rounded-lg bg-white border text-sm font-number font-bold text-center text-ink-900 focus:outline-none focus:ring-2 transition ${borderClass}`}
            aria-label="rating-number"
          />
          <span className="text-xs text-ink-400 font-number">/ 5</span>
        </div>
      </div>

      <input
        id={`rating-range-${id}`}
        type="range"
        min={0}
        max={5}
        step={0.1}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function RatingReadonly({
  value,
  size = "sm",
  color = "peach",
}: {
  value: number | null;
  size?: "sm" | "md";
  color?: "peach" | "rose" | "sage";
}) {
  const fillClass =
    color === "rose"
      ? "text-rose-400"
      : color === "sage"
        ? "text-sage-400"
        : "text-peach-400";
  const sizeClass = size === "md" ? "w-5 h-5" : "w-4 h-4";

  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map((n) => {
        const partial = starFillFor(value, n);
        return (
          <div key={n} className="relative">
            <Star
              className={cn(sizeClass, "text-ink-300")}
              strokeWidth={1.5}
            />
            <div
              style={{ width: `${partial * 100}%` }}
              className={`absolute left-0 top-0 overflow-hidden ${fillClass}`}
            >
              <Star className={sizeClass} strokeWidth={1.5} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
