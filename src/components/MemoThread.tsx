import { useRef, useState } from "react";
import { Trash2, Send, ImagePlus, X, AlertCircle } from "lucide-react";
import { useAddMemo, useDeleteMemo, useMemos } from "@/hooks/useMemos";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { uploadPhoto } from "@/hooks/usePlaces";
import { assertVideoUnderLimit } from "@/lib/media-validation";
import { isVideoUrl } from "@/lib/utils";
import { MemoComment } from "./MemoComment";
import { MemoAuthorPicker } from "./MemoAuthorPicker";

// Cap attachments to keep the comment bubble compact — 2 mediums or
// one video is plenty for a quick reaction.
const MAX_COMMENT_PHOTOS = 2;

// Renders the additional-memo thread for a place or food, plus an
// inline composer at the bottom so either partner can leave a memo
// from the detail page without going through the full edit form.
//
// The "primary" memo (places.memo / foods.memo typed in the create
// form) is rendered separately by the caller — this component only
// owns the thread of extras.
export function MemoThread({
  placeId,
  foodId,
  size = "md",
  hideComposer = false,
}: {
  placeId?: string;
  foodId?: string;
  // Smaller layout when the thread lives inside a tight food card.
  size?: "sm" | "md";
  // When true, render only the existing memo list — no inline composer.
  // PlaceDetailPage flips this on right after a fresh create so the
  // empty "메모 달기…" box doesn't sit on a brand-new record. Once the
  // user navigates back later, the composer comes back like a comment
  // input.
  hideComposer?: boolean;
}) {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { myId } = useCoupleProfiles();
  const memosQuery = useMemos({ placeId, foodId });
  const addMemo = useAddMemo();
  const deleteMemo = useDeleteMemo();

  const [body, setBody] = useState("");
  const [authorId, setAuthorId] = useState<string | null>(null);
  // Pre-uploaded media URLs. Files stream to Supabase Storage the
  // moment the user picks them, so by the time onSend runs we already
  // have public URLs to attach to the memo row.
  const [photos, setPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const memos = memosQuery.data ?? [];
  const isSm = size === "sm";

  async function handlePickFiles(files: FileList | null) {
    if (!files || !files.length || !couple) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      const slots = Math.max(0, MAX_COMMENT_PHOTOS - photos.length);
      const uploaded: string[] = [];
      for (const f of Array.from(files).slice(0, slots)) {
        await assertVideoUnderLimit(f);
        const url = await uploadPhoto(f, couple.id);
        uploaded.push(url);
      }
      setPhotos([...photos, ...uploaded]);
    } catch (e) {
      console.error("[MemoThread] photo upload failed:", e);
      setPhotoErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSend() {
    const trimmed = body.trim();
    if (!trimmed || !couple || !user) return;
    await addMemo.mutateAsync({
      coupleId: couple.id,
      placeId: placeId ?? null,
      foodId: foodId ?? null,
      // Default the recorded author to the current logged-in user
      // when the picker hasn't been touched. The picker only shows
      // up once you start typing, so a quick send still gets a
      // sensible attribution.
      authorId: authorId ?? myId ?? user.id,
      body: trimmed,
      photoUrls: photos.length ? photos : null,
    });
    setBody("");
    setAuthorId(null);
    setPhotos([]);
  }

  async function onDelete(memoId: string) {
    const target = memos.find((m) => m.id === memoId);
    if (!target) return;
    if (!confirm("이 메모를 삭제할까요? · 删除这条留言？")) return;
    await deleteMemo.mutateAsync(target);
  }

  return (
    <div className={`space-y-3 ${isSm ? "" : ""}`}>
      {/* Existing thread, oldest first — reads top-to-bottom like a
          comment feed. */}
      {memos.map((m) => (
        <div key={m.id} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <MemoComment
              memo={m.body}
              authorId={m.author_id}
              createdAt={m.updated_at ?? m.created_at}
              photoUrls={m.photo_urls}
              size={size}
            />
          </div>
          {/* Only the author of a given memo gets the trash icon —
              partner can leave their own memo but not delete yours. */}
          {m.author_id === user?.id && (
            <button
              type="button"
              onClick={() => void onDelete(m.id)}
              className="p-2 -m-1 rounded-full text-ink-300 hover:text-rose-400 hover:bg-rose-50 active:scale-90 transition flex-shrink-0"
              aria-label="delete memo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {/* Composer. Camera icon lives inline with send so the bar
          reads like a chat input — no separate uploader card, no
          helper text. Selected media shows as a small thumb strip
          above the input only when it's actually populated.
          Suppressed entirely when `hideComposer` so the place detail
          page stays clean immediately after a fresh create. */}
      {couple && user && !hideComposer && (
        <div className="border-t border-cream-100 pt-3 space-y-2">
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {photos.map((url) => {
                const isVideo = isVideoUrl(url);
                return (
                  <div
                    key={url}
                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-cream-200 bg-ink-900 flex-shrink-0"
                  >
                    {isVideo ? (
                      <video
                        src={url}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPhotos(photos.filter((p) => p !== url))
                      }
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center active:scale-90 transition"
                      aria-label="remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              className="input-base min-h-[44px] flex-1 text-[13px] resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="메모 달기… · 留个言…"
              rows={1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoBusy || photos.length >= MAX_COMMENT_PHOTOS}
              className="p-2 rounded-xl text-ink-500 hover:text-peach-500 hover:bg-cream-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="attach photo"
              title="사진 · 동영상"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => void handlePickFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={!body.trim() || addMemo.isPending || photoBusy}
              className="px-3 py-2 rounded-xl bg-peach-400 text-white font-bold text-[12px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-peach-500 transition"
              aria-label="send memo"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          {photoErr && (
            <div className="flex items-start gap-1.5 text-[11px] text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span className="break-words">{photoErr}</span>
            </div>
          )}
          {/* Always mounted (just faded) so iOS Safari's IME doesn't
              see DOM mutate next to the textarea mid-composition —
              that used to clobber Chinese / Korean input partway. */}
          <div
            className={`flex items-center justify-between gap-2 flex-wrap transition-opacity ${body.trim().length > 0 ? "opacity-100" : "opacity-0 pointer-events-none h-0 overflow-hidden"}`}
          >
            <span className="text-[10px] text-ink-400 font-medium">
              누가 썼어? · 谁写的?
            </span>
            <MemoAuthorPicker value={authorId} onChange={setAuthorId} />
          </div>
        </div>
      )}
    </div>
  );
}
