import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import bi from "./bi";
import ko from "./ko";
import zh from "./zh";

export type AppLanguage = "ko" | "zh" | "bi";

const LANGUAGE_STORAGE_KEY = "ourtable:language:v1";
const SUPPORTED_LANGUAGES: AppLanguage[] = ["ko", "zh", "bi"];

function isAppLanguage(value: string | null): value is AppLanguage {
  return !!value && SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

function initialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "bi";
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isAppLanguage(saved)) return saved;
  } catch {
    // localStorage may be unavailable in private contexts.
  }
  return "bi";
}

function applyDocumentLanguage(language: string) {
  const appLanguage: AppLanguage = isAppLanguage(language) ? language : "bi";
  document.documentElement.lang = appLanguage === "zh" ? "zh-CN" : "ko";
  document.documentElement.dataset.language = appLanguage;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, appLanguage);
  } catch {
    // Non-critical. The app falls back to bilingual mode next boot.
  }
}

// ko / zh are the original single-language resources. bi is the old
// merged resource that renders "한글 · 中文" together, kept as the
// default so existing users see the same UI until they switch modes.
void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    zh: { translation: zh },
    bi: { translation: bi },
  },
  lng: initialLanguage(),
  fallbackLng: "bi",
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

applyDocumentLanguage(i18n.language);
i18n.on("languageChanged", applyDocumentLanguage);

export default i18n;
