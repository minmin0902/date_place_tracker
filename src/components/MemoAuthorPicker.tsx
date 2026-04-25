import { useAuth } from "@/hooks/useAuth";
import { useCoupleProfiles, useDisplayNames } from "@/hooks/useProfile";

// Small "누가 썼어? · 谁写的?" picker that lives next to the memo
// textarea. Stores the chosen partner's user_id so the comment-style
// render later attributes the memo correctly.
//
// We need this because the couple historically shared one account,
// so the logged-in user_id alone doesn't tell us which partner is
// actually typing. Defaults to the current user.
export function MemoAuthorPicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (userId: string) => void;
}) {
  const { user } = useAuth();
  const { myId, partnerId } = useCoupleProfiles();
  const { myDisplay, partnerDisplay } = useDisplayNames();

  // No couple yet → just lock to "me", no toggle to render.
  if (!user || !partnerId) return null;

  // Default the displayed selection to the current user when nothing
  // is set yet, so users don't have to pick before typing.
  const selected = value ?? myId ?? user.id;

  return (
    <div className="flex items-center gap-1 bg-cream-50 p-1 rounded-xl border border-cream-100 w-fit">
      <button
        type="button"
        onClick={() => myId && onChange(myId)}
        className={`px-3 py-1 rounded-lg text-[12px] font-bold transition ${
          selected === myId
            ? "bg-peach-400 text-white shadow-soft"
            : "text-ink-500"
        }`}
      >
        {myDisplay}
      </button>
      <button
        type="button"
        onClick={() => onChange(partnerId)}
        className={`px-3 py-1 rounded-lg text-[12px] font-bold transition ${
          selected === partnerId
            ? "bg-rose-400 text-white shadow-soft"
            : "text-ink-500"
        }`}
      >
        {partnerDisplay}
      </button>
    </div>
  );
}
