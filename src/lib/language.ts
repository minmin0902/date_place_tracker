export type UiLanguage = "ko" | "zh" | "bi";

export function uiLanguageOf(language: string | null | undefined): UiLanguage {
  if (language === "ko" || language === "zh") return language;
  return "bi";
}

export function pickLanguage(
  language: string | null | undefined,
  ko: string,
  zh: string
) {
  const lang = uiLanguageOf(language);
  if (lang === "ko") return ko;
  if (lang === "zh") return zh;
  return `${ko} · ${zh}`;
}

export function countLanguage(
  language: string | null | undefined,
  count: number,
  koUnit: string,
  zhUnit: string
) {
  const lang = uiLanguageOf(language);
  if (lang === "ko") return `${count}${koUnit}`;
  if (lang === "zh") return `${count}${zhUnit}`;
  return `${count}${koUnit}·${zhUnit}`;
}
