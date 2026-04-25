import { useEffect, useState } from "react";
import { Home, LogOut } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCouple, useSetCoupleHome } from "@/hooks/useCouple";
import { LocationPicker } from "@/components/LocationPicker";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();
  const setHome = useSetCoupleHome();

  // Local form state for the home address card. Hydrate once when the
  // couple loads, then let the user edit freely until they hit save.
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

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
