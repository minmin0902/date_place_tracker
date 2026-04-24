import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { uploadPhoto } from "@/hooks/usePlaces";

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

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const f of Array.from(files).slice(0, max - photos.length)) {
        const url = await uploadPhoto(f, coupleId);
        uploaded.push(url);
      }
      onChange([...photos, ...uploaded]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((url) => (
        <div key={url} className="relative w-20 h-20">
          <img
            src={url}
            className="w-full h-full object-cover rounded-xl"
            alt=""
          />
          <button
            type="button"
            onClick={() => onChange(photos.filter((p) => p !== url))}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow-soft flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {photos.length < max && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-xl border-2 border-dashed border-cream-200 flex items-center justify-center text-ink-500 hover:border-peach-300 hover:text-peach-400 transition"
        >
          <Camera className="w-6 h-6" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
