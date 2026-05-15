import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n";

const OPTIONS: AppLanguage[] = ["ko", "zh", "bi"];

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = OPTIONS.includes(i18n.language as AppLanguage)
    ? (i18n.language as AppLanguage)
    : "bi";

  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-cream-200 bg-cream-50 p-1">
      {OPTIONS.map((lang) => {
        const active = current === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => void i18n.changeLanguage(lang)}
            className={`smooth-touch rounded-xl px-2 py-2 text-[12px] font-bold transition ${
              active
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:bg-white/70"
            }`}
            aria-pressed={active}
          >
            {t(`settings.${lang}`)}
          </button>
        );
      })}
    </div>
  );
}
