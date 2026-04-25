import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup" | "forgot" | "recovery";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Detect when the user clicks the password-recovery link from their
  // email — Supabase fires PASSWORD_RECOVERY on the in-flight session
  // and we surface a "set new password" form.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setErr(null);
        setInfo(
          "새 비밀번호를 입력해주세요 · 请输入新密码"
        );
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else if (mode === "signup") {
        await signUp(email, password);
        setInfo(
          "이메일로 인증 링크를 보냈어요. 확인해 주세요. · 验证链接已发送到邮箱，请查收。"
        );
      } else if (mode === "forgot") {
        // Send a password recovery email. The redirectTo brings the
        // user back to this same origin where the auth listener above
        // catches PASSWORD_RECOVERY and switches us to the new-password
        // form. window.location.origin keeps it correct on both
        // localhost and the deployed domain.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setInfo(
          "비밀번호 재설정 메일을 보냈어요. 메일함을 확인해주세요! · 重置密码邮件已发送，请查收邮箱！"
        );
      } else if (mode === "recovery") {
        if (password.length < 6) {
          throw new Error(
            "비밀번호는 6자 이상이어야 해요 · 密码至少需要 6 个字符"
          );
        }
        if (password !== passwordConfirm) {
          throw new Error(
            "두 비밀번호가 달라요 · 两次输入的密码不一致"
          );
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setInfo(
          "비밀번호가 변경됐어요! 자동으로 로그인됩니다. · 密码已修改，正在自动登录…"
        );
        // Recovery session is already authenticated, so the Gate will
        // pick the user up and redirect to home; no extra signIn call.
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

  // Small helper to switch modes and clear transient state at once.
  function switchMode(next: Mode) {
    setMode(next);
    setErr(null);
    setInfo(null);
    setPassword("");
    setPasswordConfirm("");
  }

  const heading: Record<Mode, string> = {
    login: "로그인 · 登录",
    signup: "회원가입 · 注册",
    forgot: "비밀번호 찾기 · 找回密码",
    recovery: "새 비밀번호 설정 · 设置新密码",
  };

  return (
    <div className="min-h-full bg-warm-gradient flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="text-5xl mb-3">🍜</div>
            <h1 className="text-3xl font-sans font-black tracking-tight">
              우리의 식탁 · 我们的餐桌
            </h1>
            <p className="text-ink-500 mt-2 font-medium">
              둘이 함께 채우는 맛집 일기 · 咱俩的干饭日记
            </p>
          </div>

          <form onSubmit={submit} className="card p-5 space-y-4">
            <h2 className="text-lg font-bold">{heading[mode]}</h2>

            {/* Email field — hidden in recovery (the session already
                identifies the user; only a new password is needed). */}
            {mode !== "recovery" && (
              <input
                className="input-base"
                type="email"
                placeholder="이메일 · 邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            )}

            {/* Password — needed for login / signup / recovery, not for
                the "forgot password" form (that one only takes email). */}
            {mode !== "forgot" && (
              <input
                className="input-base"
                type="password"
                placeholder={
                  mode === "recovery"
                    ? "새 비밀번호 (6자 이상) · 新密码"
                    : "비밀번호 · 密码"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            )}

            {/* Confirm — only on recovery so the user doesn't lock
                themselves out a second time with a typo. */}
            {mode === "recovery" && (
              <input
                className="input-base"
                type="password"
                placeholder="비밀번호 확인 · 确认密码"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            )}

            {err && <p className="text-sm text-rose-500 font-bold">{err}</p>}
            {info && <p className="text-sm text-sage-400 font-bold">{info}</p>}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy
                ? "처리 중… · 处理中…"
                : mode === "login"
                  ? "로그인 · 登录"
                  : mode === "signup"
                    ? "시작하기 · 开启干饭之旅"
                    : mode === "forgot"
                      ? "재설정 메일 보내기 · 发送重置邮件"
                      : "비밀번호 변경 · 修改密码"}
            </button>

            {/* Mode switchers — three lightweight links so users can
                hop between login / signup / forgot without leaving the
                form. The recovery mode has no switcher because the
                session-bound flow only makes sense in one direction. */}
            {mode === "login" && (
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  type="button"
                  className="btn-ghost w-full text-sm font-semibold text-ink-500"
                  onClick={() => switchMode("forgot")}
                >
                  비밀번호를 잊으셨나요? · 忘记密码？
                </button>
                <button
                  type="button"
                  className="btn-ghost w-full text-sm font-semibold text-ink-500"
                  onClick={() => switchMode("signup")}
                >
                  계정이 없으신가요? · 还没有账号？
                </button>
              </div>
            )}

            {mode === "signup" && (
              <button
                type="button"
                className="btn-ghost w-full text-sm font-semibold text-ink-500"
                onClick={() => switchMode("login")}
              >
                이미 계정이 있으신가요? · 已经有账号了？
              </button>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                className="btn-ghost w-full text-sm font-semibold text-ink-500"
                onClick={() => switchMode("login")}
              >
                ← 로그인으로 돌아가기 · 返回登录
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
