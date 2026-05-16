import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BellOff,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Home,
  KeyRound,
  LogOut,
} from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { PageHeader } from "@/components/PageHeader";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuth } from "@/hooks/useAuth";
import { useCouple, useSetCoupleHome } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { useCoupleProfiles } from "@/hooks/useProfile";
import { LocationPicker } from "@/components/LocationPicker";
import { supabase } from "@/lib/supabase";
import { pickLanguage } from "@/lib/language";
import type { Profile } from "@/lib/database.types";
import { ratingsForViewer } from "@/lib/utils";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();
  const setHome = useSetCoupleHome();
  const { me: meProfileQuery, partner: partnerProfileQuery } =
    useCoupleProfiles();
  const { data: places } = usePlaces(couple?.id);

  // ---------- My Top 3 ----------
  // Keep settings personal and light: no compare-style DNA or roles
  // here, just the viewer's own highest-rated foods.
  const tasteStats = useMemo(() => {
    type Row = {
      foodId: string;
      placeId: string;
      placeName: string;
      foodName: string;
      mine: number;
      partner: number | null;
    };
    const rows: Row[] = [];
    for (const p of places ?? []) {
      for (const f of p.foods ?? []) {
        const view = ratingsForViewer(f, user?.id);
        if (view.myRating == null) continue;
        rows.push({
          foodId: f.id,
          placeId: p.id,
          placeName: p.name,
          foodName: f.name,
          mine: view.myRating,
          partner: view.partnerRating,
        });
      }
    }

    const myTop3 = [...rows]
      .sort(
        (a, b) =>
          b.mine - a.mine ||
          b.mine + (b.partner ?? 0) - (a.mine + (a.partner ?? 0))
      )
      .slice(0, 3);

    return {
      sampleSize: rows.length,
      myTop3,
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
        text: pick("비밀번호는 6자 이상이어야 해요", "密码至少需要 6 个字符"),
      });
      return;
    }
    if (pwd !== pwdConfirm) {
      setPwdMsg({
        kind: "err",
        text: pick("두 비밀번호가 달라요", "两次输入的密码不一致"),
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
        text: pick("비밀번호가 변경됐어요!", "密码修改成功！"),
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
      <PageHeader title={t("settings.title")} />
      <div className="px-5 space-y-4 pb-8">
        {/* Profile card: personal profile info + my Top 3 only.
            Compare-style rating roles / averages live on ComparePage. */}
        {couple && (
          <div className="card p-5 space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 pb-4 border-b border-cream-100">
              <div className="min-w-0 rounded-2xl bg-cream-50/70 border border-cream-200/60 p-3">
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
                      : pick("나", "我")
                  }
                />
                <ProfileFacts
                  profile={meProfileQuery.data ?? null}
                  partnerAlias={
                    partnerProfileQuery.data?.partner_nickname ?? null
                  }
                  partnerAliasLabel={pick("상대가 나를 부르는 이름", "TA给我的昵称")}
                  emptyText={pick("아직 적은 게 없어요", "还没填写")}
                  pick={pick}
                />
              </div>
              <Heart className="mt-8 w-5 h-5 text-rose-300 animate-pulse flex-shrink-0" />
              <div className="min-w-0 rounded-2xl bg-rose-50/45 border border-rose-100/70 p-3">
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
                      : pick("짝꿍", "宝宝")
                  }
                  // For the partner card we display the애칭 *I* set for
                  // them rather than what they call themselves. Falls back
                  // to their own nickname if I haven't set one yet.
                  overrideNickname={
                    meProfileQuery.data?.partner_nickname ?? null
                  }
                />
                <ProfileFacts
                  profile={partnerProfileQuery.data ?? null}
                  partnerAlias={meProfileQuery.data?.partner_nickname ?? null}
                  partnerAliasLabel={pick("내가 상대를 부르는 이름", "我给TA的昵称")}
                  emptyText={pick("아직 적은 게 없어요", "还没填写")}
                  pick={pick}
                />
              </div>
            </div>

            <TopThreeList
              items={tasteStats.myTop3}
              sampleSize={tasteStats.sampleSize}
              pick={pick}
            />

            <Link
              to="/profile/me"
              className="inline-flex w-full items-center justify-between text-[12px] font-bold text-ink-500 hover:text-ink-700 transition px-1"
            >
              {pick("내 프로필 자세히 편집", "完整编辑我的资料")}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        <SettingsSection
          icon="🌐"
          title={pick("앱 설정", "应用设置")}
          subtitle={pick("언어와 알림", "语言和通知")}
        >
          <div className="rounded-2xl bg-cream-50/70 border border-cream-200/60 p-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white text-base shadow-sm">
                🌐
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-700">
                  {t("settings.language")}
                </p>
                <p className="text-[11px] text-ink-400">
                  {t("settings.ko")} / {t("settings.zh")} / {t("settings.bi")}
                </p>
              </div>
            </div>
            <LanguageToggle />
          </div>
          {!ALLOW_NO_AUTH && <PushNotificationCard />}
        </SettingsSection>

        {couple && (
          <SettingsSection
            icon="🏠"
            title={pick("우리 설정", "我们的设置")}
            subtitle={pick("집 주소와 초대 코드", "家庭住址和邀请码")}
          >
            <SettingsRow
              label={t("settings.invite")}
              value={couple.invite_code}
              icon={<span className="text-base">🔗</span>}
              valueClassName="font-number tracking-[0.18em] text-peach-500 text-lg"
            />
            <div className="rounded-2xl bg-cream-50/70 border border-cream-200/60 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-full bg-white text-rose-500 shadow-sm">
                  <Home className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-700">
                    {pick("우리집 주소", "家庭住址")}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {pick(
                      "집밥 모드 + 지도의 집 마커에 사용돼요",
                      "用于在家做饭和地图的家标记"
                    )}
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
                placeholder={pick("주소 (예: 서울시 마포구...)", "地址")}
              />

              <button
                type="button"
                onClick={() => void onSave()}
                disabled={setHome.isPending}
                className="btn-primary w-full"
              >
                {savedFlash
                  ? pick("저장됐어요!", "已保存")
                  : setHome.isPending
                    ? pick("저장 중…", "保存中…")
                    : pick("집 주소 저장", "保存家庭住址")}
              </button>
            </div>
          </SettingsSection>
        )}

        <SettingsSection
          icon="🔐"
          title={pick("계정", "账号")}
          subtitle={user?.email ?? "-"}
        >
          <SettingsRow
            label={t("settings.account")}
            value={user?.email ?? "-"}
            icon={<span className="text-base">✉️</span>}
          />

          {!ALLOW_NO_AUTH && (
            <div className="rounded-2xl bg-cream-50/70 border border-cream-200/60 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-full bg-white text-peach-500 shadow-sm">
                  <KeyRound className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-700">
                    {pick("비밀번호 변경", "修改密码")}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {pick(
                      `지금 로그인된 계정(${user?.email})의 비밀번호를 바꿔요`,
                      `修改当前登录账号（${user?.email}）的密码`
                    )}
                  </p>
                </div>
              </div>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  className="input-base pr-11"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder={pick("새 비밀번호 (6자 이상)", "新密码")}
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
                placeholder={pick("비밀번호 확인", "确认密码")}
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
                {pwdBusy
                  ? pick("변경 중…", "修改中…")
                  : pick("비밀번호 변경", "修改密码")}
              </button>
            </div>
          )}

          <button
            onClick={() => void signOut()}
            className="w-full rounded-2xl border border-rose-200 bg-rose-50 p-3 flex items-center justify-center gap-2 text-rose-500 font-bold active:scale-[0.98] transition-transform"
          >
            <LogOut className="w-5 h-5" />
            {pick("로그아웃", "退出登录")}
          </button>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
        aria-expanded={open}
      >
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-cream-100 text-base">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-ink-900">
            {title}
          </span>
          <span className="block text-[11px] font-medium text-ink-400 truncate">
            {subtitle}
          </span>
        </span>
        <ChevronRight
          className={`w-4 h-4 flex-shrink-0 text-ink-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </section>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  valueClassName = "text-ink-900",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream-50/70 border border-cream-200/60 px-3 py-2.5">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white shadow-sm">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
          {label}
        </p>
        <p className={`truncate font-bold ${valueClassName}`}>{value}</p>
      </div>
    </div>
  );
}

function ProfileFacts({
  profile,
  partnerAlias,
  partnerAliasLabel,
  emptyText,
  pick,
}: {
  profile: Profile | null;
  partnerAlias: string | null;
  partnerAliasLabel: string;
  emptyText: string;
  pick: (ko: string, zh: string) => string;
}) {
  const bio = profile?.bio?.trim() || null;
  const hates = profile?.hate_ingredients?.filter(Boolean) ?? [];
  const alias = partnerAlias?.trim() || null;
  const hasContent = !!bio || hates.length > 0 || !!alias;
  return (
    <div className="mt-3 w-full min-w-0 border-t border-white/80 pt-3">
      {!hasContent ? (
        <p className="text-[11px] text-center text-ink-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {bio && (
            <p className="text-[12px] text-ink-700 leading-snug break-words">
              <span className="font-bold text-ink-400 mr-1">
                {pick("한줄", "简介")}
              </span>
              {bio}
            </p>
          )}
          {alias && (
            <p className="text-[12px] text-ink-700 leading-snug break-words">
              <span className="font-bold text-ink-400 mr-1">
                {partnerAliasLabel}
              </span>
              {alias}
            </p>
          )}
          {hates.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-ink-400 mb-1">
                🚫 {pick("못 먹는 거", "不能吃")}
              </p>
              <div className="flex flex-wrap gap-1">
                {hates.map((h) => (
                  <span
                    key={h}
                    className="px-2 py-0.5 rounded-full bg-white text-rose-500 text-[11px] font-bold border border-rose-100"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopThreeList({
  items,
  sampleSize,
  pick,
}: {
  items: {
    foodId: string;
    placeId: string;
    placeName: string;
    foodName: string;
    mine: number;
  }[];
  sampleSize: number;
  pick: (ko: string, zh: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-peach-50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-black text-amber-700">
          🏆 {pick("내 Top 3", "我的TOP3")}
        </p>
        {sampleSize > 0 && (
          <span className="text-[10px] font-number font-bold text-ink-400">
            {sampleSize}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-ink-400">
          {pick("아직 별점 준 메뉴가 없어요", "还没有打过分的菜")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((r, idx) => (
            <Link
              key={r.foodId}
              to={`/places/${r.placeId}`}
              className="flex items-center gap-2 rounded-xl bg-white/80 border border-white px-2.5 py-2 active:scale-[0.99] transition-transform"
            >
              <span className="text-[13px] font-number font-black text-amber-500 flex-shrink-0 w-4 text-center">
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold text-ink-900 truncate">
                  {r.foodName}
                </span>
                <span className="block text-[10px] text-ink-400 truncate">
                  @ {r.placeName}
                </span>
              </span>
              <span className="text-[12px] font-number font-bold text-peach-500 flex-shrink-0">
                {r.mine.toFixed(1)}
              </span>
            </Link>
          ))}
        </div>
      )}
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
  // null/undefined hides the caption row entirely — we suppress it
  // when the user already has a nickname so the avatar doesn't show
  // the same name twice (displayName ↑ + badge ↓).
  badge: string | null;
  overrideNickname?: string | null;
}) {
  const displayName =
    overrideNickname?.trim() || profile?.nickname?.trim() || fallbackLabel;
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
      <p className="text-[12px] font-bold text-ink-900 mt-2 truncate w-full px-1 text-center">
        {displayName}
      </p>
      {badge && (
        <p className="text-[10px] font-bold text-ink-400">{badge}</p>
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

// Push notification opt-in card. Sits above the password card on the
// settings page. Surfaces the four states the underlying hook can
// return so the user always knows why notifications aren't firing.
function PushNotificationCard() {
  const { i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  const { status, busy, error, enable, disable } = usePushSubscription();

  const isOn = status === "granted-subscribed";
  const canEnable =
    status === "default" || status === "granted-unsubscribed";
  const showHelpText = status === "denied" || status === "unsupported";

  return (
    <div className="rounded-2xl bg-cream-50/70 border border-cream-200/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`p-2 rounded-full shadow-sm ${isOn ? "bg-peach-100 text-peach-500" : "bg-white text-ink-500"}`}
        >
          {isOn ? (
            <Bell className="w-4 h-4" />
          ) : (
            <BellOff className="w-4 h-4" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink-700">
            {pick("푸시 알림", "推送通知")}
          </p>
          <p className="text-[11px] text-ink-400">
            {isOn
              ? pick("짝꿍이 메모/사진 올리면 즉시 알림이 와요", "宝宝有动静时立即推送")
              : pick("짝꿍 활동을 앱이 닫혀있어도 알 수 있어요", "应用关闭也能收到提醒")}
          </p>
        </div>
      </div>

      {showHelpText && (
        <p className="text-[11px] text-rose-500 bg-rose-50 border border-rose-200 rounded-xl p-3 leading-snug">
          {status === "denied"
            ? pick(
                "브라우저에서 알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.",
                "浏览器已禁止通知，请在浏览器设置中允许。"
              )
            : pick(
                "이 브라우저는 푸시 알림을 지원하지 않아요 (iPhone은 홈 화면에 추가한 PWA에서만 동작).",
                "浏览器不支持推送（iPhone 仅支持已添加到主屏幕的 PWA）。"
              )}
        </p>
      )}

      {error && (
        <p className="text-[11px] text-rose-500 break-words">{error}</p>
      )}

      <button
        type="button"
        onClick={() => void (isOn ? disable() : enable())}
        disabled={busy || (!isOn && !canEnable)}
        className={`w-full ${isOn ? "btn-ghost border border-cream-200" : "btn-primary"} disabled:opacity-50`}
      >
        {busy
          ? pick("처리 중…", "处理中…")
          : isOn
            ? pick("알림 끄기", "关闭通知")
            : pick("알림 켜기", "开启通知")}
      </button>
    </div>
  );
}
