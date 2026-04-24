import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useId, useMemo } from "react";

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

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  return (
    <div>
      <div className="flex gap-1 mb-2">
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
              <Star className="w-8 h-8 text-ink-300" strokeWidth={1.5} />
              <div
                style={{ width: `${partial * 100}%` }}
                className={`absolute left-0 top-0 overflow-hidden pointer-events-none ${fillClass}`}
              >
                <Star className="w-8 h-8" strokeWidth={1.5} />
              </div>
            </button>
          );
        })}
      </div>

      <input
        id={`rating-range-${id}`}
        type="range"
        min={0}
        max={5}
        step={0.5}
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
