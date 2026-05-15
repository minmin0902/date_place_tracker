type AppLanguage = "ko" | "zh" | "bi";
type I18nLike = {
  language: string;
  on: (event: "languageChanged", callback: () => void) => void;
};

const TEXT_ATTRS = ["placeholder", "title", "aria-label"];
const bilingualText = new WeakMap();
const bilingualAttrs = new WeakMap();

function hasHangul(value: string) {
  return /[가-힣]/.test(value);
}

function hasHan(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function hasBilingualCue(value: string) {
  return value.includes("·") && hasHangul(value) && hasHan(value);
}

function scorePart(part: string, lang: AppLanguage) {
  const hangul = (part.match(/[가-힣]/g) ?? []).length;
  const han = (part.match(/[\u3400-\u9fff]/g) ?? []).length;
  if (lang === "ko") return hangul * 4 - han * 3;
  if (lang === "zh") return han * 4 - hangul * 3;
  return 0;
}

function normalizeSpacing(value: string) {
  return value.replace(/\s{2,}/g, " ").trim();
}

function localizeUnits(value: string, lang: AppLanguage) {
  if (lang === "bi") return value;
  return value
    .replace(
      /(\d+(?:\.\d+)?)\s*(개|곳|점|명|분|시간|일|초)\s*·\s*(道|家|分|人|分钟|小时|天|秒)/g,
      lang === "ko" ? "$1$2" : "$1$3"
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*(道|家|分|人|分钟|小时|天|秒)\s*·\s*(개|곳|점|명|분|시간|일|초)/g,
      lang === "ko" ? "$1$3" : "$1$2"
    );
}

export function localizeBilingualText(value: string, language: string) {
  const lang = language === "ko" || language === "zh" ? language : "bi";
  if (lang === "bi" || !hasBilingualCue(value)) return value;

  const unitCleaned = localizeUnits(value, lang);
  const parts = unitCleaned
    .split(/\s*·\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return normalizeSpacing(unitCleaned);

  const best = parts.reduce((winner, part) =>
    scorePart(part, lang) > scorePart(winner, lang) ? part : winner
  );
  return normalizeSpacing(scorePart(best, lang) > 0 ? best : unitCleaned);
}

function isStoredProjection(current: string, original: string) {
  return (
    current === original ||
    current === localizeBilingualText(original, "ko") ||
    current === localizeBilingualText(original, "zh")
  );
}

function processTextNode(node: Text, lang: AppLanguage) {
  const current = node.nodeValue ?? "";
  const stored = bilingualText.get(node);
  let original: string | undefined;
  if (current.includes("·")) {
    original = current;
  } else if (stored && isStoredProjection(current, stored)) {
    original = stored;
  }

  if (!original || !hasBilingualCue(original)) {
    if (stored) bilingualText.delete(node);
    return;
  }
  bilingualText.set(node, original);

  const next = localizeBilingualText(original, lang);
  if (current !== next) node.nodeValue = next;
}

function processAttrs(element: Element, lang: AppLanguage) {
  for (const attr of TEXT_ATTRS) {
    const current = element.getAttribute(attr);
    const attrMap = bilingualAttrs.get(element);
    const stored = attrMap?.get(attr);
    let original: string | undefined;
    if (current?.includes("·")) {
      original = current;
    } else if (current && stored && isStoredProjection(current, stored)) {
      original = stored;
    }
    if (!original || !hasBilingualCue(original)) {
      if (stored) attrMap?.delete(attr);
      continue;
    }

    let nextAttrMap = attrMap;
    if (!nextAttrMap) {
      nextAttrMap = new Map();
      bilingualAttrs.set(element, nextAttrMap);
    }
    nextAttrMap.set(attr, original);

    const next = localizeBilingualText(original, lang);
    if (current !== next) element.setAttribute(attr, next);
  }
}

function walk(root: Node, lang: AppLanguage) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root as Text, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
    return;
  }

  if (root instanceof Element) processAttrs(root, lang);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) processTextNode(node as Text, lang);
    else if (node instanceof Element) processAttrs(node, lang);
    node = walker.nextNode();
  }
}

function localizeDialogMessage(message: unknown, language: string) {
  if (typeof message === "string") return localizeBilingualText(message, language);
  return String(message ?? "");
}

function patchNativeDialogs(i18n: I18nLike) {
  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  window.alert = (message?: unknown) => {
    nativeAlert(localizeDialogMessage(message, i18n.language));
  };
  window.confirm = (message?: unknown) => {
    return nativeConfirm(localizeDialogMessage(message, i18n.language));
  };
}

export function installBilingualTextFilter(i18n: I18nLike) {
  if (typeof window === "undefined") return;
  patchNativeDialogs(i18n);

  let scheduled = false;
  const run = () => {
    scheduled = false;
    const lang: AppLanguage =
      i18n.language === "ko" || i18n.language === "zh" ? i18n.language : "bi";
    walk(document.body, lang);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [...TEXT_ATTRS],
    childList: true,
    characterData: true,
    subtree: true,
  });

  i18n.on("languageChanged", schedule);
  schedule();
}
