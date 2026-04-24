import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function LoginPage() {
  const { t } = useTranslation();
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
        setInfo(t("auth.checkEmail"));
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-warm-gradient flex flex-col">
      <div className="flex justify-end p-4">
        <LanguageToggle />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="text-5xl mb-3">🍜</div>
            <h1 className="text-3xl font-display font-bold">
              {t("app.title")}
            </h1>
            <p className="text-ink-500 mt-2">{t("app.tagline")}</p>
          </div>

          <form onSubmit={submit} className="card p-5 space-y-3">
            <h2 className="text-lg font-semibold">
              {mode === "login" ? t("auth.loginTitle") : t("auth.signupTitle")}
            </h2>
            <input
              className="input-base"
              type="email"
              placeholder={t("auth.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className="input-base"
              type="password"
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
            {err && <p className="text-sm text-rose-500">{err}</p>}
            {info && <p className="text-sm text-sage-400">{info}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {mode === "login" ? t("auth.login") : t("auth.signup")}
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setErr(null);
                setInfo(null);
              }}
            >
              {mode === "login" ? t("auth.toSignup") : t("auth.toLogin")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
