import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import bi from "./bi";
import ko from "./ko";
import zh from "./zh";

export type AppLanguage = "ko" | "zh" | "bi";

const LANGUAGE_STORAGE_KEY = "ourtable:language:v1";
const LANGUAGE_DEFAULT_MIGRATION_KEY = "ourtable:language-default:v2";
const SUPPORTED_LANGUAGES: AppLanguage[] = ["ko", "zh", "bi"];

function isAppLanguage(value: string | null): value is AppLanguage {
  return !!value && SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

function initialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "zh";
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const migrated = window.localStorage.getItem(LANGUAGE_DEFAULT_MIGRATION_KEY);
    if (!migrated) {
      window.localStorage.setItem(LANGUAGE_DEFAULT_MIGRATION_KEY, "1");
      return "zh";
    }
    if (isAppLanguage(saved)) return saved;
  } catch {
    // localStorage may be unavailable in private contexts.
  }
  return "zh";
}

function applyDocumentLanguage(language: string) {
  const appLanguage: AppLanguage = isAppLanguage(language) ? language : "zh";
  document.documentElement.lang = appLanguage === "zh" ? "zh-CN" : "ko";
  document.documentElement.dataset.language = appLanguage;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, appLanguage);
  } catch {
    // Non-critical. The app falls back to Chinese mode next boot.
  }
}

// ko / zh are single-language resources. bi is the old merged resource
// that renders "한글 · 中文" together for users who still want both.
void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    zh: { translation: zh },
    bi: { translation: bi },
  },
  lng: initialLanguage(),
  fallbackLng: "zh",
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

applyDocumentLanguage(i18n.language);
i18n.on("languageChanged", applyDocumentLanguage);

export default i18n;
