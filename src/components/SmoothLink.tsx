import { Link, type LinkProps } from "react-router-dom";
import { preloadImages as warmImages } from "@/lib/mediaPreload";

type SmoothLinkProps = LinkProps & {
  preloadImages?: readonly (string | null | undefined)[];
};

export function SmoothLink({
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
      {...props}
    />
  );
}
