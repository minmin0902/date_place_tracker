import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingPicker({
  value,
  onChange,
  color = "peach",
}: {
  value: number | null;
  onChange: (n: number) => void;
  color?: "peach" | "rose" | "sage";
}) {
  const fillClass =
    color === "rose"
      ? "fill-rose-400 text-rose-400"
      : color === "sage"
        ? "fill-sage-400 text-sage-400"
        : "fill-peach-400 text-peach-400";
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1 active:scale-90 transition"
            aria-label={`rate-${n}`}
          >
            <Star
              className={cn(
                "w-8 h-8",
                active ? fillClass : "text-ink-300 fill-transparent"
              )}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
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
      ? "fill-rose-400 text-rose-400"
      : color === "sage"
        ? "fill-sage-400 text-sage-400"
        : "fill-peach-400 text-peach-400";
  const sizeClass = size === "md" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (value ?? 0) >= n;
        return (
          <Star
            key={n}
            className={cn(
              sizeClass,
              active ? fillClass : "text-ink-300 fill-transparent"
            )}
            strokeWidth={1.5}
          />
        );
      })}
    </div>
  );
}
