import { useMemo, useRef, useState } from "react";
import { Trash2, Send, ImagePlus, X, AlertCircle, CornerDownRight } from "lucide-react";
import { useAddMemo, useDeleteMemo, useMemos } from "@/hooks/useMemos";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { uploadPhoto } from "@/hooks/usePlaces";
import { useFormDraft } from "@/hooks/useDraft";
import { assertVideoUnderLimit } from "@/lib/media-validation";
import { isVideoUrl } from "@/lib/utils";
import type { Memo } from "@/lib/database.types";
import { MemoComment } from "./MemoComment";
import { MemoAuthorPicker } from "./MemoAuthorPicker";
import { ReactionRow } from "./ReactionRow";

// Cap attachments to keep the comment bubble compact — 2 mediums or
// one video is plenty for a quick reaction.
const MAX_COMMENT_PHOTOS = 2;

// Renders the additional-memo thread for a place or food, plus an
// inline composer at the bottom so either partner can leave a memo
// from the detail page without going through the full edit form.
//
// Each top-level memo carries its own ReactionRow + [답글] button.
// Tapping reply opens a slim sub-composer (text-only) right under that
// memo. Children render indented; 1 level deep only — the reply button
// is hidden on rows that already have parent_id.
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

  // Which top-level memo the user is currently replying to. Only one
  // sub-composer is open at a time — opening another reply closes the
  // previous draft on this render cycle.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Persist composer state to localStorage so a backgrounded tab —
  // app-switch on iOS / Android, browser killed by OS, accidental
  // back-nav — doesn't drop a half-typed memo + already-uploaded
  // photos. Key is scoped per target so place + food composers don't
  // overwrite each other.
  const draftKey = useMemo(() => {
    if (placeId) return `memo-thread-draft:place:${placeId}`;
    if (foodId) return `memo-thread-draft:food:${foodId}`;
    return "memo-thread-draft:unscoped";
  }, [placeId, foodId]);
  const draftSnapshot = useMemo(
    () => ({ body, authorId, photos }),
    [body, authorId, photos]
  );
  const draft = useFormDraft({
    key: draftKey,
    enabled: true,
    snapshot: draftSnapshot,
    restore: (saved) => {
      if (typeof saved.body === "string") setBody(saved.body);
      if (saved.authorId !== undefined)
        setAuthorId(
          saved.authorId === null ? null : (saved.authorId as string)
        );
      if (Array.isArray(saved.photos)) setPhotos(saved.photos as string[]);
    },
  });

  const allMemos = memosQuery.data ?? [];
  // Split into top-level + replies, keyed by parent. Existing rows
  // pre-dating this migration all have parent_id=null so they show up
  // as top-level — no backfill needed.
  const { topLevel, childrenByParent } = useMemo(() => {
    const top: Memo[] = [];
    const map = new Map<string, Memo[]>();
    for (const m of allMemos) {
      if (m.parent_id) {
        const arr = map.get(m.parent_id) ?? [];
        arr.push(m);
        map.set(m.parent_id, arr);
      } else {
        top.push(m);
      }
    }
    return { topLevel: top, childrenByParent: map };
  }, [allMemos]);

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
    // Sent successfully → drop the draft so the next composer mount
    // starts clean. Otherwise the just-sent text would re-hydrate.
    draft.clear();
  }

  async function onDelete(memoId: string) {
    const target = allMemos.find((m) => m.id === memoId);
    if (!target) return;
    if (!confirm("이 메모를 삭제할까요? · 删除这条留言？")) return;
    await deleteMemo.mutateAsync(target);
  }

  async function onSendReply(parentId: string, replyBody: string) {
    if (!couple || !user) return;
    const trimmed = replyBody.trim();
    if (!trimmed) return;
    await addMemo.mutateAsync({
      coupleId: couple.id,
      placeId: placeId ?? null,
      foodId: foodId ?? null,
      authorId: myId ?? user.id,
      body: trimmed,
      parentId,
    });
    setReplyingTo(null);
  }

  return (
    <div className={`space-y-3 ${isSm ? "" : ""}`}>
      {/* Top-level thread, oldest first — reads top-to-bottom like a
          comment feed. Each row hosts its own reactions + reply ui.  */}
      {topLevel.map((m) => {
        const replies = childrenByParent.get(m.id) ?? [];
        const isAuthor = m.author_id === user?.id;
        const replyingHere = replyingTo === m.id;
        return (
          // id="memo-<id>" + scroll-mt-24 so the notification inbox
          // can deep-link directly to this memo via /places/<id>#memo
          // -<memoId>. PlaceDetailPage's hash effect uses element id
          // lookup; scroll-mt offsets the sticky page header.
          <div
            key={m.id}
            id={`memo-${m.id}`}
            className="space-y-1.5 scroll-mt-24"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <MemoComment
                  memo={m.body}
                  authorId={m.author_id}
                  createdAt={m.updated_at ?? m.created_at}
                  photoUrls={m.photo_urls}
                  size={size}
                />
                {/* Reactions + reply button align with the comment
                    body — i.e. under the avatar gutter, indented by
                    the same avatar-width + gap so the actions hang
                    off the text column, not the avatar. */}
                <div className={`${isSm ? "ml-10" : "ml-11"} mt-1 flex items-center justify-between gap-2`}>
                  <ReactionRow
                    target={{ kind: "memo", id: m.id }}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReplyingTo(replyingHere ? null : m.id)
                    }
                    className="text-[11px] font-bold text-ink-400 hover:text-peach-500 transition px-1 py-0.5 active:scale-95"
                  >
                    {replyingHere ? "취소 · 取消" : "답글 · 回复"}
                  </button>
                </div>
              </div>
              {/* Only the author of a given memo gets the trash icon —
                  partner can leave their own memo but not delete yours. */}
              {isAuthor && (
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

            {/* Inline reply composer — text-only, no photo uploader
                here since the parent composer below already covers
                rich attachments. Indented to align with the replies
                row it will produce. */}
            {replyingHere && couple && user && (
              <div className={`${isSm ? "ml-10" : "ml-11"}`}>
                <ReplyComposer
                  parentId={m.id}
                  onSend={(text) => void onSendReply(m.id, text)}
                  onCancel={() => setReplyingTo(null)}
                  pending={addMemo.isPending}
                />
              </div>
            )}

            {/* Nested replies — same MemoComment in sm size, indented
                under the parent. Each gets its own reactions but no
                reply button (1-level cap). */}
            {replies.length > 0 && (
              <div className={`${isSm ? "ml-10" : "ml-11"} space-y-2 pt-1`}>
                {replies.map((r) => {
                  const rAuthor = r.author_id === user?.id;
                  return (
                    // Replies get their own anchor too — a reply
                    // notification deep-links to the reply itself,
                    // not the parent it lives under.
                    <div
                      key={r.id}
                      id={`memo-${r.id}`}
                      className="flex items-start gap-2 scroll-mt-24"
                    >
                      <div className="flex-1 min-w-0">
                        <MemoComment
                          memo={r.body}
                          authorId={r.author_id}
                          createdAt={r.updated_at ?? r.created_at}
                          photoUrls={r.photo_urls}
                          size="sm"
                        />
                        <div className="ml-10 mt-1">
                          <ReactionRow
                            target={{ kind: "memo", id: r.id }}
                            size="sm"
                          />
                        </div>
                      </div>
                      {rAuthor && (
                        <button
                          type="button"
                          onClick={() => void onDelete(r.id)}
                          className="p-2 -m-1 rounded-full text-ink-300 hover:text-rose-400 hover:bg-rose-50 active:scale-90 transition flex-shrink-0"
                          aria-label="delete reply"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

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

// Slim text-only composer that mounts under a memo when [답글] is
// tapped. Keeps photo upload out — replies are quick by design; a
// memo that warrants attachments is better posted as a new top-level
// row via the main composer below.
function ReplyComposer({
  parentId,
  onSend,
  onCancel,
  pending,
}: {
  parentId: string;
  onSend: (text: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [text, setText] = useState("");
  // Per-parent draft persistence — different memo, different draft
  // slot, so opening reply on one doesn't pull in another's text.
  const draftKey = useMemo(
    () => `memo-reply-draft:${parentId}`,
    [parentId]
  );
  const snapshot = useMemo(() => ({ text }), [text]);
  const draft = useFormDraft({
    key: draftKey,
    enabled: true,
    snapshot,
    restore: (saved) => {
      if (typeof saved.text === "string") setText(saved.text);
    },
  });

  function handleSend() {
    if (!text.trim() || pending) return;
    onSend(text);
    setText("");
    draft.clear();
  }

  return (
    <div className="flex items-start gap-2 bg-cream-50/60 border border-cream-100 rounded-2xl px-2.5 py-2">
      <CornerDownRight className="w-3.5 h-3.5 text-ink-300 mt-2 flex-shrink-0" />
      <textarea
        className="input-base min-h-[36px] flex-1 text-[12px] resize-none !py-1.5 !px-2"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="답글… · 回复…"
        rows={1}
        autoFocus
      />
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            draft.clear();
            onCancel();
          }}
          className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 transition"
          aria-label="cancel reply"
          title="취소"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || pending}
          className="px-2.5 py-1.5 rounded-lg bg-peach-400 text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-peach-500 transition"
          aria-label="send reply"
        >
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
