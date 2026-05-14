import { Link, type LinkProps } from "react-router-dom";
import { preloadImages as warmImages } from "@/lib/mediaPreload";

type SmoothLinkProps = LinkProps & {
  preloadImages?: readonly (string | null | undefined)[];
};

function pulseRouteHint() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("route-link-pressed");
  window.setTimeout(() => {
    document.documentElement.classList.remove("route-link-pressed");
  }, 220);
}

export function SmoothLink({
  onClick,
  onPointerEnter,
  onTouchStart,
  preloadImages,
  ...props
}: SmoothLinkProps) {
  const warm = () => {
    if (preloadImages?.length) warmImages(preloadImages);
  };

  return (
    <Link
      onPointerEnter={(event) => {
        warm();
        onPointerEnter?.(event);
      }}
      onTouchStart={(event) => {
        warm();
        onTouchStart?.(event);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) pulseRouteHint();
      }}
      {...props}
    />
  );
}
