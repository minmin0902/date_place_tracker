import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        setInfo("이메일로 인증 링크를 보냈어요. 확인해 주세요. · 验证链接已发送到邮箱，请查收。");
      }
    } catch (e: unknown) {
      setErr(
        e instanceof Error
          ? e.message
          : "문제가 생겼어요. 다시 시도해 주세요. · 出了点问题，请重试。"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-warm-gradient flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="text-5xl mb-3">🍜</div>
            <h1 className="text-3xl font-display font-black tracking-tight">
              우리의 식탁 · 我们的餐桌
            </h1>
            <p className="text-ink-500 mt-2 font-medium">
              둘이 함께 채우는 맛집 일기 · 咱俩的干饭日记
            </p>
          </div>

          <form onSubmit={submit} className="card p-5 space-y-4">
            <h2 className="text-lg font-bold">
              {mode === "login" ? "로그인 · 登录" : "회원가입 · 注册"}
            </h2>
            <input
              className="input-base"
              type="email"
              placeholder="이메일 · 邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className="input-base"
              type="password"
              placeholder="비밀번호 · 密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            {err && <p className="text-sm text-rose-500 font-bold">{err}</p>}
            {info && <p className="text-sm text-sage-400 font-bold">{info}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {mode === "login" ? "로그인 · 登录" : "시작하기 · 开启干饭之旅"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm font-semibold text-ink-500"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setErr(null);
                setInfo(null);
              }}
            >
              {mode === "login"
                ? "계정이 없으신가요? · 还没有账号？"
                : "이미 계정이 있으신가요? · 已经有账号了？"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
