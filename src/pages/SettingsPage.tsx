import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();

  return (
    <div>
      <PageHeader title={t("settings.title")} />
      <div className="px-5 space-y-4">
        <div className="card p-4 space-y-3">
          <p className="text-sm font-medium">{t("settings.language")}</p>
          <div className="flex gap-2">
            {(["ko", "zh"] as const).map((lng) => {
              const active = i18n.resolvedLanguage === lng;
              return (
                <button
                  key={lng}
                  onClick={() => void i18n.changeLanguage(lng)}
                  className={cn(
                    "flex-1 py-3 rounded-xl border transition",
                    active
                      ? "bg-peach-200 border-peach-300 text-ink-900 font-medium"
                      : "bg-white border-cream-200 text-ink-500"
                  )}
                >
                  {t(`settings.${lng}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-sm text-ink-500">{t("auth.email")}</p>
          <p className="font-medium">{user?.email}</p>
        </div>

        {couple && (
          <div className="card p-4">
            <p className="text-sm text-ink-500">{t("settings.invite")}</p>
            <p className="font-display font-bold tracking-widest text-peach-500 text-xl">
              {couple.invite_code}
            </p>
          </div>
        )}

        <button
          onClick={() => void signOut()}
          className="w-full card p-4 flex items-center justify-center gap-2 text-rose-500 font-medium"
        >
          <LogOut className="w-4 h-4" />
          {t("auth.logout")}
        </button>
      </div>
    </div>
  );
}
