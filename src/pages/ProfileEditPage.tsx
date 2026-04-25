import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Heart, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import {
  useCoupleProfiles,
  useProfile,
  useUpsertProfile,
} from "@/hooks/useProfile";

// Two distinct flavors of profile editing live on this page:
//   /profile/me      — edit MY own record (nickname / bio / hates).
//   /profile/partner — edit how *I* refer to my partner (the
//                      partner_nickname field on MY row).
//
// We pick the variant from the URL slug so SettingsPage can deep-link
// to either editor by tapping the matching half of the dual-profile
// card.

export default function ProfileEditPage() {
  const { who } = useParams();
  const variant: "me" | "partner" = who === "partner" ? "partner" : "me";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { partner } = useCoupleProfiles();
  const myProfileQuery = useProfile(user?.id);
  const upsert = useUpsertProfile();

  // Form state for the "edit me" path.
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [hates, setHates] = useState<string[]>([]);
  const [hateDraft, setHateDraft] = useState("");
  // Form state for the "edit partner nickname" path.
  const [partnerNickname, setPartnerNickname] = useState("");

  useEffect(() => {
    const me = myProfileQuery.data;
    if (!me) return;
    setNickname(me.nickname ?? "");
    setBio(me.bio ?? "");
    setHates(me.hate_ingredients ?? []);
    setPartnerNickname(me.partner_nickname ?? "");
  }, [myProfileQuery.data]);

  function addHate() {
    const t = hateDraft.trim();
    if (!t || hates.includes(t)) {
      setHateDraft("");
      return;
    }
    setHates([...hates, t]);
    setHateDraft("");
  }

  async function onSave() {
    if (variant === "me") {
      await upsert.mutateAsync({
        nickname: nickname.trim() || null,
        bio: bio.trim() || null,
        hate_ingredients: hates.length ? hates : [],
      });
    } else {
      await upsert.mutateAsync({
        partner_nickname: partnerNickname.trim() || null,
      });
    }
    navigate(-1);
  }

  // For the partner variant, show whose nickname we're editing —
  // pulls the partner profile so the title reads "민쥬에게 붙여줄
  // 애칭" instead of just "짝꿍 애칭".
  const partnerLabel =
    partner.data?.nickname ?? "짝꿍 · 宝宝";

  return (
    <div>
      <PageHeader
        title={
          variant === "me"
            ? "내 프로필 · 我的资料"
            : `${partnerLabel}에게 붙일 애칭 · 给TA起昵称`
        }
        back
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
        className="px-5 space-y-5 pb-8"
      >
        {variant === "me" ? (
          <>
            <div>
              <label className="block text-sm font-bold mb-1.5 text-ink-700">
                닉네임 · 昵称
                <span className="text-[10px] text-ink-400 font-normal ml-1">
                  · 앱 전체에서 보이는 이름
                </span>
              </label>
              <input
                className="input-base"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="예) 민쥬 · 例：minjoo"
                maxLength={30}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1.5 text-ink-700">
                <Sparkles className="w-3.5 h-3.5 inline-block mr-1 text-peach-500" />
                한 줄 소개 · 一句话简介
              </label>
              <textarea
                className="input-base min-h-[64px]"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="예) 매운맛 처돌이, 디저트 배는 따로 있음"
                maxLength={120}
              />
              <p className="text-[10px] text-ink-400 mt-1 text-right font-number">
                {bio.length}/120
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1.5 text-ink-700">
                🚫 못 먹는 거 · 不能吃的
                <span className="text-[10px] text-ink-400 font-normal ml-1">
                  · 메뉴 고를 때 참고
                </span>
              </label>
              {hates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {hates.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() =>
                        setHates(hates.filter((x) => x !== h))
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-500 text-[12px] font-bold border border-rose-200/70"
                    >
                      {h}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  className="input-base flex-1"
                  value={hateDraft}
                  onChange={(e) => setHateDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addHate();
                    }
                  }}
                  placeholder="예) 오이, 고수, 민트초코"
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={addHate}
                  disabled={!hateDraft.trim()}
                  className="px-3 py-2 rounded-xl bg-cream-100 text-ink-700 text-[12px] font-bold hover:bg-cream-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  추가 · 添加
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3 p-4 bg-rose-50/50 rounded-2xl border border-rose-100/60">
            <label className="block text-sm font-bold text-rose-500">
              <Heart className="w-3.5 h-3.5 inline-block mr-1" />
              짝꿍에게 붙일 애칭 · 你想怎么叫TA
            </label>
            <input
              className="input-base bg-white border-rose-200 focus:border-rose-400"
              value={partnerNickname}
              onChange={(e) => setPartnerNickname(e.target.value)}
              placeholder="예) 공주님, 자기야, 남편 · 例：宝宝"
              maxLength={30}
            />
            <p className="text-[10px] text-ink-400">
              * 이 이름은 *내 화면*에서만 짝꿍 이름 대신 보여요. 짝꿍이
              자기 이름을 따로 설정해도 영향 없음.
            </p>
            <p className="text-[10px] text-ink-400">
              * 该称呼只显示在你自己的界面上，不会影响TA。
            </p>
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={upsert.isPending || (!user && !couple)}
        >
          저장 · 保存
        </button>
      </form>
    </div>
  );
}
