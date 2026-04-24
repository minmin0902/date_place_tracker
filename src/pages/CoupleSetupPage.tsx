import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Heart } from "lucide-react";
import { useCouple, useCreateCouple, useJoinCouple } from "@/hooks/useCouple";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";

export default function CoupleSetupPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const createCouple = useCreateCouple();
  const joinCouple = useJoinCouple();

  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasPartner = couple?.user2_id && couple.user1_id !== couple.user2_id;
  const isCreator = couple?.user1_id === user?.id;

  async function onJoin() {
    setErr(null);
    try {
      await joinCouple.mutateAsync(code);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("errors.generic"));
    }
  }

  async function onCopy() {
    if (!couple?.invite_code) return;
    await navigator.clipboard.writeText(couple.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-full bg-warm-gradient">
      <div className="max-w-md mx-auto pt-4">
        <PageHeader title={t("couple.setupTitle")} subtitle={t("couple.setupDesc")} />

        <div className="px-5 space-y-4">
          {/* Already created a couple */}
          {couple && isCreator && !hasPartner && (
            <div className="card p-6 text-center">
              <Heart className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <p className="text-sm text-ink-500 mb-2">{t("couple.yourCode")}</p>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-4xl font-number font-bold tracking-[0.2em] text-peach-500">
                  {couple.invite_code}
                </span>
                <button
                  onClick={() => void onCopy()}
                  className="btn-ghost !p-2"
                  aria-label="copy"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-sage-400" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
              <p className="text-sm text-ink-500">{t("couple.shareHint")}</p>
              <p className="text-sm text-ink-500 mt-3">
                {t("couple.partnerPending")}
              </p>
            </div>
          )}

          {/* No couple yet */}
          {!couple && (
            <>
              <button
                className="btn-primary w-full"
                onClick={() => createCouple.mutate()}
                disabled={createCouple.isPending}
              >
                <Heart className="w-5 h-5" />
                {t("couple.createCode")}
              </button>

              <div className="card p-5 space-y-3">
                <p className="font-medium">{t("couple.joinWithCode")}</p>
                <input
                  className="input-base uppercase tracking-widest text-center text-lg"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t("couple.codePlaceholder")}
                  maxLength={8}
                />
                {err && <p className="text-sm text-rose-500">{err}</p>}
                <button
                  className="btn-primary w-full"
                  onClick={() => void onJoin()}
                  disabled={!code || joinCouple.isPending}
                >
                  {t("couple.join")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
