import { useRef, useState } from "react";
import { Camera, X, AlertCircle, Play } from "lucide-react";
import { uploadPhoto } from "@/hooks/usePlaces";
import { isVideoUrl, videoPreviewUrl } from "@/lib/utils";
import { assertVideoUnderLimit } from "@/lib/media-validation";

export function PhotoUploader({
  coupleId,
  photos,
  onChange,
  max = 6,
}: {
  coupleId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      const slots = Math.max(0, max - photos.length);
      for (const f of Array.from(files).slice(0, slots)) {
        await assertVideoUnderLimit(f);
        const url = await uploadPhoto(f, coupleId);
        uploaded.push(url);
      }
      onChange([...photos, ...uploaded]);
    } catch (e) {
      console.error("[PhotoUploader] upload failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      // Common hints:
      //   "new row violates row-level security"     → bucket RLS not set up
      //   "Bucket not found"                        → bucket missing
      //   "QuotaExceededError" / "exceeded the quota" → localStorage too full
      setError(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url) => {
          const isVideo = isVideoUrl(url);
          return (
            <div key={url} className="relative w-20 h-20">
              {isVideo ? (
                <>
                  {/* #t=0.001 + preload="auto" makes mobile browsers paint
                      an actual video thumbnail instead of a blank box. */}
                  <video
                    src={videoPreviewUrl(url)}
                    className="w-full h-full object-cover rounded-xl bg-ink-900"
                    preload="auto"
                    muted
                    playsInline
                  />
                  <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 bg-ink-900/70 text-white text-[9px] font-bold px-1 py-0.5 rounded">
                    <Play className="w-2.5 h-2.5" /> VIDEO
                  </span>
                </>
              ) : (
                <img
                  src={url}
                  className="w-full h-full object-cover rounded-xl"
                  alt=""
                />
              )}
              <button
                type="button"
                onClick={() => onChange(photos.filter((p) => p !== url))}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow-soft flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {photos.length < max && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-cream-200 flex items-center justify-center text-ink-500 hover:border-peach-300 hover:text-peach-400 transition disabled:opacity-60"
          >
            <Camera className="w-6 h-6" />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          // Accept stills + video. Browser file picker on iOS / Android
          // surfaces both gallery types when this is set.
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      <p className="text-[10px] text-ink-400 px-1">
        사진 + 동영상 (60초 · 200MB 이내) · 照片 + 视频(60秒·200MB以内)
      </p>
      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
    </div>
  );
}
