import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? "ko";

  function toggle() {
    void i18n.changeLanguage(current === "ko" ? "zh" : "ko");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost !px-3 gap-1.5"
      aria-label="toggle language"
    >
      <Languages className="w-4 h-4" />
      <span className={cn("text-sm", current === "ko" ? "font-bold" : "")}>
        한
      </span>
      <span className="text-ink-300">·</span>
      <span className={cn("text-sm", current === "zh" ? "font-bold" : "")}>
        中
      </span>
    </button>
  );
}
