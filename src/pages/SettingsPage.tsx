import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Home,
  KeyRound,
  LogOut,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCouple, useSetCoupleHome } from "@/hooks/useCouple";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { LocationPicker } from "@/components/LocationPicker";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/database.types";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();
  const setHome = useSetCoupleHome();
  const { me: meProfileQuery, partner: partnerProfileQuery } =
    useCoupleProfiles();

  // Local form state for the home address card. Hydrate once when the
  // couple loads, then let the user edit freely until they hit save.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Password change card — uses Supabase's updateUser, which only
  // requires a fresh access token (the active session). No "current
  // password" needed, because the session itself proves identity.
  const [pwd, setPwd] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  async function onChangePassword() {
    setPwdMsg(null);
    if (pwd.length < 6) {
      setPwdMsg({
        kind: "err",
        text: "비밀번호는 6자 이상이어야 해요 · 密码至少需要 6 个字符",
      });
      return;
    }
    if (pwd !== pwdConfirm) {
      setPwdMsg({
        kind: "err",
        text: "두 비밀번호가 달라요 · 两次输入的密码不一致",
      });
      return;
    }
    setPwdBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setPwd("");
      setPwdConfirm("");
      setPwdMsg({
        kind: "ok",
        text: "비밀번호가 변경됐어요! · 密码修改成功！",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPwdMsg({ kind: "err", text: msg });
    } finally {
      setPwdBusy(false);
    }
  }

  useEffect(() => {
    if (!couple || hydrated) return;
    if (couple.home_latitude != null && couple.home_longitude != null) {
      setCoord({ lat: couple.home_latitude, lng: couple.home_longitude });
    }
    setAddress(couple.home_address ?? "");
    if (couple.home_address) setLabel(couple.home_address);
    setHydrated(true);
  }, [couple, hydrated]);

  async function onSave() {
    if (!couple) return;
    await setHome.mutateAsync({
      coupleId: couple.id,
      address: address.trim() || null,
      latitude: coord?.lat ?? null,
      longitude: coord?.lng ?? null,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <div>
      <PageHeader title="설정 · 偏好设置" />
      <div className="px-5 space-y-4 pb-8">
        {/* Dual profile card — two side-by-side avatars with a heart in
            the middle visualizes "we are connected". Each side links to
            its own edit form: tapping mine edits my own record, tapping
            the partner side edits the애칭 *I* gave them. */}
        {couple && (
          <div className="card p-5">
            <div className="flex items-center justify-around pb-4 border-b border-cream-100">
              <ProfileAvatar
                profile={meProfileQuery.data ?? null}
                fallbackLabel={user?.email ?? "나"}
                tone="peach"
                editable
                editTo="/profile/me"
                badge="나 · Me"
              />
              <Heart className="w-6 h-6 text-rose-300 animate-pulse flex-shrink-0" />
              <ProfileAvatar
                profile={partnerProfileQuery.data ?? null}
                fallbackLabel="짝꿍"
                tone="rose"
                editable
                editTo="/profile/partner"
                badge="짝꿍 · Partner"
                // For the partner card we display the애칭 *I* set for
                // them rather than what they call themselves. Falls back
                // to their own nickname if I haven't set one yet.
                overrideNickname={
                  meProfileQuery.data?.partner_nickname ?? null
                }
              />
            </div>

            {/* Quick info strip — only renders the bits that are set. */}
            <div className="mt-4 space-y-2.5">
              {meProfileQuery.data?.bio && (
                <div className="bg-cream-50 border border-cream-200/60 rounded-xl px-3 py-2 text-[12px] text-ink-700">
                  <span className="text-ink-400 text-[10px] font-bold uppercase tracking-wider mr-1">
                    내 한줄
                  </span>
                  {meProfileQuery.data.bio}
                </div>
              )}
              {(meProfileQuery.data?.hate_ingredients?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-ink-400 mb-1 uppercase tracking-wider">
                    🚫 못 먹어요 · 不能吃
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(meProfileQuery.data?.hate_ingredients ?? []).map(
                      (h) => (
                        <span
                          key={h}
                          className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 text-[11px] font-bold border border-rose-200/60"
                        >
                          {h}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link
              to="/profile/me"
              className="mt-3 inline-flex w-full items-center justify-between text-[12px] font-bold text-ink-500 hover:text-ink-700 transition px-1"
            >
              내 프로필 자세히 편집 · 完整编辑我的资料
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        <div className="card p-4">
          <p className="text-sm font-bold text-ink-500 mb-1">
            내 계정 · 我的账号
          </p>
          <p className="font-semibold">{user?.email}</p>
        </div>

        {couple && (
          <div className="card p-4">
            <p className="text-sm font-bold text-ink-500 mb-2">
              우리의 연결 코드 · 咱俩的专属邀请码
            </p>
            <p className="font-number font-bold tracking-[0.2em] text-peach-500 text-2xl">
              {couple.invite_code}
            </p>
          </div>
        )}

        {couple && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-full bg-rose-100 text-rose-500">
                <Home className="w-4 h-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-700">
                  우리집 주소 · 家庭住址
                </p>
                <p className="text-[11px] text-ink-400">
                  집밥 모드 + 지도의 집 마커에 사용돼요 · 用于在家做饭和地图的家标记
                </p>
              </div>
            </div>

            <LocationPicker
              value={coord}
              label={label}
              onChange={(v) => {
                setCoord(v);
                if (!v) setLabel(null);
              }}
              onPlaceSelected={(p) => {
                setLabel(p.name || null);
                setAddress(p.address);
                if (
                  typeof p.lat === "number" &&
                  typeof p.lng === "number"
                ) {
                  setCoord({ lat: p.lat, lng: p.lng });
                }
              }}
            />

            <input
              className="input-base"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="주소 · 地址 (예: 서울시 마포구...)"
            />

            <button
              type="button"
              onClick={() => void onSave()}
              disabled={setHome.isPending}
              className="btn-primary w-full"
            >
              {savedFlash
                ? "저장됐어요! · 已保存"
                : setHome.isPending
                  ? "저장 중… · 保存中…"
                  : "집 주소 저장 · 保存家庭住址"}
            </button>
          </div>
        )}

        {/* Password change — Supabase mode only. In ALLOW_NO_AUTH (local
            dev with seeded localDb) there's no real auth session to
            update, so the card hides itself. */}
        {!ALLOW_NO_AUTH && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-full bg-peach-100 text-peach-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-700">
                  비밀번호 변경 · 修改密码
                </p>
                <p className="text-[11px] text-ink-400">
                  지금 로그인된 계정({user?.email})의 비밀번호를 바꿔요
                </p>
              </div>
            </div>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                className="input-base pr-11"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="새 비밀번호 (6자 이상) · 新密码"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                aria-label="toggle password visibility"
              >
                {showPwd ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <input
              type={showPwd ? "text" : "password"}
              className="input-base"
              value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.target.value)}
              placeholder="비밀번호 확인 · 确认密码"
              autoComplete="new-password"
            />
            {pwdMsg && (
              <p
                className={`text-xs font-medium px-1 ${
                  pwdMsg.kind === "ok" ? "text-sage-400" : "text-rose-500"
                }`}
              >
                {pwdMsg.text}
              </p>
            )}
            <button
              type="button"
              onClick={() => void onChangePassword()}
              disabled={pwdBusy || !pwd || !pwdConfirm}
              className="btn-primary w-full"
            >
              {pwdBusy ? "변경 중… · 修改中…" : "비밀번호 변경 · 修改密码"}
            </button>
          </div>
        )}

        <button
          onClick={() => void signOut()}
          className="w-full card p-4 flex items-center justify-center gap-2 text-rose-500 font-bold active:scale-[0.98] transition-transform"
        >
          <LogOut className="w-5 h-5" />
          로그아웃 · 退出登录
        </button>
      </div>
    </div>
  );
}

// Round profile avatar with a name + edit affordance underneath. Used
// twice in the duos card (me + partner). Falls back to a colored
// initial bubble when no avatar_url is set, since avatar upload is a
// follow-up phase. tone selects the gradient ring color so each side
// reads as visually distinct.
function ProfileAvatar({
  profile,
  fallbackLabel,
  tone,
  editable,
  editTo,
  badge,
  overrideNickname,
}: {
  profile: Profile | null;
  fallbackLabel: string;
  tone: "peach" | "rose";
  editable?: boolean;
  editTo: string;
  badge: string;
  overrideNickname?: string | null;
}) {
  const displayName =
    overrideNickname?.trim() || profile?.nickname?.trim() || fallbackLabel;
  // First glyph (works for Korean / Latin / Chinese / emoji).
  const initial = Array.from(displayName)[0] ?? "?";
  const ringCls =
    tone === "peach"
      ? "border-peach-300 bg-gradient-to-br from-peach-100 to-rose-100 text-peach-500"
      : "border-rose-300 bg-gradient-to-br from-rose-100 to-pink-100 text-rose-500";

  const inner = (
    <>
      <div
        className={`w-20 h-20 rounded-full border-2 flex items-center justify-center overflow-hidden shadow-sm ${ringCls}`}
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[28px] font-sans font-black">{initial}</span>
        )}
      </div>
      <p className="text-[12px] font-bold text-ink-900 mt-2 truncate max-w-[110px]">
        {displayName}
      </p>
      <p className="text-[10px] font-bold text-ink-400">{badge}</p>
    </>
  );

  if (!editable) {
    return <div className="text-center">{inner}</div>;
  }
  return (
    <Link to={editTo} className="text-center group">
      {inner}
    </Link>
  );
}
