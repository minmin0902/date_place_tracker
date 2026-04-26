import { useEffect } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { isVideoUrl } from "@/lib/utils";

export function MediaLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useBodyScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isVideo = isVideoUrl(src);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/90 backdrop-blur-sm animate-fade"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white active:scale-90 transition z-10"
        aria-label="close"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="relative max-w-full max-h-full px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={src}
            className="max-w-full max-h-[85dvh] rounded-xl"
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={src}
            alt=""
            className="max-w-full max-h-[85dvh] rounded-xl object-contain"
          />
        )}
      </div>
    </div>
  );
}
