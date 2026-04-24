import ko from "./ko";
import zh from "./zh";

type Tree = { [k: string]: string | Tree };

// Recursively combines the two locale trees. Strings get joined as
// "한글 · 中文" so the UI shows both languages at once. Identical strings
// (e.g. invite codes) are emitted only once to avoid "XYZ · XYZ".
function merge(a: unknown, b: unknown): unknown {
  if (typeof a === "string" && typeof b === "string") {
    return a === b ? a : `${a} · ${b}`;
  }
  if (a && typeof a === "object") {
    const out: Tree = {};
    const keys = new Set([
      ...Object.keys(a as object),
      ...Object.keys((b as object) ?? {}),
    ]);
    for (const k of keys) {
      const av = (a as Record<string, unknown>)[k];
      const bv = (b as Record<string, unknown>)[k];
      out[k] = merge(av ?? bv, bv ?? av) as string | Tree;
    }
    return out;
  }
  return a ?? b;
}

export default merge(ko, zh) as Tree;
