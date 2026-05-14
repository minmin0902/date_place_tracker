import type { MouseEvent } from "react";
import { Link, useNavigate, type LinkProps } from "react-router-dom";
import { preloadImages as warmImages } from "@/lib/mediaPreload";
import { startRouteViewTransition } from "@/lib/viewTransition";

type SmoothLinkProps = LinkProps & {
  preloadImages?: readonly (string | null | undefined)[];
};

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

export function SmoothLink({
  to,
  onClick,
  onPointerEnter,
  onTouchStart,
  preloadImages,
  replace,
  state,
  preventScrollReset,
  relative,
  ...props
}: SmoothLinkProps) {
  const navigate = useNavigate();

  const warm = () => {
    if (preloadImages?.length) warmImages(preloadImages);
  };

  return (
    <Link
      to={to}
      replace={replace}
      state={state}
      preventScrollReset={preventScrollReset}
      relative={relative}
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
        if (
          event.defaultPrevented ||
          !isPlainLeftClick(event) ||
          typeof to !== "string"
        ) {
          return;
        }
        event.preventDefault();
        warm();
        startRouteViewTransition(() => {
          navigate(to, { replace, state, preventScrollReset, relative });
        });
      }}
      {...props}
    />
  );
}
