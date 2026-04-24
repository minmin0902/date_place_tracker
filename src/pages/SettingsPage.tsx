import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();

  return (
    <div>
      <PageHeader title="설정 · 设置" />
      <div className="px-5 space-y-4">
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
