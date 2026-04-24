import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import bi from "./bi";

// Single bilingual resource — every label is rendered as "한글 · 中文" at once.
void i18n.use(initReactI18next).init({
  resources: { bi: { translation: bi } },
  lng: "bi",
  fallbackLng: "bi",
  supportedLngs: ["bi"],
  interpolation: { escapeValue: false },
});

document.documentElement.lang = "ko";

export default i18n;
