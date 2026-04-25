import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { usePlaces } from "@/hooks/usePlaces";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { LocationPicker } from "@/components/LocationPicker";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/database.types";
import { categoryEmojiOf, isKnownPlaceCategory } from "@/lib/constants";
import { getCategories, ratingsForViewer } from "@/lib/utils";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();
  const setHome = useSetCoupleHome();
  const { me: meProfileQuery, partner: partnerProfileQuery } =
    useCoupleProfiles();
  const { data: places } = usePlaces(couple?.id);

  // ---------- Data-derived "Taste DNA" stats ----------
  // Mirrors the bucketing ComparePage already does, but computed here
  // so the profile card can show data-backed badges (별점 요정 vs
  // 깐깐징어, 인생 메뉴 Top 3, 주력 카테고리) without touching the
  // compare page. Only counts foods both partners ate so per-person
  // averages stay apples-to-apples.
  const tasteStats = useMemo(() => {
    type Row = {
      foodId: string;
      placeId: string;
      placeName: string;
      foodName: string;
      mine: number;
      partner: number;
      categories: string[];
    };
    const rows: Row[] = [];
    for (const p of places ?? []) {
      for (const f of p.foods ?? []) {
        const isBoth = f.eater ? f.eater === "both" : !f.is_solo;
        if (!isBoth) continue;
        if (f.my_rating == null || f.partner_rating == null) continue;
        const view = ratingsForViewer(f, user?.id);
        rows.push({
          foodId: f.id,
          placeId: p.id,
          placeName: p.name,
          foodName: f.name,
          mine: view.myRating ?? 0,
          partner: view.partnerRating ?? 0,
          categories: getCategories(p),
        });
      }
    }

    let myAvg = 0;
    let partnerAvg = 0;
    if (rows.length > 0) {
      myAvg = rows.reduce((s, r) => s + r.mine, 0) / rows.length;
      partnerAvg = rows.reduce((s, r) => s + r.partner, 0) / rows.length;
    }
    const ratingDiff = Math.abs(myAvg - partnerAvg);
    const ratingTie = ratingDiff < 0.1;
    const myRole: "fairy" | "strict" | "tie" = ratingTie
      ? "tie"
      : myAvg > partnerAvg
        ? "fairy"
        : "strict";
    const partnerRole: "fairy" | "strict" | "tie" = ratingTie
      ? "tie"
      : myRole === "fairy"
        ? "strict"
        : "fairy";

    // Top 3 menus by viewer's own rating, with couple-avg as a
    // tiebreaker so equally-loved menus rank by total enthusiasm.
    const myTop3 = [...rows]
      .sort(
        (a, b) =>
          b.mine - a.mine ||
          b.mine + b.partner - (a.mine + a.partner)
      )
      .slice(0, 3);

    // Top category by count of place categories. Multi-cat places
    // contribute to each category. Built-in only — custom strings
    // could be noisy.
    const catCount = new Map<string, number>();
    for (const r of rows) {
      for (const c of r.categories) {
        if (!isKnownPlaceCategory(c)) continue;
        catCount.set(c, (catCount.get(c) ?? 0) + 1);
      }
    }
    let topCategory: string | null = null;
    let topCount = 0;
    for (const [cat, count] of catCount) {
      if (count > topCount) {
        topCategory = cat;
        topCount = count;
      }
    }

    return {
      sampleSize: rows.length,
      myAvg,
      partnerAvg,
      myRole,
      partnerRole,
      myTop3,
      topCategory,
      topCount,
    };
  }, [places, user?.id]);

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
            {/* Grid keeps the two avatars symmetrical on every width
                — left/right columns are 1fr 1fr, centre is auto for
                the heart. Old justify-around pushed avatars hard
                against the card edges on narrow phones. */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-4 border-b border-cream-100">
              <ProfileAvatar
                profile={meProfileQuery.data ?? null}
                fallbackLabel={
                  // Use the local-part of the email as a friendlier
                  // fallback so we don't dump "luoyuhan2025@gmail..."
                  // and risk truncation on narrow widths.
                  user?.email?.split("@")[0] ?? "나"
                }
                tone="peach"
                editable
                editTo="/profile/me"
                // When the user has set a nickname the displayName
                // already shows it — surfacing "나 · 我" underneath
                // becomes redundant, so suppress the badge in that
                // case. No nickname → keep the default role label.
                badge={
                  meProfileQuery.data?.nickname?.trim()
                    ? null
                    : "나 · 我"
                }
                role={tasteStats.myRole}
                showRole={tasteStats.sampleSize >= 3}
              />
              <Heart className="w-6 h-6 text-rose-300 animate-pulse flex-shrink-0" />
              <ProfileAvatar
                profile={partnerProfileQuery.data ?? null}
                fallbackLabel="짝꿍"
                tone="rose"
                editable
                editTo="/profile/partner"
                badge={
                  // Same logic for partner: if I set 애칭 (or partner
                  // has their own nickname) the displayName already
                  // shows it, so the "짝꿍 · 宝宝" caption underneath
                  // would just repeat. Drop it in that case.
                  meProfileQuery.data?.partner_nickname?.trim() ||
                  partnerProfileQuery.data?.nickname?.trim()
                    ? null
                    : "짝꿍 · 宝宝"
                }
                // For the partner card we display the애칭 *I* set for
                // them rather than what they call themselves. Falls back
                // to their own nickname if I haven't set one yet.
                overrideNickname={
                  meProfileQuery.data?.partner_nickname ?? null
                }
                role={tasteStats.partnerRole}
                showRole={tasteStats.sampleSize >= 3}
              />
            </div>

            {/* Quick info strip — only renders the bits that are set. */}
            <div className="mt-4 space-y-2.5">
              {meProfileQuery.data?.bio && (
                <div className="bg-cream-50 border border-cream-200/60 rounded-xl px-3 py-2 text-[12px] text-ink-700">
                  <span className="text-ink-400 text-[10px] font-bold uppercase tracking-wider mr-1 break-keep">
                    내 한줄 · 简介
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

        {/* "Taste DNA" — derived stats card. Hides itself when the
            couple hasn't logged enough cross-rated foods (need at
            least 3 to make the badges meaningful and a top-3 list non-
            trivial). */}
        {couple && tasteStats.sampleSize >= 3 && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-full bg-peach-100 text-peach-500">
                🧬
              </span>
              <div>
                <p className="text-sm font-bold text-ink-700">
                  내 입맛 DNA · 我的口味DNA
                </p>
                <p className="text-[11px] text-ink-400">
                  공통 평가{" "}
                  <span className="font-number font-bold text-ink-700">
                    {tasteStats.sampleSize}
                  </span>
                  개 메뉴 기반 · 基于{tasteStats.sampleSize}道共评菜
                </p>
              </div>
            </div>

            {/* Average rating headline + role (별점 요정 / 깐깐징어 /
                비등). Shows my number alongside the partner's so the
                badge isn't just self-referential. */}
            <div className="grid grid-cols-2 gap-2">
              <PersonStatCell
                tone="peach"
                label="내 평균 · 我的平均"
                avg={tasteStats.myAvg}
                role={tasteStats.myRole}
              />
              <PersonStatCell
                tone="rose"
                label="짝꿍 평균 · 宝宝平均"
                avg={tasteStats.partnerAvg}
                role={tasteStats.partnerRole}
              />
            </div>

            {/* Most-logged category — quick "what cuisine defines us"
                summary. Falls back gracefully if no built-in cat dominates. */}
            {tasteStats.topCategory && (
              <div className="bg-cream-50 border border-cream-200/60 rounded-xl p-3 flex items-center gap-2">
                <span className="text-2xl flex-shrink-0">
                  {categoryEmojiOf(tasteStats.topCategory)}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                    주력 카테고리 · 主力类别
                  </p>
                  <p className="text-[13px] font-bold text-ink-900 break-keep">
                    {t(`category.${tasteStats.topCategory}`)} 매니아 · 控
                    <span className="text-ink-400 font-number ml-1.5 text-[11px]">
                      ({tasteStats.topCount}회·次)
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Lifetime Top 3 — pinned by my own rating descending. */}
            {tasteStats.myTop3.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">
                  🏆 내 인생 메뉴 Top 3 · 我的TOP3
                </p>
                <div className="space-y-1.5">
                  {tasteStats.myTop3.map((r, idx) => (
                    <Link
                      key={r.foodId}
                      to={`/places/${r.placeId}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-peach-50 border border-amber-200/60 hover:from-amber-100 hover:to-peach-100 transition"
                    >
                      <span className="text-[15px] font-number font-black text-amber-500 flex-shrink-0 w-5 text-center">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-ink-900 truncate">
                          {r.foodName}
                        </p>
                        <p className="text-[10px] text-ink-400 truncate">
                          @ {r.placeName}
                        </p>
                      </div>
                      <span className="text-[12px] font-number font-bold text-peach-500 flex-shrink-0">
                        {r.mine.toFixed(1)}
                        <span className="text-ink-400 text-[9px] ml-0.5">
                          /5
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
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
  role,
  showRole,
}: {
  profile: Profile | null;
  fallbackLabel: string;
  tone: "peach" | "rose";
  editable?: boolean;
  editTo: string;
  // null/undefined hides the caption row entirely — we suppress it
  // when the user already has a nickname so the avatar doesn't show
  // the same name twice (displayName ↑ + badge ↓).
  badge: string | null;
  overrideNickname?: string | null;
  // Auto-derived role from RatingStats data — gets surfaced as a small
  // badge under the avatar so the profile reads as "data-backed".
  role?: "fairy" | "strict" | "tie";
  showRole?: boolean;
}) {
  const displayName =
    overrideNickname?.trim() || profile?.nickname?.trim() || fallbackLabel;
  const initial = Array.from(displayName)[0] ?? "?";
  const ringCls =
    tone === "peach"
      ? "border-peach-300 bg-gradient-to-br from-peach-100 to-rose-100 text-peach-500"
      : "border-rose-300 bg-gradient-to-br from-rose-100 to-pink-100 text-rose-500";
  const roleBadge =
    showRole && role
      ? roleBadgeFor(role)
      : null;

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
      <p className="text-[12px] font-bold text-ink-900 mt-2 truncate w-full px-1 text-center">
        {displayName}
      </p>
      {badge && (
        <p className="text-[10px] font-bold text-ink-400">{badge}</p>
      )}
      {roleBadge && (
        <span
          className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border max-w-full ${roleBadge.cls}`}
        >
          <span className="flex-shrink-0">{roleBadge.emoji}</span>
          <span className="truncate">{roleBadge.label}</span>
        </span>
      )}
    </>
  );

  // min-w-0 so this column inside the grid can shrink past the
  // intrinsic name width; the truncate above kicks in when needed.
  if (!editable) {
    return (
      <div className="text-center flex flex-col items-center min-w-0">
        {inner}
      </div>
    );
  }
  return (
    <Link
      to={editTo}
      className="text-center group flex flex-col items-center min-w-0"
    >
      {inner}
    </Link>
  );
}

// Single source of truth for the 별점 요정 / 깐깐징어 / 비등 badge —
// reused by both the avatar (small chip) and the stats grid (full row).
function roleBadgeFor(role: "fairy" | "strict" | "tie") {
  if (role === "fairy") {
    return {
      emoji: "🧚",
      label: "별점 요정 · 打分天使",
      cls: "bg-amber-50 text-amber-600 border-amber-200",
    } as const;
  }
  if (role === "strict") {
    return {
      emoji: "🧐",
      label: "깐깐징어 · 严格考官",
      cls: "bg-indigo-50 text-indigo-600 border-indigo-200",
    } as const;
  }
  return {
    emoji: "🤝",
    label: "비등 · 不分上下",
    cls: "bg-ink-100 text-ink-500 border-cream-200",
  } as const;
}

// Inline avg+role tile for the Taste DNA card. Mirrors PersonStatTile
// from ComparePage but trimmed (no expand state, no big avg number) to
// fit the smaller settings card.
function PersonStatCell({
  tone,
  label,
  avg,
  role,
}: {
  tone: "peach" | "rose";
  label: string;
  avg: number;
  role: "fairy" | "strict" | "tie";
}) {
  const personCls = tone === "peach" ? "text-peach-500" : "text-rose-500";
  const accentCls =
    tone === "peach"
      ? "bg-peach-50 border-peach-200"
      : "bg-rose-50 border-rose-200";
  const badge = roleBadgeFor(role);
  return (
    <div
      className={`rounded-xl p-2 border ${accentCls} flex flex-col items-center text-center shadow-sm`}
    >
      <span className={`text-[10px] font-bold ${personCls}`}>{label}</span>
      <span className="text-[18px] font-number font-black text-ink-900 leading-none mt-0.5">
        {avg.toFixed(2)}
        <span className="text-[9px] text-ink-400 font-bold ml-0.5 tracking-wider">
          /5
        </span>
      </span>
      <span
        className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${badge.cls}`}
      >
        <span>{badge.emoji}</span>
        <span>{badge.label}</span>
      </span>
    </div>
  );
}
