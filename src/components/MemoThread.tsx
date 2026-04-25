import { useState } from "react";
import { Trash2, Send } from "lucide-react";
import { useAddMemo, useDeleteMemo, useMemos } from "@/hooks/useMemos";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { MemoComment } from "./MemoComment";
import { MemoAuthorPicker } from "./MemoAuthorPicker";

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
}: {
  placeId?: string;
  foodId?: string;
  // Smaller layout when the thread lives inside a tight food card.
  size?: "sm" | "md";
}) {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { myId } = useCoupleProfiles();
  const memosQuery = useMemos({ placeId, foodId });
  const addMemo = useAddMemo();
  const deleteMemo = useDeleteMemo();

  const [body, setBody] = useState("");
  const [authorId, setAuthorId] = useState<string | null>(null);

  const memos = memosQuery.data ?? [];
  const isSm = size === "sm";

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
    });
    setBody("");
    setAuthorId(null);
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
              size={size}
            />
          </div>
          {/* Only the author of a given memo gets the trash icon —
              partner can leave their own memo but not delete yours. */}
          {m.author_id === user?.id && (
            <button
              type="button"
              onClick={() => void onDelete(m.id)}
              className="p-1 rounded-full text-ink-300 hover:text-rose-400 hover:bg-rose-50 transition flex-shrink-0"
              aria-label="delete memo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {/* Composer. Author picker only appears once the textarea has
          content so the empty state stays clean. */}
      {couple && user && (
        <div className="border-t border-cream-100 pt-3">
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
              onClick={() => void onSend()}
              disabled={!body.trim() || addMemo.isPending}
              className="px-3 py-2 rounded-xl bg-peach-400 text-white font-bold text-[12px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-peach-500 transition"
              aria-label="send memo"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          {body.trim().length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] text-ink-400 font-medium">
                누가 썼어? · 谁写的?
              </span>
              <MemoAuthorPicker value={authorId} onChange={setAuthorId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
