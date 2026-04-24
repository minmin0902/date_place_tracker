import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: couple } = useCouple();

  return (
    <div>
      <PageHeader title={t("settings.title")} />
      <div className="px-5 space-y-4">
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
